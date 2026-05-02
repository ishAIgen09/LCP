import csv
import io
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from uuid import UUID

# Windows' default console encoding is cp1252, which chokes on emoji / any
# non-Latin-1 character in `print()`. Reconfigure stdout+stderr to UTF-8 at
# import time so dev-log prints (🚨 OTP banners, etc.) don't raise
# UnicodeEncodeError and crash the request handler. No-op on macOS/Linux.
for _stream in (sys.stdout, sys.stderr):
    reconfigure = getattr(_stream, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            # Non-reconfigurable stream (e.g. redirected to a non-text sink).
            pass

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    get_active_cafe,
    get_admin_session,
    get_super_admin_session,
)
from app.email_sender import send_brand_invite_email
from app.auth_routes import router as auth_router
from app.b2b_routes import router as b2b_router
import stripe

from app.billing import router as billing_router, sync_subscription_quantity
from app.geocoding import geocode_address
from app.consumer_auth import (
    consumer_router as consumer_api_router,
    router as consumer_auth_router,
)
from app.database import get_session, settings
from app.models import (
    Brand,
    Cafe,
    GlobalLedger,
    GlobalLedgerAction,
    LedgerEventType,
    NetworkLockEvent,
    Offer,
    SchemeType,
    StampLedger,
    SubscriptionStatus,
    User,
)
from app.schemas import (
    AdminMeResponse,
    AdminProfile,
    AdminSession,
    BalanceResponse,
    BrandCreate,
    BrandInvoice,
    BrandInvoiceLine,
    BrandInvoicesResponse,
    BrandProfile,
    BrandResponse,
    BrandUpdate,
    CafeAmenitiesUpdate,
    CafeCreate,
    CafeResponse,
    CafeScans,
    CafeUpdate,
    CustomerStatusResponse,
    AdjustStampsRequest,
    AdminBillingResponse,
    AdminBillingRow,
    AdminCreateBrandRequest,
    AdminCreateCafeRequest,
    AdminCafeSecurityResponse,
    AdminCafeUpdateRequest,
    AdminCustomerResponse,
    AdminFlaggedActivityResponse,
    AdminOverviewResponse,
    AdminPlatformCafeResponse,
    AdminTransactionResponse,
    AiAgentRequest,
    AiAgentResponse,
    CafeStatsResponse,
    SuspendCustomerRequest,
    UpdateCafeBillingStatusRequest,
    MetricsResponse,
    OfferCreate,
    OfferResponse,
    OfferUpdate,
    RedeemRequest,
    RedeemResponse,
    StampRequest,
    StampResponse,
    UserCreate,
    UserResponse,
)
from app.security import hash_password
from app import tokens
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)

TILL_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
REWARD_THRESHOLD = 10

app = FastAPI(
    title="Local Coffee Perks API",
    version="0.2.0",
    # Disable the 307 redirect FastAPI would otherwise issue when a client
    # hits `/api/admin/cafes/` instead of `/api/admin/cafes`. In theory 307
    # preserves method + body, but real-world proxies / tunnels / browser
    # caches occasionally mangle it — the reported 405 on POST/DELETE fit
    # that pattern. With redirects off, a stray trailing slash is a clean
    # 404, never a method-dropping silent hop.
    redirect_slashes=False,
)

# Route-registry banner on startup — any time uvicorn reloads, this prints the
# full verb+path list for `/api/admin/cafes*`. If the user reports 405 again,
# the uvicorn terminal window immediately shows whether the DELETE / PUT
# route is actually live, or whether uvicorn is serving stale code.
@app.on_event("startup")
async def _log_cafe_routes() -> None:
    print("\n== [startup] /api/admin/cafes routes ==", flush=True)
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", "")
        if methods and "cafes" in path and "consumer" not in path:
            verbs = ",".join(sorted(methods - {"HEAD"}))
            print(f"  {verbs:20s}  {path}", flush=True)
    print(
        f"  redirect_slashes = {app.router.redirect_slashes}    "
        f"CORS allow_methods = *\n",
        flush=True,
    )


@app.on_event("startup")
async def _log_offer_routes() -> None:
    # Mirror of _log_cafe_routes for the Promotions surface. Offers endpoints
    # are registered via @app.get/post/put/delete directly on `app` (no
    # separate APIRouter), so if a verb is missing from this list the cause
    # is a stale uvicorn process — not an un-included router.
    print("== [startup] /api/admin/offers routes ==", flush=True)
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", "")
        if methods and "offers" in path and "consumer" not in path:
            verbs = ",".join(sorted(methods - {"HEAD"}))
            print(f"  {verbs:20s}  {path}", flush=True)
    print("", flush=True)


@app.on_event("startup")
async def _log_billing_routes() -> None:
    # Mounted via APIRouter (app/billing.py) so these live under the billing
    # prefix. If /portal doesn't show up here, the process is stale.
    print("== [startup] /api/billing routes ==", flush=True)
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", "")
        if methods and "billing" in path:
            verbs = ",".join(sorted(methods - {"HEAD"}))
            print(f"  {verbs:20s}  {path}", flush=True)
    print("", flush=True)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=False,
    # Wildcard methods: Starlette's CORSMiddleware treats "*" as "echo the
    # preflight's Access-Control-Request-Method verbatim", which side-steps
    # any bugs where a future verb is added to the routes but forgotten here.
    # Explicit list kept as a comment for discoverability.
    # Prior list: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


def _generate_till_code() -> str:
    return "".join(secrets.choice(TILL_CODE_ALPHABET) for _ in range(6))


def _generate_barcode() -> str:
    return secrets.token_hex(12)


def _slugify(value: str) -> str:
    # lowercase, strip diacritics-free, collapse non-alphanumerics to '-'
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned or "cafe"


async def _unique_cafe_slug(
    session: AsyncSession, base_slug: str, max_attempts: int = 50
) -> str:
    for i in range(1, max_attempts + 1):
        candidate = base_slug if i == 1 else f"{base_slug}-{i}"
        existing = (
            await session.execute(select(Cafe.id).where(Cafe.slug == candidate))
        ).scalar_one_or_none()
        if existing is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Could not allocate a unique slug for this cafe.",
    )


def _scoped_balance_stmt(user_id: UUID, scanning_brand: Brand):
    # Balance is computed per the scanning brand's scheme:
    #   PRIVATE → only stamps earned at this brand's own cafes
    #   GLOBAL  → stamps earned at any cafe whose brand is also GLOBAL
    stmt = (
        select(func.coalesce(func.sum(StampLedger.stamp_delta), 0))
        .join(Cafe, StampLedger.cafe_id == Cafe.id)
        .where(StampLedger.customer_id == user_id)
    )
    if scanning_brand.scheme_type == SchemeType.PRIVATE:
        return stmt.where(Cafe.brand_id == scanning_brand.id)
    return stmt.join(Brand, Cafe.brand_id == Brand.id).where(
        Brand.scheme_type == SchemeType.GLOBAL
    )


async def _lock_user_and_read_scoped_balance(
    session: AsyncSession,
    user_id: UUID | None,
    till_code: str | None,
    scanning_brand: Brand,
) -> tuple[User, int]:
    stmt = select(User).with_for_update()
    if user_id is not None:
        stmt = stmt.where(User.id == user_id)
    else:
        stmt = stmt.where(User.till_code == till_code)

    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    balance = int(
        (
            await session.execute(_scoped_balance_stmt(user.id, scanning_brand))
        ).scalar_one()
    )
    return user, balance


@app.post(
    "/api/admin/brands",
    response_model=BrandResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_brand(
    payload: BrandCreate,
    session: AsyncSession = Depends(get_session),
) -> Brand:
    brand = Brand(
        name=payload.name,
        slug=payload.slug,
        contact_email=payload.contact_email,
        scheme_type=payload.scheme_type,
    )
    session.add(brand)
    await session.commit()
    await session.refresh(brand)
    return brand


@app.post(
    "/api/admin/brands/{brand_id}/activate",
    response_model=BrandResponse,
)
async def activate_brand(
    brand_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> Brand:
    brand = await session.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found"
        )
    brand.subscription_status = SubscriptionStatus.ACTIVE
    await session.commit()
    await session.refresh(brand)
    return brand


@app.get("/api/admin/me", response_model=AdminMeResponse)
async def admin_me(
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> AdminMeResponse:
    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )
    return AdminMeResponse(
        admin=AdminProfile(email=admin.email),
        brand=BrandProfile.model_validate(brand),
    )


@app.patch("/api/admin/brand", response_model=BrandProfile)
async def update_admin_brand(
    payload: BrandUpdate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Brand:
    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    if payload.slug is not None and payload.slug != brand.slug:
        collision = (
            await session.execute(
                select(Brand.id)
                .where(Brand.slug == payload.slug)
                .where(Brand.id != brand.id)
            )
        ).scalar_one_or_none()
        if collision is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Slug '{payload.slug}' is already in use.",
            )
        brand.slug = payload.slug

    if payload.name is not None:
        brand.name = payload.name.strip()
    if payload.contact_email is not None:
        brand.contact_email = payload.contact_email.strip()
    if payload.scheme_type is not None:
        brand.scheme_type = payload.scheme_type

    # KYC fields. Trim whitespace; coerce "" → NULL so the admin can clear
    # a field by emptying its input. `None` means "not included in this
    # patch — leave untouched" (pydantic default for omitted keys).
    for field in (
        "owner_first_name",
        "owner_last_name",
        "owner_phone",
        "company_legal_name",
        "company_address",
        "company_registration_number",
    ):
        incoming = getattr(payload, field)
        if incoming is not None:
            trimmed = incoming.strip()
            setattr(brand, field, trimmed if trimmed else None)

    await session.commit()
    await session.refresh(brand)
    return brand


_METRICS_RANGES = {"7d", "30d", "ytd", "all"}


def _metrics_range_bounds(
    range_key: str, now: datetime
) -> tuple[datetime | None, datetime | None, datetime | None]:
    """Return (window_start, prev_window_start, prev_window_end).

    For a window of known length, the previous comparison window is the
    matched prior period. For "all" there's no lower bound and no
    meaningful prior window.
    """
    if range_key == "7d":
        start = now - timedelta(days=7)
        return start, start - timedelta(days=7), start
    if range_key == "30d":
        start = now - timedelta(days=30)
        return start, start - timedelta(days=30), start
    if range_key == "ytd":
        start = datetime(now.year, 1, 1, tzinfo=now.tzinfo)
        # YTD prev = same fraction of the previous year. Good apples-to-
        # apples for "how are we pacing vs. last year at this point".
        prev_year_same_point = datetime(
            now.year - 1, now.month, now.day, tzinfo=now.tzinfo
        )
        prev_year_start = datetime(now.year - 1, 1, 1, tzinfo=now.tzinfo)
        return start, prev_year_start, prev_year_same_point
    return None, None, None


@app.get("/api/admin/metrics", response_model=MetricsResponse)
async def admin_metrics(
    range: str = Query("30d"),
    cafe_id: str = Query("all"),
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> MetricsResponse:
    if range not in _METRICS_RANGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="range must be one of: 7d, 30d, ytd, all.",
        )

    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    # Row-level security: if a specific cafe_id is requested, it MUST
    # belong to this admin's brand. Anything else → 404 (not 403 — we
    # don't want to leak the existence of another brand's cafe).
    scoped_cafe_id: UUID | None = None
    if cafe_id != "all":
        try:
            scoped_cafe_id = UUID(cafe_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="cafe_id must be 'all' or a valid UUID.",
            )
        owned = (
            await session.execute(
                select(Cafe.id)
                .where(Cafe.id == scoped_cafe_id)
                .where(Cafe.brand_id == admin.brand_id)
            )
        ).scalar_one_or_none()
        if owned is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cafe not found for this brand.",
            )

    now = datetime.now(timezone.utc)
    window_start, prev_start, prev_end = _metrics_range_bounds(range, now)

    # Helper to build a scoped ledger-count query. Applies brand RLS via
    # the Cafe join + either the brand_id filter or the specific cafe_id
    # if one was requested.
    def _scoped_count(
        event: LedgerEventType,
        start: datetime | None,
        end: datetime | None,
    ):
        q = (
            select(func.count())
            .select_from(StampLedger)
            .join(Cafe, StampLedger.cafe_id == Cafe.id)
            .where(Cafe.brand_id == admin.brand_id)
            .where(StampLedger.event_type == event)
        )
        if scoped_cafe_id is not None:
            q = q.where(StampLedger.cafe_id == scoped_cafe_id)
        if start is not None:
            q = q.where(StampLedger.created_at >= start)
        if end is not None:
            q = q.where(StampLedger.created_at < end)
        return q

    total_earned = int(
        (await session.execute(_scoped_count(LedgerEventType.EARN, window_start, now))).scalar_one()
    )
    total_redeemed = int(
        (await session.execute(_scoped_count(LedgerEventType.REDEEM, window_start, now))).scalar_one()
    )
    prev_total_earned: int | None = None
    if prev_start is not None and prev_end is not None:
        prev_total_earned = int(
            (
                await session.execute(
                    _scoped_count(LedgerEventType.EARN, prev_start, prev_end)
                )
            ).scalar_one()
        )

    # Legacy 30d / brand-wide aggregates — unchanged by the filter so the
    # "Top performing branches" widget below the KPI cards has a stable
    # backdrop even when the filter narrows to a single cafe.
    thirty_days_ago = now - timedelta(days=30)
    sixty_days_ago = now - timedelta(days=60)

    per_cafe_rows = (
        await session.execute(
            select(
                StampLedger.cafe_id,
                func.count().label("scans"),
            )
            .join(Cafe, StampLedger.cafe_id == Cafe.id)
            .where(Cafe.brand_id == admin.brand_id)
            .where(StampLedger.event_type == LedgerEventType.EARN)
            .where(StampLedger.created_at >= thirty_days_ago)
            .group_by(StampLedger.cafe_id)
        )
    ).all()
    per_cafe = [CafeScans(cafe_id=r[0], scans_30d=int(r[1])) for r in per_cafe_rows]
    total_scans_30d = sum(r.scans_30d for r in per_cafe)

    total_scans_prev_30d = int(
        (
            await session.execute(
                select(func.count())
                .select_from(StampLedger)
                .join(Cafe, StampLedger.cafe_id == Cafe.id)
                .where(Cafe.brand_id == admin.brand_id)
                .where(StampLedger.event_type == LedgerEventType.EARN)
                .where(StampLedger.created_at >= sixty_days_ago)
                .where(StampLedger.created_at < thirty_days_ago)
            )
        ).scalar_one()
    )

    total_cafes = int(
        (
            await session.execute(
                select(func.count(Cafe.id)).where(Cafe.brand_id == admin.brand_id)
            )
        ).scalar_one()
    )
    active_cafes = total_cafes if brand.subscription_status == SubscriptionStatus.ACTIVE else 0

    return MetricsResponse(
        range=range,
        cafe_id=cafe_id,
        total_earned=total_earned,
        total_redeemed=total_redeemed,
        prev_total_earned=prev_total_earned,
        total_scans_30d=total_scans_30d,
        total_scans_prev_30d=total_scans_prev_30d,
        active_cafes=active_cafes,
        total_cafes=total_cafes,
        per_cafe_30d=per_cafe,
        renews_at=brand.current_period_end,
    )


# SECURITY — intentionally unauthenticated for the MVP admin-dashboard
# scaffold. The super-admin frontend gates on a localStorage flag only;
# there's no JWT-backed platform-admin role yet (see admin-dashboard
# commit 736e651). Do NOT expose this endpoint publicly until that role
# and its token flow land. For now it's fine because the droplet's only
# reachable on :8000 from known origins (CORS_ORIGINS), but anyone who
# knows the URL can hit it. Wrap with Depends(get_super_admin_session)
# the moment that dep exists.
@app.get("/api/admin/overview", response_model=AdminOverviewResponse)
async def admin_overview(
    session: AsyncSession = Depends(get_session),
) -> AdminOverviewResponse:
    # Four independent COUNT(*)s. Sequential awaits are fine here —
    # postgres sessions don't pipeline in SQLAlchemy async, and parallel
    # gather() would just serialise on the same connection anyway.
    total_customers = int(
        (await session.execute(select(func.count()).select_from(User))).scalar_one()
    )
    total_cafes = int(
        (await session.execute(select(func.count()).select_from(Cafe))).scalar_one()
    )
    total_stamps_issued = int(
        (
            await session.execute(
                select(func.count())
                .select_from(StampLedger)
                .where(StampLedger.event_type == LedgerEventType.EARN)
            )
        ).scalar_one()
    )
    total_rewards_redeemed = int(
        (
            await session.execute(
                select(func.count())
                .select_from(StampLedger)
                .where(StampLedger.event_type == LedgerEventType.REDEEM)
            )
        ).scalar_one()
    )
    return AdminOverviewResponse(
        total_customers=total_customers,
        total_cafes=total_cafes,
        total_stamps_issued=total_stamps_issued,
        total_rewards_redeemed=total_rewards_redeemed,
    )


# SECURITY — same unauthenticated posture as /api/admin/overview.
# Platform-scoped (NOT brand-filtered) — deliberately parked under
# /api/admin/platform/ to avoid the existing brand-scoped
# /api/admin/cafes at line ~407 which requires an admin JWT.
# Future super-admin endpoints (customers, transactions, billing)
# should sit under the same /api/admin/platform/* namespace.
_CAFE_JOINED_WINDOWS = {"last_7_days", "last_30_days", "all"}


@app.get("/api/admin/platform/cafes", response_model=list[AdminPlatformCafeResponse])
async def platform_cafes(
    status: str | None = Query(None),
    joined: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[AdminPlatformCafeResponse]:
    # Validate filters up front so a typo gives an actionable 422
    # instead of silently returning the unfiltered list.
    if status is not None:
        try:
            status_enum = SubscriptionStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"status must be one of: {', '.join(s.value for s in SubscriptionStatus)}.",
            )
    else:
        status_enum = None

    if joined is not None and joined not in _CAFE_JOINED_WINDOWS:
        raise HTTPException(
            status_code=422,
            detail="joined must be one of: last_7_days, last_30_days, all.",
        )

    # Single join pass — the super-admin table needs both sides so we
    # fetch them together instead of N+1-ing brand lookups.
    stmt = (
        select(Cafe, Brand)
        .join(Brand, Brand.id == Cafe.brand_id)
        .order_by(Cafe.name.asc())
    )
    if status_enum is not None:
        stmt = stmt.where(Cafe.billing_status == status_enum)
    if joined == "last_7_days":
        stmt = stmt.where(Cafe.created_at >= datetime.now(timezone.utc) - timedelta(days=7))
    elif joined == "last_30_days":
        stmt = stmt.where(Cafe.created_at >= datetime.now(timezone.utc) - timedelta(days=30))
    rows = (await session.execute(stmt)).all()
    return [
        AdminPlatformCafeResponse(
            id=cafe.id,
            name=cafe.name,
            address=cafe.address,
            brand_id=brand.id,
            brand_name=brand.name,
            scheme_type=brand.scheme_type,
            subscription_status=brand.subscription_status,
            billing_status=cafe.billing_status,
            created_at=cafe.created_at,
        )
        for cafe, brand in rows
    ]


# Threshold for the "Suspicious Activity" velocity flag on the Customers
# tab. A consumer who pulls more than this many EARN rows in a rolling
# hour gets a Suspicious pill — could be a barista mass-stamping a single
# till, could be a fraud ring bouncing one barcode around. Either way,
# admin-worthy.
SUSPICIOUS_STAMPS_PER_HOUR = 12
SUSPICIOUS_WINDOW = timedelta(hours=1)


async def _suspicious_user_ids(session: AsyncSession) -> set[UUID]:
    """Set of user_ids whose EARN rate in the last rolling hour exceeds
    SUSPICIOUS_STAMPS_PER_HOUR. Cheap single GROUP BY pass over a small
    time-windowed slice of stamp_ledger."""

    cutoff = datetime.now(timezone.utc) - SUSPICIOUS_WINDOW
    rows = (
        await session.execute(
            select(StampLedger.customer_id, func.count())
            .where(StampLedger.event_type == LedgerEventType.EARN)
            .where(StampLedger.created_at >= cutoff)
            .group_by(StampLedger.customer_id)
            .having(func.count() >= SUSPICIOUS_STAMPS_PER_HOUR)
        )
    ).all()
    return {row[0] for row in rows}


# IP / network lock — Super Admin platform endpoints. Mirrors the
# auth_routes login-time enforcement: the cafes table carries
# last_known_ip + network_locked_at; mismatches are appended to
# network_lock_events. These endpoints power the Edit Cafe modal's
# Security & Network section + the Overview tab's Flagged Activities
# widget.
def _flagged_to_response(
    event: NetworkLockEvent, cafe: Cafe, brand: Brand
) -> AdminFlaggedActivityResponse:
    return AdminFlaggedActivityResponse(
        id=event.id,
        cafe_id=cafe.id,
        cafe_name=cafe.name,
        brand_id=brand.id,
        brand_name=brand.name,
        attempted_ip=event.attempted_ip,
        expected_ip=event.expected_ip,
        attempted_at=event.created_at,
    )


@app.get(
    "/api/admin/platform/flagged-activities",
    response_model=list[AdminFlaggedActivityResponse],
)
async def platform_flagged_activities(
    session: AsyncSession = Depends(get_session),
) -> list[AdminFlaggedActivityResponse]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (
        await session.execute(
            select(NetworkLockEvent, Cafe, Brand)
            .join(Cafe, Cafe.id == NetworkLockEvent.cafe_id)
            .join(Brand, Brand.id == Cafe.brand_id)
            .where(NetworkLockEvent.kind == "mismatch")
            .where(NetworkLockEvent.created_at >= cutoff)
            .order_by(NetworkLockEvent.created_at.desc())
            .limit(50)
        )
    ).all()
    return [_flagged_to_response(event, cafe, brand) for event, cafe, brand in rows]


@app.get(
    "/api/admin/platform/cafes/{cafe_id}/security",
    response_model=AdminCafeSecurityResponse,
)
async def platform_cafe_security(
    cafe_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> AdminCafeSecurityResponse:
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        raise HTTPException(status_code=404, detail="Cafe brand missing.")
    events = (
        await session.execute(
            select(NetworkLockEvent)
            .where(NetworkLockEvent.cafe_id == cafe_id)
            .where(NetworkLockEvent.kind == "mismatch")
            .order_by(NetworkLockEvent.created_at.desc())
            .limit(10)
        )
    ).scalars().all()
    return AdminCafeSecurityResponse(
        cafe_id=cafe.id,
        last_known_ip=cafe.last_known_ip,
        network_locked_at=cafe.network_locked_at,
        recent_attempts=[_flagged_to_response(e, cafe, brand) for e in events],
    )


@app.post(
    "/api/admin/platform/cafes/{cafe_id}/reset-network-lock",
    response_model=AdminCafeSecurityResponse,
)
async def platform_cafe_reset_network_lock(
    cafe_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> AdminCafeSecurityResponse:
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        raise HTTPException(status_code=404, detail="Cafe brand missing.")
    # Audit the reset before we wipe the columns so the trail survives.
    if cafe.last_known_ip:
        session.add(
            NetworkLockEvent(
                cafe_id=cafe.id,
                kind="reset",
                attempted_ip="<admin-reset>",
                expected_ip=cafe.last_known_ip,
            )
        )
    cafe.last_known_ip = None
    cafe.network_locked_at = None
    await session.commit()
    await session.refresh(cafe)
    return AdminCafeSecurityResponse(
        cafe_id=cafe.id,
        last_known_ip=cafe.last_known_ip,
        network_locked_at=cafe.network_locked_at,
        recent_attempts=[],
    )


@app.post(
    "/api/admin/platform/cafes/{cafe_id}/update",
    response_model=AdminPlatformCafeResponse,
)
async def platform_cafe_update(
    cafe_id: UUID,
    payload: AdminCafeUpdateRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminPlatformCafeResponse:
    """Super Admin manual override — flips a cafe's billing_status and/or
    its parent brand's scheme_type. Plan changes are brand-wide because
    every cafe under a brand inherits the brand's scheme; that's surfaced
    in the modal copy. Send-only-what-you-want-to-change semantics.
    """

    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        raise HTTPException(status_code=404, detail="Cafe brand missing.")

    if payload.billing_status is not None:
        cafe.billing_status = payload.billing_status
    if payload.scheme_type is not None:
        brand.scheme_type = payload.scheme_type

    await session.commit()
    await session.refresh(cafe)
    await session.refresh(brand)
    return AdminPlatformCafeResponse(
        id=cafe.id,
        name=cafe.name,
        address=cafe.address,
        brand_id=brand.id,
        brand_name=brand.name,
        scheme_type=brand.scheme_type,
        subscription_status=brand.subscription_status,
        billing_status=cafe.billing_status,
        created_at=cafe.created_at,
    )


# SECURITY — unauth'd, same posture as the other /api/admin/platform/*
# routes. Wrap with Depends(get_super_admin_session) once that role ships.
#
# Scannability endpoint for the Super Admin dashboard's Transactions tab:
# full join of stamp_ledger with user, cafe, brand so the frontend renders
# one row per ledger event without a client-side re-join.
#
# `limit` defaults to 500 — enough headroom for the MVP dataset while
# keeping the response predictable. Clamped to [1, 5000]; past that
# we'd want real pagination + cursor-style IDs, which the table UI
# doesn't exercise yet.
@app.get(
    "/api/admin/platform/transactions",
    response_model=list[AdminTransactionResponse],
)
async def platform_transactions(
    limit: int = 500,
    session: AsyncSession = Depends(get_session),
) -> list[AdminTransactionResponse]:
    safe_limit = max(1, min(limit, 5000))
    rows = (
        await session.execute(
            select(StampLedger, User, Cafe, Brand)
            .join(User, User.id == StampLedger.customer_id)
            .join(Cafe, Cafe.id == StampLedger.cafe_id)
            .join(Brand, Brand.id == Cafe.brand_id)
            .order_by(StampLedger.created_at.desc())
            .limit(safe_limit)
        )
    ).all()
    return [
        AdminTransactionResponse(
            id=ledger.id,
            created_at=ledger.created_at,
            # Enum → raw string value so the frontend can switch on a
            # plain "EARN"/"REDEEM" literal without importing the enum.
            event_type=ledger.event_type.value
            if hasattr(ledger.event_type, "value")
            else str(ledger.event_type),
            stamp_delta=ledger.stamp_delta,
            customer_id=user.id,
            # CHAR(6) columns can arrive space-padded depending on driver;
            # strip defensively so the UI never shows "JFOEBE " with a
            # trailing gap in monospace cells.
            customer_till_code=user.till_code.strip(),
            customer_email=user.email,
            cafe_id=cafe.id,
            cafe_name=cafe.name,
            brand_id=brand.id,
            brand_name=brand.name,
            scheme_type=brand.scheme_type,
        )
        for ledger, user, cafe, brand in rows
    ]


# SECURITY — unauth'd, same posture as the other /api/admin/platform/* routes.
#
# Customers tab for the Super Admin dashboard. Returns every user with two
# net-stamp aggregates: `global_stamps` (sum of stamp_delta across all
# ledger rows whose cafe belongs to a scheme_type='global' brand) and
# `total_private_stamps` (same, for 'private' brands). Nets mean a REDEEM
# (-10) cancels out ten EARNs — the numbers read as the user's current
# balance in each bucket, not lifetime throughput.
#
# Implementation: one users pass + one aggregate pass (grouped by customer
# + scheme_type), joined in Python. Two queries keeps the SQL flat and
# avoids a pivot; at MVP volumes (low thousands of users) this is instant.
@app.get(
    "/api/admin/platform/customers",
    response_model=list[AdminCustomerResponse],
)
async def platform_customers(
    session: AsyncSession = Depends(get_session),
) -> list[AdminCustomerResponse]:
    users = (
        await session.execute(select(User).order_by(User.created_at.desc()))
    ).scalars().all()

    aggregate_rows = (
        await session.execute(
            select(
                StampLedger.customer_id,
                Brand.scheme_type,
                func.coalesce(func.sum(StampLedger.stamp_delta), 0).label("net"),
            )
            .join(Cafe, Cafe.id == StampLedger.cafe_id)
            .join(Brand, Brand.id == Cafe.brand_id)
            .group_by(StampLedger.customer_id, Brand.scheme_type)
        )
    ).all()

    # {user_id: {scheme: net_stamps}} — missing buckets default to 0 below.
    net_by_user: dict[UUID, dict[SchemeType, int]] = {}
    for customer_id, scheme_type, net in aggregate_rows:
        net_by_user.setdefault(customer_id, {})[scheme_type] = int(net)

    suspicious = await _suspicious_user_ids(session)

    return [
        AdminCustomerResponse(
            id=user.id,
            # CHAR(6) can arrive space-padded from some drivers; strip so
            # the mono column doesn't show a trailing gap.
            till_code=user.till_code.strip(),
            email=user.email,
            created_at=user.created_at,
            global_stamps=net_by_user.get(user.id, {}).get(SchemeType.GLOBAL, 0),
            total_private_stamps=net_by_user.get(user.id, {}).get(
                SchemeType.PRIVATE, 0
            ),
            is_suspended=user.is_suspended,
            is_suspicious=user.id in suspicious,
        )
        for user in users
    ]


# Shared helper — both the suspend PATCH and the adjust-stamps POST need
# to look up a user by id and return the same AdminCustomerResponse shape
# the list endpoint emits (so the frontend can merge the response straight
# into table state without a refetch).
async def _build_customer_response(
    session: AsyncSession, user: User
) -> AdminCustomerResponse:
    aggregate_rows = (
        await session.execute(
            select(
                Brand.scheme_type,
                func.coalesce(func.sum(StampLedger.stamp_delta), 0).label("net"),
            )
            .join(Cafe, Cafe.id == StampLedger.cafe_id)
            .join(Brand, Brand.id == Cafe.brand_id)
            .where(StampLedger.customer_id == user.id)
            .group_by(Brand.scheme_type)
        )
    ).all()
    nets: dict[SchemeType, int] = {
        scheme: int(net) for scheme, net in aggregate_rows
    }
    suspicious = await _suspicious_user_ids(session)
    return AdminCustomerResponse(
        id=user.id,
        till_code=user.till_code.strip(),
        email=user.email,
        created_at=user.created_at,
        global_stamps=nets.get(SchemeType.GLOBAL, 0),
        total_private_stamps=nets.get(SchemeType.PRIVATE, 0),
        is_suspended=user.is_suspended,
        is_suspicious=user.id in suspicious,
    )


# PATCH — flip (or reassert) a customer's suspended flag. Idempotent: the
# frontend sends the intended new state, which keeps the behaviour sane
# across double-submits and optimistic UI.
#
# SECURITY — unauth'd, same posture as sibling /api/admin/platform/*
# routes. Wrap with a super-admin dependency once that role ships.
@app.patch(
    "/api/admin/platform/customers/{customer_id}/suspend",
    response_model=AdminCustomerResponse,
)
async def set_customer_suspended(
    customer_id: UUID,
    payload: SuspendCustomerRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminCustomerResponse:
    user = await session.get(User, customer_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found."
        )
    user.is_suspended = payload.is_suspended
    await session.commit()
    await session.refresh(user)
    return await _build_customer_response(session, user)


# POST — insert manual EARN/REDEEM ledger rows from the admin dashboard.
#
# The stamp_ledger CHECK forces every row to be exactly +1 (EARN) or -10
# (REDEEM), so positive adjustments fan out into N EARN rows and negative
# adjustments must be an exact multiple of -10 (one REDEEM per -10). The
# fan-out is capped at MAX_ADJUST_STAMPS to prevent accidental mass writes.
#
# SECURITY — unauth'd, same posture as other /api/admin/platform/* routes.
MAX_ADJUST_STAMPS = 100


@app.post(
    "/api/admin/platform/customers/{customer_id}/adjust-stamps",
    response_model=AdminCustomerResponse,
)
async def adjust_customer_stamps(
    customer_id: UUID,
    payload: AdjustStampsRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminCustomerResponse:
    user = await session.get(User, customer_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found."
        )

    if payload.amount == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Amount must be a non-zero integer.",
        )
    if abs(payload.amount) > MAX_ADJUST_STAMPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Adjustments are capped at ±{MAX_ADJUST_STAMPS} stamps.",
        )
    # REDEEM rows must be exactly -10 apiece, so a negative amount has to
    # be a clean multiple of 10 — no partial clawbacks.
    if payload.amount < 0 and payload.amount % 10 != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Negative adjustments must be a multiple of 10 (each REDEEM consumes 10 stamps).",
        )

    # Pick a cafe to attribute the manual row(s) to. For private schemes
    # the admin nominates a brand; for global we take whichever global
    # brand has a cafe (MVP — any cafe works because the aggregate query
    # only cares about scheme_type via the Cafe→Brand join).
    if payload.scheme_type == SchemeType.PRIVATE:
        if payload.brand_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="brand_id is required for private-scheme adjustments.",
            )
        brand = await session.get(Brand, payload.brand_id)
        if brand is None or brand.scheme_type != SchemeType.PRIVATE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Private brand not found.",
            )
        cafe = (
            await session.execute(
                select(Cafe)
                .where(Cafe.brand_id == brand.id)
                .order_by(Cafe.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
    else:
        cafe = (
            await session.execute(
                select(Cafe)
                .join(Brand, Brand.id == Cafe.brand_id)
                .where(Brand.scheme_type == SchemeType.GLOBAL)
                .order_by(Cafe.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if cafe is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No cafe exists for the selected scheme — can't attribute the adjustment.",
        )

    if payload.amount > 0:
        for _ in range(payload.amount):
            session.add(
                StampLedger(
                    customer_id=user.id,
                    cafe_id=cafe.id,
                    event_type=LedgerEventType.EARN,
                    stamp_delta=1,
                    note="manual admin adjustment",
                )
            )
    else:
        for _ in range(abs(payload.amount) // 10):
            session.add(
                StampLedger(
                    customer_id=user.id,
                    cafe_id=cafe.id,
                    event_type=LedgerEventType.REDEEM,
                    stamp_delta=-10,
                    note="manual admin adjustment",
                )
            )
    await session.commit()
    await session.refresh(user)
    return await _build_customer_response(session, user)


# MVP pricing table for the super-admin Billing tab. Per-scheme flat rate,
# stored in pence to avoid float drift when we sum MRR. These numbers are
# mocks — the real Stripe-backed pricing is per-brand quantity (£5/cafe,
# see app/billing.py). Swap this constant for a DB lookup once pricing
# tiers live in a real table.
BILLING_RATE_PENCE_BY_SCHEME: dict[SchemeType, int] = {
    SchemeType.GLOBAL: 4900,   # £49.00 — LCP+ tier
    SchemeType.PRIVATE: 2900,  # £29.00 — Private-scheme tier
}


# SECURITY — unauth'd, same posture as the other /api/admin/platform/*
# routes. Wrap with Depends(get_super_admin_session) when that role ships.
#
# Billing tab feed. One row per cafe (billing happens per-cafe in this MVP
# mock, not per-brand). MRR is summed only across rows whose
# billing_status is 'active' — past_due, trialing, canceled, incomplete
# all contribute 0 to MRR. That keeps the top-line widget honest: it's
# "revenue we expect to bill this month," not "revenue we theoretically
# could bill if everyone paid."
@app.get(
    "/api/admin/platform/billing",
    response_model=AdminBillingResponse,
)
async def platform_billing(
    session: AsyncSession = Depends(get_session),
) -> AdminBillingResponse:
    joined = (
        await session.execute(
            select(Cafe, Brand)
            .join(Brand, Brand.id == Cafe.brand_id)
            .order_by(Cafe.name.asc())
        )
    ).all()
    rows: list[AdminBillingRow] = []
    total_mrr = 0
    active_count = 0
    for cafe, brand in joined:
        rate = BILLING_RATE_PENCE_BY_SCHEME.get(brand.scheme_type, 0)
        rows.append(
            AdminBillingRow(
                cafe_id=cafe.id,
                cafe_name=cafe.name,
                brand_id=brand.id,
                brand_name=brand.name,
                scheme_type=brand.scheme_type,
                billing_status=cafe.billing_status,
                monthly_rate_pence=rate,
            )
        )
        # Cafes in pending_cancellation are still paying through the
        # grace period (cancel-at-period-end policy) — they keep counting
        # toward MRR. Only `canceled` actually drops revenue.
        if cafe.billing_status in (
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PENDING_CANCELLATION,
        ):
            total_mrr += rate
            active_count += 1
    return AdminBillingResponse(
        total_mrr_pence=total_mrr,
        active_subscription_count=active_count,
        rows=rows,
    )


# PATCH — flip a single cafe's billing status. The super-admin dashboard
# uses this to "cancel" a location without touching the brand's real
# Stripe subscription. Accepts any SubscriptionStatus so the UI can also
# downgrade to past_due or reactivate to active without a second route.
#
# Returns the same AdminBillingRow shape the list endpoint emits so the
# frontend can splice it straight into table state.
@app.patch(
    "/api/admin/platform/cafes/{cafe_id}/billing-status",
    response_model=AdminBillingRow,
)
async def set_cafe_billing_status(
    cafe_id: UUID,
    payload: UpdateCafeBillingStatusRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminBillingRow:
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cafe not found."
        )
    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        # Orphaned cafe — treat as not found rather than 500.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cafe's brand not found."
        )
    cafe.billing_status = payload.status
    await session.commit()
    await session.refresh(cafe)
    return AdminBillingRow(
        cafe_id=cafe.id,
        cafe_name=cafe.name,
        brand_id=brand.id,
        brand_name=brand.name,
        scheme_type=brand.scheme_type,
        billing_status=cafe.billing_status,
        monthly_rate_pence=BILLING_RATE_PENCE_BY_SCHEME.get(
            brand.scheme_type, 0
        ),
    )


# Monetary value of a single drink, used by the cafe-stats dossier to
# turn ledger counts into a rough £ ROI figure. Platform-wide mock; the
# real number is per-cafe average ticket which we don't store yet.
ASSUMED_DRINK_PENCE = 350


# Date-range aliases the stats endpoint accepts. Values double as the
# frontend's dropdown option ids.
_STATS_RANGES = {"today", "7d", "30d", "ytd", "1y", "all"}


def _range_start(range_key: str, now: datetime) -> datetime | None:
    if range_key == "today":
        # Start-of-day in UTC. Naturally rolls over at midnight UTC, which
        # is fine for the MVP — when we add per-brand timezones we'll
        # localise this here.
        return datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
    if range_key == "7d":
        return now - timedelta(days=7)
    if range_key == "30d":
        return now - timedelta(days=30)
    if range_key == "ytd":
        return datetime(now.year, 1, 1, tzinfo=now.tzinfo)
    if range_key == "1y":
        return now - timedelta(days=365)
    # "all" → None → no lower bound in the WHERE clause
    return None


# SECURITY — unauth'd, same posture as the other /api/admin/platform/*
# routes. Wrap with a super-admin dependency when that role ships.
#
# Cafe ROI dossier for the super-admin Cafes drill-down. Returns ledger
# totals within the selected date window (7d, 30d, ytd, all), plus a
# mock monetary net ROI = (stamps - rewards) × ASSUMED_DRINK_PENCE.
#
# Using count(*) on stamp_ledger is safe because the CHECK constraint
# fixes every EARN row at +1 and every REDEEM row at -10, so a count by
# event_type IS the signed aggregate we want.
#
# Namespaced under /api/admin/platform/ to avoid clashing with the
# brand-scoped /api/admin/cafes/{id} which requires a brand-admin JWT.
@app.get(
    "/api/admin/platform/cafes/{cafe_id}/stats",
    response_model=CafeStatsResponse,
)
async def platform_cafe_stats(
    cafe_id: UUID,
    range: str = Query("30d"),
    session: AsyncSession = Depends(get_session),
) -> CafeStatsResponse:
    if range not in _STATS_RANGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="range must be one of: today, 7d, 30d, ytd, 1y, all.",
        )
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cafe not found."
        )

    now = datetime.now(timezone.utc)
    start = _range_start(range, now)

    earn_q = (
        select(func.count())
        .select_from(StampLedger)
        .where(StampLedger.cafe_id == cafe_id)
        .where(StampLedger.event_type == LedgerEventType.EARN)
    )
    redeem_q = (
        select(func.count())
        .select_from(StampLedger)
        .where(StampLedger.cafe_id == cafe_id)
        .where(StampLedger.event_type == LedgerEventType.REDEEM)
    )
    if start is not None:
        earn_q = earn_q.where(StampLedger.created_at >= start)
        redeem_q = redeem_q.where(StampLedger.created_at >= start)
    earn_q = earn_q.where(StampLedger.created_at <= now)
    redeem_q = redeem_q.where(StampLedger.created_at <= now)

    stamps_issued = int((await session.execute(earn_q)).scalar_one())
    rewards_redeemed = int((await session.execute(redeem_q)).scalar_one())
    net_roi_pence = (stamps_issued - rewards_redeemed) * ASSUMED_DRINK_PENCE

    return CafeStatsResponse(
        cafe_id=cafe.id,
        cafe_name=cafe.name,
        range=range,
        range_start=start,
        range_end=now,
        stamps_issued=stamps_issued,
        rewards_redeemed=rewards_redeemed,
        net_roi_pence=net_roi_pence,
    )


# ─────────────────────────────────────────────────────────────────────
# Super-Admin Stripe invoice fetch (dispute resolution)
# ─────────────────────────────────────────────────────────────────────
#
# Lists every invoice on file at Stripe for a given brand's customer.
# Used by the admin-dashboard Brand-detail accordion when the operator
# needs to walk a disputing brand owner through their billing history
# (proration line items, mid-cycle adds, refunds, etc.).
#
# We thinly wrap stripe.Invoice.list — no DB-side caching. Each call
# round-trips to Stripe; cardinality is small (a brand has tens of
# invoices, not thousands) so this stays well within Stripe's rate
# limits even for a busy super-admin session.
@app.get(
    "/api/admin/platform/brands/{brand_id}/invoices",
    response_model=BrandInvoicesResponse,
)
async def platform_brand_invoices(
    brand_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> BrandInvoicesResponse:
    brand = await session.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found."
        )

    # Brand never went through Checkout → no Stripe customer to query.
    # Return an empty list (not 404) so the UI can show the empty-state
    # rather than treating it as a hard error.
    if not brand.stripe_customer_id:
        return BrandInvoicesResponse(
            brand_id=brand.id,
            brand_name=brand.name,
            stripe_customer_id=None,
            invoices=[],
        )

    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="STRIPE_SECRET_KEY is not configured.",
        )
    # main.py doesn't import billing's stripe.api_key bootstrap so we
    # set it defensively here. Cheap idempotent assignment.
    stripe.api_key = settings.stripe_secret_key

    try:
        # `expand=["data.lines"]` is implicit — Stripe returns the first
        # page of lines.data inline. For invoices with > 10 lines we'd
        # need to paginate per-invoice; in practice a per-cafe sub never
        # exceeds 4-5 lines (base + prorations) so we leave it for now.
        listing = stripe.Invoice.list(
            customer=brand.stripe_customer_id, limit=50
        )
    except stripe.StripeError as exc:
        logger.error(
            "Stripe Invoice.list failed: brand=%s customer=%s err=%s",
            brand.id,
            brand.stripe_customer_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe could not list invoices: {exc.user_message or str(exc)}",
        )

    def _ts(v: int | None) -> datetime | None:
        if v is None:
            return None
        return datetime.fromtimestamp(int(v), tz=timezone.utc)

    invoices: list[BrandInvoice] = []
    for inv in listing.get("data", []):
        lines_payload: list[BrandInvoiceLine] = []
        for line in inv.get("lines", {}).get("data", []) or []:
            period = line.get("period") or {}
            lines_payload.append(
                BrandInvoiceLine(
                    description=line.get("description"),
                    amount_pence=int(line.get("amount") or 0),
                    currency=str(line.get("currency") or "gbp"),
                    proration=bool(line.get("proration") or False),
                    quantity=line.get("quantity"),
                    period_start=_ts(period.get("start")),
                    period_end=_ts(period.get("end")),
                )
            )
        invoices.append(
            BrandInvoice(
                id=str(inv.get("id")),
                number=inv.get("number"),
                status=str(inv.get("status") or "draft"),
                amount_paid_pence=int(inv.get("amount_paid") or 0),
                amount_due_pence=int(inv.get("amount_due") or 0),
                total_pence=int(inv.get("total") or 0),
                currency=str(inv.get("currency") or "gbp"),
                # `created` is always set on real invoices; tolerate
                # missing for synthetic dev data.
                created_at=_ts(inv.get("created")) or datetime.now(timezone.utc),
                period_start=_ts(inv.get("period_start")),
                period_end=_ts(inv.get("period_end")),
                hosted_invoice_url=inv.get("hosted_invoice_url"),
                invoice_pdf=inv.get("invoice_pdf"),
                lines=lines_payload,
            )
        )

    return BrandInvoicesResponse(
        brand_id=brand.id,
        brand_name=brand.name,
        stripe_customer_id=brand.stripe_customer_id,
        invoices=invoices,
    )


# System prompt for the super-admin AI assistant. Intentionally lean:
# gives the model just enough schema context to answer questions about
# platform revenue, cafe ROI, and user behaviour in LCP's language
# without burning tokens on trivia. If/when we hand the model real SQL
# execution tools, tighten this further — don't expand it.
_AI_AGENT_SYSTEM_PROMPT = """You are the LCP Data Assistant, an in-dashboard analyst for \
Local Coffee Perks (LCP) — a coffee-shop loyalty platform where customers \
earn stamps at cafes and redeem a free drink every 10 stamps.

Platform shape:
- Brands (`brands`): coffee businesses on LCP. Either `scheme_type='global'` \
(LCP+ shared network) or `'private'` (walled-garden). Stripe-backed \
billing at per-brand level.
- Cafes (`cafes`): individual locations belonging to a brand. Each cafe has \
its own `billing_status` (active / pending_cancellation / canceled / etc.) \
which drives MRR attribution in the super-admin Billing tab.
- Users (`users`): end consumers. Identified by a 6-character `till_code`. \
Can be soft-suspended via `is_suspended`.
- Stamp ledger (`stamp_ledger`): append-only row-per-stamp record. \
`event_type='EARN'` gives +1; `event_type='REDEEM'` consumes -10 (one free \
drink). Counts by event_type are the canonical source of truth.
- Global ledger (`global_ledger`): row-per-transaction shadow of the stamp \
ledger for reporting — includes quantities and action labels.

When the admin asks about revenue, refer to MRR conceptually (the Billing \
tab sums active + pending_cancellation cafes at their scheme-based rate). \
When they ask about ROI or retention, reason from ledger event counts, not \
monetary figures, since cafes don't report ticket values.

Answer concisely. One to three short paragraphs max. If a question would \
require running SQL, say so and describe the query you'd run — you don't \
have live DB access yet, just schema context."""


# Lazy-initialised OpenAI client. A module-level singleton would couple
# import order to the env var, which is brittle when the key lands via
# .env and gets reloaded. Build on first use instead.
_openai_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        if not settings.openai_api_key:
            return None
        from openai import AsyncOpenAI

        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


# SECURITY — unauth'd, same posture as the other /api/admin/platform/*
# routes. When the SQL-agent tool-use lands this MUST be wrapped in a
# super-admin dependency before it sees prod.
#
# Super-admin AI chat. One-shot for now (no conversation history) — the
# frontend widget maintains its own transcript; we accept a single
# `message` and return a single `reply`. Modular on purpose: swapping
# OpenAI for Anthropic/Gemini/etc. is a one-file change here.
@app.post(
    "/api/admin/platform/ai-agent",
    response_model=AiAgentResponse,
)
async def platform_ai_agent(payload: AiAgentRequest) -> AiAgentResponse:
    if not payload.message or not payload.message.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="message must be a non-empty string.",
        )

    client = _get_openai_client()
    if client is None:
        # Deliberately returned as a 200 with a reply string rather than a
        # 5xx — the frontend treats this as a normal assistant message and
        # the admin can act on it (add the key, hit retry).
        return AiAgentResponse(
            reply="Please add your OPENAI_API_KEY to the backend .env file to activate the assistant."
        )

    try:
        completion = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": _AI_AGENT_SYSTEM_PROMPT},
                {"role": "user", "content": payload.message.strip()},
            ],
            # Conservative output budget — the system prompt invites
            # short answers, so a high cap is waste.
            max_completion_tokens=600,
            temperature=0.2,
        )
        reply = (completion.choices[0].message.content or "").strip()
        if not reply:
            reply = "(the assistant returned an empty response — try rephrasing.)"
        return AiAgentResponse(reply=reply)
    except Exception as exc:  # noqa: BLE001 — any SDK error maps to one message
        # Surface the provider error to the admin rather than hiding it.
        # The super-admin dashboard is the one consumer; they can read it.
        return AiAgentResponse(
            reply=f"The assistant hit an error: {type(exc).__name__}: {exc}"
        )


# Brand-prefixed store numbers: derive a 2-3 letter prefix from the
# brand name and append a 3-digit sequential counter scoped to that
# prefix (e.g. "Daily Beans" → DB001, DB002; "Monmouth" → MON001).
# Brand owners hand the resulting ID to baristas as the POS handle.
#
# Prefix derivation:
#   - Multi-word brand → first letter of up to 3 leading words (Daily
#     Beans → DB, Local Coffee Perks → LCP).
#   - Single-word brand → first 3 letters (Monmouth → MON).
#   - Non-alphanumerics are stripped; result is uppercased.
#   - If the brand name yields nothing usable (empty / pure symbols),
#     we fall back to "STR" so allocation never blocks.
#
# Counter is per-prefix (MAX of the trailing digits among cafes whose
# store_number matches `^{PREFIX}[0-9]+$`). The cafes.store_number
# UNIQUE constraint stays the safety net — a tight retry loop handles
# write races with concurrent POSTs.
def _brand_store_prefix(brand_name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9 ]+", " ", brand_name or "").strip()
    if not cleaned:
        return "STR"
    words = [w for w in cleaned.split() if w]
    if len(words) >= 2:
        prefix = "".join(w[0] for w in words[:3]).upper()
    else:
        prefix = words[0][:3].upper()
    # Strip any digits the user happened to lead with (e.g. "5th Wave"
    # → "5W") so the prefix is purely alphabetic where possible. We
    # tolerate digits if that's all there is.
    alpha = re.sub(r"[^A-Z]", "", prefix)
    return alpha if len(alpha) >= 2 else (prefix or "STR")


async def _allocate_store_number(
    session: AsyncSession,
    brand: Brand | None = None,
    max_attempts: int = 5,
) -> str:
    prefix = _brand_store_prefix(brand.name) if brand is not None else "STR"
    pattern = f"^{prefix}[0-9]+$"
    for _attempt in range(max_attempts):
        max_row = (
            await session.execute(
                text(
                    "SELECT COALESCE(MAX(NULLIF(regexp_replace("
                    "store_number, :prefix, ''), '')::int), 0) "
                    "FROM cafes "
                    "WHERE store_number ~ :pattern"
                ),
                {"prefix": f"^{prefix}", "pattern": pattern},
            )
        ).scalar_one()
        next_int = int(max_row) + 1
        candidate = f"{prefix}{next_int:03d}"
        # store_number CHECK is `^[A-Z0-9]{3,10}$`; bail loudly if a
        # weird brand name + huge counter ever blew past 10 chars.
        if not re.fullmatch(r"[A-Z0-9]{3,10}", candidate):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Generated store number '{candidate}' exceeds the "
                    "10-character limit — set one explicitly."
                ),
            )
        existing = (
            await session.execute(
                select(Cafe.id).where(Cafe.store_number == candidate)
            )
        ).scalar_one_or_none()
        if existing is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Could not allocate a unique store number — try again.",
    )


# SECURITY — unauth'd, same posture as other /api/admin/platform/*
# routes. Wrap with super-admin dependency before any prod exposure.
#
# Manually provision a brand from the super-admin dashboard. Bypasses
# the usual signup-then-Stripe-Checkout flow — lands with
# `subscription_status='incomplete'` and no password_hash, so the brand
# owner can't log in until a password is set through another path.
# Admin-override endpoint; not a replacement for self-service signup.
@app.post(
    "/api/admin/platform/brands",
    response_model=BrandResponse,
    status_code=status.HTTP_201_CREATED,
)
async def platform_create_brand(
    payload: AdminCreateBrandRequest,
    session: AsyncSession = Depends(get_session),
) -> Brand:
    name = payload.name.strip()
    contact_email = payload.contact_email.strip().lower()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Brand name must not be empty.",
        )
    if not contact_email or "@" not in contact_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="contact_email must be a valid email address.",
        )

    # Allocate a unique slug: base from name, suffix on collision.
    base_slug = _slugify(name)
    slug: str | None = None
    for i in range(1, 50):
        candidate = base_slug if i == 1 else f"{base_slug}-{i}"
        collision = (
            await session.execute(select(Brand.id).where(Brand.slug == candidate))
        ).scalar_one_or_none()
        if collision is None:
            slug = candidate
            break
    if slug is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not allocate a unique brand slug.",
        )

    brand = Brand(
        name=name,
        slug=slug,
        contact_email=contact_email,
        scheme_type=payload.scheme_type,
        # Owner name (optional) — pulled from the consolidated Add Brand
        # modal. Empty strings are coerced to NULL so the existing "no KYC
        # yet" presentation in the b2b Settings tab stays consistent.
        owner_first_name=(payload.owner_first_name or "").strip() or None,
        owner_last_name=(payload.owner_last_name or "").strip() or None,
    )
    session.add(brand)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand with that email or slug already exists.",
        )
    await session.refresh(brand)
    return brand


# ─────────────────────────────────────────────────────────────────────
# Brand-admin invite — Super Admin generates a setup link
# ─────────────────────────────────────────────────────────────────────
#
# Super Admin enters an email + selects a brand → backend signs a JWT
# with `aud=brand-invite` and 48h TTL → returns the setup_url so the
# UI can show the operator a copyable link they can paste into an
# email or chat. No persistence yet — the JWT itself is the
# invitation. When/if the b2b-dashboard adds a `/setup?token=…`
# route, it'll decode the token via tokens.decode(token, "brand-invite"),
# prompt for password, and finalize the admin user.
#
# We don't send the email here yet; OTP delivery is still the
# print-to-stdout stub (memory: project_otp_delivery_stdout_stub).
# When Resend/SendGrid lands, plug it in around the return.
class BrandInviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    brand_id: UUID


class BrandInviteResponse(BaseModel):
    setup_url: str
    token: str
    expires_at: datetime
    brand_id: UUID
    brand_name: str
    email: str


@app.post(
    "/api/admin/platform/invite-brand-admin",
    response_model=BrandInviteResponse,
    status_code=status.HTTP_200_OK,
)
async def platform_invite_brand_admin(
    payload: BrandInviteRequest,
    session: AsyncSession = Depends(get_session),
    _super_admin = Depends(get_super_admin_session),
) -> BrandInviteResponse:
    email = payload.email.strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="email must be a valid email address.",
        )

    brand = await session.get(Brand, payload.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand not found.",
        )

    token, exp = tokens.encode_brand_invite(email=email, brand_id=str(brand.id))
    base = settings.frontend_base_url.rstrip("/")
    setup_url = f"{base}/setup?token={token}"
    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)

    # Audit log so the Super Admin can correlate "I sent an invite to X
    # at 10:42" with what's actually in the system.
    logger.warning(
        "BRAND-INVITE email=%s brand_id=%s brand_name=%s expires_at=%s",
        email,
        brand.id,
        brand.name,
        expires_at.isoformat(),
        extra={
            "event": "brand_invite_issued",
            "email": email,
            "brand_id": str(brand.id),
            "expires_at": expires_at.isoformat(),
        },
    )

    # Best-effort delivery — failures fall back to stdout stub inside
    # send_email and the response still returns 200 with the setup_url
    # so the super-admin can hand-deliver if SMTP is misconfigured.
    #
    # Greeting name: prefer owner_first_name (sounds warmer), then a
    # combined first+last as a fallback. Both are nullable on Brand;
    # send_brand_invite_email handles the empty case gracefully.
    owner_first = (brand.owner_first_name or "").strip()
    owner_last = (brand.owner_last_name or "").strip()
    if owner_first and owner_last:
        cafe_owner_name: str | None = f"{owner_first} {owner_last}"
    elif owner_first:
        cafe_owner_name = owner_first
    elif owner_last:
        cafe_owner_name = owner_last
    else:
        cafe_owner_name = None

    send_brand_invite_email(
        to_email=email,
        brand_name=brand.name,
        setup_url=setup_url,
        cafe_owner_name=cafe_owner_name,
    )

    return BrandInviteResponse(
        setup_url=setup_url,
        token=token,
        expires_at=expires_at,
        brand_id=brand.id,
        brand_name=brand.name,
        email=email,
    )


# SECURITY — unauth'd, same posture as other /api/admin/platform/*.
#
# Manually add a cafe to an existing brand. Differs from the brand-scoped
# `POST /api/admin/cafes` (which uses the admin JWT's brand_id): this
# one takes an explicit `brand_id` so a super-admin can provision
# cafes for any brand. Auto-allocates store_number + slug; does NOT
# touch Stripe (no sync_subscription_quantity call — that's a
# brand-scoped ops path).
@app.post(
    "/api/admin/platform/cafes",
    response_model=AdminPlatformCafeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def platform_create_cafe(
    payload: AdminCreateCafeRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminPlatformCafeResponse:
    name = payload.name.strip()
    address = payload.address.strip()
    if not name or not address:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="name and address must not be empty.",
        )
    brand = await session.get(Brand, payload.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found."
        )

    if payload.store_number is not None:
        store_number = payload.store_number.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{3,10}", store_number):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="store_number must be 3-10 uppercase alphanumerics.",
            )
        collision = (
            await session.execute(
                select(Cafe.id).where(Cafe.store_number == store_number)
            )
        ).scalar_one_or_none()
        if collision is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Store number '{store_number}' is already in use.",
            )
    else:
        store_number = await _allocate_store_number(session, brand=brand)

    base_slug = f"{brand.slug}-{_slugify(name)}"
    slug = await _unique_cafe_slug(session, base_slug)

    # Best-effort geocode (same as create_cafe). Super-Admin override
    # path — failures stay quiet; the row is the priority.
    p_lat, p_lon = await geocode_address(address)

    cafe = Cafe(
        brand_id=brand.id,
        name=name,
        slug=slug,
        address=address,
        contact_email=brand.contact_email,
        store_number=store_number,
        latitude=p_lat,
        longitude=p_lon,
    )
    session.add(cafe)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A cafe with that identifier already exists.",
        )
    await session.refresh(cafe)
    return AdminPlatformCafeResponse(
        id=cafe.id,
        name=cafe.name,
        address=cafe.address,
        brand_id=brand.id,
        brand_name=brand.name,
        scheme_type=brand.scheme_type,
        subscription_status=brand.subscription_status,
        billing_status=cafe.billing_status,
        created_at=cafe.created_at,
    )


# ─────────────────────────────────────────────────────────────────
# CSV exports — Excel-friendly, UTF-8-BOM-prefixed
# ─────────────────────────────────────────────────────────────────

# Excel on Windows treats UTF-8 CSV as cp1252 unless the file starts
# with a BOM. Shipping the BOM makes £, em-dashes, accented names etc.
# open cleanly on a client's laptop without them having to do the
# Data → Import wizard dance.
_CSV_BOM = "﻿"


def _streaming_csv_response(
    rows: list[list[str]], filename: str
) -> StreamingResponse:
    """Serialize rows to a UTF-8-BOM-prefixed CSV with Excel-safe quoting."""
    buf = io.StringIO()
    buf.write(_CSV_BOM)
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    for row in rows:
        writer.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Let the admin dashboard read the filename on the JS side if
            # we ever want to display "Downloaded X.csv" toast.
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


_CAFE_STATUS_LABELS: dict[SubscriptionStatus, str] = {
    SubscriptionStatus.TRIALING: "Trialing",
    SubscriptionStatus.ACTIVE: "Active",
    SubscriptionStatus.PAST_DUE: "Past Due",
    SubscriptionStatus.CANCELED: "Cancelled",
    SubscriptionStatus.INCOMPLETE: "Incomplete",
    SubscriptionStatus.PENDING_CANCELLATION: "Pending Cancellation",
}

_SCHEME_LABELS: dict[SchemeType, str] = {
    SchemeType.GLOBAL: "LCP+ (Global)",
    SchemeType.PRIVATE: "Private",
}


# SECURITY — unauth'd, same posture as the other /api/admin/platform/*
# routes. Wrap with super-admin dependency before prod.
#
# Super-admin Cafes CRM export. Accepts the same `status` + `joined`
# filters as the list endpoint so "what you see is what you download".
@app.get("/api/admin/export/cafes")
async def export_cafes_csv(
    status: str | None = Query(None),
    joined: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    if status is not None:
        try:
            status_enum = SubscriptionStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"status must be one of: {', '.join(s.value for s in SubscriptionStatus)}.",
            )
    else:
        status_enum = None
    if joined is not None and joined not in _CAFE_JOINED_WINDOWS:
        raise HTTPException(
            status_code=422,
            detail="joined must be one of: last_7_days, last_30_days, all.",
        )

    stmt = (
        select(Cafe, Brand)
        .join(Brand, Brand.id == Cafe.brand_id)
        .order_by(Brand.name.asc(), Cafe.name.asc())
    )
    if status_enum is not None:
        stmt = stmt.where(Cafe.billing_status == status_enum)
    if joined == "last_7_days":
        stmt = stmt.where(
            Cafe.created_at >= datetime.now(timezone.utc) - timedelta(days=7)
        )
    elif joined == "last_30_days":
        stmt = stmt.where(
            Cafe.created_at >= datetime.now(timezone.utc) - timedelta(days=30)
        )
    joined_rows = (await session.execute(stmt)).all()

    rows: list[list[str]] = [
        [
            "Brand Name",
            "Cafe Name",
            "Address",
            "Scheme",
            "Status",
            "Joined Date",
            "Contact Email",
        ]
    ]
    for cafe, brand in joined_rows:
        rows.append(
            [
                brand.name,
                cafe.name,
                cafe.address,
                _SCHEME_LABELS.get(brand.scheme_type, brand.scheme_type.value),
                _CAFE_STATUS_LABELS.get(
                    cafe.billing_status, cafe.billing_status.value
                ),
                cafe.created_at.strftime("%Y-%m-%d"),
                cafe.contact_email,
            ]
        )

    # ISO-ish timestamp in the filename so repeated exports don't clobber
    # each other in the browser's downloads folder.
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    return _streaming_csv_response(rows, f"lcp-cafes-{stamp}.csv")


_RANGE_LABELS = {
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    "ytd": "Year to Date",
    "all": "All Time",
}


@app.get("/api/b2b/export/reports")
async def export_b2b_report_csv(
    range: str = Query("30d"),
    brand_id: str | None = Query(None),
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    if range not in _METRICS_RANGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="range must be one of: 7d, 30d, ytd, all.",
        )

    # RLS: if the frontend passes an explicit brand_id, it MUST match the
    # JWT's brand. Otherwise we just scope to the JWT's brand silently.
    # This keeps the endpoint shape symmetric with /api/admin/metrics
    # without opening a cross-brand data leak.
    if brand_id is not None and brand_id.lower() != "all":
        try:
            parsed = UUID(brand_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="brand_id must be a valid UUID or 'all'.",
            )
        if parsed != admin.brand_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="brand_id does not match the authenticated brand.",
            )

    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    now = datetime.now(timezone.utc)
    window_start, prev_start, prev_end = _metrics_range_bounds(range, now)

    def _scoped_count(
        event: LedgerEventType, start: datetime | None, end: datetime | None
    ):
        q = (
            select(func.count())
            .select_from(StampLedger)
            .join(Cafe, StampLedger.cafe_id == Cafe.id)
            .where(Cafe.brand_id == admin.brand_id)
            .where(StampLedger.event_type == event)
        )
        if start is not None:
            q = q.where(StampLedger.created_at >= start)
        if end is not None:
            q = q.where(StampLedger.created_at < end)
        return q

    total_earned = int(
        (
            await session.execute(_scoped_count(LedgerEventType.EARN, window_start, now))
        ).scalar_one()
    )
    total_redeemed = int(
        (
            await session.execute(_scoped_count(LedgerEventType.REDEEM, window_start, now))
        ).scalar_one()
    )
    prev_total_earned: int | None = None
    if prev_start is not None and prev_end is not None:
        prev_total_earned = int(
            (
                await session.execute(
                    _scoped_count(LedgerEventType.EARN, prev_start, prev_end)
                )
            ).scalar_one()
        )

    total_cafes = int(
        (
            await session.execute(
                select(func.count(Cafe.id)).where(Cafe.brand_id == admin.brand_id)
            )
        ).scalar_one()
    )

    # Per-cafe rollup for the 30d window — gives the owner a branch-by-
    # branch breakdown below the summary.
    thirty_days_ago = now - timedelta(days=30)
    per_cafe_rows = (
        await session.execute(
            select(Cafe.name, func.count().label("scans"))
            .join(StampLedger, StampLedger.cafe_id == Cafe.id)
            .where(Cafe.brand_id == admin.brand_id)
            .where(StampLedger.event_type == LedgerEventType.EARN)
            .where(StampLedger.created_at >= thirty_days_ago)
            .group_by(Cafe.name)
            .order_by(func.count().desc())
        )
    ).all()

    # Two-section CSV — Excel shows a nice visual gap on the blank row
    # between Summary and Per-Cafe tables.
    rows: list[list[str]] = [
        ["Local Coffee Perks — Data Report"],
        ["Brand", brand.name],
        ["Date Range", _RANGE_LABELS[range]],
        [
            "Window Start",
            window_start.isoformat() if window_start is not None else "(all time)",
        ],
        ["Window End", now.isoformat()],
        ["Generated At", now.strftime("%Y-%m-%d %H:%M UTC")],
        [],  # blank separator
        ["Metric", "Value"],
        ["Total Stamps Earned", str(total_earned)],
        ["Total Free Coffees Redeemed", str(total_redeemed)],
        [
            "Prior-Period Stamps Earned",
            str(prev_total_earned) if prev_total_earned is not None else "-",
        ],
        ["Total Cafes", str(total_cafes)],
        [],
        ["Per-Cafe Breakdown (Last 30 Days)"],
        ["Cafe Name", "Scans"],
    ]
    for name, scans in per_cafe_rows:
        rows.append([name, str(int(scans))])
    if not per_cafe_rows:
        rows.append(["(no scans in the last 30 days)", ""])

    slug = re.sub(r"[^A-Za-z0-9]+", "-", brand.name).strip("-").lower() or "brand"
    stamp = now.strftime("%Y-%m-%d_%H%M")
    return _streaming_csv_response(rows, f"lcp-report-{slug}-{range}-{stamp}.csv")


@app.get("/api/admin/cafes", response_model=list[CafeResponse])
async def list_admin_cafes(
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> list[Cafe]:
    result = await session.execute(
        select(Cafe)
        .where(Cafe.brand_id == admin.brand_id)
        .order_by(Cafe.created_at.desc())
    )
    return list(result.scalars().all())


@app.post(
    "/api/admin/cafes",
    response_model=CafeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_cafe(
    payload: CafeCreate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        # JWT referenced a brand that no longer exists — treat as auth failure.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    base_slug = payload.slug or f"{brand.slug}-{_slugify(payload.name)}"
    slug = await _unique_cafe_slug(session, base_slug)

    if payload.store_number is not None:
        normalized_store_number = payload.store_number.strip().upper()
        collision = (
            await session.execute(
                select(Cafe.id).where(Cafe.store_number == normalized_store_number)
            )
        ).scalar_one_or_none()
        if collision is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Store ID '{normalized_store_number}' is already in use.",
            )
    else:
        # No explicit store_number → allocate the next brand-prefixed
        # sequential ID (e.g. Daily Beans → DB001, DB002). The brand-
        # admin Add Location flow doesn't ask the owner to pick a
        # number — they just want a clean handle to hand to a barista.
        normalized_store_number = await _allocate_store_number(
            session, brand=brand,
        )

    # Best-effort geocode → unlocks Haversine distance math in the
    # consumer Discover feed. Failures land as (None, None) and the
    # consumer app falls back to its deterministic mock distance.
    address_clean = payload.address.strip()
    lat, lon = await geocode_address(address_clean)

    cafe = Cafe(
        brand_id=brand.id,
        name=f"{brand.name} — {payload.name.strip()}",
        slug=slug,
        address=address_clean,
        contact_email=(payload.contact_email or brand.contact_email).strip(),
        store_number=normalized_store_number,
        pin_hash=hash_password(payload.pin) if payload.pin else None,
        phone=payload.phone.strip() if payload.phone else None,
        food_hygiene_rating=payload.food_hygiene_rating,
        latitude=lat,
        longitude=lon,
    )
    session.add(cafe)
    await session.commit()
    await session.refresh(cafe)

    # Per-cafe billing: if the brand already has an active subscription,
    # bump the Stripe quantity to match the new total. Helper is tolerant
    # of missing/inactive subscriptions — brands without one stay silent
    # here and go through Checkout on their *first* cafe via the frontend.
    await sync_subscription_quantity(session, brand)

    return cafe


@app.patch("/api/admin/cafes/{cafe_id}", response_model=CafeResponse)
@app.put("/api/admin/cafes/{cafe_id}", response_model=CafeResponse)
async def update_cafe(
    cafe_id: UUID,
    payload: CafeUpdate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    # PUT and PATCH both route here because CafeUpdate is partial-by-default
    # — any field the client omits is left untouched. Giving the Edit dialog
    # both verbs matches REST convention without forcing the client to send
    # every field just to change one.

    # Defensive ID guard — `session.get(Cafe, cafe_id)` already issues a
    # `WHERE id = :id LIMIT 1` lookup, but we re-assert here to make the
    # blast radius obvious to anyone reading this. Without a resolved row we
    # refuse to commit: no bulk update can reach this function path.
    if cafe_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing cafe_id on update request.",
        )
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None or cafe.brand_id != admin.brand_id:
        # 404 (not 403) for cross-brand hits so we don't leak foreign UUIDs.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cafe not found.",
        )
    assert cafe.id == cafe_id, "Row mismatch — refusing to commit."

    if payload.address is not None:
        trimmed = payload.address.strip()
        if trimmed and trimmed != cafe.address:
            cafe.address = trimmed
            # Re-geocode whenever the address actually changes. We don't
            # try to detect "same address, slight typo fix" — Nominatim's
            # cheap enough that re-running on every edit is fine, and a
            # fresh resolve guards against stale coords from a prior
            # mistyped address.
            new_lat, new_lon = await geocode_address(trimmed)
            cafe.latitude = new_lat
            cafe.longitude = new_lon
    if payload.phone is not None:
        trimmed_phone = payload.phone.strip()
        cafe.phone = trimmed_phone or None
    if payload.food_hygiene_rating is not None:
        cafe.food_hygiene_rating = payload.food_hygiene_rating
    if payload.suspended_coffee_enabled is not None:
        cafe.suspended_coffee_enabled = payload.suspended_coffee_enabled
    await session.commit()
    await session.refresh(cafe)
    return cafe


async def _delete_cafe_impl(
    cafe_id: UUID,
    admin: AdminSession,
    session: AsyncSession,
) -> UUID:
    # Shared delete body for both the REST DELETE and the RPC-style POST
    # fallback. Same safety pattern: single-row lookup by PK, brand guard,
    # assert, try/commit, surface FK RESTRICT as 409 instead of 500.
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None or cafe.brand_id != admin.brand_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cafe not found.",
        )
    assert cafe.id == cafe_id, "Row mismatch — refusing to delete."
    brand_id = cafe.brand_id
    await session.delete(cafe)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This location has scan history and can't be deleted. "
                "Contact support to archive it instead."
            ),
        )

    # Decrement Stripe quantity to match the new cafe count. Helper skips if
    # the count would go to 0 — zero-quantity subscriptions are a support /
    # portal-cancel concern, not an auto-decrement one.
    brand = await session.get(Brand, brand_id)
    if brand is not None:
        await sync_subscription_quantity(session, brand)

    return cafe_id


@app.post("/api/admin/cafes/{cafe_id}/delete")
async def delete_cafe_rpc(
    cafe_id: UUID,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    # RPC-style POST fallback for clients / proxies / middlewares that
    # silently drop the HTTP DELETE verb. Returns a plain success envelope
    # so the frontend can treat this like any other POST.
    deleted_id = await _delete_cafe_impl(cafe_id, admin, session)
    return {"status": "success", "deleted_id": str(deleted_id)}


@app.delete(
    "/api/admin/cafes/{cafe_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_cafe(
    cafe_id: UUID,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Kept alongside the RPC-style POST fallback so clients that can use the
    # proper DELETE verb still get a standards-compliant 204 No Content.
    await _delete_cafe_impl(cafe_id, admin, session)


class ResetPinRequest(BaseModel):
    """Body for POST /api/admin/cafes/{id}/reset-pin. Brand-admin-scoped:
    rotates the bcrypt PIN hash on a single cafe so a brand owner can
    lock out an ex-employee instantly without involving Local Perks."""

    pin: str = Field(min_length=4, max_length=12)


@app.post("/api/admin/cafes/{cafe_id}/reset-pin", response_model=CafeResponse)
async def reset_cafe_pin(
    cafe_id: UUID,
    payload: ResetPinRequest,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None or cafe.brand_id != admin.brand_id:
        # 404 over 403 — same posture as the rest of /api/admin/cafes/* —
        # so a guessed cafe id from another brand can't confirm existence.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cafe not found.",
        )
    cafe.pin_hash = hash_password(payload.pin)
    # Wipe the network lock too — staff churn is the most common reason a
    # PIN gets rotated, and they may have logged in from an old till.
    cafe.last_known_ip = None
    cafe.network_locked_at = None
    await session.commit()
    await session.refresh(cafe)
    return cafe


@app.put("/api/admin/cafes/{cafe_id}/amenities", response_model=CafeResponse)
async def update_cafe_amenities(
    cafe_id: UUID,
    payload: CafeAmenitiesUpdate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None or cafe.brand_id != admin.brand_id:
        # 404 (not 403) for cross-brand hits so we don't leak the existence of
        # another brand's cafes to an attacker who guesses UUIDs.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cafe not found.",
        )
    cafe.amenities = payload.amenities
    await session.commit()
    await session.refresh(cafe)
    return cafe


@app.get("/api/admin/offers", response_model=list[OfferResponse])
async def list_admin_offers(
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> list[Offer]:
    result = await session.execute(
        select(Offer)
        .where(Offer.brand_id == admin.brand_id)
        .order_by(Offer.starts_at.desc())
    )
    return list(result.scalars().all())


@app.post(
    "/api/admin/offers",
    response_model=OfferResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_offer(
    payload: OfferCreate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Offer:
    # Empty-list → NULL so "Specific Locations with zero boxes ticked" can't
    # silently mint an offer that applies to nothing.
    target_ids = payload.target_cafe_ids or None

    # Custom-offer normalisation: when offer_type='custom', the bespoke
    # copy in `custom_text` is the entire content of the offer — `target`
    # and `amount` from the request are accepted (the frontend may send
    # placeholder values) but NOT persisted. For all other types,
    # `custom_text` is silently dropped per PRD §4.3.3.
    if payload.offer_type == "custom":
        offer = Offer(
            brand_id=admin.brand_id,
            offer_type="custom",
            target=payload.target,  # keeps the NOT NULL column happy; ignored at render
            amount=None,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            target_cafe_ids=target_ids,
            custom_text=(payload.custom_text or "").strip(),
        )
    else:
        offer = Offer(
            brand_id=admin.brand_id,
            offer_type=payload.offer_type,
            target=payload.target,
            amount=payload.amount,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            target_cafe_ids=target_ids,
            custom_text=None,
        )
    session.add(offer)
    await session.commit()
    await session.refresh(offer)
    return offer


@app.put("/api/admin/offers/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: UUID,
    payload: OfferUpdate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> Offer:
    offer = await session.get(Offer, offer_id)
    if offer is None or offer.brand_id != admin.brand_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offer not found.",
        )
    offer.offer_type = payload.offer_type
    offer.target = payload.target
    offer.starts_at = payload.starts_at
    offer.ends_at = payload.ends_at
    offer.target_cafe_ids = payload.target_cafe_ids or None
    # Same custom-vs-structured normalisation as create_offer — keeps the
    # row internally consistent across edits, including the case where a
    # user flips offer_type from 'custom' back to 'percent' (or vice
    # versa) on the same offer row.
    if payload.offer_type == "custom":
        offer.amount = None
        offer.custom_text = (payload.custom_text or "").strip()
    else:
        offer.amount = payload.amount
        offer.custom_text = None
    await session.commit()
    await session.refresh(offer)
    return offer


async def _delete_offer_impl(
    offer_id: UUID,
    admin: AdminSession,
    session: AsyncSession,
) -> UUID:
    # Shared delete body for both the REST DELETE and the RPC-style POST
    # fallback. Mirrors _delete_cafe_impl: single-row lookup by PK, brand
    # guard, assert, commit.
    offer = await session.get(Offer, offer_id)
    if offer is None or offer.brand_id != admin.brand_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offer not found.",
        )
    assert offer.id == offer_id, "Row mismatch — refusing to delete."
    await session.delete(offer)
    await session.commit()
    return offer_id


@app.post("/api/admin/offers/{offer_id}/delete")
async def delete_offer_rpc(
    offer_id: UUID,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    # RPC-style POST fallback for clients / proxies / middlewares that
    # silently drop the HTTP DELETE verb. Same envelope shape as the cafe
    # delete RPC so the frontend handles both uniformly.
    deleted_id = await _delete_offer_impl(offer_id, admin, session)
    return {"status": "success", "deleted_id": str(deleted_id)}


@app.delete(
    "/api/admin/offers/{offer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_offer(
    offer_id: UUID,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Kept alongside the RPC-style POST fallback so clients that can use the
    # proper DELETE verb still get a standards-compliant 204 No Content.
    await _delete_offer_impl(offer_id, admin, session)


@app.post(
    "/api/admin/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_session),
) -> User:
    user = User(
        till_code=payload.till_code or _generate_till_code(),
        barcode=payload.barcode or _generate_barcode(),
        email=payload.email,
        display_name=payload.display_name,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@app.get("/api/users/{user_id}/balance", response_model=BalanceResponse)
async def get_user_balance(
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> BalanceResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    result = await session.execute(
        select(func.coalesce(func.sum(StampLedger.stamp_delta), 0)).where(
            StampLedger.customer_id == user_id
        )
    )
    return BalanceResponse(user_id=user_id, stamp_balance=int(result.scalar_one()))


@app.post(
    "/api/venues/stamp",
    response_model=StampResponse,
    status_code=status.HTTP_201_CREATED,
)
async def issue_stamp(
    payload: StampRequest,
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> StampResponse:
    brand = await session.get(Brand, cafe.brand_id)
    user, current_balance = await _lock_user_and_read_scoped_balance(
        session, payload.user_id, payload.till_code, brand
    )

    entry = StampLedger(
        customer_id=user.id,
        cafe_id=cafe.id,
        barista_id=payload.barista_id,
        event_type=LedgerEventType.EARN,
        stamp_delta=1,
    )
    session.add(entry)
    await session.flush()

    new_balance = current_balance + 1
    entry_id = entry.id
    user_id_out = user.id
    await session.commit()

    reward_earned = new_balance > 0 and new_balance % REWARD_THRESHOLD == 0
    return StampResponse(
        user_id=user_id_out,
        stamp_balance=new_balance,
        reward_earned=reward_earned,
        ledger_entry_id=entry_id,
    )


@app.post(
    "/api/venues/redeem",
    response_model=RedeemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def redeem_reward(
    payload: RedeemRequest,
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> RedeemResponse:
    # Mixed-Basket redeem: `quantity` = number of banked rewards to consume.
    # Each reward burns REWARD_THRESHOLD stamps. Default 1 preserves legacy
    # single-drink callers.
    brand = await session.get(Brand, cafe.brand_id)
    user, current_balance = await _lock_user_and_read_scoped_balance(
        session, payload.user_id, payload.till_code, brand
    )

    qty = payload.quantity
    required = qty * REWARD_THRESHOLD
    if current_balance < required:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Insufficient stamps: customer has {current_balance}, "
                f"{required} required to redeem {qty} reward"
                f"{'s' if qty != 1 else ''}."
            ),
        )

    # One REDEEM row per drink (the CHECK constraint pins stamp_delta = -10
    # for REDEEM), same shape as the old auto-rollover path used.
    entries = [
        StampLedger(
            customer_id=user.id,
            cafe_id=cafe.id,
            barista_id=payload.barista_id,
            event_type=LedgerEventType.REDEEM,
            stamp_delta=-REWARD_THRESHOLD,
        )
        for _ in range(qty)
    ]
    session.add_all(entries)

    # Shadow ledger: one aggregated REDEEMED row for /me/history so the
    # consumer sees "Redeemed 2 Free Drinks" as a single entry.
    redeemed_row = GlobalLedger(
        consumer_id=user.till_code,
        venue_id=cafe.id,
        action_type=GlobalLedgerAction.REDEEMED,
        quantity=qty,
    )
    session.add(redeemed_row)
    await session.flush()

    new_balance = current_balance - required
    # Return the first entry's id (POS displays it as a receipt reference).
    entry_id = entries[0].id
    user_id_out = user.id
    await session.commit()

    return RedeemResponse(
        user_id=user_id_out,
        stamp_balance=new_balance,
        redeemed=True,
        quantity_redeemed=qty,
        ledger_entry_id=entry_id,
    )


@app.get(
    "/api/venues/customer/{till_code}",
    response_model=CustomerStatusResponse,
)
async def venue_customer_status(
    till_code: str,
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> CustomerStatusResponse:
    """Pre-scan lookup: returns current stamps + banked rewards for this
    customer, scoped to the authenticated venue's brand (Global vs Private
    isolation rule applies — same as /me/balance)."""
    normalized = (till_code or "").strip().upper()
    if not re.fullmatch(r"^[A-Z0-9]{6}$", normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="till_code must be 6 uppercase alphanumeric characters.",
        )
    user = (
        await session.execute(select(User).where(User.till_code == normalized))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )
    brand = await session.get(Brand, cafe.brand_id)
    balance = int(
        (
            await session.execute(_scoped_balance_stmt(user.id, brand))
        ).scalar_one()
    )
    return CustomerStatusResponse(
        user_id=user.id,
        till_code=user.till_code,
        current_stamps=balance % REWARD_THRESHOLD,
        banked_rewards=balance // REWARD_THRESHOLD,
        threshold=REWARD_THRESHOLD,
    )


app.include_router(auth_router)
app.include_router(consumer_auth_router)
app.include_router(consumer_api_router)
app.include_router(billing_router)
app.include_router(b2b_router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    # Run directly with `python -m app.main` to boot the API on 0.0.0.0:8000
    # so physical devices on the LAN (e.g. Expo Go on a phone) can reach it.
    # In terminal-land you can also use:
    #   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

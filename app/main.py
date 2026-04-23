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

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_active_cafe, get_admin_session
from app.auth_routes import router as auth_router
from app.b2b_routes import router as b2b_router
from app.billing import router as billing_router, sync_subscription_quantity
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
    AdminCustomerResponse,
    AdminOverviewResponse,
    AdminPlatformCafeResponse,
    AdminTransactionResponse,
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


@app.get("/api/admin/metrics", response_model=MetricsResponse)
async def admin_metrics(
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> MetricsResponse:
    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    now = datetime.now(timezone.utc)
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
@app.get("/api/admin/platform/cafes", response_model=list[AdminPlatformCafeResponse])
async def platform_cafes(
    session: AsyncSession = Depends(get_session),
) -> list[AdminPlatformCafeResponse]:
    # Single join pass — the super-admin table needs both sides so we
    # fetch them together instead of N+1-ing brand lookups.
    rows = (
        await session.execute(
            select(Cafe, Brand)
            .join(Brand, Brand.id == Cafe.brand_id)
            .order_by(Cafe.name.asc())
        )
    ).all()
    return [
        AdminPlatformCafeResponse(
            id=cafe.id,
            name=cafe.name,
            address=cafe.address,
            brand_id=brand.id,
            brand_name=brand.name,
            scheme_type=brand.scheme_type,
            subscription_status=brand.subscription_status,
            created_at=cafe.created_at,
        )
        for cafe, brand in rows
    ]


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
    return AdminCustomerResponse(
        id=user.id,
        till_code=user.till_code.strip(),
        email=user.email,
        created_at=user.created_at,
        global_stamps=nets.get(SchemeType.GLOBAL, 0),
        total_private_stamps=nets.get(SchemeType.PRIVATE, 0),
        is_suspended=user.is_suspended,
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
        if cafe.billing_status == SubscriptionStatus.ACTIVE:
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
        normalized_store_number = None

    cafe = Cafe(
        brand_id=brand.id,
        name=f"{brand.name} — {payload.name.strip()}",
        slug=slug,
        address=payload.address.strip(),
        contact_email=(payload.contact_email or brand.contact_email).strip(),
        store_number=normalized_store_number,
        pin_hash=hash_password(payload.pin) if payload.pin else None,
        phone=payload.phone.strip() if payload.phone else None,
        food_hygiene_rating=payload.food_hygiene_rating,
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
        if trimmed:
            cafe.address = trimmed
    if payload.phone is not None:
        trimmed_phone = payload.phone.strip()
        cafe.phone = trimmed_phone or None
    if payload.food_hygiene_rating is not None:
        cafe.food_hygiene_rating = payload.food_hygiene_rating
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
    offer = Offer(
        brand_id=admin.brand_id,
        offer_type=payload.offer_type,
        target=payload.target,
        amount=payload.amount,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        target_cafe_ids=target_ids,
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
    offer.amount = payload.amount
    offer.starts_at = payload.starts_at
    offer.ends_at = payload.ends_at
    offer.target_cafe_ids = payload.target_cafe_ids or None
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

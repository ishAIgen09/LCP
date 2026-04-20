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
from app.billing import router as billing_router
from app.consumer_auth import (
    consumer_router as consumer_api_router,
    router as consumer_auth_router,
)
from app.database import get_session, settings
from app.models import (
    Brand,
    Cafe,
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
    offer = Offer(
        brand_id=admin.brand_id,
        offer_type=payload.offer_type,
        target=payload.target,
        amount=payload.amount,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
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
    await session.commit()
    await session.refresh(offer)
    return offer


@app.delete(
    "/api/admin/offers/{offer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_offer(
    offer_id: UUID,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> None:
    offer = await session.get(Offer, offer_id)
    if offer is None or offer.brand_id != admin.brand_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offer not found.",
        )
    await session.delete(offer)
    await session.commit()


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
    brand = await session.get(Brand, cafe.brand_id)
    user, current_balance = await _lock_user_and_read_scoped_balance(
        session, payload.user_id, payload.till_code, brand
    )

    if current_balance < REWARD_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Insufficient stamps: customer has {current_balance}, "
                f"{REWARD_THRESHOLD} required to redeem."
            ),
        )

    entry = StampLedger(
        customer_id=user.id,
        cafe_id=cafe.id,
        barista_id=payload.barista_id,
        event_type=LedgerEventType.REDEEM,
        stamp_delta=-REWARD_THRESHOLD,
    )
    session.add(entry)
    await session.flush()

    new_balance = current_balance - REWARD_THRESHOLD
    entry_id = entry.id
    user_id_out = user.id
    await session.commit()

    return RedeemResponse(
        user_id=user_id_out,
        stamp_balance=new_balance,
        redeemed=True,
        ledger_entry_id=entry_id,
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

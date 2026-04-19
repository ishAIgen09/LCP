import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_active_cafe, get_admin_session
from app.auth_routes import router as auth_router
from app.billing import router as billing_router
from app.consumer_auth import router as consumer_auth_router
from app.database import get_session, settings
from app.models import (
    Brand,
    Cafe,
    LedgerEventType,
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
    CafeCreate,
    CafeResponse,
    CafeScans,
    MetricsResponse,
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

app = FastAPI(title="The Indie Coffee Loop API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
    )
    session.add(cafe)
    await session.commit()
    await session.refresh(cafe)
    return cafe


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
app.include_router(billing_router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    # Run directly with `python -m app.main` to boot the API on 0.0.0.0:8000
    # so physical devices on the LAN (e.g. Expo Go on a phone) can reach it.
    # In terminal-land you can also use:
    #   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

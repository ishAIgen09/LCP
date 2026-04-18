import secrets
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_active_cafe
from app.billing import router as billing_router
from app.database import get_session
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
    BalanceResponse,
    BrandCreate,
    BrandResponse,
    CafeCreate,
    CafeResponse,
    RedeemRequest,
    RedeemResponse,
    StampRequest,
    StampResponse,
    UserCreate,
    UserResponse,
)

TILL_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
REWARD_THRESHOLD = 10

app = FastAPI(title="The Indie Coffee Loop API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _generate_till_code() -> str:
    return "".join(secrets.choice(TILL_CODE_ALPHABET) for _ in range(6))


def _generate_barcode() -> str:
    return secrets.token_hex(12)


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


@app.post(
    "/api/admin/cafes",
    response_model=CafeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_cafe(
    payload: CafeCreate,
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    brand = await session.get(Brand, payload.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found"
        )
    cafe = Cafe(
        brand_id=payload.brand_id,
        name=payload.name,
        slug=payload.slug,
        address=payload.address,
        contact_email=payload.contact_email,
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


app.include_router(billing_router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")

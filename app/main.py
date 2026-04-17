import secrets
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_active_cafe
from app.database import get_session
from app.models import Cafe, LedgerEventType, StampLedger, SubscriptionStatus, User
from app.schemas import (
    BalanceResponse,
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

app = FastAPI(title="The Indie Coffee Loop API", version="0.1.0")

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


async def _lock_user_and_read_balance(
    session: AsyncSession,
    user_id: UUID | None,
    till_code: str | None,
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

    balance_stmt = select(
        func.coalesce(func.sum(StampLedger.stamp_delta), 0)
    ).where(StampLedger.customer_id == user.id)
    balance = int((await session.execute(balance_stmt)).scalar_one())
    return user, balance


@app.post(
    "/api/admin/cafes",
    response_model=CafeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_cafe(
    payload: CafeCreate,
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    cafe = Cafe(
        name=payload.name,
        slug=payload.slug,
        contact_email=payload.contact_email,
    )
    session.add(cafe)
    await session.commit()
    await session.refresh(cafe)
    return cafe


@app.post(
    "/api/admin/cafes/{cafe_id}/activate",
    response_model=CafeResponse,
)
async def activate_cafe(
    cafe_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> Cafe:
    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cafe not found"
        )
    cafe.subscription_status = SubscriptionStatus.ACTIVE
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
    user, current_balance = await _lock_user_and_read_balance(
        session, payload.user_id, payload.till_code
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
    user, current_balance = await _lock_user_and_read_balance(
        session, payload.user_id, payload.till_code
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

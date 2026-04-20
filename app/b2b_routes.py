"""B2B POS scan endpoint with rollover and Shadow Ledger writes.

Phase 4 (Consumer App, 2026-04-19): the Barista POS now submits one scan event
carrying a `quantity` (drinks bought). We atomically:

1. Insert `quantity` individual +1 EARN rows into `stamp_ledger` (one per stamp
   — preserves the existing scheme-scoped `SUM(stamp_delta)` balance-read path
   and the CHECK constraint `stamp_delta = 1` for EARN rows).
2. Compute `free_drinks = (balance_before + quantity) // 10` and, if > 0,
   insert `free_drinks` individual -10 REDEEM rows into `stamp_ledger`.
3. Insert one aggregated `earned` row into `global_ledger` with
   quantity = stamps bought, and (if rollover fired) one aggregated
   `redeemed` row with quantity = number of free drinks.

The two ledgers serve different purposes: `stamp_ledger` is the event log that
produces the balance (one row per stamp, immutable, CHECK-constrained), while
`global_ledger` is the platform-wide activity feed that keeps one row per
logical POS action — easier to list, analytics-friendly, and keyed by the
6-char till_code directly.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_active_cafe
from app.database import get_session
from app.models import (
    Brand,
    Cafe,
    GlobalLedger,
    GlobalLedgerAction,
    LedgerEventType,
    StampLedger,
)
from app.schemas import B2BScanRequest, B2BScanResponse

REWARD_THRESHOLD = 10

router = APIRouter(prefix="/api/b2b", tags=["b2b"])


@router.post(
    "/scan",
    response_model=B2BScanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def b2b_scan(
    payload: B2BScanRequest,
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> B2BScanResponse:
    # The Venue-API-Key header is the authoritative venue identity; the body's
    # venue_id is belt-and-braces so the POS can't scan a cafe it doesn't own.
    if payload.venue_id != cafe.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="venue_id does not match the authenticated Venue-API-Key.",
        )

    brand = await session.get(Brand, cafe.brand_id)
    # Import lazily to avoid a circular with main.py helpers.
    from app.main import _lock_user_and_read_scoped_balance

    user, current_balance = await _lock_user_and_read_scoped_balance(
        session, None, payload.consumer_id, brand
    )

    quantity = payload.quantity
    total_after_earn = current_balance + quantity
    free_drinks = total_after_earn // REWARD_THRESHOLD
    new_balance = total_after_earn % REWARD_THRESHOLD

    # 1. Stamp ledger: one +1 EARN row per stamp bought.
    session.add_all(
        [
            StampLedger(
                customer_id=user.id,
                cafe_id=cafe.id,
                event_type=LedgerEventType.EARN,
                stamp_delta=1,
            )
            for _ in range(quantity)
        ]
    )

    # 2. Stamp ledger: one -10 REDEEM row per free drink unlocked by rollover.
    if free_drinks > 0:
        session.add_all(
            [
                StampLedger(
                    customer_id=user.id,
                    cafe_id=cafe.id,
                    event_type=LedgerEventType.REDEEM,
                    stamp_delta=-REWARD_THRESHOLD,
                )
                for _ in range(free_drinks)
            ]
        )

    # 3. Global (shadow) ledger: aggregated rows — one earned, one redeemed.
    earned_row = GlobalLedger(
        consumer_id=user.till_code,
        venue_id=cafe.id,
        action_type=GlobalLedgerAction.EARNED,
        quantity=quantity,
    )
    session.add(earned_row)

    redeemed_row: GlobalLedger | None = None
    if free_drinks > 0:
        redeemed_row = GlobalLedger(
            consumer_id=user.till_code,
            venue_id=cafe.id,
            action_type=GlobalLedgerAction.REDEEMED,
            quantity=free_drinks,
        )
        session.add(redeemed_row)

    await session.flush()
    earned_transaction_id = earned_row.transaction_id
    redeemed_transaction_id = redeemed_row.transaction_id if redeemed_row else None
    await session.commit()

    return B2BScanResponse(
        consumer_id=user.till_code,
        venue_id=cafe.id,
        stamps_earned=quantity,
        free_drinks_unlocked=free_drinks,
        new_balance=new_balance,
        earned_transaction_id=earned_transaction_id,
        redeemed_transaction_id=redeemed_transaction_id,
    )

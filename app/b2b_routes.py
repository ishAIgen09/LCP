"""B2B POS scan endpoint + Shadow Ledger write.

Mixed-Basket pivot (2026-04-21): auto-rollover is GONE from this endpoint.
Balances now accumulate uncapped; rewards bank until explicitly consumed
via POST /api/venues/redeem (with a quantity body param). This is what lets
the Mid-Order Intercept POS ask the barista "use one now or save for later?"
— before the pivot the answer was forced ("auto-redeemed on the 10th stamp").

We atomically:
1. Insert `quantity` individual +1 EARN rows into `stamp_ledger` (one per
   stamp — preserves the CHECK constraint `stamp_delta = 1` for EARN rows).
2. Insert one aggregated EARNED row into `global_ledger` so the consumer's
   /me/history feed shows the scan as a single entry.

No REDEEM rows are written here — that path now lives exclusively in
/api/venues/redeem. `free_drinks_unlocked` in the response is kept in the
shape for backcompat and is always 0 under the new model.

The two ledgers serve different purposes: `stamp_ledger` is the event log
(one row per stamp, immutable, CHECK-constrained), while `global_ledger` is
the platform-wide activity feed that keeps one row per logical POS action.
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
    new_balance = current_balance + quantity  # uncapped — banking semantics

    # Stamp ledger: one +1 EARN row per stamp bought.
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

    # Global (shadow) ledger: one aggregated EARNED row for this transaction.
    earned_row = GlobalLedger(
        consumer_id=user.till_code,
        venue_id=cafe.id,
        action_type=GlobalLedgerAction.EARNED,
        quantity=quantity,
    )
    session.add(earned_row)

    await session.flush()
    earned_transaction_id = earned_row.transaction_id
    await session.commit()

    return B2BScanResponse(
        consumer_id=user.till_code,
        venue_id=cafe.id,
        stamps_earned=quantity,
        # Kept in the response shape for old clients; always 0 under the
        # banking model. Rollover is now a barista decision via the
        # Mid-Order Intercept POS flow.
        free_drinks_unlocked=0,
        new_balance=new_balance,
        earned_transaction_id=earned_transaction_id,
        redeemed_transaction_id=None,
    )

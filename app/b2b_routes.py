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

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_active_cafe, get_admin_session
from app.database import get_session
from app.models import (
    Brand,
    Cafe,
    CancellationFeedback,
    GlobalLedger,
    GlobalLedgerAction,
    LedgerEventType,
    StampLedger,
    SuspendedCoffeeLedger,
)
from app.email_sender import send_email
from app.schemas import (
    AdminSession,
    B2BScanRequest,
    B2BScanResponse,
    CancellationFeedbackCreate,
    CancellationFeedbackResponse,
    CommunityPoolStatus,
    DonateTillRequest,
    ProductFeedbackCreate,
    ProductFeedbackResponse,
    SuspendedCoffeeMutationResponse,
)

logger = logging.getLogger(__name__)

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


# ─────────────────────────────────────────────────────────────────────
# B2B Cancellation Feedback (PRD §4.2) — intercept survey before the
# b2b dashboard hands off to the Stripe Customer Portal.
# ─────────────────────────────────────────────────────────────────────


@router.post(
    "/cancellation-feedback",
    response_model=CancellationFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def cancellation_feedback(
    payload: CancellationFeedbackCreate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> CancellationFeedback:
    """Persist a brand owner's exit-survey response. The b2b dashboard's
    BillingView calls this BEFORE redirecting to the Stripe portal — fail
    here and the redirect is blocked. Brand id comes from the admin JWT;
    the request body never carries one.

    Validation is in `CancellationFeedbackCreate.__check__` (Pydantic
    model_validator):
      - reason='other' requires non-empty `details`
      - `acknowledged` must be True (the cancel-at-period-end policy
        disclosure)
    Both raise 422 at the boundary if violated.
    """
    # Normalise blank-but-not-None details to actual NULL so the column
    # carries a clean signal of "no extra info" vs "empty whitespace".
    details_norm = (payload.details or "").strip() or None

    row = CancellationFeedback(
        brand_id=admin.brand_id,
        reason=payload.reason,
        details=details_norm,
        acknowledged=payload.acknowledged,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    logger.info(
        "CANCELLATION-FEEDBACK brand_id=%s reason=%s has_details=%s",
        row.brand_id,
        row.reason,
        bool(row.details),
    )
    return row


# ─────────────────────────────────────────────────────────────────────
# B2B Product Feedback — Settings → Provide Feedback. Continuous
# feedback loop captured by the same brand-admin JWT that owns the
# dashboard. We email the operator inbox + log a structured line; no
# DB row is persisted yet (the message volume is low enough that an
# email + log are the right primitives until we need triage tooling).
# ─────────────────────────────────────────────────────────────────────


@router.post(
    "/feedback",
    response_model=ProductFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_product_feedback(
    payload: ProductFeedbackCreate,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> ProductFeedbackResponse:
    """Capture a brand owner's product feedback. Fans out to:
      - structured log line (greppable by brand_id)
      - email to hello@localcoffeeperks.com (best-effort; never raises)
    """
    from datetime import datetime, timezone

    received_at = datetime.now(timezone.utc)
    body = payload.message.strip()

    brand = await session.get(Brand, admin.brand_id)
    brand_name = brand.name if brand is not None else "(unknown brand)"
    contact_email = brand.contact_email if brand is not None else "(unknown)"

    logger.info(
        "PRODUCT-FEEDBACK brand_id=%s brand_name=%s contact=%s message=%r",
        admin.brand_id,
        brand_name,
        contact_email,
        body,
    )

    subject = f"[LCP feedback] {brand_name}"
    # Plain HTML body — minimal markup so the operator inbox stays
    # readable. send_email's stub fallback will print to stdout if no
    # transport is configured (local dev), so the message is never lost.
    html_body = (
        f"<p><strong>Brand:</strong> {brand_name}</p>"
        f"<p><strong>Contact:</strong> {contact_email}</p>"
        f"<p><strong>Brand id:</strong> {admin.brand_id}</p>"
        f"<p><strong>Message:</strong></p>"
        f"<pre style='white-space:pre-wrap;font-family:inherit;'>{body}</pre>"
    )
    try:
        send_email("hello@localcoffeeperks.com", subject, html_body, body)
    except Exception as exc:  # noqa: BLE001 — best-effort delivery
        logger.warning("PRODUCT-FEEDBACK email failed: %s", exc)

    return ProductFeedbackResponse(ok=True, received_at=received_at)


# ─────────────────────────────────────────────────────────────────────
# Pay It Forward (Suspended Coffee) — POS-side endpoints.
# Auth = Venue-API-Key header (cafe identity). The brand-admin opt-in
# toggle on cafes.suspended_coffee_enabled lives behind the existing
# PATCH /api/admin/cafes/{id} — not in this file.
# ─────────────────────────────────────────────────────────────────────


async def _read_pool_balance(session: AsyncSession, cafe_id) -> int:
    """SUM(units_delta) over suspended_coffee_ledger for one cafe.
    Returns int; clamps a defensively-impossible negative result to 0
    (the serve-floor guard should make this unreachable).
    """
    raw = (
        await session.execute(
            select(
                func.coalesce(func.sum(SuspendedCoffeeLedger.units_delta), 0)
            ).where(SuspendedCoffeeLedger.cafe_id == cafe_id)
        )
    ).scalar_one()
    balance = int(raw or 0)
    if balance < 0:
        # Should never happen given the serve-floor check + the locked
        # transaction. If it does, it's a data-integrity alert worth
        # flagging — log loudly + clamp so we don't leak a negative
        # number to the dashboard.
        logger.error(
            "POOL-INTEGRITY suspended_coffee_ledger sum is negative for "
            "cafe_id=%s balance=%d — clamping to 0",
            cafe_id,
            balance,
        )
        return 0
    return balance


@router.get(
    "/suspended-coffee/pool",
    response_model=CommunityPoolStatus,
)
async def suspended_coffee_pool(
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> CommunityPoolStatus:
    """Current community-pool balance + enabled flag for the calling
    cafe. The Barista POS polls this on mount and after every donate/
    serve action so the visible counter stays fresh. Always returns —
    even cafes that have toggled the feature off can see their
    historical pool balance (we don't truncate the ledger on disable).
    """
    balance = await _read_pool_balance(session, cafe.id)
    return CommunityPoolStatus(
        cafe_id=cafe.id,
        enabled=cafe.suspended_coffee_enabled,
        pool_balance=balance,
    )


@router.post(
    "/suspended-coffee/donate-till",
    response_model=SuspendedCoffeeMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suspended_coffee_donate_till(
    payload: DonateTillRequest,
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> SuspendedCoffeeMutationResponse:
    """Mode 2 — barista records N till-paid donations from a single
    scan. Inserts one ledger row per unit (cleaner audit trail than a
    single units_delta=N row, per PRD §4.5.7).

    Per-scan count is capped by the schema (`DonateTillRequest.count`,
    1 ≤ N ≤ SUSPENDED_COFFEE_TILL_PER_SCAN_MAX).
    """
    if not cafe.suspended_coffee_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Suspended Coffee is disabled for this cafe. Toggle it on "
                "from the b2b dashboard's Settings tab first."
            ),
        )

    session.add_all(
        [
            SuspendedCoffeeLedger(
                cafe_id=cafe.id,
                event_type="donate_till",
                units_delta=1,
            )
            for _ in range(payload.count)
        ]
    )
    await session.commit()

    new_balance = await _read_pool_balance(session, cafe.id)
    logger.info(
        "PIF-DONATE-TILL cafe_id=%s count=%d new_balance=%d",
        cafe.id,
        payload.count,
        new_balance,
    )
    return SuspendedCoffeeMutationResponse(new_pool_balance=new_balance)


@router.post(
    "/suspended-coffee/serve",
    response_model=SuspendedCoffeeMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suspended_coffee_serve(
    cafe: Cafe = Depends(get_active_cafe),
    session: AsyncSession = Depends(get_session),
) -> SuspendedCoffeeMutationResponse:
    """Decrement the pool by 1 — barista just handed a coffee to
    someone in need. CRITICAL guard: the pool MUST NOT go below zero.

    Concurrency: two baristas at the same cafe could double-tap "Serve"
    simultaneously and race for the last unit. We serialise via
    `SELECT … FROM cafes WHERE id = $1 FOR UPDATE` — cheap lock that
    holds for the few milliseconds it takes to read the SUM and INSERT
    the -1 row. Without the lock, both serves would pass the
    "balance >= 1" check before either commits, and the pool would land
    at -1.
    """
    if not cafe.suspended_coffee_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Suspended Coffee is disabled for this cafe. Toggle it on "
                "from the b2b dashboard's Settings tab first."
            ),
        )

    # Take the cafe-row lock for the rest of the transaction. Mirrors
    # the user-row lock pattern in app.main::_lock_user_and_read_scoped_balance.
    locked_cafe = (
        await session.execute(
            select(Cafe).where(Cafe.id == cafe.id).with_for_update()
        )
    ).scalar_one_or_none()
    if locked_cafe is None:
        # Race: the cafe was deleted between the auth resolve and this
        # lock attempt. ON DELETE CASCADE on suspended_coffee_ledger
        # will have already wiped the rows; treat as 404.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cafe not found."
        )

    balance = await _read_pool_balance(session, cafe.id)
    if balance < 1:
        # 409 Conflict per PRD §4.5.8 — distinct from a 400 because the
        # request itself is well-formed; the failure is server-state.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Community pool is empty.",
        )

    session.add(
        SuspendedCoffeeLedger(
            cafe_id=cafe.id,
            event_type="serve",
            units_delta=-1,
        )
    )
    await session.commit()

    new_balance = balance - 1
    logger.info(
        "PIF-SERVE cafe_id=%s prev_balance=%d new_balance=%d",
        cafe.id,
        balance,
        new_balance,
    )
    return SuspendedCoffeeMutationResponse(new_pool_balance=new_balance)

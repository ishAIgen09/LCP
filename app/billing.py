import calendar
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin_session
from app.database import get_session, settings
from app.models import Brand, Cafe, SchemeType, SubscriptionStatus
from app.schemas import AdminSession, CheckoutResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


def _require_stripe_key() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="STRIPE_SECRET_KEY is not configured.",
        )


async def _count_brand_cafes(session: AsyncSession, brand_id: UUID) -> int:
    result = await session.execute(
        select(func.count(Cafe.id)).where(Cafe.brand_id == brand_id)
    )
    return int(result.scalar_one())


async def sync_subscription_quantity(
    session: AsyncSession, brand: Brand
) -> None:
    """
    Reconcile the brand's Stripe subscription quantity with its current cafe
    count. Called as a side effect after cafe create / delete. Safe to call
    when:
      - Stripe isn't configured (no-op, logs a warning)
      - Brand has no subscription yet (no-op — they'll checkout from the
        next Add Location flow)
      - Subscription count would go to 0 (skipped — Stripe doesn't love
        zero-quantity items; the admin should cancel via the portal instead)

    Failures NEVER bubble up. A divergence between Postgres cafe count and
    Stripe quantity is recoverable (manual reconciliation or a future
    backfill job). Blocking cafe creation on a transient Stripe hiccup is
    not worth the UX cost.
    """
    if not settings.stripe_secret_key:
        logger.warning("sync_subscription_quantity skipped: STRIPE_SECRET_KEY unset")
        return
    if not brand.stripe_subscription_id:
        return
    if brand.subscription_status != SubscriptionStatus.ACTIVE:
        return

    cafe_count = await _count_brand_cafes(session, brand.id)
    if cafe_count <= 0:
        logger.info(
            "sync_subscription_quantity: cafe_count=0 for brand=%s, skipping "
            "(admin should cancel via portal)",
            brand.id,
        )
        return

    try:
        subscription = stripe.Subscription.retrieve(brand.stripe_subscription_id)
        items = subscription.get("items", {}).get("data", [])
        if not items:
            logger.error(
                "Subscription %s has no items — can't sync quantity",
                brand.stripe_subscription_id,
            )
            return
        item_id = items[0]["id"]
        current_qty = items[0].get("quantity", 0)
        if current_qty == cafe_count:
            return
        # proration_behavior="create_prorations" is critical here: Stripe
        # creates positive proration line items for the new cafe(s) for the
        # remainder of the current billing cycle, so the customer is
        # charged ONLY the prorated difference (not the full new monthly
        # rate × full cycle). Without this flag Stripe's default would
        # charge the full new amount immediately and skip proration math.
        stripe.SubscriptionItem.modify(
            item_id,
            quantity=cafe_count,
            proration_behavior="create_prorations",
        )
        logger.info(
            "Stripe quantity synced (prorated): brand=%s %d → %d",
            brand.id,
            current_qty,
            cafe_count,
        )
    except stripe.StripeError as exc:
        # Stripe-side failure. Cafe row already committed; surface in logs for
        # manual reconciliation, don't raise.
        logger.error(
            "Stripe quantity sync failed for brand=%s subscription=%s: %s",
            brand.id,
            brand.stripe_subscription_id,
            exc,
        )


# Stripe's documented minimum gap between `now` and `subscription_data.
# trial_end` is 48 hours. Anything closer raises a 400 like
# "trial_end must be at least 48 hours in the future". The last 1-2 days
# of any calendar month would otherwise trip this when we anchor to the
# 1st. We deal with it by simply NOT setting trial_end on those days,
# falling back to Stripe's default (full month upfront, billing cycle
# anchored to the day of checkout). That's a slight UX regression on
# 1-2 days per month, but the safest deterministic behavior.
_STRIPE_TRIAL_END_MIN_GAP = timedelta(hours=48)


def _trial_end_first_of_next_month(now: datetime | None = None) -> int | None:
    """Unix timestamp at 00:00 UTC on the 1st of the next calendar month.

    Returns None when the 1st of next month is closer than Stripe's
    48-hour minimum (i.e. checkout is happening on the 30th/31st late in
    the day). Caller treats None as "skip trial_end on this checkout."
    """
    now = now or datetime.now(timezone.utc)
    if now.month == 12:
        first_next = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        first_next = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    if first_next - now < _STRIPE_TRIAL_END_MIN_GAP:
        return None
    return int(first_next.timestamp())


def _success_url() -> str:
    # {CHECKOUT_SESSION_ID} is a Stripe template token, not a Python format
    # placeholder — Stripe substitutes it after the session is created.
    return (
        settings.frontend_base_url.rstrip("/")
        + "/success?session_id={CHECKOUT_SESSION_ID}"
    )


def _cancel_url() -> str:
    return settings.frontend_base_url.rstrip("/") + "/cancel"


PlanTier = Literal["private", "global"]


def _resolve_price_id(tier: PlanTier) -> str | None:
    """Map a tier slug → the Stripe price id configured in env.
    Returns None when the env var is unset; caller falls back to inline
    price_data so local dev without a Stripe dashboard still works."""

    if tier == "global":
        return settings.stripe_global_price_id
    return settings.stripe_private_price_id


# Inline fallback unit prices in pence — used only when the matching
# stripe_*_price_id env var isn't configured. Mirrors the marketing
# pricing on the b2b dashboard's BillingView so the Stripe Checkout
# preview matches what the user just clicked.
_INLINE_FALLBACK_UNIT_PENCE: dict[PlanTier, int] = {
    "private": 500,
    "global": 799,
}


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    tier: PlanTier = "private",
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> CheckoutResponse:
    _require_stripe_key()

    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    # Per-cafe billing: seed the subscription with the brand's current cafe
    # count (typically 1 — the admin just added their first location and got
    # redirected here). Falls back to 1 if somehow called with 0 cafes so
    # Stripe accepts the subscription.
    cafe_count = max(await _count_brand_cafes(session, brand.id), 1)

    # Tiered line item:
    #   - Preferred: a fixed Stripe price id created in the dashboard
    #     (env: STRIPE_PRIVATE_PRICE_ID / STRIPE_GLOBAL_PRICE_ID). This
    #     keeps unit pricing managed in Stripe so finance + tax + future
    #     promo codes all live in one place.
    #   - Fallback: inline `price_data` with the same pence/month
    #     amount. Triggered only when the env var is unset (local dev,
    #     unconfigured droplet). Logged so an admin can spot the gap.
    price_id = _resolve_price_id(tier)
    if price_id:
        line_item: dict = {"price": price_id, "quantity": cafe_count}
    else:
        unit_amount = _INLINE_FALLBACK_UNIT_PENCE[tier]
        logger.warning(
            "create_checkout: no Stripe price id for tier=%s, falling back "
            "to inline %dp price_data",
            tier,
            unit_amount,
        )
        line_item = {
            "price_data": {
                "currency": "gbp",
                "product_data": {
                    "name": (
                        "Local Coffee Perks — LCP+ Global Pass"
                        if tier == "global"
                        else "Local Coffee Perks — Private Plan"
                    ),
                },
                "recurring": {"interval": "month"},
                "unit_amount": unit_amount,
            },
            "quantity": cafe_count,
        }

    # Pro-rata behavior on initial signup:
    # Stripe Checkout doesn't accept `proration_behavior` directly, but
    # `subscription_data.trial_end` set to "first of next month UTC" gives
    # us the same UX outcome as proration: the customer is NOT charged a
    # full month upfront for a partial period. Their first real invoice
    # lands on the 1st of next month at the full monthly rate. Subsequent
    # cycles renew on the 1st as well, which means every brand's billing
    # cycle naturally aligns to month-start.
    #
    # Stripe rejects trial_end < 48h from now with a 400 — see the helper
    # for the guard. On the last day of the month we drop trial_end and
    # let Stripe default (full month upfront, day-of-checkout anchor) take
    # over. Better than a hard 500.
    trial_end = _trial_end_first_of_next_month()

    subscription_data: dict = {
        "metadata": {"brand_id": str(brand.id), "tier": tier},
    }
    if trial_end is not None:
        subscription_data["trial_end"] = trial_end

    kwargs: dict = {
        "mode": "subscription",
        "payment_method_types": ["card"],
        "line_items": [line_item],
        "client_reference_id": str(brand.id),
        # Pass the tier through to the webhook so we can persist
        # brand.plan_tier when the subscription lands.
        "metadata": {"brand_id": str(brand.id), "tier": tier},
        "subscription_data": subscription_data,
        "success_url": _success_url(),
        "cancel_url": _cancel_url(),
    }
    # Reuse the same Stripe customer across sessions so past payment methods
    # and invoices stay linked to one record per brand.
    if brand.stripe_customer_id:
        kwargs["customer"] = brand.stripe_customer_id
    else:
        kwargs["customer_email"] = brand.contact_email

    try:
        checkout_session = stripe.checkout.Session.create(**kwargs)
    except stripe.StripeError as exc:
        # Surface the actual Stripe message in logs so we can debug
        # without bouncing a vague 500 to the dashboard. Common culprits:
        # invalid trial_end (< 48h), missing payment_method_types,
        # mismatched currency between price + customer.
        logger.error(
            "Stripe Checkout create failed: brand=%s tier=%s err=%s",
            brand.id,
            tier,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe could not create the checkout session: {exc.user_message or str(exc)}",
        )

    return CheckoutResponse(checkout_url=checkout_session.url)


@router.post("/portal", response_model=CheckoutResponse)
async def create_portal_session(
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> CheckoutResponse:
    """
    Open a Stripe Customer Portal session for the signed-in brand's admin.
    Returns the same shape as /checkout ({ checkout_url }) so the frontend
    can reuse its redirect helper.
    """
    _require_stripe_key()

    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )
    if not brand.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No Stripe customer on file yet. Add your first location to "
                "start a subscription."
            ),
        )

    return_url = settings.frontend_base_url.rstrip("/") + "/billing"
    portal_session = stripe.billing_portal.Session.create(
        customer=brand.stripe_customer_id,
        return_url=return_url,
    )
    return CheckoutResponse(checkout_url=portal_session.url)


# Plan tier ids accepted by /plan-change. Locked at the boundary so a typo
# from the dashboard surfaces as 422 rather than landing in the audit log.
PlanTier = Literal["starter", "pro", "premium"]


def _resolve_plan_change_price_id(plan: PlanTier) -> str | None:
    """Map a /plan-change tier id → Stripe price id from env.

    The b2b-dashboard's PlanCard uses the names `starter`/`pro`/`premium`
    while the Stripe price IDs are scheme-typed (`PRIVATE`/`GLOBAL`).
    Mapping (must match `b2b-dashboard/src/views/BillingView.tsx`):
        starter → STRIPE_PRIVATE_PRICE_ID  (£5/mo Founding)
        pro     → STRIPE_GLOBAL_PRICE_ID   (£7.99/mo Founding)
        premium → not yet provisioned in Stripe — return None and let
                  the caller 422 with a clear message.
    """
    if plan == "starter":
        return settings.stripe_private_price_id
    if plan == "pro":
        return settings.stripe_global_price_id
    return None  # premium → no price configured yet


def _scheme_type_for_plan(plan: PlanTier) -> SchemeType | None:
    """Map a plan-change tier id → SchemeType for the brand row update.
    Mirrors `_resolve_plan_change_price_id`'s mapping. Returns None for
    plans we don't yet model (premium)."""
    if plan == "starter":
        return SchemeType.PRIVATE
    if plan == "pro":
        return SchemeType.GLOBAL
    return None


# ─────────────────────────────────────────────────────────────────────
# Pro-rata billing rules — the spec
# ─────────────────────────────────────────────────────────────────────
#
# Anchor: every subscription's billing cycle is anchored to the 1st of
# the calendar month, in the brand's billing timezone (we treat the
# server clock as UTC for now; switch to brand.timezone when that
# column lands).
#
# Initial signup (no existing subscription, brand goes from no plan to
# any plan):
#   1. Stripe subscription created with
#        billing_cycle_anchor = first_of_next_month
#        proration_behavior = "create_prorations"
#      → Stripe invoices the partial month immediately, the next full
#      month renews on the 1st.
#   2. Pro-rata amount for "today through end of this month":
#        days_remaining = days_in_month - day_of_month + 1
#        amount = monthly_rate * days_remaining / days_in_month
#
# Upgrade (e.g. £5 Private → £7.99 Global, mid-month):
#   1. Stripe subscriptionItems.update(...) with
#        proration_behavior = "create_prorations"
#        billing_cycle_anchor = "unchanged"
#   2. Stripe writes proration line items (the negative for the unused
#      portion of the £5 tier and the positive for the £7.99 tier from
#      today → end of month).
#   3. We force an immediate charge of the net positive so the cafe gets
#      Global access right now:
#        invoices.create(subscription=sub_id, auto_advance=True)
#        invoices.pay(invoice_id)
#   4. The next regular cycle invoice on the 1st bills the full new
#      monthly rate (no surprises).
#
# Downgrade (e.g. £7.99 Global → £5 Private, mid-month):
#   1. Stripe subscriptionItems.update(...) with
#        proration_behavior = "create_prorations"
#        billing_cycle_anchor = "unchanged"
#   2. Stripe writes a credit (negative line item) for the unused
#      portion of the £7.99 tier through end of month.
#   3. We DO NOT force an out-of-cycle invoice. The credit naturally
#      lands on the next monthly invoice on the 1st as a reduction.
#
# This file mocks the Stripe calls with logger.warning lines that match
# the eventual invoke shape, so the audit trail is real and the swap is
# a ~30-line diff when we're ready to wire the live API.


def _compute_proration_pence(
    delta_pence_per_location: int,
    cafe_count: int,
    now: datetime,
) -> tuple[int, int, int]:
    """Returns (proration_pence, days_remaining, days_in_month).

    `delta_pence_per_location` is signed:
       positive → upgrade  (we charge proration immediately)
       negative → downgrade (we credit |proration| against next invoice)
       zero     → no-op (caller should reject before reaching here)

    Day-of-month inclusion: today is part of the new tier, so a change
    on the 1st prorates the full month, a change on the 31st of a
    31-day month prorates 1/31. Stripe uses the same convention with
    timestamp-based prorations.
    """
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_remaining = days_in_month - now.day + 1
    # Round half-up to nearest pence. Integer arithmetic only.
    monthly_total_delta = delta_pence_per_location * cafe_count
    numerator = abs(monthly_total_delta) * days_remaining
    proration_abs = (numerator + (days_in_month // 2)) // days_in_month
    proration = proration_abs if monthly_total_delta >= 0 else -proration_abs
    return proration, days_remaining, days_in_month


class PlanChangeRequest(BaseModel):
    from_plan: PlanTier
    to_plan: PlanTier
    # Per-location monthly delta in pence — already computed by the
    # frontend so the server log captures exactly what the user saw on
    # the confirmation modal. We re-log it rather than re-compute so any
    # client-vs-server tier-table drift is visible in the audit trail.
    price_delta_pence_per_location: int = Field(ge=-100_000, le=100_000)
    cafe_count: int = Field(ge=0)


class PlanChangeResponse(BaseModel):
    notified: bool
    request_id: str
    received_at: datetime
    # Proration breakdown surfaced to the dashboard so the dialog can
    # show "you'll be charged £X.XX today" or "you'll get £X.XX off
    # next month".
    direction: Literal["upgrade", "downgrade", "noop"]
    days_remaining_in_month: int
    days_in_month: int
    proration_pence: int
    # Populated for upgrades — the pence amount that would be invoiced
    # immediately by Stripe. None for downgrades.
    immediate_charge_pence: int | None = None
    # Populated for downgrades — the pence amount that would land as a
    # credit on next month's invoice. None for upgrades.
    next_invoice_credit_pence: int | None = None


@router.post("/plan-change", response_model=PlanChangeResponse)
async def request_plan_change(
    body: PlanChangeRequest,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> PlanChangeResponse:
    """
    Apply a brand's plan-change request — modify the Stripe subscription
    item with `proration_behavior="create_prorations"`, then for upgrades
    force an immediate invoice + pay so the customer is charged the
    prorated difference right now (rather than waiting for the next
    cycle invoice). Downgrades skip the immediate-invoice step; the
    proration credit naturally lands on the next monthly invoice.

    Audit log line `PLAN-CHANGE` and the proration-math response shape
    are unchanged from the pre-Stripe-wire-up version — the response
    payload still tells the dashboard exactly what to display, even
    though the math is now backed by a real Stripe call instead of a
    mock log line.
    """
    brand = await session.get(Brand, admin.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session references an unknown brand.",
        )

    received_at = datetime.now(timezone.utc)
    request_id = f"plan-change-{int(received_at.timestamp() * 1000)}-{brand.id}"
    monthly_total_delta_pence = (
        body.price_delta_pence_per_location * body.cafe_count
    )

    proration_pence, days_remaining, days_in_month = _compute_proration_pence(
        body.price_delta_pence_per_location,
        body.cafe_count,
        received_at,
    )
    if monthly_total_delta_pence > 0:
        direction: Literal["upgrade", "downgrade", "noop"] = "upgrade"
        immediate_charge_pence: int | None = proration_pence
        next_invoice_credit_pence: int | None = None
    elif monthly_total_delta_pence < 0:
        direction = "downgrade"
        immediate_charge_pence = None
        # Credit is a positive amount the user gets back; flip the sign.
        next_invoice_credit_pence = -proration_pence
    else:
        direction = "noop"
        immediate_charge_pence = None
        next_invoice_credit_pence = None

    # Audit log line — structured, greppable. Same prefix as v1 so
    # existing Super Admin queries continue working.
    logger.warning(
        "PLAN-CHANGE request_id=%s brand_id=%s brand_name=%s "
        "direction=%s from=%s to=%s delta_per_loc_pence=%s cafe_count=%s "
        "total_delta_pence=%s proration_pence=%s days_remaining=%s/%s",
        request_id,
        brand.id,
        brand.name,
        direction,
        body.from_plan,
        body.to_plan,
        body.price_delta_pence_per_location,
        body.cafe_count,
        monthly_total_delta_pence,
        proration_pence,
        days_remaining,
        days_in_month,
        extra={
            "event": "plan_change_request",
            "request_id": request_id,
            "brand_id": str(brand.id),
            "direction": direction,
            "from_plan": body.from_plan,
            "to_plan": body.to_plan,
            "price_delta_pence_per_location": body.price_delta_pence_per_location,
            "cafe_count": body.cafe_count,
            "total_delta_pence": monthly_total_delta_pence,
            "proration_pence": proration_pence,
            "days_remaining_in_month": days_remaining,
            "days_in_month": days_in_month,
        },
    )

    # ─── Real Stripe wire-up (replaces the prior PLAN-CHANGE-STRIPE-MOCK) ─
    # Skip Stripe entirely on noop (same-plan-to-same-plan). The audit log
    # above already captured the request; nothing else to do.
    if direction == "noop":
        return PlanChangeResponse(
            notified=True,
            request_id=request_id,
            received_at=received_at,
            direction=direction,
            days_remaining_in_month=days_remaining,
            days_in_month=days_in_month,
            proration_pence=proration_pence,
            immediate_charge_pence=immediate_charge_pence,
            next_invoice_credit_pence=next_invoice_credit_pence,
        )

    _require_stripe_key()

    # Pre-flight checks before we touch Stripe — fail fast with clear
    # errors rather than letting Stripe return a cryptic 400.
    if not brand.stripe_subscription_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No Stripe subscription on file for this brand. Add your "
                "first location to start a subscription before changing plan."
            ),
        )
    if not brand.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Stripe customer on file. Cannot apply a plan change.",
        )
    if brand.subscription_status != SubscriptionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Subscription status is '{brand.subscription_status.value}'; "
                "plan changes require an active subscription."
            ),
        )

    new_price_id = _resolve_plan_change_price_id(body.to_plan)
    if not new_price_id:
        # `premium` doesn't have a Stripe price configured yet (and isn't
        # surfaced in the dashboard). If a future build ever ships a
        # Premium tier, add STRIPE_PREMIUM_PRICE_ID to Settings and
        # extend `_resolve_plan_change_price_id`.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Plan '{body.to_plan}' is not provisioned in Stripe. "
                "Configure STRIPE_*_PRICE_ID and update "
                "_resolve_plan_change_price_id."
            ),
        )

    try:
        # Step 1 — locate the subscription item id. Same pattern as
        # sync_subscription_quantity: retrieve the live subscription and
        # take items.data[0].id. We don't store stripe_subscription_item_id
        # on Brand because the existing subscription-create flow doesn't
        # surface it; one Stripe round-trip is acceptable for a
        # rare-cadence operation like a plan change.
        subscription = stripe.Subscription.retrieve(brand.stripe_subscription_id)
        items = subscription.get("items", {}).get("data", [])
        if not items:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Stripe subscription has no items; cannot apply plan change.",
            )
        item_id = items[0]["id"]

        # Step 2 — swap the price with create_prorations. This is the
        # core call. Stripe writes proration line items for the unused
        # portion of the old tier (negative) and the used portion of the
        # new tier (positive) for the remainder of the current cycle.
        # billing_cycle_anchor stays whatever the subscription was
        # originally created with — we never re-anchor mid-life.
        stripe.SubscriptionItem.modify(
            item_id,
            price=new_price_id,
            proration_behavior="create_prorations",
        )

        # Step 3 — for upgrades, invoice + pay immediately so the cafe
        # gets the new tier's benefits in real time and isn't surprised
        # by a larger-than-expected next-cycle invoice. Stripe rolls the
        # proration line items into this invoice.
        if direction == "upgrade":
            invoice = stripe.Invoice.create(
                customer=brand.stripe_customer_id,
                subscription=brand.stripe_subscription_id,
                auto_advance=True,
                collection_method="charge_automatically",
            )
            stripe.Invoice.pay(invoice["id"])
            logger.info(
                "PLAN-CHANGE-STRIPE upgraded brand=%s sub=%s item=%s "
                "new_price=%s invoice=%s charge_pence=%s",
                brand.id,
                brand.stripe_subscription_id,
                item_id,
                new_price_id,
                invoice["id"],
                immediate_charge_pence,
            )
        else:  # downgrade
            # No immediate invoice. Stripe will apply the proration
            # credit (negative) on the next monthly invoice.
            logger.info(
                "PLAN-CHANGE-STRIPE downgraded brand=%s sub=%s item=%s "
                "new_price=%s next_invoice_credit_pence=%s",
                brand.id,
                brand.stripe_subscription_id,
                item_id,
                new_price_id,
                next_invoice_credit_pence,
            )
    except stripe.StripeError as exc:
        logger.error(
            "PLAN-CHANGE-STRIPE FAILED brand=%s direction=%s from=%s to=%s "
            "err=%s",
            brand.id,
            direction,
            body.from_plan,
            body.to_plan,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe could not apply the plan change: {exc.user_message or str(exc)}",
        )

    # Step 4 — sync brand.scheme_type so the b2b dashboard + Discover
    # reflect the new tier on next page load. The Stripe call already
    # succeeded above, so even if this DB update fails we'd rather
    # tolerate a brief drift (next webhook or manual sync resolves it)
    # than roll back a real Stripe charge.
    new_scheme = _scheme_type_for_plan(body.to_plan)
    if new_scheme is not None and brand.scheme_type != new_scheme:
        try:
            brand.scheme_type = new_scheme
            await session.commit()
        except Exception as exc:  # noqa: BLE001 — DB-layer best-effort
            logger.warning(
                "PLAN-CHANGE brand.scheme_type sync failed brand=%s new=%s err=%s",
                brand.id,
                new_scheme.value,
                exc,
            )
            await session.rollback()

    return PlanChangeResponse(
        notified=True,
        request_id=request_id,
        received_at=received_at,
        direction=direction,
        days_remaining_in_month=days_remaining,
        days_in_month=days_in_month,
        proration_pence=proration_pence,
        immediate_charge_pence=immediate_charge_pence,
        next_invoice_credit_pence=next_invoice_credit_pence,
    )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict:
    payload = await request.body()

    if settings.debug_skip_stripe_sig:
        try:
            event = json.loads(payload or b"{}")
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON payload",
            )
    else:
        if not settings.stripe_webhook_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="STRIPE_WEBHOOK_SECRET is not configured.",
            )
        if not stripe_signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing Stripe-Signature header",
            )
        try:
            event = stripe.Webhook.construct_event(
                payload=payload,
                sig_header=stripe_signature,
                secret=settings.stripe_webhook_secret,
            )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payload",
            )
        except stripe.SignatureVerificationError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid signature",
            )

    event_type = event.get("type")
    if event_type == "checkout.session.completed":
        obj = event["data"]["object"]
        brand_id_str = (obj.get("metadata") or {}).get("brand_id") or obj.get(
            "client_reference_id"
        )
        if not brand_id_str:
            return {"received": True, "warning": "no brand_id on session"}
        try:
            brand_id = UUID(brand_id_str)
        except ValueError:
            return {"received": True, "warning": "invalid brand_id on session"}

        brand = await session.get(Brand, brand_id)
        if brand is None:
            return {"received": True, "warning": "brand not found"}

        brand.subscription_status = SubscriptionStatus.ACTIVE
        stripe_customer_id = obj.get("customer")
        if stripe_customer_id and not brand.stripe_customer_id:
            brand.stripe_customer_id = stripe_customer_id
        stripe_subscription_id = obj.get("subscription")
        if stripe_subscription_id and not brand.stripe_subscription_id:
            brand.stripe_subscription_id = stripe_subscription_id

        # Persist the chosen tier — Checkout passes ?tier=private|global on
        # the create_checkout call, which we forwarded into session
        # metadata. Map → brand.scheme_type so the Plans grid + Discover
        # reflect the new tier on the next page load. Unknown / missing
        # tier values are left alone (we treat them as "no preference",
        # not as a directive to flip).
        tier = (obj.get("metadata") or {}).get("tier")
        if tier == "global":
            brand.scheme_type = SchemeType.GLOBAL
        elif tier == "private":
            brand.scheme_type = SchemeType.PRIVATE

        # Cascade billing_status → ACTIVE for every cafe under this brand.
        # New brands typically have one cafe (the one that triggered the
        # checkout); existing brands re-subscribing might have several.
        # One UPDATE wins over N session.merge() round-trips.
        await session.execute(
            update(Cafe)
            .where(Cafe.brand_id == brand_id)
            .values(billing_status=SubscriptionStatus.ACTIVE)
        )

        await session.commit()
        return {
            "received": True,
            "brand_id": str(brand_id),
            "status": "active",
            "tier": tier,
        }

    # Subscription fully cancelled (either via Portal or because the
    # cancel-at-period-end grace window elapsed). Flip the brand to
    # CANCELED, and flip every cafe that was still being billed
    # (ACTIVE / PENDING_CANCELLATION) to CANCELED in one pass so the
    # super-admin Billing tab drops them from MRR immediately.
    if event_type == "customer.subscription.deleted":
        obj = event["data"]["object"]
        stripe_customer_id = obj.get("customer")
        stripe_subscription_id = obj.get("id")

        # Locate the brand — prefer subscription_id (more specific), fall
        # back to customer_id, then metadata if neither is on file.
        brand: Brand | None = None
        if stripe_subscription_id:
            brand = (
                await session.execute(
                    select(Brand).where(
                        Brand.stripe_subscription_id == stripe_subscription_id
                    )
                )
            ).scalar_one_or_none()
        if brand is None and stripe_customer_id:
            brand = (
                await session.execute(
                    select(Brand).where(Brand.stripe_customer_id == stripe_customer_id)
                )
            ).scalar_one_or_none()
        if brand is None:
            meta_brand_id = (obj.get("metadata") or {}).get("brand_id")
            if meta_brand_id:
                try:
                    brand = await session.get(Brand, UUID(meta_brand_id))
                except ValueError:
                    brand = None
        if brand is None:
            return {"received": True, "warning": "no matching brand"}

        brand.subscription_status = SubscriptionStatus.CANCELED
        await session.execute(
            update(Cafe)
            .where(Cafe.brand_id == brand.id)
            .where(
                Cafe.billing_status.in_(
                    [
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.PENDING_CANCELLATION,
                    ]
                )
            )
            .values(billing_status=SubscriptionStatus.CANCELED)
        )
        await session.commit()
        return {
            "received": True,
            "brand_id": str(brand.id),
            "status": "canceled",
        }

    return {"received": True}

import json
import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin_session
from app.database import get_session, settings
from app.models import Brand, Cafe, SubscriptionStatus
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
        stripe.SubscriptionItem.modify(
            item_id,
            quantity=cafe_count,
            proration_behavior="create_prorations",
        )
        logger.info(
            "Stripe quantity synced: brand=%s %d → %d",
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


def _success_url() -> str:
    # {CHECKOUT_SESSION_ID} is a Stripe template token, not a Python format
    # placeholder — Stripe substitutes it after the session is created.
    return (
        settings.frontend_base_url.rstrip("/")
        + "/success?session_id={CHECKOUT_SESSION_ID}"
    )


def _cancel_url() -> str:
    return settings.frontend_base_url.rstrip("/") + "/cancel"


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
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

    kwargs: dict = {
        "mode": "subscription",
        "payment_method_types": ["card"],
        "line_items": [
            {
                "price_data": {
                    "currency": "gbp",
                    "product_data": {
                        "name": "Local Coffee Perks — Per Location",
                    },
                    "recurring": {"interval": "month"},
                    "unit_amount": 500,
                },
                "quantity": cafe_count,
            }
        ],
        "client_reference_id": str(brand.id),
        "metadata": {"brand_id": str(brand.id)},
        "success_url": _success_url(),
        "cancel_url": _cancel_url(),
    }
    # Reuse the same Stripe customer across sessions so past payment methods
    # and invoices stay linked to one record per brand.
    if brand.stripe_customer_id:
        kwargs["customer"] = brand.stripe_customer_id
    else:
        kwargs["customer_email"] = brand.contact_email

    checkout_session = stripe.checkout.Session.create(**kwargs)

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


@router.post("/plan-change", response_model=PlanChangeResponse)
async def request_plan_change(
    body: PlanChangeRequest,
    admin: AdminSession = Depends(get_admin_session),
    session: AsyncSession = Depends(get_session),
) -> PlanChangeResponse:
    """
    Record a brand-admin's plan-change request. No Stripe mutation yet —
    real tier mapping requires per-tier price ids in env, which we'll add
    when the tier system goes live. For now this is a structured audit
    log line the Super Admin can grep:

        docker compose logs api | grep "PLAN-CHANGE"

    The frontend shows a success toast immediately on 200; nothing on
    the brand record changes today.
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

    # logger.warning so it stands out at the default log level. Structured
    # extra dict keeps the line greppable by field too.
    logger.warning(
        "PLAN-CHANGE request_id=%s brand_id=%s brand_name=%s "
        "from=%s to=%s delta_per_loc_pence=%s cafe_count=%s "
        "total_delta_pence=%s",
        request_id,
        brand.id,
        brand.name,
        body.from_plan,
        body.to_plan,
        body.price_delta_pence_per_location,
        body.cafe_count,
        monthly_total_delta_pence,
        extra={
            "event": "plan_change_request",
            "request_id": request_id,
            "brand_id": str(brand.id),
            "from_plan": body.from_plan,
            "to_plan": body.to_plan,
            "price_delta_pence_per_location": body.price_delta_pence_per_location,
            "cafe_count": body.cafe_count,
            "total_delta_pence": monthly_total_delta_pence,
        },
    )

    return PlanChangeResponse(
        notified=True,
        request_id=request_id,
        received_at=received_at,
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

    if event["type"] == "checkout.session.completed":
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
        await session.commit()
        return {"received": True, "brand_id": str(brand_id), "status": "active"}

    # Subscription fully cancelled (either via Portal or because the
    # cancel-at-period-end grace window elapsed). Flip the brand to
    # CANCELED, and flip every cafe that was still being billed
    # (ACTIVE / PENDING_CANCELLATION) to CANCELED in one pass so the
    # super-admin Billing tab drops them from MRR immediately.
    if event["type"] == "customer.subscription.deleted":
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

import json
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, settings
from app.models import Brand, SubscriptionStatus
from app.schemas import CheckoutRequest, CheckoutResponse

router = APIRouter(prefix="/api/billing", tags=["billing"])

CHECKOUT_SUCCESS_URL = "http://localhost:8000/?billing=success&session_id={CHECKOUT_SESSION_ID}"
CHECKOUT_CANCEL_URL = "http://localhost:8000/?billing=cancel"

if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


def _require_stripe_key() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="STRIPE_SECRET_KEY is not configured.",
        )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    payload: CheckoutRequest,
    session: AsyncSession = Depends(get_session),
) -> CheckoutResponse:
    _require_stripe_key()

    brand = await session.get(Brand, payload.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found"
        )

    checkout_session = stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "gbp",
                    "product_data": {
                        "name": "The Indie Coffee Loop — Brand Subscription",
                    },
                    "recurring": {"interval": "month"},
                    "unit_amount": 500,
                },
                "quantity": 1,
            }
        ],
        client_reference_id=str(brand.id),
        metadata={"brand_id": str(brand.id)},
        success_url=CHECKOUT_SUCCESS_URL,
        cancel_url=CHECKOUT_CANCEL_URL,
    )

    return CheckoutResponse(checkout_url=checkout_session.url)


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

    return {"received": True}

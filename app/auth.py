from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Brand, Cafe, SubscriptionStatus


async def get_active_cafe(
    session: AsyncSession = Depends(get_session),
    venue_api_key: str | None = Header(default=None, alias="Venue-API-Key"),
) -> Cafe:
    if not venue_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Venue-API-Key header is required",
        )

    try:
        cafe_id = UUID(venue_api_key)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Venue-API-Key",
        )

    cafe = await session.get(Cafe, cafe_id)
    if cafe is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Venue-API-Key",
        )

    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Venue-API-Key",
        )

    if brand.subscription_status != SubscriptionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Brand subscription is '{brand.subscription_status.value}'; "
                "'active' required to use venue endpoints."
            ),
        )

    return cafe

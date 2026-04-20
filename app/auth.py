from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.database import get_session
from app.models import Brand, Cafe, SubscriptionStatus
from app.schemas import AdminSession


@dataclass
class ConsumerSession:
    user_id: UUID
    consumer_id: str  # mirrors users.till_code
    email: str


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


async def get_admin_session(
    authorization: str | None = Header(default=None),
) -> AdminSession:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )

    token = authorization[len("Bearer ") :].strip()
    try:
        claims = tokens.decode(token, audience="admin")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin token.",
        )

    try:
        brand_id = UUID(str(claims.get("brand_id") or ""))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin token is missing a valid brand claim.",
        )

    email = claims.get("email") or ""
    brand_name = claims.get("brand_name") or ""
    return AdminSession(brand_id=brand_id, email=email, brand_name=brand_name)


async def get_consumer_session(
    authorization: str | None = Header(default=None),
) -> ConsumerSession:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )

    token = authorization[len("Bearer ") :].strip()
    try:
        claims = tokens.decode(token, audience="consumer")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired consumer token.",
        )

    try:
        user_id = UUID(str(claims.get("user_id") or ""))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Consumer token is missing a valid user_id claim.",
        )

    consumer_id = str(claims.get("consumer_id") or "")
    email = str(claims.get("email") or "")
    return ConsumerSession(user_id=user_id, consumer_id=consumer_id, email=email)

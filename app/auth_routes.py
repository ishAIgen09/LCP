"""Auth routes for the Business App gateway.

Admin login matches a Brand by `contact_email` and verifies the password
against `brands.password_hash` (bcrypt). Store login matches a Cafe by
`store_number` and verifies the PIN against `cafes.pin_hash` (bcrypt).

401 errors are uniform so a caller cannot use the endpoint to probe which
emails / store numbers exist. Password verification runs even when the
brand/cafe lookup failed, using a throwaway hash, so the response time does
not reveal whether the identifier matched a row.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.database import get_session
from app.models import Brand, Cafe, SubscriptionStatus
from app.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminProfile,
    BrandProfile,
    CafeProfile,
    StoreLoginRequest,
    StoreLoginResponse,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Constant-time decoy so admin/store login take roughly the same wall time
# whether or not the identifier matched a row. Generated once at import.
_DECOY_HASH = hash_password("decoy-not-a-real-password")


@router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(
    payload: AdminLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminLoginResponse:
    normalized_email = payload.email.strip().lower()

    result = await session.execute(
        select(Brand).where(func.lower(Brand.contact_email) == normalized_email)
    )
    brand = result.scalar_one_or_none()

    target_hash = brand.password_hash if brand and brand.password_hash else _DECOY_HASH
    password_ok = verify_password(payload.password, target_hash)

    if brand is None or not brand.password_hash or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = tokens.encode_admin(
        brand_id=str(brand.id),
        email=normalized_email,
        brand_name=brand.name,
    )
    return AdminLoginResponse(
        token=token,
        admin=AdminProfile(email=normalized_email),
        brand=BrandProfile.model_validate(brand),
    )


@router.post("/store/login", response_model=StoreLoginResponse)
async def store_login(
    payload: StoreLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> StoreLoginResponse:
    normalized_store_number = payload.store_number.strip().upper()

    result = await session.execute(
        select(Cafe).where(Cafe.store_number == normalized_store_number)
    )
    cafe = result.scalar_one_or_none()

    target_hash = cafe.pin_hash if cafe and cafe.pin_hash else _DECOY_HASH
    pin_ok = verify_password(payload.pin, target_hash)

    if cafe is None or not cafe.pin_hash or not pin_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid store number or PIN.",
        )

    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        # Orphaned cafe — treat as unknown rather than leaking the row.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid store number or PIN.",
        )

    if brand.subscription_status != SubscriptionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Brand subscription is '{brand.subscription_status.value}'; "
                "'active' required to sign in at the till."
            ),
        )

    token = tokens.encode_store(
        cafe_id=str(cafe.id),
        brand_id=str(brand.id),
        cafe_name=cafe.name,
        brand_name=brand.name,
        store_number=cafe.store_number or "",
    )
    return StoreLoginResponse(
        token=token,
        venue_api_key=str(cafe.id),
        store_number=cafe.store_number or "",
        cafe=CafeProfile.model_validate(cafe),
        brand=BrandProfile.model_validate(brand),
    )

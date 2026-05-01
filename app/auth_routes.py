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

import os
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.auth import get_super_admin_session
from app.database import get_session
from app.email_sender import send_password_reset_email
from app.models import (
    Brand,
    Cafe,
    NetworkLockEvent,
    PasswordResetToken,
    SubscriptionStatus,
    SuperAdmin,
)
from app.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminProfile,
    AdminSetupRequest,
    BrandProfile,
    CafeProfile,
    StoreLoginRequest,
    StoreLoginResponse,
    SuperAdminChangePasswordRequest,
    SuperAdminCreateRequest,
    SuperAdminLoginRequest,
    SuperAdminLoginResponse,
    SuperAdminProfile,
)
from app.security import hash_password, verify_password

# Cafe IP-pin cooldown — once a cafe is locked to an IP, a different IP
# is blocked for this many days. Super admin can reset early via
# POST /api/admin/platform/cafes/{id}/reset-network-lock.
NETWORK_LOCK_COOLDOWN = timedelta(days=30)


def _client_ip(request: Request) -> str:
    """Best-effort source IP. Honours `X-Forwarded-For` when present (we
    sit behind Nginx on the droplet) and falls back to the raw socket
    peer otherwise. Returns the literal "unknown" sentinel if both are
    missing so we never insert NULL into network_lock_events."""

    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        # XFF can be a comma-separated chain — the original client is the
        # leftmost entry.
        return fwd.split(",", 1)[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"

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


async def _brand_setup_impl(
    payload: AdminSetupRequest,
    session: AsyncSession,
) -> AdminLoginResponse:
    """Onboarding wizard — finalize a brand-invite into a usable admin login.

    The Super Admin "Invite admin" flow mints a brand-invite JWT (audience
    `brand-invite`) carrying `{brand_id, email}`. The recipient lands on
    `/setup?token=…`, picks a password, and POSTs here. We verify the
    invite, set `brand.password_hash`, and immediately mint a fresh admin
    session token so the wizard advances the user into the dashboard
    without a second round-trip through /admin/login.

    Shared between POST /api/auth/brand/setup (canonical) and
    POST /api/auth/admin/setup (deprecated alias kept so older clients
    don't 404 if they're cached against the previous path).
    """

    try:
        claims = tokens.decode(payload.token, audience="brand-invite")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This setup link has expired. Ask your admin to reissue it.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This setup link is invalid. Ask your admin to reissue it.",
        )

    raw_brand_id = claims.get("brand_id")
    if not raw_brand_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup link is missing a brand reference.",
        )
    try:
        brand_id = UUID(str(raw_brand_id))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup link carries an unrecognised brand reference.",
        )

    brand = await session.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand not found for this setup link.",
        )

    brand.password_hash = hash_password(payload.password)
    await session.commit()
    await session.refresh(brand)

    normalized_email = (brand.contact_email or "").strip().lower()
    admin_token = tokens.encode_admin(
        brand_id=str(brand.id),
        email=normalized_email,
        brand_name=brand.name,
    )
    return AdminLoginResponse(
        token=admin_token,
        admin=AdminProfile(email=normalized_email),
        brand=BrandProfile.model_validate(brand),
    )


@router.post("/brand/setup", response_model=AdminLoginResponse)
async def brand_setup(
    payload: AdminSetupRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminLoginResponse:
    return await _brand_setup_impl(payload, session)


@router.post("/admin/setup", response_model=AdminLoginResponse, deprecated=True)
async def admin_setup(
    payload: AdminSetupRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminLoginResponse:
    """Deprecated alias of /brand/setup. Kept so any cached frontend bundle
    still pointing at the old path keeps working."""
    return await _brand_setup_impl(payload, session)


@router.post("/super/change-password")
async def super_change_password(
    payload: SuperAdminChangePasswordRequest,
    super_admin = Depends(get_super_admin_session),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    """Rotate the signed-in super admin's password. Verifies the current
    password before applying the new hash so a stolen JWT can't be used
    to silently lock out the legitimate operator.
    """
    super_admin_row = await session.get(SuperAdmin, super_admin.super_admin_id)
    if super_admin_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Super-admin account not found.",
        )

    if not verify_password(payload.current_password, super_admin_row.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    super_admin_row.password_hash = hash_password(payload.new_password)
    await session.commit()
    return {"ok": True}


@router.post("/super/create", response_model=SuperAdminProfile)
async def super_create(
    payload: SuperAdminCreateRequest,
    _super_admin = Depends(get_super_admin_session),
    session: AsyncSession = Depends(get_session),
) -> SuperAdminProfile:
    """Add a co-founder / additional staff super admin. Requires an
    existing super-admin session — there's no bootstrap path here; the
    very first super admin lands via seed (see the temporary
    `scripts/seed_local_dev.py`).
    """
    normalized_email = payload.email.strip().lower()
    if "@" not in normalized_email or "." not in normalized_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="email must be a valid email address.",
        )

    existing = (
        await session.execute(
            select(SuperAdmin).where(func.lower(SuperAdmin.email) == normalized_email)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A super admin with that email already exists.",
        )

    new_super_admin = SuperAdmin(
        email=normalized_email,
        password_hash=hash_password(payload.password),
    )
    session.add(new_super_admin)
    await session.commit()
    return SuperAdminProfile(email=normalized_email)


@router.post("/super/login", response_model=SuperAdminLoginResponse)
async def super_login(
    payload: SuperAdminLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> SuperAdminLoginResponse:
    """Platform-staff login. Issues a JWT with aud="super-admin" used by the
    admin-dashboard to access /api/admin/platform/* routes guarded by
    `Depends(get_super_admin_session)`. Same uniform-401 + decoy-hash
    pattern as admin_login so the endpoint can't be used to probe whether
    a given email belongs to a staff account.
    """

    normalized_email = payload.email.strip().lower()

    result = await session.execute(
        select(SuperAdmin).where(func.lower(SuperAdmin.email) == normalized_email)
    )
    super_admin = result.scalar_one_or_none()

    target_hash = (
        super_admin.password_hash
        if super_admin and super_admin.password_hash
        else _DECOY_HASH
    )
    password_ok = verify_password(payload.password, target_hash)

    if super_admin is None or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = tokens.encode_super_admin(
        super_admin_id=str(super_admin.id),
        email=normalized_email,
    )
    return SuperAdminLoginResponse(
        token=token,
        admin=SuperAdminProfile(email=normalized_email),
    )


@router.post("/store/login", response_model=StoreLoginResponse)
async def store_login(
    payload: StoreLoginRequest,
    request: Request,
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

    # IP / network lock — pin a cafe's till to its source IP after the
    # first successful login. Subsequent logins from a different IP within
    # the 30-day cooldown are blocked with 403 + audited. After the
    # cooldown elapses, the lock auto-rolls over (the new IP becomes the
    # pin). Super admin can wipe the lock manually via the platform
    # endpoint.
    source_ip = _client_ip(request)
    now = datetime.now(timezone.utc)
    if cafe.last_known_ip and cafe.last_known_ip != source_ip:
        locked_at = cafe.network_locked_at or now
        if now - locked_at < NETWORK_LOCK_COOLDOWN:
            session.add(
                NetworkLockEvent(
                    cafe_id=cafe.id,
                    kind="mismatch",
                    attempted_ip=source_ip,
                    expected_ip=cafe.last_known_ip,
                )
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "This till is locked to a different network. Ask your "
                    "Local Coffee Perks administrator to reset the network "
                    "lock from the Super Admin dashboard."
                ),
            )

    # Successful login from this IP → (re)pin. We set network_locked_at
    # only when the IP actually changes so the cooldown clock starts the
    # first time we see a new IP, not on every poll.
    if cafe.last_known_ip != source_ip:
        cafe.last_known_ip = source_ip
        cafe.network_locked_at = now
        await session.commit()

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


# ─────────────────────────────────────────────────────────────────
# Brand-admin "Forgot password" — token-based reset, console-stub
# delivery (mirrors the consumer OTP delivery stub today).
# ─────────────────────────────────────────────────────────────────

# 60-minute single-use TTL. Long enough to survive a context switch
# (read email → click link → fill form), short enough to limit blast
# radius if the link leaks.
PASSWORD_RESET_TTL = timedelta(minutes=60)

# `FRONTEND_BASE_URL` is the b2b dashboard origin; the reset link is
# rendered as `${BASE}/reset-password?token=…`. The default keeps
# local dev working out of the box.
_FRONTEND_BASE_URL = (
    os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
)


class ForgotPasswordRequest(BaseModel):
    # Plain str (not EmailStr) so we don't need pydantic[email] +
    # email-validator in the deploy image. Surface-level shape is
    # enough — the lookup against brands.contact_email is the real
    # validation, and "looks like an email" doesn't matter once we're
    # already case-folding + comparing exact strings.
    email: str = Field(min_length=3, max_length=320)


class ForgotPasswordResponse(BaseModel):
    # Always reports success — the response is intentionally identical
    # whether the email matched a brand or not, so this endpoint can't
    # be used as an account-existence oracle.
    ok: bool = True


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=8, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class ResetPasswordResponse(BaseModel):
    ok: bool = True


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> ForgotPasswordResponse:
    normalized_email = payload.email.strip().lower()
    brand = (
        await session.execute(
            select(Brand).where(func.lower(Brand.contact_email) == normalized_email)
        )
    ).scalar_one_or_none()

    if brand is not None:
        # Generate 32 bytes of URL-safe entropy. We hash it before
        # storing so a DB read doesn't hand an attacker a working link;
        # the raw token only ever lives in the printed reset URL.
        raw_token = secrets.token_urlsafe(32)
        token_row = PasswordResetToken(
            brand_id=brand.id,
            token_hash=hash_password(raw_token),
            expires_at=datetime.now(timezone.utc) + PASSWORD_RESET_TTL,
        )
        session.add(token_row)
        await session.commit()

        reset_url = f"{_FRONTEND_BASE_URL}/reset-password?token={raw_token}"
        # Real SMTP via app.email_sender. Failure falls back to stdout
        # stub inside send_email so the operator can hand-deliver if
        # transport is broken; the API still responds 200 either way
        # (response shape is intentionally identical regardless of
        # delivery success — see ForgotPasswordResponse).
        send_password_reset_email(
            to_email=normalized_email,
            brand_name=brand.name,
            reset_url=reset_url,
        )

    # Same shape regardless of brand presence — see ForgotPasswordResponse.
    return ForgotPasswordResponse()


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> ResetPasswordResponse:
    # Pull the most recent unused, unexpired token across all brands and
    # bcrypt-verify the supplied plaintext against each candidate's
    # token_hash. Bcrypt verify is intentionally slow, so we cap the
    # candidate window at the 50 most recently issued tokens — way more
    # than realistic concurrent reset traffic, but a hard ceiling on the
    # CPU cost of an attacker firing junk tokens.
    now = datetime.now(timezone.utc)
    rows = (
        await session.execute(
            select(PasswordResetToken)
            .where(PasswordResetToken.used_at.is_(None))
            .where(PasswordResetToken.expires_at > now)
            .order_by(PasswordResetToken.created_at.desc())
            .limit(50)
        )
    ).scalars().all()

    matched: PasswordResetToken | None = None
    for row in rows:
        if verify_password(payload.token, row.token_hash):
            matched = row
            break

    if matched is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )

    brand = await session.get(Brand, matched.brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )

    brand.password_hash = hash_password(payload.new_password)
    matched.used_at = now
    await session.commit()
    return ResetPasswordResponse()

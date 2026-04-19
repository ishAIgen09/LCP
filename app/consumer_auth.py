"""Consumer App (Phase 4) passwordless auth — email + 4-digit OTP.

Two routes:
  - POST /api/consumer/auth/request-otp  → generates + emails (for now: prints)
    a 4-digit code. If first_name + last_name are present and the email is
    unknown, a new Consumer row (the existing `users` table; see MEMORY.md)
    is created on the fly with a fresh 6-alphanumeric `till_code` that
    doubles as the consumer_id the QR encodes.
  - POST /api/consumer/auth/verify-otp   → validates the code, invalidates it,
    and returns a signed consumer JWT + profile.

Storage: `consumer_otps` table (see models.sql). Codes are bcrypt-hashed, not
stored in the clear. `expires_at` = now + OTP_TTL_MINUTES. Each verify bumps
`attempts` to cap brute force. Successful verify sets `used_at` so the same
row can't be replayed.

Email delivery is intentionally out of scope — for dev we print the code to
the server stdout so the QA loop works without SMTP. When we wire SES/Postmark
the only code change is inside `_send_otp_email`.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.database import get_session
from app.models import ConsumerOTP, User
from app.schemas import (
    ConsumerAuthResponse,
    ConsumerProfile,
    ConsumerRequestOTP,
    ConsumerRequestOTPResponse,
    ConsumerVerifyOTP,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/consumer/auth", tags=["consumer-auth"])

OTP_TTL_MINUTES = 10
MAX_OTP_ATTEMPTS = 5
TILL_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

# Decoy hash for timing-safe verification when the email / code lookup misses.
_DECOY_HASH = hash_password("decoy-not-a-real-otp")


def _generate_otp() -> str:
    # secrets.randbelow is cryptographically sound and avoids the bias of
    # ``randint`` on non-power-of-ten ranges.
    return f"{secrets.randbelow(10000):04d}"


def _generate_till_code() -> str:
    return "".join(secrets.choice(TILL_CODE_ALPHABET) for _ in range(6))


async def _unique_till_code(session: AsyncSession, max_attempts: int = 16) -> str:
    for _ in range(max_attempts):
        candidate = _generate_till_code()
        existing = (
            await session.execute(select(User.id).where(User.till_code == candidate))
        ).scalar_one_or_none()
        if existing is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not allocate a unique consumer ID. Please retry.",
    )


def _send_otp_email(email: str, code: str) -> None:
    # Dev stub: prints to stdout. Replace with SES / Postmark / etc. later.
    # The surrounding dashes make the code easy to grep for in uvicorn logs.
    print(f"\n--- CONSUMER OTP ---\n  to:   {email}\n  code: {code}\n--------------------\n", flush=True)


@router.post("/request-otp", response_model=ConsumerRequestOTPResponse)
async def request_otp(
    payload: ConsumerRequestOTP,
    session: AsyncSession = Depends(get_session),
) -> ConsumerRequestOTPResponse:
    normalized_email = payload.email.strip().lower()

    # Either find the existing consumer OR create one if we have names.
    user_row = (
        await session.execute(
            select(User).where(func.lower(User.email) == normalized_email)
        )
    ).scalar_one_or_none()

    if user_row is None:
        # No consumer yet. A sign-up payload (names present) is the only
        # legitimate way to create one here; a log-in payload for a missing
        # email fails CLOSED so we don't silently register an empty row.
        if not (payload.first_name and payload.last_name):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "We couldn't find an account for that email. "
                    "Try signing up instead."
                ),
            )
        till_code = await _unique_till_code(session)
        user_row = User(
            email=normalized_email,
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            till_code=till_code,
            barcode=secrets.token_hex(12),
        )
        session.add(user_row)
        await session.flush()

    # Always (re)issue a fresh OTP. Previous rows for the same email stay in
    # the table but their `used_at` is unaffected — the verify path filters
    # on `expires_at` + `used_at IS NULL` and picks the most recent.
    code = _generate_otp()
    otp_row = ConsumerOTP(
        email=normalized_email,
        code_hash=hash_password(code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
    )
    session.add(otp_row)
    await session.commit()

    _send_otp_email(normalized_email, code)

    return ConsumerRequestOTPResponse(ok=True, debug_code=None)


@router.post("/verify-otp", response_model=ConsumerAuthResponse)
async def verify_otp(
    payload: ConsumerVerifyOTP,
    session: AsyncSession = Depends(get_session),
) -> ConsumerAuthResponse:
    normalized_email = payload.email.strip().lower()
    now = datetime.now(timezone.utc)

    otp_row = (
        await session.execute(
            select(ConsumerOTP)
            .where(func.lower(ConsumerOTP.email) == normalized_email)
            .where(ConsumerOTP.used_at.is_(None))
            .where(ConsumerOTP.expires_at > now)
            .where(ConsumerOTP.attempts < MAX_OTP_ATTEMPTS)
            .order_by(ConsumerOTP.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    target_hash = otp_row.code_hash if otp_row else _DECOY_HASH
    code_ok = verify_password(payload.code, target_hash)

    if otp_row is None or not code_ok:
        if otp_row is not None:
            otp_row.attempts = (otp_row.attempts or 0) + 1
            await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is invalid or has expired. Request a new one.",
        )

    user_row = (
        await session.execute(
            select(User).where(func.lower(User.email) == normalized_email)
        )
    ).scalar_one_or_none()
    if user_row is None:
        # Should not happen — request-otp only issues codes once a User exists —
        # but fail safe rather than minting a token pointing at nothing.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Try signing up.",
        )

    otp_row.used_at = now
    await session.commit()

    token = tokens.encode_consumer(
        user_id=str(user_row.id),
        consumer_id=user_row.till_code,
        email=normalized_email,
        first_name=user_row.first_name,
        last_name=user_row.last_name,
    )
    return ConsumerAuthResponse(
        token=token,
        consumer=ConsumerProfile(
            consumer_id=user_row.till_code,
            first_name=user_row.first_name,
            last_name=user_row.last_name,
            email=user_row.email,
        ),
    )

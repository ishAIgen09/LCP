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
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.auth import ConsumerSession, get_consumer_session
from app.database import get_session
from app.models import (
    Cafe,
    ConsumerOTP,
    GlobalLedger,
    GlobalLedgerAction,
    Offer,
    StampLedger,
    User,
)
from app.schemas import (
    ConsumerAuthResponse,
    ConsumerBalanceResponse,
    ConsumerCafePayload,
    ConsumerOfferPayload,
    ConsumerProfile,
    ConsumerRequestOTP,
    ConsumerRequestOTPResponse,
    ConsumerVerifyOTP,
    LatestEarnPayload,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/consumer/auth", tags=["consumer-auth"])
consumer_router = APIRouter(prefix="/api/consumer", tags=["consumer"])

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
    # FORCED LOG — fires before anything else so we can prove the route was
    # reached even if validation / DB work fails later. Pydantic has already
    # parsed `payload` by this point, so `payload.email` is safe to read; if
    # FastAPI returns 422 before this runs, we never get here at all, which
    # is itself a useful signal.
    email = payload.email
    print("\n🚨 OTP REQUEST RECEIVED FOR:", email, "\n", flush=True)

    normalized_email = email.strip().lower()

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
    # TEMP DEV SHIM (2026-04-19): hardcode 1234 for saeed@test.com so the
    # end-to-end scanner loop can be exercised without chasing OTP prints.
    # Remove before any deploy — it trivially defeats the OTP.
    if normalized_email == "saeed@test.com":
        code = "1234"
    else:
        code = _generate_otp()
    otp_row = ConsumerOTP(
        email=normalized_email,
        code_hash=hash_password(code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
    )
    session.add(otp_row)
    await session.commit()

    _send_otp_email(normalized_email, code)

    # Explicit single-line target for grepping uvicorn logs. Keep alongside
    # the banner above so it survives if the banner helper gets refactored.
    print(f"--- OTP for {normalized_email}: {code} ---", flush=True)

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


# Home-screen polling endpoint. Returns the consumer's raw cross-cafe stamp
# balance — the same SUM(stamp_delta) that the B2B scan flow manipulates. With
# auto-rollover in /api/b2b/scan, this value naturally stays in 0..9, and the
# mobile app reads it as the "progress to the next free drink" counter.
REWARD_THRESHOLD = 10


@consumer_router.get("/me/balance", response_model=ConsumerBalanceResponse)
async def consumer_balance(
    consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> ConsumerBalanceResponse:
    raw_balance = int(
        (
            await session.execute(
                select(func.coalesce(func.sum(StampLedger.stamp_delta), 0)).where(
                    StampLedger.customer_id == consumer.user_id
                )
            )
        ).scalar_one()
    )

    # Pick up the latest EARNED global_ledger row + its cafe. The mobile app
    # uses this transaction_id as a fire-once key for the celebratory modal.
    # `consumer_id` on global_ledger is the till_code (CHAR(6)), not the UUID.
    latest_earn_row = (
        await session.execute(
            select(GlobalLedger, Cafe)
            .join(Cafe, Cafe.id == GlobalLedger.venue_id)
            .where(
                GlobalLedger.consumer_id == consumer.consumer_id,
                GlobalLedger.action_type == GlobalLedgerAction.EARNED,
            )
            .order_by(GlobalLedger.timestamp.desc())
            .limit(1)
        )
    ).first()

    latest_earn: LatestEarnPayload | None = None
    if latest_earn_row is not None:
        earn, cafe = latest_earn_row
        # A rollover is a REDEEMED row committed in the same scan transaction
        # as the EARNED row. `now()` in Postgres returns the transaction start
        # time, so the two rows share an identical `timestamp` — equality is a
        # reliable same-scan check here.
        redeemed_hit = (
            await session.execute(
                select(GlobalLedger.transaction_id).where(
                    GlobalLedger.consumer_id == consumer.consumer_id,
                    GlobalLedger.venue_id == earn.venue_id,
                    GlobalLedger.action_type == GlobalLedgerAction.REDEEMED,
                    GlobalLedger.timestamp == earn.timestamp,
                )
            )
        ).first()
        latest_earn = LatestEarnPayload(
            transaction_id=earn.transaction_id,
            cafe_name=cafe.name,
            cafe_address=cafe.address,
            stamps_earned=earn.quantity,
            free_drink_unlocked=redeemed_hit is not None,
            timestamp=earn.timestamp,
        )

    return ConsumerBalanceResponse(
        consumer_id=consumer.consumer_id,
        stamp_balance=raw_balance,
        threshold=REWARD_THRESHOLD,
        latest_earn=latest_earn,
    )


# Discover feed. One row per cafe across every brand that's enrolled, paired
# with the cafe's amenities and the brand's currently-live offers (window
# strictly contains `now()`). Consumer-auth'd — an anonymous visitor shouldn't
# be able to scrape the cafe directory.
@consumer_router.get("/cafes", response_model=list[ConsumerCafePayload])
async def consumer_cafes(
    _consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> list[ConsumerCafePayload]:
    cafe_rows = (
        await session.execute(select(Cafe).order_by(Cafe.name.asc()))
    ).scalars().all()

    brand_ids = {cafe.brand_id for cafe in cafe_rows}
    offers_by_brand: dict[uuid.UUID, list[ConsumerOfferPayload]] = {}
    if brand_ids:
        now = datetime.now(timezone.utc)
        live_offers = (
            await session.execute(
                select(Offer)
                .where(
                    Offer.brand_id.in_(brand_ids),
                    Offer.starts_at <= now,
                    Offer.ends_at > now,
                )
                .order_by(Offer.ends_at.asc())
            )
        ).scalars().all()
        for offer in live_offers:
            offers_by_brand.setdefault(offer.brand_id, []).append(
                ConsumerOfferPayload(
                    id=offer.id,
                    offer_type=offer.offer_type,
                    target=offer.target,
                    amount=offer.amount,
                    starts_at=offer.starts_at,
                    ends_at=offer.ends_at,
                )
            )

    return [
        ConsumerCafePayload(
            id=cafe.id,
            name=cafe.name,
            address=cafe.address,
            phone=cafe.phone,
            food_hygiene_rating=cafe.food_hygiene_rating,
            amenities=list(cafe.amenities or []),
            live_offers=offers_by_brand.get(cafe.brand_id, []),
        )
        for cafe in cafe_rows
    ]

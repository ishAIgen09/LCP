from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    OFFER_TARGETS,
    OFFER_TYPES,
    SchemeType,
    SubscriptionStatus,
)


class BrandCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    contact_email: str = Field(min_length=3)
    scheme_type: SchemeType = SchemeType.GLOBAL


class BrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    contact_email: str
    scheme_type: SchemeType
    subscription_status: SubscriptionStatus
    created_at: datetime


# UK Food Hygiene Rating — the allow-list is authoritative and mirrored in:
#   migrations/0007  (CHECK constraint)
#   b2b-dashboard/src/components/AddLocationDialog  (dropdown)
#   consumer-app/src/FoodHygieneBadge  (switch-case render)
FoodHygieneRating = Literal["1", "2", "3", "4", "5", "Awaiting Inspection"]


class CafeCreate(BaseModel):
    # brand_id intentionally absent — derived from the admin session's JWT.
    # slug + contact_email are optional: if not provided the backend generates
    # them from the brand. store_number / pin are optional — set them now to
    # make the cafe immediately loginable from the POS, or leave NULL and
    # issue them later through a separate flow.
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]+$")
    contact_email: str | None = Field(default=None, min_length=3)
    store_number: str | None = Field(
        default=None, min_length=3, max_length=10, pattern=r"^[A-Za-z0-9]+$"
    )
    pin: str | None = Field(default=None, min_length=4, max_length=8, pattern=r"^\d+$")
    phone: str | None = Field(default=None, max_length=40)
    food_hygiene_rating: FoodHygieneRating = "Awaiting Inspection"


class CafeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    name: str
    slug: str
    address: str
    contact_email: str
    store_number: str | None
    phone: str | None = None
    food_hygiene_rating: FoodHygieneRating = "Awaiting Inspection"
    amenities: list[str] = Field(default_factory=list)
    created_at: datetime


class CafeUpdate(BaseModel):
    # Partial-update payload — any omitted / `None` field is ignored. Used by
    # the b2b dashboard's Edit Location dialog to change a cafe's address,
    # phone, and/or hygiene rating after creation. Amenities still go through
    # the dedicated PUT /amenities endpoint so this payload stays flat.
    address: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    food_hygiene_rating: FoodHygieneRating | None = None


class CafeAmenitiesUpdate(BaseModel):
    # Enforced at the API layer, not the DB (see models.py comment on
    # Cafe.amenities). Duplicate ids are collapsed on write.
    amenities: list[str] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def _strip_and_validate(self) -> "CafeAmenitiesUpdate":
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in self.amenities:
            if not isinstance(raw, str):
                continue
            value = raw.strip()
            if not value or value in seen:
                continue
            seen.add(value)
            cleaned.append(value)
        self.amenities = cleaned
        return self


class UserCreate(BaseModel):
    till_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{6}$")
    barcode: str | None = Field(default=None, min_length=1)
    email: str | None = None
    display_name: str | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    till_code: str
    barcode: str
    email: str | None
    display_name: str | None
    created_at: datetime


class BalanceResponse(BaseModel):
    user_id: UUID
    stamp_balance: int


class StampRequest(BaseModel):
    user_id: UUID | None = None
    till_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{6}$")
    barista_id: UUID | None = None

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "StampRequest":
        if (self.user_id is None) == (self.till_code is None):
            raise ValueError("Provide exactly one of user_id or till_code")
        return self


class StampResponse(BaseModel):
    user_id: UUID
    stamp_balance: int
    reward_earned: bool
    ledger_entry_id: UUID


class RedeemRequest(StampRequest):
    pass


class RedeemResponse(BaseModel):
    user_id: UUID
    stamp_balance: int
    redeemed: bool
    ledger_entry_id: UUID


class CheckoutRequest(BaseModel):
    brand_id: UUID


class CheckoutResponse(BaseModel):
    checkout_url: str


class AdminLoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class StoreLoginRequest(BaseModel):
    store_number: str = Field(min_length=3, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class AdminProfile(BaseModel):
    email: str


class BrandProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    contact_email: str
    scheme_type: SchemeType
    subscription_status: SubscriptionStatus
    current_period_end: datetime | None = None


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, min_length=1, pattern=r"^[a-z0-9-]+$")
    contact_email: str | None = Field(default=None, min_length=3)
    scheme_type: SchemeType | None = None


class AdminMeResponse(BaseModel):
    admin: "AdminProfile"
    brand: BrandProfile


class CafeScans(BaseModel):
    cafe_id: UUID
    scans_30d: int


class MetricsResponse(BaseModel):
    total_scans_30d: int
    total_scans_prev_30d: int
    active_cafes: int
    total_cafes: int
    per_cafe_30d: list[CafeScans]
    renews_at: datetime | None = None


class CafeProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    name: str
    slug: str
    address: str
    store_number: str | None = None


class AdminSession(BaseModel):
    brand_id: UUID
    email: str
    brand_name: str


class AdminLoginResponse(BaseModel):
    token: str
    admin: AdminProfile
    brand: BrandProfile


class StoreLoginResponse(BaseModel):
    token: str
    venue_api_key: str
    store_number: str
    cafe: CafeProfile
    brand: BrandProfile


# -----------------------------------------------------------------------------
# Consumer App (Phase 4) — email + 4-digit OTP passwordless auth
# -----------------------------------------------------------------------------


class ConsumerRequestOTP(BaseModel):
    # Sign-up: first_name + last_name + email. Log-in: email only.
    # If first_name / last_name are present and the email is unknown, a new
    # consumer is created on the spot. If the email already exists, the names
    # (if provided) are IGNORED — log-in wins, to avoid a signup form that
    # silently clobbers a returning consumer's name.
    email: str = Field(min_length=3, max_length=254)
    first_name: str | None = Field(default=None, min_length=1, max_length=60)
    last_name: str | None = Field(default=None, min_length=1, max_length=60)


class ConsumerRequestOTPResponse(BaseModel):
    ok: bool = True
    # Only populated when the email prints-to-terminal dev path fired,
    # so the client can display the code in a debug overlay if it chooses.
    # In production this MUST stay None — it would defeat the point of OTP.
    debug_code: str | None = None


class ConsumerVerifyOTP(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class ConsumerProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    consumer_id: str  # mirrors User.till_code
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None


class ConsumerAuthResponse(BaseModel):
    token: str
    consumer: ConsumerProfile


class LatestEarnPayload(BaseModel):
    transaction_id: UUID
    cafe_name: str
    cafe_address: str
    stamps_earned: int
    free_drink_unlocked: bool
    timestamp: datetime


class ConsumerBalanceResponse(BaseModel):
    consumer_id: str
    stamp_balance: int
    threshold: int
    # Set to the most recent EARNED global_ledger row for this consumer, or
    # None if they've never been stamped. The mobile app diffs
    # `latest_earn.transaction_id` across polls and fires the reward modal
    # when it changes — server-authoritative so auto-rollover (which
    # *decreases* stamp_balance) still triggers a celebration.
    latest_earn: LatestEarnPayload | None = None


# -----------------------------------------------------------------------------
# B2B Scan — Hub & Spoke POS endpoint with auto-rollover + Shadow Ledger
# -----------------------------------------------------------------------------


class B2BScanRequest(BaseModel):
    consumer_id: str = Field(pattern=r"^[A-Z0-9]{6}$")
    venue_id: UUID
    quantity: int = Field(ge=1, le=20)


class B2BScanResponse(BaseModel):
    consumer_id: str
    venue_id: UUID
    stamps_earned: int
    free_drinks_unlocked: int
    new_balance: int
    earned_transaction_id: UUID
    redeemed_transaction_id: UUID | None = None


# -----------------------------------------------------------------------------
# Offers (promotions) — brand-scoped windows, mirrored from b2b-dashboard
# -----------------------------------------------------------------------------


OfferTypeLiteral = Literal["percent", "fixed", "bogo", "double_stamps"]
OfferTargetLiteral = Literal[
    "any_drink", "all_pastries", "food", "merchandise", "entire_order"
]


def _validate_offer_payload(
    offer_type: str,
    target: str,
    amount: Decimal | None,
    starts_at: datetime,
    ends_at: datetime,
) -> None:
    if offer_type not in OFFER_TYPES:
        raise ValueError(f"Unknown offer type '{offer_type}'.")
    if target not in OFFER_TARGETS:
        raise ValueError(f"Unknown offer target '{target}'.")
    if offer_type in ("percent", "fixed"):
        if amount is None or amount <= 0:
            raise ValueError("This offer type requires a positive amount.")
        if offer_type == "percent" and amount > 100:
            raise ValueError("Percent offers can't exceed 100%.")
    elif amount is not None:
        raise ValueError(
            "Bogo / double_stamps offers must not carry an amount."
        )
    if ends_at <= starts_at:
        raise ValueError("ends_at must be strictly after starts_at.")


class OfferCreate(BaseModel):
    offer_type: OfferTypeLiteral
    target: OfferTargetLiteral
    amount: Decimal | None = None
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def _check(self) -> "OfferCreate":
        _validate_offer_payload(
            self.offer_type, self.target, self.amount, self.starts_at, self.ends_at
        )
        return self


class OfferUpdate(BaseModel):
    offer_type: OfferTypeLiteral
    target: OfferTargetLiteral
    amount: Decimal | None = None
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def _check(self) -> "OfferUpdate":
        _validate_offer_payload(
            self.offer_type, self.target, self.amount, self.starts_at, self.ends_at
        )
        return self


class OfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    offer_type: str
    target: str
    amount: Decimal | None
    starts_at: datetime
    ends_at: datetime
    created_at: datetime


# -----------------------------------------------------------------------------
# Consumer Discover — cafes with amenities + currently-live offers
# -----------------------------------------------------------------------------


class ConsumerOfferPayload(BaseModel):
    id: UUID
    offer_type: str
    target: str
    amount: Decimal | None
    starts_at: datetime
    ends_at: datetime


class ConsumerCafePayload(BaseModel):
    id: UUID
    name: str
    address: str
    phone: str | None = None
    food_hygiene_rating: FoodHygieneRating = "Awaiting Inspection"
    amenities: list[str] = Field(default_factory=list)
    live_offers: list[ConsumerOfferPayload] = Field(default_factory=list)

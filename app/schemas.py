from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import SchemeType, SubscriptionStatus


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


class CafeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    name: str
    slug: str
    address: str
    contact_email: str
    store_number: str | None
    created_at: datetime


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

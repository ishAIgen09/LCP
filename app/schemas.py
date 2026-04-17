from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import SubscriptionStatus


class CafeCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    contact_email: str = Field(min_length=3)


class CafeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    contact_email: str
    subscription_status: SubscriptionStatus
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
    cafe_id: UUID
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

from collections.abc import AsyncIterator

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Settings(BaseSettings):
    database_url: str
    # Stripe is split into 5 distinct env vars:
    #   secret      — server-side API auth (sk_test_… / sk_live_…)
    #   publishable — surfaced to the client if/when we ever embed Stripe
    #                 Elements directly. Not used today; kept here so the
    #                 .env / .env.example layout stays in sync with reality.
    #   webhook     — signing secret for /api/billing/webhook
    #   private/global price ids — fixed monthly recurring prices the
    #                 Checkout Session quotes against. When unset, the
    #                 checkout falls back to inline price_data (legacy
    #                 £5/mo path) so local dev without a Stripe dashboard
    #                 still works end-to-end.
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_private_price_id: str | None = None
    stripe_global_price_id: str | None = None
    debug_skip_stripe_sig: bool = False

    # Auth — JWT signing key. Override in .env before any non-local use.
    jwt_secret: str = "dev-secret-change-me"
    jwt_ttl_hours: int = 12

    # Where the React Business App is served from. Used to build Stripe
    # Checkout success / cancel redirect URLs.
    frontend_base_url: str = "http://localhost:5173"

    # CORS — comma-separated origins, or "*" for any origin (dev default).
    # Widened 2026-04-18 so the native Consumer App running on a physical
    # phone (which fetches from http://<LAN_IP>:8000) is accepted without
    # enumerating every dev machine's IP. Tighten to an explicit allowlist
    # before any non-local deploy.
    cors_origins: str = "*"

    # Super-admin AI assistant. Optional: if unset the /ai-agent endpoint
    # returns a friendly "add your key" message instead of a 500, so the
    # widget stays usable during early dev without a paid key on hand.
    # Model is kept configurable so we can swap between gpt-4o-mini,
    # gpt-3.5-turbo, or a future cheaper option without code changes.
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, future=True, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session

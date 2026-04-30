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

    # Where the React Business App is served from. Used to build:
    #   · Stripe Checkout success / cancel redirect URLs (billing.py)
    #   · Stripe Customer Portal return URL (billing.py)
    #   · Brand-invite email's "Set up your account" CTA (main.py)
    #   · Password-reset email link (auth_routes.py)
    #
    # Defaults to PROD because transactional emails go to real recipients
    # whose browsers can't reach a developer's localhost. For local-only
    # dev (where you actually want Stripe to redirect back to your laptop
    # and invite links to point at your local b2b-dashboard), override
    # via .env:
    #     FRONTEND_BASE_URL=http://localhost:5173
    frontend_base_url: str = "https://dashboard.localcoffeeperks.com"

    # CORS — comma-separated origins, or "*" for any origin (dev default).
    # Widened 2026-04-18 so the native Consumer App running on a physical
    # phone (which fetches from http://<LAN_IP>:8000) is accepted without
    # enumerating every dev machine's IP. Tighten to an explicit allowlist
    # before any non-local deploy.
    cors_origins: str = "*"

    # SMTP — Google Workspace (smtp.gmail.com) by default. Set
    # SMTP_PASSWORD to a Google App Password (NOT the workspace login
    # password) generated at myaccount.google.com → Security →
    # App Passwords. When SMTP_PASSWORD is empty, app.email_sender falls
    # back to a stdout stub so local dev keeps working without creds.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 465
    smtp_use_ssl: bool = True
    smtp_username: str = "hello@localcoffeeperks.com"
    smtp_password: str | None = None
    smtp_from: str = "Local Coffee Perks <hello@localcoffeeperks.com>"

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

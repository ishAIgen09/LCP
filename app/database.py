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
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
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

"""Seed the canonical platform Super Admin login.

Inserts (or updates) `admin@localcoffeeperks.com` in the `super_admins`
table with a fresh bcrypt hash of `admin123`, so the admin-dashboard
login flow (POST /api/auth/super/login) works against the canonical
staff account.

Idempotent: if the row already exists (UNIQUE on email), the password
hash is overwritten in place — re-running is safe and self-healing.
A new salt is generated on every call, so the stored hash differs
each run even though the plaintext is the same.

Usage (against the docker-compose db, from the host):

    docker compose exec -T api python -m scripts.seed_admin

Or directly with a DATABASE_URL set:

    python -m scripts.seed_admin

The plaintext password is intentionally hard-coded so the admin can
log in immediately and rotate it from the Settings tab. Do not commit
a different password here.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import SuperAdmin
from app.security import hash_password


ADMIN_EMAIL = "admin@localcoffeeperks.com"
ADMIN_PASSWORD = "admin123"


async def main() -> int:
    pw_hash = hash_password(ADMIN_PASSWORD)
    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(SuperAdmin).where(SuperAdmin.email == ADMIN_EMAIL)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            session.add(SuperAdmin(email=ADMIN_EMAIL, password_hash=pw_hash))
            action = "inserted"
        else:
            row.password_hash = pw_hash
            action = "password reset for existing"
        await session.commit()
    print(
        f"[seed-admin] {action} {ADMIN_EMAIL} — "
        f"login with password: {ADMIN_PASSWORD}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

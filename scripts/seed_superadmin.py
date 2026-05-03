"""Restore the founder's Super Admin login after a database purge.

Inserts (or updates) `ishagupta09@gmail.com` in the `super_admins` table
with a fresh bcrypt hash of `admin123`, so the admin-dashboard login flow
(POST /api/auth/super/login) starts working again.

Idempotent: if the row already exists (UNIQUE on email), the password
hash is overwritten in place — re-running is safe and self-healing.
A new salt is generated on every call, so the stored hash differs each
run even though the plaintext is the same.

Usage (against the docker-compose db, from the host):

    docker compose exec -T api python -m scripts.seed_superadmin

Or directly with a DATABASE_URL set:

    python -m scripts.seed_superadmin

This is a one-shot recovery tool. The plaintext password is intentionally
hard-coded so the founder can log in immediately and rotate it from the
Settings tab. Do not commit a different password here.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import SuperAdmin
from app.security import hash_password


SUPER_ADMIN_EMAIL = "ishagupta09@gmail.com"
SUPER_ADMIN_PASSWORD = "admin123"


async def main() -> int:
    pw_hash = hash_password(SUPER_ADMIN_PASSWORD)
    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(SuperAdmin).where(SuperAdmin.email == SUPER_ADMIN_EMAIL)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            session.add(
                SuperAdmin(email=SUPER_ADMIN_EMAIL, password_hash=pw_hash)
            )
            action = "inserted"
        else:
            row.password_hash = pw_hash
            action = "password reset for existing"
        await session.commit()
    print(
        f"[seed-superadmin] {action} {SUPER_ADMIN_EMAIL} — "
        f"login with password: {SUPER_ADMIN_PASSWORD}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

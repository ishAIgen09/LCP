"""Apply a single .sql migration against the configured DATABASE_URL.

Usage:
    python -m scripts.apply_migration migrations/0005_add_amenities_and_offers.sql

Executes the file's contents as one asyncpg simple query (multi-statement),
so `BEGIN; ... COMMIT;` wrappers and plain `;`-terminated statements both work.
Idempotent migrations (IF NOT EXISTS / DO blocks) can be re-applied safely.
"""

from __future__ import annotations

import asyncio
import pathlib
import sys

import asyncpg

from app.database import settings


def _to_asyncpg_dsn(url: str) -> str:
    # SQLAlchemy uses "postgresql+asyncpg://..."; asyncpg's connect() wants
    # either a bare "postgresql://..." or the dict form. Strip the driver tag.
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _apply(path: pathlib.Path) -> None:
    sql = path.read_text(encoding="utf-8")
    dsn = _to_asyncpg_dsn(settings.database_url)
    conn = await asyncpg.connect(dsn)
    try:
        print(f"[migrate] applying {path.name}")
        await conn.execute(sql)
        print(f"[migrate] done: {path.name}")
    finally:
        await conn.close()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.apply_migration <path-to-sql>")
        return 2
    target = pathlib.Path(sys.argv[1])
    if not target.is_file():
        print(f"[migrate] not found: {target}")
        return 1
    asyncio.run(_apply(target))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

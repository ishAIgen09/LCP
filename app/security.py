"""Password / PIN hashing for the Business App login flow.

Uses bcrypt directly (simpler and more reliable on Python 3.14 than passlib).
`hash_password` generates a fresh salt per call; `verify_password` is constant
time against the provided hash and swallows malformed-hash errors so we fail
closed instead of leaking a traceback to the client.

The same two functions are used for both admin passwords and store PINs —
a PIN is just a short password here. bcrypt has a 72-byte input ceiling,
which is fine for PINs (4–8 digits) and our admin passwords (far below 72 B).
"""

from __future__ import annotations

import bcrypt


def hash_password(password: str) -> str:
    if not isinstance(password, str) or password == "":
        raise ValueError("password must be a non-empty string")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False

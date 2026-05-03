"""Text-to-SQL Data Assistant for the Super Admin dashboard.

Sibling to `/api/admin/platform/ai-agent` (which is a curated chat with
hand-picked live metrics injected into the system prompt). This module
implements the broader Text-to-SQL flow:

    plain English → LLM → SQL → READ-ONLY execute → LLM summary → JSON

Defense in depth (in order of failure mode the bug class would produce):

  1. **Auth.** Same `Depends(get_super_admin_session)` guard as every
     other `/api/admin/platform/*` route. No anon access ever.

  2. **Static SQL allow-list.** The string the LLM emits MUST start
     with `SELECT` or `WITH` (case-insensitive). Any forbidden
     keyword anywhere in the body — INSERT/UPDATE/DELETE/DROP/ALTER/
     TRUNCATE/GRANT/REVOKE/CREATE/MERGE/COPY/EXECUTE/CALL/VACUUM/
     ANALYZE/REINDEX/CLUSTER/DISCARD/LOAD — is rejected. Word-boundary
     regex so legitimate column names like `created_at` don't false-
     trigger. Multi-statement (semicolon-then-non-whitespace) also
     rejected.

  3. **DB-level read-only enforcement.** Even if (2) somehow lets a
     mutation through, we wrap the query in a fresh transaction and
     `SET TRANSACTION READ ONLY` BEFORE executing. Postgres aborts
     any DML attempt inside a read-only txn (SQLSTATE 25006). Belt-
     and-braces because the LLM is non-deterministic and the static
     check is a regex.

  4. **Row cap.** Result truncated to MAX_ROWS_RETURNED before
     returning to the frontend, so a `SELECT * FROM stamp_ledger`
     doesn't ship 100k rows over the wire. The summary LLM only
     sees the first 50 rows for token-cost reasons.

The endpoint deliberately exposes the executed SQL in the response so
the Super Admin can audit what the LLM did. Frontend ChatWidget shows
a small "based on N rows" footer + an expandable that prints the SQL.
"""

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SuperAdminSession, get_super_admin_session
from app.database import get_session, settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/platform", tags=["super-admin-ai-sql"])


# ─── Schema context ────────────────────────────────────────────────────
# Hand-curated, deliberately compact. The LLM gets enum values + the
# columns it needs to answer common operator questions; rare audit
# columns are omitted to save tokens. Updated when migrations land that
# add a column the founder is likely to query against (cancel_at_period
# _end, suspended_coffee_enabled, etc.).
_SCHEMA_CONTEXT = """\
TABLES (Postgres 14+):

brands(
  id UUID PK,
  name TEXT,
  slug TEXT UNIQUE,
  contact_email TEXT UNIQUE,
  scheme_type ENUM('private','global'),
  subscription_status ENUM('active','trialing','past_due','canceled',
                           'incomplete','pending_cancellation'),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  owner_first_name TEXT, owner_last_name TEXT, owner_phone TEXT,
  company_legal_name TEXT, company_address TEXT,
  company_registration_number TEXT,
  created_at TIMESTAMPTZ
)

cafes(
  id UUID PK,
  brand_id UUID FK→brands.id,
  name TEXT, slug TEXT, address TEXT, contact_email TEXT,
  phone TEXT, store_number TEXT,
  food_hygiene_rating TEXT,
  amenities TEXT[],
  billing_status ENUM(same as brands.subscription_status),
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  suspended_coffee_enabled BOOLEAN,
  created_at TIMESTAMPTZ
)

users(
  id UUID PK,
  till_code CHAR(6) UNIQUE,    -- the 6-char QR code on every customer's app
  barcode TEXT UNIQUE,
  email TEXT UNIQUE,
  first_name TEXT, last_name TEXT, display_name TEXT,
  is_suspended BOOLEAN,
  created_at TIMESTAMPTZ
)

stamp_ledger(
  id UUID PK,
  customer_id UUID FK→users.id,
  cafe_id UUID FK→cafes.id,
  event_type ENUM('EARN','REDEEM'),  -- uppercase
  stamp_delta INT,                   -- +1 for EARN, -10 for REDEEM
  note TEXT,
  created_at TIMESTAMPTZ
)
-- APPEND ONLY. To count stamps earned: SUM(stamp_delta) WHERE event_type='EARN'.
-- To count rewards redeemed: COUNT(*) WHERE event_type='REDEEM'  (each row = 1 reward).

global_ledger(
  transaction_id UUID PK,
  consumer_id CHAR(6) FK→users.till_code,  -- NOT users.id
  venue_id UUID FK→cafes.id,
  action_type ENUM('earned','redeemed'),   -- lowercase
  quantity INT,                            -- how many stamps OR rewards in this single POS action
  "timestamp" TIMESTAMPTZ                  -- column name is the reserved word, must be quoted
)
-- One row per logical POS transaction (vs. stamp_ledger which is one row per stamp).

offers(
  id UUID PK,
  brand_id UUID FK→brands.id,
  offer_type TEXT,        -- 'percent', 'fixed', 'bogo', 'double_stamps', 'custom'
  target TEXT,
  amount NUMERIC,
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  target_cafe_ids UUID[],  -- NULL means "all cafes for the brand"
  custom_text TEXT,
  created_at TIMESTAMPTZ
)

cancellation_feedback(
  id UUID PK,
  brand_id UUID FK→brands.id,
  reason TEXT,            -- one of: free_drink_cost, barista_friction,
                          --         price_too_high, low_volume, feature_gap,
                          --         closing_business, other
  details TEXT,           -- only populated when reason='other'
  acknowledged BOOLEAN,
  created_at TIMESTAMPTZ
)

suspended_coffee_ledger(
  id UUID PK,
  cafe_id UUID FK→cafes.id,
  event_type TEXT,        -- 'donate_loyalty', 'donate_till', 'serve'
  units_delta INT,        -- +1 for donations, -1 for serve
  donor_user_id UUID,     -- NULL for till-paid donations
  barista_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ
)
-- Pool balance per cafe = SUM(units_delta) WHERE cafe_id = X.

baristas(
  id UUID PK, cafe_id UUID FK→cafes.id,
  display_name TEXT, email TEXT, created_at TIMESTAMPTZ
)
"""

_SQL_SYSTEM_PROMPT = f"""You are a Postgres SQL expert. Translate the user's question into a valid Postgres SQL query. Respond ONLY with the raw SQL string. Do not include markdown formatting, explanations, or backticks.

DATABASE SCHEMA:
{_SCHEMA_CONTEXT}

============================================================
BUSINESS TERMINOLOGY MAPPING — MUST be applied when the user's
question contains any of these consumer-facing product names.
The DB column never holds the marketing name; you MUST translate.
============================================================

Tier names → `brands.scheme_type`:
- "LCP+", "LCP Plus", "Global Pass", "Global Network", "Open Network",
  "the network" ⇒ `brands.scheme_type = 'global'`
- "Private Plan", "Private", "Walled Garden", "private brand card"
  ⇒ `brands.scheme_type = 'private'`

Subscription / billing state → `brands.subscription_status`:
- When the user's question contains "subscription", "subscribed",
  "on the LCP+ plan", "paying", "active LCP+ cafes", or any framing
  that asks about brands actively paying for a tier, combine the tier
  filter above with `brands.subscription_status = 'active'`.
- Example: "how many do I have on LCP+ subscription?" ⇒
  `SELECT COUNT(*) FROM brands WHERE scheme_type = 'global' AND subscription_status = 'active'`
- Plain "LCP+ brands" or "Private cafes" without "subscription" /
  "active" / "paying" framing is fine with the tier filter alone.

Other product-name shortcuts (extend this list when the agent fluffs
a question on UI vocabulary):
- "Pay It Forward" / "suspended coffee" / "community board"
  ⇒ `cafes.suspended_coffee_enabled = TRUE`
- "Founding 100" — pricing-policy term, not a DB enum. Skip the
  filter and answer over all brands unless the user qualifies.

============================================================

RULES:
- Read-only SELECT (or WITH ... SELECT) only. Never emit INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT/REVOKE/CREATE/MERGE/COPY/EXECUTE/CALL.
- Use Postgres syntax: now(), interval, date_trunc, COALESCE, FILTER (WHERE …).
- Time windows: "today" = `created_at >= date_trunc('day', now())`; "last 7 days" = `created_at >= now() - interval '7 days'`; "this month" = `date_trunc('month', created_at) = date_trunc('month', now())`.
- ENUMs are case-sensitive at the row level. `subscription_status` / `billing_status` / `scheme_type` / `global_ledger.action_type` are LOWERCASE. `stamp_ledger.event_type` is UPPERCASE ('EARN' / 'REDEEM').
- `global_ledger."timestamp"` must be double-quoted (reserved word).
- LIMIT every query to 200 rows unless the user explicitly asks for more.
- Stamps earned: SUM(stamp_delta) FROM stamp_ledger WHERE event_type='EARN'. Reward redemptions: COUNT(*) FROM stamp_ledger WHERE event_type='REDEEM'.
- "Active brands" / "live brands" = brands.subscription_status='active'.
- For "joined" or "signed up": brands.created_at (NOT cafes.created_at unless the user said 'locations').
"""

_SUMMARY_SYSTEM_PROMPT = """You are a Super Admin's data assistant. The user just asked a question, we ran the SQL on the live Local Coffee Perks database, and got the rows below as JSON.

Write a SHORT (1–2 sentences max) plain-English summary of the result. Be specific — quote the actual numbers and names from the data. Do NOT mention the SQL itself or use technical jargon ("rows", "result set", "query"). Do NOT speculate beyond the data.

If the result is empty, say so plainly ("None found in that window."). If the result is a single number/aggregate, state it directly. If the result is a list, summarize the count + the top 1–2 entries by name."""


# ─── SQL safety ────────────────────────────────────────────────────────
# Word-boundary regex so column/table names like "drop_count" or
# "created_at" don't false-trigger. Case-insensitive throughout.
_FORBIDDEN_KEYWORDS = (
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "GRANT", "REVOKE", "CREATE", "MERGE", "COPY", "EXECUTE", "CALL",
    "VACUUM", "ANALYZE", "REINDEX", "CLUSTER", "DISCARD", "LOAD",
)
_FORBIDDEN_RE = re.compile(
    r"\b(?:" + "|".join(_FORBIDDEN_KEYWORDS) + r")\b",
    flags=re.IGNORECASE,
)
# Allow leading SELECT or WITH (CTE → SELECT). The static check only
# guards intent; the DB-level READ ONLY transaction is the real wall.
_LEADING_SELECT_RE = re.compile(r"^\s*(?:WITH|SELECT)\b", flags=re.IGNORECASE)
# Semicolon followed by any non-whitespace = a second statement.
# A single trailing `;` is fine and stripped above.
_MULTI_STATEMENT_RE = re.compile(r";\s*\S")

MAX_ROWS_RETURNED = 200


class AskDbRequest(BaseModel):
    """Body of POST /api/admin/platform/ask-db. Single field — the
    Super Admin's plain-English question. The frontend ChatWidget
    owns conversation history; the backend is intentionally
    stateless so each query is reproducible from logs."""

    message: str = Field(min_length=1, max_length=2000)


class AskDbResponse(BaseModel):
    """Returns BOTH a natural-language summary (`reply`) and the raw
    rows (`rows`) so the frontend can render both — ChatWidget shows
    `reply` as the assistant message and an expandable shows the
    SQL + row count for transparency.

    `sql` is the EXACTLY executed string (post-validation). Helpful
    for the operator to learn the schema by example AND for log
    correlation when debugging a weird answer.
    """

    reply: str
    sql: str
    rows: list[dict[str, Any]]
    row_count: int
    truncated: bool


# Lazy-init mirrors `app.main._get_openai_client` so the env var can
# land in `.env` after process start without forcing a restart.
_openai_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI | None:
    global _openai_client
    if _openai_client is None:
        if not settings.openai_api_key:
            return None
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


def _strip_markdown_fences(raw: str) -> str:
    """LLMs sometimes wrap SQL in ```sql ... ``` despite instructions.
    Strip ONE matching pair so a polite mistake doesn't break the
    static validator."""
    s = raw.strip()
    fence = re.match(r"^```(?:sql)?\s*\n?", s, flags=re.IGNORECASE)
    if fence:
        s = s[fence.end():]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3].rstrip()
    return s.strip()


def _validate_sql(sql: str) -> str:
    """Returns the cleaned SQL or raises 400 with a precise reason.
    See module docstring for the layered safety rationale."""
    cleaned = _strip_markdown_fences(sql).strip()
    # A single trailing `;` is a stylistic choice the LLM makes; strip
    # before the multi-statement check so it doesn't false-trigger on
    # the trailing whitespace edge.
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1].rstrip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assistant returned an empty SQL string. Try rephrasing.",
        )
    if not _LEADING_SELECT_RE.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only SELECT / WITH queries are allowed. The assistant "
                "tried to emit something else."
            ),
        )
    if _FORBIDDEN_RE.search(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Generated SQL contains a forbidden keyword "
                "(mutation/DDL). Try rephrasing your question."
            ),
        )
    if _MULTI_STATEMENT_RE.search(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Multi-statement queries are not allowed.",
        )
    return cleaned


async def _generate_sql(client: AsyncOpenAI, message: str) -> str:
    completion = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": _SQL_SYSTEM_PROMPT},
            {"role": "user", "content": message.strip()},
        ],
        # Determinism for SQL gen — we don't want the same question to
        # hit different code paths across retries.
        temperature=0.0,
        max_completion_tokens=400,
    )
    raw = completion.choices[0].message.content or ""
    return raw


async def _summarize_rows(
    client: AsyncOpenAI,
    message: str,
    sql: str,
    rows: list[dict[str, Any]],
    truncated: bool,
) -> str:
    # Cap the JSON sample sent into the LLM for token-cost reasons.
    # The user already gets the full row list back via `rows` — the
    # summary is just the headline.
    sample_rows = rows[:50]
    truncation_note = (
        f" (showing the first 50 of {len(rows)} returned rows; "
        f"the full result was further truncated server-side at "
        f"{MAX_ROWS_RETURNED} rows)"
        if truncated
        else f" ({len(rows)} rows total)"
    )
    completion = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": _SUMMARY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"User question: {message.strip()}\n\n"
                    f"SQL executed:\n{sql}\n\n"
                    f"Rows{truncation_note}:\n"
                    f"{json.dumps(sample_rows, default=str)}"
                ),
            },
        ],
        temperature=0.2,
        max_completion_tokens=200,
    )
    summary = (completion.choices[0].message.content or "").strip()
    if not summary:
        # Non-empty fallback so the chat bubble doesn't render blank.
        return f"Returned {len(rows)} row{'s' if len(rows) != 1 else ''}."
    return summary


async def _execute_readonly(
    session: AsyncSession, sql: str
) -> list[dict[str, Any]]:
    """Run `sql` inside a fresh READ ONLY transaction. Postgres
    rejects any DML attempt with SQLSTATE 25006 ('read-only SQL
    transaction'), which is the DB-level backstop behind the static
    keyword check."""
    # Ensure no leftover transaction from a prior dependency caller —
    # SET TRANSACTION READ ONLY MUST be the first statement in the
    # transaction, otherwise Postgres errors with 25001.
    if session.in_transaction():
        await session.rollback()

    async with session.begin():
        await session.execute(text("SET TRANSACTION READ ONLY"))
        result = await session.execute(text(sql))
        # `result.mappings()` yields RowMapping objects keyed by
        # column name — converting to dict() gives a JSON-serialisable
        # shape the FastAPI response model can render directly.
        rows = [dict(row) for row in result.mappings()]
    return rows


@router.post("/ask-db", response_model=AskDbResponse)
async def ask_db(
    body: AskDbRequest,
    super_admin: SuperAdminSession = Depends(get_super_admin_session),
    session: AsyncSession = Depends(get_session),
) -> AskDbResponse:
    client = _get_client()
    if client is None:
        # Match the curated /ai-agent endpoint's pattern: return a 200
        # with a friendly assistant message rather than a 5xx so the
        # operator's chat doesn't crash. They can add the env var and
        # retry without restarting their session.
        return AskDbResponse(
            reply=(
                "Please add your OPENAI_API_KEY to the backend .env file "
                "to activate the data assistant."
            ),
            sql="",
            rows=[],
            row_count=0,
            truncated=False,
        )

    raw_sql = await _generate_sql(client, body.message)
    sql = _validate_sql(raw_sql)

    try:
        rows = await _execute_readonly(session, sql)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any DB error to the operator
        # Most common path: the LLM emitted a column/table that doesn't
        # exist, or referenced an enum value with the wrong case. The
        # operator sees the message and can either rephrase or report
        # it as a schema-context bug.
        logger.warning("ASK-DB sql failed admin=%s sql=%r err=%s",
                       super_admin.email, sql, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SQL execution failed: {exc}",
        )

    truncated = len(rows) > MAX_ROWS_RETURNED
    if truncated:
        rows = rows[:MAX_ROWS_RETURNED]

    reply = await _summarize_rows(client, body.message, sql, rows, truncated)

    logger.info(
        "ASK-DB ok admin=%s rows=%d truncated=%s sql=%r",
        super_admin.email,
        len(rows),
        truncated,
        sql,
    )

    return AskDbResponse(
        reply=reply,
        sql=sql,
        rows=rows,
        row_count=len(rows),
        truncated=truncated,
    )

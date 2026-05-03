# INFRASTRUCTURE LEDGER — Local Coffee Perks
*This document tracks all third-party platforms, external wiring, and server configurations that live OUTSIDE the main codebase. Do not overwrite or regenerate these endpoints without consulting this ledger.*

*Ledger initialised: **2026-04-27**.*
*Convention: every section carries a `Last updated:` date. When you change anything in a section — endpoint, key, deploy, vendor — bump that date and add a one-line note under **Change log** at the bottom.*

## 0. Build & Engineering Credit
*Last updated: **2026-04-28***

* **All building, coding, and implementation work on this product — backend (FastAPI), b2b dashboard, super-admin dashboard, consumer app, marketing site, infrastructure scripts, migrations, and this ledger itself — is done by Claude Code (Anthropic's official CLI for Claude).** No human-authored code lands in this repo without going through Claude Code as the implementing agent.
* The human collaborators direct the work (strategy, product decisions, brand voice, acceptance) — Claude Code executes.
* Surface-level credit ("Developed and managed by Impact Visual Branding") is the agency wrapper shown to end-users; the underlying engineering implementation is Claude Code throughout.

---

## 1. Google Sheets & Apps Script (Waitlist)
*Last updated: **2026-05-01***

* **Role:** Captures early waitlist signups, serves the live counter to the marketing website, AND emails every signup to the admin inbox as a real-time backup with an URGENT fallback if the sheet write fails.
* **Configuration:** A single Google Apps Script deployed as a Web App. Bound to the waitlist Google Sheet (so `getActiveSpreadsheet()` works).
* **Functions:**
    * `doPost(e)`: Captures form submissions from the landing page. Wrapped in try/catch. Appends to the sheet, then sends a success-notification HTML email to `hello@localcoffeeperks.com` with all submitted fields. If the sheet append throws, the catch block fires an "URGENT: Waitlist Error" email to the same address with the raw payload + error message + stack trace, so the lead can be recovered manually. Always returns JSON: `{ok: true, timestamp}` or `{ok: false, error}`. **(CRITICAL: Do not delete or overwrite this without preserving both the success-email path AND the URGENT fallback — losing leads silently is the failure mode this hardening prevents.)**
    * `doGet(e)`: Returns the live row count as JSON (`{"waitlist_count": X}`) for the frontend to display. Wrapped in try/catch — on read failure returns `{error: ...}` with no `waitlist_count` key, which the marketing site treats as "hide the counter" (see frontend rule below).
* **Constants at the top of `Code.gs`:**
    * `ADMIN_EMAIL = "hello@localcoffeeperks.com"` — destination for both the success-notification + URGENT fallback emails. Multiple comma-separated addresses are supported.
    * `SHEET_ID = null` — leave null when bound to a sheet; set to a spreadsheet ID for standalone scripts.
    * `SHEET_HEADERS = [...]` — column order array. **Must match the Google Sheet's first row exactly.** Mismatched order = misaligned data. Includes a trailing `raw_payload` column that stores the full JSON blob as a safety net for schema drift. The current order is `timestamp / name / email / cafe_name / phone / city / source / raw_payload`.
* **Email body shape:** the success email loops payload keys generically (any new field the marketing site adds → automatically appears in the email without a script update). The URGENT email contains: reason, error message, raw payload (pre-formatted in `<pre>`), and stack trace. Both use Espresso/Mint-adjacent inline styles for brand consistency.
* **MailApp quota:** soft daily limit of **100 emails on consumer Google** / **1,500 on Workspace**. Above that, the success-notification email starts dropping silently — but the row is already in the sheet, so the lead is still captured. The URGENT path uses the same quota; if both sheet AND mail fail same day, the Apps Script execution log (`script.google.com → Executions`) is the last-resort source of truth.
* **CORS handling:** Apps Script web apps deployed with "Anyone" access auto-add `Access-Control-Allow-Origin: *` to ContentService responses. The frontend `fetch` should send POSTs as `Content-Type: text/plain;charset=utf-8` (or omit the Content-Type header) to avoid triggering a CORS preflight that Apps Script can't fully answer. The script reads JSON via `e.postData.contents` + `JSON.parse` regardless of the Content-Type header.
* **HTTP status caveat:** Apps Script `ContentService` doesn't support custom HTTP status codes — every response is 200. Errors are signalled via `{ok: false, error}` in the JSON body, which the frontend reads.
* **Deployment Rule:** Must be updated via "Manage Deployments -> New Version" to preserve the existing Web App URL. **Never re-deploy as a fresh deployment** — that mints a new URL and silently breaks the marketing site's hardcoded fetch.
* **Frontend consumption rule (added 2026-04-27):** the waitlist marketing page hides the social-proof count entirely while the GAS fetch is in flight or has failed. There is **no mock baseline** — the displayed number is always the real `waitlist_count`, even single digits or zero, or nothing at all. Don't reintroduce a fallback floor.
* **Source-of-truth mirror:** the canonical tracked copy of the script lives in the repo at `marketing/waitlist-script/Code.gs` (with a `README.md` documenting the update protocol). The live script on Google's servers is updated by copy-paste from this file → "Manage Deployments → New Version." Edit the repo file first; the git history is the audit trail.
* **Hardening status:** ✅ **Live as of 2026-05-01.** Operator manually deployed the hardened script via "Manage Deployments → New Version." All described behavior (success email per signup + URGENT fallback if appendRow fails + try/catch on both endpoints) is active in production.

## 2. Stripe Billing (Test Mode)
*Last updated: **2026-05-03***

* **Role:** Handles the per-cafe subscription billing. Tier pricing is governed by the **Founding 100** policy — see Section 7 for the full pricing tier rules.
* **Environment:** Currently running in Test Mode (using `pk_test_...` and `sk_test_...` keys).
* **Webhook Setup:**
    * Endpoint: `https://dashboard.localcoffeeperks.com/api/stripe/webhook`
    * Listening exclusively for: `checkout.session.completed` and `customer.subscription.deleted`
    * Secured via Webhook Signing Secret (`whsec_...`) stored in `.env`.
* **Products (Founding 100 tier — currently active):**
    * Private Plan (£5.00/mo) - ID: `price_1TQmMjLjDXRzQll0GUGlguhU`
    * LCP+ Global Pass (£7.99/mo) - ID: `price_1TQmN6LjDXRzQll0SvQedP4d`
* **Post-Founding-100 prices (NOT yet created in Stripe):** Once the combined 100 founding signups are sold, two new Stripe Price IDs need to be created — Private at **£9.99/mo** and LCP+ Global at **£12.99/mo** — and the droplet env vars `STRIPE_PRIVATE_PRICE_ID` / `STRIPE_GLOBAL_PRICE_ID` swapped to the new IDs. Existing founding-tier subscriptions stay on their original price (Stripe pegs each subscription to the price ID it was created with), so the swap only affects new signups. Add a Change-log line when the cutover happens.

### Pro-rata billing (revised 2026-05-02 — signup-day anchor, co-termed proration)
All subscription mutations stay pay-in-advance, but the **billing-cycle anchor was simplified to "signup day"** in commit `acde1f2`. The earlier 1st-of-month `trial_end` anchor was producing "29 days free"-style edge cases (and on the last day of any month tripped Stripe's 48h `trial_end` floor entirely), so it was ripped out. Current contract:

* **Initial signup via `POST /api/billing/checkout`** — `app/billing.py::create_checkout` issues a vanilla immediate Stripe Checkout. No `trial_end`, no `_trial_end_first_of_next_month` helper, no 48h guard — Stripe defaults take over and the cycle anchors to the day of signup. The Stripe call stays wrapped in `try/except StripeError` (surfaces real Stripe message → 502 instead of opaque 500).
* **Adding cafes mid-cycle (quantity sync)** — `app/billing.py::sync_subscription_quantity` calls `stripe.SubscriptionItem.modify(item_id, quantity=N, proration_behavior="create_prorations")` and **does NOT call `Invoice.create`**. The proration line items roll onto the brand's NEXT natural invoice on their existing renewal date (co-termed). Issuing an immediate prorated invoice on every Add-Location click would drown small operators in tiny one-off charges, so we deliberately skip that step. `AddLocationDialog` in the b2b-dashboard gates the brand-new Checkout redirect on `!wasActive` so active brands don't re-checkout — they just get the auto-bumped quantity.
* **Plan upgrades / downgrades (`POST /api/billing/plan-change`)** — ✅ **wired live 2026-05-01** (commit `29b8c09`). The handler calls `stripe.SubscriptionItem.modify(item_id, price=NEW_PRICE_ID, proration_behavior="create_prorations")`. On upgrade it follows up with `stripe.Invoice.create + stripe.Invoice.pay` so the customer is charged the prorated difference immediately (this is the *plan-change* path; *quantity-change* path above does NOT do this). On downgrade the credit naturally lands on the next monthly invoice. `_resolve_plan_change_price_id` maps `starter→STRIPE_PRIVATE_PRICE_ID`, `pro→STRIPE_GLOBAL_PRICE_ID`; `premium` returns 422. `brand.scheme_type` syncs post-Stripe-success (best-effort). Pre-flight: 400 if no Stripe subscription/customer, 402 if subscription not ACTIVE. Stripe call wrapped in `try/except StripeError` → 502 with `exc.user_message`.
* **Why all this matters:** the spec at the top of `app/billing.py` is the authoritative pro-rata contract. If pricing logic ever drifts from "pay-in-advance, anchor to signup day, co-term mid-cycle quantity changes onto the next invoice," update that comment block AND this section in lockstep.

### ⚠️ Tier MUST be threaded from `brand.scheme_type` — never defaulted (added 2026-05-02 later)
Every caller of `createCheckout(token, …)` (frontend) — and by extension `POST /api/billing/checkout` (backend) — MUST pass an explicit tier derived from the brand row. Both the frontend client and the backend route default to `"private"` when the argument is missing, and the webhook then persists `metadata.tier = "private"` to `brand.scheme_type` (lines 765-769 of `app/billing.py`), **silently overwriting** whatever tier the Super Admin chose at brand creation.

The bug class was hit on 2026-05-02 by a brand created as Global being charged £5 instead of £7.99 during onboarding. Two call sites were silently defaulting:
- `b2b-dashboard/src/views/SetupView.tsx::StepPayment` — onboarding wizard payment step
- `b2b-dashboard/src/App.tsx::handleAddLocation` — active-dashboard "first cafe → auto-checkout" path

Both now derive tier explicitly:
```ts
const tier: "private" | "global" =
  brand.schemeType === "global" ? "global" : "private"
await createCheckout(token, tier)
```
The webhook side is correct — leave it alone; the bug is always upstream. Setup wizard now threads `brand` from Step 1 (returned by `adminSetup()`) → Step 2 → Step 3 so `StepPayment` has it natively.

### Plan-change is in-place (no Checkout redirect for tier swaps) — reinforced 2026-05-02 later
Stripe Checkout is reserved for the very first cafe + subscription signup. **Tier swaps NEVER redirect to Checkout** — they POST to `/api/billing/plan-change` directly, which calls `stripe.SubscriptionItem.modify(price=…, proration_behavior="create_prorations")` against the brand's existing subscription. Frontend (`b2b-dashboard/src/components/PlanChangeConfirmationDialog.tsx`) toasts on success and closes the modal. Re-running Checkout for tier swaps would create a second customer + subscription per attempt and confuse the webhook tier persistence — that path is now removed end-to-end.

The Manage Payment Method & Invoices button on Billing opens the Stripe Customer Portal directly. The cancellation-feedback exit survey is NOT chained on top of this button — it lives ONLY behind the Cancel Subscription button in Settings → Account Management (Danger Zone). Mixing the two confused brands updating their card with the cancellation flow.

### Super-Admin Stripe invoice surfacing (added 2026-05-02)
* New endpoint `GET /api/admin/platform/brands/{brand_id}/invoices` thinly wraps `stripe.Invoice.list(customer=...)` and returns a normalized `BrandInvoicesResponse` — totals, dates, hosted-invoice URL + PDF link, and per-line breakdown including the `proration` flag. Empty response (with `stripe_customer_id=None`) when the brand never went through Checkout, so the UI shows an empty-state instead of a 404.
* Frontend: admin-dashboard `CafesPage::CafeDetailPanel` gets a "Billing history (Stripe)" button → `BrandInvoicesModal` with expandable per-invoice line items + "Open hosted invoice" link. Used during dispute resolution to walk owners through their exact charges (proration line items from `sync_subscription_quantity` show up labelled).
* No DB caching — every modal open round-trips to Stripe. Cardinality is small (tens of invoices per brand), well within Stripe's rate limits.

### Cancel-at-period-end + Reactivate lifecycle (added 2026-05-03)
End-to-end self-serve cancel + reactivate inside the b2b dashboard. **No Stripe Customer Portal hand-off for cancellation.** The Manage Payment Method & Invoices button still opens the portal (cards / past invoices), but cancel/reactivate are first-party.

* **Migration 0021** added `brands.cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE` (idempotent `ADD COLUMN IF NOT EXISTS`). Apply on droplet via `docker compose exec -T api python -m scripts.apply_migration migrations/0021_add_brand_cancel_at_period_end.sql`.
* **`POST /api/billing/cancel`** — calls `stripe.Subscription.modify(sub_id, cancel_at_period_end=True)`. Mirrors the flag to `brands.cancel_at_period_end`, flips `subscription_status → PENDING_CANCELLATION`, syncs `current_period_end` from Stripe's response. NEVER does an immediate cancel — founder policy is grace-period preservation. Pre-flight: 400 if no Stripe sub, 409 if already CANCELED, 502 on Stripe error. **Endpoint name:** previously `/api/billing/cancel-subscription` (renamed 2026-05-03 to founder's canonical name).
* **`POST /api/billing/reactivate`** — `stripe.Subscription.modify(sub_id, cancel_at_period_end=False)`. Flips brand back to ACTIVE if it was PENDING_CANCELLATION, resyncs `current_period_end`. 409 when subscription has already fully cancelled (Stripe deleted it at period end) — frontend falls through to the `InactiveSubscriptionView`'s new-Checkout path.
* **`customer.subscription.updated` webhook handler** (added 2026-05-02 in commit `44a12c9`) — keeps `cancel_at_period_end` + status in lockstep with Stripe, including the case where the brand owner toggles directly via the Stripe Customer Portal (uncancel via portal → ACTIVE; cancel via portal → PENDING_CANCELLATION). Idempotent against our own `/cancel` and `/reactivate` writes.
* **Pydantic / API surface:** `BrandProfile.cancel_at_period_end` is exposed; `subscription_status` enum union now includes `pending_cancellation`. Frontend `ApiBrand` + `Brand` mock + `brandFromApi` mirror the field.
* **Cafes are NOT mutated** during cancel — they stay ACTIVE through the grace window. Only the existing `customer.subscription.deleted` webhook (when the period actually elapses) cascades `cafes.billing_status → CANCELED`.
* **UI surfaces (b2b-dashboard):** sticky un-dismissible Lame Duck banner (`components/LameDuckBanner.tsx`) in `App.tsx` above Topbar across every tab while `cancelAtPeriodEnd && status !== 'canceled'`. Full-screen Hard Wall (`views/InactiveSubscriptionView.tsx`) replaces dashboard when `status === 'canceled'`. Reactivate from the banner = `/reactivate`; reactivate from the Hard Wall = fresh Checkout (subscription is gone, must spin up a new one — same `stripe_customer_id` so invoice history stays continuous).
* **Barista POS UI lockout NOT shipped** — backend already 402s every scan via the `cafes.billing_status === CANCELED` cascade, which is the actual security boundary. UI-side POS lock would require plumbing `billing_status` into `StoreLoginResponse` — clean follow-up.

## 3. Server & Deployment (DigitalOcean)
*Last updated: **2026-05-01***

* **Role:** Live production hosting for the FastAPI backend.
* **Specs:** 2GB Dedicated Droplet (IP `178.62.123.228`).
* **Base URL:** `https://dashboard.localcoffeeperks.com`
* **Environment Variables:** Stripe keys, Webhook secrets, and Database URIs are stored in the persistent file `/root/.env-lcp-production` (root-owned, mode 600). The deploy script copies this file to `/var/www/lcp/.env` before each `docker compose up` so the API container sees the latest values. Add new env vars by `ssh`-editing the persistent file, NOT the working-tree `.env` (which gets clobbered every deploy).
* **Deploy trigger:** GitHub Actions on every push to `main` (`.github/workflows/deploy.yml`) — SSHes the droplet, pulls latest, restores `.env` from the persistent copy, rebuilds the API container.
* **Deploy script lock handling (added 2026-04-27):** the deploy.yml waits up to 20 seconds (10 × 2s) for any in-flight `.git/index.lock` to clear before its own `git fetch`, then force-removes a lingering lock so a one-off race (e.g. a manual SSH `git fetch` colliding with the scheduled deploy) can't permanently break a deploy.
* **Database migrations are NOT auto-applied (added 2026-05-01).** The deploy script rebuilds the API container with the latest source — including any new files in `migrations/` — but does **not** run `apply_migration` against the database. After any push that ships a new migration, the operator must SSH the droplet and apply each one manually:
  ```bash
  ssh root@178.62.123.228 'cd /var/www/lcp && docker compose exec -T api python -m scripts.apply_migration migrations/00XX_*.sql'
  ```
  Window between deploy + migration application is the only failure mode — endpoints that reference the not-yet-created tables/columns will 500 until the migration runs. Existing endpoints are unaffected (additive migrations only). Pre-flight: list new migrations in the commit message + apply in numeric order.
* **Subdomains served by the droplet's Nginx:** `localcoffeeperks.com` (apex marketing site), `dashboard.localcoffeeperks.com` (b2b dashboard SPA + `/api/*` proxy to FastAPI), `hq.localcoffeeperks.com` (super-admin SPA + `/api/*` proxy). All three on Let's Encrypt HTTPS, auto-renewed by certbot.
* **UFW firewall:** active, default-deny incoming, allowed: 22 (SSH), 80, 443, 8000.

## 4. Email & Transactional Delivery (Resend ✅ confirmed live in prod)
*Last updated: **2026-05-02 (later)***

* **Role:** Official business communication AND outbound transactional email — brand-invite welcome, consumer OTP, brand password-reset, **B2B product feedback ack** (added 2026-05-02 — Settings → Provide Feedback POSTs to `/api/b2b/feedback` which best-effort emails `hello@localcoffeeperks.com`).
* **Address:** `hello@localcoffeeperks.com`
* **Vendor history:** Zoho Mail (initial) → Google Workspace SMTP (2026-04-30 morning) → **Resend** (2026-04-30 evening, ✅ confirmed live with `EMAIL SENT via Resend id=re_...` log lines after first successful invite). The Google Workspace SMTP transport remained dead-on-arrival on the production droplet because **DigitalOcean blocks all outbound SMTP** (ports 25, 465, 587) on this droplet — confirmed via `[Errno 101] Network is unreachable` from inside the api container against `smtp.gmail.com`. Resend bypasses this entirely because its API runs over HTTPS port 443.

### Active configuration (Resend HTTPS API)
The FastAPI backend sends transactional email via `app/email_sender.py::_send_via_resend`, which calls Resend's REST API through the official `resend` Python SDK. No SMTP, no port 25/465/587. Just HTTPS to `api.resend.com:443`.

* **Vendor:** [Resend](https://resend.com)
* **Sending domain:** `localcoffeeperks.com` (must be verified in Resend's dashboard before non-test sends work — adds 3 DNS records: 1 TXT for SPF, 2 CNAMEs for DKIM)
* **From header:** `Local Coffee Perks <hello@localcoffeeperks.com>` (reuses the `SMTP_FROM` env var)
* **API key format:** `re_…` — generated at `resend.com → Settings → API Keys`
* **Free tier:** 3,000 emails/month, 100/day. Comfortably above Founding 100 invite + OTP traffic.

### Transport selection (highest priority first)
`email_sender.py` picks the first configured transport at runtime:
1. **Resend** — when `RESEND_API_KEY` is set. The prod path.
2. **SMTP** — when `SMTP_PASSWORD` is set and `RESEND_API_KEY` isn't. Useful for local dev with Google App Password. Will fail with `[Errno 101]` on cloud hosts that block outbound SMTP.
3. **Stdout stub** — when neither is set. Logs the body to api stdout so the operator can hand-deliver the link / OTP.

### Legacy SMTP configuration (Google Workspace / Gmail) — local dev fallback only
The SMTP code path in `email_sender.py::_send_via_smtp` is preserved for local dev:

* **Host:** `smtp.gmail.com`
* **Port:** `465` (SSL) — matches the `SMTP_USE_SSL=true` default. Port `587` (STARTTLS) is supported by setting `SMTP_USE_SSL=false`.
* **Username:** `hello@localcoffeeperks.com`
* **Password:** a 16-character **Google App Password** generated at `myaccount.google.com → Security → 2-Step Verification → App passwords`. **NOT** the workspace login password — Gmail rejects raw passwords for SMTP, and Google's "less secure apps" path was removed in 2022. The App Password is treated as a secret; rotate by revoking + regenerating in the same dashboard.
* **From header:** `Local Coffee Perks <hello@localcoffeeperks.com>`

### Backend env vars (read by `Settings` in `app/database.py`)

| Var | Default | Required? |
|---|---|---|
| `RESEND_API_KEY` | unset | **YES on droplet** — primary prod transport |
| `SMTP_FROM` | `Local Coffee Perks <hello@localcoffeeperks.com>` | No — used by both Resend and SMTP paths |
| `SMTP_HOST` | `smtp.gmail.com` | No — only consulted on the SMTP fallback path |
| `SMTP_PORT` | `465` | No — SMTP fallback only |
| `SMTP_USE_SSL` | `true` | No — SMTP fallback only |
| `SMTP_USERNAME` | `hello@localcoffeeperks.com` | No — SMTP fallback only |
| `SMTP_PASSWORD` | unset | No on droplet (DO blocks SMTP); set in local `.env` if you want to round-trip real email locally |

When neither transport is configured (or any send fails), `email_sender.py` falls back to a stdout stub: the calling endpoint still returns 200 and the operator can read the link / OTP from `docker compose logs api | grep "EMAIL STUB"`.

### Where the API key lands
* **Local dev:** add `RESEND_API_KEY=re_...` to the project `.env`. Don't commit it (`.env` is gitignored).
* **Droplet:** append to `/root/.env-lcp-production` (the persistent env file the deploy script copies to `.env` before `docker compose up`; see Section 3). Then sync + restart:
  ```bash
  cp /root/.env-lcp-production /var/www/lcp/.env
  cd /var/www/lcp && docker compose up -d api  # no --build needed; just restart with new env
  ```

### Templates
Three transactional templates ship in `app/email_sender.py`, all sharing the Espresso `#1A1412` + Mint `#00E576` chrome (table-based layout for Outlook + every other client):

1. **Brand invite** — `send_brand_invite_email(to_email, brand_name, setup_url, cafe_owner_name=None)` — fired by `POST /api/admin/platform/invite-brand-admin`. Subject: *"Welcome to Local Coffee Perks! Let's get you set up."* Greeting *"Welcome to the family, {cafe_owner_name}!"* (falls back to *"Welcome to the family!"* when no owner name was captured at brand-create time). Body: eco-friendly + independent-brand framing → 3-step guide with mint-numbered circles (1. Secure your account, 2. Upload logo + brand colours, 3. Print QR table-talkers) → "Finish Setting Up My Cafe →" CTA → plain-text fallback link with 48h expiry note → *"Made for independents, by independents."* sign-off. The handler in `main.py` derives `cafe_owner_name` from `brand.owner_first_name` + `brand.owner_last_name` (populated by the consolidated Add Brand modal — see Section 9).
2. **Consumer OTP** — `send_otp_email(to_email, code)` — 10-minute 4-digit code in a monospace pill. Fired by `POST /api/consumer/auth/request-otp`.
3. **Password reset** — `send_password_reset_email(to_email, brand_name, reset_url)` — 60-minute single-use reset link. Fired by `POST /api/auth/forgot-password`.

Templating is plain Python f-string interpolation — no Jinja or other templating dependency. The `{{setup_link}}` / `{{cafe_owner_name}}` notation in conversation specs maps to f-string `{setup_url}` / `{cafe_owner_name}` interpolation in the actual code.

### Operational gotchas
* **Sending domain must be verified before non-test sends work.** Until DNS propagates and Resend marks the domain as verified, `From: hello@localcoffeeperks.com` will be rejected with a 403. Workaround during DNS propagation: temporarily set `SMTP_FROM='onboarding@resend.dev'` so sends go through Resend's test sender.
* **The 3 DNS records.** Resend's domain panel lists exactly 3 records to add at the registrar: one `TXT` (SPF: `v=spf1 include:_spf.resend.com ~all`) and two `CNAME` (DKIM, looks like `resend._domainkey.localcoffeeperks.com → resend._domainkey.resend.com`). Propagation is usually 5-30 min.
* **Free tier limit.** 3,000 emails/month, 100/day. Comfortably above Founding 100 invite + OTP volume. Above that, paid tier starts at $20/mo for 50k.
* **App Password requires 2-Step Verification (SMTP fallback only).** Only relevant if you're using the Gmail SMTP fallback for local dev. Enable 2-Step at `myaccount.google.com → Security → 2-Step Verification` before generating an App Password.
* **Reply-to.** Replies to transactional emails currently land in the `hello@localcoffeeperks.com` inbox the founder reads daily. If we ever split inbound vs outbound, set Resend's `reply_to` field in `_send_via_resend`.
* **Intentional consumer-OTP dev shim.** `app/consumer_auth.py` (~line 150-152) has a hardcoded `saeed@test.com → OTP 1234` path inside `request_otp` for exercising the consumer-app scanner without log-grepping for OTPs. **Founder-confirmed 2026-05-01 to keep this in place permanently.** Don't propose removing it in future audits / cleanups — this is intentional. (If a deploy ever needs to harden, the right move is to gate it behind an env flag like `DEBUG_TEST_OTP_EMAIL` so it's staging-only, but that's a future tightening, not a current TODO.)

### Apple Mail / iOS reading config (founder's inbox)
* **Incoming (IMAP):** `imap.gmail.com` · port `993` · SSL on.
* **Outgoing (SMTP):** `smtp.gmail.com` · port `465` · SSL on.
* **Auth (both):** App Password (same one as above, OR a separate per-device App Password — Google supports an unlimited number; rotate the dashboard one without affecting devices).
* **Multi-device rule.** Generate a separate App Password per device. Sharing one password isn't strictly broken on Google like it was on Zoho, but per-device makes revocation painless.

### Legacy Zoho config (deprecated 2026-04-30 — kept for rollback only)
* IMAP: `imappro.zoho.eu:993` (SSL)
* SMTP: `smtppro.zoho.eu:465` (SSL)
* Auth: 16-char Zoho App-Specific Password (no spaces).
* Multi-device gotcha: Zoho's anti-replay heuristics silently disabled a device when two shared the same App Password — every device needed its own.

### Founder-locked template copy (last refreshed 2026-05-02)
All transactional templates live in `app/email_sender.py` and share `_wrap()` for the brand chrome (Espresso `#1A1412` bg + Mint `#00E576` accent + 560px column).

* **`send_brand_invite_email` 3-step block** (`Welcome to the family, {cafe_owner_name}!`):
    * **Step 1 — Secure your account:** Click the button below to set your password and unlock the dashboard.
    * **Step 2 — Set up your locations:** Add your cafe details, toggle on your Pay-It-Forward community board, and activate your subscription.
    * **Step 3 — Launch the Barista POS:** Open the Barista POS link on your till or tablet, log in with your Store ID and PIN, and start scanning customer phones!
    * (Replaces the original "Make it yours / Upload logo" + "Print QR table talkers" steps that didn't match the actual product flow — there's no logo upload and no QR table talkers.)
* **`send_otp_email` subtext:** "If you didn't request this code, you can safely ignore this email."
* **Shared `_wrap()` footer** — applies to brand-invite, OTP, password-reset, AND product-feedback ack: "This is an automated security message from Local Coffee Perks. Please do not reply to this email." (Replaces the brand-invite-specific "You're receiving this because someone added your email to a Local Coffee Perks invite…" boilerplate, which was technically wrong on OTP / password-reset emails — those go to existing accounts, not new invitees.)

If a future template needs an invite-specific footer back, refactor `_wrap()` to take an optional footer override rather than hardcoding around the shared one.

## 5. App Store & Google Play (D-U-N-S in flight)
*Last updated: **2026-04-28***

* **Entity Name:** A Digital Product Studio Limited.
* **Company Registration Number (CRN):** received from Companies House on **2026-04-28**.
* **D-U-N-S number:** **requested 2026-04-28** via Apple's D-U-N-S lookup tool (the dedicated portal at `developer.apple.com` that accepts a CRN and forwards the lookup to Dun & Bradstreet — typically faster than going to D&B directly). Confirmation email with the request ID received. Expected SLA: **5–14 days** for D&B to verify the new CRN and issue the 9-digit D-U-N-S.
* **Apple ID used to submit the D-U-N-S request:** founder's personal Apple ID. **This is harmless.** The D-U-N-S number is generated for the *company* (A Digital Product Studio Limited), not for the Apple ID — when the D-U-N-S finally arrives, a fresh `dev@localcoffeeperks.com` Apple ID can be created and the D-U-N-S applied to that new account during organization enrollment. The submitting Apple ID is irrelevant to the final tie-up.
* **Both stores blocked on the D-U-N-S.** As of 2026-04 Google Play Console **also** requires a D-U-N-S for new Organization accounts — recent policy change. Trying to enroll on Google before D-U-N-S arrives gets stuck on the company-verification step. Do them in parallel once D-U-N-S lands.
* **Costs (post-D-U-N-S):**
    * Apple Developer Program — **£79/year**, recurring.
    * Google Play Console — **$25 one-time** registration fee.
* **Plan once D-U-N-S arrives:**
    1. Create dedicated `dev@localcoffeeperks.com` (or `hello@`) Apple ID with 2FA on a trusted phone number — keep all org assets off founder's personal iCloud.
    2. Apple → developer.apple.com/enroll → Company / Organization → enter CRN + D-U-N-S → wait for Apple's manual phone-call verification (a few days) → pay £79.
    3. Google → play.google.com/console/signup → Organization → enter D-U-N-S (D&B database lookup auto-fills legal name + address) → upload founder's gov ID for personal verification → pay $25.
* **Trap: don't pay either fee before D-U-N-S is verified.** Both portals will let you start the form but will reject the final submission, and Apple has been known to flag mismatched legal names as suspicious — verify the D-U-N-S record's legal name spells "A Digital Product Studio Limited" exactly before enrolling.

## 6. Vehicle Marketing Assets (SVG decals)
*Last updated: **2026-04-27***

* **Role:** Source-of-truth artwork for the Local Coffee Perks car decal set used for street-level brand awareness and waitlist QR scans.
* **Location in repo:** `/marketing/stickers/`
* **Files:**
    * `hood.svg` — 500×500 circle, bonnet centre decal
    * `driver-door.svg` — 500×300 rectangle, driver-side door
    * `passenger-door.svg` — 500×300 rectangle, passenger-side door
    * `bumper.svg` — 300×300 circle, rear bumper
    * `README.md` — print-prep + brand palette notes
* **Required sibling asset:** every SVG references `qr.png` via a relative `<image href="qr.png">` tag. Drop the production QR (linking to `https://localcoffeeperks.com/waitlist`) into `marketing/stickers/qr.png` before opening any SVG locally — otherwise the QR slot renders as a broken image.
* **Brand palette (must match exactly across all 4 files):**
    * Background: `#1A1412` (espresso)
    * Mint highlights: `#00E576`
    * Body text: `#FFFFFF`
* **Typography:** Fraunces (display) + Inter (body), both `@import`-ed from Google Fonts inside each SVG's `<style>` block.
* **Print-prep rule:** before sending any SVG to a vinyl printer, open in Illustrator (or Inkscape) and **convert text to outlines / paths**. The Google Fonts `@import` works in browsers but is unreliable in print RIPs — without outlining, the printer may substitute a system font and break the brand look.

## 7. B2B Pricing Policy & Founding 100
*Last updated: **2026-04-28***

* **Role:** Canonical commercial pricing rules. Any pricing logic that lands in code, marketing copy, the website, or a Stripe product MUST agree with this section.
* **Founding 100 (current — what's live in Stripe today):**
    * Private Plan: **£5.00 / month / cafe location**
    * LCP+ Global Pass: **£7.99 / month / cafe location**
* **Post-Founding-100 standard pricing (NOT yet provisioned):**
    * Private Plan: **£9.99 / month / cafe location**
    * LCP+ Global Pass: **£12.99 / month / cafe location**
* **The cap is 100 *combined* signups, not 100-each.** The first 100 cafes that subscribe — across **either** plan combined — lock in the founding price. Signup #101, regardless of plan, sees the standard pricing. Existing founding subscribers stay on the founding price for the life of the subscription (Stripe pins each subscription to its origin price ID; no retroactive bumps).
* **Per-location, not per-brand.** The price multiplies by the number of cafes a brand operates: a brand with three cafes on the Private plan pays £15/mo (Founding) or £29.97/mo (post-cap). This is enforced via the Stripe subscription-item `quantity` field, synced to `COUNT(cafes WHERE brand_id=…)`.
* **No profit-sharing, no transaction fees, no consumer charges. Ever.** This is the explicit contrast against the two main competitors (RWRD in the UK, Joe in the US). Marketing copy may lean on this; do not silently break it later.
* **Founding 100 is a marketing hook, not a Stripe gate.** There is no automated cap-counter in the backend yet; once new pricing is set, the founding price IDs simply stop being used for new checkout sessions. Existing subscribers keep paying the founding price until they cancel.
* **Loyalty mechanic — "Buy 10, get the 11th free."** Strict `>` 10 threshold (NOT `>=`). Customer at 10/10 → no free drink yet — they have to buy the 11th to trigger the reward. This wording goes on every marketing surface (website, stickers, email, social). Backend POS already enforces this in `BaristaPOSView.tsx`'s `shouldIntercept` (sum strictly greater than threshold). Don't let any copywriter accidentally print "buy 9 get 10th free" — that is the wrong mechanic and breaks the math.

## 8. Brand Manifesto / Master Context Document
*Last updated: **2026-04-28***

* **Role:** Single source of truth for brand identity, target audience, USPs, competitor positioning, and "why does LCP exist?" narrative. Hand this to any external collaborator (marketing freelancer, designer, copywriter, agency, investor) so they can produce on-brand work without a 30-minute call.
* **Canonical document:** A standalone PDF generated 2026-04-28 by the strategy gem (Gemini), titled "Local Coffee Perks — Project Manifesto". Lives outside the repo (the founder's local Downloads / Drive). The repo-side equivalent for AI agents is the [`reference_brand_manifesto.md`](C:\Users\saeed\.claude\projects\C--Users-saeed-OneDrive-Desktop-Coffee-Loyalty-Rewards\memory\reference_brand_manifesto.md) memory file — same content, machine-readable.
* **Key facts that any marketing surface MUST agree with:**
    * **Tagline:** "For the regulars."
    * **The market gap (the "Starbucks Gap"):** Big chains (Starbucks, Costa, Pret) can afford bespoke loyalty apps. Independent single/multi-shop cafes cannot — and even if they could, no consumer wants to download a separate app per cafe. LCP is the shared digital loyalty layer indies have been priced out of.
    * **Target audience (corrected 2026-04-28):** **30–50-year-olds with disposable income** is the anchor demographic — professionals, remote workers, parents on the school run who buy a £4 flat white daily. Gen-Z / students are aspirational but lack the consistent disposable spend. Marketing imagery + copy should skew toward the older, established demographic.
    * **Competitor framing:** Two direct competitors — **RWRD** (UK; charges cafes more, has tried to monetize consumers) and **Joe** (US; profit-sharing model). LCP's contrast: ultra-low flat SaaS, never touches cafe revenue, never charges consumers. Other tangentially-overlapping apps are either pure discovery (no loyalty) or pure digital stamps (no discovery / amenity filters); LCP is the only one combining both at this price point.
    * **Brand colors:** Espresso `#1A1412` (background), Electrifying Mint `#00E576` (accent / headers / CTA), Pure White `#FFFFFF` (text). DO NOT introduce terracotta / oat / amber on consumer-facing brand surfaces — those are legacy B2B-dashboard tokens being phased out.
    * **Brand fonts:** **Fraunces** (display / headers — gives the editorial, characterful feel) + **Inter** (body / UI — clean and readable).
    * **Vibe:** Premium but playful. Professional but locally rooted. Eco-friendly (no paper waste).
    * **Global ambition:** Launching UK-first, but the architecture is borderless (multi-currency-ready, timezone-aware). Cafes from UAE, AU, CA etc. are welcome — backend handles the onboarding without a rebuild.
* **When this document changes:** if pricing tiers, target audience, taglines, or competitor positioning shift, update the manifesto PDF AND the `reference_brand_manifesto.md` memory file in the same session. Add a Change-log line here.

## 9. Super-Admin Auth & Onboarding Pipeline
*Last updated: **2026-04-30 (eve)***

* **Role:** Locks down the platform-staff surface (the `hq.localcoffeeperks.com` admin-dashboard + every `/api/admin/platform/*` route guarded with `Depends(get_super_admin_session)`) and drives the end-to-end "super-admin invites a brand owner" onboarding pipeline.
* **Super-admin table:** `super_admins(id UUID, email TEXT UNIQUE, password_hash TEXT, created_at)` — see migration `0017_add_super_admins.sql`. Distinct from `brands.password_hash` (brand-owner login) and `cafes.pin_hash` (store-PIN login).
* **Login route:** `POST /api/auth/super/login` — bcrypt-verifies against `super_admins.password_hash`, mints a JWT with `aud="super-admin"` (see `app/tokens.py::encode_super_admin`). Uniform-401 + decoy-hash so the endpoint can't be used to probe staff-account existence.
* **Guard:** `Depends(get_super_admin_session)` in `app/auth.py`. Currently wired onto **`POST /api/admin/platform/invite-brand-admin`** only; the rest of `/api/admin/platform/*` remains unauth'd at scaffold level for now (see SECURITY comments on those routes). When tightening, add the dependency to: brand-create, cafe-create, customer-suspend, adjust-stamps, billing-status, set-billing-status, network-lock-reset, AI-agent.
* **Seed account (local dev):** `admin@localcoffeeperks.com` / `password123`. Lives in `scripts/seed_local_dev.py`; idempotent (skipped if already present). **Prod was bootstrapped on 2026-04-30 via the temporary `GET /api/admin/platform/seed-super` endpoint** (unauth'd, idempotent — created the table + seeded default account). The endpoint was **deleted 2026-05-01 in commit `29b8c09`** once prod was bootstrapped and the password rotated, closing the residual unauth'd-endpoint footprint.
* **Team management (added 2026-04-30):**
    * `POST /api/auth/super/change-password` — guarded; verifies `current_password` against the bcrypt hash before applying the new one (so a stolen JWT alone can't lock the legitimate operator out).
    * `POST /api/auth/super/create` — guarded; lets a signed-in super-admin add a co-founder by email + temporary password.
    * Wired into the `Settings` tab in admin-dashboard (`SettingsPage.tsx`) with two cards (Change Password + Add Super Admin), in-house Toaster for success/error.
* **Onboarding flow (end-to-end):**
    1. Super admin signs in at `hq.localcoffeeperks.com` → JWT in `localStorage.lcp_super_admin_session_v1`.
    2. **Single click "Add New Brand"** in the Cafes tab — modal collects Brand Name + Admin Name + Admin Email + Subscription Plan. (Replaced the pre-2026-04-30 two-step "Add Brand" + "Invite Brand Admin" UX, where the invite modal asked the operator to pick from a brand dropdown that was necessarily empty for new onboarding.) On submit the modal:
        - calls `POST /api/admin/platform/brands` to create the brand row (admin name split client-side on last space, persisted into `brand.owner_first_name` + `owner_last_name`),
        - then immediately calls `POST /api/admin/platform/invite-brand-admin` with the new `brand_id`,
        - shows the resulting `setup_url` + Copy button + "Welcome email sent to ..." confirmation inline in the same modal.
       The standalone `InviteAdminModal` code is preserved in `CafesPage.tsx` (unrouted) for a future per-row "Resend invite" action.
    3. Backend signs a 48h `aud="brand-invite"` JWT and calls `send_brand_invite_email(...)` (Resend transport — see Section 4). The email greets the owner by name (the `cafe_owner_name` is derived from the brand's KYC fields the modal just populated).
    4. Recipient clicks the email's "Finish Setting Up My Cafe →" CTA → lands at `dashboard.localcoffeeperks.com/setup?token=…` → b2b-dashboard's `SetupView.tsx` 3-step wizard (password → first cafe → Stripe Checkout).
    5. Step 1 POSTs `/api/auth/brand/setup` (canonical; `/api/auth/admin/setup` is kept as a deprecated alias). Backend decodes the brand-invite JWT, sets `brands.password_hash`, mints a fresh `aud="admin"` session JWT.
    6. Step 2 + Step 3 use the session JWT to create the first cafe and start a Stripe Checkout (now with `subscription_data.trial_end` for pay-in-advance pro-rata — see Section 2).
* **localStorage keys:**
    * `lcp_super_admin_session_v1` (admin-dashboard) — `{token, email}`.
    * `icl_session_v1` (b2b-dashboard) — admin or store session, separate scope.
* **Why two separate setup-route names:** the original handler shipped at `/api/auth/admin/setup` (mismatched with the admin-dashboard's super-admin scope). On 2026-04-30 we added `/api/auth/brand/setup` as the canonical brand-owner finalize route — same impl, semantic name. Keeping both means deployed dist bundles don't 404 if they're cached against the old path.

---

## 10. Marketing Site Share Previews (Open Graph / Twitter Cards)
*Last updated: **2026-04-29***

* **Role:** Controls how `localcoffeeperks.com` and `localcoffeeperks.com/waitlist` render when shared on WhatsApp, Facebook, LinkedIn, Slack, X, iMessage, etc. Without correct OG/Twitter meta, scrapers fall back to whatever default the original scaffolder (Lovable) injected — which is exactly how Lovable's logo ended up in WhatsApp previews even after the brand sweep.
* **Four HTML entry points (must stay in lockstep):**
    1. `main-website/index.html` — Vite source
    2. `main-website/dist/index.html` — committed prebuilt artifact, served by Nginx at apex
    3. `waitlist-page/index.html` — Vite source
    4. `waitlist-page/dist/index.html` — committed prebuilt artifact, served by Nginx under `/waitlist`
* **Why dist matters:** the dist files are **committed to git on purpose** (see Section 3 — Nginx serves them as static files). If you only edit the source HTML, scrapers will keep seeing the stale dist. You must either (a) edit the dist file by hand in the same commit OR (b) run the Vite build and commit the regenerated `dist/`.
* **The Lovable bug (resolved 2026-04-29):** Commit `1421a82` (2026-04-28) cleaned the source HTML and added brand-correct 1200×630 OG images. But the dist copies still pointed `og:image` at `lovable.dev/opengraph-image-p98pqg.png` and `twitter:site=@Lovable`. WhatsApp was scraping the live (dist-served) URL, so the preview stayed wrong. Commit `90a4c50` (2026-04-29) synced the dist files. No `Lovable` string remains in any `<head>` block — only in `package.json` / `vite.config.ts` / `README.md` / `bun.lock` / `.lovable/plan.md`, none of which reach the browser.
* **Canonical OG / Twitter block** (currently shipped):
    * `og:title` — "Local Coffee Perks — For the regulars."
    * `og:description` — *"The loyalty app built for independent cafés. Replace paper stamp cards with a digital pass your customers actually keep. Claim your Founding price before all 100 spots are gone."* (intentionally the longer Founding-100 hook; the short tagline "For the regulars." is the title suffix + image alt)
    * `og:type` — `website`
    * `og:url` — `https://www.localcoffeeperks.com/` (apex) or `https://www.localcoffeeperks.com/waitlist` (waitlist)
    * `og:image` — `https://www.localcoffeeperks.com/og-waitlist.png` (apex) or `https://www.localcoffeeperks.com/waitlist/og-waitlist.png` (waitlist)
    * `og:image:width` / `og:image:height` — `1200` / `630`
    * `og:image:alt` — "Local Coffee Perks — For the regulars. The loyalty app for independent cafés."
    * `og:site_name` — "Local Coffee Perks"
    * `twitter:card` — `summary_large_image`
    * `twitter:title` / `twitter:description` / `twitter:image` — mirror the OG values
* **OG image generator:** `scripts/build_og_image.py` produces the 1200×630 share card (espresso `#1A1412` bg, mint `#00E576` accent, Fraunces + Inter type) and copies it to both `main-website/public/og-waitlist.png` and `waitlist-page/public/og-waitlist.png`. Re-run when the brand image needs to change.
* **Scraper-cache trap:** WhatsApp / Facebook / LinkedIn cache previews per-URL for ~7 days. After any OG change, the existing previews on phones will NOT refresh until that window expires. Workarounds:
    * Append a cache-bust query (`?v=2`) when re-sharing.
    * Use Facebook's Sharing Debugger / LinkedIn Post Inspector to force re-scrape.
    * Just wait — new chats pick up the fresh tags immediately.
* **Rule going forward:** any change to OG / Twitter meta MUST land in both the source HTML and the dist HTML in the same commit (or rebuild dist + commit). Bumping only the source guarantees a stale preview.

## 11. Phase 2 — Custom Offers, Cancellation Feedback, Pay It Forward
*Last updated: **2026-05-01***

* **Role:** Documents the operator-facing surface of the Phase 2 backend (commit `4060c92`). Driven by [`PRD_Phase2_Enhancements.md`](PRD_Phase2_Enhancements.md) at the repo root. Pure backend / API changes — frontend wiring still pending.

### Migrations 0018-0020 (must apply on droplet after deploy lands)
Three additive migrations shipped in `4060c92`. **Apply in numeric order via the standard SSH + `docker compose exec` recipe in §3** — the GHA deploy does NOT auto-run these:

```bash
ssh root@178.62.123.228 'bash -s' <<'EOF'
cd /var/www/lcp
docker compose exec -T api python -m scripts.apply_migration migrations/0018_add_offer_custom_text.sql
docker compose exec -T api python -m scripts.apply_migration migrations/0019_add_cancellation_feedback.sql
docker compose exec -T api python -m scripts.apply_migration migrations/0020_add_suspended_coffee.sql
EOF
```

| File | Adds |
|---|---|
| `0018_add_offer_custom_text.sql` | `offers.custom_text TEXT NULL` |
| `0019_add_cancellation_feedback.sql` | `cancellation_feedback` table (id, brand_id FK→brands CASCADE, reason CHECK in 7 values, details, acknowledged BOOLEAN, created_at) + `idx_cancellation_feedback_brand_created` |
| `0020_add_suspended_coffee.sql` | `cafes.suspended_coffee_enabled BOOLEAN DEFAULT FALSE` + partial index on `WHERE TRUE` + new `suspended_coffee_ledger` table (cafe_id FK→cafes CASCADE, event_type CHECK, units_delta CHECK <>0, donor_user_id FK→users SET NULL, barista_id FK→baristas SET NULL) + 2 append-only triggers |

All three are verified live against the local dev DB (commit-time evidence). Re-running against an already-migrated DB is safe (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP TRIGGER IF EXISTS` patterns throughout).

### Custom Offers
* New `offer_type` value `'custom'` joining the existing four (`percent`, `fixed`, `bogo`, `double_stamps`). For a custom offer, `custom_text` (max 280 chars) is the entire content; `target` and `amount` are accepted from the client but cleared at persist time. The b2b PromotionsView gets a fifth picker tile.
* Allow-list lives at the application layer (`app/models.py::OFFER_TYPES` + `app/schemas.py::OfferTypeLiteral` + `b2b-dashboard/src/lib/offers.ts`). Drift across the three is the most likely future bug — keep them in lockstep.

### Cancellation Feedback (intercept survey before Stripe portal)
* New endpoint `POST /api/b2b/cancellation-feedback` (Brand Admin JWT). The b2b dashboard's `BillingView::openPortal` (and `AddLocationDialog`'s portal CTA) MUST gate behind a survey modal that submits this endpoint before the Stripe-portal redirect fires. brand_id comes from JWT, never the body.
* Reasons are an enforced enum: `free_drink_cost / barista_friction / price_too_high / low_volume / feature_gap / closing_business / other`. `reason='other'` requires non-empty `details`. `acknowledged=true` is required (the cancel-at-period-end disclosure).
* No webhook / Stripe interaction at this layer — purely a UX gate that captures churn intelligence. Cancellations themselves still happen via the existing Stripe Customer Portal.

### Pay It Forward (Suspended Coffee)
* **Per-cafe opt-in.** `cafes.suspended_coffee_enabled BOOLEAN` defaults to FALSE. Toggle via the existing `PATCH /api/admin/cafes/{cafe_id}` partial-update path — `CafeUpdate` schema gained `suspended_coffee_enabled: bool | None`. A multi-location brand has independent toggles per shop.
* **Pool scope.** Drink-unit pool is scoped strictly to `cafe_id` (NEVER per-brand or platform-wide). PRD §4.5.3 architectural rule.
* **Ledger.** Append-only `suspended_coffee_ledger` table mirrors `stamp_ledger` semantics. Pool balance for a cafe is computed at read time as `SUM(units_delta) WHERE cafe_id = $1`. Floor (no negative pool) is enforced at the API layer inside a `SELECT … FOR UPDATE` transaction on the cafe row — NOT a CHECK constraint. Append-only triggers reject UPDATE/DELETE.
* **Endpoints (5 total).**

| Path | Auth | Notes |
|---|---|---|
| `POST /api/b2b/cancellation-feedback` | Brand Admin JWT | Survey persistence (above) |
| `GET /api/b2b/suspended-coffee/pool` | Venue API key | Returns `{cafe_id, enabled, pool_balance}` for the POS counter. Always responds; disabled cafes can still see historical balance. |
| `POST /api/b2b/suspended-coffee/donate-till` | Venue API key | Mode 2 — barista records N till-paid donations from one scan (1 ≤ N ≤ 10). Inserts one ledger row per unit (per-unit audit trail). 403 if cafe not enabled. |
| `POST /api/b2b/suspended-coffee/serve` | Venue API key | Decrements pool by 1. **Returns 409 `"Community pool is empty."` if balance < 1.** Cafe-row `FOR UPDATE` lock prevents concurrent serves draining last unit. 403 if cafe not enabled. |
| `POST /api/consumer/suspended-coffee/donate-loyalty` | Consumer JWT | Mode 1 — atomic 3-row insert: REDEEM stamp_ledger (-10) + REDEEMED global_ledger (qty=1, for /me/history) + donate_loyalty suspended_coffee_ledger (+1). Brand-scoped via existing `_scoped_balance_stmt`. 400 if balance < 10. 403 if cafe not enabled. |

### Operational gotchas
* **Greppable log markers** for ops triage:
    * `CANCELLATION-FEEDBACK brand_id=… reason=… has_details=…` per survey submission
    * `PIF-DONATE-TILL cafe_id=… count=… new_balance=…` per Mode-2 donation
    * `PIF-SERVE cafe_id=… prev_balance=… new_balance=…` per serve
    * `POOL-INTEGRITY suspended_coffee_ledger sum is negative…` — should never fire; alert if it does.
* **Three places that must stay in lockstep when the offer-type catalogue evolves.** `app/models.py::OFFER_TYPES`, `app/schemas.py::OfferTypeLiteral`, `b2b-dashboard/src/lib/offers.ts`. Same pattern applies to amenity catalogue + cancellation reasons.
* **Migration application is manual** (per §3) — apply 0018, 0019, 0020 on the droplet AFTER the next GHA deploy lands. Until then, Phase 2 endpoints will 500; existing endpoints unaffected.

---

## 12. Geospatial Routing (geopy / Nominatim)
*Last updated: **2026-05-02***

* **Role:** Resolves cafe `address` strings into `(latitude, longitude)` pairs so the consumer Discover view can compute Haversine distances and sort by proximity. Also powers the b2b "Add location" address autocomplete combobox. Replaces the placeholder `mockDistanceMiles(cafe.id)` deterministic-hash distances the founder spotted in E2E testing.
* **Vendor:** [Nominatim](https://nominatim.org) — OpenStreetMap's free geocoding service. Accessed via the Python `geopy` library (`Nominatim` adapter).
* **Why Nominatim, not Google/Mapbox:** zero-cost, no API key, no card on file. Trade-off is the rate limit (1 req/sec) and a contactable User-Agent requirement. Fine for a low-volume cafe-creation path; if/when we need higher throughput (e.g. consumer-app reverse-geocoding their current location), swap to a paid provider — the helper module is the single seam.
* **Helper module:** `app/geocoding.py`
    * `geocode_address(address: str | None) → (lat, lon) | (None, None)` — single-best-match resolver. Wrapped in `asyncio.to_thread` so the sync `geopy.Nominatim.geocode` call doesn't block the FastAPI event loop. **Fail-soft contract: any error path returns `(None, None)`, never raises.** Cafe create/update will still commit the row even if Nominatim is down.
    * `geocode_suggest(query: str | None, limit: int = 5) → list[str]` — returns the top N formatted address strings for autocomplete. Capped at 10 server-side; minimum 3-character query (shorter returns `[]`).
* **User-Agent header (mandatory by Nominatim's policy):** `LocalCoffeePerks/1.0 (geocoder; ops@localcoffeeperks.com)` — set inside `_USER_AGENT` constant. Don't blank it; Nominatim will silently rate-limit anonymous traffic far more aggressively.
* **Rate-limit policy:**
    * Live cafe-create / cafe-update path: a single geocode per save → naturally well within the 1 req/sec cap (an admin can't physically create cafes that fast).
    * Autocomplete: caller (b2b-dashboard `AddressAutocompleteInput`) debounces user input at **800 ms** + cancels in-flight requests via `AbortController` → at most one in-flight request per ongoing typing session.
    * Backfill script: explicit `await asyncio.sleep(1.5)` between calls (`scripts/backfill_geocodes.py`).

### Where geocoding fires in the codebase
* **`POST /api/admin/cafes`** (`create_cafe` in `app/main.py`) — geocodes the trimmed `address` immediately before the `Cafe(...)` insert. Failed lookup → row commits with `latitude=NULL, longitude=NULL` (consumer app falls back to mock distance for that row until the address is re-saved).
* **`PATCH/PUT /api/admin/cafes/{cafe_id}`** (`update_cafe`) — re-geocodes only when the `address` field actually changes. Avoids burning a Nominatim request on edits to phone / hygiene rating / amenities.
* **`POST /api/admin/platform/cafes`** (`platform_create_cafe`, super-admin override path) — same fail-soft geocode-on-create.
* **`GET /api/b2b/geocode/autocomplete?q=...`** — admin-JWT-guarded autocomplete endpoint. Returns `{"suggestions": ["..."]}` with up to 5 formatted addresses. 422 on `q` shorter than 3 chars; empty list on Nominatim failure (caller treats this as "no suggestions yet, keep typing").

### Backfill script — `scripts/backfill_geocodes.py`
* **Purpose:** populate `(latitude, longitude)` on legacy cafe rows that pre-date the geocoding wiring (e.g. seeded via `scripts/seed_local_dev.py` before commit `acde1f2`, or any production rows from before the 2026-05-02 push).
* **Behavior:** raw-SQL `SELECT id, name, address FROM cafes WHERE latitude IS NULL ORDER BY created_at ASC` → loops, calls `geocode_address`, raw-SQL `UPDATE cafes SET latitude=…, longitude=…` per row, commits each. Sleeps 1.5 s between calls. Uses raw SQL deliberately (not ORM) so the script works on dev DBs that haven't applied every migration up to HEAD — only `id/name/address/latitude/longitude` columns are touched and those have all existed since migration 0010.
* **Idempotent:** re-runs are no-ops if every row already has coords.
* **How to run:**
    ```bash
    # locally (against docker-compose db)
    docker compose exec -T api python -m scripts.backfill_geocodes
    # on the droplet
    ssh root@178.62.123.228 'cd /var/www/lcp && docker compose exec -T api python -m scripts.backfill_geocodes'
    ```
* **Verification:** 2026-05-02 NULLed Monmouth's coords locally → script re-resolved them to `(51.5055145, -0.0914602)`. End-to-end proven before push.

### Operational gotchas
* **`geopy` is a new pip dep.** Added to `requirements.txt` in commit `acde1f2`. After deploy, the API container needs a rebuild (the GHA workflow already runs `docker compose up --build`, so this happens automatically — no manual step). On a stale image, `_resolve_sync` short-circuits to `(None, None)` and existing rows are unaffected, but new geocodes won't fire.
* **DigitalOcean does NOT block outbound HTTPS to Nominatim.** Unlike SMTP (see Section 4), port 443 is open. Confirmed with the local rebuild + first successful geocode of Monmouth.
* **Don't hammer Nominatim from the consumer app.** Any future "search nearby cafes" feature on the consumer side should NOT call Nominatim directly — it'd burn the cap fast. Reverse-geocoding the device location into a postcode for "Find cafes near…" should land on a paid provider before we ship that feature.
* **Greppable log markers:**
    * `geocode_address failed for 'addr…': <exception>` — single-resolver failure (cafe save still commits).
    * `geocode_suggest failed for 'query…': <exception>` — autocomplete failure (UI shows "no matches" hint, not an error toast).
    * `geocode_address: geopy not installed — skipping geocode` / `geocode_suggest: geopy not installed — returning empty list` — fired when the running container doesn't have `geopy` (stale image).

---

## 13. Consumer App Persistent Login
*Last updated: **2026-05-02***

* **Role:** Keeps consumer-app users signed in for the full life of their JWT (365 days) across force-quits, OS reboots, and low-memory app evictions. Founder direction 2026-05-02 after E2E testing showed users were getting kicked out aggressively because (a) the consumer JWT inherited the short web-session TTL and (b) the React Native session lived only in memory.
* **Backend — per-audience JWT TTL (`app/tokens.py`):**
    * `_encode(claims, ttl_seconds=None)` accepts an optional override; default behaviour for `admin` / `store` / `super-admin` / `brand-invite` audiences is unchanged (still uses `settings.jwt_ttl_hours`).
    * `encode_consumer(...)` pins the consumer audience to `_CONSUMER_TTL_SECONDS = 365 * 24 * 3600`.
    * **Web JWTs stay short on purpose** — the b2b-dashboard + admin-dashboard run in browsers where token theft via XSS/extension is a real risk and a 365-day session would be a large blast radius. The native consumer app stores its token in iOS Keychain / Android Keystore via SecureStore, so the same risk profile doesn't apply.
* **Consumer app — secure storage (`consumer-app/src/sessionStorage.ts`):**
    * Wraps `expo-secure-store` (added to `package.json` as `~15.0.7`) with three helpers: `loadSession()` / `saveSession(s)` / `clearSession()`. Defensive shape-check on read — malformed payloads from a partial write get dropped, not propagated.
    * Web is a no-op (every helper short-circuits on `Platform.OS === "web"`). Production target is iOS + Android; `expo start --web` continues to work but doesn't persist sessions.
* **App lifecycle (`AppShell` in `consumer-app/App.tsx`):**
    1. Cold launch → `loadSession()` runs in a `useEffect` while the existing splash spinner is on screen; sets a `hydrated` flag when done.
    2. Until `hydrated` is true, the app shows the same splash spinner the font-gate uses → users with a stored session never see a flash of LoginScreen.
    3. Whenever `setSession(...)` runs (sign-in, sign-out, profile-edit), a `useEffect` mirrors the new state to SecureStore (`saveSession` if non-null, `clearSession` if null). Sign-out wipes the stored copy so a stale token never resurrects on the next launch.
* **Native rebuild required:** `expo-secure-store` ships native code (Keychain / Keystore bindings). The next dev-client / TestFlight / Play-internal build must be rebuilt (`npx expo prebuild` + `run:ios` / `run:android`) before the persistent-login path goes live on device. Until then, `Platform.OS` checks pass fine but the SecureStore module isn't bundled — `loadSession` returns `null` and behaviour matches the old in-memory session.
* **Token-expiry edge case:** if a user's stored JWT expires (e.g. they don't open the app for 366 days), the API will start returning 401 on every call. The current behaviour is "they stay on screen but every call errors" — they have to manually sign out + back in. We deliberately did NOT wire automatic 401-clears-session because it adds complexity that isn't worth it for an event that happens after a year of inactivity.
* **Storage key:** `lcp.consumer.session.v1` — versioned suffix so we can break-change the persisted shape later without tripping over old payloads.

---

## 14. Consumer Discover — amenity filter UX
*Last updated: **2026-05-02***

* **Role:** Documents the Discover-tab amenity filter so a future redesign doesn't accidentally regress the filter contract. Founder direction 2026-05-02: **dropdown / bottom-sheet, not horizontal pills** + a synthetic "Pay It Forward" filter row.
* **Component:** `consumer-app/src/AmenitiesFilterModal.tsx` — bottom-sheet `<Modal>` with a drag-handle, scrollable checklist of amenity rows, and a footer that has a prominent mint "Show Cafés · N filters" primary CTA + a smaller "Clear all" secondary text link beneath. Trigger = `AmenityFilterTrigger` button in the Discover header (mint when filters are active, with a count badge).
* **Draft / Apply pattern:** toggling rows mutates a local `draft` Set, NOT the parent's `activeAmenities`. Closing the sheet without tapping "Show Cafés" discards the draft. Apply commits the new set + closes the sheet.
* **Filter logic:** AND-match across selected amenities. A cafe must satisfy *every* selected filter to appear in `visibleCafes`.
* **Pay It Forward — synthetic filter:**
    * **Lives in the catalogue, not on the wire.** `consumer-app/src/amenities.ts` exports `PAY_IT_FORWARD_FILTER_ID = "pay_it_forward"` and includes it in `AMENITIES` so the filter sheet renders it as a regular checkbox row (HandHeart icon).
    * **Cafes never carry `pay_it_forward` in `cafe.amenities` arrays.** It's derived at filter time from `cafe.suspended_coffee_enabled` (the per-cafe Pay It Forward toggle from migration 0020 + Settings → Community Board card).
    * `DiscoverView::availableAmenityIds` adds `PAY_IT_FORWARD_FILTER_ID` to the available set when any local cafe has `suspended_coffee_enabled=true`. `visibleCafes` special-cases the id and resolves membership against `cafe.suspended_coffee_enabled` instead of `cafe.amenities.includes(...)`.
    * **DiscoverCafeCard amenity chips + CafeDetailsModal are unchanged.** They iterate `cafe.amenities` only, so the synthetic id never accidentally renders as a regular chip. The Community Board badge (separate component) still drives the per-card visual signal for participating cafes.
* **Don't add `pay_it_forward` to b2b-dashboard's amenity picker.** It's consumer-side filter sugar only. The backend amenities catalogue (`b2b-dashboard/src/lib/amenities.ts`) lists the genuine amenities operators can tag a cafe with; Pay It Forward's wire-level signal is the boolean toggle on the cafe row.

## 15. Frontend dist deploy rule (Nginx serves committed bundles)
*Last updated: **2026-05-02 (later)***

* **All three SPAs ship via committed `dist/` directories** served by Nginx on the droplet — no build step runs server-side. Source-only commits are deploy no-ops.
    * `b2b-dashboard/dist/` → `dashboard.localcoffeeperks.com`
    * `admin-dashboard/dist/` → `hq.localcoffeeperks.com`
    * `main-website/dist/` → `localcoffeeperks.com` (apex)
* **After every source change in any of those three trees, run `npm run build`** in that directory (which runs `tsc -b && vite build`) before committing. Stage source AND the regenerated dist files in the same commit — Vite emits new hash-named bundles (`assets/index-XXXX.js`) and removes old ones, so `git add dist/` picks the diff up.
* **Verify the deploy canary** before pushing. Pick a string the source change introduced (e.g. "Ready to scan" for the always-on-camera POS work) and confirm it lands in the new bundle: `grep -c "<canary>" b2b-dashboard/dist/assets/index-*.js`. Confirm the OLD canary is gone too.
* **Lesson learned 2026-05-02:** commit `16fb8c1` shipped the always-on-camera POS source but left the dist stale. The live POS kept showing "Start camera" for days until commit `65d1d82` rebuilt the bundle. The OG-preview bug (Section 10) hit the same way — source-only edits don't reach scrapers/clients when Nginx serves the static dist.
* **Same rule for the marketing site share previews** (Section 10) — when changing OG/Twitter meta, edit BOTH `main-website/index.html` AND `main-website/dist/index.html` (or rebuild). Skip one and the live page diverges from social-card scrapers.

## 16. Super-Admin AI Surfaces — Curated /ai-agent + Text-to-SQL /ask-db
*Last updated: **2026-05-03***

* **Vendor:** OpenAI (HTTPS API). Reuses the same `OPENAI_API_KEY` env var both endpoints already pick up via `app/database.py::settings.openai_model` (default `"gpt-4o-mini"`). **Key MUST live only in `/root/.env-lcp-production` (root-owned, mode 600) — never paste it into chat, code, commit messages, or memory files. Rotate immediately if exposed at https://platform.openai.com/api-keys.**
* **Two complementary endpoints** under `/api/admin/platform/*`, both gated by `Depends(get_super_admin_session)`:
    * **`POST /ai-agent`** (`app/main.py`, shipped earlier) — curated chat assistant. Hand-picked live metrics block (Total Customers, MRR, Top Performing Cafe, etc.) injected into the system prompt; the LLM answers in prose. Fast, narrow, safe by construction (no DB access from the LLM's side).
    * **`POST /ask-db`** (`app/super_admin_ai_sql.py`, NEW 2026-05-03) — broad Text-to-SQL. Two-pass LLM: pass 1 generates Postgres SQL from a hand-curated schema context; pass 2 summarizes the executed rows. Slower (~2 LLM round-trips + a DB query) but answers anything in the schema. Response shape: `{ reply, sql, rows, row_count, truncated }`.
* **Four-layer safety on `/ask-db`:**
    1. **Auth** — super-admin JWT, same as every other `/api/admin/platform/*` route.
    2. **Static SQL allow-list** — must lead with `SELECT`/`WITH`; rejects `INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT/REVOKE/CREATE/MERGE/COPY/EXECUTE/CALL/VACUUM/ANALYZE/REINDEX/CLUSTER/DISCARD/LOAD` anywhere (word-boundary regex so `created_at` doesn't false-trigger); rejects multi-statement (semicolon-then-non-whitespace); strips one trailing `;`; strips ` ```sql … ``` ` markdown fences.
    3. **DB-level read-only** — `SET TRANSACTION READ ONLY` issued before the SELECT in a fresh transaction. Postgres throws SQLSTATE 25006 on any DML attempt. Belt-and-braces because the LLM is non-deterministic and the static check is a regex.
    4. **Row cap** — `MAX_ROWS_RETURNED = 200` server-side; summary LLM only sees the first 50 rows for token cost. Response carries `truncated: bool` so the frontend can render a "(truncated)" pill.
* **Schema context (`_SCHEMA_CONTEXT` in `super_admin_ai_sql.py`):** brands / cafes / users / stamp_ledger / global_ledger / offers / cancellation_feedback / suspended_coffee_ledger / baristas with key columns, ENUM values, FK arrows, and the case-sensitivity gotchas (`stamp_ledger.event_type` UPPER, `subscription_status` / `scheme_type` / `global_ledger.action_type` lower, `global_ledger."timestamp"` must be quoted). When migrations land that add a column the founder is likely to query against (e.g. `cancel_at_period_end`), update the schema context AND this section in lockstep.
* **Frontend** (`admin-dashboard/src/components/ChatWidget.tsx`): switched from `postAiAgent` → `postAskDb` 2026-05-03. Assistant bubbles render an optional `DataReceipt` collapsible — "Based on N rows" chip → expand to see the SQL in mono. **Founder direction: every answer must be auditable.** The `/ai-agent` endpoint stays alive for future surfaces (dashboard cards, mode toggle, etc.).

---

## Change log
*Append a single line per change, newest at the top, in the form `YYYY-MM-DD — section — what changed`.*

* **2026-05-03** — Section 16 added (Super-Admin AI Surfaces). New `POST /api/admin/platform/ask-db` (commit `61c1853`) — Text-to-SQL Data Assistant in `app/super_admin_ai_sql.py`. Two-pass LLM with hand-curated schema context + four-layer safety (auth, SELECT-only static allow-list with word-boundary keyword guard, `SET TRANSACTION READ ONLY` execution, 200-row cap). Frontend ChatWidget switched from `postAiAgent` → `postAskDb`; assistant bubbles now render a collapsible "Based on N rows" + SQL pre. Curated `/ai-agent` endpoint stays alive — they're complementary surfaces. **Operator security note:** the `OPENAI_API_KEY` MUST live only in `/root/.env-lcp-production`; never paste in chat / commits / memory. Rotate immediately if exposed (https://platform.openai.com/api-keys).
* **2026-05-03** — Section 2 (Stripe Billing) — cancel + reactivate lifecycle wired end-to-end inside the b2b dashboard (commits `44a12c9` initial cancel, `8d076b4` reactivate + Lame Duck + Hard Wall). Migration 0021 adds `brands.cancel_at_period_end`. New endpoints: `POST /api/billing/cancel` (renamed from `/cancel-subscription`; calls `stripe.Subscription.modify(cancel_at_period_end=True)`, NEVER immediate cancel) and `POST /api/billing/reactivate` (`cancel_at_period_end=False`; 409 when grace window already elapsed). New `customer.subscription.updated` webhook handler keeps the flag in lockstep when the owner toggles via the Stripe Portal directly. UI surfaces (b2b-dashboard): sticky un-dismissible Lame Duck banner sitewide via `App.tsx` while `cancelAtPeriodEnd` is true; full-screen `InactiveSubscriptionView` Hard Wall replaces the dashboard when `subscription_status === 'canceled'`. SettingsView reorged — Provide Feedback to right column (replacing the removed Loyalty Scheme picker), Account Management as a full-width row at the page bottom. CancellationFeedbackModal rewritten — empathetic copy, destructive Confirm Cancellation button, no Stripe Portal redirect. Feedback subject = `[LCP Feedback] New Submission from <Brand Name>`. Barista POS UI lockout NOT shipped — backend already 402s every scan via the `cafes.billing_status` cascade.
* **2026-05-02 (latest)** — Section 4 (Email) — founder-locked template copy refreshed in commits `96294f6` (welcome Step 2/3 rewritten — "Set up your locations" + "Launch the Barista POS" replaces logo-upload + QR-table-talkers boilerplate that didn't match the product) and `d7b0142` (OTP subtext tightened; shared `_wrap()` footer replaces invite-specific boilerplate with generic "automated security message — do not reply" so OTP / password-reset emails read correctly). New B2B feedback ack added to the recipient list — `POST /api/b2b/feedback` (admin JWT) emails `hello@localcoffeeperks.com` via the existing `send_email` transport.
* **2026-05-02 (latest)** — Section 15 added (Frontend dist deploy rule). Documents the source-only-is-a-no-op pitfall: all three SPAs (b2b, admin, main-website) ship via committed `dist/` directories — `npm run build` MUST run after every source change. Lesson came from commit `16fb8c1` shipping the always-on-camera POS source but leaving the dist stale; the live POS kept showing "Start camera" for days until commit `65d1d82` rebuilt the bundle. Includes a deploy-canary grep recipe.
* **2026-05-02 (latest)** — Section 2 (Stripe Billing) — two architectural rules added. **Tier MUST be threaded from `brand.scheme_type`, never defaulted** — fixes a bug class where `createCheckout(token)` with no tier defaulted to `"private"` and the webhook then silently overwrote a Global brand to Private (commit `65d1d82` fixed both call sites: SetupView Step 3 + App.tsx::handleAddLocation). **Plan-change is in-place** — tier swaps POST to `/api/billing/plan-change` directly + toast (commit `86fdf8a`); Stripe Checkout is reserved for first-cafe signup. Manage Payment Method opens the Customer Portal directly; cancellation survey now lives ONLY behind Settings → Account Management. New `b2b-dashboard/src/components/PlanChangeConfirmationDialog.tsx` frames math as "next invoice" — no more "IMMEDIATE CHARGE TODAY" framing.
* **2026-05-02 (later)** — Section 14 added (Consumer Discover amenity filter UX). Bottom-sheet replaces the horizontal pill ScrollView (founder direction). New synthetic `pay_it_forward` filter — lives in `AMENITIES` catalogue but is derived from `cafes.suspended_coffee_enabled`, never appears in any `cafe.amenities` array on the wire. AND-match filter contract + draft/Apply commit pattern documented so future redesigns don't accidentally regress. Don't add the id to b2b-dashboard's amenity picker — consumer-only filter sugar. Commits `71ff40d` (initial bottom-sheet) and `ebe6e2f` (Pay It Forward + Show Cafés CTA polish).
* **2026-05-02 (later)** — Section 13 added (Consumer App Persistent Login). Backend `_encode` accepts per-audience `ttl_seconds`; `encode_consumer` pinned to 365 days. Web JWTs (admin / store / super-admin / brand-invite) keep `settings.jwt_ttl_hours`. `expo-secure-store ~15.0.7` added to `consumer-app/package.json`; new `src/sessionStorage.ts` wraps load/save/clear with shape-check + web no-op. AppShell hydrates from SecureStore on cold launch (splash spinner during async read), then mirrors every `setSession` call to storage. Native rebuild needed before the path goes live on device. Commit `71afd25`.
* **2026-05-02** — Section 12 added (Geospatial Routing — geopy/Nominatim). New `app/geocoding.py` (geocode_address, geocode_suggest) wraps geopy/Nominatim via `asyncio.to_thread` with fail-soft semantics. `geopy` added to `requirements.txt`. `create_cafe` / `update_cafe` (re-geocodes only when address changes) / `platform_create_cafe` populate `cafe.latitude` + `cafe.longitude` on save. `GET /api/b2b/geocode/autocomplete?q=...` powers a debounced (800 ms, AbortController-aware) combobox in b2b-dashboard's `AddLocationDialog` + `EditLocationDialog` (shared `AddressAutocompleteInput` component); replaces the 10-row mock corpus. New `scripts/backfill_geocodes.py` walks `WHERE latitude IS NULL` rows, sleeps 1.5 s between Nominatim calls, uses raw SQL on the touched columns so it survives partial-schema dev DBs. Verified end-to-end against local Postgres (Monmouth NULLed → re-resolved to 51.5055, -0.0915). Section 2 also gained a "Super-Admin Stripe invoice surfacing" subsection: `GET /api/admin/platform/brands/{brand_id}/invoices` thinly wraps `stripe.Invoice.list` and feeds the admin-dashboard `BrandInvoicesModal` accordion (proration line items + hosted-invoice link). Commit `ebe6e2f`.
* **2026-05-02** — Section 2 (Stripe Billing) — pro-rata simplified. Stripped the 1st-of-month `trial_end` anchor + 48h floor guard from `create_checkout` (was producing "29 days free" edge cases). Cycle now anchors to the day of signup. `sync_subscription_quantity` keeps `proration_behavior="create_prorations"` but explicitly does NOT call `Invoice.create` for mid-cycle quantity bumps — prorations roll onto the brand's next natural invoice (co-termed). `AddLocationDialog` already gated the brand-new Checkout redirect on `!wasActive` so active brands don't re-checkout on Add Location; behaviour preserved. Commit `acde1f2`.
* **2026-05-01 (Phase 2)** — Section 11 added (Custom Offers, Cancellation Feedback, Pay It Forward) — operator-facing reference for commit `4060c92`. Documents the 5 new endpoints, the per-cafe `suspended_coffee_enabled` opt-in toggle, the cafe-scoped pool architectural rule, and the migration-application checklist. Section 3 (DigitalOcean) — added explicit "migrations are NOT auto-applied" note + the SSH + `apply_migration` recipe operators must run after any deploy that ships new migrations.
* **2026-05-01 (later)** — Section 4 (Email) — added intentional-dev-shim note: `app/consumer_auth.py` `saeed@test.com → OTP 1234` hardcode is permanent dev-test path per founder, not a future-cleanup item.
* **2026-05-01 (later)** — Sections 2 (Stripe Billing) + 9 (Super-Admin Auth) — three-task batch (commit `29b8c09`):
    1. Section 9: the temporary `GET /api/admin/platform/seed-super` bootstrap endpoint was DELETED from `app/main.py` (prod already bootstrapped + password rotated; residual unauth'd-endpoint footprint closed).
    2. Section 2: `/api/billing/plan-change` wired to real Stripe API. `SubscriptionItem.modify(price, proration_behavior="create_prorations")` for both upgrade + downgrade. Upgrade additionally calls `Invoice.create + Invoice.pay` for immediate prorated charge; downgrade lets the credit ride to the next monthly invoice. `_resolve_plan_change_price_id` maps `starter→PRIVATE_PRICE_ID`, `pro→GLOBAL_PRICE_ID`, returns 422 for `premium` (not yet provisioned). `brand.scheme_type` synced post-Stripe-success. Stripe call wrapped in try/except StripeError → 502 with reason.
    3. Section 1 sidecar: the deployed waitlist Apps Script is now mirrored at `marketing/waitlist-script/Code.gs` + `README.md` so the repo holds the audit trail. Section 1 hardening confirmed ✅ live in prod (operator manually deployed via "Manage Deployments → New Version" earlier 2026-05-01).
* **2026-05-01** — Section 1 (Google Apps Script) — major hardening. `doPost` now wraps the sheet append in try/catch, sends a per-signup success-notification HTML email to `hello@localcoffeeperks.com`, and on append failure fires an "URGENT: Waitlist Error" email with the raw payload + error + stack trace so leads are never lost. `SHEET_HEADERS` constant added for stable column ordering; trailing `raw_payload` column captures the full JSON blob for schema-drift safety. `doGet` also try/catch-wrapped (read failure returns `{error}` which the frontend treats as "hide counter"). MailApp quota + CORS-preflight (`text/plain` Content-Type) + ContentService 200-only HTTP-status caveats documented. Code provided to operator 2026-05-01 — deployment via "Manage Deployments → New Version" pending.
* **2026-04-30 (late)** — Section 4 (Email) — brand-invite template rewritten per the founder's spec. New subject *"Welcome to Local Coffee Perks! Let's get you set up."*; greeting *"Welcome to the family, {cafe_owner_name}!"* (with no-name fallback); 3-step guide with mint-numbered circles (Secure your account / Upload logo / Print QR table-talkers); "Finish Setting Up My Cafe →" CTA; *"Made for independents, by independents."* sign-off. `send_brand_invite_email()` signature gained optional `cafe_owner_name`; the handler in `main.py` derives it from `brand.owner_first_name` + `brand.owner_last_name`.
* **2026-04-30 (late)** — Section 9 (Super-Admin Auth) — consolidated "Add New Brand" modal replaces the 2-step Add Brand + Invite Brand Admin flow; `AdminCreateBrandRequest` schema now accepts optional `owner_first_name` / `owner_last_name`; admin name is split client-side on last space and persisted to `brand.owner_first_name`/`_last_name`. Standalone `InviteAdminModal` kept unrouted for a future per-row resend action. New `/api/auth/super/change-password` + `/api/auth/super/create` routes wired into a new admin-dashboard `Settings` tab (`SettingsPage.tsx`).
* **2026-04-30 (late)** — Section 2 (Stripe Billing) — pro-rata behavior documented + wired. Initial signup via `create_checkout` now sets `subscription_data.trial_end = first-of-next-month UTC` (with 48h-floor guard for the last 1-2 days of any month). Mid-cycle quantity changes already had `proration_behavior="create_prorations"`; comment block reinforces why. `/plan-change` remains a structured-log mock with explicit Stripe-call template in the docstring. The Stripe call is now wrapped in `try/except StripeError` so failures surface the real reason in api logs and return 502 instead of 500.
* **2026-04-30 (eve)** — Section 4 (Email & Transactional Delivery) — vendor migration Google Workspace SMTP → **Resend** (✅ confirmed live with first successful `EMAIL SENT via Resend id=re_...` log line). DigitalOcean blocks all outbound SMTP (ports 25/465/587) on the droplet, confirmed via `[Errno 101] Network is unreachable` from inside the api container — making Gmail SMTP unworkable on prod. Resend's HTTPS API at `api.resend.com:443` bypasses the block. New env var `RESEND_API_KEY` (must be set on `/root/.env-lcp-production`); SMTP fallback preserved for local dev. Sending domain `localcoffeeperks.com` requires 3 DNS records (1 TXT + 2 CNAMEs) before non-test sends work.
* **2026-04-30** — Section 9 (Super-Admin Auth & Onboarding Pipeline) — added. Marketing Site Share Previews bumped to Section 10. Documents the new `super_admins` table (migration 0017), `POST /api/auth/super/login` JWT (`aud="super-admin"`), `Depends(get_super_admin_session)` guard wired onto `invite-brand-admin`, the canonical `/api/auth/brand/setup` route (deprecated alias `/admin/setup`), and the end-to-end super-admin → brand-owner pipeline. Local dev seed `admin@localcoffeeperks.com` / `password123` lives in `scripts/seed_local_dev.py`.
* **2026-04-30** — Section 4 (Email & SMTP) — vendor migration Zoho → Google Workspace. Backend now sends transactional email via `app/email_sender.py` (stdlib `smtplib` + `email.mime`) against `smtp.gmail.com:465 SSL`. New env vars: `SMTP_HOST/PORT/USE_SSL/USERNAME/PASSWORD/FROM`. **`SMTP_PASSWORD` (Google App Password) MUST be added to `/root/.env-lcp-production` before live transactional email works** — falls back to stdout stub otherwise. Three templates shipped: brand invite, consumer OTP, brand password reset, all on Espresso/Mint chrome. Legacy Zoho config preserved at the bottom of Section 4 for rollback.
* **2026-04-29** — Section 9 (Marketing Site Share Previews) — added. Documents the four HTML entry points (main-website + waitlist-page, source + dist), the Lovable-OG bug that leaked into WhatsApp previews until commit `90a4c50` synced the dist files, the canonical OG / Twitter block, the `scripts/build_og_image.py` 1200×630 generator, scraper cache-bust workarounds, and the lockstep rule (source + dist must change together).
* **2026-04-28** — Section 8 (Brand Manifesto / Master Context Document) — added. Canonical brand identity, target audience pivot to 30–50-year-olds, "Starbucks Gap" framing, RWRD/Joe competitor contrast, Espresso+Mint palette + Fraunces/Inter fonts, "Buy 10 get 11th free" mechanic, global-ambition note. Repo-side mirror = `reference_brand_manifesto.md` memory.
* **2026-04-28** — Section 7 (B2B Pricing Policy & Founding 100) — added. Founding 100 = combined cap (Private £5 / LCP+ £7.99); post-100 = £9.99 / £12.99. Per-location, not per-brand. Loyalty mechanic locked at strict `> 10` ("Buy 10, get 11th free", NOT 9/10). No profit-sharing, no consumer charges.
* **2026-04-28** — Section 5 (App Store & Google Play) — major update. CRN received from Companies House. D-U-N-S requested via Apple's lookup tool (5–14 day SLA). Founder's personal Apple ID used for the request — harmless because D-U-N-S binds to the company, not the Apple ID. Both stores blocked on D-U-N-S (Google now also requires it for Org accounts). Cost rundown (£79/yr Apple, $25 one-time Google) + post-arrival enrollment plan documented.
* **2026-04-28** — Section 2 (Stripe Billing) — clarified that the two live price IDs are **Founding 100** prices (£5 / £7.99). Post-Founding-100 prices (£9.99 / £12.99) need new Stripe Price IDs — not yet created. Cross-references new Section 7.
* **2026-04-28** — Section 0 (Build & Engineering Credit) — added. Documents that all building / coding / implementation work on Local Coffee Perks is done by Claude Code (Anthropic's official CLI for Claude); humans direct, Claude executes.
* **2026-04-27** — Section 6 (Vehicle Marketing Assets) — added. Four production-ready SVG decals saved to `/marketing/stickers/` (hood, driver-door, passenger-door, bumper) plus a README. Each SVG references a sibling `qr.png` via relative `<image>` tag; brand palette `#1A1412` / `#00E576` / `#FFFFFF` documented as the source of truth.
* **2026-04-27** — Section 4 (Zoho Mail) — fleshed out: full Apple Mail manual config (IMAP `imappro.zoho.eu:993` / SMTP `smtppro.zoho.eu:465`, both SSL on, App-Specific Password), iOS-profile-corruption nuke-and-rebuild fix, multi-device per-device App Password rule.
* **2026-04-27** — Section 3 (DigitalOcean) — documented persistent `/root/.env-lcp-production` env-injection pattern, GHA `push:main` deploy trigger, the 20s-wait-then-clear lock guard in deploy.yml, the three Nginx subdomains, and the UFW ruleset.
* **2026-04-27** — Section 1 (Google Apps Script) — added "no mock fallback" frontend consumption rule: the social-proof count is hidden if the GAS fetch is in flight or fails, never substituted with a baseline number.
* **2026-04-27** — Ledger initialised with sections 1–5 (Google Apps Script, Stripe, DigitalOcean, Zoho Mail, App Store / Google Play pending).

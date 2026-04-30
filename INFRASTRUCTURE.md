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
*Last updated: **2026-04-27***

* **Role:** Captures early waitlist signups and serves the live counter to the marketing website.
* **Configuration:** A single Google Apps Script deployed as a Web App.
* **Functions:**
    * `doPost(e)`: Captures form submissions from the landing page and appends them to the sheet. **(CRITICAL: Do not delete or overwrite this).**
    * `doGet(e)`: Returns the live row count as JSON (`{"waitlist_count": X}`) for the frontend to display.
* **Deployment Rule:** Must be updated via "Manage Deployments -> New Version" to preserve the existing Web App URL.
* **Frontend consumption rule (added 2026-04-27):** the waitlist marketing page hides the social-proof count entirely while the GAS fetch is in flight or has failed. There is **no mock baseline** — the displayed number is always the real `waitlist_count`, even single digits or zero, or nothing at all. Don't reintroduce a fallback floor.

## 2. Stripe Billing (Test Mode)
*Last updated: **2026-04-28***

* **Role:** Handles the per-cafe subscription billing. Tier pricing is governed by the **Founding 100** policy — see Section 7 for the full pricing tier rules.
* **Environment:** Currently running in Test Mode (using `pk_test_...` and `sk_test_...` keys).
* **Webhook Setup:**
    * Endpoint: `https://dashboard.localcoffeeperks.com/api/stripe/webhook`
    * Listening exclusively for: `checkout.session.completed`
    * Secured via Webhook Signing Secret (`whsec_...`) stored in `.env`.
* **Products (Founding 100 tier — currently active):**
    * Private Plan (£5.00/mo) - ID: `price_1TQmMjLjDXRzQll0GUGlguhU`
    * LCP+ Global Pass (£7.99/mo) - ID: `price_1TQmN6LjDXRzQll0SvQedP4d`
* **Post-Founding-100 prices (NOT yet created in Stripe):** Once the combined 100 founding signups are sold, two new Stripe Price IDs need to be created — Private at **£9.99/mo** and LCP+ Global at **£12.99/mo** — and the droplet env vars `STRIPE_PRIVATE_PRICE_ID` / `STRIPE_GLOBAL_PRICE_ID` swapped to the new IDs. Existing founding-tier subscriptions stay on their original price (Stripe pegs each subscription to the price ID it was created with), so the swap only affects new signups. Add a Change-log line when the cutover happens.

## 3. Server & Deployment (DigitalOcean)
*Last updated: **2026-04-27***

* **Role:** Live production hosting for the FastAPI backend.
* **Specs:** 2GB Dedicated Droplet (IP `178.62.123.228`).
* **Base URL:** `https://dashboard.localcoffeeperks.com`
* **Environment Variables:** Stripe keys, Webhook secrets, and Database URIs are stored in the persistent file `/root/.env-lcp-production` (root-owned, mode 600). The deploy script copies this file to `/var/www/lcp/.env` before each `docker compose up` so the API container sees the latest values. Add new env vars by `ssh`-editing the persistent file, NOT the working-tree `.env` (which gets clobbered every deploy).
* **Deploy trigger:** GitHub Actions on every push to `main` (`.github/workflows/deploy.yml`) — SSHes the droplet, pulls latest, restores `.env` from the persistent copy, rebuilds the API container.
* **Deploy script lock handling (added 2026-04-27):** the deploy.yml waits up to 20 seconds (10 × 2s) for any in-flight `.git/index.lock` to clear before its own `git fetch`, then force-removes a lingering lock so a one-off race (e.g. a manual SSH `git fetch` colliding with the scheduled deploy) can't permanently break a deploy.
* **Subdomains served by the droplet's Nginx:** `localcoffeeperks.com` (apex marketing site), `dashboard.localcoffeeperks.com` (b2b dashboard SPA + `/api/*` proxy to FastAPI), `hq.localcoffeeperks.com` (super-admin SPA + `/api/*` proxy). All three on Let's Encrypt HTTPS, auto-renewed by certbot.
* **UFW firewall:** active, default-deny incoming, allowed: 22 (SSH), 80, 443, 8000.

## 4. Email & Transactional Delivery (Resend primary, Google Workspace fallback)
*Last updated: **2026-04-30***

* **Role:** Official business communication AND outbound transactional email — brand-invite welcome, consumer OTP, brand password-reset.
* **Address:** `hello@localcoffeeperks.com`
* **Vendor history:** Zoho Mail (initial) → Google Workspace SMTP (2026-04-30 morning) → **Resend** (2026-04-30 evening). The Google Workspace SMTP transport remained dead-on-arrival on the production droplet because **DigitalOcean blocks all outbound SMTP** (ports 25, 465, 587) on this droplet — confirmed via `[Errno 101] Network is unreachable` from inside the api container against `smtp.gmail.com`. Resend bypasses this entirely because its API runs over HTTPS port 443.

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
Three transactional templates ship in `app/email_sender.py`, all sharing the Espresso `#1A1412` + Mint `#00E576` chrome:

1. **Brand invite** — `send_brand_invite_email(to_email, brand_name, setup_url)` — welcome + 48h `Set up your account →` button. Fired by `POST /api/admin/platform/invite-brand-admin`.
2. **Consumer OTP** — `send_otp_email(to_email, code)` — 10-minute 4-digit code in a monospace pill. Fired by `POST /api/consumer/auth/request-otp`.
3. **Password reset** — `send_password_reset_email(to_email, brand_name, reset_url)` — 60-minute single-use reset link. Fired by `POST /api/auth/forgot-password`.

### Operational gotchas
* **Sending domain must be verified before non-test sends work.** Until DNS propagates and Resend marks the domain as verified, `From: hello@localcoffeeperks.com` will be rejected with a 403. Workaround during DNS propagation: temporarily set `SMTP_FROM='onboarding@resend.dev'` so sends go through Resend's test sender.
* **The 3 DNS records.** Resend's domain panel lists exactly 3 records to add at the registrar: one `TXT` (SPF: `v=spf1 include:_spf.resend.com ~all`) and two `CNAME` (DKIM, looks like `resend._domainkey.localcoffeeperks.com → resend._domainkey.resend.com`). Propagation is usually 5-30 min.
* **Free tier limit.** 3,000 emails/month, 100/day. Comfortably above Founding 100 invite + OTP volume. Above that, paid tier starts at $20/mo for 50k.
* **App Password requires 2-Step Verification (SMTP fallback only).** Only relevant if you're using the Gmail SMTP fallback for local dev. Enable 2-Step at `myaccount.google.com → Security → 2-Step Verification` before generating an App Password.
* **Reply-to.** Replies to transactional emails currently land in the `hello@localcoffeeperks.com` inbox the founder reads daily. If we ever split inbound vs outbound, set Resend's `reply_to` field in `_send_via_resend`.

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
*Last updated: **2026-04-30***

* **Role:** Locks down the platform-staff surface (the `hq.localcoffeeperks.com` admin-dashboard + every `/api/admin/platform/*` route guarded with `Depends(get_super_admin_session)`) and drives the end-to-end "super-admin invites a brand owner" onboarding pipeline.
* **Super-admin table:** `super_admins(id UUID, email TEXT UNIQUE, password_hash TEXT, created_at)` — see migration `0017_add_super_admins.sql`. Distinct from `brands.password_hash` (brand-owner login) and `cafes.pin_hash` (store-PIN login).
* **Login route:** `POST /api/auth/super/login` — bcrypt-verifies against `super_admins.password_hash`, mints a JWT with `aud="super-admin"` (see `app/tokens.py::encode_super_admin`). Uniform-401 + decoy-hash so the endpoint can't be used to probe staff-account existence.
* **Guard:** `Depends(get_super_admin_session)` in `app/auth.py`. Currently wired onto **`POST /api/admin/platform/invite-brand-admin`** only; the rest of `/api/admin/platform/*` remains unauth'd at scaffold level for now (see SECURITY comments on those routes). When tightening, add the dependency to: brand-create, cafe-create, customer-suspend, adjust-stamps, billing-status, set-billing-status, network-lock-reset, AI-agent.
* **Seed account (local dev):** `admin@localcoffeeperks.com` / `password123`. Lives in `scripts/seed_local_dev.py`; idempotent (skipped if already present). For the droplet, INSERT manually against the production DB or extend the seed script with a flag.
* **Onboarding flow (end-to-end):**
    1. Super admin signs in at `hq.localcoffeeperks.com` → JWT in `localStorage.lcp_super_admin_session_v1`.
    2. Super admin creates a brand (`POST /api/admin/platform/brands`).
    3. Super admin invites the brand owner (`POST /api/admin/platform/invite-brand-admin`) → backend signs a 48h `aud="brand-invite"` JWT, calls `send_brand_invite_email(...)`, returns `setup_url` for the operator's record.
    4. Recipient lands at `dashboard.localcoffeeperks.com/setup?token=…` → b2b-dashboard's `SetupView.tsx` 3-step wizard (password → first cafe → Stripe Checkout).
    5. Step 1 POSTs `/api/auth/brand/setup` (canonical; `/api/auth/admin/setup` is kept as a deprecated alias). Backend decodes the brand-invite JWT, sets `brands.password_hash`, mints a fresh `aud="admin"` session JWT.
    6. Step 2 + Step 3 use the session JWT to create the first cafe and start a Stripe Checkout — same endpoints as the existing dashboard.
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

---

## Change log
*Append a single line per change, newest at the top, in the form `YYYY-MM-DD — section — what changed`.*

* **2026-04-30 (eve)** — Section 4 (Email & Transactional Delivery) — vendor migration Google Workspace SMTP → **Resend**. DigitalOcean blocks all outbound SMTP (ports 25/465/587) on the droplet, confirmed via `[Errno 101] Network is unreachable` from inside the api container — making Gmail SMTP unworkable on prod. Resend's HTTPS API at `api.resend.com:443` bypasses the block. New env var `RESEND_API_KEY` (must be set on `/root/.env-lcp-production`); SMTP fallback preserved for local dev. Sending domain `localcoffeeperks.com` requires 3 DNS records (1 TXT + 2 CNAMEs) before non-test sends work.
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

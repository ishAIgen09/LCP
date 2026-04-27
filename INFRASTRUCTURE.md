# INFRASTRUCTURE LEDGER — Local Coffee Perks
*This document tracks all third-party platforms, external wiring, and server configurations that live OUTSIDE the main codebase. Do not overwrite or regenerate these endpoints without consulting this ledger.*

*Ledger initialised: **2026-04-27**.*
*Convention: every section carries a `Last updated:` date. When you change anything in a section — endpoint, key, deploy, vendor — bump that date and add a one-line note under **Change log** at the bottom.*

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
*Last updated: **2026-04-27***

* **Role:** Handles the £5/month per-cafe subscription billing.
* **Environment:** Currently running in Test Mode (using `pk_test_...` and `sk_test_...` keys).
* **Webhook Setup:**
    * Endpoint: `https://dashboard.localcoffeeperks.com/api/stripe/webhook`
    * Listening exclusively for: `checkout.session.completed`
    * Secured via Webhook Signing Secret (`whsec_...`) stored in `.env`.
* **Products:**
    * Private Plan (£5.00/mo) - ID: `price_1TQmMjLjDXRzQll0GUGlguhU`
    * LCP+ Global Pass (£7.99/mo) - ID: `price_1TQmN6LjDXRzQll0SvQedP4d`

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

## 4. Email & SMTP (Zoho Mail)
*Last updated: **2026-04-27***

* **Role:** Official business communication and (future) OTP delivery.
* **Address:** `hello@localcoffeeperks.com`

### Working configuration (Apple Mail on iOS / macOS)
Apple Mail's auto-detect routinely fails for custom-domain Zoho EU accounts. Configure manually with these exact values:

* **Incoming Mail Server (IMAP):**
    * Host name: `imappro.zoho.eu`
    * Port: `993`
    * Use SSL: ON
* **Outgoing Mail Server (SMTP):**
    * Host name: `smtppro.zoho.eu`
    * Port: `465`
    * Use SSL: ON
* **Authentication (both servers):**
    * Username: `hello@localcoffeeperks.com`
    * Password: a 16-character App-Specific Password generated from the **Zoho Security Dashboard**. **Do NOT** use the standard Zoho account password, and **do NOT** include the spaces Zoho displays between groups.

### Operational gotchas
* **"Cannot Get Mail" / missing Inbox / Junk / Trash folders.** Symptom: outgoing mail works, incoming sync silently fails. Cause: the iOS mail profile is corrupted. Fix:
    1. Delete the account from `Settings → Mail → Accounts`.
    2. Revoke the existing App Password in the Zoho Security Dashboard.
    3. Generate a fresh App Password.
    4. Re-add the account from scratch using the manual config above (do NOT trust Apple's auto-fill).
* **Multi-device rule.** Every device that signs in needs **its own unique App Password** (e.g. founder's iPhone + co-founder's iPhone = two separate passwords). Sharing one password across devices triggers Zoho's anti-replay heuristics and one device will quietly stop syncing.

## 5. App Store & Google Play (Pending)
*Last updated: **2026-04-27***

* **Entity Name:** A Digital Product Studio Limited.
* **Status:** Awaiting Company Registration Number from Companies House to trigger the D-U-N-S number application for Apple Organization enrollment.

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

---

## Change log
*Append a single line per change, newest at the top, in the form `YYYY-MM-DD — section — what changed`.*

* **2026-04-27** — Section 6 (Vehicle Marketing Assets) — added. Four production-ready SVG decals saved to `/marketing/stickers/` (hood, driver-door, passenger-door, bumper) plus a README. Each SVG references a sibling `qr.png` via relative `<image>` tag; brand palette `#1A1412` / `#00E576` / `#FFFFFF` documented as the source of truth.
* **2026-04-27** — Section 4 (Zoho Mail) — fleshed out: full Apple Mail manual config (IMAP `imappro.zoho.eu:993` / SMTP `smtppro.zoho.eu:465`, both SSL on, App-Specific Password), iOS-profile-corruption nuke-and-rebuild fix, multi-device per-device App Password rule.
* **2026-04-27** — Section 3 (DigitalOcean) — documented persistent `/root/.env-lcp-production` env-injection pattern, GHA `push:main` deploy trigger, the 20s-wait-then-clear lock guard in deploy.yml, the three Nginx subdomains, and the UFW ruleset.
* **2026-04-27** — Section 1 (Google Apps Script) — added "no mock fallback" frontend consumption rule: the social-proof count is hidden if the GAS fetch is in flight or fails, never substituted with a baseline number.
* **2026-04-27** — Ledger initialised with sections 1–5 (Google Apps Script, Stripe, DigitalOcean, Zoho Mail, App Store / Google Play pending).

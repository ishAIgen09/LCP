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
* **Specs:** 2GB Dedicated Droplet.
* **Base URL:** `https://dashboard.localcoffeeperks.com`
* **Environment Variables:** Stripe keys, Webhook secrets, and Database URIs are manually injected into the droplet's `.env` file via SSH.

## 4. Email & SMTP (Zoho Mail)
*Last updated: **2026-04-27***

* **Role:** Official business communication and (future) OTP delivery.
* **Address:** `hello@localcoffeeperks.com`
* **Configuration:** Authenticated via a 16-letter App-Specific Password (bypassing 2FA for system/device logins).
* **Incoming:** `imappro.zoho.eu`
* **Outgoing:** `smtppro.zoho.eu`

## 5. App Store & Google Play (Pending)
*Last updated: **2026-04-27***

* **Entity Name:** A Digital Product Studio Limited.
* **Status:** Awaiting Company Registration Number from Companies House to trigger the D-U-N-S number application for Apple Organization enrollment.

---

## Change log
*Append a single line per change, newest at the top, in the form `YYYY-MM-DD — section — what changed`.*

* **2026-04-27** — Ledger initialised with sections 1–5 (Google Apps Script, Stripe, DigitalOcean, Zoho Mail, App Store / Google Play pending).

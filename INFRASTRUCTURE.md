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

---

## Change log
*Append a single line per change, newest at the top, in the form `YYYY-MM-DD — section — what changed`.*

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

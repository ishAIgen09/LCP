

# LCP Landing Page — Final Plan (Lead Capture, Pre-Launch)

## Core narrative
Pre-launch waitlist page. Filling the form ≠ becoming a Founding Member. The pitch:

> "We launch soon. The **first 100 sign-ups after launch** become Founding Members and lock in a permanent discount on either plan. Join the waitlist now to be first in line."

On-page counters track **waitlist interest** (social proof + momentum), not founding slots.

## Pricing (shown on plan cards)

| Plan | Founding price (first 100 post-launch) | Standard price (after) |
|---|---|---|
| **Private Card** | £5 / month | £10 / month |
| **LCP+ Global Pass** | £7.99 / month | £12.99 / month |

Both prices visible on each card; founding price tagged "First 100 cafes after launch".

## Live counters (waitlist interest)
Two counters shown together in hero + above form:
- **☕ X cafes interested** — increments on cafe-owner submit
- **❤️ X coffee lovers waiting** — increments on consumer submit

Pulsing Electric Mint dot, tabular-nums, soft scale-flash on update. Single `useWaitlistCounts()` hook backed by local store now, swappable to a real backend later.

## Lead capture form (lean, validated)
Single form with audience toggle.
- **Cafe owner** → Cafe name, Your name, Email, City — all required
- **Coffee lover** → Name, Email, City — all required

Zod validation: email mandatory + valid format, name non-empty + trimmed, length caps. Submit → success state: *"You're on the list. We'll email you the moment LCP launches — be quick, the first 100 sign-ups become Founding Members."* No plan-interest field. No payments.

## Page structure (top → bottom)

1. **Hero** — full-bleed coffee photo slideshow (Ken Burns + cross-fade), Deep Espresso overlay, headline, sub explaining the "be first to know → land in the first 100 → lock in founding price" hook, both live counters, CTA "Join the waitlist".
2. **Why LCP** — 6 value pillars: loyalty insights, customer data, branded experience, Shadow Ledger security, zero hardware, automated re-engagement.
3. **Plans for cafe owners** — Private Card and LCP+ side-by-side, both prices visible, founding price tagged.
4. **A glimpse of the product** — single, restrained showcase using the uploaded **cafe-owner dashboard screenshot** as the hero visual (tilted browser frame, soft shadow). Caption highlights Shadow Ledger + at-risk regulars. Consumer app gets only **one small phone-frame thumbnail** alongside, captioned "Your customers get a beautiful, simple pass." No deep app walkthrough.
5. **Founding 100 explainer** — 4-step path: Join waitlist → Get launch email first → Sign up in first 100 → Lock in founding price for life.
6. **What your customers experience** — Private Card vs LCP+ paths, "10 Stamps = 1 Free Coffee" reward banner, "Always free for coffee lovers" note. Text-led, minimal imagery.
7. **Coffee gallery marquee** — continuously drifting strip of coffee photography (pauses on hover).
8. **Lead capture form** — audience toggle, lean fields, validation, success state, increments matching counter.
9. **Footer** — minimal: small logo, "Launching 2026", contact email.

## Motion & creative (no boring static scroll)
- Hero coffee-photo slideshow with Ken Burns zoom + cross-fade.
- Pulsing live counters with scale-flash on update.
- Scroll-reveal fade/slide on every section (IntersectionObserver, staggered).
- Subtle parallax on photo backgrounds.
- Continuously drifting coffee gallery marquee.
- Plan cards lift on hover; founding price gently pulses in Electric Mint.
- Audience toggle slides between states; submit button has loading → success check animation.

All built with Tailwind keyframes — no heavy animation libraries.

## Visual system
- **Palette (HSL tokens in `index.css`):** Deep Espresso `#1C1412` (background/text), Electric Mint `#2AF598` (single accent — CTAs, counters, highlights), warm cream surface, soft neutral borders. No hard-coded colors in components.
- **Typography:** editorial serif headings + clean sans body, generous spacing.
- **Tone:** supportive, sophisticated, community-driven. No "rebel/disrupt" language.
- **Imagery:** coffee photography as primary anchor; uploaded dashboard screenshot used once as the credibility visual; consumer app shown only as a small phone-frame thumbnail.

## Assets
- Uploaded **cafe-owner dashboard** → product showcase section (saved to `src/assets/`).
- Uploaded **consumer app screenshot** → small thumbnail only, in same showcase.
- Coffee photography: tasteful Unsplash-style placeholders sized correctly until you upload your own — one-step swap later.

## Out of scope (next step)
- Lovable Cloud + `leads` table to persist signups, real counter API, and the launch broadcast email (with branching link: cafe owner sign-up vs consumer app download).


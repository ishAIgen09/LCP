import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Long-form legal page — Tailwind Typography (prose) does the heavy
// lifting on rhythm/heading hierarchy, with overrides to match the
// brand palette: espresso bg, cream text, mint links + bold accents,
// a centred max-width column for readable line length.
//
// The body content is hardcoded (not pulled from a CMS) because legal
// copy needs to be a deliberate, reviewed change every time — a
// "wrap-an-MDX-loader" approach would make accidental edits too easy.
//
// Last revision printed in the body: April 2026. When the policy
// changes, update both the visible "Last Updated" line and the
// `/privacy` route's commit message so git history matches the on-page
// revision date.
const Privacy = () => {
  return (
    <main className="bg-espresso min-h-screen text-cream">
      {/* Slim header so the Privacy page still feels like part of the
          site — same brand mark + a quick way back to the marketing
          page. Deliberately no nav / waitlist CTA — readers landing
          here from a legal link shouldn't be funnelled into signup. */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-8 sm:px-10">
        <Link
          to="/"
          className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cream/60 transition-colors hover:text-mint"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          <span className="font-display normal-case italic tracking-normal text-cream/75">
            Local Coffee Perks
          </span>
        </Link>
      </header>

      <article
        className={[
          "mx-auto max-w-3xl px-6 py-16 sm:px-10 sm:py-24",
          // Tailwind Typography prose tokens, overridden so cream sits
          // on espresso instead of the default invert palette. Each
          // selector points at the prose-* CSS var the plugin reads,
          // so the override is surgical (no class-name-soup overrides
          // sprinkled onto every <h2>, <p>, etc.).
          "prose prose-invert prose-lg",
          "prose-headings:font-display prose-headings:tracking-tight",
          "prose-h1:text-cream prose-h1:text-4xl sm:prose-h1:text-5xl prose-h1:mb-2",
          "prose-h2:text-cream prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4",
          "prose-p:text-cream/85 prose-p:leading-relaxed",
          "prose-strong:text-cream prose-strong:font-semibold",
          "prose-a:text-mint prose-a:no-underline hover:prose-a:underline",
          "prose-ul:my-4 prose-li:text-cream/85 prose-li:my-1.5",
          "prose-li:marker:text-mint/60",
          "prose-hr:border-cream/10",
        ].join(" ")}
      >
        <h1>Privacy Policy</h1>
        <p className="!mt-4 text-sm uppercase tracking-[0.18em] text-cream/55">
          Last Updated: April 2026
        </p>

        <h2>1. Introduction</h2>
        <p>
          Welcome to Local Coffee Perks. This Privacy Policy explains
          how A Digital Product Studio Limited (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and
          protects your personal information when you use our website,
          B2B dashboard, and consumer mobile application.
        </p>

        <h2>2. Data Controller</h2>
        <p>
          A Digital Product Studio Limited is the Data Controller of
          your personal data. If you have any questions or wish to
          exercise your data rights, you can contact us at:{" "}
          <a href="mailto:hello@localcoffeeperks.com">
            <strong>hello@localcoffeeperks.com</strong>
          </a>
          .
        </p>

        <h2>3. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul>
          <li>
            <strong>Account Data:</strong> Your name, email address,
            and an automatically generated Member Code when you create
            an account.
          </li>
          <li>
            <strong>Location Data:</strong> If you grant permission, we
            collect your device&rsquo;s live GPS location to provide
            location-based services, such as giving you directions to
            nearby participating cafes.
          </li>
          <li>
            <strong>Transaction &amp; Usage Data:</strong> Records of
            your coffee stamps, redeemed rewards, and the cafes you
            visit.
          </li>
          <li>
            <strong>Tracking &amp; Analytics Data:</strong> Our website
            uses tracking technologies, including Google Analytics and
            Meta Pixels, to understand user behavior and measure the
            effectiveness of our advertising.
          </li>
        </ul>

        <h2>4. How We Use Your Information</h2>
        <p>We use your personal data to:</p>
        <ul>
          <li>
            Provide and maintain the Local Coffee Perks service (e.g.,
            sending OTP login codes and tracking your loyalty stamps).
          </li>
          <li>
            Provide location-specific features like cafe discovery and
            directions.
          </li>
          <li>
            Send you marketing and promotional emails regarding Local
            Coffee Perks and participating cafes. You can opt out of
            these communications at any time by clicking the
            &ldquo;unsubscribe&rdquo; link in the emails.
          </li>
          <li>
            Analyze app and website usage to improve our product via
            essential cookies and third-party trackers.
          </li>
        </ul>

        <h2>5. Sharing Your Data</h2>
        <p>
          We do not sell your personal data. We may share your data
          with:
        </p>
        <ul>
          <li>
            <strong>Participating Cafes:</strong> Cafe owners can see
            your first name, last initial, and your loyalty balance
            when you scan your Member Code at their location.
          </li>
          <li>
            <strong>Service Providers:</strong> Third-party vendors who
            help us operate our platform (e.g., secure cloud hosting,
            email delivery services, and analytics providers).
          </li>
        </ul>

        <h2>6. Your Data Protection Rights (UK GDPR)</h2>
        <p>
          Under UK data protection law, you have the right to:
        </p>
        <ul>
          <li>
            <strong>Access</strong> the personal data we hold about
            you.
          </li>
          <li>
            <strong>Correct</strong> any inaccurate or incomplete data.
          </li>
          <li>
            <strong>Erase</strong> your personal data (the &ldquo;right
            to be forgotten&rdquo;).
          </li>
          <li>
            <strong>Restrict or Object</strong> to the processing of
            your data, particularly for direct marketing.
          </li>
        </ul>
        <p>
          To exercise any of these rights, please email us at{" "}
          <a href="mailto:hello@localcoffeeperks.com">
            hello@localcoffeeperks.com
          </a>
          .
        </p>

        <h2>7. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Any
          changes will be posted on this page with an updated revision
          date.
        </p>
      </article>

      {/* Footer credit — same Impact Visual Branding line the rest of
          the site uses, so the legal page doesn't drop out of the
          shared chrome. */}
      <footer className="mx-auto max-w-4xl px-6 pb-12 text-center text-[11px] text-cream/35 sm:px-10">
        Developed and managed by{" "}
        <a
          href="https://impactvisualbranding.co.uk"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 transition-colors hover:text-mint hover:underline"
        >
          Impact Visual Branding
        </a>
      </footer>
    </main>
  );
};

export default Privacy;

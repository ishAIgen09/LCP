// Mirror waitlist-page/dist/ → ../main-website/dist/waitlist/ so a single
// Nginx root (main-website/dist) serves both apps. Run after `vite build`.
//
// Build order matters: main-website MUST be built first (its `vite build`
// empties main-website/dist/), then waitlist-page is built and this script
// drops the waitlist tree inside the freshly-rebuilt main-website/dist.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "dist");
const target = resolve(here, "..", "..", "main-website", "dist", "waitlist");

if (!existsSync(src)) {
  console.error(`[copy-to-main] source missing: ${src}`);
  process.exit(1);
}

if (!existsSync(resolve(target, ".."))) {
  console.error(
    `[copy-to-main] main-website/dist not found. Build main-website first:\n` +
      `  (cd main-website && npm run build) && (cd waitlist-page && npm run build)`,
  );
  process.exit(1);
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(src, target, { recursive: true });

console.log(`[copy-to-main] ${src} → ${target}`);

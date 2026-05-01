# Waitlist Apps Script (mirror)

`Code.gs` is a tracked mirror of the Google Apps Script that runs on Google's servers and powers the marketing site's waitlist form + live counter.

## What this script does

* **`doPost`** — receives a waitlist signup as JSON, appends a row to the bound Google Sheet, emails a notification to `hello@localcoffeeperks.com`. If the sheet append fails, fires an "URGENT: Waitlist Error" email with the raw payload + stack trace so the lead can be recovered manually.
* **`doGet`** — returns the current row count as `{ "waitlist_count": N }` for the marketing site's social-proof counter. On read failure returns `{ "error": ... }` (the marketing site already hides the counter when no `waitlist_count` key is present).

## Update protocol

The repo file is **the source of truth.** When you change behavior:

1. Edit `Code.gs` here in the repo first. Commit the change so the audit trail is in git history.
2. Open the live script at [script.google.com](https://script.google.com) (bound to the waitlist Google Sheet).
3. Paste the new contents over the existing code.
4. Save, then deploy via **Manage Deployments → New Version**. **Do NOT use "New deployment"** — that mints a new Web App URL and silently breaks the marketing site's hardcoded fetch.
5. Smoke-test: submit the waitlist form once. Confirm:
    * the row landed in the Google Sheet, AND
    * `hello@localcoffeeperks.com` received the success-notification email.

## Constants to know

* `ADMIN_EMAIL` — destination for both success + URGENT emails. Comma-separated list of addresses is supported.
* `SHEET_ID` — leave `null` when the script is bound to a sheet (typical). Set to a spreadsheet ID for standalone scripts.
* `SHEET_HEADERS` — column order array. **Must match the Google Sheet's first row exactly** or appended rows will misalign. Order today: `timestamp / name / email / cafe_name / phone / city / source / raw_payload`. The trailing `raw_payload` column captures the full JSON blob as a safety net for schema drift.

## CORS / frontend contract

Apps Script auto-adds `Access-Control-Allow-Origin: *` for "Anyone" deployments, but only for simple requests. The marketing site's `fetch` should send POSTs as `Content-Type: text/plain;charset=utf-8` (or omit the Content-Type header) to avoid triggering a CORS preflight Apps Script can't fully answer. The script reads the JSON body via `e.postData.contents` regardless of the Content-Type header.

## MailApp quota

Soft daily limit: **100 emails on consumer Google, 1,500 on Workspace.** Above that, the success email starts dropping silently — but the row is already in the sheet, so the lead is still captured. Both the success path and the URGENT-fallback path share this quota.

If both the sheet AND mail fail in the same execution, the Apps Script execution log (`script.google.com → Executions`) is the last-resort source of truth.

## See also

* INFRASTRUCTURE.md §1 — operator-facing reference for this script (env, deployment rule, frontend consumption rule).

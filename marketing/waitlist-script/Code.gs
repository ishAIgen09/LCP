/**
 * Local Coffee Perks — Waitlist Capture (Google Apps Script)
 *
 * MIRROR — this file is the source-of-truth tracked copy of the Apps
 * Script that runs on Google's servers. The LIVE script lives at
 * script.google.com (bound to the waitlist Google Sheet) and is reached
 * by the marketing site via its deployed Web App URL.
 *
 * Update protocol:
 *   1. Edit this file FIRST in the repo (git history = audit trail).
 *   2. Copy the contents into the live script editor at script.google.com.
 *   3. Save + deploy via "Manage Deployments → New Version" (NOT a
 *      fresh deploy — that mints a new URL and silently breaks the
 *      marketing site's hardcoded fetch).
 *   4. Smoke-test by submitting the waitlist form once. Confirm
 *      hello@localcoffeeperks.com receives the success-notification
 *      email AND the row landed in the sheet.
 *
 * Two endpoints:
 *   - doPost: captures a waitlist signup, appends to the sheet, emails
 *             confirmation to the admin. If sheet write fails, falls
 *             back to an URGENT email so the lead is never lost.
 *   - doGet:  returns the current row count as { waitlist_count: N }
 *             for the marketing site's social-proof counter.
 *
 * CORS: Apps Script web apps deployed with "Anyone" access automatically
 * add Access-Control-Allow-Origin: * to ContentService responses. The
 * frontend should send POSTs as Content-Type: text/plain (or omit the
 * Content-Type header) to avoid triggering a CORS preflight that Apps
 * Script can't fully answer. The script reads the JSON body from
 * e.postData.contents either way.
 *
 * MailApp quota: soft daily limit of 100 emails on consumer Google,
 * 1,500 on Workspace. Above that, the success email starts dropping
 * silently — but the row is already in the sheet, so the lead is still
 * captured. If both sheet AND mail fail same day, the Apps Script
 * execution log (script.google.com → Executions) is the last-resort
 * source of truth.
 */

// Where success + error notifications land. Multiple comma-separated
// addresses are supported by MailApp.
const ADMIN_EMAIL = "hello@localcoffeeperks.com";

// Optional: the spreadsheet ID if this is a standalone script (not
// bound to a sheet). When bound, getActiveSpreadsheet() works and you
// can leave this as null.
const SHEET_ID = null;

// Header column order. Must match the Google Sheet's first row exactly,
// or appended rows will misalign. The trailing "raw_payload" column
// stores the JSON blob as a safety net so partial-data signups can
// still be reconstructed if the schema changes.
const SHEET_HEADERS = [
  "timestamp",
  "name",
  "email",
  "cafe_name",
  "phone",
  "city",
  "source",
  "raw_payload",
];


// ─────────────────────────────────────────────────────────────────────
// POST — capture a signup
// ─────────────────────────────────────────────────────────────────────

function doPost(e) {
  // Parse first so we have something to log + email even if the sheet
  // write fails further down.
  let payload = {};
  let rawBody = "";
  try {
    rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (parseErr) {
    // Malformed JSON from the client. Fire the URGENT email anyway —
    // we still got something (rawBody) and a developer should look.
    _safeSendUrgentEmail({
      reason: "Invalid JSON payload from frontend",
      err: parseErr,
      rawBody: rawBody,
    });
    return _jsonResponse({
      ok: false,
      error: "Invalid JSON payload",
    });
  }

  try {
    const timestamp = new Date();
    const sheet = _getSheet();

    // Build the row in SHEET_HEADERS order so the column layout stays
    // stable even if the frontend adds new fields. Unknown payload keys
    // get rolled into raw_payload at the end so nothing is lost.
    const row = SHEET_HEADERS.map(function (col) {
      if (col === "timestamp") return timestamp;
      if (col === "raw_payload") return JSON.stringify(payload);
      return payload[col] !== undefined ? String(payload[col]) : "";
    });

    sheet.appendRow(row);

    // Confirmation email — best-effort. If MailApp throws (quota
    // exhausted, rare) the row is already saved, so we still return
    // success to the frontend.
    try {
      MailApp.sendEmail({
        to: ADMIN_EMAIL,
        subject: _successSubject(payload),
        htmlBody: _successEmailBody(payload, timestamp),
      });
    } catch (mailErr) {
      // Quota / transient failure on the success email — log only,
      // don't escalate to URGENT (the lead IS in the sheet).
      console.error("Confirmation email failed:", mailErr);
    }

    return _jsonResponse({
      ok: true,
      timestamp: timestamp.toISOString(),
    });
  } catch (err) {
    // ── FALLBACK PATH ──
    // Sheet write failed. The lead is currently nowhere — email it
    // immediately so the admin can reconstruct it manually.
    _safeSendUrgentEmail({
      reason: "Sheet append failed — lead lost from spreadsheet",
      err: err,
      rawBody: rawBody,
      payload: payload,
    });

    return _jsonResponse({
      ok: false,
      error: "Internal error — your signup has been forwarded for manual recovery",
    });
  }
}


// ─────────────────────────────────────────────────────────────────────
// GET — live waitlist count for the marketing site
// ─────────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const sheet = _getSheet();
    // First row is the header, so subtract 1. Clamp at 0 in case the
    // sheet is empty and getLastRow() returns 0 or 1.
    const count = Math.max(sheet.getLastRow() - 1, 0);
    return _jsonResponse({ waitlist_count: count });
  } catch (err) {
    console.error("doGet failed:", err);
    // Frontend rule (per INFRASTRUCTURE.md §1): the marketing site
    // HIDES the social-proof count when this fetch fails or returns
    // no number. So returning an error shape here is safe — it just
    // disappears from the page rather than showing 0 or a fallback.
    return _jsonResponse({ error: "Could not read waitlist count" });
  }
}


// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function _getSheet() {
  // Bound script (sheet-attached) → getActiveSpreadsheet works.
  // Standalone script → set SHEET_ID at the top of the file.
  if (SHEET_ID) {
    return SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  }
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}


function _jsonResponse(obj) {
  // Apps Script ContentService doesn't support custom HTTP status codes
  // — every response is 200. Errors are signalled via { ok: false } in
  // the JSON body, which the frontend reads. CORS headers are added
  // automatically by Apps Script when the Web App is deployed with
  // "Who has access: Anyone" or "Anyone with Google account".
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function _successSubject(payload) {
  const who =
    payload.cafe_name ||
    payload.cafeName ||
    payload.name ||
    payload.email ||
    "(no name on payload)";
  return "New waitlist signup: " + who;
}


function _successEmailBody(payload, timestamp) {
  // Generic key-value table so new fields the frontend adds in future
  // automatically appear without a script update.
  const rowsHtml = Object.keys(payload)
    .filter(function (k) { return payload[k] !== undefined && payload[k] !== ""; })
    .map(function (k) {
      return (
        "<tr>" +
          "<td style=\"padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A1412;\">" +
            _escapeHtml(k) +
          "</td>" +
          "<td style=\"padding:6px 12px;border-bottom:1px solid #eee;color:#1A1412;\">" +
            _escapeHtml(payload[k]) +
          "</td>" +
        "</tr>"
      );
    })
    .join("");

  return (
    "<div style=\"font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;\">" +
      "<h2 style=\"font-size:18px;color:#1A1412;margin:0 0 6px 0;\">New waitlist signup</h2>" +
      "<p style=\"font-size:13px;color:#666;margin:0 0 16px 0;\">" +
        "Captured at " + timestamp.toISOString() +
      "</p>" +
      "<table style=\"border-collapse:collapse;width:100%;background:#fff;border:1px solid #eee;\">" +
        rowsHtml +
      "</table>" +
      "<p style=\"font-size:12px;color:#888;margin-top:18px;\">" +
        "Auto-sent from the Local Coffee Perks waitlist Apps Script." +
      "</p>" +
    "</div>"
  );
}


function _safeSendUrgentEmail(ctx) {
  // Wrapped in its own try/catch so a mail-quota failure on the
  // FALLBACK path can't itself raise — we'd already have lost the
  // lead, no point making it worse. Anything we can't email lands in
  // the Apps Script execution log (View → Executions in the editor).
  try {
    const errMessage = (ctx.err && ctx.err.message) ? ctx.err.message : String(ctx.err);
    const errStack = (ctx.err && ctx.err.stack) ? ctx.err.stack : "(no stack)";

    const body =
      "<div style=\"font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;\">" +
        "<h2 style=\"color:#a00;margin:0 0 8px 0;\">⚠️ Waitlist signup could not be saved</h2>" +
        "<p style=\"font-size:14px;color:#333;margin:0 0 14px 0;\">" +
          "Reason: <strong>" + _escapeHtml(ctx.reason) + "</strong>" +
        "</p>" +
        "<p style=\"font-size:13px;color:#333;margin:0 0 6px 0;\"><strong>Error message:</strong></p>" +
        "<pre style=\"background:#fee;border:1px solid #f99;padding:10px;font-size:12px;white-space:pre-wrap;\">" +
          _escapeHtml(errMessage) +
        "</pre>" +
        "<p style=\"font-size:13px;color:#333;margin:14px 0 6px 0;\"><strong>Raw payload (for manual entry into the sheet):</strong></p>" +
        "<pre style=\"background:#f4f4f4;border:1px solid #ddd;padding:10px;font-size:12px;white-space:pre-wrap;word-break:break-all;\">" +
          _escapeHtml(ctx.rawBody || "(empty body)") +
        "</pre>" +
        "<p style=\"font-size:13px;color:#333;margin:14px 0 6px 0;\"><strong>Stack trace:</strong></p>" +
        "<pre style=\"background:#f4f4f4;border:1px solid #ddd;padding:10px;font-size:11px;white-space:pre-wrap;\">" +
          _escapeHtml(errStack) +
        "</pre>" +
      "</div>";

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: "URGENT: Waitlist Error — manual recovery required",
      htmlBody: body,
    });
  } catch (mailErr) {
    // Last-ditch — log to Apps Script's execution log. Visible at
    // script.google.com → Executions.
    console.error(
      "URGENT email also failed. Original error:", ctx.err,
      "; Mail error:", mailErr,
      "; Raw body:", ctx.rawBody
    );
  }
}


function _escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

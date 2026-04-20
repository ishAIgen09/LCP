import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Coffee,
  LogOut,
  Play,
  ScanLine,
  Square,
  TerminalSquare,
} from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RewardDialog } from "@/components/RewardDialog"
import { cn } from "@/lib/utils"
import { ApiError, b2bScan } from "@/lib/api"
import type { Session } from "@/lib/mock"

const TILL_CODE_PATTERN = /^[A-Z0-9]{6}$/
// Hard lockout applied after any accepted scan candidate. Blocks every scan
// source (camera + simulate input) for the full window so the html5-qrcode
// library's multi-frame fires + an over-eager barista can't double-stamp.
const SCAN_LOCKOUT_MS = 3500
const REWARD_RESOLVED_COOLDOWN_MS = 10_000
const REWARD_THRESHOLD = 10
const QUANTITY_OPTIONS = [1, 2, 3, 4, 5] as const
type Quantity = (typeof QUANTITY_OPTIONS)[number]

type ScannerState = "idle" | "starting" | "running" | "paused" | "error"

type Toast = {
  id: number
  message: string
  variant: "success" | "error" | "warn" | "info"
}

type LastActivity =
  | { kind: "stamp"; tillCode: string; balance: number }
  | { kind: "redeem"; tillCode: string; balance: number }
  | { kind: "save"; tillCode: string; balance: number }
  | { kind: "reject"; tillCode: string; reason: string }

export function BaristaPOSView({
  session,
  onLogout,
}: {
  session: Extract<Session, { role: "store" }>
  onLogout: () => void
}) {
  const readerId = useId().replace(/[^a-zA-Z0-9_-]/g, "") + "-barista-reader"

  const [scannerState, setScannerState] = useState<ScannerState>("idle")
  const [statusLine, setStatusLine] = useState("Scanner idle. Start the camera to begin.")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [reward, setReward] = useState<{ tillCode: string; balance: number } | null>(null)
  const [lastActivity, setLastActivity] = useState<LastActivity | null>(null)
  const [simInput, setSimInput] = useState("")
  const [quantity, setQuantity] = useState<Quantity>(1)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerPausedRef = useRef(false)
  const lockoutUntilRef = useRef(0)
  const rewardResolvedRef = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const inFlightRef = useRef(false)
  const rewardOpenRef = useRef(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    rewardOpenRef.current = reward !== null
  }, [reward])

  const showToast = useCallback(
    (message: string, variant: Toast["variant"] = "info", durationMs = 3000) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      const id = Date.now() + Math.random()
      setToast({ id, message, variant })
      if (durationMs > 0) {
        toastTimerRef.current = setTimeout(() => {
          setToast((t) => (t && t.id === id ? null : t))
        }, durationMs)
      }
    },
    []
  )

  const pauseScanner = useCallback(() => {
    const s = scannerRef.current
    if (!s || scannerPausedRef.current) return
    try {
      s.pause(true)
      scannerPausedRef.current = true
      setScannerState("paused")
    } catch {
      /* no-op */
    }
  }, [])

  const resumeScanner = useCallback(() => {
    const s = scannerRef.current
    if (!s || !scannerPausedRef.current) return
    try {
      s.resume()
      scannerPausedRef.current = false
      setScannerState("running")
    } catch {
      /* no-op */
    }
  }, [])

  const processScan = useCallback(
    async (tillCode: string) => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      const qty = quantity
      setStatusLine(`Scanning ${tillCode} · ${qty} drink${qty === 1 ? "" : "s"}…`)
      try {
        const result = await b2bScan(
          session.venueApiKey,
          session.venueApiKey,
          tillCode,
          qty
        )
        if (result.free_drinks_unlocked > 0) {
          setReward({ tillCode, balance: result.new_balance })
          pauseScanner()
          const drinks = result.free_drinks_unlocked
          setStatusLine(
            `🎉 ${drinks} free drink${drinks === 1 ? "" : "s"} unlocked for ${tillCode} — hand over.`
          )
        } else {
          setLastActivity({ kind: "stamp", tillCode, balance: result.new_balance })
          setStatusLine(
            `Last: ${tillCode} → +${qty} stamp${qty === 1 ? "" : "s"} · balance ${result.new_balance}/${REWARD_THRESHOLD}`
          )
          showToast(
            `+${qty} stamp${qty === 1 ? "" : "s"} · balance ${result.new_balance}/${REWARD_THRESHOLD}`,
            "success"
          )
        }
      } catch (e) {
        handleApiError(e, tillCode, "stamp")
        // Release the lockout on errors so a typo or 404 doesn't wedge the
        // scanner for 3.5s — the barista can correct and retry immediately.
        lockoutUntilRef.current = 0
      } finally {
        inFlightRef.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quantity, session.venueApiKey, pauseScanner, showToast]
  )

  const handleApiError = useCallback(
    (e: unknown, tillCode: string, action: "stamp" | "redeem") => {
      if (!(e instanceof ApiError)) {
        const msg = e instanceof Error ? e.message : String(e)
        showToast(`Network error: ${msg}`, "error", 4500)
        setStatusLine("Network error.")
        setLastActivity({ kind: "reject", tillCode, reason: "Network error." })
        return
      }
      if (e.status === 401) {
        showToast("Invalid API key — sign out and back in.", "error", 4500)
        setStatusLine("Auth failed (401).")
      } else if (e.status === 402) {
        showToast(`Subscription inactive · ${e.detail}`, "error", 5500)
        setStatusLine("Billing required (402).")
      } else if (e.status === 404) {
        showToast("Customer not found.", "error")
        setStatusLine(`Unknown till_code (${tillCode}).`)
      } else if (e.status === 409) {
        showToast(`Redeem rejected · ${e.detail}`, "warn", 4000)
        setStatusLine(`${action === "redeem" ? "Redeem" : "Stamp"} rejected (409).`)
      } else if (e.status === 422) {
        showToast("Invalid code format.", "error")
        setStatusLine("Validation failed (422).")
      } else {
        showToast(`Error ${e.status}${e.detail ? ": " + e.detail : ""}`, "error", 4000)
        setStatusLine(`Error ${e.status}.`)
      }
      setLastActivity({ kind: "reject", tillCode, reason: e.detail })
    },
    [showToast]
  )

  const handleScanCandidate = useCallback(
    (decodedText: string) => {
      if (rewardOpenRef.current) return

      const code = (decodedText || "").trim().toUpperCase()
      const now = Date.now()

      // Global lockout — swallows every candidate silently during the window
      // so html5-qrcode's per-frame fires don't spam the API. No toast/status
      // update on purpose: a busy-looking scanner would just annoy baristas.
      if (now < lockoutUntilRef.current) return
      if (inFlightRef.current) return

      if (
        code === rewardResolvedRef.current.code &&
        now - rewardResolvedRef.current.at < REWARD_RESOLVED_COOLDOWN_MS
      ) {
        setStatusLine(`Just resolved '${code}' — move the card away.`)
        setLastActivity({
          kind: "reject",
          tillCode: code,
          reason: "Re-scan too soon — move the card away.",
        })
        return
      }
      if (!TILL_CODE_PATTERN.test(code)) {
        setStatusLine(`Ignoring '${code}' — not a 6-char [A-Z0-9] code.`)
        setLastActivity({ kind: "reject", tillCode: code, reason: "Invalid format." })
        return
      }

      // Lock FIRST so a follow-up frame can't sneak through while the API
      // call is in-flight. Successful scans extend the lockout via processScan.
      lockoutUntilRef.current = now + SCAN_LOCKOUT_MS
      processScan(code)
    },
    [processScan]
  )

  const start = useCallback(async () => {
    if (scannerRef.current) return
    setCameraError(null)
    setScannerState("starting")
    setStatusLine("Requesting camera access…")
    try {
      const scanner = new Html5Qrcode(readerId, { verbose: false })
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => handleScanCandidate(decoded),
        () => {}
      )
      scannerRef.current = scanner
      scannerPausedRef.current = false
      setScannerState("running")
      setStatusLine("Scanner running. Point the camera at a customer code.")
    } catch (e) {
      scannerRef.current = null
      const message = e instanceof Error ? e.message : String(e)
      setCameraError(message)
      setScannerState("error")
      setStatusLine("Camera unavailable.")
      showToast(`Camera error: ${message}`, "error", 4500)
    }
  }, [handleScanCandidate, readerId, showToast])

  const stop = useCallback(async () => {
    const s = scannerRef.current
    if (!s) return
    try {
      await s.stop()
    } catch {
      /* ignore */
    }
    try {
      s.clear()
    } catch {
      /* ignore */
    }
    scannerRef.current = null
    scannerPausedRef.current = false
    setScannerState("idle")
    setStatusLine("Scanner stopped.")
  }, [])

  useEffect(() => {
    return () => {
      const s = scannerRef.current
      if (s) {
        s.stop()
          .catch(() => {})
          .finally(() => {
            try {
              s.clear()
            } catch {
              /* ignore */
            }
          })
      }
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Redemption already happened inside /api/b2b/scan's rollover — this just
  // acknowledges the barista handed over the drink and unpauses the scanner.
  const onRedeem = useCallback(() => {
    if (!reward) return
    rewardResolvedRef.current = { code: reward.tillCode, at: Date.now() }
    setLastActivity({
      kind: "redeem",
      tillCode: reward.tillCode,
      balance: reward.balance,
    })
    setStatusLine(
      `Redeemed ${reward.tillCode} → balance reset to ${reward.balance}/${REWARD_THRESHOLD}`
    )
    showToast(`Reward handed over · balance ${reward.balance}`, "success", 3000)
    setReward(null)
    resumeScanner()
  }, [reward, resumeScanner, showToast])

  const onSaveForLater = useCallback(() => {
    if (!reward) return
    rewardResolvedRef.current = { code: reward.tillCode, at: Date.now() }
    setLastActivity({ kind: "save", tillCode: reward.tillCode, balance: reward.balance })
    setStatusLine(`Saved for later (${reward.tillCode}) — ready for the next customer.`)
    showToast("Saved for later · ready for next customer", "info", 2500)
    setReward(null)
    resumeScanner()
  }, [reward, resumeScanner, showToast])

  const onSimulate = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const code = simInput.trim().toUpperCase()
      if (!code) return
      handleScanCandidate(code)
      setSimInput("")
    },
    [handleScanCandidate, simInput]
  )

  const statePill = useMemo(() => statePills[scannerState], [scannerState])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background">
            <Coffee className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Barista POS Scanner</div>
            <div className="text-[11px] text-muted-foreground">{session.cafeName}</div>
          </div>
        </div>

        <span className="ml-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          {session.storeNumber}
        </span>

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={onLogout} className="h-8 gap-1.5">
            <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-xl space-y-4">
          <div className="relative overflow-hidden rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500" />

            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-500/10 text-violet-700">
                  <ScanLine className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <div className="leading-tight">
                  <div className="font-heading text-[15px] font-semibold tracking-tight">
                    Scan customer code
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Looks for a 6-character till code.
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  statePill.className
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", statePill.dot)} />
                {statePill.label}
              </span>
            </div>

            {/* Controls live ABOVE the camera so they're always in reach on a
                tablet viewport without scrolling. Viewport follows underneath. */}
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Button
                onClick={start}
                disabled={scannerState === "running" || scannerState === "starting" || scannerState === "paused"}
                className="h-10 gap-1.5 font-medium"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.25} />
                {scannerState === "starting" ? "Starting…" : "Start scanner"}
              </Button>
              <Button
                variant="outline"
                onClick={stop}
                disabled={scannerState === "idle" || scannerState === "error"}
                className="h-10 gap-1.5 font-medium"
              >
                <Square className="h-3.5 w-3.5" strokeWidth={2.25} />
                Stop
              </Button>
            </div>

            <QuantitySelector
              value={quantity}
              onChange={setQuantity}
              disabled={reward !== null}
            />

            <div className="mt-4">
              <Viewport
                readerId={readerId}
                state={scannerState}
                cameraError={cameraError}
              />
            </div>

            <div
              className={cn(
                "mt-3 rounded-md px-3 py-2 text-[12px] leading-snug",
                scannerState === "error"
                  ? "bg-destructive/5 text-destructive"
                  : "bg-muted/40 text-muted-foreground"
              )}
            >
              {statusLine}
            </div>
          </div>

          <LastActivityCard activity={lastActivity} />

          <SimulateCard
            value={simInput}
            onChange={setSimInput}
            onSubmit={onSimulate}
            disabled={reward !== null}
          />
        </div>
      </main>

      <RewardDialog
        open={reward !== null}
        tillCode={reward?.tillCode ?? ""}
        balance={reward?.balance ?? 0}
        redeeming={false}
        onRedeem={onRedeem}
        onSaveForLater={onSaveForLater}
      />

      <ToastPill toast={toast} />
    </div>
  )
}

const statePills: Record<
  ScannerState,
  { label: string; className: string; dot: string }
> = {
  idle: {
    label: "Idle",
    className: "border-border bg-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  starting: {
    label: "Starting",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-800",
    dot: "bg-amber-500",
  },
  running: {
    label: "Live",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    dot: "bg-emerald-500",
  },
  paused: {
    label: "Paused",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-800",
    dot: "bg-amber-500",
  },
  error: {
    label: "Error",
    className: "border-destructive/30 bg-destructive/5 text-destructive",
    dot: "bg-destructive",
  },
}

function Viewport({
  readerId,
  state,
  cameraError,
}: {
  readerId: string
  state: ScannerState
  cameraError: string | null
}) {
  const showIdleOverlay = state === "idle" || state === "starting" || state === "error"
  const showPausedOverlay = state === "paused"
  const showFrame = state === "running" || state === "paused"

  // Perfect 288×288 square — width capped so aspect-square doesn't inflate
  // to the full card width like the original `aspect-square w-full` did,
  // but tall enough that the reticle arrows render in full.
  return (
    <div className="relative mx-auto aspect-square w-72 overflow-hidden rounded-lg bg-neutral-950 ring-1 ring-foreground/10">
      <div id={readerId} className="absolute inset-0" />

      {showFrame && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-6 rounded-md"
        >
          <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-md border-l-2 border-t-2 border-white/80" />
          <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-md border-r-2 border-t-2 border-white/80" />
          <span className="absolute left-0 bottom-0 h-6 w-6 rounded-bl-md border-l-2 border-b-2 border-white/80" />
          <span className="absolute right-0 bottom-0 h-6 w-6 rounded-br-md border-r-2 border-b-2 border-white/80" />

          {state === "running" && (
            <span
              className="absolute inset-x-2 top-0 h-[2px] animate-scan-line rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
              style={{ boxShadow: "0 0 12px rgba(52, 211, 153, 0.8)" }}
            />
          )}
        </div>
      )}

      {showIdleOverlay && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-950/70 text-white backdrop-blur-sm">
          <div className="space-y-2 px-6 text-center">
            {state === "error" ? (
              <>
                <AlertCircle
                  className="mx-auto h-9 w-9 text-rose-300"
                  strokeWidth={1.75}
                />
                <div className="font-heading text-[14px] font-medium tracking-tight">
                  Camera unavailable
                </div>
                <p className="mx-auto max-w-[280px] text-[12px] leading-relaxed text-white/70">
                  {cameraError ??
                    "Check that the page has camera permission and try again."}
                </p>
              </>
            ) : (
              <>
                <Camera
                  className="mx-auto h-9 w-9 text-white/70"
                  strokeWidth={1.5}
                />
                <div className="font-heading text-[14px] font-medium tracking-tight">
                  {state === "starting" ? "Starting camera…" : "Camera idle"}
                </div>
                <p className="mx-auto max-w-[280px] text-[12px] leading-relaxed text-white/70">
                  {state === "starting"
                    ? "Grant camera permission when prompted."
                    : "Tap Start scanner to enable the camera."}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {showPausedOverlay && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-950/55 text-white">
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider backdrop-blur">
            Smart Pause · awaiting action
          </div>
        </div>
      )}
    </div>
  )
}

function LastActivityCard({ activity }: { activity: LastActivity | null }) {
  if (!activity) return null

  if (activity.kind === "reject") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <AlertCircle className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1 leading-snug">
          <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Ignored scan
          </div>
          <div className="truncate text-[13px] font-medium text-foreground">
            <span className="font-mono">{activity.tillCode || "—"}</span> · {activity.reason}
          </div>
        </div>
      </div>
    )
  }

  const meta =
    activity.kind === "redeem"
      ? { label: "Reward redeemed", tint: "bg-amber-400/15 text-amber-800" }
      : activity.kind === "save"
        ? { label: "Saved for later", tint: "bg-violet-500/10 text-violet-700" }
        : { label: "Stamp added", tint: "bg-emerald-500/10 text-emerald-700" }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", meta.tint)}>
        <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {meta.label}
        </div>
        <div className="text-[13px] font-medium text-foreground">
          <span className="font-mono">{activity.tillCode}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Balance
        </div>
        <div className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
          {activity.balance}
          <span className="text-[12px] font-medium text-muted-foreground">/{REWARD_THRESHOLD}</span>
        </div>
      </div>
    </div>
  )
}

function QuantitySelector({
  value,
  onChange,
  disabled,
}: {
  value: Quantity
  onChange: (q: Quantity) => void
  disabled: boolean
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Drinks bought
        </span>
        <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
          {value} × stamp{value === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {QUANTITY_OPTIONS.map((q) => {
          const active = q === value
          return (
            <button
              key={q}
              type="button"
              onClick={() => onChange(q)}
              disabled={disabled}
              className={cn(
                "h-9 rounded-md border text-[13px] font-semibold tabular-nums transition",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              {q}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SimulateCard({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  disabled: boolean
}) {
  const normalized = value.trim().toUpperCase()
  const valid = TILL_CODE_PATTERN.test(normalized)

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-dashed border-border bg-muted/25 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Dev · simulate a scan
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="ABC123"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 flex-1 font-mono tracking-[0.18em]"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="submit"
          disabled={!valid || disabled}
          className="h-10 px-3.5 font-medium"
        >
          Simulate
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Feeds a 6-character till code straight into the scan pipeline. Stamp 10 times to trigger
        the Smart Pause.
      </p>
    </form>
  )
}

function ToastPill({ toast }: { toast: Toast | null }) {
  if (!toast) return null
  const variantClass = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-900",
    info: "border-border bg-foreground text-background",
  }[toast.variant]

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-4"
    >
      <div
        className={cn(
          "max-w-[min(90vw,360px)] rounded-full border px-4 py-2 text-[13px] font-medium shadow-[0_16px_40px_-20px_oklch(0.145_0_0/0.45)] backdrop-blur-sm",
          variantClass
        )}
      >
        {toast.message}
      </div>
    </div>
  )
}

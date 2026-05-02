import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Coffee,
  Gift,
  HandHeart,
  Keyboard,
  Loader2,
  LogOut,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  ApiError,
  b2bScan,
  donateSuspendedCoffeeAtTill,
  getCustomerStatus,
  getSuspendedCoffeePool,
  redeem,
  serveSuspendedCoffee,
  type CommunityPoolStatus,
  type CustomerStatusResponse,
} from "@/lib/api"
import type { Session } from "@/lib/mock"

// Matches the DB CHECK constraint on users.till_code (^[A-Z0-9]{6}$).
const TILL_CODE_PATTERN = /^[A-Z0-9]{6}$/
// Window during which both the camera and the USB / keyboard path
// ignore every decoded candidate after a successful confirm — stops
// html5-qrcode's multi-frame fires (and a still camera aimed at the
// same QR) from double-stamping. Set to 4s precisely so the
// "Add-on Order" workflow still works: if the customer comes back ~10s
// later with "oh, add an Americano to that", the same QR rescans
// cleanly. Anything < 3s started missing real double-stamp risk;
// anything > 4s blocked the add-on flow.
const SCAN_LOCKOUT_MS = 4000
// How long the success state stays on screen before the overlay
// auto-closes and the camera is "Ready to Scan" again. Shorter than
// SCAN_LOCKOUT_MS so the lockout still covers stray frames in the
// 1s window between modal close and the next deliberate scan.
const SUCCESS_AUTO_RESET_MS = 3000
// Heuristic for the global USB-scanner listener: keystrokes arriving
// less than this far apart are treated as part of one scanner burst.
// Hand-typed input is ~150–250ms between keys; HID barcode wedges
// fire at <30ms.
const USB_BURST_MAX_GAP_MS = 80
const MIN_STAMPS = 0
const MAX_STAMPS = 10
const REWARD_THRESHOLD = 10

type Mode = "camera" | "keyboard"
type ScannerState = "idle" | "starting" | "running" | "paused" | "error"
type Toast = {
  id: number
  message: string
  variant: "success" | "error" | "warn" | "info"
}

export function BaristaPOSView({
  session,
  onLogout,
}: {
  session: Extract<Session, { role: "store" }>
  onLogout: () => void
}) {
  const readerId = useId().replace(/[^a-zA-Z0-9_-]/g, "") + "-barista-reader"

  const [mode, setMode] = useState<Mode>("camera")
  const [scannerState, setScannerState] = useState<ScannerState>("idle")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)

  // Post-scan state. `scannedCode` opens the overlay; `customerStatus` lands
  // once the pre-scan lookup resolves (overlay shows a skeleton until then).
  // `stampsToAdd` + `rewardsToRedeem` are the dual steppers.
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [customerStatus, setCustomerStatus] =
    useState<CustomerStatusResponse | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [stampsToAdd, setStampsToAdd] = useState(1)
  const [rewardsToRedeem, setRewardsToRedeem] = useState(0)

  // Intercept dialog: when the incoming stamps cross the threshold, ask the
  // barista whether to immediately consume the new reward or bank it.
  const [intercepting, setIntercepting] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  // Community Board / Suspended Coffee state (PRD §4.5).
  // - `pool` null until the first /pool fetch resolves (widget hides).
  // - `pool.enabled === false` → cafe owner hasn't toggled the feature on
  //   in Settings; widget stays hidden too.
  // - `pifBusy` gates both the +1 Paid at Till and the -1 Serve buttons
  //   so a quick double-tap can't fire two requests in a row.
  const [pool, setPool] = useState<CommunityPoolStatus | null>(null)
  const [pifBusy, setPifBusy] = useState(false)

  // Post-success state — overlay morphs into a "Done!" view for
  // SUCCESS_AUTO_RESET_MS before auto-closing. Lets the next customer
  // step up without the barista hitting "Cancel" or waiting for the
  // toast to time out.
  const [success, setSuccess] = useState<{ stamps: number; rewards: number } | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerPausedRef = useRef(false)
  const lockoutUntilRef = useRef(0)
  const inFlightRef = useRef(false)
  // Ref mirrors so the html5-qrcode decode callback (stale closure over
  // initial render) can read current state without re-subscribing.
  const scannedRef = useRef<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    scannedRef.current = scannedCode
  }, [scannedCode])

  // Pool initial fetch — pure side effect, no toast dependency.
  // Subsequent mutations are wired below `showToast` so the toast
  // helper is in scope for the closure.
  useEffect(() => {
    let cancelled = false
    getSuspendedCoffeePool(session.venueApiKey)
      .then((p) => {
        if (!cancelled) setPool(p)
      })
      .catch(() => {
        // Don't surface — pool widget is non-critical; the rest of the
        // POS keeps working. Will retry next mount.
        if (!cancelled) setPool(null)
      })
    return () => {
      cancelled = true
    }
  }, [session.venueApiKey])

  // ─── Toast ────────────────────────────────────────────────────────────
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
    [],
  )

  // ─── Community Board (Pay It Forward) mutate handlers ───────────────
  // Defined here (after showToast) so the closures capture it. The
  // initial pool fetch lives further up — independent of toast.
  const handleDonateTill = useCallback(async () => {
    if (pifBusy || !pool) return
    setPifBusy(true)
    try {
      const result = await donateSuspendedCoffeeAtTill(session.venueApiKey, 1)
      setPool((prev) =>
        prev ? { ...prev, pool_balance: result.new_pool_balance } : prev,
      )
      showToast(
        `+1 added to the Community Board (now ${result.new_pool_balance})`,
        "success",
      )
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Couldn't record donation."
      showToast(msg, "error", 4500)
    } finally {
      setPifBusy(false)
    }
  }, [pifBusy, pool, session.venueApiKey, showToast])

  const handleServeFromPool = useCallback(async () => {
    if (pifBusy || !pool || pool.pool_balance < 1) return
    setPifBusy(true)
    try {
      const result = await serveSuspendedCoffee(session.venueApiKey)
      setPool((prev) =>
        prev ? { ...prev, pool_balance: result.new_pool_balance } : prev,
      )
      showToast(
        `1 suspended coffee served · ${result.new_pool_balance} remaining`,
        "success",
      )
    } catch (e) {
      // 409 path — server returns "Community pool is empty." in detail.
      // Surface as an error toast rather than a fatal banner; the rest
      // of the POS is unaffected.
      if (e instanceof ApiError && e.status === 409) {
        showToast(e.detail || "Community pool is empty.", "error", 4500)
        // Sync local state with server reality (pool is 0).
        setPool((prev) => (prev ? { ...prev, pool_balance: 0 } : prev))
      } else {
        const msg = e instanceof ApiError ? e.detail : "Couldn't serve from pool."
        showToast(msg, "error", 4500)
      }
    } finally {
      setPifBusy(false)
    }
  }, [pifBusy, pool, session.venueApiKey, showToast])

  // ─── API error → toast mapping ───────────────────────────────────────
  const handleApiError = useCallback(
    (e: unknown, fallback = "Error") => {
      if (!(e instanceof ApiError)) {
        const msg = e instanceof Error ? e.message : String(e)
        showToast(`Network error: ${msg}`, "error", 4500)
        return
      }
      if (e.status === 401) {
        showToast("Invalid API key — sign out and back in.", "error", 4500)
      } else if (e.status === 402) {
        showToast(`Subscription inactive · ${e.detail}`, "error", 5500)
      } else if (e.status === 404) {
        showToast("Customer not found.", "error")
      } else if (e.status === 409) {
        showToast(`Rejected · ${e.detail}`, "warn", 4500)
      } else if (e.status === 422) {
        showToast("Invalid code format.", "error")
      } else {
        showToast(
          `${fallback} (${e.status}${e.detail ? ": " + e.detail : ""})`,
          "error",
          4000,
        )
      }
    },
    [showToast],
  )

  // ─── Camera lifecycle ─────────────────────────────────────────────────
  const handleDecoded = useCallback(
    (decoded: string) => {
      if (scannedRef.current !== null) return
      const candidate = (decoded || "").trim().toUpperCase()
      const now = Date.now()
      if (now < lockoutUntilRef.current) return
      if (inFlightRef.current) return
      if (!TILL_CODE_PATTERN.test(candidate)) return

      const s = scannerRef.current
      if (s && !scannerPausedRef.current) {
        try {
          s.pause(true)
          scannerPausedRef.current = true
          setScannerState("paused")
        } catch {
          /* library may have already stopped */
        }
      }
      setScannedCode(candidate)
    },
    [],
  )

  const startCamera = useCallback(async () => {
    if (scannerRef.current) return
    setCameraError(null)
    setScannerState("starting")
    try {
      const scanner = new Html5Qrcode(readerId, { verbose: false })
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => handleDecoded(decoded),
        () => {
          /* per-frame decode failures — swallow */
        },
      )
      scannerRef.current = scanner
      scannerPausedRef.current = false
      setScannerState("running")
    } catch (e) {
      scannerRef.current = null
      const message = e instanceof Error ? e.message : String(e)
      setCameraError(message)
      setScannerState("error")
      showToast(`Camera error: ${message}`, "error", 4500)
    }
  }, [handleDecoded, readerId, showToast])

  const stopCamera = useCallback(async () => {
    const s = scannerRef.current
    if (!s) return
    try {
      await s.stop()
    } catch {
      /* already stopped */
    }
    try {
      s.clear()
    } catch {
      /* already cleared */
    }
    scannerRef.current = null
    scannerPausedRef.current = false
    setScannerState("idle")
  }, [])

  const resumeCamera = useCallback(() => {
    const s = scannerRef.current
    if (!s || !scannerPausedRef.current) return
    try {
      s.resume()
      scannerPausedRef.current = false
      setScannerState("running")
    } catch {
      setScannerState("idle")
    }
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

  // Always-on camera: auto-start the moment the POS mounts (or the user
  // flips back to camera mode), and tear down on the way out of camera
  // mode. The barista never has to click "Start camera" — the founder
  // wants a queue to be able to step through the till with zero
  // touch-the-screen friction between customers.
  useEffect(() => {
    if (mode === "camera") {
      void startCamera()
    } else {
      void stopCamera()
    }
  }, [mode, startCamera, stopCamera])

  // Global USB-scanner listener. HID barcode wedges fire keystrokes at
  // <30ms intervals followed by Enter, so a "fast burst ending in
  // Enter" reliably distinguishes a scanner from a human. Attached at
  // window level so the barista never has to focus a specific input
  // — the till can be on the camera tab AND a USB scan still
  // dispatches a customer lookup.
  //
  // We bypass the listener whenever the keystroke is targeted at a
  // real input/textarea (so the manual Customer ID box and any
  // dialog text fields keep working untouched), and we share the
  // overlay-open + lockout gates with the camera path so back-to-back
  // scans of the same QR can't double-stamp.
  useEffect(() => {
    let buffer = ""
    let lastKeyAt = 0
    const handler = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      // Ignore modifier keys + shortcut combinations entirely.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const now = Date.now()
      const gap = now - lastKeyAt
      if (gap > USB_BURST_MAX_GAP_MS && e.key !== "Enter") {
        // New burst — reset the buffer.
        buffer = ""
      }
      lastKeyAt = now

      if (e.key === "Enter") {
        const candidate = buffer
        buffer = ""
        if (!TILL_CODE_PATTERN.test(candidate)) return
        // Same blockers as handleDecoded — overlay open, in-flight,
        // or lockout window means the keystroke burst is dropped.
        if (scannedRef.current !== null) return
        if (now < lockoutUntilRef.current) return
        if (inFlightRef.current) return
        e.preventDefault()
        setScannedCode(candidate)
        return
      }

      // Single printable character — append to the rolling buffer
      // (clamped to 6 so trailing keystrokes overwrite, not concat).
      if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key)) {
        buffer = (buffer + e.key.toUpperCase()).slice(-6)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // ─── Pre-scan customer lookup ─────────────────────────────────────────
  // Every time `scannedCode` changes to a new non-null value, fetch the
  // customer's current stamps + banked rewards. The overlay renders a
  // loading state while this resolves. Failure closes the overlay and
  // surfaces an error toast so the barista can try again.
  useEffect(() => {
    if (scannedCode === null) {
      setCustomerStatus(null)
      setStatusError(null)
      return
    }
    let cancelled = false
    setCustomerStatus(null)
    setStatusError(null)
    ;(async () => {
      try {
        const status = await getCustomerStatus(session.venueApiKey, scannedCode)
        if (cancelled) return
        setCustomerStatus(status)
        // Defaults per spec: stamps=1 when no banked rewards, else 0 (the
        // barista is more likely redeeming than earning). Rewards default 0.
        setStampsToAdd(status.banked_rewards > 0 ? 0 : 1)
        setRewardsToRedeem(0)
      } catch (e) {
        if (cancelled) return
        const msg =
          e instanceof ApiError
            ? e.status === 404
              ? "Customer not found."
              : e.detail
            : "Couldn't load customer status."
        setStatusError(msg)
        handleApiError(e, "Lookup failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scannedCode, session.venueApiKey, handleApiError])

  // ─── Keyboard / USB-wedge path ────────────────────────────────────────
  const submitManual = useCallback(() => {
    const candidate = manualInput.trim().toUpperCase()
    if (!TILL_CODE_PATTERN.test(candidate)) {
      setManualError("Enter a 6-character code (A–Z, 0–9).")
      return
    }
    setManualError(null)
    setScannedCode(candidate)
    setManualInput("")
  }, [manualInput])

  const onManualKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submitManual()
    }
  }

  // ─── Confirm / Intercept / Execute ────────────────────────────────────
  // Execute the transaction: call b2bScan first (if adding stamps), then
  // redeem (if consuming banked rewards). Order matters — any stamps added
  // first increase the balance so a reward redeem on this same transaction
  // (e.g. the intercept "yes, make one free" case) has enough stamps.
  const executeTransaction = useCallback(
    async (stamps: number, rewards: number) => {
      if (!scannedCode) return
      if (stamps === 0 && rewards === 0) {
        cancelScanImpl()
        return
      }
      setSubmitting(true)
      inFlightRef.current = true
      try {
        if (stamps > 0) {
          await b2bScan(
            session.venueApiKey,
            session.venueApiKey,
            scannedCode,
            stamps,
          )
        }
        if (rewards > 0) {
          await redeem(session.venueApiKey, scannedCode, rewards)
        }
        lockoutUntilRef.current = Date.now() + SCAN_LOCKOUT_MS

        const parts: string[] = []
        if (stamps > 0) parts.push(`+${stamps} stamp${stamps === 1 ? "" : "s"}`)
        if (rewards > 0)
          parts.push(
            `${rewards} reward${rewards === 1 ? "" : "s"} redeemed`,
          )
        showToast(parts.join(" · "), "success", 3000)
        // Morph the overlay into a "Done!" success state. The auto-reset
        // effect below closes the overlay and resumes the camera after
        // SUCCESS_AUTO_RESET_MS so the next customer can step up
        // without the barista touching anything.
        setSuccess({ stamps, rewards })
      } catch (e) {
        handleApiError(e, "Scan failed")
        // Leave overlay open; barista can adjust + retry or cancel.
      } finally {
        inFlightRef.current = false
        setSubmitting(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scannedCode, session.venueApiKey, showToast, handleApiError],
  )

  // Intercept trigger. `current_stamps` from the server is already mod-10
  // (banking model), so we just check the simple sum. Only fires when
  // barista is adding stamps AND the sum STRICTLY EXCEEDS the threshold —
  // "Buy 10, get the 11th free". Landing exactly on 10 just fills the card
  // and banks a reward for next visit; there's no 11th drink in THIS order
  // to offer on the house, so no intercept.
  //   current=0, add=10  → sum=10 → NO intercept (banks 1 reward)
  //   current=8, add=3   → sum=11 → YES intercept (one of these 3 can be free)
  //   current=8, add=2   → sum=10 → NO intercept (fills card, banks 1)
  const shouldIntercept = (): boolean => {
    if (!customerStatus) return false
    if (stampsToAdd === 0) return false
    return customerStatus.current_stamps + stampsToAdd > REWARD_THRESHOLD
  }

  const handleConfirm = () => {
    if (!customerStatus || submitting) return
    if (shouldIntercept()) {
      setIntercepting(true)
      return
    }
    void executeTransaction(stampsToAdd, rewardsToRedeem)
  }

  const handleInterceptYes = () => {
    // "Yes, make 1 drink free": fold one stamp off the add-pile and onto the
    // redeem-pile. Execute the combined basket.
    setIntercepting(false)
    const newStamps = Math.max(0, stampsToAdd - 1)
    const newRewards = rewardsToRedeem + 1
    setStampsToAdd(newStamps)
    setRewardsToRedeem(newRewards)
    void executeTransaction(newStamps, newRewards)
  }

  const handleInterceptNo = () => {
    // "No, save for later": just add the stamps; banking model lets the
    // balance cross the threshold safely.
    setIntercepting(false)
    void executeTransaction(stampsToAdd, rewardsToRedeem)
  }

  // Shared close-overlay helper — also resumes camera if applicable. Used
  // both by Cancel and by the post-confirm success path.
  const closeOverlayImpl = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
    setSuccess(null)
    setScannedCode(null)
    setCustomerStatus(null)
    setStatusError(null)
    setStampsToAdd(1)
    setRewardsToRedeem(0)
    if (mode === "camera") resumeCamera()
  }

  const cancelScanImpl = () => {
    if (submitting) return
    closeOverlayImpl()
  }

  // Auto-reset: once a transaction succeeds, hold the success state for
  // SUCCESS_AUTO_RESET_MS, then close the overlay + resume the camera
  // so the next customer in the queue can scan without the barista
  // touching the screen. The timer is cancelled if the barista
  // manually closes the overlay or unmounts the component.
  useEffect(() => {
    if (success === null) return
    successTimerRef.current = setTimeout(() => {
      successTimerRef.current = null
      closeOverlayImpl()
    }, SUCCESS_AUTO_RESET_MS)
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
    // closeOverlayImpl is stable enough — the only reactive bit is
    // `mode` (read inside) and we want the timer to keep ticking even
    // if the operator switches mode mid-success. eslint-disable-next-line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success])

  // ─── Derived render state ─────────────────────────────────────────────
  const statePill = useMemo(() => statePills[scannerState], [scannerState])
  const canConfirm =
    customerStatus !== null &&
    !submitting &&
    (stampsToAdd > 0 || rewardsToRedeem > 0)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background">
            <Coffee className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Barista POS Scanner
            </div>
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

      <main className="flex flex-1 items-start justify-center px-4 py-6 sm:px-6">
        <div className="w-full max-w-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight">Scanner</h1>
              <p className="text-[12.5px] text-muted-foreground">
                Point the camera at a customer's QR, or type / scan their 6-character ID.
              </p>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                statePill.className,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", statePill.dot)} />
              {statePill.label}
            </span>
          </div>

          {/* Community Board / Pay It Forward (PRD §4.5) — only renders
              when the cafe owner has toggled the feature on in Settings.
              Always visible above the scan tabs so the barista can serve
              or record a till donation without changing modes. */}
          {pool?.enabled ? (
            <CommunityBoardWidget
              balance={pool.pool_balance}
              busy={pifBusy}
              onDonateTill={handleDonateTill}
              onServe={handleServeFromPool}
            />
          ) : null}

          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1">
            <ModeTab
              active={mode === "camera"}
              icon={Camera}
              label="Camera"
              onClick={() => setMode("camera")}
            />
            <ModeTab
              active={mode === "keyboard"}
              icon={Keyboard}
              label="Keyboard / USB Scanner"
              onClick={() => setMode("keyboard")}
            />
          </div>

          {mode === "camera" && (
            <div className="space-y-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-black">
                <div id={readerId} className="h-full w-full" />
                {scannerState !== "running" && scannerState !== "paused" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center text-white">
                    {scannerState === "error" ? (
                      <>
                        <XCircle className="h-6 w-6 text-rose-400" strokeWidth={2} />
                        <p className="max-w-[80%] text-[12.5px] leading-snug">
                          {cameraError}
                        </p>
                        <Button size="sm" variant="secondary" onClick={startCamera} className="gap-1.5">
                          <Play className="h-3.5 w-3.5" />
                          Try again
                        </Button>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} />
                        <p className="text-[13px]">Starting camera…</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              {scannerState === "running" && (
                <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 ring-1 ring-emerald-200">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Ready to scan — point the camera at a customer's QR.
                  </span>
                </div>
              )}
            </div>
          )}

          {mode === "keyboard" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <label
                htmlFor="barista-manual-input"
                className="text-[13px] font-medium tracking-tight text-foreground"
              >
                Customer ID
              </label>
              <Input
                id="barista-manual-input"
                autoFocus
                value={manualInput}
                onChange={(e) =>
                  setManualInput(e.target.value.toUpperCase().slice(0, 6))
                }
                onKeyDown={onManualKeyDown}
                placeholder="e.g. 7K3Q9P"
                maxLength={6}
                className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                disabled={scannedCode !== null || submitting}
              />
              <p className="text-[11.5px] text-muted-foreground">
                Type the 6-character code and press{" "}
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
                  Enter
                </kbd>
                . Physical USB scanners will auto-submit.
              </p>
              {manualError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  {manualError}
                </div>
              )}
              <Button
                onClick={submitManual}
                disabled={manualInput.trim().length === 0 || scannedCode !== null}
                className="h-10 w-full"
              >
                Look up customer
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Action overlay — dual stepper, real customer status. */}
      {scannedCode && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            {success ? (
              // Post-confirm success state — overlay holds for
              // SUCCESS_AUTO_RESET_MS then auto-closes via the effect
              // above. Big visual ✓ so the next customer in the queue
              // can see at a glance that the till is mid-reset.
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50">
                  <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
                </div>
                <div className="text-[18px] font-semibold tracking-tight text-foreground">
                  Done!
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {success.stamps > 0 && success.rewards > 0
                    ? `+${success.stamps} stamp${success.stamps === 1 ? "" : "s"} · ${success.rewards} reward${success.rewards === 1 ? "" : "s"} redeemed`
                    : success.stamps > 0
                      ? `+${success.stamps} stamp${success.stamps === 1 ? "" : "s"} added`
                      : `${success.rewards} reward${success.rewards === 1 ? "" : "s"} redeemed`}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.25} />
                  Ready for the next customer in 3 seconds…
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeOverlayImpl}
                  className="mt-1 h-8 text-[12px] text-muted-foreground"
                >
                  Skip — scan now
                </Button>
              </div>
            ) : (
              <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                  Scanned
                </div>
                <p className="mt-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  Customer ID
                </p>
                <p className="mt-0.5 font-mono text-3xl font-semibold tracking-[0.3em] text-foreground">
                  {scannedCode}
                </p>
              </div>
              <button
                type="button"
                onClick={cancelScanImpl}
                disabled={submitting}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            {/* Customer status tiles */}
            {customerStatus === null && statusError === null ? (
              <div className="mt-4 flex items-center justify-center rounded-lg border border-border bg-muted/30 p-5">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground">
                  Loading balance…
                </span>
              </div>
            ) : statusError !== null ? (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-[13px] font-medium text-destructive">
                  {statusError}
                </p>
                <p className="mt-1 text-[11.5px] text-destructive/80">
                  Cancel and try the code again.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                      Current stamps
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
                      {customerStatus!.current_stamps}
                      <span className="text-[13px] text-muted-foreground">
                        /{customerStatus!.threshold}
                      </span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg border p-3",
                      customerStatus!.banked_rewards > 0
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-border bg-muted/30",
                    )}
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider",
                        customerStatus!.banked_rewards > 0
                          ? "text-emerald-800"
                          : "text-muted-foreground",
                      )}
                    >
                      <Gift className="h-3 w-3" strokeWidth={2.5} />
                      Banked rewards
                    </div>
                    <div
                      className={cn(
                        "mt-1 font-mono text-2xl font-semibold tabular-nums",
                        customerStatus!.banked_rewards > 0
                          ? "text-emerald-800"
                          : "text-foreground",
                      )}
                    >
                      {customerStatus!.banked_rewards}
                    </div>
                  </div>
                </div>

                {/* Dual steppers */}
                <div className="mt-4 space-y-3">
                  <Stepper
                    label="Paid drinks (add stamps)"
                    icon={Coffee}
                    value={stampsToAdd}
                    onChange={setStampsToAdd}
                    min={MIN_STAMPS}
                    max={MAX_STAMPS}
                    disabled={submitting}
                  />
                  <Stepper
                    label="Free drinks (redeem rewards)"
                    icon={Sparkles}
                    value={rewardsToRedeem}
                    onChange={setRewardsToRedeem}
                    min={0}
                    max={customerStatus!.banked_rewards}
                    disabled={submitting || customerStatus!.banked_rewards === 0}
                    emptyHint={
                      customerStatus!.banked_rewards === 0
                        ? "No banked rewards"
                        : undefined
                    }
                  />
                </div>

                <Button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="mt-5 h-14 w-full gap-2 text-[15px] font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                      Processing…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                      Confirm
                      {stampsToAdd > 0 && rewardsToRedeem > 0
                        ? ` · ${stampsToAdd} paid + ${rewardsToRedeem} free`
                        : stampsToAdd > 0
                          ? ` · Add ${stampsToAdd} stamp${stampsToAdd === 1 ? "" : "s"}`
                          : rewardsToRedeem > 0
                            ? ` · Redeem ${rewardsToRedeem}`
                            : ""}
                    </>
                  )}
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              onClick={cancelScanImpl}
              disabled={submitting}
              className="mt-2 h-10 w-full gap-1.5 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Cancel / Rescan
            </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mid-Order Intercept dialog */}
      <Dialog open={intercepting} onOpenChange={(v) => !v && setIntercepting(false)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[17px] tracking-tight">
              This order crosses the reward threshold
            </DialogTitle>
            <DialogDescription>
              Adding{" "}
              <span className="font-medium text-foreground">
                {stampsToAdd} stamp{stampsToAdd === 1 ? "" : "s"}
              </span>{" "}
              takes this customer from{" "}
              <span className="font-mono font-medium text-foreground">
                {customerStatus?.current_stamps ?? "—"}/{REWARD_THRESHOLD}
              </span>{" "}
              to a full card. Does the customer want one of today's drinks on
              the house?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={handleInterceptNo}
              className="h-11 flex-1"
            >
              No — save for later
            </Button>
            <Button onClick={handleInterceptYes} className="h-11 flex-1 gap-1.5">
              <Gift className="h-4 w-4" strokeWidth={2.5} />
              Yes, make 1 drink free
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-6 z-50 mx-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-lg ring-1",
            toast.variant === "success" && "bg-emerald-600 text-white ring-emerald-700/40",
            toast.variant === "error" && "bg-rose-600 text-white ring-rose-700/40",
            toast.variant === "warn" && "bg-emerald-500 text-white ring-emerald-600/40",
            toast.variant === "info" && "bg-foreground text-background ring-foreground/40",
          )}
          role="status"
        >
          {toast.variant === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          )}
          <span className="truncate">{toast.message}</span>
        </div>
      )}
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
    dot: "bg-muted-foreground",
  },
  starting: {
    label: "Starting",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  running: {
    label: "Scanning",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  paused: {
    label: "Paused",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
  },
  error: {
    label: "Error",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
  },
}

function ModeTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Camera
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      {label}
    </button>
  )
}

function Stepper({
  label,
  icon: Icon,
  value,
  onChange,
  min,
  max,
  disabled,
  emptyHint,
}: {
  label: string
  icon: typeof Coffee
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  disabled?: boolean
  emptyHint?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background p-3 transition-opacity",
        // Greyed-out when the whole stepper is disabled (e.g. Free-drinks
        // stepper when banked_rewards === 0). Still rendered so the barista
        // always sees the feature; just can't interact with it.
        disabled && "opacity-50",
      )}
      aria-disabled={disabled}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" strokeWidth={2.5} />
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          className="h-11 w-11"
          aria-label="Decrement"
        >
          <Minus className="h-5 w-5" strokeWidth={2.5} />
        </Button>
        <span
          className={cn(
            "font-mono text-4xl font-semibold tabular-nums",
            disabled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {value}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          className="h-11 w-11"
          aria-label="Increment"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </Button>
      </div>
      {emptyHint && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {emptyHint}
        </p>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────
// Community Board widget — Pay It Forward / Suspended Coffee
// PRD §4.5. Renders only when the cafe is enrolled (parent gates on
// `pool.enabled`). Two quick-action buttons that mutate the pool by
// ±1; the parent owns the API calls + balance state so the widget
// stays display-only.
// ─────────────────────────────────────────────────────────────────────

function CommunityBoardWidget({
  balance,
  busy,
  onDonateTill,
  onServe,
}: {
  balance: number
  busy: boolean
  onDonateTill: () => void
  onServe: () => void
}) {
  const empty = balance < 1
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 ring-1 ring-emerald-200">
          <HandHeart className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-emerald-700">
            Community Board
          </div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            {balance} {balance === 1 ? "coffee" : "coffees"} on the board
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"
          onClick={onDonateTill}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
          ) : (
            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
          Paid at Till
        </Button>
        <Button
          size="sm"
          className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:bg-emerald-200 disabled:text-emerald-700"
          onClick={onServe}
          disabled={busy || empty}
          title={empty ? "Pool is empty" : "Serve one from the community pool"}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
          ) : (
            <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
          Serve from Pool
        </Button>
      </div>
    </div>
  )
}

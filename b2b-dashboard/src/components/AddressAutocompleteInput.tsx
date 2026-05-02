import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { geocodeAutocomplete, humanizeError } from "@/lib/api"

const AUTOCOMPLETE_DEBOUNCE_MS = 800
const MIN_QUERY_LEN = 3

// Reusable address combobox backed by /api/b2b/geocode/autocomplete.
// Owner of `value` lives outside this component so it composes cleanly
// with both AddLocationDialog (free-typed) and EditLocationDialog
// (pre-populated). The debounce + AbortController + focused state live
// inside so each call site doesn't re-implement the same plumbing.
export function AddressAutocompleteInput({
  token,
  value,
  onChange,
  disabled,
  placeholder = "Start typing address...",
  inputClassName,
}: {
  token: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  placeholder?: string
  inputClassName?: string
}) {
  const [focused, setFocused] = useState(false)
  // Tracks the last value we emitted via `onChange(picked)` — used to
  // suppress the debounced fetch immediately after a click (otherwise
  // we'd re-query the exact string we just locked in).
  const justPickedRef = useRef<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = value.trim()
    if (justPickedRef.current && justPickedRef.current === value) {
      // Skip — caller just accepted a suggestion.
      return
    }
    if (trimmed.length < MIN_QUERY_LEN) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await geocodeAutocomplete(token, trimmed, controller.signal)
        if (controller.signal.aborted) return
        setSuggestions(list)
      } catch (e) {
        if (controller.signal.aborted) return
        setError(humanizeError(e))
        setSuggestions([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [token, value])

  const pick = (addr: string) => {
    justPickedRef.current = addr
    onChange(addr)
    setFocused(false)
  }

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2}
      />
      <Input
        value={value}
        onChange={(e) => {
          justPickedRef.current = null
          onChange(e.target.value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay so a click on a suggestion can register before blur
          // tears the dropdown down.
          window.setTimeout(() => setFocused(false), 150)
        }}
        className={`h-10 pl-9 ${inputClassName ?? ""}`}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {focused && loading && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 flex items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5 text-[12px] text-muted-foreground shadow-lg">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
          Searching addresses…
        </div>
      )}

      {focused && !loading && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-popover shadow-lg ring-1 ring-foreground/5"
        >
          {suggestions.map((addr) => (
            <li key={addr}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(addr)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-muted"
              >
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={2}
                />
                <span className="text-foreground">{addr}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {focused &&
        !loading &&
        value.trim().length >= MIN_QUERY_LEN &&
        suggestions.length === 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-xl border border-border bg-popover px-3 py-2.5 text-[12px] text-muted-foreground shadow-lg">
            {error ?? "No matches yet — keep typing or save manually."}
          </div>
        )}
    </div>
  )
}

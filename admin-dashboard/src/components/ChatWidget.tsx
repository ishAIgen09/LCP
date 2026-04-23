import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { postAiAgent } from "@/lib/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "I'm your LCP Data Assistant. Ask me anything about platform revenue, cafe ROI, or user behavior.",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  // Focus the input on open so typing is immediate — small detail, big
  // UX win for a chat widget.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await postAiAgent(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach the agent.");
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline — standard chat UX.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-none relative mx-auto h-0 w-full max-w-[1800px]">
        {/* Collapsed FAB — amber accent to match the dashboard's existing
            kicker vocabulary. Hidden while open. */}
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open LCP Data Assistant"
            className="pointer-events-auto absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/30 ring-1 ring-amber-300/50 transition-all hover:bg-amber-400 hover:shadow-amber-500/40"
          >
            <Sparkles className="h-6 w-6" strokeWidth={2.4} />
          </button>
        ) : null}

        {/* Expanded panel. Fixed-size, pinned bottom-right. */}
        {open ? (
          <div
            role="dialog"
            aria-label="LCP Data Assistant"
            className="pointer-events-auto absolute bottom-6 right-6 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl shadow-black/60"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <ChatHeader onClose={() => setOpen(false)} />
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {busy ? <TypingBubble /> : null}
              {error ? (
                <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              ) : null}
            </div>
            <ChatComposer
              draft={draft}
              busy={busy}
              onChange={setDraft}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 ring-1 ring-amber-500/30">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-100">
            LCP Data Assistant
          </div>
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-neutral-500">
            Preview · placeholder responses
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close assistant"
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      >
        <X className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-amber-500/90 px-3.5 py-2 text-sm leading-5 text-neutral-950 shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 ring-1 ring-amber-500/30">
        <Sparkles className="h-3 w-3 text-amber-300" strokeWidth={2.4} />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-neutral-800 bg-neutral-900/60 px-3.5 py-2 text-sm leading-5 text-neutral-200 shadow-sm">
        {message.content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 ring-1 ring-amber-500/30">
        <Loader2
          className="h-3 w-3 animate-spin text-amber-300"
          strokeWidth={2.4}
        />
      </div>
      <div className="inline-flex items-center gap-1 rounded-2xl rounded-tl-md border border-neutral-800 bg-neutral-900/60 px-3.5 py-2.5 shadow-sm">
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-neutral-500"
      style={{
        animation: "lcp-chat-dot 1s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

function ChatComposer({
  draft,
  busy,
  onChange,
  onSend,
  onKeyDown,
  inputRef,
}: {
  draft: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const canSend = draft.trim().length > 0 && !busy;
  return (
    <div className="border-t border-neutral-800 bg-neutral-900/60 p-3">
      <div className="flex items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/20">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about MRR, cafe ROI, cohorts…"
          rows={1}
          className="min-h-[24px] flex-1 resize-none bg-transparent text-sm text-neutral-100 placeholder-neutral-500 outline-none"
          style={{ maxHeight: 120 }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/90 text-neutral-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      </div>
      <div className="mt-1.5 text-[10px] text-neutral-600">
        Enter to send · Shift+Enter for a newline
      </div>
    </div>
  );
}

// Keyframes for the typing indicator. Inlined via a style tag so no
// tailwind config change is needed for a single animation.
if (
  typeof document !== "undefined" &&
  !document.getElementById("lcp-chat-dot-kf")
) {
  const style = document.createElement("style");
  style.id = "lcp-chat-dot-kf";
  style.textContent =
    "@keyframes lcp-chat-dot { 0%, 80%, 100% { opacity: 0.35; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }";
  document.head.appendChild(style);
}

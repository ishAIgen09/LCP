import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Coffee, Gift, MapPin, RefreshCw } from "lucide-react-native";

import { fetchHistory, type HistoryEntry } from "./api";
import type { Session } from "./theme";
import { COLOR } from "./theme";

export function HistoryScreen({ session }: { session: Session }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchHistory(session.token);
      setEntries(rows);
    } catch (e: any) {
      setError(e?.detail || e?.message || "Couldn't load your history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Re-fetch on every mount (tab switch). Cheap — server caps at 50 rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="pt-2">
        <Text
          className="text-[11px] font-semibold uppercase"
          style={{ color: COLOR.textDim, letterSpacing: 2 }}
        >
          Activity
        </Text>
        <Text
          className="mt-2 text-[26px] font-semibold"
          style={{ color: COLOR.text, letterSpacing: -0.5 }}
        >
          Your coffee history
        </Text>
        <Text
          className="mt-1.5 text-sm leading-5"
          style={{ color: COLOR.textMuted }}
        >
          Every scan and redemption, in order.
        </Text>
      </View>

      {loading && entries === null ? (
        <LoadingCard />
      ) : error ? (
        <ErrorCard message={error} onRetry={load} />
      ) : entries && entries.length === 0 ? (
        <EmptyCard />
      ) : entries ? (
        <View
          className="mt-6 rounded-3xl"
          style={{
            backgroundColor: COLOR.surface,
            borderWidth: 1,
            borderColor: COLOR.border,
          }}
        >
          {entries.map((entry, i) => (
            <ActivityRow
              key={entry.transaction_id}
              entry={entry}
              isLast={i === entries.length - 1}
            />
          ))}
        </View>
      ) : null}

      <View
        className="mt-5 rounded-2xl px-4 py-3"
        style={{
          backgroundColor: "rgba(228,185,127,0.06)",
          borderWidth: 1,
          borderColor: "rgba(228,185,127,0.15)",
        }}
      >
        <Text
          className="text-[12px] leading-4"
          style={{ color: COLOR.textMuted }}
        >
          Tip: older activity is preserved forever. Our ledger is append-only —
          nothing gets quietly deleted.
        </Text>
      </View>
    </ScrollView>
  );
}

function ActivityRow({
  entry,
  isLast,
}: {
  entry: HistoryEntry;
  isLast: boolean;
}) {
  const isRedeem = entry.kind === "redeem";
  const Icon = isRedeem ? Gift : Coffee;
  const tint = isRedeem ? "rgba(74,222,128,0.12)" : "rgba(228,185,127,0.1)";
  const tintBorder = isRedeem
    ? "rgba(74,222,128,0.22)"
    : "rgba(228,185,127,0.2)";
  const iconColor = isRedeem ? COLOR.live : COLOR.accent;
  // "Earned @ Cafe" / "Redeemed @ Cafe" reads like a bank statement —
  // cleaner scan than "Earned N stamps" / "Redeemed N free drinks".
  // Quantity (e.g. "+3 stamps", "-1 free drink") moves to a subtle
  // secondary line so the cafe name wins the eye.
  const verb = isRedeem ? "Redeemed" : "Earned";
  const qtyLabel = isRedeem
    ? `${entry.quantity} free drink${entry.quantity === 1 ? "" : "s"}`
    : `${entry.quantity} stamp${entry.quantity === 1 ? "" : "s"}`;

  return (
    <View
      className="flex-row p-4"
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: COLOR.border,
      }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tint,
          borderWidth: 1,
          borderColor: tintBorder,
        }}
      >
        <Icon size={18} color={iconColor} strokeWidth={2} />
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className="text-[15px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.1 }}
            numberOfLines={1}
          >
            {verb} @ {entry.cafe_name}
          </Text>
          <Text className="text-[11px]" style={{ color: COLOR.textDim }}>
            {formatWhen(entry.timestamp)}
          </Text>
        </View>
        <View className="mt-1 flex-row items-center">
          <MapPin size={12} color={COLOR.textDim} strokeWidth={2} />
          <Text
            className="ml-1 text-[12px]"
            style={{ color: COLOR.textMuted }}
            numberOfLines={1}
          >
            {entry.cafe_address} · {qtyLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LoadingCard() {
  return (
    <View
      className="mt-6 items-center justify-center rounded-3xl py-10"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: COLOR.border,
      }}
    >
      <ActivityIndicator color={COLOR.accent} />
      <Text className="mt-3 text-[12px]" style={{ color: COLOR.textMuted }}>
        Loading your coffee history…
      </Text>
    </View>
  );
}

function EmptyCard() {
  return (
    <View
      className="mt-6 items-center rounded-3xl px-5 py-10"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: COLOR.border,
      }}
    >
      <Coffee size={22} color={COLOR.textDim} strokeWidth={1.75} />
      <Text
        className="mt-3 text-[15px] font-semibold"
        style={{ color: COLOR.text }}
      >
        No activity yet
      </Text>
      <Text
        className="mt-1 text-center text-[12.5px] leading-5"
        style={{ color: COLOR.textMuted }}
      >
        Your first stamp will show up here. Flash your QR at any participating
        cafe to start.
      </Text>
    </View>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View
      className="mt-6 items-center rounded-3xl px-5 py-8"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: COLOR.border,
      }}
    >
      <Text
        className="text-[14px] font-semibold"
        style={{ color: COLOR.text }}
      >
        Couldn't load history
      </Text>
      <Text
        className="mt-1 text-center text-[12px] leading-5"
        style={{ color: COLOR.textMuted }}
      >
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-4 flex-row items-center gap-2 rounded-full px-4 py-2"
        style={{ backgroundColor: COLOR.accent }}
      >
        <RefreshCw size={14} color={COLOR.bg} strokeWidth={2.5} />
        <Text className="text-[12.5px] font-semibold" style={{ color: COLOR.bg }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

// Human-ish timestamp. Keeps the wording close to the old mock's "Today ·
// 08:12", "Yesterday · 17:40", "3 days ago · 09:05". No external date library
// — the app-wide rule is to avoid dependencies we don't already have.
function formatWhen(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  const msInDay = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - thenDay) / msInDay);

  const hh = String(then.getHours()).padStart(2, "0");
  const mm = String(then.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (dayDiff <= 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Yesterday · ${time}`;
  if (dayDiff < 7) return `${dayDiff} days ago · ${time}`;
  const weeks = Math.round(dayDiff / 7);
  if (weeks === 1) return `Last week · ${time}`;
  if (dayDiff < 60) return `${weeks} weeks ago · ${time}`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

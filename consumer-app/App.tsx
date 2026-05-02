import "./global.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, Platform, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import QRCode from "react-native-qrcode-svg";
import {
  Bell,
  Coffee,
  Compass,
  Clock,
  Gift,
  HandHeart,
  House,
  MapPin,
  Navigation,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  User as UserIcon,
  Wallet,
} from "lucide-react-native";
import * as Location from "expo-location";

import { LoginScreen } from "./src/LoginScreen";
import { HistoryScreen } from "./src/HistoryScreen";
import { RewardModal, type RewardPayload } from "./src/RewardModal";
import { CafeDetailsModal } from "./src/CafeDetailsModal";
import { AMENITIES, lookupAmenity, type AmenityDef } from "./src/amenities";
import {
  fetchDiscoverCafes,
  fetchWallet,
  type DiscoverCafe,
  type DiscoverOffer,
  type FoodHygieneRating,
  type PrivateBrandBalance,
} from "./src/api";
import { formatOfferHeadline, formatOfferWindow } from "./src/offers";
import { COLOR, FONT, type Session } from "./src/theme";

const BALANCE_POLL_MS = 3000;

// Discovery is local-only — anything farther than this gets dropped from the
// feed entirely (so a Manchester user never sees a London cafe). Keep in
// sync with the backend if a server-side cap ever lands; today the
// enforcement is purely client-side because /api/consumer/cafes returns the
// full directory.
const DISCOVERY_RADIUS_MILES = 5;

// Deterministic mock distance used when the device hasn't granted location
// permission (or the GPS errors). Hashing the cafe id keeps the value stable
// across renders and across cards — the same cafe always reads the same
// "1.2 mi away" so the UI doesn't flicker on every poll. Capped at the
// discovery radius so the mock never produces a card that we'd then filter
// out.
function mockDistanceMiles(cafeId: string): number {
  let hash = 0;
  for (let i = 0; i < cafeId.length; i += 1) {
    hash = (hash * 31 + cafeId.charCodeAt(i)) >>> 0;
  }
  // 0.3 mi … (radius - 0.2) mi, one decimal of resolution.
  const span = Math.max(0.5, DISCOVERY_RADIUS_MILES - 0.5);
  return Math.round((0.3 + (hash % Math.round(span * 10)) / 10) * 10) / 10;
}

type Tab = "home" | "history" | "discover" | "profile";

const STAMPS_TARGET = 10;
const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const COFFEE_QUOTES = [
  "A yawn is a silent scream for coffee.",
  "Life happens, coffee helps.",
  "Behind every great day is a great cup of coffee.",
  "But first, coffee.",
  "Espresso yourself.",
  "Coffee: because adulting is hard.",
];

function getGreeting(firstName: string, hour: number) {
  if (hour >= 5 && hour < 11) {
    return `Good morning, ${firstName} 🌅`;
  }
  if (hour >= 11 && hour < 14) {
    return `Hello, ${firstName} 👋`;
  }
  if (hour >= 14 && hour < 17) {
    return `Afternoon slump, ${firstName}?`;
  }
  return `Good evening, ${firstName} 🌙`;
}

function getGreetingSubtitle(hour: number) {
  if (hour >= 5 && hour < 11) return "Time for that first cup.";
  if (hour >= 11 && hour < 14) return "Midday fuel awaits.";
  if (hour >= 14 && hour < 17) return "☕ Go grab a coffee.";
  return "Decaf time?";
}

const SAMPLE_REWARDS: RewardPayload[] = [
  {
    stampsEarned: 1,
    cafeName: "Shoreditch Roasters",
    cafeAddress: "12 Redchurch St, London E2 7DP",
    newBalance: 8,
  },
  {
    stampsEarned: 1,
    cafeName: "King's Cross Coffee",
    cafeAddress: "45 Caledonian Rd, London N1 9DX",
    newBalance: 9,
  },
  {
    stampsEarned: 1,
    cafeName: "Peckham Beans",
    cafeAddress: "22 Rye Lane, London SE15 5BS",
    newBalance: 10,
    freeDrinkUnlocked: true,
  },
];

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!fontsLoaded) {
    // Hold on the brand dark bg with a spinner so we don't render the UI
    // with system-font fallback and then repaint once Inter arrives. useFonts
    // returns [true] immediately on subsequent launches (cached).
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLOR.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={COLOR.accent} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [reward, setReward] = useState<RewardPayload | null>(null);
  const handleReward = useCallback((payload: RewardPayload) => {
    setReward(payload);
  }, []);

  if (!session) {
    return (
      <LoginScreen onAuthenticated={(s) => setSession(s)} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLOR.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.bg} />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {tab === "home" && (
          <HomeView
            session={session}
            onSignOut={() => setSession(null)}
            onTriggerReward={() => {
              const pick = SAMPLE_REWARDS[Math.floor(Math.random() * SAMPLE_REWARDS.length)];
              setReward(pick);
            }}
            onReward={handleReward}
          />
        )}
        {tab === "history" && <HistoryScreen session={session} />}
        {tab === "discover" && <DiscoverView session={session} />}
        {tab === "profile" && (
          <ProfileView session={session} onSignOut={() => setSession(null)} />
        )}
      </SafeAreaView>
      <BottomNav active={tab} onChange={setTab} />
      <RewardModal
        visible={reward !== null}
        payload={reward}
        onClose={() => setReward(null)}
      />
    </View>
  );
}

function HomeView({
  session,
  onSignOut,
  onTriggerReward,
  onReward,
}: {
  session: Session;
  onSignOut: () => void;
  onTriggerReward: () => void;
  onReward: (payload: RewardPayload) => void;
}) {
  const firstName = session.consumer.first_name?.trim() || "friend";
  const consumerId = session.consumer.consumer_id;
  const { greeting, subtitle, quote } = useMemo(() => {
    const hour = new Date().getHours();
    return {
      greeting: getGreeting(firstName, hour),
      subtitle: getGreetingSubtitle(hour),
      quote: COFFEE_QUOTES[Math.floor(Math.random() * COFFEE_QUOTES.length)],
    };
  }, [firstName]);

  // Live wallet state — polls /api/consumer/me/wallet every 3s while Home
  // is mounted AND the app is foregrounded. One request now covers both the
  // LCP+ passport + every private brand card, replacing the separate
  // /me/balance fetch. Ref-guarded mutex prevents overlapping fetches from
  // stacking on a slow connection; errors are swallowed so a transient blip
  // keeps the last-good values on screen. Cache-busted inside getJSON.
  const [stampsEarned, setStampsEarned] = useState(0);
  const [privateBalances, setPrivateBalances] = useState<PrivateBrandBalance[]>([]);
  const pollBusyRef = useRef(false);

  // Celebration trigger — delta detection on TOTAL balance + TOTAL banked
  // across every pool (global passport + all private brand cards). A stamp
  // earned at ANY cafe bumps totalBalance; crossing any threshold bumps
  // totalBanked. This replaces the scoped-balance delta that /me/balance
  // used to provide, and handles multi-brand users correctly: earning at
  // Monmouth and at Prufrock the same session fires RewardModal twice,
  // once per poll tick.
  //
  // Null sentinels for the pre-first-poll state mean the initial fetch
  // seeds silently instead of celebrating on app-open.
  const prevTotalRef = useRef<number | null>(null);
  const prevBankedRef = useRef<number | null>(null);

  // AppState gating — stop polling when the app is backgrounded. Saves
  // battery + avoids piling up stale requests against a localtunnel URL
  // that might have rotated while the user was away. `useState` (not a ref)
  // so the effect below re-runs when the status flips.
  const [appActive, setAppActive] = useState<boolean>(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => setAppActive(next === "active"),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!appActive) {
      if (__DEV__) console.log("[poll] app backgrounded, pausing");
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (pollBusyRef.current) return;
      pollBusyRef.current = true;
      try {
        const wallet = await fetchWallet(session.token);
        if (cancelled) return;

        // Totals are the sum across every pool. Delta detection fires
        // when stamps are earned anywhere (global OR any private brand);
        // bankedUp fires when any threshold is crossed. Using totals (not
        // per-pool) keeps the logic trivially O(1) regardless of how many
        // brand cards the consumer has.
        const totalBalance =
          wallet.global_balance.stamp_balance +
          wallet.private_balances.reduce((s, b) => s + b.stamp_balance, 0);
        const totalBanked =
          wallet.global_balance.banked_rewards +
          wallet.private_balances.reduce((s, b) => s + b.banked_rewards, 0);

        if (__DEV__) {
          console.log(
            `[poll] global=${wallet.global_balance.current_stamps}/${wallet.threshold} banked_total=${totalBanked} brands=${wallet.private_balances.length} latest_earn=${wallet.latest_earn?.transaction_id ?? "none"}`,
          );
        }

        setStampsEarned(wallet.global_balance.current_stamps);
        setPrivateBalances(wallet.private_balances);

        // Delta detection on totals.
        const prevTotal = prevTotalRef.current;
        const prevBanked = prevBankedRef.current;
        const seeded = prevTotal !== null && prevBanked !== null;
        const stampsUp = seeded && totalBalance > prevTotal!;
        const bankedUp = seeded && totalBanked > prevBanked!;
        if (seeded && stampsUp && wallet.latest_earn) {
          onReward({
            stampsEarned: Math.max(1, totalBalance - prevTotal!),
            cafeName: wallet.latest_earn.cafe_name,
            cafeAddress: wallet.latest_earn.cafe_address,
            // Celebration shows the passport balance — the mobile's
            // "primary" card. A future pass can scope this to the earn's
            // brand once latest_earn carries brand_id.
            newBalance: wallet.global_balance.current_stamps,
            freeDrinkUnlocked: bankedUp,
          });
        }
        prevTotalRef.current = totalBalance;
        prevBankedRef.current = totalBanked;
      } catch (e) {
        if (__DEV__) {
          console.log(
            `[poll] error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      } finally {
        pollBusyRef.current = false;
      }
    };
    void poll();
    const id = setInterval(poll, BALANCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session.token, onReward, appActive]);

  const pct = Math.min(stampsEarned / STAMPS_TARGET, 1);
  const remaining = Math.max(STAMPS_TARGET - stampsEarned, 0);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text
            className="text-[11px] font-semibold uppercase"
            style={{ color: COLOR.textDim, letterSpacing: 2 }}
          >
            Local Coffee Perks · For the regulars
          </Text>
          <Text
            className="mt-2 text-[26px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.5 }}
            numberOfLines={1}
          >
            {greeting}
          </Text>
          <Text
            className="mt-1 text-[13px]"
            style={{ color: COLOR.textMuted, letterSpacing: 0.1 }}
          >
            {subtitle}
          </Text>
        </View>
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: COLOR.surface,
            borderWidth: 1,
            borderColor: COLOR.border,
          }}
        >
          <Bell size={18} color={COLOR.textMuted} strokeWidth={1.8} />
          <View
            className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: COLOR.accent }}
          />
        </View>
      </View>

      <View
        className="mt-6 rounded-3xl p-5"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.45,
          shadowRadius: 28,
          elevation: 12,
        }}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text
              className="text-[10px] font-semibold uppercase"
              style={{ color: COLOR.accent, letterSpacing: 2 }}
            >
              Loyalty Pass
            </Text>
            <Text
              className="mt-1 text-[15px] font-medium"
              style={{ color: COLOR.text }}
            >
              Scan at the counter
            </Text>
          </View>
          <View
            className="flex-row items-center rounded-full px-2.5 py-1"
            style={{ backgroundColor: "rgba(74,222,128,0.1)" }}
          >
            <View
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: COLOR.live }}
            />
            <Text
              className="ml-1.5 text-[10px] font-semibold"
              style={{ color: COLOR.live, letterSpacing: 0.5 }}
            >
              ACTIVE
            </Text>
          </View>
        </View>

        {/* Scanner viewport — the consumer's own QR reads like a scan
            target because of the four corner brackets, so baristas get
            an unambiguous "point your scanner here" cue. Helper text
            below mirrors the standard "Align QR within the frame" cue
            baristas see on their end. */}
        <View className="mt-5 items-center">
          <View className="relative items-center justify-center">
            <View
              className="items-center justify-center rounded-2xl p-5"
              style={{ backgroundColor: "#FFFFFF" }}
            >
              <QRCode
                value={consumerId}
                size={200}
                color={COLOR.bg}
                backgroundColor="#FFFFFF"
              />
            </View>
            {/* Four L-shaped corner brackets overlay the white QR card.
                Each is two 3px-thick strokes meeting at a corner, accent
                coloured so they pop against the white frame. */}
            <ScannerCornerBracket position="tl" />
            <ScannerCornerBracket position="tr" />
            <ScannerCornerBracket position="bl" />
            <ScannerCornerBracket position="br" />
          </View>
          <Text
            className="mt-3 text-[11px] font-semibold uppercase"
            style={{
              color: COLOR.textMuted,
              letterSpacing: 1.4,
              textAlign: "center",
            }}
          >
            Align QR code within the frame
          </Text>
        </View>

        <View
          className="mt-4 items-center rounded-2xl px-4 py-3"
          style={{
            backgroundColor: COLOR.bg,
            borderWidth: 1,
            borderColor: COLOR.border,
          }}
        >
          <Text
            className="text-[12px]"
            style={{
              color: COLOR.textDim,
              fontFamily: FONT.medium,
              letterSpacing: 0.2,
              textAlign: "center",
            }}
          >
            Scanner not working? Give this code to the barista:
          </Text>
          <Text
            className="mt-2"
            style={{
              color: COLOR.text,
              fontFamily: MONO_FONT,
              fontSize: 32,
              letterSpacing: 10,
              paddingLeft: 10,
            }}
          >
            {consumerId}
          </Text>
        </View>
      </View>

      <QuoteCard quote={quote} />

      {/* Wallet layout (2026-04-23): "Rewards Progress" split into two
          sections. A) LCP+ Global Passport — the universal pool. B) My
          Brand Cards — per-brand loyalty for non-global partners. Only the
          passport is populated in MVP; brand cards are an empty state
          until the backend exposes per-brand balances. */}

      {/* A) LCP+ Global Passport */}
      <View className="mt-6">
        <View className="flex-row items-center">
          <Star
            size={13}
            color={COLOR.accent}
            strokeWidth={2.2}
            fill={COLOR.accent}
          />
          <Text
            className="ml-2 text-[11px] font-semibold uppercase"
            style={{ color: COLOR.accent, letterSpacing: 2 }}
          >
            LCP+ Global Passport
          </Text>
        </View>
        <Text
          className="mt-1 text-[12px]"
          style={{ color: COLOR.textMuted, letterSpacing: 0.1 }}
        >
          Redeemable at any LCP+ partner.
        </Text>

        <View
          className="mt-3 rounded-3xl p-5"
          style={{
            backgroundColor: COLOR.surface,
            borderWidth: 1,
            borderColor: "rgba(228,185,127,0.3)",
            shadowColor: COLOR.accent,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.12,
            shadowRadius: 18,
            elevation: 4,
          }}
        >
          {/* Visual stamp card is the hero now — the 2×5 grid of coffee
              cups does the storytelling. Numeric "X of 10" drops to a
              small secondary label so the grid holds the eye. */}
          <View className="flex-row items-center justify-between">
            <View>
              <Text
                className="text-[11px] font-semibold uppercase"
                style={{ color: COLOR.textMuted, letterSpacing: 1.4 }}
              >
                Stamp card
              </Text>
              <Text
                className="mt-1 text-[13px]"
                style={{ color: COLOR.textMuted }}
              >
                <Text
                  style={{ color: COLOR.text, fontFamily: FONT.medium }}
                >
                  {stampsEarned}
                </Text>
                {" "}of {STAMPS_TARGET} stamps collected
              </Text>
            </View>
            <View
              className="items-end rounded-2xl px-3 py-2"
              style={{
                backgroundColor: "rgba(228,185,127,0.08)",
                borderWidth: 1,
                borderColor: "rgba(228,185,127,0.15)",
              }}
            >
              <Text
                className="text-[10px] font-semibold uppercase"
                style={{ color: COLOR.textMuted, letterSpacing: 1 }}
              >
                Free coffee in
              </Text>
              <Text
                className="mt-0.5 text-base font-semibold"
                style={{ color: COLOR.accent }}
              >
                {remaining} {remaining === 1 ? "stamp" : "stamps"}
              </Text>
            </View>
          </View>

          {/* 2 × 5 grid — larger slots than before (h-12 vs h-8) so each
              coffee cup reads at a glance. Filled slots carry the gold
              fill + a subtle accent glow; empty slots are dashed rings
              so they clearly feel like "to be earned" rather than "off". */}
          <View className="mt-5 flex-row flex-wrap justify-between">
            {Array.from({ length: STAMPS_TARGET }).map((_, i) => {
              const filled = i < stampsEarned;
              return (
                <View
                  key={i}
                  className="mb-2 h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: filled ? COLOR.accentDeep : COLOR.bg,
                    borderWidth: filled ? 0 : 1,
                    borderColor: COLOR.border,
                    borderStyle: filled ? "solid" : "dashed",
                    shadowColor: filled ? COLOR.accent : "transparent",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: filled ? 0.45 : 0,
                    shadowRadius: filled ? 6 : 0,
                    elevation: filled ? 3 : 0,
                  }}
                >
                  <Coffee
                    size={20}
                    color={filled ? COLOR.accentInk : COLOR.textFaint}
                    strokeWidth={2.2}
                  />
                </View>
              );
            })}
          </View>

          <View
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: COLOR.bg }}
          >
            <View
              className="h-full rounded-full"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: COLOR.accentDeep,
                shadowColor: COLOR.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 8,
              }}
            />
          </View>
        </View>
      </View>

      {/* B) My Brand Cards — renders one mini-card per private brand the
          consumer has activity at. HAVING >0 on the server filters out
          fully-redeemed brands so the list stays short. Empty state shows
          until the consumer earns their first private-scheme stamp. */}
      <View className="mt-6">
        <View className="flex-row items-center">
          <Wallet size={13} color={COLOR.textDim} strokeWidth={2.2} />
          <Text
            className="ml-2 text-[11px] font-semibold uppercase"
            style={{ color: COLOR.textDim, letterSpacing: 2 }}
          >
            My Brand Cards
          </Text>
          {privateBalances.length > 0 ? (
            <View
              className="ml-2 rounded-full px-2 py-0.5"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: COLOR.border,
              }}
            >
              <Text
                className="text-[10px] font-semibold"
                style={{ color: COLOR.textMuted, letterSpacing: 0.5 }}
              >
                {privateBalances.length}
              </Text>
            </View>
          ) : null}
        </View>

        {privateBalances.length === 0 ? (
          <View
            className="mt-3 rounded-2xl p-4"
            style={{
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: COLOR.border,
              borderStyle: "dashed",
            }}
          >
            <Text
              className="text-[13px] font-semibold"
              style={{ color: COLOR.text }}
            >
              No private cards yet
            </Text>
            <Text
              className="mt-1 text-[12px]"
              style={{ color: COLOR.textMuted, lineHeight: 17 }}
            >
              Visit a Local-scheme partner and their loyalty card will appear here.
            </Text>
          </View>
        ) : (
          <View className="mt-3">
            {privateBalances.map((b) => (
              <BrandCardMini key={b.brand_id} balance={b} threshold={STAMPS_TARGET} />
            ))}
          </View>
        )}
      </View>

      <Pressable
        onPress={onTriggerReward}
        className="mt-5 flex-row items-center justify-center rounded-2xl py-3"
        style={{
          backgroundColor: "rgba(228,185,127,0.06)",
          borderWidth: 1,
          borderColor: "rgba(228,185,127,0.22)",
          borderStyle: "dashed",
        }}
      >
        <Sparkles size={14} color={COLOR.accent} strokeWidth={2} />
        <Text
          className="ml-2 text-[12px] font-semibold uppercase"
          style={{ color: COLOR.accent, letterSpacing: 1.5 }}
        >
          Dev · Trigger Test Reward
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// L-shaped corner bracket for the scanner viewport. Absolute-positioned
// over the white QR card so the four corners read as a scan target
// frame. Two thin strokes per corner; accent-gold keeps the branding
// consistent without fighting the QR's black-on-white.
function ScannerCornerBracket({
  position,
}: {
  position: "tl" | "tr" | "bl" | "br";
}) {
  const LEG = 22; // length of each stroke
  const THICK = 3; // stroke thickness
  const OFFSET = -6; // negative = sticks out past the card edge
  const isTop = position === "tl" || position === "tr";
  const isLeft = position === "tl" || position === "bl";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: LEG,
        height: LEG,
        top: isTop ? OFFSET : undefined,
        bottom: isTop ? undefined : OFFSET,
        left: isLeft ? OFFSET : undefined,
        right: isLeft ? undefined : OFFSET,
      }}
    >
      {/* Horizontal leg */}
      <View
        style={{
          position: "absolute",
          height: THICK,
          width: LEG,
          top: isTop ? 0 : LEG - THICK,
          left: 0,
          backgroundColor: COLOR.accent,
          borderRadius: THICK / 2,
        }}
      />
      {/* Vertical leg */}
      <View
        style={{
          position: "absolute",
          width: THICK,
          height: LEG,
          top: 0,
          left: isLeft ? 0 : LEG - THICK,
          backgroundColor: COLOR.accent,
          borderRadius: THICK / 2,
        }}
      />
    </View>
  );
}

function QuoteCard({ quote }: { quote: string }) {
  return (
    <View
      className="mt-5 flex-row items-start rounded-2xl p-4"
      style={{
        backgroundColor: "rgba(228,185,127,0.06)",
        borderWidth: 1,
        borderColor: "rgba(228,185,127,0.18)",
      }}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{
          backgroundColor: "rgba(228,185,127,0.14)",
          borderWidth: 1,
          borderColor: "rgba(228,185,127,0.22)",
        }}
      >
        <Quote size={14} color={COLOR.accent} strokeWidth={2.2} />
      </View>
      <View className="ml-3 flex-1">
        <Text
          className="text-[10px] font-semibold uppercase"
          style={{ color: COLOR.accent, letterSpacing: 2 }}
        >
          Coffee Wisdom
        </Text>
        <Text
          className="mt-1 text-[14px] italic leading-5"
          style={{ color: COLOR.text, letterSpacing: 0.1 }}
        >
          “{quote}”
        </Text>
      </View>
    </View>
  );
}

function DiscoverView({ session }: { session: Session }) {
  const [cafes, setCafes] = useState<DiscoverCafe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DiscoverCafe | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeAmenity, setActiveAmenity] = useState<string | null>(null);

  // Location permission + first fix. One-shot on mount — if the user denies
  // permission or the GPS errors, coords stays null and the cafe feed
  // falls back to alphabetical order (server behavior when lat/lng absent).
  // We don't re-prompt: a hard denial should stick, and `Accuracy.Balanced`
  // is enough for a "nearest cafe" sort without burning battery.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // Hardware or permission error — swallow so the Discover tab still
        // renders cafes (just without a proximity sort).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCafes(null);
    fetchDiscoverCafes(session.token, coords)
      .then((data) => {
        if (!cancelled) setCafes(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load cafes.");
        setCafes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, reloadKey, coords]);

  // Stamp every cafe with a distance reading + drop anything outside the
  // 5-mile cap. When the device gave us coords the backend already returned
  // `distance_miles`; otherwise we deterministically mock from the cafe id
  // so each card still shows a believable "X mi away" pill.
  const localCafes = useMemo(() => {
    if (!cafes) return cafes;
    return cafes
      .map((cafe) => {
        const dist =
          cafe.distance_miles != null
            ? cafe.distance_miles
            : mockDistanceMiles(cafe.id);
        return { ...cafe, distance_miles: dist } as DiscoverCafe;
      })
      .filter(
        (cafe) =>
          cafe.distance_miles != null &&
          cafe.distance_miles <= DISCOVERY_RADIUS_MILES,
      )
      .sort(
        (a, b) =>
          (a.distance_miles ?? Number.MAX_VALUE) -
          (b.distance_miles ?? Number.MAX_VALUE),
      );
  }, [cafes]);

  // Smart filter: only surface amenities that at least one local cafe
  // actually supports — no point offering "Halal" if no nearby cafe ticks
  // it. Keeps the pill row honest.
  const availableAmenityIds = useMemo(() => {
    if (!localCafes) return new Set<string>();
    const set = new Set<string>();
    for (const c of localCafes) {
      for (const id of c.amenities) set.add(id);
    }
    return set;
  }, [localCafes]);

  const visibleCafes = useMemo(() => {
    if (!localCafes) return localCafes;
    if (!activeAmenity) return localCafes;
    return localCafes.filter((c) => c.amenities.includes(activeAmenity));
  }, [localCafes, activeAmenity]);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        className="text-[11px] font-semibold uppercase"
        style={{ color: COLOR.textDim, letterSpacing: 2 }}
      >
        Discover
      </Text>
      <Text
        className="mt-2 text-[26px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.5 }}
      >
        Indie cafés near you
      </Text>
      <Text
        className="mt-1 text-[13px]"
        style={{ color: COLOR.textMuted }}
      >
        Within {DISCOVERY_RADIUS_MILES} miles · sorted by closest first.
      </Text>

      <SmartFilterRow
        active={activeAmenity}
        onChange={setActiveAmenity}
        availableIds={availableAmenityIds}
      />

      {cafes === null ? (
        <View
          style={{
            marginTop: 48,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 32,
          }}
        >
          <ActivityIndicator color={COLOR.accent} size="small" />
          <Text
            className="mt-3 text-[12px]"
            style={{ color: COLOR.textDim, letterSpacing: 0.2 }}
          >
            Loading cafés…
          </Text>
        </View>
      ) : error ? (
        <View
          className="mt-6 rounded-2xl p-4"
          style={{
            backgroundColor: "rgba(201,110,75,0.08)",
            borderWidth: 1,
            borderColor: "rgba(201,110,75,0.28)",
          }}
        >
          <Text
            style={{
              fontFamily: FONT.semibold,
              fontSize: 13,
              color: COLOR.text,
            }}
          >
            Couldn't reach the cafe directory
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: FONT.regular,
              fontSize: 12,
              color: COLOR.textMuted,
              lineHeight: 18,
            }}
          >
            {error}
          </Text>
          <Pressable
            onPress={() => setReloadKey((k) => k + 1)}
            accessibilityRole="button"
            className="mt-3 h-10 items-center justify-center rounded-full"
            style={({ pressed }) => ({
              backgroundColor: COLOR.terracotta,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 13,
                color: COLOR.terracottaInk,
                letterSpacing: 0.3,
              }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      ) : !visibleCafes || visibleCafes.length === 0 ? (
        <View
          className="mt-6 rounded-2xl p-4"
          style={{
            backgroundColor: "rgba(243,233,220,0.06)",
            borderWidth: 1,
            borderColor: "rgba(243,233,220,0.14)",
          }}
        >
          <Text
            style={{
              fontFamily: FONT.semibold,
              fontSize: 13,
              color: COLOR.text,
            }}
          >
            {activeAmenity
              ? "No cafés match that filter near you"
              : "No cafés within " + DISCOVERY_RADIUS_MILES + " miles ☕"}
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: FONT.regular,
              fontSize: 12,
              color: COLOR.textMuted,
              lineHeight: 18,
            }}
          >
            {activeAmenity
              ? "Try clearing the filter or picking a different amenity."
              : "We're onboarding local roasters now. Check back soon — fresh perks are brewing."}
          </Text>
          {activeAmenity ? (
            <Pressable
              onPress={() => setActiveAmenity(null)}
              accessibilityRole="button"
              className="mt-3 h-9 items-center justify-center self-start rounded-full px-4"
              style={({ pressed }) => ({
                backgroundColor: COLOR.surface,
                borderWidth: 1,
                borderColor: COLOR.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: FONT.semibold,
                  fontSize: 12,
                  color: COLOR.text,
                  letterSpacing: 0.3,
                }}
              >
                Clear filter
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View className="mt-5">
          {visibleCafes.map((cafe) => (
            <DiscoverCafeCard
              key={cafe.id}
              cafe={cafe}
              onPress={() => setSelected(cafe)}
            />
          ))}
        </View>
      )}

      <CafeDetailsModal
        cafe={selected}
        token={session.token}
        onClose={() => setSelected(null)}
        onDonationSuccess={(newPool) => {
          // Patch local Discover state so the pool count updates
          // immediately on close. Backend response is the source of
          // truth — refetch on next /api/consumer/cafes poll.
          setCafes((prev) =>
            prev
              ? prev.map((c) =>
                  c.id === selected?.id
                    ? { ...c, suspended_coffee_pool: newPool }
                    : c,
                )
              : prev,
          );
          setSelected((s) =>
            s ? { ...s, suspended_coffee_pool: newPool } : s,
          );
        }}
      />
    </ScrollView>
  );
}

// Horizontal pill row for the Discover smart-filter. Renders the catalogue
// of amenities; greys out (and disables) any pill whose amenity isn't on a
// nearby cafe so the row stays honest without truncating the list. Tap a
// pill once to filter, tap again to clear — passing `null` to onChange
// removes the filter.
function SmartFilterRow({
  active,
  onChange,
  availableIds,
}: {
  active: string | null;
  onChange: (id: string | null) => void;
  availableIds: ReadonlySet<string>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 14, paddingBottom: 4 }}
    >
      <Pressable
        onPress={() => onChange(null)}
        className="mr-2 h-9 items-center justify-center rounded-full px-3.5"
        style={({ pressed }) => ({
          backgroundColor: active === null ? COLOR.accent : COLOR.surface,
          borderWidth: 1,
          borderColor: active === null ? COLOR.accent : COLOR.border,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontSize: 11.5,
            color: active === null ? COLOR.accentInk : COLOR.text,
            fontFamily: FONT.semibold,
            letterSpacing: 0.4,
          }}
        >
          All
        </Text>
      </Pressable>
      {AMENITIES.map((a) => {
        const isActive = active === a.id;
        const isAvailable = availableIds.has(a.id);
        const Icon = a.Icon;
        return (
          <Pressable
            key={a.id}
            onPress={() => onChange(isActive ? null : a.id)}
            disabled={!isAvailable && !isActive}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${a.label}`}
            className="mr-2 h-9 flex-row items-center justify-center rounded-full px-3"
            style={({ pressed }) => ({
              backgroundColor: isActive ? COLOR.accent : COLOR.surface,
              borderWidth: 1,
              borderColor: isActive
                ? COLOR.accent
                : isAvailable
                  ? COLOR.border
                  : "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.85 : isAvailable || isActive ? 1 : 0.45,
            })}
          >
            <Icon
              size={12}
              color={isActive ? COLOR.accentInk : COLOR.roastedAlmond}
              strokeWidth={2.2}
            />
            <Text
              style={{
                marginLeft: 6,
                fontSize: 11.5,
                color: isActive ? COLOR.accentInk : COLOR.text,
                fontFamily: FONT.semibold,
                letterSpacing: 0.3,
              }}
            >
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function DiscoverCafeCard({
  cafe,
  onPress,
}: {
  cafe: DiscoverCafe;
  onPress: () => void;
}) {
  const knownAmenities = cafe.amenities
    .map((id) => lookupAmenity(id))
    .filter((a): a is AmenityDef => Boolean(a));
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(255,255,255,0.04)" }}
      className="mb-3 rounded-3xl p-4"
      style={({ pressed }) => ({
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: pressed ? COLOR.borderStrong : COLOR.border,
        opacity: pressed ? 0.85 : 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 6,
      })}
    >
      <Text
        className="text-[16px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.2 }}
        numberOfLines={1}
      >
        {cafe.name}
      </Text>
      <View className="mt-1 flex-row items-center">
        <MapPin size={12} color={COLOR.textDim} strokeWidth={2} />
        <Text
          className="ml-1.5 text-[12px]"
          style={{ color: COLOR.textMuted }}
          numberOfLines={2}
        >
          {cafe.address}
        </Text>
      </View>

      <View className="mt-2 flex-row flex-wrap">
        <HygienePill rating={cafe.food_hygiene_rating} />
        {cafe.distance_miles != null && (
          <DistancePill miles={cafe.distance_miles} />
        )}
        {cafe.is_lcp_plus && <LcpPlusPill />}
        {cafe.live_offers.length > 0 && <ActiveOffersPill />}
        {cafe.suspended_coffee_enabled ? <CommunityBoardPill /> : null}
      </View>

      {knownAmenities.length > 0 && (
        <View className="mt-3 flex-row flex-wrap">
          {knownAmenities.map((a) => {
            const { Icon } = a;
            return (
              <View
                key={a.id}
                className="mb-1.5 mr-1.5 flex-row items-center rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1,
                  borderColor: COLOR.border,
                }}
              >
                <Icon size={11} color={COLOR.roastedAlmond} strokeWidth={2.2} />
                <Text
                  className="ml-1.5 text-[10.5px]"
                  style={{
                    color: COLOR.textMuted,
                    fontFamily: FONT.semibold,
                    letterSpacing: 0.3,
                  }}
                >
                  {a.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {cafe.live_offers.length > 0 && (
        <View
          className="mt-3 rounded-2xl p-3"
          style={{
            // Terracotta accent (per product spec) — differentiates "active
            // offer on this location" from the amber amenity chips above,
            // and matches the B2B dashboard's offer colour so baristas and
            // customers see the same visual language.
            backgroundColor: "rgba(201,110,75,0.08)",
            borderWidth: 1,
            borderColor: "rgba(201,110,75,0.28)",
          }}
        >
          <Text
            className="text-[10px] font-semibold uppercase"
            style={{ color: COLOR.terracotta, letterSpacing: 1.5 }}
          >
            Live offer{cafe.live_offers.length > 1 ? "s" : ""}
          </Text>
          {cafe.live_offers.map((offer) => (
            <DiscoverOfferRow key={offer.id} offer={offer} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

function DiscoverOfferRow({ offer }: { offer: DiscoverOffer }) {
  return (
    <View className="mt-1.5">
      <Text
        className="text-[13px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.1 }}
      >
        {formatOfferHeadline(offer)}
      </Text>
      <Text
        className="mt-0.5 text-[11px]"
        style={{ color: COLOR.textDim }}
      >
        {formatOfferWindow(offer)}
      </Text>
    </View>
  );
}

// Compact hygiene indicator for the Discover list. The full FSA sticker
// (FoodHygieneBadge) is deliberately reserved for the CafeDetailsModal —
// on a scroll-y list, the sticker's stark black/green is too loud. This
// pill echoes the amenity-chip treatment so the card reads as a single
// visual rhythm: rating · amenities · offer.
// Shared pill look. Keeps every Discover-card badge (hygiene, distance,
// LCP+, active offers) rendered at the exact same height/corner-radius so
// they flex-wrap cleanly in a single row — otherwise two pills with
// different py/px values collapse the row onto mismatched baselines.
const PILL_STYLE = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 999,
  marginRight: 6,
  marginBottom: 6,
  borderWidth: 1,
};

function HygienePill({ rating }: { rating: FoodHygieneRating }) {
  const isAwaiting = rating === "Awaiting Inspection";
  const label = isAwaiting ? "Awaiting inspection" : `Hygiene · ${rating}/5`;
  return (
    <View
      style={{
        ...PILL_STYLE,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderColor: COLOR.border,
      }}
      accessibilityLabel={
        isAwaiting
          ? "Food hygiene rating: awaiting inspection"
          : `Food hygiene rating: ${rating} out of 5`
      }
    >
      <ShieldCheck size={11} color={COLOR.roastedAlmond} strokeWidth={2.2} />
      <Text
        style={{
          marginLeft: 6,
          fontSize: 10.5,
          color: COLOR.textMuted,
          fontFamily: FONT.semibold,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function DistancePill({ miles }: { miles: number }) {
  const label = miles < 0.1 ? "Nearby" : `${miles.toFixed(1)} mi away`;
  return (
    <View
      style={{
        ...PILL_STYLE,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderColor: COLOR.border,
      }}
      accessibilityLabel={label}
    >
      <Navigation size={11} color={COLOR.roastedAlmond} strokeWidth={2.2} />
      <Text
        style={{
          marginLeft: 6,
          fontSize: 10.5,
          color: COLOR.textMuted,
          fontFamily: FONT.semibold,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function LcpPlusPill() {
  return (
    <View
      style={{
        ...PILL_STYLE,
        backgroundColor: "rgba(228,185,127,0.15)",
        borderColor: "rgba(228,185,127,0.38)",
      }}
      accessibilityLabel="LCP Plus partner"
    >
      <Text
        style={{
          fontSize: 11,
          color: COLOR.accent,
          fontFamily: FONT.bold,
          letterSpacing: 0.8,
        }}
      >
        ✦ LCP+
      </Text>
    </View>
  );
}

function BrandCardMini({
  balance,
  threshold,
}: {
  balance: PrivateBrandBalance;
  threshold: number;
}) {
  const pct = Math.min(balance.current_stamps / threshold, 1);
  const readyCount = balance.banked_rewards;
  const remaining = Math.max(threshold - balance.current_stamps, 0);
  return (
    <View
      className="mb-3 rounded-2xl p-4"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: COLOR.border,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text
            className="text-[14px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.1 }}
            numberOfLines={1}
          >
            {balance.brand_name}
          </Text>
          {readyCount > 0 ? (
            <Text
              className="mt-0.5 text-[11px]"
              style={{
                color: COLOR.accent,
                fontFamily: FONT.semibold,
                letterSpacing: 0.3,
              }}
            >
              {readyCount} free {readyCount === 1 ? "drink" : "drinks"} ready
            </Text>
          ) : (
            <Text
              className="mt-0.5 text-[11px]"
              style={{ color: COLOR.textDim, letterSpacing: 0.2 }}
            >
              {remaining} more for a free coffee
            </Text>
          )}
        </View>
        <View className="flex-row items-baseline">
          <Text
            className="text-[22px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.5 }}
          >
            {balance.current_stamps}
          </Text>
          <Text
            className="text-[13px]"
            style={{ color: COLOR.textFaint }}
          >
            /{threshold}
          </Text>
        </View>
      </View>
      <View
        className="mt-3 h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: COLOR.bg }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            backgroundColor: COLOR.roastedAlmond,
          }}
        />
      </View>
    </View>
  );
}

function ActiveOffersPill() {
  return (
    <View
      style={{
        ...PILL_STYLE,
        backgroundColor: "rgba(201,110,75,0.12)",
        borderColor: "rgba(201,110,75,0.32)",
      }}
      accessibilityLabel="Active offers available"
    >
      <Gift size={11} color={COLOR.terracotta} strokeWidth={2.2} />
      <Text
        style={{
          marginLeft: 6,
          fontSize: 10.5,
          color: COLOR.terracotta,
          fontFamily: FONT.semibold,
          letterSpacing: 0.3,
        }}
      >
        Active Offers
      </Text>
    </View>
  );
}

// Pay It Forward / Suspended Coffee badge — shows on Explore cards
// when the cafe has toggled the feature on (PRD §4.5). Mint accent
// matches the brand palette + signals "community" warmth.
function CommunityBoardPill() {
  return (
    <View
      style={{
        ...PILL_STYLE,
        backgroundColor: "rgba(0,229,118,0.12)",
        borderColor: "rgba(0,229,118,0.34)",
      }}
      accessibilityLabel="Community Board — accepts Pay It Forward donations"
    >
      <HandHeart size={11} color={"#00B85F"} strokeWidth={2.2} />
      <Text
        style={{
          marginLeft: 6,
          fontSize: 10.5,
          color: "#00B85F",
          fontFamily: FONT.semibold,
          letterSpacing: 0.3,
        }}
      >
        Community Board
      </Text>
    </View>
  );
}

function ProfileView({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const fullName =
    [session.consumer.first_name, session.consumer.last_name]
      .filter(Boolean)
      .join(" ") || "Your account";
  return (
    <View className="flex-1 px-6 pt-2">
      <Text
        className="text-[11px] font-semibold uppercase"
        style={{ color: COLOR.textDim, letterSpacing: 2 }}
      >
        Profile
      </Text>
      <Text
        className="mt-2 text-[26px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.5 }}
      >
        {fullName}
      </Text>
      <Text className="mt-1 text-sm" style={{ color: COLOR.textMuted }}>
        {session.consumer.email}
      </Text>

      <View
        className="mt-6 rounded-3xl p-5"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
        }}
      >
        <Text
          className="text-[10px] font-semibold uppercase"
          style={{ color: COLOR.textDim, letterSpacing: 2 }}
        >
          Member Code
        </Text>
        <Text
          className="mt-2"
          style={{
            color: COLOR.text,
            fontFamily: MONO_FONT,
            fontSize: 24,
            letterSpacing: 8,
          }}
        >
          {session.consumer.consumer_id}
        </Text>
      </View>

      <Pressable
        onPress={onSignOut}
        className="mt-6 h-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
        }}
      >
        <Text
          className="text-sm font-semibold"
          style={{ color: COLOR.textMuted, letterSpacing: 0.3 }}
        >
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}

function PlaceholderView({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
        }}
      >
        <Coffee size={24} color={COLOR.accent} strokeWidth={1.8} />
      </View>
      <Text
        className="mt-5 text-2xl font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.5 }}
      >
        {title}
      </Text>
      <Text className="mt-1.5 text-sm" style={{ color: COLOR.textMuted }}>
        {subtitle}
      </Text>
      <Text
        className="mt-3 text-[11px] font-semibold uppercase"
        style={{ color: COLOR.textFaint, letterSpacing: 2 }}
      >
        Coming soon
      </Text>
    </View>
  );
}

function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const insets = useSafeAreaInsets();
  const items: { key: Tab; label: string; Icon: typeof House }[] = [
    { key: "home", label: "Home", Icon: House },
    { key: "history", label: "History", Icon: Clock },
    { key: "discover", label: "Discover", Icon: Compass },
    { key: "profile", label: "Profile", Icon: UserIcon },
  ];

  return (
    <View
      style={{
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: COLOR.surface,
        borderTopWidth: 1,
        borderTopColor: COLOR.border,
      }}
    >
      <View className="flex-row items-center justify-around px-2 pt-2">
        {items.map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              className="flex-1 items-center py-1.5"
              hitSlop={8}
            >
              <View
                className="h-10 w-14 items-center justify-center rounded-full"
                style={{
                  backgroundColor: isActive
                    ? "rgba(228,185,127,0.12)"
                    : "transparent",
                }}
              >
                <Icon
                  size={21}
                  color={isActive ? COLOR.accent : COLOR.textFaint}
                  strokeWidth={isActive ? 2.3 : 1.9}
                />
              </View>
              <Text
                className="mt-1 text-[10px]"
                style={{
                  color: isActive ? COLOR.accent : COLOR.textFaint,
                  fontWeight: isActive ? "600" : "500",
                  letterSpacing: 0.3,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

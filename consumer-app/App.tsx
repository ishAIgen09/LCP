import "./global.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
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
  House,
  MapPin,
  Quote,
  Sparkles,
  User as UserIcon,
} from "lucide-react-native";

import { LoginScreen } from "./src/LoginScreen";
import { HistoryScreen } from "./src/HistoryScreen";
import { RewardModal, type RewardPayload } from "./src/RewardModal";
import { CafeDetailsModal } from "./src/CafeDetailsModal";
import { lookupAmenity, type AmenityDef } from "./src/amenities";
import {
  fetchBalance,
  fetchDiscoverCafes,
  type DiscoverCafe,
  type DiscoverOffer,
} from "./src/api";
import { formatOfferHeadline, formatOfferWindow } from "./src/offers";
import { COLOR, FONT, type Session } from "./src/theme";

const BALANCE_POLL_MS = 3000;

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
        {tab === "history" && <HistoryScreen />}
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

  // Live stamp balance — polls /api/consumer/me/balance every 3s while Home
  // is mounted. Ref-guarded mutex prevents overlapping fetches from stacking
  // on a slow tunnel; errors are swallowed so a transient blip keeps the
  // last-good value on screen. The fetch itself is cache-busted inside
  // getJSON (`?t=…` + Cache-Control no-cache) — don't re-add it here.
  const [stampsEarned, setStampsEarned] = useState(0);
  const pollBusyRef = useRef(false);
  // Celebration trigger: server returns `latest_earn.transaction_id` on
  // every balance poll. We fire the RewardModal once per new transaction id.
  // `null` (pre-first-poll) and the first observed id are seeded silently so
  // opening the app doesn't replay the last celebration. Using transaction_id
  // (not balance delta) handles auto-rollover correctly — a scan that takes
  // the balance 9 → 0 still celebrates because it's a brand-new earn row.
  const lastEarnIdRef = useRef<string | null>(null);
  const seededRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (pollBusyRef.current) return;
      pollBusyRef.current = true;
      console.log("Polling stamps...");
      try {
        const res = await fetchBalance(session.token);
        if (!cancelled) {
          console.log(
            `[poll] stamp_balance=${res.stamp_balance} latest_earn=${res.latest_earn?.transaction_id ?? "none"}`,
          );
          setStampsEarned(res.stamp_balance);

          const incomingId = res.latest_earn?.transaction_id ?? null;
          if (!seededRef.current) {
            lastEarnIdRef.current = incomingId;
            seededRef.current = true;
          } else if (
            incomingId !== null &&
            incomingId !== lastEarnIdRef.current &&
            res.latest_earn
          ) {
            lastEarnIdRef.current = incomingId;
            onReward({
              stampsEarned: res.latest_earn.stamps_earned,
              cafeName: res.latest_earn.cafe_name,
              cafeAddress: res.latest_earn.cafe_address,
              newBalance: res.stamp_balance,
              freeDrinkUnlocked: res.latest_earn.free_drink_unlocked,
            });
          }
        }
      } catch (e) {
        console.log(
          `[poll] error: ${e instanceof Error ? e.message : String(e)}`,
        );
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
  }, [session.token, onReward]);

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
              Scan or read aloud at the counter
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

        <View
          className="mt-5 items-center rounded-2xl p-5"
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <QRCode
            value={consumerId}
            size={200}
            color={COLOR.bg}
            backgroundColor="#FFFFFF"
          />
        </View>

        <View
          className="mt-4 items-center rounded-2xl py-3"
          style={{
            backgroundColor: COLOR.bg,
            borderWidth: 1,
            borderColor: COLOR.border,
          }}
        >
          <Text
            className="text-[10px] font-semibold uppercase"
            style={{ color: COLOR.textDim, letterSpacing: 2 }}
          >
            Member Code · Read Aloud
          </Text>
          <Text
            className="mt-1.5"
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

      <View className="mt-6">
        <View className="flex-row items-end justify-between">
          <View>
            <Text
              className="text-[11px] font-semibold uppercase"
              style={{ color: COLOR.textDim, letterSpacing: 2 }}
            >
              Rewards Progress
            </Text>
            <View className="mt-1 flex-row items-baseline">
              <Text
                className="text-[32px] font-semibold"
                style={{ color: COLOR.text, letterSpacing: -1 }}
              >
                {stampsEarned}
              </Text>
              <Text className="text-xl" style={{ color: COLOR.textFaint }}>
                {" "}/ {STAMPS_TARGET}
              </Text>
            </View>
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

        <View
          className="mt-4 h-3 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: COLOR.surface }}
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

        <View className="mt-4 flex-row justify-between">
          {Array.from({ length: STAMPS_TARGET }).map((_, i) => {
            const filled = i < stampsEarned;
            return (
              <View
                key={i}
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor: filled ? COLOR.accentDeep : COLOR.surface,
                  borderWidth: 1,
                  borderColor: filled ? COLOR.accentDeep : COLOR.border,
                }}
              >
                <Coffee
                  size={14}
                  color={filled ? COLOR.accentInk : COLOR.textFaint}
                  strokeWidth={2.4}
                />
              </View>
            );
          })}
        </View>
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

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCafes(null);
    fetchDiscoverCafes(session.token)
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
  }, [session.token, reloadKey]);

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
        Fresh picks from the Local Coffee Perks community.
      </Text>

      {cafes === null ? (
        <Text
          className="mt-6 text-[13px]"
          style={{ color: COLOR.textDim }}
        >
          Loading cafés…
        </Text>
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
      ) : cafes.length === 0 ? (
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
            No cafés just yet ☕
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
            We're onboarding local roasters now. Check back soon — fresh perks are brewing.
          </Text>
        </View>
      ) : (
        <View className="mt-5">
          {cafes.map((cafe) => (
            <DiscoverCafeCard
              key={cafe.id}
              cafe={cafe}
              onPress={() => setSelected(cafe)}
            />
          ))}
        </View>
      )}

      <CafeDetailsModal cafe={selected} onClose={() => setSelected(null)} />
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
            backgroundColor: "rgba(228,185,127,0.06)",
            borderWidth: 1,
            borderColor: "rgba(228,185,127,0.2)",
          }}
        >
          <Text
            className="text-[10px] font-semibold uppercase"
            style={{ color: COLOR.accent, letterSpacing: 1.5 }}
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

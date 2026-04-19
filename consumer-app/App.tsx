import "./global.css";

import { useState } from "react";
import { Platform, Pressable, StatusBar, Text, View } from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import {
  Bell,
  Coffee,
  Compass,
  Clock,
  House,
  Sparkles,
  User as UserIcon,
} from "lucide-react-native";

import { LoginScreen } from "./src/LoginScreen";
import { HistoryScreen } from "./src/HistoryScreen";
import { RewardModal, type RewardPayload } from "./src/RewardModal";
import { COLOR, type Session } from "./src/theme";

type Tab = "home" | "history" | "discover" | "profile";

const STAMPS_EARNED = 7;
const STAMPS_TARGET = 10;
const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

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
          />
        )}
        {tab === "history" && <HistoryScreen />}
        {tab === "discover" && (
          <PlaceholderView title="Discover" subtitle="Find indie cafés near you" />
        )}
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
}: {
  session: Session;
  onSignOut: () => void;
  onTriggerReward: () => void;
}) {
  const pct = Math.min(STAMPS_EARNED / STAMPS_TARGET, 1);
  const remaining = Math.max(STAMPS_TARGET - STAMPS_EARNED, 0);
  const firstName = session.consumer.first_name?.trim() || "friend";
  const consumerId = session.consumer.consumer_id;

  return (
    <View className="flex-1 px-6 pt-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text
            className="text-[11px] font-semibold uppercase"
            style={{ color: COLOR.textDim, letterSpacing: 2 }}
          >
            Indie Coffee Loop
          </Text>
          <Text
            className="mt-2 text-[26px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.5 }}
            numberOfLines={1}
          >
            Welcome back, {firstName} 👋
          </Text>
        </View>
        <Pressable
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
        </Pressable>
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
                {STAMPS_EARNED}
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
            const filled = i < STAMPS_EARNED;
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

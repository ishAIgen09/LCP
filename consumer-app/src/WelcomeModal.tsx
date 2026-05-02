import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { Coffee, Globe, Store } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";

import { COLOR, FONT } from "./theme";

// Persistent flag — once the user dismisses the welcome screen, this
// key flips to "1" in expo-secure-store and the modal never fires
// again. Project doesn't ship `@react-native-async-storage/async-storage`
// (see consumer-app/package.json + sessionStorage.ts), so we reuse
// SecureStore — same once-on-first-launch semantics, no extra native
// dep that would force `npx expo prebuild`.
const WELCOME_SEEN_KEY = "lcp.consumer.has_seen_welcome.v1";

const isNativePlatform = Platform.OS === "ios" || Platform.OS === "android";

async function loadHasSeenWelcome(): Promise<boolean> {
  if (!isNativePlatform) return true; // web preview — never show
  try {
    const raw = await SecureStore.getItemAsync(WELCOME_SEEN_KEY);
    return raw === "1";
  } catch {
    // Keychain unavailable → fail open (don't ambush the user with the
    // modal every cold start if their device is misbehaving).
    return true;
  }
}

async function markWelcomeSeen(): Promise<void> {
  if (!isNativePlatform) return;
  try {
    await SecureStore.setItemAsync(WELCOME_SEEN_KEY, "1");
  } catch {
    // Best-effort: a write failure means the user MAY see the modal
    // again next launch, which is annoying but not destructive.
  }
}

// Hook that fires the modal exactly once across the user's lifetime
// on this device. Decoupled from the modal component so the parent
// can decide WHEN to start checking (e.g., only after auth lands).
export function useFirstTimeWelcome(enabled: boolean): {
  visible: boolean;
  dismiss: () => void;
} {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled || checked) return;
    let cancelled = false;
    void loadHasSeenWelcome().then((seen) => {
      if (cancelled) return;
      setChecked(true);
      if (!seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, checked]);

  const dismiss = () => {
    setVisible(false);
    void markWelcomeSeen();
  };

  return { visible, dismiss };
}

// Founder-locked welcome copy — explains the two ecosystems on first
// login. Single CTA dismisses + flips the seen flag in one shot.
export function WelcomeModal({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        onPress={onDismiss}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.78)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-md rounded-3xl"
          style={{
            backgroundColor: COLOR.surfaceElevated,
            borderWidth: 1,
            borderColor: "rgba(228,185,127,0.32)",
            padding: 24,
            shadowColor: COLOR.accent,
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.42,
            shadowRadius: 36,
            elevation: 20,
          }}
        >
          <View
            className="mx-auto h-14 w-14 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(228,185,127,0.16)",
              borderWidth: 1,
              borderColor: "rgba(228,185,127,0.4)",
            }}
          >
            <Coffee size={26} color={COLOR.accent} strokeWidth={2} />
          </View>

          <Text
            className="mt-4 text-center text-[24px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.4 }}
          >
            Welcome to Local Coffee Perks!
          </Text>
          <Text
            className="mt-2 text-center text-[14px] leading-5"
            style={{ color: COLOR.textMuted }}
          >
            Cafes on our app offer one of two loyalty cards. Simply scan
            at the till!
          </Text>

          {/* LCP+ block */}
          <View
            className="mt-5 flex-row items-start rounded-2xl p-4"
            style={{
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: "rgba(228,185,127,0.22)",
            }}
          >
            <View
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "rgba(228,185,127,0.18)",
                borderWidth: 1,
                borderColor: "rgba(228,185,127,0.32)",
              }}
            >
              <Globe size={18} color={COLOR.accent} strokeWidth={2} />
            </View>
            <View className="ml-3 flex-1">
              <Text
                className="text-[14px] font-semibold"
                style={{ color: COLOR.text }}
              >
                🌍 LCP+ Global Passport
              </Text>
              <Text
                className="mt-1 text-[12.5px] leading-[18px]"
                style={{ color: COLOR.textMuted }}
              >
                Earn and redeem stamps across the entire network of
                participating LCP+ cafes.
              </Text>
            </View>
          </View>

          {/* Private block */}
          <View
            className="mt-3 flex-row items-start rounded-2xl p-4"
            style={{
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: COLOR.border,
            }}
          >
            <View
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: COLOR.border,
              }}
            >
              <Store size={18} color={COLOR.textMuted} strokeWidth={2} />
            </View>
            <View className="ml-3 flex-1">
              <Text
                className="text-[14px] font-semibold"
                style={{ color: COLOR.text }}
              >
                🏪 Private Brand Cards
              </Text>
              <Text
                className="mt-1 text-[12.5px] leading-[18px]"
                style={{ color: COLOR.textMuted }}
              >
                Earned and redeemed exclusively at any location of that
                specific brand.
              </Text>
            </View>
          </View>

          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Got it — close the welcome screen"
            className="mt-6 h-12 items-center justify-center rounded-2xl"
            style={({ pressed }) => ({
              backgroundColor: COLOR.accent,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              className="text-[14px] font-semibold"
              style={{
                color: COLOR.accentInk,
                letterSpacing: 0.3,
                fontFamily: FONT.semibold,
              }}
            >
              Let&apos;s get brewing! ☕
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

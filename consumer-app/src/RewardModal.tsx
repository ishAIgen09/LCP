import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { Coffee, Gift, HandHeart, MapPin, Sparkles } from "lucide-react-native";

import { ApiError, donateLoyalty } from "./api";
import { COLOR, FONT } from "./theme";

export type RewardPayload = {
  stampsEarned: number;
  // cafeId added 2026-05-02 so the modal can fire donate-loyalty
  // directly at the participating cafe. Optional for legacy callers
  // (e.g. SAMPLE_REWARDS dev sandbox) — donate is hidden when missing.
  cafeId?: string;
  cafeName: string;
  cafeAddress: string;
  newBalance: number;
  freeDrinkUnlocked?: boolean;
  // True when the cafe.suspended_coffee_enabled flag is on. Drives
  // whether we render the side-by-side Redeem / Donate CTAs (founder
  // direction 2026-05-02) or the legacy single-CTA dismiss.
  suspendedCoffeeEnabled?: boolean;
};

const DISMISS_PHRASES = [
  "Cheers!",
  "Got it!",
  "Get in!",
  "Tasty!",
  "Sweet!",
  "Bring it on!",
];

export function RewardModal({
  visible,
  payload,
  token,
  onClose,
  onDonationSuccess,
}: {
  visible: boolean;
  payload: RewardPayload | null;
  // Consumer JWT — required for the Donate-to-Community POST. Optional
  // so the dev-sandbox SAMPLE_REWARDS path (App.tsx, no auth context)
  // can still preview the modal without crashing.
  token?: string;
  onClose: () => void;
  // Fired after a successful donate-loyalty call so App.tsx can refresh
  // the wallet poll (banked count drops by 1) without waiting for the
  // next polling tick. Optional — modal still works without it.
  onDonationSuccess?: () => void;
}) {
  const dismissLabel = useMemo(
    () => DISMISS_PHRASES[Math.floor(Math.random() * DISMISS_PHRASES.length)],
    [payload],
  );
  const [donating, setDonating] = useState(false);
  if (!payload) return null;
  const {
    stampsEarned,
    cafeId,
    cafeName,
    cafeAddress,
    newBalance,
    freeDrinkUnlocked,
    suspendedCoffeeEnabled,
  } = payload;
  const stampsLabel = stampsEarned === 1 ? "stamp" : "stamps";

  // The Donate CTA only makes sense when (a) the user just unlocked a
  // banked reward to spend, AND (b) the cafe is participating in Pay
  // It Forward, AND (c) we have the cafe id + token to make the call.
  const showDonate = Boolean(
    freeDrinkUnlocked && suspendedCoffeeEnabled && cafeId && token,
  );

  const headline = freeDrinkUnlocked
    ? "🎉 Free drink unlocked!"
    : "🎉 Nice one!";
  const subheadline = freeDrinkUnlocked
    ? "Congrats — your next drink is on the house."
    : null;

  const handleDonate = () => {
    if (donating || !cafeId || !token) return;
    Alert.alert(
      "Donate this drink?",
      `Pay it forward at ${cafeName}. Your reward goes onto their Community Board for someone who needs it next.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Donate",
          style: "default",
          onPress: async () => {
            setDonating(true);
            try {
              await donateLoyalty(token, cafeId);
              Alert.alert(
                "Drink donated!",
                "Thank you — your coffee is on the board for the next person who needs one.",
              );
              onDonationSuccess?.();
              onClose();
            } catch (e) {
              const msg =
                e instanceof ApiError
                  ? e.detail
                  : "Couldn't donate right now. Try again in a moment.";
              Alert.alert("Donation failed", msg);
            } finally {
              setDonating(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.72)",
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
            borderColor: freeDrinkUnlocked
              ? "rgba(0,229,118,0.42)"
              : "rgba(228,185,127,0.28)",
            padding: 24,
            shadowColor: freeDrinkUnlocked ? COLOR.accent : COLOR.accent,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: freeDrinkUnlocked ? 0.45 : 0.35,
            shadowRadius: 32,
            elevation: 18,
          }}
        >
          <View
            className="mx-auto h-16 w-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: freeDrinkUnlocked
                ? "rgba(0,229,118,0.16)"
                : "rgba(228,185,127,0.14)",
              borderWidth: 1,
              borderColor: freeDrinkUnlocked
                ? "rgba(0,229,118,0.4)"
                : "rgba(228,185,127,0.3)",
            }}
          >
            {freeDrinkUnlocked ? (
              <Gift size={28} color={COLOR.accent} strokeWidth={2} />
            ) : (
              <Sparkles size={28} color={COLOR.accent} strokeWidth={2} />
            )}
          </View>

          <Text
            className="mt-5 text-center text-[28px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.6 }}
          >
            {headline}
          </Text>
          {subheadline ? (
            <Text
              className="mt-1 text-center text-[14px]"
              style={{ color: COLOR.accent, fontFamily: FONT.semibold }}
            >
              {subheadline}
            </Text>
          ) : null}
          <Text
            className="mt-2 text-center text-[15px] leading-5"
            style={{ color: COLOR.textMuted }}
          >
            You've earned{" "}
            <Text style={{ color: COLOR.accent, fontWeight: "700" }}>
              {stampsEarned} {stampsLabel}
            </Text>{" "}
            at{" "}
            <Text style={{ color: COLOR.text, fontWeight: "600" }}>
              {cafeName}
            </Text>
            .
          </Text>

          <View
            className="mt-5 flex-row items-center rounded-2xl px-4 py-3"
            style={{
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: COLOR.border,
            }}
          >
            <MapPin size={14} color={COLOR.textDim} strokeWidth={2} />
            <Text
              className="ml-2 flex-1 text-[12px]"
              style={{ color: COLOR.textMuted }}
              numberOfLines={2}
            >
              {cafeAddress}
            </Text>
          </View>

          <View
            className="mt-4 flex-row items-center justify-between rounded-2xl px-4 py-3"
            style={{
              backgroundColor: freeDrinkUnlocked
                ? "rgba(0,229,118,0.10)"
                : "rgba(228,185,127,0.08)",
              borderWidth: 1,
              borderColor: freeDrinkUnlocked
                ? "rgba(0,229,118,0.32)"
                : "rgba(228,185,127,0.2)",
            }}
          >
            <View>
              <Text
                className="text-[10px] font-semibold uppercase"
                style={{ color: COLOR.textMuted, letterSpacing: 1.5 }}
              >
                New balance
              </Text>
              <Text
                className="mt-0.5 text-[22px] font-semibold"
                style={{ color: COLOR.text, letterSpacing: -0.3 }}
              >
                {newBalance}
                <Text style={{ color: COLOR.textFaint }}> / 10</Text>
              </Text>
            </View>
            {freeDrinkUnlocked ? (
              <View
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: "rgba(0,229,118,0.18)" }}
              >
                <Text
                  className="text-[10px] font-semibold uppercase"
                  style={{ color: COLOR.accent, letterSpacing: 1 }}
                >
                  Free drink unlocked
                </Text>
              </View>
            ) : (
              <Text
                className="text-[12px]"
                style={{ color: COLOR.textMuted }}
              >
                Keep going!
              </Text>
            )}
          </View>

          {showDonate ? (
            <View className="mt-6 flex-row" style={{ gap: 10 }}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close — redeem your free drink at the till"
                disabled={donating}
                className="h-12 flex-1 flex-row items-center justify-center rounded-2xl"
                style={({ pressed }) => ({
                  backgroundColor: COLOR.accent,
                  opacity: donating ? 0.6 : pressed ? 0.85 : 1,
                })}
              >
                <Coffee size={14} color={COLOR.accentInk} strokeWidth={2.4} />
                <Text
                  className="ml-2 text-[13.5px] font-semibold"
                  style={{ color: COLOR.accentInk, letterSpacing: 0.3 }}
                >
                  Redeem at Till
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDonate}
                accessibilityRole="button"
                accessibilityLabel="Donate this drink to the cafe's Community Board"
                disabled={donating}
                className="h-12 flex-1 flex-row items-center justify-center rounded-2xl"
                style={({ pressed }) => ({
                  backgroundColor: COLOR.surface,
                  borderWidth: 1,
                  borderColor: COLOR.accent,
                  opacity: donating ? 0.6 : pressed ? 0.85 : 1,
                })}
              >
                {donating ? (
                  <ActivityIndicator color={COLOR.accent} size="small" />
                ) : (
                  <>
                    <HandHeart size={14} color={COLOR.accent} strokeWidth={2.4} />
                    <Text
                      className="ml-2 text-[13.5px] font-semibold"
                      style={{ color: COLOR.accent, letterSpacing: 0.3 }}
                    >
                      Donate to Community
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onClose}
              className="mt-6 h-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: COLOR.accent }}
            >
              <Text
                className="text-base font-semibold"
                style={{ color: COLOR.accentInk, letterSpacing: 0.3 }}
              >
                {freeDrinkUnlocked ? "Redeem at Till" : dismissLabel}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

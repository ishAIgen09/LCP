import { Modal, Pressable, Text, View } from "react-native";
import { MapPin, Sparkles } from "lucide-react-native";

import { COLOR } from "./theme";

export type RewardPayload = {
  stampsEarned: number;
  cafeName: string;
  cafeAddress: string;
  newBalance: number;
  freeDrinkUnlocked?: boolean;
};

export function RewardModal({
  visible,
  payload,
  onClose,
}: {
  visible: boolean;
  payload: RewardPayload | null;
  onClose: () => void;
}) {
  if (!payload) return null;
  const { stampsEarned, cafeName, cafeAddress, newBalance, freeDrinkUnlocked } =
    payload;
  const stampsLabel = stampsEarned === 1 ? "stamp" : "stamps";

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
            borderColor: "rgba(228,185,127,0.28)",
            padding: 24,
            shadowColor: COLOR.accent,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.35,
            shadowRadius: 32,
            elevation: 18,
          }}
        >
          <View
            className="mx-auto h-16 w-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(228,185,127,0.14)",
              borderWidth: 1,
              borderColor: "rgba(228,185,127,0.3)",
            }}
          >
            <Sparkles size={28} color={COLOR.accent} strokeWidth={2} />
          </View>

          <Text
            className="mt-5 text-center text-[28px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.6 }}
          >
            🎉 Nice one!
          </Text>
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
              backgroundColor: "rgba(228,185,127,0.08)",
              borderWidth: 1,
              borderColor: "rgba(228,185,127,0.2)",
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
                style={{ backgroundColor: "rgba(74,222,128,0.15)" }}
              >
                <Text
                  className="text-[10px] font-semibold uppercase"
                  style={{ color: COLOR.live, letterSpacing: 1 }}
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

          <Pressable
            onPress={onClose}
            className="mt-6 h-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: COLOR.accent }}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: COLOR.accentInk, letterSpacing: 0.3 }}
            >
              Sweet!
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

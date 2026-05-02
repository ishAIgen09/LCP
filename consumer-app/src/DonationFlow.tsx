import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Check,
  ChevronRight,
  HandHeart,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react-native";

import {
  ApiError,
  donateLoyalty,
  fetchDiscoverCafes,
  type DiscoverCafe,
} from "./api";
import { COLOR, FONT } from "./theme";

// Two call shapes — `scope` decides which UI lane the modal takes.
//   - 'private': single-cafe auto-route. Brand context is required so
//     the helper text can name the brand. No "Choose another cafe"
//     button — the flow is 1-tap by design (founder direction).
//   - 'global': defaults to the user's last LCP+ visit; second
//     button opens a searchable picker scoped to is_lcp_plus cafes.
export type DonationContext =
  | {
      scope: "private";
      brandId: string;
      brandName: string;
      defaultCafeName: string;
    }
  | {
      scope: "global";
      defaultCafeName: string;
    };

export function DonationFlow({
  visible,
  context,
  token,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  // Nullable so the parent can render this modal unconditionally and
  // pass null between launches without unmount/remount churn.
  context: DonationContext | null;
  token: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  // Two-step state machine: 'confirm' is the default screen
  // (1-tap auto-route); 'pick' is the LCP+ cafe picker. Reset to
  // 'confirm' whenever the modal opens so a prior pick-screen close
  // doesn't bleed across launches.
  const [step, setStep] = useState<"confirm" | "pick">("confirm");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep("confirm");
      setSubmitting(false);
    }
  }, [visible, context]);

  if (!context) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} />
    );
  }

  const isPrivate = context.scope === "private";

  const handleConfirmDefault = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (context.scope === "private") {
        await donateLoyalty(token, {
          scope: "private",
          brandId: context.brandId,
        });
      } else {
        await donateLoyalty(token, { scope: "global" });
      }
      onSuccess?.();
      Alert.alert(
        "Drink donated!",
        "Thank you — your coffee is on the board for the next person who needs one.",
      );
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.detail
          : "Couldn't donate right now. Try again in a moment.";
      // 409 is the auto-route mismatch path — the user's last visit
      // isn't participating. Push them straight into the picker.
      if (e instanceof ApiError && e.status === 409 && context.scope === "global") {
        Alert.alert("Pick a cafe", msg, [
          { text: "Cancel", style: "cancel" },
          { text: "Choose cafe", onPress: () => setStep("pick") },
        ]);
      } else {
        Alert.alert("Donation didn't go through", msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePicked = async (cafeId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await donateLoyalty(token, { cafeId });
      onSuccess?.();
      Alert.alert(
        "Drink donated!",
        "Thank you — your coffee is on the board for the next person who needs one.",
      );
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.detail
          : "Couldn't donate right now. Try again in a moment.";
      Alert.alert("Donation didn't go through", msg);
    } finally {
      setSubmitting(false);
    }
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
        onPress={submitting ? undefined : onClose}
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
            borderColor: "rgba(0,229,118,0.32)",
            padding: 24,
            shadowColor: COLOR.accent,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 32,
            elevation: 18,
          }}
        >
          {step === "confirm" ? (
            <ConfirmStep
              isPrivate={isPrivate}
              context={context}
              submitting={submitting}
              onConfirm={handleConfirmDefault}
              onChooseAnother={() => setStep("pick")}
              onClose={onClose}
            />
          ) : (
            <PickStep
              token={token}
              submitting={submitting}
              onBack={() => setStep("confirm")}
              onPick={handlePicked}
              onClose={onClose}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConfirmStep({
  isPrivate,
  context,
  submitting,
  onConfirm,
  onChooseAnother,
  onClose,
}: {
  isPrivate: boolean;
  context: DonationContext;
  submitting: boolean;
  onConfirm: () => void;
  onChooseAnother: () => void;
  onClose: () => void;
}) {
  const headline = isPrivate
    ? `Donate to ${context.scope === "private" ? context.brandName : ""}?`
    : "Donate to your last LCP+ cafe?";
  const body = isPrivate
    ? `Burn one banked reward — your coffee goes onto ${context.defaultCafeName}'s Community Board for someone who needs it next.`
    : `Your reward goes onto ${context.defaultCafeName}'s Community Board for the next person who needs one.`;

  return (
    <>
      <View
        className="mx-auto h-14 w-14 items-center justify-center rounded-full"
        style={{
          backgroundColor: "rgba(0,229,118,0.16)",
          borderWidth: 1,
          borderColor: "rgba(0,229,118,0.4)",
        }}
      >
        <HandHeart size={26} color={COLOR.accent} strokeWidth={2} />
      </View>

      <Text
        className="mt-4 text-center text-[22px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.4 }}
      >
        {headline}
      </Text>
      <Text
        className="mt-2 text-center text-[14px] leading-5"
        style={{ color: COLOR.textMuted }}
      >
        {body}
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
          className="ml-2 flex-1 text-[12.5px]"
          style={{ color: COLOR.text, fontFamily: FONT.medium }}
          numberOfLines={2}
        >
          {context.defaultCafeName}
        </Text>
      </View>

      <Pressable
        onPress={onConfirm}
        accessibilityRole="button"
        disabled={submitting}
        className="mt-6 h-12 flex-row items-center justify-center rounded-2xl"
        style={({ pressed }) => ({
          backgroundColor: COLOR.accent,
          opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        {submitting ? (
          <ActivityIndicator color={COLOR.accentInk} />
        ) : (
          <>
            <Check size={16} color={COLOR.accentInk} strokeWidth={2.5} />
            <Text
              className="ml-2 text-[14px] font-semibold"
              style={{ color: COLOR.accentInk, letterSpacing: 0.3 }}
            >
              Confirm donation
            </Text>
          </>
        )}
      </Pressable>

      {/* "Choose another cafe" only renders for the LCP+ scope. The
          private flow is 1-tap by design — brand-scoped donations
          can't be retargeted to a different brand. */}
      {!isPrivate ? (
        <Pressable
          onPress={onChooseAnother}
          accessibilityRole="button"
          disabled={submitting}
          className="mt-3 h-12 flex-row items-center justify-center rounded-2xl"
          style={({ pressed }) => ({
            backgroundColor: COLOR.surface,
            borderWidth: 1,
            borderColor: COLOR.border,
            opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          <Sparkles size={14} color={COLOR.text} strokeWidth={2} />
          <Text
            className="ml-2 text-[13.5px] font-semibold"
            style={{ color: COLOR.text }}
          >
            Choose another cafe
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        disabled={submitting}
        className="mt-3 h-10 items-center justify-center"
      >
        <Text className="text-[13px]" style={{ color: COLOR.textDim }}>
          Cancel
        </Text>
      </Pressable>
    </>
  );
}

function PickStep({
  token,
  submitting,
  onBack,
  onPick,
  onClose,
}: {
  token: string;
  submitting: boolean;
  onBack: () => void;
  onPick: (cafeId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cafes, setCafes] = useState<DiscoverCafe[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchDiscoverCafes(token)
      .then((all) => {
        if (cancelled) return;
        // Filter to LCP+ partner cafes only — Private brands can't
        // accept cross-network donations, so they're irrelevant
        // here. (The combobox is exclusively the global-scope
        // re-target path.)
        setCafes(all.filter((c) => c.is_lcp_plus));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(
          e instanceof ApiError ? e.detail : "Couldn't load LCP+ cafes.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const filtered = useMemo(() => {
    if (!cafes) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return cafes;
    return cafes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }, [cafes, query]);

  return (
    <>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-9 flex-row items-center"
          hitSlop={8}
        >
          <ChevronRight
            size={18}
            color={COLOR.textMuted}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: "180deg" }] }}
          />
          <Text
            className="ml-1 text-[13px] font-medium"
            style={{ color: COLOR.textMuted }}
          >
            Back
          </Text>
        </Pressable>
        <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
          <X size={18} color={COLOR.textMuted} strokeWidth={2.2} />
        </Pressable>
      </View>

      <Text
        className="mt-3 text-[19px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.3 }}
      >
        Pick a cafe to donate to
      </Text>
      {/* Founder-locked helper copy. */}
      <Text
        className="mt-1 text-[12.5px]"
        style={{ color: COLOR.textMuted }}
      >
        Here's a list of all our LCP+ partner cafes:
      </Text>

      <View
        className="mt-4 flex-row items-center rounded-2xl px-3"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
        }}
      >
        <Search size={15} color={COLOR.textDim} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or address"
          placeholderTextColor={COLOR.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          style={{
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 8,
            color: COLOR.text,
            fontSize: 14,
            fontFamily: FONT.regular,
          }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <X size={14} color={COLOR.textDim} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ height: 320, marginTop: 12 }}>
        {loading ? (
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: "transparent" }}
          >
            <ActivityIndicator color={COLOR.accent} />
            <Text
              className="mt-3 text-[12.5px]"
              style={{ color: COLOR.textMuted }}
            >
              Loading partner cafes…
            </Text>
          </View>
        ) : loadError ? (
          <View
            className="flex-1 items-center justify-center px-3"
            style={{ backgroundColor: "transparent" }}
          >
            <Text
              className="text-center text-[13px]"
              style={{ color: COLOR.textMuted }}
            >
              {loadError}
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View
            className="flex-1 items-center justify-center px-3"
            style={{ backgroundColor: "transparent" }}
          >
            <Text
              className="text-center text-[13px]"
              style={{ color: COLOR.textMuted }}
            >
              {cafes && cafes.length === 0
                ? "No LCP+ partner cafes yet."
                : "No matches. Try a different search."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: COLOR.border }} />
            )}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(item.id)}
                disabled={submitting}
                accessibilityRole="button"
                className="flex-row items-center px-3 py-3"
                style={({ pressed }) => ({
                  backgroundColor: pressed
                    ? "rgba(228,185,127,0.08)"
                    : "transparent",
                  opacity: submitting ? 0.6 : 1,
                })}
              >
                <View className="flex-1">
                  <Text
                    className="text-[14px] font-semibold"
                    style={{ color: COLOR.text }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    className="mt-0.5 text-[12px]"
                    style={{ color: COLOR.textMuted }}
                    numberOfLines={1}
                  >
                    {item.address}
                  </Text>
                </View>
                <ChevronRight
                  size={16}
                  color={COLOR.textDim}
                  strokeWidth={2.2}
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </>
  );
}

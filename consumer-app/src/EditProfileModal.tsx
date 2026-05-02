import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { ApiError, updateConsumerProfile, type ConsumerProfile } from "./api";
import { COLOR, FONT } from "./theme";

export function EditProfileModal({
  open,
  token,
  initialFirstName,
  initialLastName,
  onClose,
  onSaved,
}: {
  open: boolean;
  token: string;
  initialFirstName: string | null;
  initialLastName: string | null;
  onClose: () => void;
  onSaved: (profile: ConsumerProfile) => void;
}) {
  const insets = useSafeAreaInsets();
  const [first, setFirst] = useState(initialFirstName ?? "");
  const [last, setLast] = useState(initialLastName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset locally-edited values whenever the parent re-opens the modal
  // — avoids the "I closed without saving last time, reopen, fields still
  // show my abandoned edits" gotcha.
  useEffect(() => {
    if (open) {
      setFirst(initialFirstName ?? "");
      setLast(initialLastName ?? "");
      setError(null);
    }
  }, [open, initialFirstName, initialLastName]);

  const dirty =
    (first.trim() || null) !== (initialFirstName?.trim() || null) ||
    (last.trim() || null) !== (initialLastName?.trim() || null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const profile = await updateConsumerProfile(token, {
        first_name: first.trim(),
        last_name: last.trim(),
      });
      onSaved(profile);
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.detail
          : "Couldn't save your name. Try again in a moment.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: COLOR.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: insets.bottom + 24,
            borderTopWidth: 1,
            borderColor: COLOR.border,
          }}
        >
          <View className="flex-row items-center justify-between">
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 18,
                color: COLOR.text,
                letterSpacing: -0.3,
              }}
            >
              Edit your name
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
            >
              <X size={20} color={COLOR.textMuted} />
            </Pressable>
          </View>
          <Text
            className="mt-1 text-[12px]"
            style={{ color: COLOR.textMuted, lineHeight: 18 }}
          >
            We'll use this on receipts, baristas' till displays, and the
            Profile tab greeting.
          </Text>

          <View className="mt-5">
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 11,
                color: COLOR.textDim,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              First name
            </Text>
            <TextInput
              value={first}
              onChangeText={setFirst}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={60}
              placeholder="First name"
              placeholderTextColor={COLOR.textFaint}
              style={{
                marginTop: 6,
                height: 48,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: COLOR.surface,
                borderWidth: 1,
                borderColor: COLOR.border,
                color: COLOR.text,
                fontFamily: FONT.regular,
                fontSize: 15,
              }}
            />
          </View>

          <View className="mt-4">
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 11,
                color: COLOR.textDim,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              Last name
            </Text>
            <TextInput
              value={last}
              onChangeText={setLast}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={60}
              placeholder="Last name"
              placeholderTextColor={COLOR.textFaint}
              style={{
                marginTop: 6,
                height: 48,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: COLOR.surface,
                borderWidth: 1,
                borderColor: COLOR.border,
                color: COLOR.text,
                fontFamily: FONT.regular,
                fontSize: 15,
              }}
            />
          </View>

          {error ? (
            <Text
              className="mt-3 text-[12px]"
              style={{ color: COLOR.terracotta, lineHeight: 18 }}
            >
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={handleSave}
            disabled={!dirty || saving}
            accessibilityRole="button"
            className="mt-6 h-12 items-center justify-center rounded-2xl"
            style={({ pressed }) => ({
              backgroundColor: COLOR.accent,
              opacity: !dirty || saving ? 0.45 : pressed ? 0.85 : 1,
            })}
          >
            {saving ? (
              <ActivityIndicator color={COLOR.accentInk} size="small" />
            ) : (
              <Text
                style={{
                  fontFamily: FONT.semibold,
                  fontSize: 14,
                  color: COLOR.accentInk,
                  letterSpacing: 0.3,
                }}
              >
                Save changes
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="mt-2 h-12 items-center justify-center rounded-2xl"
            style={({ pressed }) => ({
              backgroundColor: "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 13,
                color: COLOR.textMuted,
                letterSpacing: 0.3,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

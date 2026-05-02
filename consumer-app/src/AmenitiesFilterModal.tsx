import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";

import { AMENITIES } from "./amenities";
import { COLOR, FONT } from "./theme";

// Bottom-sheet multi-select for the Discover amenity filter. Replaces the
// horizontal pill ScrollView per founder direction (2026-05-02). The user
// taps amenity rows to toggle them into a *draft* set; nothing commits to
// the parent until they hit "Apply N filter(s)". Tapping outside or the
// close button discards the draft. Greys out (and disables) any amenity
// nobody nearby ticks so the list stays honest without truncating.
export function AmenitiesFilterModal({
  open,
  initialSelected,
  availableIds,
  onClose,
  onApply,
}: {
  open: boolean;
  initialSelected: ReadonlySet<string>;
  availableIds: ReadonlySet<string>;
  onClose: () => void;
  onApply: (selected: Set<string>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Set<string>>(
    () => new Set(initialSelected),
  );

  // Reset draft to the parent's current selection every time the sheet
  // opens. Without this, an "open → toggle → close → reopen" sequence
  // would leak the abandoned toggles back into the next open.
  useEffect(() => {
    if (open) {
      setDraft(new Set(initialSelected));
    }
  }, [open, initialSelected]);

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAll = () => setDraft(new Set());

  const handleApply = () => {
    onApply(new Set(draft));
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close filters"
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          // Inner Pressable swallows taps so the row tap doesn't bubble
          // up and dismiss the sheet — without this, every toggle would
          // also close the modal.
          onPress={() => {}}
          style={{
            backgroundColor: COLOR.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 18,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderColor: COLOR.border,
            maxHeight: "82%",
          }}
        >
          {/* Drag-handle hint */}
          <View
            style={{
              alignSelf: "center",
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: COLOR.border,
              marginBottom: 12,
            }}
          />

          <View
            className="flex-row items-center justify-between px-6"
            style={{ marginBottom: 8 }}
          >
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 18,
                color: COLOR.text,
                letterSpacing: -0.3,
              }}
            >
              Filter amenities
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
            className="px-6 text-[12px]"
            style={{ color: COLOR.textMuted, lineHeight: 18 }}
          >
            Pick one or more — we'll only show cafés that match every
            filter you've selected.
          </Text>

          <ScrollView
            style={{ marginTop: 14 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {AMENITIES.map((a) => {
              const isAvailable = availableIds.has(a.id);
              const isSelected = draft.has(a.id);
              const Icon = a.Icon;
              const dim = !isAvailable && !isSelected;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => toggle(a.id)}
                  disabled={dim}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: isSelected,
                    disabled: dim,
                  }}
                  accessibilityLabel={a.label}
                  className="flex-row items-center rounded-2xl"
                  style={({ pressed }) => ({
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    marginBottom: 8,
                    backgroundColor: isSelected
                      ? "rgba(0,229,118,0.08)"
                      : COLOR.surface,
                    borderWidth: 1,
                    borderColor: isSelected ? COLOR.accent : COLOR.border,
                    opacity: dim ? 0.45 : pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <Icon
                      size={14}
                      color={isSelected ? COLOR.accent : COLOR.roastedAlmond}
                      strokeWidth={2.2}
                    />
                  </View>
                  <Text
                    className="flex-1"
                    style={{
                      marginLeft: 12,
                      fontFamily: FONT.semibold,
                      fontSize: 14,
                      color: COLOR.text,
                      letterSpacing: 0.1,
                    }}
                    numberOfLines={1}
                  >
                    {a.label}
                  </Text>
                  {!isAvailable && !isSelected ? (
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        fontSize: 11,
                        color: COLOR.textFaint,
                        marginRight: 8,
                      }}
                    >
                      None nearby
                    </Text>
                  ) : null}
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 1.5,
                      borderColor: isSelected
                        ? COLOR.accent
                        : COLOR.border,
                      backgroundColor: isSelected
                        ? COLOR.accent
                        : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected ? (
                      <Check size={14} color={COLOR.accentInk} strokeWidth={3} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Footer CTAs — primary "Show Cafes" is mint-on-espresso and
              fills the row width so it reads as the obvious next step.
              Clear sits to the left as a secondary action and dims to
              45% when there's nothing to clear. */}
          <View
            className="px-6"
            style={{
              borderTopWidth: 1,
              borderColor: COLOR.border,
              paddingTop: 14,
            }}
          >
            <Pressable
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel={
                draft.size > 0
                  ? `Show cafés matching ${draft.size} filter${draft.size === 1 ? "" : "s"}`
                  : "Show all cafés"
              }
              className="h-14 items-center justify-center rounded-2xl"
              style={({ pressed }) => ({
                backgroundColor: COLOR.accent,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: FONT.semibold,
                  fontSize: 15,
                  color: COLOR.accentInk,
                  letterSpacing: 0.3,
                }}
              >
                {draft.size > 0
                  ? `Show Cafés · ${draft.size} filter${draft.size === 1 ? "" : "s"}`
                  : "Show Cafés"}
              </Text>
            </Pressable>
            <Pressable
              onPress={clearAll}
              disabled={draft.size === 0}
              accessibilityRole="button"
              className="mt-2 h-11 items-center justify-center rounded-2xl"
              style={({ pressed }) => ({
                backgroundColor: "transparent",
                opacity: draft.size === 0 ? 0.45 : pressed ? 0.7 : 1,
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
                Clear all
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

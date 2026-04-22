import { useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react-native";

import type { DiscoverCafe } from "./api";
import { FoodHygieneBadge } from "./FoodHygieneBadge";
import { COLOR, FONT } from "./theme";

export function ContactLocationModal({
  cafe,
  visible,
  onClose,
}: {
  cafe: DiscoverCafe | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [linkingError, setLinkingError] = useState<string | null>(null);

  const onOpenDirections = async () => {
    if (!cafe) return;
    setLinkingError(null);
    const encoded = encodeURIComponent(cafe.address);
    // iOS: maps.apple.com universal link — iOS intercepts it into the Maps
    // app without needing LSApplicationQueriesSchemes in Info.plist, and
    // degrades to a web page anywhere else. The old `maps:?q=` scheme is
    // malformed (missing 0,0 coord pair) and was throwing "Unable to open
    // URL" on some devices.
    // Android: geo:0,0?q= is the canonical geo scheme any installed maps
    // app handles.
    const nativeUrl = Platform.select({
      ios: `http://maps.apple.com/?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: undefined,
    });
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

    // Swallow per-attempt errors so one malformed scheme doesn't surface a
    // user-visible error before the fallback has had a chance. Only the
    // final "both failed" branch sets linkingError.
    const tryOpen = async (url: string): Promise<boolean> => {
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) return false;
        await Linking.openURL(url);
        return true;
      } catch {
        return false;
      }
    };

    if (nativeUrl && (await tryOpen(nativeUrl))) return;
    if (await tryOpen(webUrl)) return;
    setLinkingError("Couldn't open a map app on this device.");
  };

  const onCallPhone = async () => {
    if (!cafe?.phone) return;
    setLinkingError(null);
    const sanitized = cafe.phone.replace(/[^\d+]/g, "");
    const url = `tel:${sanitized}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setLinkingError("This device can't place phone calls.");
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      setLinkingError(
        e instanceof Error
          ? `Call couldn't start: ${e.message}`
          : "Call couldn't start.",
      );
    }
  };

  if (!cafe) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLOR.bg }}>
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 24,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to cafe details"
            style={{
              height: 36,
              paddingLeft: 8,
              paddingRight: 14,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 999,
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: COLOR.border,
            }}
          >
            <ChevronLeft size={16} color={COLOR.textMuted} strokeWidth={2.2} />
            <Text
              style={{
                marginLeft: 2,
                fontFamily: FONT.semibold,
                fontSize: 12,
                color: COLOR.textMuted,
                letterSpacing: 0.4,
              }}
            >
              Back
            </Text>
          </Pressable>
          <Text
            style={{
              fontFamily: FONT.semibold,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: COLOR.terracotta,
            }}
          >
            Contact & Location
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              fontFamily: FONT.bold,
              fontSize: 28,
              lineHeight: 34,
              color: COLOR.text,
              letterSpacing: -0.6,
            }}
          >
            {cafe.name}
          </Text>

          <InfoRow
            icon={<MapPin size={16} color={COLOR.roastedAlmond} strokeWidth={2.2} />}
            label="Address"
            value={cafe.address}
          />

          {cafe.phone ? (
            <Pressable
              onPress={onCallPhone}
              accessibilityRole="button"
              accessibilityLabel={`Call ${cafe.name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <InfoRow
                icon={<Phone size={16} color={COLOR.roastedAlmond} strokeWidth={2.2} />}
                label="Phone"
                value={cafe.phone}
                trailing="Tap to call"
              />
            </Pressable>
          ) : (
            <InfoRow
              icon={<Phone size={16} color={COLOR.textDim} strokeWidth={2.2} />}
              label="Phone"
              value="Not shared yet"
              valueMuted
              trailing="The cafe hasn't added a number"
            />
          )}

          <TouchableOpacity
            onPress={onOpenDirections}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Get directions to ${cafe.name}`}
          >
            <InfoRow
              icon={<Navigation size={16} color={COLOR.roastedAlmond} strokeWidth={2.2} />}
              label="Directions"
              value="Get Directions"
              trailing="Tap to open map"
            />
          </TouchableOpacity>

          {linkingError ? (
            <Text
              style={{
                marginTop: 10,
                fontFamily: FONT.medium,
                fontSize: 12,
                color: COLOR.terracotta,
              }}
            >
              {linkingError}
            </Text>
          ) : null}

          <HygieneRatingSection rating={cafe.food_hygiene_rating} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueMuted,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueMuted?: boolean;
  trailing?: string;
}) {
  return (
    <View
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 16,
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: COLOR.border,
        flexDirection: "row",
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          height: 32,
          width: 32,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(200,170,141,0.12)",
          borderWidth: 1,
          borderColor: "rgba(200,170,141,0.28)",
        }}
      >
        {icon}
      </View>
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text
          style={{
            fontFamily: FONT.semibold,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            color: COLOR.textDim,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: FONT.medium,
            fontSize: 14,
            lineHeight: 20,
            color: valueMuted ? COLOR.textMuted : COLOR.text,
            letterSpacing: 0.1,
          }}
        >
          {value}
        </Text>
        {trailing ? (
          <Text
            style={{
              marginTop: 2,
              fontFamily: FONT.regular,
              fontSize: 11,
              color: COLOR.textDim,
              letterSpacing: 0.1,
            }}
          >
            {trailing}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function HygieneRatingSection({
  rating,
}: {
  rating: DiscoverCafe["food_hygiene_rating"];
}) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text
        style={{
          fontFamily: FONT.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: COLOR.textDim,
        }}
      >
        Food Hygiene Rating
      </Text>
      <View style={{ marginTop: 12 }}>
        <FoodHygieneBadge rating={rating} />
      </View>
    </View>
  );
}

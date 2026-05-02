import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronRight,
  Coffee,
  HandHeart,
  MapPin,
  Megaphone,
  Sparkles,
  X,
} from "lucide-react-native";

import { lookupAmenity, type AmenityDef } from "./amenities";
import { ApiError, donateLoyalty, type DiscoverCafe, type DiscoverOffer } from "./api";
import { ContactLocationModal } from "./ContactLocationModal";
import { formatOfferHeadline, formatOfferWindow } from "./offers";
import { COLOR, FONT } from "./theme";

export function CafeDetailsModal({
  cafe,
  token,
  onClose,
  onDonationSuccess,
}: {
  cafe: DiscoverCafe | null;
  // Consumer JWT — passed in by App.tsx so the donate-loyalty POST
  // can authenticate. Always present when the modal is open (the user
  // can't reach Discover without a session).
  token: string;
  onClose: () => void;
  // Lifted-up callback — App.tsx patches its local cafes state with
  // the new pool balance so the Explore card + this modal both
  // reflect the post-donation count without a refetch.
  onDonationSuccess: (newPoolBalance: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [contactOpen, setContactOpen] = useState(false);
  const [donating, setDonating] = useState(false);
  if (!cafe) return null;

  const knownAmenities = cafe.amenities
    .map((id) => lookupAmenity(id))
    .filter((a): a is AmenityDef => Boolean(a));

  const handleClose = () => {
    // If the nested Contact modal was still open we don't want it reopening
    // the next time the user taps a card — reset explicitly.
    setContactOpen(false);
    onClose();
  };

  const handleDonate = async () => {
    if (donating || !cafe) return;
    Alert.alert(
      "Donate 1 reward?",
      `Burn one banked reward and add a coffee to ${cafe.name}'s Community Board pool. Someone in need will be able to claim it next time they walk in.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm donation",
          style: "default",
          onPress: async () => {
            setDonating(true);
            try {
              const result = await donateLoyalty(token, cafe.id);
              onDonationSuccess(result.new_pool_balance);
              Alert.alert(
                "Thank you!",
                `Your coffee is on the board for the next person who needs it. ${result.new_pool_balance} on the board now.`,
              );
            } catch (e) {
              const msg =
                e instanceof ApiError
                  ? e.detail
                  : "Couldn't process the donation. Try again in a moment.";
              Alert.alert("Donation didn't go through", msg);
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
      visible={cafe !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: COLOR.bg }}>
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 24,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close cafe details"
            style={{
              height: 36,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 999,
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: COLOR.border,
            }}
          >
            <X size={14} color={COLOR.textMuted} strokeWidth={2.2} />
            <Text
              style={{
                marginLeft: 6,
                fontFamily: FONT.semibold,
                fontSize: 12,
                color: COLOR.textMuted,
                letterSpacing: 0.4,
              }}
            >
              Close
            </Text>
          </Pressable>
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
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start" }}>
            <MapPin
              size={14}
              color={COLOR.textDim}
              strokeWidth={2}
              style={{ marginTop: 3 }}
            />
            <Text
              style={{
                marginLeft: 8,
                flex: 1,
                fontFamily: FONT.regular,
                fontSize: 13,
                lineHeight: 19,
                color: COLOR.textMuted,
              }}
            >
              {cafe.address}
            </Text>
          </View>

          <AmenitiesSection amenities={knownAmenities} />

          {cafe.suspended_coffee_enabled ? (
            <CommunityBoardSection
              poolBalance={cafe.suspended_coffee_pool ?? 0}
              donating={donating}
              onDonate={handleDonate}
            />
          ) : null}

          <TouchableOpacity
            onPress={() => setContactOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Open contact and location details for ${cafe.name}`}
            style={{
              marginTop: 28,
              marginBottom: 16,
              padding: 16,
              borderRadius: 12,
              backgroundColor: COLOR.surface,
              borderWidth: 1,
              borderColor: COLOR.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontFamily: FONT.semibold,
                fontSize: 15,
                color: COLOR.text,
                letterSpacing: -0.1,
              }}
            >
              Contact & Location
            </Text>
            <ChevronRight size={20} color={COLOR.textMuted} strokeWidth={2.2} />
          </TouchableOpacity>

          <OffersSection offers={cafe.live_offers} />
        </ScrollView>

        <ContactLocationModal
          cafe={cafe}
          visible={contactOpen}
          onClose={() => setContactOpen(false)}
        />
      </View>
    </Modal>
  );
}

function SectionKicker({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {icon}
      <Text
        style={{
          marginLeft: 8,
          fontFamily: FONT.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: COLOR.textDim,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function EmptyNotice({ message }: { message: string }) {
  return (
    <View
      style={{
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: "rgba(243,233,220,0.06)",
        borderWidth: 1,
        borderColor: "rgba(243,233,220,0.14)",
      }}
    >
      <Coffee size={14} color={COLOR.roastedAlmond} strokeWidth={2} />
      <Text
        style={{
          marginLeft: 10,
          flex: 1,
          fontFamily: FONT.medium,
          fontSize: 13,
          color: COLOR.textMuted,
          letterSpacing: 0.1,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

// Pay It Forward / Suspended Coffee section inside CafeDetailsModal.
// Only renders when the cafe has toggled the feature on (parent
// gates on cafe.suspended_coffee_enabled). Shows the current pool
// count + a Donate button that burns one banked reward.
function CommunityBoardSection({
  poolBalance,
  donating,
  onDonate,
}: {
  poolBalance: number;
  donating: boolean;
  onDonate: () => void;
}) {
  const coffeeWord = poolBalance === 1 ? "coffee" : "coffees";
  return (
    <View style={{ marginTop: 28 }}>
      <SectionKicker
        icon={<HandHeart size={13} color={"#00B85F"} strokeWidth={2.2} />}
        label="Community Board"
      />
      <View
        style={{
          marginTop: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: "rgba(0,229,118,0.08)",
          borderWidth: 1,
          borderColor: "rgba(0,229,118,0.28)",
        }}
      >
        <Text
          style={{
            fontFamily: FONT.semibold,
            fontSize: 15,
            color: COLOR.text,
            letterSpacing: -0.1,
          }}
        >
          {poolBalance > 0
            ? `${poolBalance} ${coffeeWord} waiting on the board`
            : "Be the first to put a coffee on the board"}
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: FONT.regular,
            fontSize: 12.5,
            lineHeight: 18,
            color: COLOR.textMuted,
          }}
        >
          Donate one of your banked rewards. Someone in need can claim it next
          time they walk in — no questions asked.
        </Text>
        <TouchableOpacity
          onPress={onDonate}
          activeOpacity={0.85}
          disabled={donating}
          accessibilityRole="button"
          accessibilityLabel="Donate one banked reward to this cafe's Community Board"
          style={{
            marginTop: 14,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: donating ? "rgba(0,229,118,0.5)" : "#00B85F",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
          }}
        >
          {donating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <HandHeart size={14} color="#FFFFFF" strokeWidth={2.4} />
              <Text
                style={{
                  marginLeft: 8,
                  fontFamily: FONT.semibold,
                  fontSize: 14,
                  color: "#FFFFFF",
                  letterSpacing: -0.1,
                }}
              >
                Donate 1 Reward
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}


function AmenitiesSection({ amenities }: { amenities: AmenityDef[] }) {
  return (
    <View style={{ marginTop: 28 }}>
      <SectionKicker
        icon={<Sparkles size={13} color={COLOR.accent} strokeWidth={2.2} />}
        label="Amenities"
      />
      {amenities.length === 0 ? (
        <EmptyNotice message="More perks coming soon — this cafe hasn't listed their amenities yet." />
      ) : (
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            flexWrap: "wrap",
          }}
        >
          {amenities.map((a) => (
            <AmenityBadge key={a.id} amenity={a} />
          ))}
        </View>
      )}
    </View>
  );
}

function AmenityBadge({ amenity }: { amenity: AmenityDef }) {
  const { Icon, label } = amenity;
  return (
    <View
      style={{
        marginBottom: 8,
        marginRight: 8,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 8,
        paddingRight: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(200,170,141,0.12)",
        borderWidth: 1,
        borderColor: "rgba(200,170,141,0.3)",
      }}
    >
      <View
        style={{
          height: 22,
          width: 22,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(251,247,241,0.08)",
        }}
      >
        <Icon size={12} color={COLOR.roastedAlmond} strokeWidth={2.2} />
      </View>
      <Text
        style={{
          marginLeft: 8,
          fontFamily: FONT.semibold,
          fontSize: 12,
          color: COLOR.roastedAlmond,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function OffersSection({ offers }: { offers: DiscoverOffer[] }) {
  return (
    <View style={{ marginTop: 28 }}>
      <SectionKicker
        icon={<Megaphone size={13} color={COLOR.terracotta} strokeWidth={2.2} />}
        label="Live Offers"
      />
      {offers.length === 0 ? (
        <EmptyNotice message="No offers running right now — fresh perks are brewing. ☕" />
      ) : (
        <View style={{ marginTop: 12 }}>
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </View>
      )}
    </View>
  );
}

function OfferCard({ offer }: { offer: DiscoverOffer }) {
  return (
    <View
      style={{
        marginBottom: 10,
        borderRadius: 18,
        padding: 16,
        backgroundColor: "rgba(201,110,75,0.10)",
        borderWidth: 1,
        borderColor: "rgba(201,110,75,0.34)",
      }}
    >
      <Text
        style={{
          fontFamily: FONT.semibold,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.6,
          color: COLOR.terracotta,
        }}
      >
        Limited Time
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: FONT.semibold,
          fontSize: 17,
          lineHeight: 22,
          color: COLOR.text,
          letterSpacing: -0.3,
        }}
      >
        {formatOfferHeadline(offer)}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontFamily: FONT.medium,
          fontSize: 12,
          color: COLOR.textMuted,
        }}
      >
        {formatOfferWindow(offer)}
      </Text>
    </View>
  );
}

import { Text, View } from "react-native";
import { Star } from "lucide-react-native";

import type { FoodHygieneRating } from "./api";
import { FONT } from "./theme";

// Official FSA text labels. Mirror the b2b dashboard so merchants see the
// exact phrasing they picked surfaced back to consumers.
const FSA_LABEL: Record<
  Exclude<FoodHygieneRating, "Awaiting Inspection">,
  string
> = {
  "5": "VERY GOOD",
  "4": "GOOD",
  "3": "GENERALLY SATISFACTORY",
  "2": "IMPROVEMENT NECESSARY",
  "1": "MAJOR IMPROVEMENT NECESSARY",
};

// Stark black + bright-green palette — the FSA sticker's own colours. These
// override the app's dark theme on purpose so the badge reads as the
// physical sticker you'd see on a shopfront window.
const FSA_BG = "#000000";
const FSA_GREEN = "#00B140";
const FSA_TEXT = "#FFFFFF";
const FSA_RULE = "rgba(255,255,255,0.16)";

export function FoodHygieneBadge({
  rating,
}: {
  rating: FoodHygieneRating;
}) {
  const isAwaiting = rating === "Awaiting Inspection";
  const numericLabel = !isAwaiting ? FSA_LABEL[rating] : null;
  const starsFilled = !isAwaiting ? Number(rating) : 0;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        isAwaiting
          ? "Food Hygiene Rating: awaiting inspection"
          : `Food Hygiene Rating: ${rating} out of 5, ${numericLabel}`
      }
      style={{
        backgroundColor: FSA_BG,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 14,
        borderWidth: 2,
        borderColor: FSA_GREEN,
        // Sticker shadow — a touch of lift so it reads as a physical label.
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 6,
      }}
    >
      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: 11,
          textAlign: "center",
          letterSpacing: 2.2,
          color: FSA_GREEN,
        }}
      >
        FOOD HYGIENE RATING
      </Text>

      <View
        style={{
          marginTop: 8,
          height: 1,
          backgroundColor: FSA_RULE,
        }}
      />

      {isAwaiting ? (
        <View
          style={{
            marginTop: 14,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            borderWidth: 2,
            borderColor: FSA_GREEN,
            borderRadius: 6,
          }}
        >
          <Text
            style={{
              fontFamily: FONT.bold,
              fontSize: 16,
              letterSpacing: 1.6,
              color: FSA_GREEN,
              textAlign: "center",
            }}
          >
            AWAITING INSPECTION
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: FONT.medium,
              fontSize: 10,
              letterSpacing: 0.8,
              color: FSA_TEXT,
              opacity: 0.7,
              textAlign: "center",
            }}
          >
            Pending first FSA audit
          </Text>
        </View>
      ) : (
        <View
          style={{
            marginTop: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              borderWidth: 3,
              borderColor: FSA_GREEN,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: FSA_BG,
            }}
          >
            <Text
              style={{
                fontFamily: FONT.bold,
                fontSize: 44,
                lineHeight: 48,
                color: FSA_GREEN,
                letterSpacing: -1,
              }}
            >
              {rating}
            </Text>
          </View>

          <View
            style={{
              marginLeft: 14,
              flex: 1,
            }}
          >
            <Text
              style={{
                fontFamily: FONT.bold,
                fontSize: 13,
                color: FSA_TEXT,
                letterSpacing: 1.4,
                lineHeight: 17,
              }}
            >
              {numericLabel}
            </Text>
            <View style={{ marginTop: 6, flexDirection: "row" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  size={12}
                  color={i <= starsFilled ? FSA_GREEN : FSA_RULE}
                  strokeWidth={2}
                  fill={i <= starsFilled ? FSA_GREEN : "transparent"}
                  style={{ marginRight: 2 }}
                />
              ))}
            </View>
          </View>
        </View>
      )}

      <Text
        style={{
          marginTop: 12,
          fontFamily: FONT.medium,
          fontSize: 9,
          textAlign: "center",
          letterSpacing: 1.3,
          color: FSA_TEXT,
          opacity: 0.55,
        }}
      >
        UK FOOD STANDARDS AGENCY  ·  food.gov.uk/ratings
      </Text>
    </View>
  );
}

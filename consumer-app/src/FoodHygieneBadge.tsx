import { Text, View } from "react-native";

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

// Authentic UK FSA window-sticker palette. These override the app's dark
// theme on purpose — the badge is meant to read as the physical sticker you'd
// see on a shopfront, not a themed tile.
const FSA_GREEN = "#007E40";        // the official FSA spot green
const FSA_GREEN_DARK = "#005C2F";   // deeper green for the footer bar
const FSA_BLACK = "#000000";
const FSA_WHITE = "#FFFFFF";
const FSA_INACTIVE = "rgba(255,255,255,0.25)";

export function FoodHygieneBadge({
  rating,
}: {
  rating: FoodHygieneRating;
}) {
  const isAwaiting = rating === "Awaiting Inspection";
  const numericLabel = !isAwaiting ? FSA_LABEL[rating] : null;
  const ratingNum = !isAwaiting ? Number(rating) : -1;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        isAwaiting
          ? "Food Hygiene Rating: awaiting inspection"
          : `Food Hygiene Rating: ${rating} out of 5, ${numericLabel}`
      }
      style={{
        borderRadius: 10,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: FSA_BLACK,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 6,
      }}
    >
      {/* Top: solid green banner with white caps "FOOD HYGIENE RATING" */}
      <View
        style={{
          backgroundColor: FSA_GREEN,
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}
      >
        <Text
          style={{
            fontFamily: FONT.bold,
            fontSize: 14,
            letterSpacing: 2,
            textAlign: "center",
            color: FSA_WHITE,
          }}
        >
          FOOD HYGIENE RATING
        </Text>
      </View>

      {/* Body: black background with green rating disk + blocky number scale */}
      <View
        style={{
          backgroundColor: FSA_BLACK,
          paddingVertical: 18,
          paddingHorizontal: 16,
        }}
      >
        {isAwaiting ? (
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <Text
              style={{
                fontFamily: FONT.bold,
                fontSize: 18,
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
                color: FSA_WHITE,
                opacity: 0.7,
                textAlign: "center",
              }}
            >
              Pending first FSA audit
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* The disk — solid FSA green, white rating number */}
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: FSA_GREEN,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: FONT.bold,
                  fontSize: 52,
                  lineHeight: 56,
                  color: FSA_WHITE,
                  letterSpacing: -1.5,
                }}
              >
                {rating}
              </Text>
            </View>

            {/* Right column: blocky 0..5 scale + label */}
            <View style={{ marginLeft: 16, flex: 1 }}>
              <View style={{ flexDirection: "row" }}>
                {[0, 1, 2, 3, 4, 5].map((n) => {
                  const active = n === ratingNum;
                  return (
                    <View
                      key={n}
                      style={{
                        width: 24,
                        height: 24,
                        marginRight: 4,
                        borderWidth: 2,
                        borderColor: active ? FSA_GREEN : FSA_INACTIVE,
                        backgroundColor: active ? FSA_GREEN : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FONT.bold,
                          fontSize: 13,
                          lineHeight: 15,
                          color: active ? FSA_WHITE : FSA_INACTIVE,
                        }}
                      >
                        {n}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <Text
                style={{
                  marginTop: 10,
                  fontFamily: FONT.bold,
                  fontSize: 12,
                  color: FSA_WHITE,
                  letterSpacing: 1.3,
                  lineHeight: 15,
                }}
              >
                {numericLabel}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Footer: dark green bar with the FSA URL */}
      <View
        style={{
          backgroundColor: FSA_GREEN_DARK,
          paddingVertical: 8,
          paddingHorizontal: 14,
        }}
      >
        <Text
          style={{
            fontFamily: FONT.medium,
            fontSize: 9,
            textAlign: "center",
            letterSpacing: 1.3,
            color: FSA_WHITE,
            opacity: 0.85,
          }}
        >
          UK FOOD STANDARDS AGENCY  ·  food.gov.uk/ratings
        </Text>
      </View>
    </View>
  );
}

import { ScrollView, Text, View } from "react-native";
import { Coffee, Gift, MapPin } from "lucide-react-native";

import { COLOR } from "./theme";

type ActivityEntry = {
  id: string;
  kind: "earn" | "redeem";
  cafeName: string;
  cafeAddress: string;
  when: string;
  balanceAfter: number;
};

const MOCK_HISTORY: ActivityEntry[] = [
  {
    id: "1",
    kind: "earn",
    cafeName: "Shoreditch Roasters",
    cafeAddress: "12 Redchurch St, London E2 7DP",
    when: "Today · 08:12",
    balanceAfter: 7,
  },
  {
    id: "2",
    kind: "earn",
    cafeName: "King's Cross Coffee",
    cafeAddress: "45 Caledonian Rd, London N1 9DX",
    when: "Yesterday · 17:40",
    balanceAfter: 6,
  },
  {
    id: "3",
    kind: "redeem",
    cafeName: "Shoreditch Roasters",
    cafeAddress: "12 Redchurch St, London E2 7DP",
    when: "3 days ago · 09:05",
    balanceAfter: 0,
  },
  {
    id: "4",
    kind: "earn",
    cafeName: "Peckham Beans",
    cafeAddress: "22 Rye Lane, London SE15 5BS",
    when: "Last week · 14:22",
    balanceAfter: 10,
  },
  {
    id: "5",
    kind: "earn",
    cafeName: "Brighton Lanes",
    cafeAddress: "8 Meeting House Ln, Brighton BN1 1HB",
    when: "2 weeks ago · 10:55",
    balanceAfter: 9,
  },
];

export function HistoryScreen() {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="pt-2">
        <Text
          className="text-[11px] font-semibold uppercase"
          style={{ color: COLOR.textDim, letterSpacing: 2 }}
        >
          Activity
        </Text>
        <Text
          className="mt-2 text-[26px] font-semibold"
          style={{ color: COLOR.text, letterSpacing: -0.5 }}
        >
          Your coffee history
        </Text>
        <Text
          className="mt-1.5 text-sm leading-5"
          style={{ color: COLOR.textMuted }}
        >
          Every scan and redemption, in order.
        </Text>
      </View>

      <View
        className="mt-6 rounded-3xl"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
        }}
      >
        {MOCK_HISTORY.map((entry, i) => (
          <ActivityRow
            key={entry.id}
            entry={entry}
            isLast={i === MOCK_HISTORY.length - 1}
          />
        ))}
      </View>

      <View
        className="mt-5 rounded-2xl px-4 py-3"
        style={{
          backgroundColor: "rgba(228,185,127,0.06)",
          borderWidth: 1,
          borderColor: "rgba(228,185,127,0.15)",
        }}
      >
        <Text
          className="text-[12px] leading-4"
          style={{ color: COLOR.textMuted }}
        >
          Tip: older activity is preserved forever. Our ledger is append-only —
          nothing gets quietly deleted.
        </Text>
      </View>
    </ScrollView>
  );
}

function ActivityRow({
  entry,
  isLast,
}: {
  entry: ActivityEntry;
  isLast: boolean;
}) {
  const isRedeem = entry.kind === "redeem";
  const Icon = isRedeem ? Gift : Coffee;
  const tint = isRedeem ? "rgba(74,222,128,0.12)" : "rgba(228,185,127,0.1)";
  const tintBorder = isRedeem
    ? "rgba(74,222,128,0.22)"
    : "rgba(228,185,127,0.2)";
  const iconColor = isRedeem ? COLOR.live : COLOR.accent;
  const title = isRedeem
    ? "Redeemed 1 Free Drink"
    : "Earned 1 stamp";

  return (
    <View
      className="flex-row p-4"
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: COLOR.border,
      }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tint,
          borderWidth: 1,
          borderColor: tintBorder,
        }}
      >
        <Icon size={18} color={iconColor} strokeWidth={2} />
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className="text-[15px] font-semibold"
            style={{ color: COLOR.text, letterSpacing: -0.1 }}
          >
            {title}
          </Text>
          <Text className="text-[11px]" style={{ color: COLOR.textDim }}>
            {entry.when}
          </Text>
        </View>
        <View className="mt-1 flex-row items-center">
          <MapPin size={12} color={COLOR.textDim} strokeWidth={2} />
          <Text
            className="ml-1 text-[12px]"
            style={{ color: COLOR.textMuted }}
            numberOfLines={1}
          >
            {entry.cafeName} · {entry.cafeAddress}
          </Text>
        </View>
        <Text
          className="mt-1.5 text-[11px] font-semibold uppercase"
          style={{ color: COLOR.textFaint, letterSpacing: 1 }}
        >
          Balance after · {entry.balanceAfter}/10
        </Text>
      </View>
    </View>
  );
}

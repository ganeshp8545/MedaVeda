import React, { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SHADOW } from "../theme/shadows";

type TabKey = "Home" | "MyPurchases" | "Store" | "Downloads" | "Profile";

// "Store" is the centre tab - its screen route is still called "Store"
// (the Buy Notes marketplace), but it's presented to the student as
// "Notes", raised above the bar in a hexagon exactly like the reference
// footer.
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "Home", label: "Home", icon: "🏠" },
  { key: "MyPurchases", label: "Purchases", icon: "🧾" },
  { key: "Store", label: "Notes", icon: "🛍️" },
  { key: "Downloads", label: "Downloads", icon: "📥" },
  { key: "Profile", label: "Profile", icon: "👤" },
];

type Props = {
  active: TabKey;
};

function TabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.82, friction: 4, tension: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity style={styles.tab} onPress={handlePress} activeOpacity={0.8}>
      <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
        <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
          <Text style={styles.icon}>{tab.icon}</Text>
        </View>
        <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Centre "Notes" tab - a hexagon (built from plain Views, same
// no-new-native-dependency approach as ProgressRing/gradient.ts) that
// floats above the bar with a soft accent glow, matching the reference
// screenshot's raised hex icon. No text label, same as the reference.
function HexTabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.85, friction: 4, tension: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity style={styles.tab} onPress={handlePress} activeOpacity={0.85}>
      <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
        <View style={styles.hexHalo} />
        <View style={styles.hexWrap}>
          <View
            style={[
              styles.hexTopTriangle,
              isActive && styles.hexTopTriangleActive,
            ]}
          />
          <View style={[styles.hexMiddle, isActive && styles.hexMiddleActive]}>
            <Text style={styles.hexIcon}>{tab.icon}</Text>
          </View>
          <View
            style={[
              styles.hexBottomTriangle,
              isActive && styles.hexBottomTriangleActive,
            ]}
          />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Lightweight custom tab bar rendered inline by screens (rather than a
// react-navigation Tab.Navigator) so it can be dropped onto the existing
// Stack-based navigation without restructuring AppNavigator.
export default function BottomNav({ active }: Props) {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.bar}>
      {TABS.map((tab) =>
        tab.key === "Store" ? (
          <HexTabButton
            key={tab.key}
            tab={tab}
            isActive={active === tab.key}
            onPress={() => {
              if (active !== tab.key) navigation.navigate(tab.key);
            }}
          />
        ) : (
          <TabButton
            key={tab.key}
            tab={tab}
            isActive={active === tab.key}
            onPress={() => {
              if (active !== tab.key) navigation.navigate(tab.key);
            }}
          />
        )
      )}
    </View>
  );
}

const HEX_WIDTH = 52;
const HEX_TRIANGLE = 15;
const HEX_MIDDLE_HEIGHT = 28;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingBottom: 22,
    ...SHADOW.raised,
  },
  tab: {
    flex: 1,
    alignItems: "center",
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapActive: {
    backgroundColor: `${COLORS.accent}26`,
  },
  icon: {
    fontSize: 17,
  },
  label: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },
  labelActive: {
    color: COLORS.accent,
    fontWeight: "700",
  },

  // Soft radial glow sitting behind the hexagon, echoing the reference
  // screenshot's halo around its centre icon.
  hexHalo: {
    position: "absolute",
    top: -34,
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: `${COLORS.accent}22`,
  },

  // Pulled up with a negative margin so it floats above the bar's top
  // edge, same as the reference footer's centre icon.
  hexWrap: {
    alignItems: "center",
    marginTop: -34,
  },
  hexTopTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: HEX_WIDTH / 2,
    borderRightWidth: HEX_WIDTH / 2,
    borderBottomWidth: HEX_TRIANGLE,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: COLORS.primary,
  },
  hexTopTriangleActive: {
    borderBottomColor: COLORS.accent,
  },
  hexMiddle: {
    width: HEX_WIDTH,
    height: HEX_MIDDLE_HEIGHT,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.glow,
  },
  hexMiddleActive: {
    backgroundColor: COLORS.accent,
  },
  hexBottomTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: HEX_WIDTH / 2,
    borderRightWidth: HEX_WIDTH / 2,
    borderTopWidth: HEX_TRIANGLE,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: COLORS.primary,
  },
  hexBottomTriangleActive: {
    borderTopColor: COLORS.accent,
  },
  hexIcon: {
    fontSize: 20,
  },
});

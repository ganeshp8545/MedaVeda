import React, { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SHADOW } from "../theme/shadows";

type TabKey = "Home" | "Search" | "Store" | "Profile";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "Home", label: "Home", icon: "🏠" },
  { key: "Search", label: "Search", icon: "🔍" },
  { key: "Store", label: "Store", icon: "🛍️" },
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

// Lightweight custom tab bar rendered inline by screens (rather than a
// react-navigation Tab.Navigator) so it can be dropped onto the existing
// Stack-based navigation without restructuring AppNavigator.
export default function BottomNav({ active }: Props) {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => (
        <TabButton
          key={tab.key}
          tab={tab}
          isActive={active === tab.key}
          onPress={() => {
            if (active !== tab.key) navigation.navigate(tab.key);
          }}
        />
      ))}
    </View>
  );
}

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
});

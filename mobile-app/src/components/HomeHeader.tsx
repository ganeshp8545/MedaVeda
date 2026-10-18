import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../theme/colors";
import { SPACING } from "../theme/spacing";
import GradientBackground from "./GradientBackground";
import NotificationBell from "./NotificationBell";
import SideDrawer from "./SideDrawer";
import BrandLogo from "./BrandLogo";

type Props = {
  unreadNotificationCount?: number;
};

// Redesigned per the latest layout request:
//   - Left: a 3-line (hamburger) icon that opens the side drawer menu,
//     followed by the app name - no more Settings/Profile icon pair, no
//     greeting message, no email address.
//   - Right: a search icon (opens the Search screen) sitting right next
//     to the notification bell - the search bar row that used to live
//     below this row is gone.
export default function HomeHeader({ unreadNotificationCount = 0 }: Props) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  // Reserve the actual widths of the menu and action buttons, plus an 8pt gap.
  const logoWidth = Math.max(0, Math.min(160, width - (compact ? 24 + 41 + 126 + 8 : 40 + 50 + 152 + 8)));
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Entrance: header content eases up + fades in on mount - kept from
  // the previous header for a consistent first-load feel.
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <View style={styles.header}>
      <GradientBackground
        colors={[COLORS.primaryDark, COLORS.primary, COLORS.secondary]}
        direction="diagonal"
      />

      <Animated.View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 12,
            paddingHorizontal: compact ? 12 : SPACING.lg,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >

        <View style={styles.topRow}>
          <View style={styles.left}>
            <TouchableOpacity
              style={[styles.menuButton, compact && styles.compactButton]}
              onPress={() => setDrawerVisible(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
            >
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>

            <BrandLogo size={compact ? 38 : 40} variant="header" maxWidth={logoWidth} />
          </View>

          <View style={styles.right}>
            <TouchableOpacity
              style={[styles.searchButton, compact && styles.compactSearchButton]}
              onPress={() => navigation.navigate("Search")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Text style={styles.searchIcon}>🔍</Text>
            </TouchableOpacity>

            <NotificationBell
              count={unreadNotificationCount}
              onPress={() => navigation.navigate("Notifications")}
            />

            <TouchableOpacity
              style={[styles.settingsButton, compact && styles.compactSettingsButton]}
              onPress={() => navigation.navigate("Settings")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.primaryDark,
  },

  content: {
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },

  right: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },

  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.sm,
  },

  menuIcon: {
    fontSize: 18,
    color: COLORS.white,
  },

  compactButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: SPACING.xs,
  },

  compactSearchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: SPACING.xs,
  },

  compactSettingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: SPACING.xs,
  },

  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.sm,
  },

  searchIcon: {
    fontSize: 18,
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: SPACING.sm,
  },

  settingsIcon: {
    fontSize: 18,
  },
});

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import GradientBackground from "./GradientBackground";
import NotificationBell from "./NotificationBell";
import SideDrawer from "./SideDrawer";

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
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >

        <View style={styles.topRow}>
          <View style={styles.left}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setDrawerVisible(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
            >
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>

            <Text style={styles.brand}>MedVeda</Text>
          </View>

          <View style={styles.right}>
            <TouchableOpacity
              style={styles.searchButton}
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
              style={styles.settingsButton}
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
  },

  right: {
    flexDirection: "row",
    alignItems: "center",
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

  brand: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    letterSpacing: 1,
    color: COLORS.white,
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

import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  Alert,
  Share,
  Linking,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { supabase } from "../config/supabase";
import { getCurrentUser, getCurrentUserDisplayName } from "../services/authState";

// Real brand glyphs for the "Follow us" row (Instagram/Facebook/YouTube/
// Telegram/WhatsApp icons, not emoji lookalikes). `@expo/vector-icons`
// ships bundled with every Expo project already - no extra install
// needed.
import { FontAwesome } from "@expo/vector-icons";

import ConfirmationDialog from "./ConfirmationDialog";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

import { fetchUserProfile, UserProfile } from "../services/usersService";

const PANEL_WIDTH = Math.min(300, Dimensions.get("window").width * 0.8);

// Facebook isn't live yet - kept as `null` so the icon still shows
// (consistent row) but tapping surfaces a "Coming Soon" message instead
// of a dead link. Fill in the real URL here once that account is
// created.
const SOCIAL_LINKS: Record<string, string | null> = {
  instagram: "https://www.instagram.com/_ashwiniii.21?igsh=Ym02c3NlOHZlbms1",
  facebook: null,
  youtube: "https://youtube.com/@thedisturbingmedico?si=ZKSurB8bCVvLK42U",
  telegram: "https://t.me/medveda_26",
  whatsapp: "https://wa.me/917620616068",
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Opened from the hamburger icon in HomeHeader. Layout modeled on the
// reference screenshot: logo/avatar + name up top, a flat list of menu
// rows, "Follow us" social icons pinned at the bottom.
export default function SideDrawer({ visible, onClose }: Props) {
  const navigation = useNavigation<any>();

  // Kept true a little longer than `visible` so the slide-out animation
  // gets to finish before the Modal actually unmounts.
  const [modalVisible, setModalVisible] = useState(visible);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  const translateX = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const user = getCurrentUser();
  const displayName =
    profile?.name ||
    getCurrentUserDisplayName() ||
    (user?.email ? user.email.split("@")[0] : "Student");

  useEffect(() => {
    if (visible) {
      setModalVisible(true);

      if (user) {
        fetchUserProfile(user.id)
          .then(setProfile)
          .catch((err) => console.error("Failed to load profile:", err));
      }

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -PANEL_WIDTH,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setModalVisible(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function goTo(screen: string) {
    onClose();
    navigation.navigate(screen);
  }

  async function handleShare() {
    onClose();
    try {
      await Share.share({
        message:
          "Download MedVeda - The Ultimate BAMS Study App.\n\nhttps://play.google.com/store/apps/details?id=com.ayurpulse.app",
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function confirmLogout() {
    setLogoutDialogVisible(false);
    onClose();
    try {
      await supabase.auth.signOut();
      navigation.replace("Login");
    } catch (error) {
      console.error("Logout failed:", error);
      Alert.alert("Logout Failed", "Please try again.");
    }
  }

  async function openSocial(url: string | null) {
    if (!url) {
      Alert.alert("Coming Soon", "We'll be live here soon. Stay tuned!");
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Could not open the link.");
      }
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.profileBlock}>
              <View style={styles.logoBox}>
                <Text style={styles.logoText}>
                  {displayName ? displayName.charAt(0).toUpperCase() : "?"}
                </Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
            </View>

            <View style={styles.divider} />

            <DrawerRow icon="🏠" label="Home" onPress={() => goTo("Home")} />
            <DrawerRow icon="📥" label="Downloads" onPress={() => goTo("Downloads")} />
            <DrawerRow icon="🧾" label="Purchases" onPress={() => goTo("MyPurchases")} />
            <DrawerRow icon="⚙️" label="Settings" onPress={() => goTo("Settings")} />
            <DrawerRow icon="📞" label="Contact Us" onPress={() => goTo("Contact")} />
            <DrawerRow icon="📤" label="Share" onPress={handleShare} />
            <DrawerRow icon="🚪" label="Logout" onPress={() => setLogoutDialogVisible(true)} />
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.divider} />
            <Text style={styles.followLabel}>Follow us</Text>
            <View style={styles.socialRow}>
              <SocialButton
                icon="instagram"
                color="#E1306C"
                onPress={() => openSocial(SOCIAL_LINKS.instagram)}
              />
              <SocialButton
                icon="facebook"
                color="#1877F2"
                onPress={() => openSocial(SOCIAL_LINKS.facebook)}
              />
              <SocialButton
                icon="youtube-play"
                color="#FF0000"
                onPress={() => openSocial(SOCIAL_LINKS.youtube)}
              />
              <SocialButton
                icon="telegram"
                color="#29A9EA"
                onPress={() => openSocial(SOCIAL_LINKS.telegram)}
              />
              <SocialButton
                icon="whatsapp"
                color="#25D366"
                onPress={() => openSocial(SOCIAL_LINKS.whatsapp)}
              />
            </View>
          </View>
        </Animated.View>
      </View>

      <ConfirmationDialog
        visible={logoutDialogVisible}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        destructive
        onConfirm={confirmLogout}
        onCancel={() => setLogoutDialogVisible(false)}
      />
    </Modal>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={onPress}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SocialButton({
  icon,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.socialButton} activeOpacity={0.8} onPress={onPress}>
      <FontAwesome name={icon} size={18} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: COLORS.card,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    ...SHADOW.raised,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },

  profileBlock: {
    alignItems: "flex-start",
    marginBottom: SPACING.lg,
  },

  logoBox: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.sm,
    ...SHADOW.glow,
  },

  logoText: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textOnPrimary,
  },

  name: {
    fontSize: FONT.heading,
    fontWeight: "700",
    color: COLORS.text,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
  },

  rowIcon: {
    fontSize: 20,
    width: 32,
  },

  rowLabel: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.text,
  },

  footer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },

  followLabel: {
    textAlign: "center",
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.subtitle,
    marginBottom: SPACING.md,
  },

  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
  },

  socialButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});

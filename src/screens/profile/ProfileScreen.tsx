import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
} from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";

import { useFocusEffect, useNavigation } from "@react-navigation/native";

import ProfileAvatar from "../../components/ProfileAvatar";
import ProfileMenuCard from "../../components/ProfileMenuCard";
import StatCard from "../../components/StatCard";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import BottomNav from "../../components/BottomNav";
import useQuizStats from "../../hooks/useQuizStats";

import { supabase } from "../../config/supabase";
import { getCurrentUser } from "../../services/authState";
import { fetchUserProfile, UserProfile } from "../../services/usersService";
import { fetchReferralSettings } from "../../services/referralsService";
import { SPACING } from "../../theme/spacing";

export default function ProfileScreen() {
  const navigation = useNavigation<any>();

  const user = getCurrentUser();

  const stats = useQuizStats();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  // The Refer & Earn entry is hidden unless the program is switched on.
  const [referralsEnabled, setReferralsEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchUserProfile(user.id)
        .then(setProfile)
        .catch((err) => console.error("Failed to load profile:", err));
      fetchReferralSettings()
        .then((s) => setReferralsEnabled(!!s?.enabled))
        .catch(() => setReferralsEnabled(false));
    }, [user])
  );

  const confirmLogout = async () => {
    setLogoutDialogVisible(false);

    try {
      await supabase.auth.signOut();
      navigation.replace("Login");
    } catch (error) {
      console.error("Logout failed:", error);
      Alert.alert("Logout Failed", "Please try again.");
    }
  };

  // Same message/link as the "Share App" option in Settings, so both
  // entry points share one identical invite message.
  const handleShare = async () => {
    try {
      await Share.share({
        message:
          "Download MedVeda - The Ultimate BAMS Study App.\n\nhttps://play.google.com/store/apps/details?id=com.ayurpulse.app",
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ProfileAvatar
          name={profile?.name || user?.email || "User"}
        />

        <Text style={styles.email}>
          {user?.email}
        </Text>

        {!!profile?.courseTitle && (
          <View style={styles.detailsBlock}>
            <Text style={styles.detailText}>
              🎓 {profile.courseTitle}
              {profile.yearTitle ? ` · ${profile.yearTitle}` : ""}
            </Text>
          </View>
        )}

        {!!profile?.mobile && (
          <View style={styles.detailsBlock}>
            <Text style={styles.detailText}>📱 {profile.mobile}</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <StatCard
          title="Attempts"
          value={stats.totalAttempts.toString()}
          />

          <StatCard
            title="Best Score"
            value={`${stats.bestScore}%`}
          />
        </View>

        <ProfileMenuCard
          icon="🎓"
          title="Change Course / Year"
          onPress={() => navigation.navigate("SelectCourseYear", { mode: "change" })}
        />

        {referralsEnabled && (
          <ProfileMenuCard
            icon="🎁"
            title="Refer & Earn"
            onPress={() => navigation.navigate("Referral")}
          />
        )}

        <ProfileMenuCard
          icon="🧾"
          title="My Purchases"
          onPress={() => navigation.navigate("MyPurchases")}
        />

        <ProfileMenuCard
          icon="📥"
          title="My Downloads"
          onPress={() => navigation.navigate("Downloads")}
        />

        <ProfileMenuCard
          icon="🔐"
          title="Change Password"
          onPress={() => navigation.navigate("ChangePassword")}
        />

        <ProfileMenuCard
          icon="ℹ️"
          title="About App"
          onPress={() => navigation.navigate("About")}
        />

        <ProfileMenuCard
          icon="📞"
          title="Contact Us"
          onPress={() =>
            Alert.alert(
              "Email",
              "medvedaforu@gmail.com"
            )
          }
        />

        <ProfileMenuCard
          icon="✏️"
          title="Edit Profile"
          onPress={() => navigation.navigate("EditProfile")}
          />

        <ProfileMenuCard
          icon="📤"
          title="Share App"
          onPress={handleShare}
        />

        <ProfileMenuCard
          icon="🚪"
          title="Logout"
          onPress={() => setLogoutDialogVisible(true)}
        />

        <ConfirmationDialog
          visible={logoutDialogVisible}
          title="Logout"
          message="Are you sure you want to logout?"
          confirmLabel="Logout"
          destructive
          onConfirm={confirmLogout}
          onCancel={() => setLogoutDialogVisible(false)}
        />
      </ScrollView>

      <BottomNav active="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Bug fix: this used to be applied via the ScrollView's `style` prop
  // instead of `contentContainerStyle`. Padding on `style` doesn't
  // reliably reserve scrollable space at the bottom - the last item
  // (Logout) ended up flush against, or clipped by, the screen edge /
  // device gesture bar, making it invisible or untappable on many
  // phones. `contentContainerStyle` fixes this and also adds bottom
  // breathing room so Logout is never hidden.
  content: {
    padding: SPACING.lg,
    paddingTop: 60,
    paddingBottom: 40,
  },

  email: {
    textAlign: "center",
    marginBottom: 25,
    color: COLORS.subtitle,
    fontSize: 16,
  },

  detailsBlock: {
    alignItems: "center",
    marginTop: -15,
    marginBottom: 25,
  },

  detailText: {
    color: COLORS.subtitle,
    fontSize: FONT.small,
    marginBottom: 4,
  },

  statsRow: {
    flexDirection: "row",
    marginBottom: 25,
  },
});
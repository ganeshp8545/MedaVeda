import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";

import { signOut } from "firebase/auth";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import ProfileAvatar from "../../components/ProfileAvatar";
import ProfileMenuCard from "../../components/ProfileMenuCard";
import StatCard from "../../components/StatCard";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import useQuizStats from "../../hooks/useQuizStats";

import { auth } from "../../config/firebase";
import { fetchUserProfile, UserProfile } from "../../services/usersService";

export default function ProfileScreen() {
  const navigation = useNavigation<any>();

  const user = auth.currentUser;

  const stats = useQuizStats();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchUserProfile(user.uid)
        .then(setProfile)
        .catch((err) => console.error("Failed to load profile:", err));
    }, [user])
  );

  const confirmLogout = async () => {
    setLogoutDialogVisible(false);

    try {
      await signOut(auth);
      navigation.replace("Login");
    } catch (error) {
      console.error("Logout failed:", error);
      Alert.alert("Logout Failed", "Please try again.");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <ProfileAvatar
        name={profile?.name || user?.email || "User"}
      />

      <Text style={styles.email}>
        {user?.email}
      </Text>

      {(profile?.mobile || profile?.college) && (
        <View style={styles.detailsBlock}>
          {!!profile?.mobile && (
            <Text style={styles.detailText}>📱 {profile.mobile}</Text>
          )}
          {!!profile?.college && (
            <Text style={styles.detailText}>🎓 {profile.college}</Text>
          )}
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
        icon="🧾"
        title="My Purchases"
        onPress={() => navigation.navigate("MyPurchases")}
      />

      <ProfileMenuCard
        icon="🔐"
        title="Change Password"
        onPress={() =>
          Alert.alert("Coming Soon")
        }
      />

      <ProfileMenuCard
        icon="ℹ️"
        title="About App"
        onPress={() =>
          Alert.alert(
            "AyurPulse",
            "Version 1.0"
          )
        }
      />

      <ProfileMenuCard
        icon="📞"
        title="Contact Us"
        onPress={() =>
          Alert.alert(
            "Email",
            "support@ayurpulse.com"
          )
        }
      />

      <ProfileMenuCard
        icon="✏️"
        title="Edit Profile"
        onPress={() => navigation.navigate("EditProfile")}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
    paddingTop: 60,
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
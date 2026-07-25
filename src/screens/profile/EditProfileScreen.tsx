import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";

import { useNavigation } from "@react-navigation/native";

import { supabase } from "../../config/supabase";
import { getCurrentUser } from "../../services/authState";
import { fetchUserProfile, updateUserProfile } from "../../services/usersService";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { SPACING } from "../../theme/spacing";

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();

  const user = getCurrentUser();

  const [name, setName] = useState(user?.user_metadata?.name || "");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchUserProfile(user.id)
      .then((profile) => {
        if (profile) {
          if (profile.name) setName(profile.name);
          if (profile.mobile) setMobile(profile.mobile);
        }
      })
      .catch((err) => console.error("Failed to load profile:", err))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      await supabase.auth.updateUser({
        data: { name },
      });

      await updateUserProfile(user.id, {
        name,
        mobile: mobile || undefined,
      });

      Alert.alert("Success", "Profile updated successfully.");

      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Edit Profile</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        placeholderTextColor={COLORS.subtitle}
        value={name}
        onChangeText={setName}
      />

      <TextInput
        style={styles.input}
        placeholder="Mobile Number"
        placeholderTextColor={COLORS.subtitle}
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
      />

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.buttonText}>
            Save
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    justifyContent: "center",
  },

  centered: {
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.xl,
    textAlign: "center",
  },

  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: RADIUS.md,
    padding: 16,
    fontSize: 18,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    ...SHADOW.glow,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: COLORS.textOnPrimary,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
});

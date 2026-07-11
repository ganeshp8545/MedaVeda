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

import { updateProfile } from "firebase/auth";
import { useNavigation } from "@react-navigation/native";

import { auth } from "../../config/firebase";
import { fetchUserProfile, updateUserProfile } from "../../services/usersService";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();

  const user = auth.currentUser;

  const [name, setName] = useState(user?.displayName || "");
  const [mobile, setMobile] = useState("");
  const [college, setCollege] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchUserProfile(user.uid)
      .then((profile) => {
        if (profile) {
          if (profile.name) setName(profile.name);
          if (profile.mobile) setMobile(profile.mobile);
          if (profile.college) setCollege(profile.college);
        }
      })
      .catch((err) => console.error("Failed to load profile:", err))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      await updateProfile(user, {
        displayName: name,
      });

      await updateUserProfile(user.uid, {
        name,
        mobile: mobile || undefined,
        college: college || undefined,
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

      <TextInput
        style={styles.input}
        placeholder="College"
        placeholderTextColor={COLORS.subtitle}
        value={college}
        onChangeText={setCollege}
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
    padding: 20,
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
    marginBottom: 30,
    textAlign: "center",
  },

  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: RADIUS.md,
    padding: 16,
    fontSize: 18,
    marginBottom: 20,
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

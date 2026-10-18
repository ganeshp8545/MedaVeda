import React from "react";
import { View, Text, StyleSheet, Linking, Alert } from "react-native";

import CustomButton from "../../components/CustomButton";

import { COLORS } from "../../theme/colors";
import { SPACING } from "../../theme/spacing";
import BrandLogo from "../../components/BrandLogo";

// Blocking screen shown when the installed build is older than the admin-set
// min_app_version. Deliberately has no way past it.
export default function UpdateRequiredScreen({ storeUrl }: { storeUrl: string }) {
  const openStore = () => {
    Linking.openURL(storeUrl).catch(() =>
      Alert.alert("Could not open the store", "Please update MedVeda from the Google Play Store.")
    );
  };

  return (
    <View style={styles.container}>
      <BrandLogo size={88} accessibilityLabel="MedVeda logo" />
      <Text style={styles.title}>Update required</Text>
      <Text style={styles.message}>
        A newer version of MedVeda is available and this version is no longer supported.
        Please update to continue learning.
      </Text>
      <View style={styles.button}>
        <CustomButton title="Update now" onPress={openStore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  message: {
    fontSize: 16,
    color: COLORS.subtitle,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
  button: { alignSelf: "stretch", marginTop: SPACING.lg },
});

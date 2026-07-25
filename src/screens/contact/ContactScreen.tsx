import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { FontAwesome } from "@expo/vector-icons";

import CustomInput from "../../components/CustomInput";
import CustomButton from "../../components/CustomButton";

import { contactSchema, ContactFormValues } from "../../validation/contactSchema";
import { logError } from "../../utils/logger";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";

const SUPPORT_EMAIL = "medvedaforu@gmail.com";

// Same accounts/links as SideDrawer's "Follow us" row - keep both in sync.
// null = not live yet, tapping shows "Coming Soon" instead of a dead link.
const SOCIAL_LINKS: Record<string, string | null> = {
  instagram: "https://www.instagram.com/_ashwiniii.21?igsh=Ym02c3NlOHZlbms1",
  facebook: null,
  youtube: "https://youtube.com/@thedisturbingmedico?si=ZKSurB8bCVvLK42U",
  telegram: null,
  twitter: null,
};

// This app has no backend mail sender yet (no Resend/SendGrid Edge
// Function set up), so "submitting" the form hands off to the device's
// own email app via a mailto: link, prefilled with the student's Name/
// Email/Message and addressed straight to medvedaforu@gmail.com. The
// student still taps Send in their mail app, but the message is fully
// composed for them - nothing to type twice. If a proper in-app "send
// without leaving the app" flow is wanted later, that needs a Supabase
// Edge Function backed by an email API (Resend etc.) - flagging that as
// a possible next step.
export default function ContactScreen() {
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: yupResolver(contactSchema),
    defaultValues: { name: "", email: "", message: "" },
  });

  const onSubmit = async (data: ContactFormValues) => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const subject = `MedVeda Support - ${data.name}`;
      const body = `${data.message}\n\n---\nFrom: ${data.name}\nEmail: ${data.email}`;
      const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          "No Email App Found",
          `Please email us directly at ${SUPPORT_EMAIL}`
        );
        return;
      }

      await Linking.openURL(url);
      reset();
    } catch (error) {
      logError("Contact form failed to open mail app", error);
      Alert.alert(
        "Something Went Wrong",
        `Please email us directly at ${SUPPORT_EMAIL}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openSocial = async (url: string | null) => {
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
      logError("Failed to open social link", error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>📞 Contact Us</Text>
        <Text style={styles.subtitle}>
          We'd love to hear from you. Send us a message and we'll get back
          to you at {SUPPORT_EMAIL}.
        </Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange } }) => (
            <CustomInput
              placeholder="Name"
              value={value}
              onChangeText={onChange}
              error={errors.name?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange } }) => (
            <CustomInput
              placeholder="Email"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="message"
          render={({ field: { value, onChange } }) => (
            <View style={styles.messageWrap}>
              <TextInput
                style={styles.messageInput}
                placeholder="Message"
                placeholderTextColor={COLORS.subtitle}
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              {errors.message?.message ? (
                <Text style={styles.errorText}>{errors.message.message}</Text>
              ) : null}
            </View>
          )}
        />

        <CustomButton
          title={submitting ? "Opening..." : "SEND"}
          onPress={handleSubmit(onSubmit)}
        />

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
            icon="twitter"
            color="#1DA1F2"
            onPress={() => openSocial(SOCIAL_LINKS.twitter)}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.lg,
    paddingTop: 60,
    paddingBottom: 50,
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },

  subtitle: {
    marginTop: 6,
    marginBottom: SPACING.xl,
    color: COLORS.subtitle,
    fontSize: FONT.body,
  },

  messageWrap: {
    marginBottom: 18,
  },

  messageInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md ?? 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 130,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontSize: 16,
  },

  errorText: {
    color: COLORS.error,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
    fontSize: 13,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
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

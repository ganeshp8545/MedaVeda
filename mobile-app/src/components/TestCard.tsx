import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  title: string;
  questionCount: number;
  onPress: () => void;
  locked?: boolean;
  free?: boolean;
  // OFFLINE MODE - all optional, default to "no download affordance",
  // same pattern as NoteCard so both feel consistent to the student.
  downloaded?: boolean;
  saving?: boolean; // true while the JSON write is in flight (near-instant, but still worth a spinner)
  onDownloadPress?: () => void;
  onRemoveDownloadPress?: () => void;
};

export default function TestCard({
  title,
  questionCount,
  onPress,
  locked = false,
  free = false,
  downloaded = false,
  saving = false,
  onDownloadPress,
  onRemoveDownloadPress,
}: Props) {
  const showDownloadAction = !locked && !!(onDownloadPress || onRemoveDownloadPress);

  return (
    <TouchableOpacity
      style={[styles.card, locked && styles.cardLocked]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.icon}>{locked ? "🔒" : free ? "🎁" : "📝"}</Text>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, locked && styles.titleLocked]}>
            {title}
          </Text>
          {free && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
          )}
        </View>

        <Text style={styles.subtitle}>
          {locked
            ? "Premium - Purchase required to unlock"
            : downloaded
            ? `${questionCount} Questions - Available Offline`
            : `${questionCount} Questions - Tap to Start Test`}
        </Text>
      </View>

      {showDownloadAction && (
        <TouchableOpacity
          style={styles.downloadButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={(e) => {
            e.stopPropagation?.();
            if (downloaded) {
              onRemoveDownloadPress?.();
            } else if (!saving) {
              onDownloadPress?.();
            }
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Text style={styles.downloadIcon}>{downloaded ? "🗑️" : "⬇️"}</Text>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },

  cardLocked: {
    backgroundColor: COLORS.surfaceMuted,
    opacity: 0.85,
  },

  titleLocked: {
    color: COLORS.subtitle,
  },

  icon: {
    fontSize: 30,
    marginRight: SPACING.md,
  },

  content: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  freeBadge: {
    marginLeft: 8,
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  freeBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
  },

  title: {
    fontSize: FONT.body,
    color: COLORS.text,
    fontWeight: "600",
  },

  subtitle: {
    marginTop: SPACING.xs,
    color: COLORS.subtitle,
    fontSize: FONT.small,
  },

  downloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceMuted,
  },

  downloadIcon: {
    fontSize: 18,
  },
});

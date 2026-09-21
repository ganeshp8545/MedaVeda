import { getCourseYear } from "../services/courseState";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";

import { fetchBuyOptionsForChapter, Product } from "../services/productsService";
import usePurchase from "../hooks/usePurchase";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { logError } from "../utils/logger";

type Props = {
  chapterId: string;
  subjectId: string;
  yearId: string;
  subjectTitle?: string;
  yearTitle?: string;
};

const SCOPE_LABEL: Record<string, string> = {
  chapter: "This Chapter",
  subject: "Full Subject",
  year: "Full Year",
  bundle: "Multi-Year Bundle",
};

// Shown on Notes/Videos/Quiz screens for a locked chapter, so a purchase
// can be completed right there instead of having to go back to the
// ChapterDetails hub screen (which has the same options, for the flow
// that still goes through it).
export default function UnlockOptionsPanel({
  chapterId,
  subjectId,
  yearId,
  subjectTitle,
  yearTitle,
}: Props) {
  const [options, setOptions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const { buy, purchasing } = usePurchase();

  useEffect(() => {
    let isMounted = true;

    fetchBuyOptionsForChapter(chapterId, subjectId, yearId, getCourseYear().courseId)
      .then((data) => {
        if (isMounted) setOptions(data);
      })
      .catch((err) => logError("Failed to load buy options:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [chapterId, subjectId, yearId]);

  function scopeLabel(scope: string) {
    if (scope === "subject" && subjectTitle) return `Full Subject: ${subjectTitle}`;
    if (scope === "year" && yearTitle) return `Full Year: ${yearTitle}`;
    return SCOPE_LABEL[scope] ?? scope;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🔒 Unlock Options</Text>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={{ marginVertical: SPACING.md }} />
      ) : options.length === 0 ? (
        <Text style={styles.empty}>No purchase options set up for this chapter yet.</Text>
      ) : (
        options.map((product) => (
          <View key={product.id} style={styles.card}>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{product.title}</Text>
              <Text style={styles.cardScope}>{scopeLabel(product.scope)}</Text>
            </View>

            <Text
              style={styles.price}
              onPress={() => buy(product)}
            >
              ₹{product.price}
            </Text>
          </View>
        ))
      )}

      {purchasing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.lg,
  },
  title: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  empty: {
    color: COLORS.subtitle,
    fontSize: FONT.body,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  cardContent: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },
  cardScope: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },
  price: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.white,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: SPACING.sm,
    borderRadius: 30,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});

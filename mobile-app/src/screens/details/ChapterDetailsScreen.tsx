import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";

import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";

import FeatureCard from "../../components/FeatureCard";
import usePurchases from "../../hooks/usePurchases";
import usePurchase from "../../hooks/usePurchase";

import { fetchBuyOptionsForChapter, Product } from "../../services/productsService";
import { recordChapterView } from "../../utils/recentActivity";
import { getCourseYear } from "../../services/courseState";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { logError } from "../../utils/logger";

export default function ChapterDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const {
    chapterId,
    chapterTitle,
    subjectId,
    subjectTitle,
    yearId,
    yearTitle,
  } = route.params;

  const [buyOptions, setBuyOptions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const { isChapterOwned, refresh: refreshPurchases } = usePurchases();
  const { buy, purchasing } = usePurchase();

  // MedVeda 2.0: only PDF Notes is paid content - Video Lectures and
  // MCQ Quiz are always free, so "unlocked" here only ever gates the
  // Notes purchase panel below, not access to Videos/Quiz.
  const notesUnlocked = isChapterOwned({ id: chapterId, subjectId, yearId });

  useEffect(() => {
    fetchBuyOptionsForChapter(chapterId, subjectId, yearId, getCourseYear().courseId)
      .then(setBuyOptions)
      .catch((err) => logError("Failed to load buy options:", err))
      .finally(() => setLoading(false));
  }, [chapterId, subjectId, yearId]);

  // Powers the Home dashboard's "Continue Learning" / "Recently Viewed"
  // sections - purely local (AsyncStorage), no backend write involved.
  useEffect(() => {
    recordChapterView({
      chapterId,
      chapterTitle,
      subjectId,
      subjectTitle,
      yearId,
      yearTitle,
      courseId: getCourseYear().courseId,
    });
  }, [chapterId]);

  useFocusEffect(
    useCallback(() => {
      refreshPurchases();
    }, [refreshPurchases])
  );

  function goTo(screen: string) {
    navigation.navigate(screen, {
      chapterId,
      chapterTitle,
      subjectId,
      subjectTitle,
      yearId,
      yearTitle,
      unlocked: notesUnlocked,
    });
  }

  const scopeLabel: Record<string, string> = {
    chapter: "This Chapter",
    subject: `Full Subject: ${subjectTitle}`,
    year: `Full Year: ${yearTitle}`,
    bundle: "Multi-Year Bundle",
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      <Text style={styles.subtitle}>
        🎥 Videos & 📝 Quiz are always free · 📚 Notes{" "}
        {notesUnlocked ? "unlocked ✅" : "locked 🔒"}
      </Text>

      <FeatureCard
        title="PDF Notes"
        icon="📚"
        color={COLORS.success}
        onPress={() => goTo("Notes")}
      />

      <FeatureCard
        title="Video Lectures"
        icon="🎥"
        color={COLORS.info}
        onPress={() =>
          navigation.navigate("Videos", { subjectId, subjectTitle, yearId, yearTitle })
        }
      />

      <FeatureCard
        title="MCQ Quiz"
        icon="📝"
        color={COLORS.warning}
        onPress={() =>
          navigation.navigate("QuizTests", { subjectId, subjectTitle, yearId, yearTitle })
        }
      />

      {!notesUnlocked && Platform.OS === "android" && (
        <>
          <Text style={styles.buySectionTitle}>Unlock PDF Notes</Text>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.accent} />
          ) : buyOptions.length === 0 ? (
            <Text style={styles.empty}>
              No purchase options set up for this chapter yet.
            </Text>
          ) : (
            buyOptions.map((product) => (
              <View key={product.id} style={styles.buyCard}>
                <View style={styles.buyCardContent}>
                  <Text style={styles.buyCardTitle}>{product.title}</Text>
                  <Text style={styles.buyCardScope}>
                    {scopeLabel[product.scope] ?? product.scope}
                  </Text>
                </View>

                <Text
                  style={styles.buyCardPrice}
                  onPress={() => buy(product)}
                >
                  ₹{product.price}
                </Text>
              </View>
            ))
          )}
        </>
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    paddingTop: 60,
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },

  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 6,
    marginBottom: SPACING.xl,
  },

  buySectionTitle: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },

  empty: {
    color: COLORS.subtitle,
    fontSize: FONT.body,
  },

  buyCard: {
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

  buyCardContent: {
    flex: 1,
    paddingRight: SPACING.md,
  },

  buyCardTitle: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },

  buyCardScope: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },

  buyCardPrice: {
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

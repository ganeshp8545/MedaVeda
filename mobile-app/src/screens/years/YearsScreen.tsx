import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";

import YearCard from "../../components/YearCard";

import { fetchYears, Year } from "../../services/yearsService";
import useCourseYear from "../../hooks/useCourseYear";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { logError } from "../../utils/logger";

const MODE_LABEL: Record<string, string> = {
  notes: "📚 Notes",
  videos: "🎥 Video Lectures",
  quiz: "📝 MCQ Test",
};

const MODE_SUBTITLE: Record<string, string> = {
  notes: "Select a year to browse notes",
  videos: "Select a year to browse videos",
  quiz: "Select a year to take an MCQ test",
};

export default function YearsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { mode } = route.params;

  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { ready, courseId, yearId: currentYearId } = useCourseYear();

  // Only the student's course is listed. Tapping a year other than their
  // current one is allowed - RLS then shows just what they have purchased
  // there (a bundle/year/subject/chapter pack); changing the year itself
  // is done from Profile.
  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetchYears(courseId)
      .then(setYears)
      .catch((err) => {
        logError("Failed to load years:", err);
        setError("Could not load years. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [ready, courseId]);

  return (
    <View style={styles.container}>
      <Text style={styles.modeLabel}>{MODE_LABEL[mode]}</Text>
      <Text style={styles.title}>Choose Academic Year</Text>
      <Text style={styles.subtitle}>{MODE_SUBTITLE[mode]}</Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: SPACING.xl }} />
      ) : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : (
        <FlatList
          data={years}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xl }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <YearCard
              title={item.title}
              icon={item.icon}
              color={item.color}
              onPress={() =>
                navigation.navigate("Subjects", {
                  yearId: item.id,
                  yearTitle: item.title,
                  mode,
                })
              }
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No academic years added yet.</Text>
          }
          ListFooterComponent={
            years.length > 1 && currentYearId ? (
              <Text style={styles.hint}>
                You&apos;ll see all content for your current year. Other years show only what
                you&apos;ve purchased - change your year from Profile.
              </Text>
            ) : null
          }
        />
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
  modeLabel: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.accent,
    marginBottom: 4,
  },
  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 4,
  },
  hint: {
    marginTop: SPACING.md,
    textAlign: "center",
    color: COLORS.subtitle,
    fontSize: FONT.small,
  },
  empty: {
    marginTop: 50,
    textAlign: "center",
    color: COLORS.subtitle,
    fontSize: 16,
  },
});

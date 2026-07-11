import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";

import YearCard from "../../components/YearCard";

import { fetchYears, Year } from "../../services/yearsService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

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

  useEffect(() => {
    fetchYears()
      .then(setYears)
      .catch((err) => {
        console.error("Failed to load years:", err);
        setError("Could not load years. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

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
  empty: {
    marginTop: 50,
    textAlign: "center",
    color: COLORS.subtitle,
    fontSize: 16,
  },
});

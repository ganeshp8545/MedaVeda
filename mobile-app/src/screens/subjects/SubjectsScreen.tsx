import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";

import SubjectCard from "../../components/SubjectCard";
import SearchBar from "../../components/SearchBar";

import { fetchSubjectsByYear, Subject } from "../../services/subjectsService";
import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { logError } from "../../utils/logger";

export default function SubjectsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { yearId, yearTitle, mode } = route.params;

  const [search, setSearch] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubjectsByYear(yearId)
      .then(setSubjects)
      .catch((err) => logError("Failed to load subjects:", err))
      .finally(() => setLoading(false));
  }, [yearId]);

  const filteredData = subjects.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  const MODE_LABEL: Record<string, string> = {
    notes: "📚 Notes",
    videos: "🎥 Video Lectures",
    quiz: "📝 MCQ Test",
  };

  return (
    <View style={styles.container}>
      {mode && <Text style={styles.modeLabel}>{MODE_LABEL[mode]}</Text>}
      <Text style={styles.title}>{yearTitle}</Text>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search Subject..."
      />

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: SPACING.xl }}
        />
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xl }}
          renderItem={({ item }) => (
            <SubjectCard
              title={item.title}
              onPress={() => {
                const params = {
                  subjectId: item.id,
                  subjectTitle: item.title,
                  yearId: item.yearId,
                  yearTitle: item.yearTitle,
                };

                // Video Lectures and MCQ Quiz are always free and live at
                // the Subject level - skip the Chapters screen entirely
                // for those two and go straight to the content. Notes
                // (and general browsing with no mode) still need a
                // Chapter picked first, since Notes purchase/unlock is
                // chapter-scoped.
                if (mode === "videos") {
                  navigation.navigate("Videos", params);
                  return;
                }

                if (mode === "quiz") {
                  navigation.navigate("QuizTests", params);
                  return;
                }

                navigation.navigate("Chapters", { ...params, mode });
              }}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>🔍 No Subject Found</Text>
          }
          showsVerticalScrollIndicator={false}
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
  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    marginBottom: SPACING.lg,
    color: COLORS.text,
  },
  modeLabel: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.accent,
    marginBottom: 4,
  },
  empty: {
    marginTop: 50,
    textAlign: "center",
    color: COLORS.subtitle,
    fontSize: 16,
  },
});

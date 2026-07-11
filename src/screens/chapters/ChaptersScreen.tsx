import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native";

import ChapterCard from "../../components/ChapterCard";
import SearchBar from "../../components/SearchBar";

import { fetchChaptersBySubject, Chapter } from "../../services/chaptersService";
import usePurchases from "../../hooks/usePurchases";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

export default function ChaptersScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { subjectId, subjectTitle, yearId, yearTitle, mode } = route.params;

  const [search, setSearch] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  const { isChapterOwned, refresh: refreshPurchases } = usePurchases();

  useEffect(() => {
    fetchChaptersBySubject(subjectId)
      .then(setChapters)
      .catch((err) => console.error("Failed to load chapters:", err))
      .finally(() => setLoading(false));
  }, [subjectId]);

  // Ownership can change after a purchase completes in the browser.
  useFocusEffect(
    useCallback(() => {
      refreshPurchases();
    }, [refreshPurchases])
  );

  const filteredData = chapters.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  const MODE_SCREEN: Record<string, string> = {
    notes: "Notes",
    videos: "Videos",
    quiz: "QuizTests",
  };

  const MODE_LABEL: Record<string, string> = {
    notes: "📚 Notes",
    videos: "🎥 Video Lectures",
    quiz: "📝 MCQ Test",
  };

  function openChapter(item: Chapter) {
    const unlocked = isChapterOwned({ id: item.id, subjectId, yearId });

    if (mode) {
      // Direct shortcut from Home (Notes/Video/MCQ) - skip the
      // ChapterDetails hub and go straight to the content, with the buy
      // option now built into that screen itself for locked chapters.
      navigation.navigate(MODE_SCREEN[mode], {
        chapterId: item.id,
        chapterTitle: item.title,
        subjectId,
        yearId,
        unlocked,
      });
      return;
    }

    navigation.navigate("ChapterDetails", {
      chapterId: item.id,
      chapterTitle: item.title,
      subjectId,
      subjectTitle,
      yearId,
      yearTitle,
    });
  }

  return (
    <View style={styles.container}>
      {mode && <Text style={styles.modeLabel}>{MODE_LABEL[mode]}</Text>}
      <Text style={styles.title}>{subjectTitle}</Text>
      <Text style={styles.subtitle}>Chapters</Text>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search Chapter..."
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
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ChapterCard
              title={item.title}
              unlocked={isChapterOwned({
                id: item.id,
                subjectId,
                yearId,
              })}
              onPress={() => openChapter(item)}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>🔍 No Chapters Found</Text>
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
  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },
  modeLabel: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.accent,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  empty: {
    marginTop: 50,
    textAlign: "center",
    color: COLORS.subtitle,
    fontSize: 16,
  },
});

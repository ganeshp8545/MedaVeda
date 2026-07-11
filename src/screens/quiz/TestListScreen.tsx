import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";

import TestCard from "../../components/TestCard";
import EmptyState from "../../components/EmptyState";
import UnlockOptionsPanel from "../../components/UnlockOptionsPanel";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import { fetchQuizTestsByChapter, QuizTest } from "../../services/quizService";

// Business rule: only the first Test (lowest Order) of every chapter is
// free to preview; every Test after that requires the chapter (or its
// subject/year/bundle) to be purchased. Mirrors FREE_PDF_COUNT in
// NotesScreen so Notes and Quiz behave consistently.
const FREE_TEST_COUNT = 1;

export default function TestListScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { chapterId, chapterTitle, subjectId, yearId, unlocked } = route.params;

  const [tests, setTests] = useState<QuizTest[]>([]);
  const [loading, setLoading] = useState(true);

  // Computed from the full, order-sorted list so which Test is "free"
  // never shifts.
  const freeTestIds = new Set(
    tests.slice(0, FREE_TEST_COUNT).map((test) => test.id)
  );

  useEffect(() => {
    let isMounted = true;

    fetchQuizTestsByChapter(chapterId)
      .then((data) => {
        if (isMounted) setTests(data);
      })
      .catch((err) => {
        console.error("Failed to load quiz tests:", err);
        if (isMounted) {
          Alert.alert("Error", "Could not load tests. Please try again.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [chapterId]);

  function handleTestPress(item: QuizTest) {
    const isFree = freeTestIds.has(item.id);

    if (!unlocked && !isFree) {
      Alert.alert(
        "🔒 Locked",
        "This test is part of paid content. Purchase this chapter (or subject/year) to unlock it."
      );
      return;
    }

    navigation.navigate("Quiz", {
      chapterId,
      chapterTitle,
      subjectId,
      yearId,
      test: item,
      // Whether more tests remain locked beyond this one - used to show
      // the "unlock more tests" prompt after finishing a free preview.
      hasMoreLockedTests: !unlocked && tests.length > FREE_TEST_COUNT,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      <Text style={styles.subtitle}>MCQ Tests</Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : (
        <FlatList
          data={tests}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => {
            const isFree = freeTestIds.has(item.id);
            return (
              <TestCard
                title={item.title}
                questionCount={item.questions?.length ?? 0}
                locked={!unlocked && !isFree}
                free={isFree && !unlocked}
                onPress={() => handleTestPress(item)}
              />
            );
          }}
          ListEmptyComponent={<EmptyState title="🔍 No Tests Found" />}
          ListFooterComponent={
            !unlocked ? (
              <UnlockOptionsPanel
                chapterId={chapterId}
                subjectId={subjectId}
                yearId={yearId}
              />
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
  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 6,
    marginBottom: SPACING.lg,
  },
});

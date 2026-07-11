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

import NoteCard from "../../components/NoteCard";
import EmptyState from "../../components/EmptyState";
import SearchBar from "../../components/SearchBar";
import UnlockOptionsPanel from "../../components/UnlockOptionsPanel";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import { fetchNotesByChapter, Note } from "../../services/notesService";

// Business rule (SRS 4 - PDF Notes System): only the first PDF of every
// chapter is free to preview; every PDF after that requires the chapter
// (or its subject/year/bundle) to be purchased.
const FREE_PDF_COUNT = 1;

export default function NotesScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { chapterId, chapterTitle, subjectId, yearId, unlocked } = route.params;

  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Computed from the full, order-sorted list (not the filtered/searched
  // one) so which PDFs are "free" never shifts while the user searches.
  const freeNoteIds = new Set(
    notes.slice(0, FREE_PDF_COUNT).map((note) => note.id)
  );

  useEffect(() => {
    let isMounted = true;

    fetchNotesByChapter(chapterId)
      .then((data) => {
        if (isMounted) setNotes(data);
      })
      .catch((err) => {
        console.error("Failed to load notes:", err);
        if (isMounted) {
          Alert.alert("Error", "Could not load notes. Please try again.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [chapterId]);

  const filteredData = notes.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  function handleNotePress(item: Note) {
    const isFree = freeNoteIds.has(item.id);

    if (!unlocked && !isFree) {
      Alert.alert(
        "🔒 Locked",
        "This note is part of paid content. Purchase this chapter (or subject/year) to unlock it."
      );
      return;
    }

    navigation.navigate("PdfViewer", { pdfUrl: item.pdfUrl });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      <Text style={styles.subtitle}>Study Notes</Text>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search Notes..."
      />

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => {
            const isFree = freeNoteIds.has(item.id);
            return (
              <NoteCard
                title={item.title}
                locked={!unlocked && !isFree}
                free={isFree && !unlocked}
                onPress={() => handleNotePress(item)}
              />
            );
          }}
          ListEmptyComponent={<EmptyState title="🔍 No Notes Found" />}
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


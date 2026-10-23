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
import { getSecureNoteUrl } from "../../services/secureNotesService";
import useDownloads from "../../hooks/useDownloads";
import { logError } from "../../utils/logger";

// Business rule (SRS 4 - PDF Notes System): only the first PDF of every
// chapter is free to preview; every PDF after that requires the chapter
// (or its subject/year/bundle) to be purchased.
const FREE_PDF_COUNT = 1;

export default function NotesScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { chapterId, chapterTitle, subjectId, subjectTitle, yearId, yearTitle, unlocked } =
    route.params;

  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks which note is currently having a signed URL resolved, so we
  // can show a brief spinner instead of a UI that looks unresponsive
  // while createSignedUrl() round-trips to Supabase.
  const [resolvingNoteId, setResolvingNoteId] = useState<string | null>(null);

  // OFFLINE MODE - new SQLite-backed hook. isDownloaded/isDownloading and
  // per-item progress are now derived from getItem(id) instead of the
  // old separate progressByNoteId map, since a single downloads table
  // row already carries status + bytesWritten/fileSizeBytes.
  const { isDownloaded, getItem, start, remove: removeDownload } = useDownloads();

  function isDownloading(noteId: string): boolean {
    const item = getItem(noteId);
    return item?.status === "downloading" || item?.status === "paused";
  }

  function downloadProgressFor(noteId: string): number {
    const item = getItem(noteId);
    if (!item || item.fileSizeBytes <= 0) return 0;
    return Math.min(1, item.bytesWritten / item.fileSizeBytes);
  }

  // Computed from the full, order-sorted list (not the filtered/searched
  // one) so which PDFs are "free" never shifts while the user searches.
  // The server flag (notes.is_free_preview) decides; the first-N fallback only
  // applies to a database that predates the flag. Display hint only - the
  // get-note-url Edge Function is what actually enforces access.
  const hasPreviewFlag = notes.some((note) => note.isFreePreview !== undefined);
  const freeNoteIds = new Set(
    hasPreviewFlag
      ? notes.filter((note) => note.isFreePreview).map((note) => note.id)
      : notes.slice(0, FREE_PDF_COUNT).map((note) => note.id)
  );

  useEffect(() => {
    let isMounted = true;

    fetchNotesByChapter(chapterId)
      .then((data) => {
        if (isMounted) setNotes(data);
      })
      .catch((err) => {
        logError("Failed to load notes:", err);
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
    `${item.title} ${item.description ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  async function handleNotePress(item: Note) {
    const isFree = freeNoteIds.has(item.id);

    if (!unlocked && !isFree) {
      Alert.alert(
        "🔒 Locked",
        "This note is part of paid content. Purchase this chapter (or subject/year) to unlock it."
      );
      return;
    }

    // Offline-first: if this note was downloaded, open the local copy so
    // it reads without any network at all - no signed URL needed, the
    // bytes are already on-device.
    const downloaded = getItem(item.id);
    if (downloaded?.status === "completed" && downloaded.localUri) {
      navigation.navigate("PdfViewer", { pdfUrl: downloaded.localUri });
      return;
    }

    // Not downloaded - resolve a fresh, short-lived signed URL rather
    // than using item.pdfUrl directly (that stored URL only worked while
    // the "notes" bucket was public - see secureNotesService.ts).
    setResolvingNoteId(item.id);
    try {
      const signedUrl = await getSecureNoteUrl(item.id);
      navigation.navigate("PdfViewer", { pdfUrl: signedUrl });
    } catch (err) {
      logError("Failed to resolve note URL:", err);
      Alert.alert(
        "Couldn't open note",
        "This note isn't available right now. Please try again, or contact support if this continues."
      );
    } finally {
      setResolvingNoteId(null);
    }
  }

  async function handleDownloadPress(item: Note) {
    setResolvingNoteId(item.id);
    try {
      await start({
        id: item.id,
        contentType: "note",
        title: item.title,
        sourceUrl: "", // The manager requests fresh authorization for every transfer.
        chapterId,
        chapterTitle,
        subjectId,
        subjectTitle,
        yearId,
        yearTitle,
      });
    } catch (err) {
      logError("Failed to start download:", err);
      Alert.alert(
        "Couldn't download note",
        "This note isn't available right now. Please try again, or contact support if this continues."
      );
    } finally {
      setResolvingNoteId(null);
    }
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
          contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: SPACING.xl }}
          renderItem={({ item }) => {
            const isFree = freeNoteIds.has(item.id);
            const accessible = unlocked || isFree;

            return (
              <NoteCard
                title={item.title}
                description={item.description}
                locked={!unlocked && !isFree}
                free={isFree && !unlocked}
                onPress={() => handleNotePress(item)}
                opening={resolvingNoteId === item.id}
                downloaded={accessible && isDownloaded(item.id)}
                downloading={accessible && isDownloading(item.id)}
                downloadProgress={downloadProgressFor(item.id)}
                onDownloadPress={accessible ? () => handleDownloadPress(item) : undefined}
                onRemoveDownloadPress={accessible ? () => removeDownload(item.id) : undefined}
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

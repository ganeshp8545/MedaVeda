import React, { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import EmptyState from "../../components/EmptyState";
import { OFFLINE_DB_SUPPORTED } from "../../config/database";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import BottomNav from "../../components/BottomNav";

import useDownloads from "../../hooks/useDownloads";
import useNetworkStatus from "../../hooks/useNetworkStatus";
import { DownloadItem } from "../../types/offline";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

// OFFLINE MODE - full download manager UI. Reachable from Profile ("My
// Downloads"). Shows storage usage, lets students filter by content
// type, and exposes pause/resume/retry/cancel per item so a dropped
// connection never means starting a large download over from zero.

function formatSize(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type FilterTab = "all" | "note" | "quiz";

export default function DownloadsScreen() {
  const navigation = useNavigation<any>();
  const isOnline = useNetworkStatus();
  const {
    downloads,
    stats,
    loading,
    pause,
    resume,
    retry,
    cancel,
    remove,
    clearAll,
    refresh,
  } = useDownloads();

  const [tab, setTab] = useState<FilterTab>("all");
  const [pendingDelete, setPendingDelete] = useState<DownloadItem | null>(null);
  const [clearAllVisible, setClearAllVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filtered = useMemo(
    () => (tab === "all" ? downloads : downloads.filter((d) => d.contentType === tab)),
    [downloads, tab]
  );

  function openItem(item: DownloadItem) {
    if (item.status !== "completed" || !item.localUri) return;
    if (item.contentType === "note") {
      navigation.navigate("PdfViewer", { pdfUrl: item.localUri });
    } else {
      navigation.navigate("Quiz", {
        offlineFileUri: item.localUri,
        quizId: item.id,
        subjectId: item.subjectId,
        subjectTitle: item.subjectTitle,
      });
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>📡 You're offline — downloaded items still work</Text>
          </View>
        )}

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>My Downloads</Text>
            <Text style={styles.subtitle}>
              {stats.completedItems} item{stats.completedItems === 1 ? "" : "s"} · {formatSize(stats.totalBytes)} used
            </Text>
          </View>
          {downloads.length > 0 && (
            <TouchableOpacity onPress={() => setClearAllVisible(true)}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Storage dashboard */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <StatBlock label="Notes" value={formatSize(stats.noteBytes)} />
            <StatBlock label="Quizzes" value={formatSize(stats.quizBytes)} />
            <StatBlock label="Failed" value={String(stats.failedItems)} warn={stats.failedItems > 0} />
          </View>
        </View>

        {/* Filter tabs */}
        <View style={styles.tabsRow}>
          {(["all", "note", "quiz"] as FilterTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "all" ? "All" : t === "note" ? "Notes" : "Quizzes"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          refreshing={loading}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <DownloadCard
              item={item}
              onOpen={() => openItem(item)}
              onPause={() => pause(item.id)}
              onResume={() => resume(item.id)}
              onRetry={() => retry(item.id)}
              onCancel={() => cancel(item.id)}
              onDelete={() => setPendingDelete(item)}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title={
                  OFFLINE_DB_SUPPORTED
                    ? "📥 No downloads yet. Download Notes or Quizzes to access them offline."
                    : "📥 Offline downloads are available in the mobile app."
                }
              />
            ) : null
          }
        />

        <ConfirmationDialog
          visible={!!pendingDelete}
          title="Remove Download"
          message={`Delete "${pendingDelete?.title}" from this device? You can download it again anytime while online.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            if (pendingDelete) remove(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />

        <ConfirmationDialog
          visible={clearAllVisible}
          title="Clear All Downloads"
          message="This removes every downloaded item from this device. You can download them again anytime while online."
          confirmLabel="Clear All"
          destructive
          onConfirm={() => {
            clearAll();
            setClearAllVisible(false);
          }}
          onCancel={() => setClearAllVisible(false)}
        />
      </View>

      <BottomNav active="Downloads" />
    </View>
  );
}

function StatBlock({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, warn && { color: COLORS.error }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DownloadCard({
  item,
  onOpen,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onDelete,
}: {
  item: DownloadItem;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const progress =
    item.fileSizeBytes > 0 ? Math.min(1, item.bytesWritten / item.fileSizeBytes) : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={item.status === "completed" ? onOpen : undefined}
    >
      <Text style={styles.icon}>{item.contentType === "note" ? "📄" : "📝"}</Text>

      <View style={styles.content}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.subjectTitle} · {item.chapterTitle}
        </Text>

        {item.status === "completed" && (
          <Text style={styles.meta}>
            {formatSize(item.fileSizeBytes)} · Downloaded {formatDate(item.downloadedAt)}
          </Text>
        )}

        {(item.status === "downloading" || item.status === "paused") && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          </View>
        )}

        {item.status === "failed" && (
          <Text style={styles.errorText} numberOfLines={1}>
            ⚠️ {item.errorMessage || "Download failed"}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {item.status === "downloading" && (
          <ActionIcon icon="⏸" onPress={onPause} />
        )}
        {item.status === "paused" && <ActionIcon icon="▶️" onPress={onResume} />}
        {item.status === "failed" && <ActionIcon icon="🔄" onPress={onRetry} />}
        {(item.status === "downloading" || item.status === "paused") && (
          <ActionIcon icon="✕" onPress={onCancel} />
        )}
        {item.status === "completed" && <ActionIcon icon="🗑️" onPress={onDelete} />}
      </View>
    </TouchableOpacity>
  );
}

function ActionIcon({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.actionButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      onPress={onPress}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, paddingTop: 60 },

  offlineBanner: {
    backgroundColor: COLORS.warning ?? "#FFF3CD",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  offlineBannerText: { fontSize: FONT.tiny, color: COLORS.text, textAlign: "center", fontWeight: "600" },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  title: { fontSize: FONT.title, fontWeight: "bold", color: COLORS.text },
  subtitle: { fontSize: FONT.body, color: COLORS.subtitle, marginTop: 6 },
  clearAllText: { fontSize: FONT.small, fontWeight: "700", color: COLORS.error, marginTop: 6 },

  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  statBlock: { alignItems: "center" },
  statValue: { fontSize: FONT.body, fontWeight: "800", color: COLORS.text },
  statLabel: { fontSize: FONT.tiny, color: COLORS.subtitle, marginTop: 2 },

  tabsRow: { flexDirection: "row", marginBottom: SPACING.md, gap: SPACING.sm },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full ?? 20,
    backgroundColor: COLORS.surfaceMuted,
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: FONT.small, fontWeight: "600", color: COLORS.subtitle },
  tabTextActive: { color: "#fff" },

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
  icon: { fontSize: 28, marginRight: 14 },
  content: { flex: 1 },
  itemTitle: { fontSize: FONT.body, fontWeight: "700", color: COLORS.text },
  meta: { marginTop: 3, fontSize: FONT.tiny, color: COLORS.subtitle },

  progressRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  progressText: { fontSize: FONT.tiny, color: COLORS.subtitle, width: 36 },

  errorText: { marginTop: 4, fontSize: FONT.tiny, color: COLORS.error },

  actions: { flexDirection: "row", marginLeft: SPACING.sm },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceMuted,
  },
  actionIcon: { fontSize: 15 },
});

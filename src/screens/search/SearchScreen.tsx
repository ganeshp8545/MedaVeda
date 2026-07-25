import React, { useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import SearchBar from "../../components/SearchBar";
import SectionHeader from "../../components/SectionHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import FadeSlideIn from "../../components/motion/FadeSlideIn";
import SearchResultRow from "../../components/search/SearchResultRow";
import SearchFiltersSheet from "../../components/search/SearchFiltersSheet";
import RecentSearchesRow from "../../components/search/RecentSearchesRow";
import SearchEmptyState from "../../components/search/SearchEmptyState";

import useGlobalSearch from "../../hooks/useGlobalSearch";
import { hasActiveFilters, ScoredResult, SearchResultType, SearchSection } from "../../types/search";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";

// GLOBAL SEARCH SYSTEM - full-screen search entry point (see
// FloatingSearchBar on Home for how students reach this screen). All of
// the actual matching/indexing/business-rule logic lives in
// useGlobalSearch + services/searchService.ts - this file is purely
// presentation: header chrome, section list, and the loading/empty/error
// states around it.
export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const [filtersVisible, setFiltersVisible] = useState(false);

  const {
    query,
    setQuery,
    isSearching,
    filters,
    setFilters,
    resetFilters,
    sections,
    loading,
    refreshing,
    onRefresh,
    error,
    isOnline,
    recentSearches,
    selectRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    availableYears,
    availableSubjects,
    openResult,
    openingId,
    purchasing,
  } = useGlobalSearch();

  const filtersActive = hasActiveFilters(filters);

  function viewAllOfType(type: SearchResultType) {
    setFilters({ ...filters, types: [type] });
  }

  function renderSectionHeader({ section }: { section: SearchSection }) {
    const canSeeAll = section.totalCount > section.data.length;
    return (
      <View style={styles.sectionHeaderWrap}>
        <SectionHeader
          title={`${section.icon} ${section.label}`}
          onSeeAll={canSeeAll ? () => viewAllOfType(section.type) : undefined}
        />
      </View>
    );
  }

  function renderItem({ item, index }: { item: ScoredResult; index: number }) {
    return (
      <FadeSlideIn index={index} staggerMs={30}>
        <SearchResultRow result={item} loading={openingId === item.id} onPress={() => openResult(item)} />
      </FadeSlideIn>
    );
  }

  function renderEmpty() {
    if (loading) return null;

    if (isSearching) {
      return (
        <SearchEmptyState
          query={query.trim()}
          hasActiveFilters={filtersActive}
          onClearFilters={resetFilters}
          onBrowseStore={() => navigation.navigate("Store")}
        />
      );
    }

    // Not searching, no recent searches, and no discovery content either
    // (brand-new account, nothing viewed/owned/recently added yet).
    if (recentSearches.length === 0) {
      return (
        <View style={styles.welcomeWrap}>
          <Text style={styles.welcomeIcon}>📚</Text>
          <Text style={styles.welcomeTitle}>Search all of MedVeda</Text>
          <Text style={styles.welcomeSubtitle}>
            Years, Subjects, Chapters, Notes, Videos, MCQs — start typing to find anything.
          </Text>
        </View>
      );
    }

    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <SearchBar
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
          placeholder="Search notes, videos, quizzes, subjects..."
          autoFocus
          style={styles.searchBar}
        />

        <TouchableOpacity
          onPress={() => setFiltersVisible(true)}
          style={styles.filterBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.filterIcon}>⚙️</Text>
          {filtersActive && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>📡 Offline — showing saved results</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonBlock width={40} height={40} borderRadius={RADIUS.md} />
              <View style={{ flex: 1, marginLeft: SPACING.md }}>
                <SkeletonBlock width="70%" height={14} style={{ marginBottom: 8 }} />
                <SkeletonBlock width="45%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={
            !isSearching ? (
              <RecentSearchesRow
                entries={recentSearches}
                onSelect={selectRecentSearch}
                onRemove={removeRecentSearch}
                onClearAll={clearRecentSearches}
              />
            ) : null
          }
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
          }
        />
      )}

      <SearchFiltersSheet
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        filters={filters}
        onChange={setFilters}
        availableYears={availableYears}
        availableSubjects={availableSubjects}
      />

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
    paddingTop: 56,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },

  backBtn: {
    width: 32,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
  },

  backIcon: {
    fontSize: 30,
    color: COLORS.text,
    marginTop: -2,
  },

  searchBar: {
    flex: 1,
    marginBottom: 0,
  },

  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },

  filterIcon: {
    fontSize: 18,
  },

  filterDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },

  offlineBanner: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: `${COLORS.warning}1F`,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
  },

  offlineText: {
    fontSize: FONT.tiny,
    fontWeight: "600",
    color: COLORS.warning,
  },

  errorBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: `${COLORS.error}1F`,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
  },

  errorText: {
    flex: 1,
    fontSize: FONT.small,
    color: COLORS.error,
    marginRight: SPACING.sm,
  },

  retryText: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.error,
  },

  listContent: {
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xl * 2,
    flexGrow: 1,
  },

  sectionHeaderWrap: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },

  skeletonWrap: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },

  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },

  welcomeWrap: {
    paddingTop: 70,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
  },

  welcomeIcon: {
    fontSize: 44,
    marginBottom: SPACING.md,
  },

  welcomeTitle: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },

  welcomeSubtitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    textAlign: "center",
    marginTop: SPACING.sm,
    lineHeight: 20,
  },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});

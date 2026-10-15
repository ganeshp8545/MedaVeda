import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import useDebounce from "./useDebounce";
import useDownloads from "./useDownloads";
import useNetworkStatus from "./useNetworkStatus";
import usePurchases from "./usePurchases";
import usePurchase from "./usePurchase";

import {
  getSearchIndex,
  applyOwnership,
  searchResults,
  getDiscoverySections,
} from "../services/searchService";
import { fetchQuizTestById } from "../services/quizService";
import {
  getRecentSearches,
  recordSearch,
  removeRecentSearch as removeRecentSearchEntry,
  clearRecentSearches as clearRecentSearchesStorage,
  RecentSearchEntry,
} from "../utils/recentSearches";
import { DEFAULT_FILTERS, ScoredResult, SearchFilters, SearchIndex, SearchSection } from "../types/search";
import { logError } from "../utils/logger";

export default function useGlobalSearch() {
  const navigation = useNavigation<any>();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recentSearches, setRecentSearches] = useState<RecentSearchEntry[]>([]);
  const [discoverySections, setDiscoverySections] = useState<SearchSection[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const isOnline = useNetworkStatus();
  const { ownedScopes, isChapterOwned, refresh: refreshPurchases } = usePurchases();
  const { buy, purchasing } = usePurchase();
  const { downloads, refresh: refreshDownloads } = useDownloads();

  const downloadedIds = useMemo(() => new Set(downloads.map((d) => d.id)), [downloads]);

  const loadIndex = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const built = await getSearchIndex(forceRefresh);
      setIndex(built);
    } catch (err) {
      logError("Failed to load search index:", err);
      setError("Couldn't load search content. Pull down to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadIndex();
    getRecentSearches().then(setRecentSearches);
  }, [loadIndex]);

  // Ownership/downloads can change after a purchase or a new download
  // completes elsewhere in the app - refresh both every time Search
  // regains focus, same pattern every other screen already uses.
  useFocusEffect(
    useCallback(() => {
      refreshPurchases();
      refreshDownloads();
    }, [refreshPurchases, refreshDownloads])
  );

  const enriched = useMemo(() => {
    if (!index) return [];
    return applyOwnership(index, ownedScopes, downloadedIds);
  }, [index, ownedScopes, downloadedIds]);

  const isSearching = debouncedQuery.trim().length > 0;

  const sections: SearchSection[] = useMemo(() => {
    if (!index) return [];
    const found = isSearching ? searchResults(enriched, debouncedQuery, filters) : discoverySections;
    if (Platform.OS === "android") return found;
    return found.map((section) => ({
      ...section,
      data: section.data.filter((result) => result.type !== "product" || result.owned),
    })).filter((section) => section.data.length > 0).map((section) => ({ ...section, totalCount: section.data.length }));
  }, [index, enriched, isSearching, debouncedQuery, filters, discoverySections]);

  // Discovery sections (Recently Viewed / Recommended / Recently Added)
  // read AsyncStorage themselves, so they're computed separately rather
  // than in the sections useMemo above - only needs to happen once the
  // index is ready and whenever ownership changes, not on every keystroke.
  useEffect(() => {
    if (!index) return;
    getDiscoverySections(enriched, ownedScopes).then(setDiscoverySections);
  }, [index, enriched, ownedScopes]);

  const availableYears = useMemo(
    () => (index?.years ?? []).map((y) => ({ id: y.data.id as string, title: y.title })),
    [index]
  );
  const availableSubjects = useMemo(
    () => (index?.subjects ?? []).map((s) => ({ id: s.data.id as string, title: s.title, yearId: s.data.yearId as string })),
    [index]
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadIndex(true);
  }

  async function commitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    await recordSearch(trimmed);
    setRecentSearches(await getRecentSearches());
  }

  async function removeRecentSearch(entryQuery: string) {
    await removeRecentSearchEntry(entryQuery);
    setRecentSearches(await getRecentSearches());
  }

  async function clearRecentSearches() {
    await clearRecentSearchesStorage();
    setRecentSearches([]);
  }

  function selectRecentSearch(entryQuery: string) {
    setQuery(entryQuery);
  }

  async function openResult(result: ScoredResult) {
    if (query.trim()) await commitSearch();

    switch (result.type) {
      case "year": {
        const y = result.data;
        navigation.navigate("Subjects", { yearId: y.id, yearTitle: y.title });
        return;
      }

      case "subject": {
        const s = result.data;
        navigation.navigate("Chapters", {
          subjectId: s.id,
          subjectTitle: s.title,
          yearId: s.yearId,
          yearTitle: s.yearTitle,
        });
        return;
      }

      case "chapter": {
        const c = result.data;
        navigation.navigate("ChapterDetails", {
          chapterId: c.id,
          chapterTitle: c.title,
          subjectId: c.subjectId,
          subjectTitle: c.subjectTitle,
          yearId: c.yearId,
          yearTitle: c.yearTitle,
        });
        return;
      }

      case "note": {
        const chapter = result.data.chapter;
        if (!chapter) {
          Alert.alert("Unavailable", "This note's chapter could not be found. It may have been removed.");
          return;
        }
        navigation.navigate("Notes", {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          subjectId: chapter.subjectId,
          subjectTitle: chapter.subjectTitle,
          yearId: chapter.yearId,
          yearTitle: chapter.yearTitle,
          unlocked: isChapterOwned({ id: chapter.id, subjectId: chapter.subjectId, yearId: chapter.yearId }),
        });
        return;
      }

      case "video": {
        const v = result.data;
        navigation.navigate("Videos", {
          subjectId: v.subjectId,
          subjectTitle: v.subjectTitle,
          yearId: v.yearId,
          yearTitle: v.yearTitle,
        });
        return;
      }

      case "quiz": {
        const q = result.data;
        setOpeningId(result.id);
        try {
          const full = await fetchQuizTestById(q.id);
          if (!full) {
            Alert.alert("Unavailable", "This test is no longer available.");
            return;
          }
          navigation.navigate("Quiz", {
            subjectId: q.subjectId,
            subjectTitle: q.subjectTitle,
            yearId: q.yearId,
            yearTitle: q.yearTitle,
            test: full,
          });
        } catch (err) {
          logError("Failed to open quiz from search:", err);
          Alert.alert("Error", "Could not open this test. Please try again.");
        } finally {
          setOpeningId(null);
        }
        return;
      }

      case "product": {
        if (result.owned) {
          navigation.navigate("MyPurchases");
          return;
        }
        buy(result.data);
        return;
      }

      case "purchase": {
        navigation.navigate("MyPurchases");
        return;
      }

      case "notification": {
        navigation.navigate("Notifications");
        return;
      }
    }
  }

  return {
    query,
    setQuery,
    isSearching,
    filters,
    setFilters,
    resetFilters: () => setFilters(DEFAULT_FILTERS),

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
  };
}

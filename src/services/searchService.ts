import { getActiveYears } from "../repositories/yearsRepository";
import { getAllActiveSubjects } from "../repositories/subjectsRepository";
import { getActiveChapters } from "../repositories/chaptersRepository";
import { getAllActiveNotes } from "../repositories/notesRepository";
import { getAllActiveVideos } from "../repositories/videosRepository";
import { getAllActiveQuizTestsLite } from "../repositories/quizRepository";
import { getAllActiveProducts } from "../repositories/productsRepository";
import { fetchMyPurchases, isChapterUnlocked, isProductOwned } from "./purchasesService";
import { fetchNotifications } from "./notificationsService";
import { fetchWithCacheFallback } from "../utils/localCache";
import { getRecentChapters } from "../utils/recentActivity";
import { getCourseYear, onCourseChange } from "./courseState";
import { scoreMatch, getMatchRanges, byRelevance } from "../utils/textMatch";
import { Chapter } from "../types/chapter";
import { OwnedScope } from "../types/purchase";
import {
  SearchIndex,
  SearchResult,
  SearchResultType,
  SearchFilters,
  ScoredResult,
  SearchSection,
  SECTION_META,
} from "../types/search";

// Global Search System - service layer.
//
// Architecture: the whole catalog (years/subjects/chapters/notes/videos/
// quizzes/products) is fetched ONCE per session into an in-memory index,
// cached to AsyncStorage for instant cold-start + offline search (see
// utils/localCache's fetchWithCacheFallback - same "network first, cached
// fallback" strategy every other list screen already uses). Every
// keystroke after that re-scores the already-loaded index in JS - zero
// additional Supabase queries per search, which is both the "optimized
// queries" and the "instant, no debounce-visible network lag" parts of
// the spec. A specific quiz's full question data (excluded from the
// index to keep it light) is fetched by id only once that result is
// actually tapped - see repositories/quizRepository.getQuizTestById.

const RESULTS_PER_SECTION_CAP = 6;
const SECTION_ORDER: SearchResultType[] = [
  "product",
  "chapter",
  "note",
  "video",
  "quiz",
  "subject",
  "year",
  "purchase",
  "notification",
];

let memoryIndex: SearchIndex | null = null;
let memoryIndexCourseId: string | undefined;
const MEMORY_TTL_MS = 2 * 60 * 1000; // avoid refetching 8 queries every time the Search screen remounts within the same short session

function toEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === "number") return value;
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : undefined;
}

// The index is built per course (only that course's rows are fetched) and
// dropped whenever the course changes, so results never mix courses.
onCourseChange(() => {
  memoryIndex = null;
});

async function buildIndex(courseId?: string): Promise<SearchIndex> {
  const [years, subjects, chapters, notes, videos, quizzesLite, products, purchases, notifications] =
    await Promise.all([
      getActiveYears(courseId),
      getAllActiveSubjects(courseId),
      getActiveChapters(2000, courseId),
      getAllActiveNotes(courseId),
      getAllActiveVideos(courseId),
      getAllActiveQuizTestsLite(courseId),
      getAllActiveProducts(courseId),
      fetchMyPurchases().catch(() => []),
      fetchNotifications().catch(() => []),
    ]);

  const chapterById = new Map(chapters.map((c) => [c.id, c]));

  const years_: SearchResult[] = years.map((y) => ({
    id: `year:${y.id}`,
    type: "year",
    title: y.title,
    subtitle: "Academic Year",
    data: y,
    createdAt: toEpoch((y as any).createdAt),
  }));

  const subjects_: SearchResult[] = subjects.map((s) => ({
    id: `subject:${s.id}`,
    type: "subject",
    title: s.title,
    subtitle: s.yearTitle,
    data: s,
    createdAt: toEpoch((s as any).createdAt),
  }));

  const chapters_: SearchResult[] = chapters.map((c) => ({
    id: `chapter:${c.id}`,
    type: "chapter",
    title: c.title,
    subtitle: [c.subjectTitle, c.yearTitle].filter(Boolean).join(" • "),
    data: c,
    createdAt: toEpoch((c as any).createdAt),
  }));

  const notes_: SearchResult[] = notes.map((n) => {
    const chapter = chapterById.get(n.chapterId);
    return {
      id: `note:${n.id}`,
      type: "note",
      title: n.title,
      subtitle: chapter ? `${chapter.title} • ${chapter.subjectTitle}` : "PDF Note",
      data: { ...n, chapter },
      createdAt: toEpoch((n as any).createdAt),
    };
  });

  const videos_: SearchResult[] = videos.map((v) => ({
    id: `video:${v.id}`,
    type: "video",
    title: v.title,
    subtitle: [v.subjectTitle, v.yearTitle].filter(Boolean).join(" • "),
    data: v,
    createdAt: toEpoch((v as any).createdAt),
  }));

  const quizzes_: SearchResult[] = quizzesLite.map((q) => ({
    id: `quiz:${q.id}`,
    type: "quiz",
    title: q.title,
    subtitle: [q.subjectTitle, q.yearTitle].filter(Boolean).join(" • "),
    data: q,
    createdAt: toEpoch((q as any).createdAt),
  }));

  const products_: SearchResult[] = products.map((p) => ({
    id: `product:${p.id}`,
    type: "product",
    title: p.title,
    subtitle: p.subjectTitle ?? p.yearTitle ?? "Notes Package",
    data: p,
    price: p.price,
    createdAt: toEpoch((p as any).createdAt),
  }));

  const purchases_: SearchResult[] = purchases.map((p) => ({
    id: `purchase:${p.id}`,
    type: "purchase",
    title: p.title,
    subtitle: "Purchased",
    data: p,
    createdAt: p.purchasedAt,
  }));

  const notifications_: SearchResult[] = notifications.map((n) => ({
    id: `notification:${n.id}`,
    type: "notification",
    title: n.title,
    subtitle: n.body,
    data: n,
    createdAt: n.createdAt,
  }));

  return {
    years: years_,
    subjects: subjects_,
    chapters: chapters_,
    notes: notes_,
    videos: videos_,
    quizzes: quizzes_,
    products: products_,
    purchases: purchases_,
    notifications: notifications_,
    builtAt: Date.now(),
  };
}

/** Fetches (or reuses) the full search index. `forceRefresh` skips both
 * the in-memory and AsyncStorage cache - used by pull-to-refresh. */
export async function getSearchIndex(forceRefresh = false): Promise<SearchIndex> {
  const courseId = getCourseYear().courseId;
  if (
    !forceRefresh &&
    memoryIndex &&
    memoryIndexCourseId === courseId &&
    Date.now() - memoryIndex.builtAt < MEMORY_TTL_MS
  ) {
    return memoryIndex;
  }
  const index = await fetchWithCacheFallback(`search:index:${courseId ?? "all"}`, () =>
    buildIndex(courseId)
  );
  memoryIndex = index;
  memoryIndexCourseId = courseId;
  return index;
}

function flatten(index: SearchIndex): SearchResult[] {
  return [
    ...index.years,
    ...index.subjects,
    ...index.chapters,
    ...index.notes,
    ...index.videos,
    ...index.quizzes,
    ...index.products,
    ...index.purchases,
    ...index.notifications,
  ];
}

/** Overlays per-user business rules (owned/free/downloaded) onto the raw
 * index. Cheap and pure - re-run whenever purchases or downloads change,
 * not on every keystroke. Video/Quiz are always free (MedVeda 2.0 rule -
 * see screens/videos/VideosScreen.tsx and screens/quiz/TestListScreen.tsx). */
export function applyOwnership(
  index: SearchIndex,
  ownedScopes: OwnedScope[],
  downloadedIds: Set<string>
): SearchResult[] {
  return flatten(index).map((r) => {
    if (r.type === "video" || r.type === "quiz") {
      return { ...r, free: true, downloaded: downloadedIds.has(r.data.id) };
    }
    if (r.type === "note") {
      const chapter = r.data.chapter as Chapter | undefined;
      const owned = chapter ? isChapterUnlocked(ownedScopes, chapter) : false;
      return { ...r, owned, downloaded: downloadedIds.has(r.data.id) };
    }
    if (r.type === "chapter") {
      const owned = isChapterUnlocked(ownedScopes, r.data as Chapter);
      return { ...r, owned };
    }
    if (r.type === "product") {
      const owned = isProductOwned(ownedScopes, r.data);
      return { ...r, owned, price: r.data.price, free: false };
    }
    return r;
  });
}

function passesFilters(r: SearchResult, filters: SearchFilters): boolean {
  if (filters.types.length > 0 && !filters.types.includes(r.type)) return false;

  if (filters.yearId) {
    const yearId = r.type === "year" ? r.data?.id : r.data?.yearId;
    if (yearId !== filters.yearId) return false;
  }

  if (filters.subjectId) {
    const subjectId = r.type === "subject" ? r.data?.id : r.data?.subjectId;
    if (subjectId !== filters.subjectId) return false;
  }

  if (filters.pricing === "free" && !(r.free || r.owned)) return false;
  if (filters.pricing === "paid" && r.free) return false;

  if (filters.downloadedOnly && !r.downloaded) return false;

  return true;
}

function sortSection(items: ScoredResult[], sort: SearchFilters["sort"]): ScoredResult[] {
  if (sort === "alphabetical") {
    return [...items].sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "recent") {
    return [...items].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  return [...items].sort(byRelevance);
}

function groupIntoSections(scored: ScoredResult[], filters: SearchFilters): SearchSection[] {
  const byType = new Map<SearchResultType, ScoredResult[]>();
  for (const r of scored) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  // Viewing exactly one content type (via a section's "See all" tap, see
  // SearchResultRow/SearchScreen) means the cap's job - keeping a mixed
  // results list scannable - no longer applies, so show everything.
  const cap = filters.types.length === 1 ? Infinity : RESULTS_PER_SECTION_CAP;

  const sections: SearchSection[] = SECTION_ORDER.filter((type) => (byType.get(type)?.length ?? 0) > 0).map(
    (type) => {
      const sorted = sortSection(byType.get(type)!, filters.sort);
      return {
        type,
        label: SECTION_META[type].label,
        icon: SECTION_META[type].icon,
        data: sorted.slice(0, cap),
        totalCount: sorted.length,
      };
    }
  );

  // With relevance sorting, let the section with the single best match
  // lead - an exact Subject-name hit should surface above a loose Note
  // match, even though Notes are earlier in SECTION_ORDER by default.
  if (filters.sort === "relevance") {
    sections.sort((a, b) => (b.data[0]?.score ?? 0) - (a.data[0]?.score ?? 0));
  }

  return sections;
}

/** The main "type-to-search" entry point. `enriched` is the output of
 * applyOwnership - pass the same array on every keystroke, it's not
 * mutated or re-fetched here. */
export function searchResults(
  enriched: SearchResult[],
  query: string,
  filters: SearchFilters
): SearchSection[] {
  const q = query.trim();
  if (!q) return [];

  const filtered = enriched.filter((r) => passesFilters(r, filters));

  const scored: ScoredResult[] = filtered
    .map((r) => ({ ...r, score: scoreMatch(q, r.title, r.subtitle), matchRanges: getMatchRanges(q, r.title) }))
    .filter((r) => r.score > 0);

  return groupIntoSections(scored, filters);
}

function toDiscoveryResult(r: SearchResult): ScoredResult {
  return { ...r, score: 1, matchRanges: [] };
}

/** Shown before the student types anything: Recently Viewed (real, local
 * activity log - same data as the Home dashboard's "Continue Learning"),
 * Recommended For You (same not-yet-owned heuristic as the dashboard),
 * and Recently Added (newest chapters/notes packages by created_at).
 *
 * Deliberately does NOT include a fabricated "Trending"/"Popular" section
 * - that would need real cross-student aggregate data (view/purchase
 * counts), which requires a backend-exposed aggregate the RLS-protected
 * client can't compute today. "Recently Added" is the honest signal
 * available without one. */
export async function getDiscoverySections(
  enriched: SearchResult[],
  ownedScopes: OwnedScope[]
): Promise<SearchSection[]> {
  const sections: SearchSection[] = [];
  const chapterResults = enriched.filter((r) => r.type === "chapter");

  const recentChapters = await getRecentChapters(getCourseYear().courseId);
  if (recentChapters.length > 0) {
    const order = new Map(recentChapters.map((r, i) => [r.chapterId, i]));
    const items = chapterResults
      .filter((c) => order.has(c.data.id))
      .sort((a, b) => order.get(a.data.id)! - order.get(b.data.id)!)
      .slice(0, RESULTS_PER_SECTION_CAP)
      .map(toDiscoveryResult);
    if (items.length > 0) {
      sections.push({ type: "chapter", label: "Recently Viewed", icon: "🕓", data: items, totalCount: items.length });
    }
  }

  const ownedChapterIds = new Set(
    chapterResults.filter((c) => isChapterUnlocked(ownedScopes, c.data as Chapter)).map((c) => c.data.id)
  );
  const preferredYearId = recentChapters[0]?.yearId;
  const notOwned = chapterResults.filter((c) => !ownedChapterIds.has(c.data.id));
  const recommended = (
    preferredYearId
      ? [
          ...notOwned.filter((c) => c.data.yearId === preferredYearId),
          ...notOwned.filter((c) => c.data.yearId !== preferredYearId),
        ]
      : notOwned
  )
    .slice(0, RESULTS_PER_SECTION_CAP)
    .map(toDiscoveryResult);
  if (recommended.length > 0) {
    sections.push({
      type: "chapter",
      label: "Recommended For You",
      icon: "✨",
      data: recommended,
      totalCount: recommended.length,
    });
  }

  const newest = [...chapterResults, ...enriched.filter((r) => r.type === "product")]
    .filter((r) => r.createdAt)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, RESULTS_PER_SECTION_CAP)
    .map(toDiscoveryResult);
  if (newest.length > 0) {
    sections.push({ type: "product", label: "Recently Added", icon: "🆕", data: newest, totalCount: newest.length });
  }

  return sections;
}

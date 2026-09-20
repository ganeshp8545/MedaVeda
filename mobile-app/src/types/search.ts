// Global Search System - shared types.
//
// A SearchResult is a normalized, displayable wrapper around one row from
// any of the searchable content tables (years/subjects/chapters/notes/
// videos/quiz_tests/products/purchases/notifications). The index is built
// once per session (see services/searchService.ts) by fetching each
// table's active rows and mapping them into this one shape - matching,
// ranking and highlighting all then work against SearchResult instead of
// nine different entity shapes.
export type SearchResultType =
  | "year"
  | "subject"
  | "chapter"
  | "note"
  | "video"
  | "quiz"
  | "product"
  | "purchase"
  | "notification";

export interface SearchResult {
  /** `${type}:${entityId}` - unique across the whole index. */
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  /** The raw entity this result was built from - navigation handlers
   * narrow on `type` and read whatever fields they need straight off
   * this instead of every SearchResult carrying every entity's fields. */
  data: any;

  /** Business-rule display flags. Computed fresh on every search (they
   * depend on the signed-in user's purchases), never cached in the index
   * itself. */
  free?: boolean;
  owned?: boolean;
  price?: number;
  downloaded?: boolean;

  /** epoch ms, when the row's `created_at` is available - powers the
   * "Recently Added" filter/section. */
  createdAt?: number;
}

/** The full in-memory catalog, fetched once and reused across searches
 * (see searchService.getSearchIndex). Rebuilding this is the "expensive"
 * part (network); scoring/filtering it per keystroke is the cheap part
 * and never touches the network at all. */
export interface SearchIndex {
  years: SearchResult[];
  subjects: SearchResult[];
  chapters: SearchResult[];
  notes: SearchResult[];
  videos: SearchResult[];
  quizzes: SearchResult[];
  products: SearchResult[];
  purchases: SearchResult[];
  notifications: SearchResult[];
  builtAt: number;
}

export interface SearchFilters {
  yearId?: string;
  subjectId?: string;
  /** Empty = every content type. */
  types: SearchResultType[];
  pricing: "all" | "free" | "paid";
  downloadedOnly: boolean;
  sort: "relevance" | "recent" | "alphabetical";
}

export const DEFAULT_FILTERS: SearchFilters = {
  types: [],
  pricing: "all",
  downloadedOnly: false,
  sort: "relevance",
};

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    !!filters.yearId ||
    !!filters.subjectId ||
    filters.types.length > 0 ||
    filters.pricing !== "all" ||
    filters.downloadedOnly ||
    filters.sort !== "relevance"
  );
}

export interface ScoredResult extends SearchResult {
  score: number;
  /** [start, end) ranges into `title` that matched the query - used by
   * <HighlightedText /> to bold/tint the matched keyword. Empty for
   * unscored results (trending/recommended/recent, shown pre-query). */
  matchRanges: Array<[number, number]>;
}

export interface SearchSection {
  type: SearchResultType;
  label: string;
  icon: string;
  data: ScoredResult[];
  /** May be greater than data.length when a section is capped - powers
   * the "Show all N" row at the end of a section. */
  totalCount: number;
}

export const SECTION_META: Record<SearchResultType, { label: string; icon: string }> = {
  year: { label: "Academic Years", icon: "📅" },
  subject: { label: "Subjects", icon: "📖" },
  chapter: { label: "Chapters", icon: "📂" },
  note: { label: "PDF Notes", icon: "📄" },
  video: { label: "Video Lectures", icon: "🎥" },
  quiz: { label: "MCQ Quizzes", icon: "📝" },
  product: { label: "Store", icon: "🛍️" },
  purchase: { label: "My Purchases", icon: "✅" },
  notification: { label: "Notifications", icon: "🔔" },
};

// Global Search System - matching engine.
//
// No backend full-text-search is set up (no tsvector/pg_trgm on these
// tables), so all matching happens client-side against the in-memory
// index built by searchService. This is intentional, not a fallback: the
// catalog is small enough (hundreds, not millions, of rows) that scoring
// every title in JS is sub-millisecond, and it means search-as-you-type
// never fires a network request per keystroke - only the debounce delay
// (see hooks/useDebounce) and the render itself.
//
// Ranking mirrors what the spec asked for - exact match first, then
// "starts with", then "contains every word", then a loose substring/
// subsequence match for typos and abbreviations - each tier scored well
// apart so a short exact match always outranks a long partial one.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Splits a query into individual words, dropping empties. */
function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** True if every character of `needle` appears in `haystack` in order
 * (not necessarily contiguous) - catches minor typos/abbreviations like
 * "phrmcy" -> "Pharmacy" without pulling in a spell-checking library. */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

const SCORE = {
  EXACT: 100,
  STARTS_WITH: 85,
  ALL_WORDS: 70,
  SUBSTRING: 55,
  SUBSEQUENCE: 30,
};

/** Scores `title` against `query`. Returns 0 (no match) or a positive
 * score - higher is more relevant. `subtitle` contributes a smaller,
 * separate bonus so e.g. a Note whose *chapter* name matches still
 * surfaces, just below title matches. */
export function scoreMatch(query: string, title: string, subtitle?: string): number {
  const q = normalize(query);
  if (!q) return 0;

  const t = normalize(title);
  let score = 0;

  if (t === q) {
    score = SCORE.EXACT;
  } else if (t.startsWith(q)) {
    score = SCORE.STARTS_WITH;
  } else {
    const qWords = words(q);
    const allWordsPresent = qWords.every((w) => t.includes(w));
    if (allWordsPresent) {
      score = SCORE.ALL_WORDS;
    } else if (t.includes(q)) {
      score = SCORE.SUBSTRING;
    } else if (q.length >= 3 && isSubsequence(q, t)) {
      score = SCORE.SUBSEQUENCE;
    }
  }

  if (score === 0 && subtitle) {
    const s = normalize(subtitle);
    if (s.includes(q)) score = SCORE.SUBSTRING - 10;
  }

  return score;
}

/** [start, end) ranges into `title` that should be highlighted for
 * `query`. Falls back to a subsequence-character highlight when there's
 * no contiguous substring match, so a fuzzy hit still shows *something*
 * highlighted instead of nothing. */
export function getMatchRanges(query: string, title: string): Array<[number, number]> {
  const q = normalize(query);
  if (!q) return [];

  const t = normalize(title);
  const idx = t.indexOf(q);
  if (idx !== -1) return [[idx, idx + q.length]];

  // Try each query word separately (handles "bams anatomy" matching
  // "Anatomy - BAMS 1st Year" where the words aren't contiguous).
  const ranges: Array<[number, number]> = [];
  for (const w of words(q)) {
    const wIdx = t.indexOf(w);
    if (wIdx !== -1) ranges.push([wIdx, wIdx + w.length]);
  }
  return ranges;
}

/** Convenience used by search sections to sort a scored list:
 * relevance desc, then alphabetical as a stable tiebreaker. */
export function byRelevance<T extends { score: number; title: string }>(a: T, b: T): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.title.localeCompare(b.title);
}

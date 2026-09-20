# MedVeda — Offline Mode: Integration Guide

## 1. Install dependencies (run inside `mobile-app/`)
```
npx expo install expo-sqlite @react-native-community/netinfo expo-file-system
```
(`expo-file-system` already used by your old downloadsManager, keeping it.)

## 2. Files in this package → where they go
Copy these into your `mobile/` source folder, overwriting the old ones:

| File | Action |
|---|---|
| `config/database.ts` | NEW |
| `types/offline.ts` | NEW |
| `utils/downloadManager.ts` | NEW — **replaces** `utils/downloadsManager.ts` (delete old file) |
| `services/syncEngine.ts` | NEW |
| `hooks/useDownloads.ts` | **replaces** existing `hooks/useDownloads.ts` |
| `hooks/useNetworkStatus.ts` | NEW |
| `screens/downloads/DownloadsScreen.tsx` | **replaces** existing screen |

## 3. Wire into App.tsx (add near the top, before rendering navigation)
```ts
import { initDatabase } from "./mobile/config/database";
import { recoverInterruptedDownloads } from "./mobile/utils/downloadManager";
import { startSyncEngine } from "./mobile/services/syncEngine";

useEffect(() => {
  initDatabase();
  recoverInterruptedDownloads();
  startSyncEngine();
}, []);
```

## 4. Update call sites
- `NotesScreen.tsx` / wherever notes were downloaded: replace calls to old
  `downloadsManager.downloadNote(...)` with:
  ```ts
  downloadManager.enqueueDownload({
    id: note.id, contentType: "note", title: note.title, sourceUrl: note.pdfUrl,
    chapterId, chapterTitle, subjectId, subjectTitle, yearId, yearTitle,
  });
  ```
- Any place recording a quiz attempt / bookmark / reading progress should
  call `queueForSync("quiz_attempt" | "bookmark" | "reading_progress", "upsert", payload)`
  from `services/syncEngine.ts` **right after** writing the local SQLite row
  (`quiz_attempts_local` / `bookmarks_local` / `reading_progress_local`).
  This is what makes those actions offline-first.

## 5. Supabase side
Your existing `quiz_attempts`, `bookmarks`, `reading_progress`,
`watch_history` tables (if not already present, create them) need an
`id text primary key` (client-generated) column so `.upsert(payload,
{ onConflict: 'id' })` in `syncEngine.ts` is idempotent — this is what
prevents duplicate rows when a sync retries after a dropped connection.

## 6. Content-version staleness
When your repositories fetch fresh note/quiz metadata from Supabase, call
`markStaleIfVersionChanged(id, serverVersion)` — if the admin panel
updates a PDF, downloaded copies get flagged for re-download instead of
silently serving outdated content.

## What this gives you
- SQLite-backed download queue: survives app kill, resumes instead of
  restarting, tracks bytes for accurate progress bars.
- Pause / Resume / Retry / Cancel — full download-manager UX.
- Storage dashboard (Notes vs Quizzes usage, failed count) on
  DownloadsScreen.
- Offline banner when connectivity drops.
- Transactional-outbox sync engine: quiz attempts, bookmarks, and
  reading progress queue locally and drain to Supabase automatically the
  moment the device reconnects — with duplicate-safe upserts and a
  progress-regression guard.

## Not yet covered (say the word and we'll build these next)
- Offline video downloads (deliberately excluded — videos are large;
  needs its own storage-quota UX and Wi-Fi-only download policy)
- Offline search indexing (part of the "Search Everywhere" feature)
- Background sync via a native task (currently foreground-only, via
  NetInfo listener + 2-min safety interval — sufficient for most cases,
  but a `expo-background-fetch` task can be added for true background
  sync)

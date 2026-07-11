# Delete these from mobile-app/src — they're leftover/duplicate and were
# causing the errors you were seeing.

## Definitely delete (dead code / caused bugs)

- `screens/details/SubjectDetailsScreen.tsx` — duplicate of
  `ProductDetailsScreen.tsx`. Having both registered in the navigator is
  what caused the confusing errors. Only `ProductDetailsScreen.tsx` stays.
- `services/mock/` (whole folder: `mockYearsService.ts`,
  `mockSubjectsService.ts`, `mockNotesService.ts`, `mockVideosService.ts`,
  `mockQuizService.ts`) — a "navigation-flow build" experiment that skipped
  Firestore entirely and invented a per-note `isFree` flag that doesn't
  exist in your Admin Panel's data model. Real content now comes from
  `services/yearsService.ts`, `subjectsService.ts`, `notesService.ts`,
  `videosService.ts`, `quizService.ts` (all in this zip).

## Safe to delete (superseded by the product/purchase model)

- `hooks/usePremium.ts`
- `services/premiumService.ts`
- `screens/premium/PremiumScreen.tsx`
- `screens/premium/UpgradeScreen.tsx`
- `data/years.ts`, `data/subjects.ts`, `data/videos.ts`, `data/quiz.ts`,
  `data/notes.ts`
- `repositories/notesRepository.ts`

Search the project for `usePremium`, `premiumService`, and `"Premium"` /
`"Upgrade"` navigation calls first to make sure nothing else still
references them before deleting.

// TEMPORARY: sample data so the Home screen shows Year cards before the
// Firestore "years" collection is populated. Swap back to `fetchYears`
// from "../../services/yearsService" (Firestore) once that's ready.

export interface MockYear {
  id: string;
  title: string;
  icon: string;
  color: string;
}

const SAMPLE_YEARS: MockYear[] = [
  { id: "1", title: "1st Professional", icon: "📘", color: "#4CAF50" },
  { id: "2", title: "2nd Professional", icon: "📗", color: "#2196F3" },
  { id: "3", title: "3rd Professional", icon: "📙", color: "#FF9800" },
];

export async function fetchMockYears(): Promise<MockYear[]> {
  return SAMPLE_YEARS;
}

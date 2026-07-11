// TEMPORARY: sample data so the Subjects screen shows subject cards before
// the Firestore "subjects" collection is populated. Swap back to
// `fetchSubjectsByYear` from "../../services/subjectsService" (Firestore)
// once that's ready.

export interface MockSubject {
  id: string;
  title: string;
}

const SAMPLE_SUBJECTS: Record<string, MockSubject[]> = {
  "1": [
    { id: "1", title: "Samhita-1" },
    { id: "2", title: "Kriya Sharir" },
    { id: "3", title: "Rachana Sharir" },
    { id: "4", title: "Padarth Vigyan" },
    { id: "5", title: "Sanskrit" },
  ],
  "2": [
    { id: "1", title: "Samhita-2" },
    { id: "2", title: "Rasashastra" },
    { id: "3", title: "Agadtantra evm Vidhi Vaidyak" },
    { id: "4", title: "Dravyagun Vigyan" },
    { id: "5", title: "Swasthwritta evm Yoga" },
    { id: "6", title: "Rognidan evm Vikruti Vigyan" },
  ],
  "3": [
    { id: "1", title: "Kayachikitsa" },
    { id: "2", title: "Shalya Tantra" },
    { id: "3", title: "Shalakya Tantra" },
    { id: "4", title: "Striroga evm Prasuti Vigyaan" },
    { id: "5", title: "Kaumarabhritya" },
    { id: "6", title: "Panchakarma" },
    { id: "7", title: "Samhita" },
    { id: "8", title: "Research Methodology" },
  ],
};

export async function fetchMockSubjectsByYear(
  yearId: string
): Promise<MockSubject[]> {
  return SAMPLE_SUBJECTS[yearId] ?? [];
}

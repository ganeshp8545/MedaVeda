// Firestore collection: "subjects"
export interface Subject {
  id: string;
  title: string;
  icon: string;
  color: string;
  yearId: string;
  yearTitle: string;
  order: number;
  active: boolean;
}

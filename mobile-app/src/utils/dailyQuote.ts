export interface AyurvedicQuote {
  text: string;
  source: string;
}

// A rotating set of short, original Ayurvedic study reminders/aphorisms.
// One is picked deterministically per calendar day so every user sees the
// same quote on a given day, and it stays stable across app re-opens.
const QUOTES: AyurvedicQuote[] = [
  { text: "Balance is not a destination, it is a daily practice.", source: "Ayurvedic principle" },
  { text: "Understand the doshas well, and the body explains itself.", source: "Study reminder" },
  { text: "Food eaten at the right time nourishes; the same food at the wrong time harms.", source: "Ayurvedic principle" },
  { text: "A calm mind absorbs knowledge the way healthy tissue absorbs nutrition.", source: "Study reminder" },
  { text: "Prevention practiced daily outweighs treatment sought occasionally.", source: "Ayurvedic principle" },
  { text: "Consistency in revision is the Agni of a growing mind.", source: "Study reminder" },
  { text: "Every dravya has a nature - learn to see it before you prescribe it.", source: "Ayurvedic principle" },
  { text: "Small, steady effort each day builds the strongest foundation.", source: "Study reminder" },
];

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff =
    date.getTime() -
    start.getTime() +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getDailyQuote(date: Date = new Date()): AyurvedicQuote {
  const index = dayOfYear(date) % QUOTES.length;
  return QUOTES[index];
}

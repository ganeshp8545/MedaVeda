// DESIGN SYSTEM - typography tokens.
//
// This is now the single canonical source for font sizing. Previously
// this project had TWO conflicting FONT definitions - theme/fonts.ts
// (28/22/18/16/14/12, used by all 54 files that import it) and
// theme/typography.ts (a different, unused 30/24/20/16/14/12 set). That
// second one was dead code nobody imported, but it's exactly the kind
// of landmine that causes a real bug the day someone innocently imports
// FONT from the "wrong" file. Fixed by making fonts.ts re-export from
// here, so there's one set of numbers, period.
export const FONT = {
  title: 28,
  heading: 22,
  subHeading: 18,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

export const FONT_WEIGHT = {
  regular: "400",
  medium: "500",
  semiBold: "600",
  bold: "700",
  extraBold: "800",
} as const;

// Line-height multipliers (multiply by the FONT size in use). Body copy
// needs more breathing room than a large title does - using a flat
// "1.4x everything" rule makes titles look loose and captions look
// cramped.
export const LINE_HEIGHT = {
  title: 1.2,
  heading: 1.25,
  body: 1.5,
  small: 1.45,
} as const;

// Letter-spacing, in px, added on top of the font's natural spacing.
// Small positive values on headings/labels read as more "designed";
// body copy stays at 0 so long paragraphs remain easy to read.
export const LETTER_SPACING = {
  heading: 0.2,
  label: 0.4, // section headers, badges, all-caps tags
  body: 0,
} as const;

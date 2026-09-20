// Kept for backward compatibility - every existing screen imports FONT
// from here. The actual values now live in theme/typography.ts (the new
// canonical source, alongside FONT_WEIGHT/LINE_HEIGHT/LETTER_SPACING) -
// this file just re-exports them so none of the 54 existing `import {
// FONT } from "../theme/fonts"` call sites need to change.
export { FONT } from "./typography";

// ANIMATION SYSTEM - motion tokens.
//
// Every animated component in this app should pull timing/easing from
// here rather than hardcoding numbers, so a future "make everything
// feel snappier" pass is a one-line change, not a grep-and-replace
// across 200 files.
//
// Values chosen by animation-purpose, not by component - a "card
// entrance" always uses DURATIONS.entrance regardless of whether it's a
// NoteCard, ChapterCard, or ProductCard.

import { Easing } from "react-native-reanimated";

export const DURATIONS = {
  // Micro-interactions: button press, toggle, checkbox. Fast enough to
  // feel instant, slow enough to register as intentional feedback.
  press: 100,
  // Small UI state changes: badge appearing, icon swap.
  micro: 150,
  // Card/list-item entrance, tab switch content fade.
  entrance: 280,
  // Screen-level transitions, modal/bottom-sheet open.
  screen: 350,
  // Celebration moments: quiz pass, purchase success, streak milestone.
  celebration: 600,
} as const;

export const EASINGS = {
  // Standard "material" ease-out - fast start, gentle finish. Default
  // for anything entering the screen (cards, sheets, fades).
  standard: Easing.out(Easing.cubic),
  // Symmetric ease - default for anything that moves and settles back
  // (press feedback, toggles).
  inOut: Easing.inOut(Easing.ease),
  // Slight overshoot - reserved for celebratory / success moments only,
  // using it everywhere would feel gimmicky.
  bounce: Easing.out(Easing.back(1.4)),
} as const;

// Reanimated spring configs (used instead of Easing when the motion
// should feel physical - press scale, drag-release, success pop).
export const SPRINGS = {
  press: { damping: 18, stiffness: 400, mass: 0.5 },
  gentle: { damping: 16, stiffness: 180, mass: 0.8 },
  celebration: { damping: 10, stiffness: 200, mass: 0.9 },
} as const;

// Standard press-feedback scale - every AnimatedPressable in the app
// shrinks to exactly this on press, so every button feels the same.
export const PRESS_SCALE = 0.96;

// Respect the OS "Reduce Motion" accessibility setting. Import and check
// this before starting any non-essential decorative animation (entrance
// slides, celebration bursts) - press feedback and progress indication
// should still run since they communicate state, not decoration.
export { AccessibilityInfo } from "react-native";

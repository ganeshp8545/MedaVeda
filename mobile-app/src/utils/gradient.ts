// Deliberately dependency-free gradient helpers.
//
// This project avoids adding new native modules (see ProgressRing's
// comment about skipping react-native-svg), so instead of
// expo-linear-gradient / react-native-linear-gradient we synthesize a
// smooth multi-stop gradient out of thin stacked <View> bands. It reads
// as a real gradient at normal viewing distance and has zero install /
// linking risk.

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Mix two hex colors. t=0 -> colorA, t=1 -> colorB */
export function mixColor(colorA: string, colorB: string, t: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

/**
 * Builds an array of { color, flex } bands that approximate a smooth
 * gradient across the given stop colors. Feed the result into stacked
 * absolutely-positioned Views (see GradientBackground) or a flex column.
 */
export function buildGradientBands(colors: string[], steps = 16): string[] {
  if (colors.length < 2) return colors;
  const bands: string[] = [];
  const segments = colors.length - 1;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const segFloat = t * segments;
    const segIndex = Math.min(segments - 1, Math.floor(segFloat));
    const localT = segFloat - segIndex;
    bands.push(mixColor(colors[segIndex], colors[segIndex + 1], localT));
  }
  return bands;
}

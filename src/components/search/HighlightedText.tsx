import React from "react";
import { Text, TextStyle } from "react-native";

import { COLORS } from "../../theme/colors";

type Props = {
  text: string;
  ranges: Array<[number, number]>;
  style?: TextStyle;
  numberOfLines?: number;
};

// Renders `text` with the [start, end) ranges from textMatch.getMatchRanges
// bolded and tinted accent - the "highlighted matching keywords" part of
// the spec. Falls back to plain text when there are no ranges (discovery
// sections, or a fuzzy subsequence match with nothing contiguous to
// underline).
export default function HighlightedText({ text, ranges, style, numberOfLines }: Props) {
  if (!ranges || ranges.length === 0) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach(([start, end], i) => {
    if (start > cursor) {
      parts.push(
        <Text key={`plain-${i}`} style={style}>
          {text.slice(cursor, start)}
        </Text>
      );
    }
    parts.push(
      <Text key={`match-${i}`} style={[style, { color: COLORS.accent, fontWeight: "800" }]}>
        {text.slice(start, end)}
      </Text>
    );
    cursor = Math.max(cursor, end);
  });

  if (cursor < text.length) {
    parts.push(
      <Text key="plain-end" style={style}>
        {text.slice(cursor)}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts}
    </Text>
  );
}

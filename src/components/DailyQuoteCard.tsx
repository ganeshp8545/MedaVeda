import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { getDailyQuote } from "../utils/dailyQuote";

export default function DailyQuoteCard() {
  const quote = getDailyQuote();

  return (
    <View style={styles.card}>
      <Text style={styles.mark}>“</Text>
      <Text style={styles.text}>{quote.text}</Text>
      <Text style={styles.source}>— {quote.source}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  mark: {
    fontSize: 34,
    color: COLORS.accent,
    lineHeight: 34,
    marginBottom: -8,
  },
  text: {
    fontSize: FONT.body,
    color: COLORS.text,
    lineHeight: 22,
    fontStyle: "italic",
  },
  source: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 8,
    textAlign: "right",
  },
});

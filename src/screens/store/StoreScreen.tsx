import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import ProductPosterCard from "../../components/ProductPosterCard";
import SectionHeader from "../../components/SectionHeader";
import EmptyState from "../../components/EmptyState";
import BottomNav from "../../components/BottomNav";

import {
  fetchProductsByYear,
  fetchProductsBySubject,
  Product,
} from "../../services/productsService";
import { fetchYears, Year } from "../../services/yearsService";
import { fetchSubjectsByYear, Subject } from "../../services/subjectsService";
import usePurchases from "../../hooks/usePurchases";
import usePurchase from "../../hooks/usePurchase";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";

type YearBlock = {
  year: Year;
  yearProduct: Product | null;
  subjects: Subject[];
  subjectProducts: Record<string, Product | null>;
};

// Store is grouped by Year - each Year gets its own horizontal row of
// poster cards, one per Subject (with its own Notes price + owned state).
// Tapping a Subject card drops into that Subject's Chapters, same place
// SubjectsScreen sends you for browsing notes, so chapter-level buying
// still works exactly as before. The Year's own "Full Year Notes" pack is
// buyable from the pill next to the Year title.
export default function StoreScreen() {
  const navigation = useNavigation<any>();
  const [blocks, setBlocks] = useState<YearBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const { isOwned, refresh: refreshPurchases } = usePurchases();
  const { buy, purchasing } = usePurchase();

  useEffect(() => {
    fetchYears()
      .then(async (allYears) => {
        const sorted = [...allYears].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const loaded = await Promise.all(
          sorted.map(async (year) => {
            const [yearProducts, subjects] = await Promise.all([
              fetchProductsByYear(year.id),
              fetchSubjectsByYear(year.id),
            ]);

            const subjectProductLists = await Promise.all(
              subjects.map((s) => fetchProductsBySubject(s.id))
            );
            const subjectProducts: Record<string, Product | null> = {};
            subjects.forEach((s, i) => {
              subjectProducts[s.id] = subjectProductLists[i][0] ?? null;
            });

            return {
              year,
              yearProduct: yearProducts[0] ?? null,
              subjects,
              subjectProducts,
            };
          })
        );

        setBlocks(loaded);
      })
      .catch((err) => console.error("Failed to load Store:", err))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPurchases();
    }, [refreshPurchases])
  );

  function handleBuy(product: Product | null) {
    if (!product || isOwned(product)) return;
    buy(product);
  }

  function openSubject(subject: Subject, year: Year) {
    navigation.navigate("Chapters", {
      subjectId: subject.id,
      subjectTitle: subject.title,
      yearId: year.id,
      yearTitle: year.title,
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Notes</Text>
        <Text style={styles.subtitle}>Buy a Year, a Subject, or just one Chapter</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.accent} />
        ) : (
          <FlatList
            data={blocks}
            keyExtractor={(block) => block.year.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
            renderItem={({ item: block, index: yearIndex }) => {
              const yearOwned = block.yearProduct ? isOwned(block.yearProduct) : false;

              return (
                <View style={styles.yearBlock}>
                  <SectionHeader title={block.year.title} />

                  {block.yearProduct && (
                    <TouchableOpacity
                      style={[
                        styles.fullYearPill,
                        yearOwned && styles.fullYearPillOwned,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => handleBuy(block.yearProduct)}
                      disabled={yearOwned}
                    >
                      <Text style={styles.fullYearPillText}>
                        {yearOwned
                          ? "✓ Full Year Notes Owned"
                          : `Buy Full Year Notes · ₹${block.yearProduct.price}`}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {block.subjects.length === 0 ? (
                    <Text style={styles.nestedEmptyText}>
                      No subjects in this year yet.
                    </Text>
                  ) : (
                    <FlatList
                      data={block.subjects}
                      keyExtractor={(s) => s.id}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: SPACING.sm }}
                      renderItem={({ item: subject, index }) => {
                        const subjectProduct = block.subjectProducts[subject.id] ?? null;
                        const owned = subjectProduct ? isOwned(subjectProduct) : false;

                        return (
                          <ProductPosterCard
                            title={subject.title}
                            caption="Full Subject Notes"
                            price={subjectProduct?.price ?? 0}
                            originalPrice={subjectProduct?.originalPrice}
                            owned={owned}
                            colorIndex={yearIndex + index}
                            icon="📖"
                            onPress={() => openSubject(subject, block.year)}
                            onBuyPress={
                              subjectProduct ? () => handleBuy(subjectProduct) : undefined
                            }
                            buying={purchasing}
                          />
                        );
                      }}
                    />
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<EmptyState title="🔍 No Academic Years Found" />}
          />
        )}
      </View>

      <BottomNav active="Store" />

      {purchasing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    paddingTop: 60,
  },
  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 6,
    marginBottom: SPACING.lg,
  },
  yearBlock: {
    marginBottom: SPACING.lg,
  },
  fullYearPill: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: SPACING.md,
  },
  fullYearPillOwned: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  fullYearPillText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.small,
  },
  nestedEmptyText: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginBottom: SPACING.sm,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});

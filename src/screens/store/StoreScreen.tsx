import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import ProductCard from "../../components/ProductCard";
import EmptyState from "../../components/EmptyState";
import FilterChip from "../../components/FilterChip";

import { fetchAllProducts, Product } from "../../services/productsService";
import { fetchYears, Year } from "../../services/yearsService";
import { fetchSubjectsByYear, Subject } from "../../services/subjectsService";
import usePurchases from "../../hooks/usePurchases";
import usePurchase from "../../hooks/usePurchase";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

// A product "belongs to" a year if it's directly tagged with that year
// (every scope except bundle carries yearId - confirmed against the admin
// panel's ProductFormModal, which always sets yearId/yearTitle even for
// chapter/subject-scoped products, to support this exact drill-down), or
// for bundles, if that year is one of the bundled yearIds.
function belongsToYear(product: Product, yearId: string): boolean {
  if (product.scope === "bundle") return (product.yearIds ?? []).includes(yearId);
  return product.yearId === yearId;
}

function belongsToSubject(product: Product, subjectId: string): boolean {
  return product.subjectId === subjectId;
}

// General catalog of everything sellable: individual chapters, subject
// packs, year packs, and multi-year bundles. For contextual buying (e.g.
// "unlock just this chapter"), ChapterDetailsScreen already surfaces the
// relevant options directly - this screen is for browsing/upselling
// bigger packs from one place.
export default function StoreScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [years, setYears] = useState<Year[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  const { isOwned, refresh: refreshPurchases } = usePurchases();
  const { buy, purchasing } = usePurchase();

  useEffect(() => {
    fetchAllProducts()
      .then(setProducts)
      .catch((err) => console.error("Failed to load products:", err))
      .finally(() => setLoading(false));

    fetchYears()
      .then(setYears)
      .catch((err) => console.error("Failed to load years:", err));
  }, []);

  // Load the Subject row whenever a Year is picked; clear it (and any
  // previously selected Subject) when "All Years" is picked again.
  useEffect(() => {
    if (!selectedYearId) {
      setSubjects([]);
      setSelectedSubjectId(null);
      return;
    }

    setSelectedSubjectId(null);
    setSubjectsLoading(true);

    fetchSubjectsByYear(selectedYearId)
      .then(setSubjects)
      .catch((err) => console.error("Failed to load subjects:", err))
      .finally(() => setSubjectsLoading(false));
  }, [selectedYearId]);

  useFocusEffect(
    useCallback(() => {
      refreshPurchases();
    }, [refreshPurchases])
  );

  const filteredProducts = products.filter((p) => {
    if (selectedYearId && !belongsToYear(p, selectedYearId)) return false;
    if (selectedSubjectId && !belongsToSubject(p, selectedSubjectId)) return false;
    return true;
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Store</Text>
      <Text style={styles.subtitle}>Chapters, Subject & Year Packs, Bundles</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <FilterChip
          label="All Years"
          selected={selectedYearId === null}
          onPress={() => setSelectedYearId(null)}
        />
        {years.map((year) => (
          <FilterChip
            key={year.id}
            label={year.title}
            selected={selectedYearId === year.id}
            onPress={() =>
              setSelectedYearId(selectedYearId === year.id ? null : year.id)
            }
          />
        ))}
      </ScrollView>

      {selectedYearId && (
        subjectsLoading ? (
          <ActivityIndicator
            size="small"
            color={COLORS.accent}
            style={styles.subjectLoader}
          />
        ) : subjects.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <FilterChip
              label="All Subjects"
              selected={selectedSubjectId === null}
              onPress={() => setSelectedSubjectId(null)}
            />
            {subjects.map((subject) => (
              <FilterChip
                key={subject.id}
                label={subject.title}
                selected={selectedSubjectId === subject.id}
                onPress={() =>
                  setSelectedSubjectId(
                    selectedSubjectId === subject.id ? null : subject.id
                  )
                }
              />
            ))}
          </ScrollView>
        ) : null
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => (
            <ProductCard
              title={item.title}
              description={item.description}
              scope={item.scope}
              price={item.price}
              owned={isOwned(item)}
              onPress={() => {
                if (!isOwned(item)) buy(item.id, item.title);
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState title="🔍 No Products Match This Filter" />
          }
        />
      )}

      {purchasing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  chipRow: {
    paddingBottom: SPACING.md,
  },
  subjectLoader: {
    alignSelf: "flex-start",
    marginBottom: SPACING.md,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});


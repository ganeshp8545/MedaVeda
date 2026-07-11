import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";

import { useFocusEffect } from "@react-navigation/native";

import SearchBar from "../../components/SearchBar";
import EmptyState from "../../components/EmptyState";
import ProductCard from "../../components/ProductCard";

import { fetchAllProducts, Product } from "../../services/productsService";
import usePurchases from "../../hooks/usePurchases";
import usePurchase from "../../hooks/usePurchase";

import { COLORS } from "../../theme/colors";
import { SPACING } from "../../theme/spacing";

export default function SearchScreen() {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const { isOwned, refresh: refreshPurchases } = usePurchases();
  const { buy, purchasing } = usePurchase();

  useEffect(() => {
    fetchAllProducts()
      .then(setProducts)
      .catch((err) => console.error("Failed to load products:", err))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPurchases();
    }, [refreshPurchases])
  );

  const filtered = products.filter(
    (item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.subjectTitle?.toLowerCase().includes(search.toLowerCase()) ||
      item.yearTitle?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search chapters, subjects, packs..."
      />

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : (
        <FlatList
          data={search.trim() ? filtered : []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: 30 }}
          renderItem={({ item }) => (
            <ProductCard
              title={item.title}
              description={item.subjectTitle ?? item.yearTitle}
              scope={item.scope}
              price={item.price}
              owned={isOwned(item)}
              onPress={() => {
                if (!isOwned(item)) buy(item.id, item.title);
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={search.trim() ? "🔍 No Results Found" : "Start typing to search"}
            />
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
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});

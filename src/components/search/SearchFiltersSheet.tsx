import React from "react";
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

import FilterChip from "../FilterChip";
import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { DEFAULT_FILTERS, SearchFilters, SearchResultType, SECTION_META } from "../../types/search";

type Props = {
  visible: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  availableYears: Array<{ id: string; title: string }>;
  availableSubjects: Array<{ id: string; title: string; yearId: string }>;
};

const TYPE_OPTIONS: SearchResultType[] = [
  "chapter",
  "note",
  "video",
  "quiz",
  "product",
  "subject",
  "year",
  "purchase",
  "notification",
];

export default function SearchFiltersSheet({
  visible,
  onClose,
  filters,
  onChange,
  availableYears,
  availableSubjects,
}: Props) {
  const subjectsForYear = filters.yearId
    ? availableSubjects.filter((s) => s.yearId === filters.yearId)
    : availableSubjects;

  function toggleType(type: SearchResultType) {
    const has = filters.types.includes(type);
    onChange({
      ...filters,
      types: has ? filters.types.filter((t) => t !== type) : [...filters.types, type],
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.heading}>Filters</Text>
            <TouchableOpacity onPress={() => onChange(DEFAULT_FILTERS)}>
              <Text style={styles.clearAll}>Clear All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Content Type</Text>
            <View style={styles.chipWrap}>
              {TYPE_OPTIONS.map((type) => (
                <FilterChip
                  key={type}
                  label={`${SECTION_META[type].icon} ${SECTION_META[type].label}`}
                  selected={filters.types.includes(type)}
                  onPress={() => toggleType(type)}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>Academic Year</Text>
            <View style={styles.chipWrap}>
              <FilterChip
                label="All Years"
                selected={!filters.yearId}
                onPress={() => onChange({ ...filters, yearId: undefined, subjectId: undefined })}
              />
              {availableYears.map((y) => (
                <FilterChip
                  key={y.id}
                  label={y.title}
                  selected={filters.yearId === y.id}
                  onPress={() =>
                    onChange({
                      ...filters,
                      yearId: filters.yearId === y.id ? undefined : y.id,
                      subjectId: undefined,
                    })
                  }
                />
              ))}
            </View>

            {subjectsForYear.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Subject</Text>
                <View style={styles.chipWrap}>
                  <FilterChip
                    label="All Subjects"
                    selected={!filters.subjectId}
                    onPress={() => onChange({ ...filters, subjectId: undefined })}
                  />
                  {subjectsForYear.map((s) => (
                    <FilterChip
                      key={s.id}
                      label={s.title}
                      selected={filters.subjectId === s.id}
                      onPress={() =>
                        onChange({ ...filters, subjectId: filters.subjectId === s.id ? undefined : s.id })
                      }
                    />
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>Free / Paid</Text>
            <View style={styles.chipWrap}>
              <FilterChip label="All" selected={filters.pricing === "all"} onPress={() => onChange({ ...filters, pricing: "all" })} />
              <FilterChip label="Free" selected={filters.pricing === "free"} onPress={() => onChange({ ...filters, pricing: "free" })} />
              <FilterChip label="Paid" selected={filters.pricing === "paid"} onPress={() => onChange({ ...filters, pricing: "paid" })} />
            </View>

            <Text style={styles.sectionLabel}>Downloads</Text>
            <View style={styles.chipWrap}>
              <FilterChip
                label="⬇️ Downloaded Only"
                selected={filters.downloadedOnly}
                onPress={() => onChange({ ...filters, downloadedOnly: !filters.downloadedOnly })}
              />
            </View>

            <Text style={styles.sectionLabel}>Sort By</Text>
            <View style={styles.chipWrap}>
              <FilterChip label="Relevance" selected={filters.sort === "relevance"} onPress={() => onChange({ ...filters, sort: "relevance" })} />
              <FilterChip label="Recently Added" selected={filters.sort === "recent"} onPress={() => onChange({ ...filters, sort: "recent" })} />
              <FilterChip label="A - Z" selected={filters.sort === "alphabetical"} onPress={() => onChange({ ...filters, sort: "alphabetical" })} />
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.applyButton} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.applyText}>Show Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    maxHeight: "82%",
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: SPACING.md,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },

  heading: {
    fontSize: FONT.title,
    fontWeight: "700",
    color: COLORS.text,
  },

  clearAll: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.accent,
  },

  sectionLabel: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.subtitle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },

  applyButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
  },

  applyText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.body,
  },
});

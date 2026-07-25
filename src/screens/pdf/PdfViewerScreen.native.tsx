import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";

import Pdf from "react-native-pdf";
import { useNavigation, useRoute } from "@react-navigation/native";

import ErrorState from "../../components/ErrorState";
import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";

export default function PdfViewerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  // route.params can be undefined if this screen is ever reached without
  // being navigated to from an access-checked note (SRS: "Validate access
  // before every open request" - this is the last line of defense, on top
  // of the check already done before navigating here).
  const { pdfUrl } = route.params ?? {};

  // Downloaded Notes (roadmap change 8) are opened by passing their local
  // file:// URI in place of the usual remote pdfUrl - same screen, same
  // prop, no separate "offline viewer" needed. `cache: true` only makes
  // sense for a remote fetch, so skip it here.
  const isLocalFile = typeof pdfUrl === "string" && pdfUrl.startsWith("file://");

  const [page, setPage] = useState(1);
  const [numberOfPages, setNumberOfPages] = useState(0);
  const [loadError, setLoadError] = useState(false);

  if (!pdfUrl) {
    return (
      <View style={styles.container}>
        <ErrorState
          message="This document couldn't be opened. Please go back and try again."
          onRetry={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <ErrorState
          message="This PDF couldn't be loaded. Please check your connection and try again."
          onRetry={() => setLoadError(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* react-native-pdf downloads and renders the actual PDF file (all
          pages, real text/graphics) instead of embedding Google Docs
          Viewer in a WebView. The old gview approach frequently failed to
          render the complete document (blank pages / partial content),
          especially with signed Firebase Storage URLs - this renders the
          full PDF reliably, with pinch-to-zoom and page-by-page scrolling. */}
      <Pdf
        source={{ uri: pdfUrl, cache: !isLocalFile }}
        style={styles.pdf}
        trustAllCerts={false}
        enablePaging={false}
        horizontal={false}
        fitPolicy={0}
        spacing={8}
        onLoadComplete={(pages) => {
          setNumberOfPages(pages);
        }}
        onPageChanged={(currentPage) => {
          setPage(currentPage);
        }}
        onError={(error) => {
          console.error("PDF load error:", error);
          setLoadError(true);
        }}
        renderActivityIndicator={() => (
          <ActivityIndicator size="large" color="#8C3A22" />
        )}
      />

      {numberOfPages > 0 && (
        <View style={styles.pageBadge}>
          <Text style={styles.pageBadgeText}>
            Page {page} / {numberOfPages}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  pageBadge: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  pageBadgeText: {
    color: "#fff",
    fontSize: FONT.small,
    fontWeight: "600",
  },
});

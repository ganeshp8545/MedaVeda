import React from "react";
import { View, StyleSheet } from "react-native";

import { useNavigation, useRoute } from "@react-navigation/native";

import ErrorState from "../../components/ErrorState";

// Web-only version of the PDF viewer. `react-native-pdf` (used in
// PdfViewerScreen.native.tsx) is a native-only module — it can't be
// bundled for the browser at all, and since AppNavigator imports every
// screen up front, that failure was crashing the *entire* app on web
// (the white screen), not just this one screen.
//
// Metro/Expo automatically picks this file over PdfViewerScreen.tsx when
// building for web (the ".web.tsx" suffix), and picks the ".native.tsx"
// one for the real Android/iOS app - so this file is never shipped to
// the Play Store build, it only matters for `npx expo start` + press "w".
//
// Browsers already render PDFs natively inside an <iframe>, full
// document, all pages, no extra library needed here.
export default function PdfViewerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { pdfUrl } = route.params ?? {};

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

  return (
    <View style={styles.container}>
      {React.createElement("iframe", {
        src: pdfUrl,
        title: "PDF Viewer",
        style: { flex: 1, width: "100%", height: "100%", border: "none" },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});

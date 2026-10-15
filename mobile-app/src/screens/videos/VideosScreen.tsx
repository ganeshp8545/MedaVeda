import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Linking,
  ActivityIndicator,
  Alert,
} from "react-native";

import { useRoute } from "@react-navigation/native";

import VideoCard from "../../components/VideoCard";
import EmptyState from "../../components/EmptyState";
import SearchBar from "../../components/SearchBar";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import { fetchVideosBySubject, Video } from "../../services/videosService";
import { logError } from "../../utils/logger";

// MedVeda 2.0: Video Lectures are always free for every student, for
// the whole Subject - only PDF Notes are paid (and chapter-scoped)
// content. No purchase check, no lock icons, no Unlock panel here.
export default function VideosScreen() {
  const route = useRoute<any>();
  const { subjectId, subjectTitle } = route.params;

  const [search, setSearch] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchVideosBySubject(subjectId)
      .then((data) => {
        if (isMounted) setVideos(data);
      })
      .catch((err) => {
        logError("Failed to load videos:", err);
        if (isMounted) {
          Alert.alert("Error", "Could not load videos. Please try again.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [subjectId]);

  const filteredData = videos.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  // Same safe-open pattern as SideDrawer/ContactScreen's "Follow us" links:
  // canOpenURL first (the AndroidQueries plugin makes this reliable on
  // Android 11+), then openURL - which itself falls back to the browser
  // when the YouTube app isn't installed, since this is a plain https URL.
  async function handleVideoPress(item: Video) {
    try {
      const supported = await Linking.canOpenURL(item.youtubeUrl);
      if (supported) {
        await Linking.openURL(item.youtubeUrl);
      } else {
        Alert.alert("Error", "Could not open the link.");
      }
    } catch (error) {
      logError("Failed to open video link", error);
      Alert.alert("Error", "Could not open the link.");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{subjectTitle}</Text>
      <Text style={styles.subtitle}>Video Lectures - Free</Text>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search Videos..."
      />

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: SPACING.xl }}
          renderItem={({ item }) => (
            <VideoCard
              title={item.title}
              locked={false}
              onPress={() => handleVideoPress(item)}
            />
          )}
          ListEmptyComponent={<EmptyState title="🔍 No Videos Found" />}
        />
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
});

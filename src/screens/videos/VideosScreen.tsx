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
import UnlockOptionsPanel from "../../components/UnlockOptionsPanel";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import { fetchVideosByChapter, Video } from "../../services/videosService";

// Video lectures are gated the same way as Notes/Quiz now - locked unless
// the chapter (or its subject/year/bundle) has been purchased.
export default function VideosScreen() {
  const route = useRoute<any>();
  const { chapterId, chapterTitle, subjectId, yearId, unlocked } = route.params;

  const [search, setSearch] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchVideosByChapter(chapterId)
      .then((data) => {
        if (isMounted) setVideos(data);
      })
      .catch((err) => {
        console.error("Failed to load videos:", err);
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
  }, [chapterId]);

  const filteredData = videos.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  function handleVideoPress(item: Video) {
    if (!unlocked) {
      Alert.alert(
        "🔒 Locked",
        "This video is part of paid content. Purchase this chapter (or subject/year) to unlock it."
      );
      return;
    }

    Linking.openURL(item.youtubeUrl);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      <Text style={styles.subtitle}>Video Lectures</Text>

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
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => (
            <VideoCard
              title={item.title}
              locked={!unlocked}
              onPress={() => handleVideoPress(item)}
            />
          )}
          ListEmptyComponent={<EmptyState title="🔍 No Videos Found" />}
          ListFooterComponent={
            !unlocked ? (
              <UnlockOptionsPanel
                chapterId={chapterId}
                subjectId={subjectId}
                yearId={yearId}
              />
            ) : null
          }
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

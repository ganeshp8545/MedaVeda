import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";

import { useNavigation, useFocusEffect } from "@react-navigation/native";

import { fetchYears, Year } from "../../services/yearsService";
import { fetchProductsByYear, Product } from "../../services/productsService";
import { fetchMyPurchases, MyPurchase } from "../../services/purchasesService";
import { fetchNotifications, getUnreadNotificationCount, AppNotification } from "../../services/notificationsService";
import { fetchLatestChapters, fetchRecommendedChapters, Chapter } from "../../services/chaptersService";
import { getLastViewedChapter, getRecentChapters, RecentChapterEntry } from "../../utils/recentActivity";

import useQuizStats from "../../hooks/useQuizStats";
import usePurchases from "../../hooks/usePurchases";
import usePurchase from "../../hooks/usePurchase";
import useCourseYear from "../../hooks/useCourseYear";
import { needsCourseYearSelection } from "../../services/courseState";
import { logAppOpen } from "../../services/analyticsService";
import { applyPendingReferralCode } from "../../services/referralsService";
import { getCurrentUser, getCurrentUserDisplayName } from "../../services/authState";

import YearCard from "../../components/YearCard";
import HomeHeader from "../../components/HomeHeader";
import StudentProfileCard from "../../components/StudentProfileCard";
import ContinueLearningCard from "../../components/ContinueLearningCard";
import DailyQuoteCard from "../../components/DailyQuoteCard";
import SectionHeader from "../../components/SectionHeader";
import NotificationRow from "../../components/NotificationRow";
import MiniChapterCard from "../../components/MiniChapterCard";
import BottomNav from "../../components/BottomNav";
import StaggerItem from "../../components/StaggerItem";
import ProductCard from "../../components/ProductCard";
import ProductPosterCard from "../../components/ProductPosterCard";
import FeatureCard from "../../components/FeatureCard";
import { SkeletonBlock, SkeletonCardRow, SkeletonStrip } from "../../components/Skeleton";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

// Each dashboard section owns its own loading state and fetches
// independently, so a slow/failing section never blocks the rest of the
// screen - this is what lets every section show its own skeleton.
export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { totalAttempts, averagePercentage, bestScore, loading: statsLoading } = useQuizStats();

  const [refreshing, setRefreshing] = useState(false);

  // Shared Course/Year state (loaded once after login). Every course-scoped
  // fetch below waits for it and re-runs if the course changes.
  const courseYear = useCourseYear();
  const { ready, courseId, courseTitle, yearId, yearTitle } = courseYear;

  // Safety net for the post-login gate: if the profile turns out to have no
  // course/year (e.g. it couldn't be loaded at login), ask for it now.
  useEffect(() => {
    if (needsCourseYearSelection(courseYear)) navigation.replace("SelectCourseYear");
  }, [ready, courseId, yearId]);

  const [years, setYears] = useState<Year[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [yearsError, setYearsError] = useState<string | null>(null);

  // "Buy Notes" section: one Full-Year Notes Product per Academic Year
  // (the same "year" scope Product created in the admin panel's Products
  // page), shown right on the Home screen like Academic Years is. This is
  // the quick "buy the whole year" shortcut - the full Year -> Subject ->
  // Chapter drill-down for granular buying lives on the Store screen.
  const [yearProducts, setYearProducts] = useState<
    { year: Year; product: Product | null }[]
  >([]);
  const [yearProductsLoading, setYearProductsLoading] = useState(true);

  const { isOwned, refresh: refreshPurchases2 } = usePurchases();
  const { buy, purchasing } = usePurchase();

  const [purchases, setPurchases] = useState<MyPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const [latestChapters, setLatestChapters] = useState<Chapter[]>([]);
  const [latestLoading, setLatestLoading] = useState(true);

  const [recommended, setRecommended] = useState<Chapter[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);

  const [continueChapter, setContinueChapter] = useState<RecentChapterEntry | null>(null);
  const [recentChapters, setRecentChapters] = useState<RecentChapterEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const email = getCurrentUser()?.email ?? "";
  const displayName = getCurrentUserDisplayName() || (email ? email.split("@")[0] : "Student");

  const loadYears = useCallback(() => {
    setYearsLoading(true);
    setYearsError(null);
    return fetchYears(courseId)
      .then(setYears)
      .catch((err) => {
        console.error("Failed to load years:", err);
        setYearsError(
          err?.code === "failed-precondition"
            ? "Setup needed: open the browser console and click the Firestore index link Firebase gives you, then reload."
            : "Could not load years. Pull down to try again."
        );
      })
      .finally(() => setYearsLoading(false));
  }, [courseId]);

  const loadYearProducts = useCallback(() => {
    setYearProductsLoading(true);
    return fetchYears(courseId)
      .then(async (yrs) => {
        const sorted = [...yrs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const results = await Promise.all(
          sorted.map(async (year) => {
            const products = await fetchProductsByYear(year.id);
            return { year, product: products[0] ?? null };
          })
        );
        setYearProducts(results);
      })
      .catch((err) => console.error("Failed to load year notes products:", err))
      .finally(() => setYearProductsLoading(false));
  }, [courseId]);

  const loadPurchases = useCallback(() => {
    setPurchasesLoading(true);
    return fetchMyPurchases()
      .then(setPurchases)
      .catch((err) => console.error("Failed to load purchases:", err))
      .finally(() => setPurchasesLoading(false));
  }, []);

  const loadNotifications = useCallback(() => {
    setNotificationsLoading(true);
    return fetchNotifications()
      .then(setNotifications)
      .finally(() => setNotificationsLoading(false));
  }, []);

  const loadUnreadNotificationCount = useCallback(() => {
    return getUnreadNotificationCount()
      .then(setUnreadNotificationCount)
      .catch((err) => console.error("Failed to load unread notification count:", err));
  }, []);

  const loadLatest = useCallback(() => {
    setLatestLoading(true);
    return fetchLatestChapters(6, courseId)
      .then(setLatestChapters)
      .catch((err) => console.error("Failed to load latest updates:", err))
      .finally(() => setLatestLoading(false));
  }, [courseId]);

  const loadRecommended = useCallback(() => {
    setRecommendedLoading(true);
    return fetchRecommendedChapters(new Set(), yearId ?? years[0]?.id, 6, courseId)
      .then(setRecommended)
      .catch((err) => console.error("Failed to load recommendations:", err))
      .finally(() => setRecommendedLoading(false));
  }, [years, courseId, yearId]);

  const loadRecentActivity = useCallback(() => {
    setRecentLoading(true);
    return Promise.all([getLastViewedChapter(courseId), getRecentChapters(courseId)])
      .then(([last, list]) => {
        setContinueChapter(last);
        setRecentChapters(list.slice(1, 6)); // skip the "continue learning" one
      })
      .finally(() => setRecentLoading(false));
  }, [courseId]);

  useEffect(() => {
    loadPurchases();
    loadNotifications();
    loadUnreadNotificationCount();
    logAppOpen();

    // A referral code typed at sign-up is applied now that there's a session.
    applyPendingReferralCode().then((result) => {
      if (result?.status === "success") {
        Alert.alert("Referral applied", "Your friend's referral code has been applied.");
      }
    });
  }, []);

  // Course-scoped sections load once the student's course is known and
  // reload if it changes.
  useEffect(() => {
    if (!ready) return;
    loadYears();
    loadYearProducts();
    loadLatest();
  }, [ready, courseId]);

  // Recommendations depend on years being loaded first (used as a
  // preference signal), so kick off once years arrive.
  useEffect(() => {
    if (ready && !yearsLoading) loadRecommended();
  }, [ready, yearsLoading, courseId, yearId]);

  // Recently viewed / continue learning is local-device data, so refresh
  // it every time the screen regains focus (e.g. after finishing a chapter).
  useFocusEffect(
    useCallback(() => {
      loadRecentActivity();
      refreshPurchases2();
      loadUnreadNotificationCount();
    }, [loadRecentActivity, refreshPurchases2, loadUnreadNotificationCount])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      loadYears(),
      loadYearProducts(),
      loadPurchases(),
      loadNotifications(),
      loadUnreadNotificationCount(),
      loadLatest(),
      loadRecommended(),
      loadRecentActivity(),
    ]).finally(() => setRefreshing(false));
  }, [loadYears, loadYearProducts, loadPurchases, loadNotifications, loadUnreadNotificationCount, loadLatest, loadRecommended, loadRecentActivity]);

  const goToChapter = (c: { id: string; title: string; subjectId: string; subjectTitle: string; yearId: string; yearTitle: string }) => {
    navigation.navigate("ChapterDetails", {
      chapterId: c.id,
      chapterTitle: c.title,
      subjectId: c.subjectId,
      subjectTitle: c.subjectTitle,
      yearId: c.yearId,
      yearTitle: c.yearTitle,
    });
  };

  const overallProgress = totalAttempts > 0 ? averagePercentage : 0;

  return (
    <View style={styles.screen}>
      <HomeHeader unreadNotificationCount={unreadNotificationCount} />

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >
        {statsLoading || purchasesLoading ? (
          <SkeletonBlock height={92} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.lg }} />
        ) : (
          <StudentProfileCard
            name={displayName}
            email={email}
            progressPercentage={overallProgress}
            purchasedCount={purchases.length}
            courseLabel={
              courseTitle ? `${courseTitle}${yearTitle ? ` · ${yearTitle}` : ""}` : undefined
            }
            onPress={() => navigation.navigate("Profile")}
          />
        )}

        {recentLoading ? (
          <SkeletonBlock height={72} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.lg }} />
        ) : continueChapter ? (
          <ContinueLearningCard
            chapterTitle={continueChapter.chapterTitle}
            subjectTitle={continueChapter.subjectTitle}
            yearTitle={continueChapter.yearTitle}
            onPress={() =>
              goToChapter({
                id: continueChapter.chapterId,
                title: continueChapter.chapterTitle,
                subjectId: continueChapter.subjectId,
                subjectTitle: continueChapter.subjectTitle,
                yearId: continueChapter.yearId,
                yearTitle: continueChapter.yearTitle,
              })
            }
          />
        ) : null}

        <SectionHeader title="Academic Years" />
        {yearsLoading ? (
          <SkeletonCardRow count={3} />
        ) : yearsError ? (
          <Text style={styles.emptyText}>{yearsError}</Text>
        ) : years.length === 0 ? (
          <Text style={styles.emptyText}>No academic years added yet. Add one from the admin panel.</Text>
        ) : (
          <View style={styles.yearsList}>
            {years.map((item, index) => (
              <StaggerItem key={item.id} index={index}>
                <YearCard
                  title={item.title}
                  icon={item.icon}
                  color={item.color}
                  onPress={() => navigation.navigate("Subjects", { yearId: item.id, yearTitle: item.title })}
                />
              </StaggerItem>
            ))}
          </View>
        )}

        <SectionHeader title="Quick Access" />
        <FeatureCard
          title="PDF Notes"
          icon="📚"
          color={COLORS.success}
          onPress={() => navigation.navigate("Years", { mode: "notes" })}
        />
        <FeatureCard
          title="Video Lectures"
          icon="🎥"
          color={COLORS.info}
          onPress={() => navigation.navigate("Years", { mode: "videos" })}
        />
        <FeatureCard
          title="MCQ Test"
          icon="📝"
          color={COLORS.warning}
          onPress={() => navigation.navigate("Years", { mode: "quiz" })}
        />

        <SectionHeader title="Buy Notes" onSeeAll={() => navigation.navigate("Store")} />
        {yearProductsLoading ? (
          <SkeletonCardRow count={3} />
        ) : yearProducts.filter((yp) => yp.product !== null).length === 0 ? (
          <Text style={styles.emptyText}>
            No year-wise Notes packages available yet.
          </Text>
        ) : (
          <FlatList
            data={yearProducts.filter((yp) => yp.product !== null)}
            keyExtractor={(yp) => yp.year.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ marginBottom: SPACING.lg }}
            renderItem={({ item: yp, index }) => {
              const product = yp.product as Product;
              const owned = isOwned(product);

              return (
                <StaggerItem index={index}>
                  <ProductPosterCard
                    title={yp.year.title}
                    caption="Full Year Notes"
                    price={product.price}
                    originalPrice={product.originalPrice}
                    owned={owned}
                    colorIndex={index}
                    icon="📚"
                    onPress={() => {
                      if (owned) navigation.navigate("MyPurchases");
                      else navigation.navigate("Subjects", { yearId: yp.year.id, yearTitle: yp.year.title });
                    }}
                    onBuyPress={!owned ? () => buy(product) : undefined}
                    buying={purchasing}
                  />
                </StaggerItem>
              );
            }}
          />
        )}

        <SectionHeader title="Latest Updates" onSeeAll={() => navigation.navigate("Search")} />
        {latestLoading ? (
          <SkeletonStrip count={3} />
        ) : latestChapters.length === 0 ? (
          <Text style={styles.emptyText}>No new updates right now.</Text>
        ) : (
          <FlatList
            data={latestChapters}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ marginBottom: SPACING.lg }}
            renderItem={({ item }) => (
              <MiniChapterCard
                title={item.title}
                subtitle={item.subjectTitle}
                emoji="🆕"
                onPress={() => goToChapter(item as any)}
              />
            )}
          />
        )}

        <SectionHeader title="Recommended For You" />
        {recommendedLoading ? (
          <SkeletonStrip count={3} />
        ) : recommended.length === 0 ? (
          <Text style={styles.emptyText}>Explore a few chapters and we'll tailor picks for you.</Text>
        ) : (
          <FlatList
            data={recommended}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ marginBottom: SPACING.lg }}
            renderItem={({ item }) => (
              <MiniChapterCard
                title={item.title}
                subtitle={item.subjectTitle}
                emoji="✨"
                onPress={() => goToChapter(item as any)}
              />
            )}
          />
        )}

        {(recentLoading || recentChapters.length > 0) && (
          <>
            <SectionHeader title="Recently Viewed" />
            {recentLoading ? (
              <SkeletonStrip count={3} />
            ) : (
              <FlatList
                data={recentChapters}
                keyExtractor={(item) => item.chapterId}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ marginBottom: SPACING.lg }}
                renderItem={({ item }) => (
                  <MiniChapterCard
                    title={item.chapterTitle}
                    subtitle={item.subjectTitle}
                    emoji="🕘"
                    onPress={() =>
                      goToChapter({
                        id: item.chapterId,
                        title: item.chapterTitle,
                        subjectId: item.subjectId,
                        subjectTitle: item.subjectTitle,
                        yearId: item.yearId,
                        yearTitle: item.yearTitle,
                      })
                    }
                  />
                )}
              />
            )}
          </>
        )}

        <SectionHeader title="Purchased Packages" onSeeAll={() => navigation.navigate("MyPurchases")} />
        {purchasesLoading ? (
          <SkeletonCardRow count={2} />
        ) : purchases.length === 0 ? (
          <TouchableOpacity style={styles.storeBanner} activeOpacity={0.85} onPress={() => navigation.navigate("Store")}>
            <Text style={styles.storeBannerIcon}>🛍️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeBannerTitle}>Browse Notes</Text>
              <Text style={styles.storeBannerSubtitle}>Chapters, Subject & Year Packs, Bundles</Text>
            </View>
            <Text style={styles.storeBannerChevron}>›</Text>
          </TouchableOpacity>
        ) : (
          purchases.slice(0, 4).map((p) => (
            <ProductCard
              key={p.id}
              title={p.title}
              scope={p.scope}
              price={0}
              owned
              onPress={() => navigation.navigate("MyPurchases")}
            />
          ))
        )}

        <DailyQuoteCard />

        {!notificationsLoading && notifications.length > 0 && (
          <>
            <SectionHeader title="Notifications" />
            {notifications.slice(0, 3).map((n) => (
              <NotificationRow key={n.id} title={n.title} body={n.body} type={n.type} />
            ))}
          </>
        )}
      </ScrollView>

      <BottomNav active="Home" />

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

  body: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },

  yearsList: {
    marginBottom: SPACING.lg,
  },

  storeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOW.card,
  },

  storeBannerIcon: {
    fontSize: 26,
    marginRight: SPACING.md,
  },

  storeBannerTitle: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },

  storeBannerSubtitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },

  storeBannerChevron: {
    fontSize: 26,
    fontWeight: "300",
    color: COLORS.accent,
  },

  emptyText: {
    color: COLORS.subtitle,
    fontSize: 15,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});

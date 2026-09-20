import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "react-native";
import { useEffect } from "react";

import { COLORS } from "../theme/colors";
import {
  setupNotificationChannel,
  restoreStudyReminderOnLaunch,
} from "../services/studyReminderService";
import usePreventScreenshot from "../hooks/usePreventScreenshot";

import SplashScreen from "../screens/auth/SplashScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import ForgotPasswordScreen from "../screens/auth/ForgotPasswordScreen";

import HomeScreen from "../screens/home/HomeScreen";
import SelectCourseYearScreen from "../screens/onboarding/SelectCourseYearScreen";
import YearsScreen from "../screens/years/YearsScreen";
import SubjectsScreen from "../screens/subjects/SubjectsScreen";
import ChaptersScreen from "../screens/chapters/ChaptersScreen";
import ChapterDetailsScreen from "../screens/details/ChapterDetailsScreen";
import StoreScreen from "../screens/store/StoreScreen";

import NotesScreen from "../screens/notes/NotesScreen";
import VideosScreen from "../screens/videos/VideosScreen";
import TestListScreen from "../screens/quiz/TestListScreen";
import QuizScreen from "../screens/quiz/QuizScreen";

import ProfileScreen from "../screens/profile/ProfileScreen";
import EditProfileScreen from "../screens/profile/EditProfileScreen";
import ReferralScreen from "../screens/referral/ReferralScreen";
import ChangePasswordScreen from "../screens/profile/ChangePasswordScreen";
import MyPurchasesScreen from "../screens/purchases/MyPurchasesScreen";
import DownloadsScreen from "../screens/downloads/DownloadsScreen";

import PdfViewerScreen from "../screens/pdf/PdfViewerScreen";
import SearchScreen from "../screens/search/SearchScreen";

import SettingsScreen from "../screens/settings/SettingsScreen";
import StudyReminderScreen from "../screens/reminder/StudyReminderScreen";
import NotificationsScreen from "../screens/notifications/NotificationsScreen";
import PaymentSuccessScreen from "../screens/payment/PaymentSuccessScreen";
import PaymentFailedScreen from "../screens/payment/PaymentFailedScreen";
import PaymentCheckoutScreen from "../screens/payment/PaymentCheckoutScreen";
import AboutScreen from "../screens/about/AboutScreen";
import ContactScreen from "../screens/contact/ContactScreen";

import PrivacyScreen from "../screens/privacy/PrivacyScreen";
import TermsScreen from "../screens/terms/TermsScreen";

const Stack = createNativeStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    card: COLORS.card,
    text: COLORS.text,
    border: COLORS.border,
    primary: COLORS.accent,
  },
};

// Legacy: PaymentSuccess/PaymentFailed used to be reached via an
// medveda:// deep link from the external browser after the hosted
// checkout page finished. That flow is no longer used - payment now
// happens in-app (PaymentCheckoutScreen's WebView), which reaches these
// same screens via normal in-app navigation instead. Left in place in
// case a custom domain is set up later and this reverts to a browser
// based flow; harmless either way. Still requires app.json / app.config.js
// to declare "scheme": "medveda" for the deep link itself to work.
const linking = {
  prefixes: ["medveda://"],
  config: {
    screens: {
      PaymentSuccess: "payment-success",
      PaymentFailed: "payment-failed",
    },
  },
};

export default function AppNavigator() {
  // Runs once per app launch: makes sure the Android notification channel
  // exists, and re-applies the daily reminder if it was left "on" (mainly
  // a safety net for Android dropping exact alarms after a device
  // reboot - the OS otherwise keeps firing the schedule on its own).
  useEffect(() => {
    setupNotificationChannel();
    restoreStudyReminderOnLaunch();
  }, []);

  // Blocks screenshots/screen recording for the whole app (paid Notes PDF
  // content is the reason, but it's applied globally, not just on the
  // PDF viewer - see hooks/usePreventScreenshot.ts for exact platform
  // behavior/limits).
  usePreventScreenshot();

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <NavigationContainer theme={navigationTheme} linking={linking}>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{ headerShown: false }}
        >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="SelectCourseYear"
          component={SelectCourseYearScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="Years" component={YearsScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Subjects" component={SubjectsScreen} />
        <Stack.Screen name="Chapters" component={ChaptersScreen} />
        <Stack.Screen name="ChapterDetails" component={ChapterDetailsScreen} />
        <Stack.Screen name="Store" component={StoreScreen} />
        <Stack.Screen name="Notes" component={NotesScreen} />
        <Stack.Screen name="Videos" component={VideosScreen} />
        <Stack.Screen name="QuizTests" component={TestListScreen} />
        <Stack.Screen name="Quiz" component={QuizScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="Referral" component={ReferralScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="MyPurchases" component={MyPurchasesScreen} />
        <Stack.Screen name="Downloads" component={DownloadsScreen} />
        <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="StudyReminder" component={StudyReminderScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
        <Stack.Screen name="PaymentFailed" component={PaymentFailedScreen} />
        <Stack.Screen name="PaymentCheckout" component={PaymentCheckoutScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Contact" component={ContactScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    </>
  );
}

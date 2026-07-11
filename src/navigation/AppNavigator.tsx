import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "react-native";

import { COLORS } from "../theme/colors";

import SplashScreen from "../screens/auth/SplashScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import ForgotPasswordScreen from "../screens/auth/ForgotPasswordScreen";

import HomeScreen from "../screens/home/HomeScreen";
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
import MyPurchasesScreen from "../screens/purchases/MyPurchasesScreen";

import PdfViewerScreen from "../screens/pdf/PdfViewerScreen";
import SearchScreen from "../screens/search/SearchScreen";

import SettingsScreen from "../screens/settings/SettingsScreen";
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

export default function AppNavigator() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{ headerShown: false }}
        >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
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
        <Stack.Screen name="MyPurchases" component={MyPurchasesScreen} />
        <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
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

/*
  Removed from 2.0 navigation (old Premium flow):
    - "Premium"  (screens/premium/PremiumScreen.tsx)
    - "Upgrade"  (screens/premium/UpgradeScreen.tsx)

  These screens sold subscription plans ("Monthly ₹99", "Yearly ₹499", etc.)
  which is exactly the model 2.0 removes in favour of buying individual
  Products. You can delete both screen files and usePremium.ts /
  premiumService.ts once you confirm nothing else references them
  (search the project for "Premium" and "usePremium" to be sure).
  If you still want a subscription-style "buy everything" option, model it
  as a Product with type: "bundle" or "year" instead - the Store screen
  already supports that, no special-case code needed.
*/

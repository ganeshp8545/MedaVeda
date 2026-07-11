import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// getReactNativePersistence must be imported from the main "firebase/auth"
// entry point, NOT from the "firebase/auth/react-native" subpath. Metro
// (the RN/Expo bundler) cannot resolve that subpath export, which caused
// "Unable to resolve 'firebase/auth/react-native'" and a white screen on
// app start. getAuth/initializeAuth already resolve fine from "firebase/auth",
// confirming this is the correct entry point.
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIza_REDACTED",
  authDomain: "ayurpulse-ca8e4.firebaseapp.com",
  projectId: "ayurpulse-ca8e4",
  storageBucket: "ayurpulse-ca8e4.firebasestorage.app",
  messagingSenderId: "153261093470",
  appId: "1:153261093470:web:90100c7d3d6115f0bf7acf",
  measurementId: "G-JN98EMJ8D3",
};

export const app = initializeApp(firebaseConfig);

export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);
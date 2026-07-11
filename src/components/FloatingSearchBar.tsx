import React, { useEffect, useRef } from "react";
import { Animated, Easing, TouchableWithoutFeedback } from "react-native";

import { useNavigation } from "@react-navigation/native";
import SearchBar from "./SearchBar";

// Home screen's search entry point: a non-editable SearchBar (tapping it
// navigates to the real Search screen) that floats slightly over the
// header and gives tactile press feedback.
export default function FloatingSearchBar() {
  const navigation = useNavigation<any>();

  const entrance = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  const onPressIn = () => {
    Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, friction: 6, tension: 120 }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPress={() => navigation.navigate("Search")}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View
        style={{
          opacity: entrance,
          transform: [{ translateY }, { scale: pressScale }],
        }}
      >
        <SearchBar
          value=""
          onChangeText={() => {}}
          placeholder="Search notes, videos, quizzes..."
          editable={false}
          floating
        />
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

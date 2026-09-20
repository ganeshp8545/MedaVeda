import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { logError } from "../utils/logger";
import AnimatedPressable from "./motion/AnimatedPressable";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Catches any render-time error thrown by a screen/component below it in
// the tree and shows a fallback UI instead of the whole app going blank.
// Must be a class component - componentDidCatch has no hook equivalent.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // logError forwards this to Sentry while keeping
    // the same PII-safe policy used elsewhere.
    logError("ErrorBoundary caught a render error", error);

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error(info.componentStack);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>काहीतरी चूक झाली</Text>

        <Text style={styles.subtitle}>
          अनपेक्षित एरर आली आहे. कृपया पुन्हा प्रयत्न करा.
        </Text>

        <AnimatedPressable
          style={styles.button}
          onPress={this.handleRetry}
        >
          <Text style={styles.buttonText}>पुन्हा प्रयत्न करा</Text>
        </AnimatedPressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: 32,
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.subtitle,
    textAlign: "center",
    marginBottom: 24,
  },

  button: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },

  buttonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
});
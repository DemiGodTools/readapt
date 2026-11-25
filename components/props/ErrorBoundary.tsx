import React, { Component, ErrorInfo, ReactNode } from "react";
import { recordCrashlyticsError } from "../../lib/analytics";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    recordCrashlyticsError(error, errorInfo?.componentStack || "ErrorBoundary");
    if (__DEV__) {
      console.error("ErrorBoundary caught an unhandled exception:", error, errorInfo);
    }
  }

  handleRestart = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#090314" />
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>⚠️</Text>
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              An unexpected error occurred. Please try reloading the application.
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={this.handleRestart}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.devCard}>
                <Text style={styles.devTitle}>Developer Diagnostics:</Text>
                <Text style={styles.devError}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.devStack}>
                    {this.state.errorInfo.componentStack.slice(0, 400)}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090314",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 28,
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 210, 180, 0.3)",
  },
  iconText: {
    fontSize: 30,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 26,
    maxWidth: 320,
  },
  button: {
    backgroundColor: "#00D2B4",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 24,
    elevation: 3,
  },
  buttonText: {
    color: "#090314",
    fontSize: 15,
    fontWeight: "700",
  },
  devCard: {
    marginTop: 28,
    maxHeight: 180,
    width: "100%",
    backgroundColor: "#131B1F",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  devTitle: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  devError: {
    color: "#FCA5A5",
    fontSize: 12,
    fontFamily: "monospace",
    marginBottom: 6,
  },
  devStack: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
});

import { StatusBar } from "expo-status-bar";
import {
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  View,
} from "react-native";
import MainNavigation from "./components/nav/MainNavigation";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "./components/state/Toast";
import Modal from "./components/state/Modal";
import { DataProvider } from "./components/state/DataContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import * as NavigationBar from "expo-navigation-bar";
import AudioControls from "./components/props/AudioControls";
import { ErrorBoundary } from "./components/props/ErrorBoundary";

export default function App() {
  useEffect(() => {
    if (Platform.OS === "android") {
      RNStatusBar.setTranslucent(false);
      NavigationBar.setStyle("dark");
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <View style={styles.container}>
            <DataProvider>
              <MainNavigation />
              <AudioControls />
              <Toast />
              <Modal />
              <StatusBar style="light" backgroundColor="#090314" animated={true} />
            </DataProvider>
          </View>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050614",
  },
});

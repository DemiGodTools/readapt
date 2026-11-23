import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import pallete from '../../lib/Colors';
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from '../../components/nav/MainNavigation';
import useAuth from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

const { width, height } = Dimensions.get('window');

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

const SplashScreen = ({ route, navigation }: Props) => {
  const opacity = useRef(new Animated.Value(0.5)).current;
  const scale = useRef(new Animated.Value(0.66)).current;
  const transform = useRef(new Animated.Value(50)).current;

  const {isLoggedIn, isLoading} = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isLoggedIn) {
        navigation.replace("Login");
      } else {
        navigation.replace("Tabs");
      }
    }
  }, [isLoading, isLoggedIn]);

  useEffect(() => {
    // Minimal entrance animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(transform, {
        toValue: 0,
        duration: 900,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={pallete.bgmain || '#090314'} />

      <View
        style={[
          styles.logoWrap,
        ]}
      >
      <Animated.View
        style={[
          styles.logoWrapAmin,
          {
            opacity,
            transform: [{ scale }, { translateY: transform }],
          },
        ]}
      >
        <Image
          source={require('../../assets/splash-icon.png')} // adjust path to your assets folder
          style={styles.logo}
          resizeMode="contain"
        />
        </Animated.View>

        <Image
          source={require("../../assets/text.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: height,
    backgroundColor: pallete.bgmain || '#090314',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: width * 0.55,
    height: width * 0.55,
    borderRadius: width * 0.3,
    backgroundColor: '#2C3E50',
  },
  logoWrap: {
    paddingTop: 250,
    alignItems: 'center',
    height: height,
    justifyContent: 'space-between',
  },
  logoWrapAmin: {
    opacity: 0.5,
  },
  logoImage: {
    width: 430,
    height: 180,
  },
  logo: {
    width: width * 0.38,
    height: width * 0.38,
  },
});

export default SplashScreen;
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  Animated,
  Dimensions,
  StatusBar,
  Modal,
  Share,
  ActivityIndicator,
} from "react-native";
import Svg, { Path, Line, Circle, Polyline } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import pallete from "../../lib/Colors";
import useAuth from "../../hooks/useAuth";
import { IChapter } from "../../types/Chapter";
import PopButton from "../../components/props/PopButton";
import { useGlobalAudio } from "../../hooks/useGlobalAudio";
import NextChapter from "../../components/props/NextChapter";
import { api } from "../../lib/api";
import { IRecentRead } from "../../types/Storage";
import { useToast } from "../../hooks/useToast";
import { DeviceEventEmitter } from "react-native";
import { useUser } from "../../hooks/useUser";
import { useDownloads } from "../../hooks/useDownloads";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CommentsDrawer from "../../components/props/Comments";
import Offline from "../../components/state/Offline";
import { useNetworkStatus } from "../../hooks/useNetwork";
import {
  checkIsDownloaded,
  getSingleDownloaded,
} from "../../lib/downloadManager";
import Carousel from "react-native-reanimated-carousel";
import { ISeries, ISeriesContent } from "../../types/Series";
import QuestionCard from "../../components/props/QuestionCard";
import { IQuestion } from "../../types/Question";
import SmoothAudioSlider from "../../components/props/SmoothAudioSlider";

const colors = {
  bgMain: "#090314",
  bgCard: "rgba(20, 20, 20, 0.6)",
  accent: "#01796F",
  ctlBg: "#D0F2EE",
  ctlIcon: "#004D46",
  textGray: "#9ca3af",
  textWhite: "#ffffff",
  surfaceVariant: "rgba(255, 255, 255, 0.08)",
};
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Demo remote audio
const DEMO_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

// Sample lyrics in the IChapter.lyrics format for demo
const DEMO_LYRICS = `[00:00:00] - You let your feet run wild, time has come as we all oh go down
[00:00:08] - Oh, 'cause they will run you down, down till you fall
[00:00:16] - They will run you down, down till you go
[00:00:24] - Yeah, so you can't crawl no more
[00:00:32] - Say way down we go, ooh
[00:00:40] - Yeah, so you can't crawl no more
[00:00:48] - and way down we go oh oh oh
[00:00:56] - Way down we go
[00:01:04] - You let your feet run wild
[00:01:12] - Time has come as we all oh go down`;

type Props = {
  route: {
    params: {
      bookId: string;
    };
  };
  navigation: any;
};

type LyricLine = { time: number; text: string };

/** Parse IChapter.lyrics: "[00:01:00] - line 1\n[00:02:00] - line 2" → timed lines (seconds) */
const parseLyrics = (raw?: string): LyricLine[] => {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Supports [HH:MM:SS], [MM:SS], [M:SS], optional spaces around "-"
      const match = line.match(
        /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*[-–—]?\s*(.*)$/,
      );
      if (!match) return null;
      const hasHours = match[3] !== undefined;
      let hours = 0;
      let minutes = 0;
      let seconds = 0;
      if (hasHours) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        seconds = parseInt(match[3], 10);
      } else {
        minutes = parseInt(match[1], 10);
        seconds = parseInt(match[2], 10);
      }
      const time = hours * 3600 + minutes * 60 + seconds;
      const text = (match[4] || "").trim();
      if (!text) return null;
      return { time, text };
    })
    .filter((x): x is LyricLine => x !== null)
    .sort((a, b) => a.time - b.time);
};

const parseDurationToSec = (d: string | number): number => {
  if (typeof d === "number") return d;
  if (!d || typeof d !== "string") return 0;
  const parts = d.split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parseInt(d, 10) || 0;
};

const parseSpeed = (label: string): number => {
  const n = parseFloat(label.replace("x", ""));
  return isNaN(n) ? 1 : n;
};

const SPEED_OPTIONS = ["0.75x", "1.0x", "1.25x", "1.5x", "2.0x"];

const PlaybackButtons = memo(
  ({
    skipBy,
    isLoaded,
    currentTrack,
    source,
    playTrack,
    togglePlay,
    playBtnWidth,
    playBtnScale,
    playBtnBg,
    animatePlayBtn,
    isPlaying,
  }: {
    skipBy: (amount: number) => void;
    isLoaded: boolean;
    source: IChapter | null;
    playTrack: (source: IChapter) => void;
    currentTrack: any;
    togglePlay: () => void;
    playBtnWidth: Animated.AnimatedInterpolation<string | number>;
    playBtnScale: any;
    playBtnBg: Animated.AnimatedInterpolation<string | number>;
    animatePlayBtn: (scale: number) => void;
    isPlaying: boolean;
  }) => {
    const seekBtnAnimation = useRef(new Animated.Value(0)).current;
    const [animateIndex, setAnimateIndex] = useState(0);

    const animateSeekBtn = (toValue: number) => {
      Animated.spring(seekBtnAnimation, {
        toValue,
        useNativeDriver: false,
        friction: 7,
        tension: 120,
      }).start();
    };

    const seekBtnWidth = seekBtnAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [52, 70],
    });

    const seekBtnScale = seekBtnAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.96],
    });

    const seekBtnBg = seekBtnAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.ctlBg, "#B9D7D4"],
    });

    const handlePlayPress = () => {
      if (!source) return;
      if (
        currentTrack?._id === source._id ||
        (source.media && currentTrack?.media === source.media)
      ) {
        togglePlay();
      } else {
        playTrack(source);
      }
    };

    return (
      <View style={styles.playbackButtonsRow}>
        <Pressable
          onPress={() => skipBy(-15)}
          onPressIn={() => {
            setAnimateIndex(0);
            animateSeekBtn(1);
          }}
          onPressOut={() => animateSeekBtn(0)}
          disabled={!isLoaded}>
          <Animated.View
            style={[
              styles.mediaBtn,
              styles.circleSkipBtn,
              animateIndex === 0
                ? {
                    width: seekBtnWidth,
                    transform: [{ scale: seekBtnScale }],
                    backgroundColor: seekBtnBg,
                  }
                : {
                    transform: [{ scale: 1 }],
                    backgroundColor: colors.ctlBg,
                  },
            ]}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"
                fill={isLoaded ? colors.ctlIcon : "rgba(156,163,175,0.3)"}
              />
            </Svg>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={handlePlayPress}
          onPressIn={() => animatePlayBtn(1)}
          onPressOut={() => animatePlayBtn(0)}
          disabled={!isLoaded}>
          <Animated.View
            style={[
              styles.mediaBtn,
              styles.mainPlayBtn,
              {
                width: playBtnWidth,
                transform: [{ scale: playBtnScale }],
                backgroundColor: playBtnBg,
              },
            ]}>
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path
                d={
                  isPlaying ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"
                }
                fill={colors.ctlIcon}
              />
            </Svg>
            <Text style={styles.playBtnText}>{isPlaying ? "Pause" : "Play"}</Text>
          </Animated.View>
        </Pressable>

        <Pressable
          style={[styles.mediaBtn, styles.circleSkipBtn]}
          onPress={() => skipBy(15)}
          onPressIn={() => {
            setAnimateIndex(1);
            animateSeekBtn(1);
          }}
          onPressOut={() => animateSeekBtn(0)}
          disabled={!isLoaded}>
          <Animated.View
            style={[
              styles.mediaBtn,
              styles.circleSkipBtn,
              animateIndex === 1
                ? {
                    width: seekBtnWidth,
                    transform: [{ scale: seekBtnScale }],
                    backgroundColor: seekBtnBg,
                  }
                : {
                    transform: [{ scale: 1 }],
                    backgroundColor: colors.ctlBg,
                  },
            ]}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M13 6v12l8.5-6L13 6zM4 18l8.5-6L4 6v12z"
                fill={isLoaded ? colors.ctlIcon : "rgba(156,163,175,0.3)"}
              />
            </Svg>
          </Animated.View>
        </Pressable>
      </View>
    );
  }
);

const AudioPlayerScreen = ({ route }: Props) => {
  const navigation = useNavigation();
  const { accessToken } = useAuth();
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [speed, setSpeed] = useState("1.0x");
  const { user, reload } = useUser();
  const { isConnected } = useNetworkStatus();
  const [book, setBook] = useState<IChapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [commentedQueId, setCommentedQueId] = useState("");
  const [questions, setQuestions] = useState<ISeriesContent[] | null>(null);

  const chapterId = route?.params?.bookId;
  const lyricsScrollRef = useRef<ScrollView>(null);
  const activeLineRef = useRef(0);
  const [showComments, setShowComments] = useState(false);

  // Play button press animation
  const playBtnAnim = useRef(new Animated.Value(0)).current;

  // Global Audio Context
  const { player, status, currentTrack, togglePlay, playTrack, seekTo } =
    useGlobalAudio();

  const isPlaying = status?.playing ?? false;
  const isLoaded = status?.isLoaded ?? false;
  const isAudioLoading = Boolean(book?.media) && !status?.isLoaded;
  const durationSec = status?.duration ?? 0;

  // Check if liked by current user safely
  const [isLiked, setIsLiked] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (user && user.likes && chapterId) {
      const isalreadyLiked = user.likes.some((item: any) => {
        const id = typeof item === "string" ? item : item?._id;
        return id === chapterId;
      });
      setIsLiked(Boolean(isalreadyLiked));
    }
  }, [user, chapterId]);

  // Fetch Questions for series
  useEffect(() => {
    if (!book || !book.series) return;
    const fetchQuestions = async () => {
      try {
        const series: ISeries =
          typeof book.series === "object" ? (book.series as any) : null;
        if (!series || !series.chapters) return;

        const contents = series.chapters || [];
        const chapterIndex = contents.findIndex((item) => {
          return (item.content as any)?._id === book._id;
        });

        const chapterQues: ISeriesContent[] = [];
        if (chapterIndex !== -1) {
          for (let index = chapterIndex + 1; index < contents.length; index++) {
            const item = contents[index];
            if (item.contentModel !== "Question") break;
            chapterQues.push(item);
          }
        }
        setQuestions(chapterQues);
      } catch (error) {
        console.error("Error fetching questions:", error);
      }
    };

    fetchQuestions();
  }, [book?._id]);

  const animatePlayBtn = (toValue: number) => {
    Animated.spring(playBtnAnim, {
      toValue,
      useNativeDriver: false,
      friction: 7,
      tension: 120,
    }).start();
  };

  const playBtnWidth = playBtnAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [130, 175],
  });

  const playBtnScale = playBtnAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
  });

  const playBtnBg = playBtnAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.ctlBg, "#B9D7D4"],
  });

  // Timed lyrics from book.lyrics (or demo)
  const transcriptions = useMemo(
    () => parseLyrics(book?.lyrics ?? DEMO_LYRICS),
    [book?.lyrics]
  );

  const activeTranscriptionIndex = useMemo(() => {
    if (!transcriptions.length) return -1;
    const t = status?.currentTime || 0;
    let idx = 0;
    for (let i = 0; i < transcriptions.length; i++) {
      if (transcriptions[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [transcriptions, status?.currentTime]);

  // Auto-scroll lyrics to active line
  useEffect(() => {
    if (!showLyrics || activeTranscriptionIndex < 0) return;
    if (activeLineRef.current === activeTranscriptionIndex) return;
    activeLineRef.current = activeTranscriptionIndex;
    const y = Math.max(0, activeTranscriptionIndex * 62 - 40);
    lyricsScrollRef.current?.scrollTo({ y, animated: true });
  }, [activeTranscriptionIndex, showLyrics]);

  const { showToast } = useToast();
  const { downloadChapter } = useDownloads();

  // Load chapter with full error handling and offline fallback
  const fetchChapter = useCallback(async () => {
    if (!chapterId) return;
    setIsLoading(true);
    try {
      if (isConnected) {
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }
        const chapter = await api.get(`/chapter/${chapterId}`, { headers });
        if (chapter.data?.data) {
          setBook(chapter.data.data);
        }
      } else {
        const isDownloaded = await checkIsDownloaded(chapterId);
        if (!isDownloaded) {
          showToast({
            title: "You seem to be offline. Please connect to Internet",
          });
        }
        const downloaded = await getSingleDownloaded(chapterId);
        if (downloaded) {
          setBook(downloaded as any);
        }
      }
    } catch (error) {
      console.error("Error fetching chapter:", error);
      try {
        const downloaded = await getSingleDownloaded(chapterId);
        if (downloaded) {
          setBook(downloaded as any);
        }
      } catch (_) {}
    } finally {
      setIsLoading(false);
    }
  }, [chapterId, accessToken, isConnected, showToast]);

  useEffect(() => {
    fetchChapter();
  }, [fetchChapter]);

  // Only start playback if track is not already the current active track!
  useEffect(() => {
    if (!book || !book._id) return;
    const targetUrl = book.media || DEMO_AUDIO_URL;
    if (currentTrack?._id !== book._id && currentTrack?.media !== targetUrl) {
      playTrack(book);
    }
  }, [book?._id, book?.media, currentTrack?._id, currentTrack?.media, playTrack]);

  // Keep playback rate in sync when speed label changes
  useEffect(() => {
    const rate = parseSpeed(speed);
    try {
      if (typeof player?.setPlaybackRate === "function") {
        player.setPlaybackRate(rate);
      } else if (player) {
        player.playbackRate = rate;
      }
    } catch (_) {}
  }, [speed, player]);

  const seekToSec = useCallback(
    (sec: number) => {
      if (!isLoaded || durationSec <= 0) return;
      const clamped = Math.max(0, Math.min(sec, durationSec));
      seekTo(clamped);
    },
    [isLoaded, durationSec, seekTo]
  );

  const skipBy = useCallback(
    (deltaSec: number) => {
      seekToSec((status?.currentTime || 0) + deltaSec);
    },
    [seekToSec, status?.currentTime]
  );

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
  };

  const resetInfo = () => {
    setIsLiked(false);
    setIsLoading(true);
    setSpeed("1.0x");
  };

  const lastSavedPlayRef = useRef<number | null>(null);

  useEffect(() => {
    if (!chapterId) return;
    const getRecentRead = async () => {
      try {
        const readChapters = await AsyncStorage.getItem("recentReads");
        if (!readChapters) return;
        const recentReads: IRecentRead[] = JSON.parse(readChapters);
        const existingRead = recentReads.find(
          (recentRead) => recentRead.content?._id === chapterId
        );
        if (!existingRead) return;
        const lastOpen = parseInt(existingRead.readtill, 10);
        if (!isNaN(lastOpen) && lastOpen > 0) {
          seekToSec(lastOpen);
          lastSavedPlayRef.current = lastOpen;
        }
      } catch (_) {}
    };
    getRecentRead();
  }, [chapterId, book?._id, seekToSec]);

  const updateRecentReads = async () => {
    if (!book) return;
    const currentPageValue = Math.max(0, Math.floor(status?.currentTime || 0));
    if (lastSavedPlayRef.current === currentPageValue) return;

    // Hardcoded 00:10 ke bajaye sound/status ki actual duration lijiye
    const realTotalDuration = Math.max(
      0,
      Math.floor(
        durationSec > 0
          ? durationSec
          : (book as any)?.duration
          ? Number((book as any).duration)
          : (book as any)?.total
          ? Number((book as any).total)
          : 0
      )
    );

    try {
      let oldRecentReads = await AsyncStorage.getItem("recentReads");
      if (!oldRecentReads) oldRecentReads = "[]";
      const recentReads: IRecentRead[] = JSON.parse(oldRecentReads);
      const newRecentReads = recentReads.filter(
        (item) => item.content?._id !== chapterId
      );
      newRecentReads.push({
        content: {
          ...book,
          comments:
            typeof book.comments === "number"
              ? book.comments
              : Array.isArray(book.comments)
              ? (book.comments as any).length
              : 0,
          category:
            (book.category as any)?.name ||
            (book.category as any)?._id ||
            book.category ||
            "",
        },
        readtill: String(currentPageValue),
        total: String(realTotalDuration),
        readAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem("recentReads", JSON.stringify(newRecentReads));
      lastSavedPlayRef.current = currentPageValue;
    } catch (error) {
      console.error("Error updating recent reads:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      void updateRecentReads();
    });

    return () => {
      unsubscribe();
    };
  }, [navigation, chapterId, book, status?.currentTime]);

  const like = async () => {
    if (!isConnected) {
      showToast({
        title: "Please connect to the Internet.",
      });
      return;
    }
    const currentLikes = typeof book?.likes === "number" ? book.likes : 0;
    const nextState = !isLiked;
    const resolvedLikes = nextState ? currentLikes + 1 : Math.max(0, currentLikes - 1);
    setIsLiked(nextState);
    // Optimistic count update
    setBook((prev) =>
      prev ? { ...prev, likes: resolvedLikes } : prev,
    );

    try {
      DeviceEventEmitter?.emit("like-updated", {
        chapterId,
        liked: nextState,
        count: resolvedLikes,
      });
    } catch {}

    try {
      await api.post(
        "/chapter/like",
        { chapterId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    } catch (error) {
      setIsLiked(!nextState);
      setBook((prev) => {
        if (!prev) return prev;
        const current = typeof prev.likes === "number" ? prev.likes : 0;
        return {
          ...prev,
          likes: !nextState ? current + 1 : Math.max(0, current - 1),
        };
      });
      console.error("Error liking chapter:", error);
    } finally {
      reload();
    }
  };

  const share = async () => {
    await Share.share({
      message: "https://play.google.com/store/apps",
    });
  };

  const download = async () => {
    if (!book || !user) return;
    if (!book?.isDownloadable) {
      showToast({
        title: "This Chapter is not downloadable",
      });
      return;
    }
    if (user?.subscription.plan < 2) {
      showToast({
        title: "Please upgrade your plan to download this chapter",
      });
      return;
    }
    const isAlreadyDownloaded = await checkIsDownloaded(book._id);
    if (isAlreadyDownloaded) {
      showToast({
        title: "This Chapter is already Downloaded",
      });
      return;
    }

    downloadChapter(book);
    showToast({
      title: "Download started",
    });
  };

  const renderQuestionCard = ({ item }: { item: ISeriesContent }) => {
    if (item.contentModel === "Question" && typeof item.content !== "string") {
      const questionData = item.content as IQuestion;
      return (
        <QuestionCard
          onCommentClick={() => {
            setCommentedQueId(questionData._id);
            setShowComments(true);
          }}
          key={questionData._id}
          question={questionData}
        />
      );
    }
    return null;
  };

  // Safe counts
  const likesCount = useMemo(() => {
    if (!book) return 0;
    if (typeof book.likes === "number") return book.likes;
    if (Array.isArray(book.likes)) return (book.likes as any).length;
    return 0;
  }, [book]);

  const commentsCount = useMemo(() => {
    if (!book) return 0;
    if (typeof book.comments === "number") return book.comments;
    if (Array.isArray(book.comments)) return (book.comments as any).length;
    return 0;
  }, [book]);

  // ─── Control Icon Button ─────────────────────────────────────
  const ControlItem = ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => (
    <Pressable style={styles.controlItem} onPress={onPress}>
      {children}
    </Pressable>
  );

  if (!book && !isConnected) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: 100, alignItems: "center", justifyContent: "center" },
        ]}>
        <Offline />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* ── Player Container ─────────────────────────────────── */}
        <View style={styles.playerContainer}>
          {/* Cover + Overlay Controls */}
          <Pressable onPress={() => setShowFullscreen(true)}>
            <View style={styles.audioImg}>
              {book?.cover ? (
                <Image source={{ uri: book.cover }} style={styles.coverImage} />
              ) : (
                <View style={[styles.coverImage, styles.coverPlaceholder]}>
                  {isLoading && <ActivityIndicator color={colors.accent} />}
                </View>
              )}

              <View style={styles.mediaControlsOverlay}>
                <View style={styles.timelineContainer}>
                  <SmoothAudioSlider
                    currentTime={status?.currentTime || 0}
                    duration={durationSec}
                    onSeek={seekToSec}
                    disabled={isAudioLoading || !isLoaded || durationSec <= 0}
                    minimumTrackTintColor="#007AFF"
                    maximumTrackTintColor="#ffffff71"
                    thumbTintColor="#007AFF"
                  />
                </View>

                <PlaybackButtons
                  skipBy={skipBy}
                  source={book}
                  isLoaded={isLoaded}
                  currentTrack={currentTrack}
                  playTrack={playTrack}
                  togglePlay={togglePlay}
                  playBtnWidth={playBtnWidth}
                  playBtnScale={playBtnScale}
                  playBtnBg={playBtnBg}
                  animatePlayBtn={animatePlayBtn}
                  isPlaying={isPlaying}
                />
              </View>
            </View>
          </Pressable>

          {/* Book Details */}
          <View style={styles.bookDetails}>
            <Text style={styles.bookTitle}>{book?.title || "Loading..."}</Text>

            <View style={styles.row}>
              <Text style={styles.bookAuthor}>
                by {book?.author || "Unknown"}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>{likesCount} likes</Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>{commentsCount} comments</Text>
            </View>

            {/* Control Stats Bar */}
            <View style={styles.controlStatsBar}>
              <View style={styles.leftControlsGroup}>
                <ControlItem onPress={like}>
                  <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                    <Svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill={isLiked ? "#eb4040" : "none"}
                      stroke={isLiked ? "#eb4040" : colors.textGray}
                      strokeWidth="2">
                      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </Svg>
                  </Animated.View>
                </ControlItem>

                <ControlItem onPress={() => setShowComments(true)}>
                  <Svg
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.textGray}
                    strokeWidth="2">
                    <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </Svg>
                </ControlItem>

                <ControlItem onPress={share}>
                  <Svg
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.textGray}
                    strokeWidth="2">
                    <Circle cx="18" cy="5" r="3" />
                    <Circle cx="6" cy="12" r="3" />
                    <Circle cx="18" cy="19" r="3" />
                    <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </Svg>
                </ControlItem>

                <ControlItem onPress={download}>
                  <Svg
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.textGray}
                    strokeWidth="2">
                    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <Polyline points="7 10 12 15 17 10" />
                    <Line x1="12" y1="15" x2="12" y2="3" />
                  </Svg>
                </ControlItem>
              </View>

              <ControlItem>
                <Svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.textGray}
                  strokeWidth="2">
                  <Circle cx="12" cy="12" r="10" />
                  <Line x1="12" y1="16" x2="12" y2="12" />
                  <Line x1="12" y1="8" x2="12.01" y2="8" />
                </Svg>
              </ControlItem>
            </View>
          </View>
        </View>

        {questions && questions.length > 0 && (
          <View style={styles.pollSection}>
            <Carousel
              loop={false}
              width={SCREEN_WIDTH}
              height={510}
              style={{
                width: SCREEN_WIDTH,
              }}
              data={questions}
              pagingEnabled
              snapEnabled
              mode="parallax"
              onConfigurePanGesture={(gestureChain) =>
                gestureChain.activeOffsetX([-15, 15]).failOffsetY([-10, 10])
              }
              modeConfig={{
                parallaxScrollingScale: 0.92,
                parallaxScrollingOffset: 0,
              }}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: (SCREEN_WIDTH / 100) * 85,
                    height: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                  }}>
                  <View
                    style={{
                      width: (SCREEN_WIDTH / 100) * 85,
                      height: "100%",
                    }}>
                    {renderQuestionCard({ item })}
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* ── Next Chapters ────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Next Chapters</Text>
          </View>
          {book && (
            <NextChapter
              book={book as any}
              onOpen={(nextBook: any) => {
                updateRecentReads();
                resetInfo();
                setBook(nextBook);
              }}
              viewer="audio"
            />
          )}
        </View>
      </ScrollView>

      {/* ── Fullscreen Overlay ─────────────────────────────────── */}
      <Modal visible={showFullscreen} animationType="fade" statusBarTranslucent>
        <View style={styles.fullscreenOverlay}>
          <Pressable
            style={styles.fsCloseTrigger}
            onPress={() => setShowFullscreen(false)}>
            <Svg
              width={22}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5">
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          </Pressable>

          <Pressable
            style={styles.fsTocTrigger}
            onPress={() => setShowToc(true)}>
            <Svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2">
              <Line x1="8" y1="6" x2="21" y2="6" />
              <Line x1="8" y1="12" x2="21" y2="12" />
              <Line x1="8" y1="18" x2="21" y2="18" />
              <Circle cx="3" cy="6" r="1" fill="#fff" />
              <Path d="M3 10 v4" stroke="#fff" />
              <Circle cx="3" cy="18" r="1" fill="#fff" />
            </Svg>
          </Pressable>

          <View style={styles.fullscreenImage}>
            {book?.cover ? (
              <Image source={{ uri: book.cover }} style={styles.fsCoverImg} />
            ) : (
              <View style={[styles.fsCoverImg, styles.coverPlaceholder]} />
            )}
          </View>

          <View style={styles.fullscreenControls}>
            <View style={styles.timelineContainer}>
              <SmoothAudioSlider
                currentTime={status?.currentTime || 0}
                duration={durationSec}
                onSeek={seekToSec}
                disabled={isAudioLoading || !isLoaded || durationSec <= 0}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#ffffff71"
                thumbTintColor="#007AFF"
              />
            </View>

            <PlaybackButtons
              skipBy={skipBy}
              source={book}
              isLoaded={isLoaded}
              currentTrack={currentTrack}
              playTrack={playTrack}
              togglePlay={togglePlay}
              playBtnWidth={playBtnWidth}
              playBtnScale={playBtnScale}
              playBtnBg={playBtnBg}
              animatePlayBtn={animatePlayBtn}
              isPlaying={isPlaying}
            />

            <View style={styles.fsUtilitiesRow}>
              <Pressable style={styles.speedBtn} onPress={cycleSpeed}>
                <Text style={styles.speedBtnText}>{speed}</Text>
              </Pressable>

              <Pressable
                style={styles.lyricsBtn}
                onPress={() => {
                  setShowFullscreen(false);
                  setShowLyrics(true);
                }}>
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.textGray}
                  strokeWidth="2">
                  <Line x1="4" y1="6" x2="20" y2="6" />
                  <Line x1="4" y1="12" x2="20" y2="12" />
                  <Line x1="4" y1="18" x2="14" y2="18" />
                </Svg>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Lyrics / Transcriptions Panel ───────────────────────── */}
      <Modal visible={showLyrics} animationType="slide" statusBarTranslucent>
        <View style={styles.lyricsPanelSheet}>
          <Pressable
            style={styles.fsCloseTrigger}
            onPress={() => setShowLyrics(false)}>
            <Svg
              width={22}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5">
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          </Pressable>

          <ScrollView
            ref={lyricsScrollRef}
            style={styles.lyricsScroll}
            showsVerticalScrollIndicator={false}>
            {transcriptions.length === 0 ? (
              <Text style={[styles.lyricsLine, { opacity: 0.4 }]}>
                No transcriptions available
              </Text>
            ) : (
              transcriptions.map((line, i) => (
                <PopButton
                  onPress={() => {
                    seekToSec(line.time);
                  }}
                  key={i}>
                  <Text
                    style={[
                      styles.lyricsLine,
                      i === activeTranscriptionIndex && styles.lyricsLineActive,
                    ]}>
                    {line.text}
                  </Text>
                </PopButton>
              ))
            )}
          </ScrollView>

          <View style={styles.fullscreenControls}>
            <View style={styles.timelineContainer}>
              <SmoothAudioSlider
                currentTime={status?.currentTime || 0}
                duration={durationSec}
                onSeek={seekToSec}
                disabled={isAudioLoading || !isLoaded || durationSec <= 0}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#ffffff71"
                thumbTintColor="#007AFF"
              />
            </View>

            <PlaybackButtons
              skipBy={skipBy}
              source={book}
              isLoaded={isLoaded}
              currentTrack={currentTrack}
              playTrack={playTrack}
              togglePlay={togglePlay}
              playBtnWidth={playBtnWidth}
              playBtnScale={playBtnScale}
              playBtnBg={playBtnBg}
              animatePlayBtn={animatePlayBtn}
              isPlaying={isPlaying}
            />

            <View style={styles.fsUtilitiesRow}>
              <Pressable style={styles.speedBtn} onPress={cycleSpeed}>
                <Text style={styles.speedBtnText}>{speed}</Text>
              </Pressable>
              <Pressable
                style={styles.lyricsBtn}
                onPress={() => setShowLyrics(false)}>
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.textGray}
                  strokeWidth="2.5">
                  <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </Svg>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Table of Contents Modal ───────────────────────────── */}
      <Modal visible={showToc} transparent animationType="fade">
        <Pressable
          style={styles.tocBackdrop}
          onPress={() => setShowToc(false)}
        />
        <View style={styles.tocSideSheet}>
          <Text style={styles.tocHeader}>TABLE OF CONTENTS</Text>
          <View style={styles.tocChipsList}>
            {(book?.toc?.length
              ? book.toc.map((t) => ({
                  name: t.title,
                  duration: t.cut,
                }))
              : [
                  { name: "Introduction", duration: "03:14" },
                  { name: "The Ego Illusion", duration: "3:18" },
                  { name: "Social Conditioning", duration: "4:22" },
                  { name: "Emotional Discipline", duration: "5:01" },
                ]
            ).map((ch, i) => (
              <Pressable
                key={i}
                style={styles.tocChipCard}
                onPress={() => seekToSec(parseDurationToSec(ch.duration))}>
                <Text style={styles.chipChapterName}>{ch.name}</Text>
                <Text style={styles.chipDurationIndex}>{ch.duration}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <CommentsDrawer
        visible={showComments}
        reload={fetchChapter}
        onClose={() => setShowComments(false)}
        chapterId={chapterId}
        initialComments={
          Array.isArray(book?.comments) ? (book?.comments as any) : []
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
    paddingTop: 95,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  playerContainer: {
    padding: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  audioImg: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#12121c",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  coverImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  coverPlaceholder: {
    backgroundColor: "#181424",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaControlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 20,
    backgroundColor: "rgba(5, 3, 10, 0.75)",
  },
  timelineContainer: {
    width: "100%",
    marginBottom: 14,
  },
  playbackButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    height: 60,
  },
  mediaBtn: {
    backgroundColor: colors.ctlBg,
    alignItems: "center",
    justifyContent: "center",
  },
  circleSkipBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  mainPlayBtn: {
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    gap: 8,
  },
  playBtnText: {
    fontWeight: "700",
    fontSize: 15,
    color: colors.ctlIcon,
  },
  bookDetails: {
    marginTop: 4,
  },
  bookTitle: {
    fontFamily: "Playfair Display",
    fontSize: 22,
    fontWeight: "600",
    color: colors.textWhite,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  bookAuthor: {
    fontSize: 13,
    color: colors.textGray,
  },
  divider: {
    width: 3,
    height: 3,
    backgroundColor: colors.textGray,
    borderRadius: 50,
    opacity: 0.4,
  },
  statItem: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
  },
  controlStatsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
  },
  leftControlsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  controlItem: {
    padding: 4,
  },
  section: {
    marginBottom: 40,
  },
  pollSection: {
    marginBottom: 20,
    overflow: "hidden",
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#e5e7eb",
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  fsCloseTrigger: {
    position: "absolute",
    top: 50,
    left: 24,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 50,
    padding: 10,
    zIndex: 10,
  },
  fsTocTrigger: {
    position: "absolute",
    top: 50,
    right: 24,
    backgroundColor: "rgba(5,5,5,0.9)",
    borderRadius: 50,
    padding: 10,
    zIndex: 10,
  },
  fullscreenImage: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1,
    marginTop: 60,
    alignSelf: "center",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 20,
  },
  fsCoverImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  fullscreenControls: {
    width: "100%",
    marginTop: "auto",
    paddingBottom: 10,
  },
  fsUtilitiesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: 20,
  },
  speedBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    minWidth: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  speedBtnText: {
    color: colors.textGray,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  lyricsBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lyricsPanelSheet: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  lyricsScroll: {
    flex: 1,
    paddingTop: 10,
  },
  lyricsLine: {
    fontSize: 24,
    fontWeight: "700",
    color: "rgba(255,255,255,0.25)",
    lineHeight: 34,
    marginBottom: 28,
  },
  lyricsLineActive: {
    color: "#ffffff",
  },
  tocBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  tocSideSheet: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "75%",
    maxWidth: 320,
    backgroundColor: "rgba(15,15,15,0.98)",
    padding: 24,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
  },
  tocHeader: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.accent,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 20,
  },
  tocChipsList: {
    gap: 10,
  },
  tocChipCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipChapterName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#e5e7eb",
  },
  chipDurationIndex: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    backgroundColor: "rgba(1,121,111,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});

export default AudioPlayerScreen;
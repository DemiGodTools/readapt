// File: components/props/Comments.tsx
import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Vibration,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import Svg, { Line, Polyline, Path } from "react-native-svg";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useAuth from "../../hooks/useAuth";
import PopButton from "./PopButton";
import { useToast } from "../../hooks/useToast";
import { api } from "../../lib/api";
import { useUser } from "../../hooks/useUser";
import { useNetworkStatus } from "../../hooks/useNetwork";
import CachedImage from "./CachedImage";
import { avatarUri } from "../../lib/imageUpload";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_HEIGHT = SCREEN_HEIGHT * 0.85;
const CLOSE_THRESHOLD = 120;
const BUTTON_WIDTH = 96;
const BUTTON_HEIGHT = 36;
const HOLD_DURATION_MS = 600; // Snappy 600ms hold
const CONFIRM_SHEET_HEIGHT = 280;

const Shimmer = createShimmerPlaceholder(LinearGradient);
const SKELETON_COLORS: string[] = ["#191525", "#221e2e", "#191525"];
const COMMENTS_STORAGE_PREFIX = "@comments_";

// Keeps the last known comments for a chapter in memory so reopening the sheet
// (or switching between a chapter and its Q&A) paints instantly.
const commentsMemoryCache = new Map<string, Comment[]>();
const commentsCacheKey = (chapterId: string, isQuestion: boolean) =>
  `${isQuestion ? "qna" : "chapter"}:${chapterId}`;

const CommentSkeleton = () => (
  <View style={styles.skeletonList}>
    {Array.from({ length: 4 }).map((_, index) => (
      <View key={`comment-skelly-${index}`} style={styles.skeletonRow}>
        <Shimmer
          shimmerColors={SKELETON_COLORS}
          duration={1500}
          style={styles.skeletonAvatar}
        />
        <View style={styles.skeletonContent}>
          <View style={styles.skeletonMeta}>
            <Shimmer
              shimmerColors={SKELETON_COLORS}
              duration={1500}
              style={styles.skeletonName}
            />
            <Shimmer
              shimmerColors={SKELETON_COLORS}
              duration={1500}
              style={styles.skeletonHandle}
            />
          </View>
          <Shimmer
            shimmerColors={SKELETON_COLORS}
            duration={1500}
            style={styles.skeletonLine}
          />
          {index % 2 === 0 ? (
            <Shimmer
              shimmerColors={SKELETON_COLORS}
              duration={1500}
              style={styles.skeletonLineShort}
            />
          ) : null}
        </View>
      </View>
    ))}
  </View>
);

export type Comment = {
  _id: string;
  isPosting?: boolean;
  by: {
    _id?: string;
    name?: string;
    username?: string;
    userId?: string;
    image?: string;
    imageMd?: string;
    imageSm?: string;
    profileLevel?: number;
  };
  userEmail?: string;
  userName?: string;
  userHandle?: string;
  userImage?: string;
  text: string;
  createdAt: string;
};

type Props = {
  visible: boolean;
  reload: () => void;
  onClose: () => void;
  chapterId: string; 
  initialComments?: Comment[]; 
  isQuestion?: boolean; 
};

const triggerHaptic = (duration = 14) => {
  try {
    const Haptics = require("expo-haptics");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      Vibration.vibrate(duration);
    });
  } catch {
    Vibration.vibrate(duration);
  }
};

const CommentsDrawer = ({
  visible,
  reload,
  onClose,
  chapterId,
  initialComments = [],
  isQuestion = false,
}: Props) => {
  const { accessToken } = useAuth();
  const { user } = useUser();
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  // Posting & blinking animation states
  const [isPosting, setIsPosting] = useState(false);
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null);
  const [blinkingCommentId, setBlinkingCommentId] = useState<string | null>(null);

  // Active floating delete menu state
  const [activeMenu, setActiveMenu] = useState<{
    comment: Comment;
    x: number;
    y: number;
  } | null>(null);

  // Active delete confirmation bottom sheet state
  const [confirmComment, setConfirmComment] = useState<Comment | null>(null);

  const touchCoordsRef = useRef<{ pageX: number; pageY: number }>({
    pageX: SCREEN_WIDTH / 2,
    pageY: 300,
  });

  const translateY = useSharedValue(DRAWER_HEIGHT);
  const context = useSharedValue({ y: 0 });
  const keyboardOffset = useSharedValue(0);

  // Floating button animated appearance (Snappy timing, NO spring bouncy)
  const menuAnimScale = useSharedValue(0.92);
  const menuAnimOpacity = useSharedValue(0);

  // Draggable confirmation bottom sheet animated values
  const confirmSheetTranslateY = useSharedValue(CONFIRM_SHEET_HEIGHT);
  const confirmContext = useSharedValue({ y: 0 });

  const closeDeleteMenu = useCallback(() => {
    setActiveMenu(null);
  }, []);

  const openConfirmSheet = useCallback((comment: Comment) => {
    setConfirmComment(comment);
    confirmSheetTranslateY.value = CONFIRM_SHEET_HEIGHT;
    confirmSheetTranslateY.value = withTiming(0, { duration: 180 });
  }, []);

  const closeConfirmSheet = useCallback(() => {
    confirmSheetTranslateY.value = withTiming(CONFIRM_SHEET_HEIGHT, { duration: 160 }, () => {
      runOnJS(setConfirmComment)(null);
    });
  }, []);

  useEffect(() => {
    if (activeMenu) {
      menuAnimScale.value = 0.92;
      menuAnimOpacity.value = 0;
      menuAnimScale.value = withTiming(1, { duration: 110 });
      menuAnimOpacity.value = withTiming(1, { duration: 100 });
    }
  }, [activeMenu]);

  useEffect(() => {
    if (!visible) return;

    const cacheKey = commentsCacheKey(chapterId, isQuestion);
    const memory = commentsMemoryCache.get(cacheKey);
    if (memory && memory.length > 0) {
      setComments(memory);
      setLoading(false);
    } else if (Array.isArray(initialComments) && initialComments.length > 0) {
      const valid = initialComments.filter(
        (c: any) => c && c._id && typeof c.text === "string"
      );
      if (valid.length > 0) {
        setComments(valid);
        commentsMemoryCache.set(cacheKey, valid);
        setLoading(false);
      }
    }

    // Paint the last disk copy before the network answers (works offline too).
    if (!memory || memory.length === 0) {
      AsyncStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${cacheKey}`)
        .then((raw) => {
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const valid = parsed.filter(
            (c: any) => c && c._id && typeof c.text === "string"
          );
          commentsMemoryCache.set(cacheKey, valid);
          setComments((prev) => (prev.length > 0 ? prev : valid));
          setLoading(false);
        })
        .catch(() => {});
    }
  }, [visible, chapterId, isQuestion]);

  useEffect(() => {
    if (visible) {
      translateY.value = DRAWER_HEIGHT;
      translateY.value = withSpring(0, {
        damping: 48,
        stiffness: 220,
      });
      // ⚡ Always fetch fresh comments from the server on open
      fetchComments();
    } else {
      translateY.value = withTiming(DRAWER_HEIGHT, { duration: 200 });
      setText(""); 
      setActiveMenu(null);
      setConfirmComment(null);
    }
  }, [visible, chapterId]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showListener = Keyboard.addListener(showEvent, (e) => {
      keyboardOffset.value = withTiming(e.endCoordinates.height, {
        duration: Platform.OS === "ios" ? e.duration : 180,
      });
    });

    const hideListener = Keyboard.addListener(hideEvent, () => {
      keyboardOffset.value = withTiming(0, {
        duration: Platform.OS === "ios" ? 200 : 180,
      });
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const inputAnimatedStyle = useAnimatedStyle(() => ({
    marginBottom: keyboardOffset.value,
  }));

  const floatingMenuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: menuAnimOpacity.value,
    transform: [{ scale: menuAnimScale.value }],
  }));

  const confirmSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: confirmSheetTranslateY.value }],
  }));

  const confirmBackdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      confirmSheetTranslateY.value,
      [0, CONFIRM_SHEET_HEIGHT],
      [0.6, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const fetchComments = async () => {
    if (!chapterId) return;
    const cacheKey = commentsCacheKey(chapterId, isQuestion);

    // Only show the skeleton when we truly have nothing to render.
    setLoading(!commentsMemoryCache.get(cacheKey)?.length);

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      if (user?.email) headers["x-user-email"] = user.email;

      // Lightweight endpoint: comments only, instead of the whole chapter.
      const res = await api
        .get("/chapter/comment", {
          params: { chapterId, qna: isQuestion ? 1 : 0 },
          headers,
          timeout: 12000,
        })
        .catch(() => null);

      let freshComments = res?.data?.data ?? res?.data?.comments;

      // Fallback for backends that do not expose the light endpoint yet.
      if (!Array.isArray(freshComments)) {
        const legacy = await api
          .get(`/chapter/${chapterId}`, { headers })
          .catch(() => null);
        freshComments = isQuestion
          ? legacy?.data?.data?.qnaComments
          : legacy?.data?.data?.comments;
      }

      if (Array.isArray(freshComments)) {
        // Safe filter: ensure every comment is valid and non-null
        const valid = freshComments.filter(
          (c: any) => c && c._id && typeof c.text === "string"
        );
        commentsMemoryCache.set(cacheKey, valid);
        AsyncStorage.setItem(
          `${COMMENTS_STORAGE_PREFIX}${cacheKey}`,
          JSON.stringify(valid)
        ).catch(() => {});
        setComments(valid);
      }
    } catch (err) {
      console.warn("Silent comments fetch warning:", err);
    } finally {
      setLoading(false);
    }
  };

  const closeDrawer = useCallback(() => {
    setActiveMenu(null);
    setConfirmComment(null);
    translateY.value = withTiming(DRAWER_HEIGHT, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      if (activeMenu) {
        runOnJS(closeDeleteMenu)();
      }
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      translateY.value = Math.max(0, newY);
    })
    .onEnd((event) => {
      if (event.translationY > CLOSE_THRESHOLD || event.velocityY > 750) {
        translateY.value = withTiming(DRAWER_HEIGHT, { duration: 200 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, {
          damping: 48,
          stiffness: 220,
        });
      }
    });

  const confirmPanGesture = Gesture.Pan()
    .onStart(() => {
      confirmContext.value = { y: confirmSheetTranslateY.value };
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        confirmSheetTranslateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 70 || event.velocityY > 600) {
        confirmSheetTranslateY.value = withTiming(CONFIRM_SHEET_HEIGHT, { duration: 160 }, () => {
          runOnJS(closeConfirmSheet)();
        });
      } else {
        confirmSheetTranslateY.value = withTiming(0, { duration: 140 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, DRAWER_HEIGHT],
      [0.6, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Resilient ownership check: Matches by user._id, user email, or username handle
  const isMyComment = useCallback(
    (item: Comment) => {
      if (!user) return false;
      const myId = String(user._id || "");
      const authorId = String(item?.by?._id || "");
      if (myId && authorId && myId === authorId) return true;

      const myEmail = (user.email || "").trim().toLowerCase();
      const commentEmail = String((item as any).userEmail || "").trim().toLowerCase();
      if (myEmail && commentEmail && myEmail === commentEmail) return true;

      const myHandle = (user.userId || "").replace(/^@/, "").trim().toLowerCase();
      const authorHandle = String(item?.by?.userId || (item as any).userHandle || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase();
      if (myHandle && authorHandle && myHandle === authorHandle) return true;

      return false;
    },
    [user]
  );

  const getCommentDisplay = useCallback(
    (item: Comment) => {
      const isMine = isMyComment(item);
      const name =
        item.by?.name || (item as any).userName || (isMine ? (user?.name || "You") : "Anonymous");
      const handle =
        item.by?.userId || (item as any).userHandle || (isMine ? (user?.userId || "user") : "user");
      // Smallest stored avatar: a comment row is ~36px, so pulling the 128px
      // variant keeps the drawer light on slow connections.
      const image =
        isMine && user?.image
          ? avatarUri(user, "sm")
          : avatarUri(item.by as any, "sm") || (item as any).userImage || "";

      return {
        name,
        handle: handle.startsWith("@") ? handle : `@${handle}`,
        image,
      };
    },
    [isMyComment, user]
  );

  const handleLongPress = (item: Comment, e: any) => {
    if (!isMyComment(item)) return;

    triggerHaptic(12);

    const touchX =
      e.nativeEvent?.pageX ??
      touchCoordsRef.current.pageX ??
      SCREEN_WIDTH / 2;
    const touchY =
      e.nativeEvent?.pageY ??
      touchCoordsRef.current.pageY ??
      300;

    let targetX =
      touchX > SCREEN_WIDTH / 2
        ? touchX - BUTTON_WIDTH - 10
        : touchX + 10;

    targetX = Math.max(16, Math.min(targetX, SCREEN_WIDTH - BUTTON_WIDTH - 16));

    let targetY = touchY - BUTTON_HEIGHT - 12;
    const drawerTop = SCREEN_HEIGHT - DRAWER_HEIGHT;

    if (targetY < drawerTop + 50) {
      targetY = touchY + 16;
    }

    targetY = Math.max(drawerTop + 16, Math.min(targetY, SCREEN_HEIGHT - 90));

    setActiveMenu({
      comment: item,
      x: targetX,
      y: targetY,
    });
  };

  // Called when user confirms deletion from the bottom sheet
  const executeCommentDeletion = async (targetComment: Comment) => {
    if (!targetComment || !targetComment._id) return;

    // Guard: cannot delete posting comment
    if (targetComment._id === postingCommentId || (targetComment as any).isPosting) {
      return;
    }

    closeConfirmSheet();
    triggerHaptic(14);

    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }

    const commentIdToDelete = targetComment._id;
    const originalComments = [...comments];

    // Optimistic removal: Remove immediately from state
    setComments((prev) => prev.filter((c) => c._id !== commentIdToDelete));

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      if (user?.email) headers["x-user-email"] = user.email;

      const payload = { commentId: commentIdToDelete, chapterId };

      let res = await api
        .post("/chapter/comment/remove", payload, { headers })
        .catch(() => null);

      if (!res?.data?.success) {
        res = await api
          .delete("/chapter/comment", { data: payload, headers })
          .catch(() => null);
      }

      if (res?.data?.success) {
        showToast({ title: "Comment deleted" });
        reload?.();
      } else {
        throw new Error(res?.data?.message || "Failed to delete comment");
      }
    } catch (err: any) {
      console.error("Delete comment error:", err);
      setComments(originalComments);
      showToast({ title: err?.message || "Could not delete comment. Try again." });
    }
  };

  // Instant posting with spinner on send button, subtle gray card while posting, and blink on success
  const handleSend = async () => {
    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }

    const trimmed = text.trim();
    if (!trimmed || isPosting) return;

    const tempId = `posting_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const optimisticComment: Comment = {
      _id: tempId,
      isPosting: true,
      by: {
        _id: user?._id || "temp_user",
        name: user?.name || "You",
        userId: user?.userId ? "@" + user.userId : "@you",
        image: user?.image || "",
        imageMd: (user as any)?.imageMd,
        imageSm: (user as any)?.imageSm,
      } as any,
      userEmail: user?.email || undefined,
      userName: user?.name || "You",
      userHandle: user?.userId || "you",
      userImage: user?.image || "",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    // ⚡ Instant UI update: clear text and place subtle-gray card at the top
    setText("");
    setComments((prev) => [optimisticComment, ...prev]);
    setIsPosting(true);
    setPostingCommentId(tempId);

    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    if (user?.email) headers["x-user-email"] = user.email;

    const payload = { chapterId, text: trimmed, isQna: isQuestion };

    try {
      let res: any = null;
      try {
        res = await api.post("/chapter/comment", payload, { headers });
      } catch (postErr: any) {
        try {
          res = await api.post("/chapter/comment/add", payload, { headers });
        } catch (fallbackErr: any) {
          const serverMsg =
            fallbackErr?.response?.data?.message ||
            postErr?.response?.data?.message ||
            fallbackErr?.message ||
            "Could not post comment";
          throw new Error(serverMsg);
        }
      }

      if (res?.data?.success) {
        const realComment = res.data?.comment || res.data?.data;
        if (realComment && realComment._id) {
          const finalizedComment = {
            ...realComment,
            isPosting: false,
            by: {
              _id: user?._id || realComment.by?._id,
              name: user?.name || realComment.by?.name || "You",
              userId: user?.userId || realComment.by?.userId || "you",
              image: user?.image || realComment.by?.image,
              imageMd: (user as any)?.imageMd || realComment.by?.imageMd,
              imageSm: (user as any)?.imageSm || realComment.by?.imageSm,
              profileLevel: user?.profileLevel || realComment.by?.profileLevel || 1,
            },
            userEmail: user?.email,
          };

          // Update comment from temp to real server comment
          setComments((prev) =>
            prev.map((c) => (c._id === tempId ? finalizedComment : c))
          );

          // Card blinks and returns to normal state!
          setBlinkingCommentId(finalizedComment._id);
          triggerHaptic(10);
          setTimeout(() => {
            setBlinkingCommentId((curr) => (curr === finalizedComment._id ? null : curr));
          }, 450);
        }
        reload?.();
      } else {
        throw new Error(res?.data?.message || "Failed to post comment");
      }
    } catch (err: any) {
      console.error("Comment post error:", err);
      // Remove posting card and restore draft
      setComments((prev) => prev.filter((c) => c._id !== tempId));
      setText(trimmed);
      showToast({ title: err?.message || "Could not post comment. Tap to retry." });
    } finally {
      setIsPosting(false);
      setPostingCommentId(null);
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    if (!item || !item._id || typeof item.text !== "string") {
      return null;
    }

    const isMine = isMyComment(item);
    const isThisPosting = item._id === postingCommentId || (item as any).isPosting;
    const isThisBlinking = item._id === blinkingCommentId;
    const isSelected = activeMenu?.comment?._id === item._id || confirmComment?._id === item._id;
    const author = getCommentDisplay(item);

    return (
      <Pressable
        onPressIn={(e) => {
          if (isMine && !isThisPosting) {
            touchCoordsRef.current = {
              pageX: e.nativeEvent.pageX,
              pageY: e.nativeEvent.pageY,
            };
          }
        }}
        delayLongPress={HOLD_DURATION_MS}
        onLongPress={(e) => {
          // CANNOT delete comment while it is posting!
          if (!isMine || isThisPosting) return;
          handleLongPress(item, e);
        }}
        style={({ pressed }) => [
          styles.commentItemWrapper,
          isThisPosting && styles.commentItemPosting,
          isThisBlinking && styles.commentItemBlinking,
          isSelected && styles.commentItemSelected,
          pressed && isMine && !isThisPosting && styles.commentItemPressed,
        ]}>
        <View style={styles.commentItem}>
          <CachedImage
            uri={author.image}
            label={author.name}
            style={styles.userAvatar}
            letterSize={14}
            transition={0}
          />
          <View style={styles.commentContent}>
            <View style={styles.commentMeta}>
              <Text style={[styles.userName, isThisPosting && styles.textSubtleGray]}>
                {author.name}
              </Text>
              <Text style={styles.userHandle}>{author.handle}</Text>
              <Text style={styles.commentDate}>
                {isThisPosting ? "Posting..." : formatDate(item.createdAt)}
              </Text>
            </View>
            <Text style={[styles.commentText, isThisPosting && styles.textSubtleGray]}>
              {item.text}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (!visible) return null;

  return (
    <GestureHandlerRootView
      style={[styles.rootContainer, { zIndex: 9999, elevation: 9999 }]}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View style={[styles.drawer, animatedStyle]}>
        <GestureDetector gesture={panGesture}>
          <View>
            <View style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.header}>
              <Text style={styles.headerText}>
                {isQuestion ? "QnA Comments" : "Comments"}
              </Text>
              <View style={styles.headerCount}>
                <Text style={styles.headerCountText}>
                  {formatCount(comments.length)}
                </Text>
              </View>
            </View>
          </View>
        </GestureDetector>

        <FlatList
          data={comments}
          keyExtractor={(item, index) => String(item?._id ?? index)}
          renderItem={renderComment}
          scrollEnabled={true}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => {
            if (activeMenu) closeDeleteMenu();
          }}
          ListEmptyComponent={
            loading ? (
              <CommentSkeleton />
            ) : (
              <View style={styles.emptyCommentsBox}>
                <Text style={styles.emptyTitleText}>No Comments Yet</Text>
                <Text style={styles.emptyText}>
                  Be the first to share your thoughts about this!
                </Text>
              </View>
            )
          }
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View style={[styles.inputWrapper, inputAnimatedStyle]}>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.inputField}
                placeholder="Say something..."
                placeholderTextColor="rgba(156, 163, 175, 0.5)"
                value={text}
                onChangeText={setText}
                multiline={false}
                maxLength={500}
                editable={!isPosting}
              />

              <PopButton onPress={handleSend}>
                <View
                  style={[
                    styles.sendBtn,
                    (!text.trim() || isPosting) && styles.sendBtnDisabled,
                  ]}>
                  {isPosting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.2">
                      <Line x1="12" y1="19" x2="12" y2="5" />
                      <Polyline points="5 12 12 5 19 12" />
                    </Svg>
                  )}
                </View>
              </PopButton>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Adaptive floating delete button overlay */}
      {activeMenu && (
        <>
          <Pressable
            style={styles.floatingMenuBackdrop}
            onPress={closeDeleteMenu}
          />
          <Animated.View
            style={[
              styles.floatingDeleteButton,
              {
                left: activeMenu.x,
                top: activeMenu.y,
              },
              floatingMenuAnimatedStyle,
            ]}>
            <Pressable
              style={({ pressed }) => [
                styles.floatingDeleteInner,
                pressed && styles.floatingDeleteInnerPressed,
              ]}
              onPress={() => {
                const target = activeMenu.comment;
                closeDeleteMenu();
                openConfirmSheet(target);
              }}>
              <Svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <Polyline points="3 6 5 6 21 6" />
                <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <Line x1="10" y1="11" x2="10" y2="17" />
                <Line x1="14" y1="11" x2="14" y2="17" />
              </Svg>
              <Text style={styles.floatingDeleteText}>Delete</Text>
            </Pressable>
          </Animated.View>
        </>
      )}

      {/* Draggable Confirmation Bottom Sheet */}
      {confirmComment && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Animated.View style={[styles.confirmBackdrop, confirmBackdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeConfirmSheet} />
          </Animated.View>

          <GestureDetector gesture={confirmPanGesture}>
            <Animated.View style={[styles.confirmSheet, confirmSheetAnimatedStyle]}>
              <View style={styles.confirmDragHandleArea}>
                <View style={styles.confirmDragHandle} />
              </View>

              <View style={styles.confirmContent}>
                <View style={styles.confirmIconContainer}>
                  <Svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <Polyline points="3 6 5 6 21 6" />
                    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <Line x1="10" y1="11" x2="10" y2="17" />
                    <Line x1="14" y1="11" x2="14" y2="17" />
                  </Svg>
                </View>

                <Text style={styles.confirmTitle}>Delete comment?</Text>
                <Text style={styles.confirmSubtitle}>
                  Are you sure you want to delete this comment? This action cannot be undone.
                </Text>

                <View style={styles.confirmActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmDeleteBtn,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={() => executeCommentDeletion(confirmComment)}>
                    <Text style={styles.confirmDeleteBtnText}>Delete Comment</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmCancelBtn,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={closeConfirmSheet}>
                    <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      )}
    </GestureHandlerRootView>
  );
};

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${String(d.getFullYear()).slice(-2)}`;
  } catch {
    return "";
  }
};

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
};

const styles = StyleSheet.create({
  rootContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 1,
    elevation: 1,
  },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: "#0f0f0f",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    zIndex: 10000,
    elevation: 10000,
  },
  dragHandleArea: {
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 4,
  },
  headerText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  headerCount: {
    backgroundColor: "rgba(1, 121, 111, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  headerCountText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#01796F",
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    flexGrow: 1,
  },
  commentItemWrapper: {
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  commentItemPosting: {
    opacity: 0.55,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  commentItemBlinking: {
    backgroundColor: "rgba(1, 121, 111, 0.22)",
    borderRadius: 10,
  },
  textSubtleGray: {
    color: "#9ca3af",
  },
  commentItemSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  commentItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  commentItem: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  commentContent: {
    flex: 1,
    gap: 4,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  userName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e5e7eb",
  },
  userHandle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
  },
  commentDate: {
    fontSize: 11,
    color: "#6b7280",
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#d1d5db",
  },
  loaderCenter: {
    marginTop: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonList: {
    paddingTop: 2,
  },
  skeletonRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  skeletonAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  skeletonContent: {
    flex: 1,
    gap: 8,
    paddingTop: 1,
  },
  skeletonMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skeletonName: {
    width: 92,
    height: 10,
    borderRadius: 5,
  },
  skeletonHandle: {
    width: 54,
    height: 8,
    borderRadius: 4,
  },
  skeletonLine: {
    width: "100%",
    height: 11,
    borderRadius: 5,
  },
  skeletonLineShort: {
    width: "62%",
    height: 11,
    borderRadius: 5,
  },
  emptyCommentsBox: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    paddingHorizontal: 20,
    gap: 6,
  },
  emptyTitleText: {
    textAlign: "center",
    color: "#e5e7eb",
    fontWeight: "600",
    fontSize: 17,
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 13,
    lineHeight: 18,
  },
  inputWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  inputBox: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  inputField: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#01796F",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  // Floating delete menu
  floatingMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 10001,
  },
  floatingDeleteButton: {
    position: "absolute",
    zIndex: 10002,
    elevation: 12,
    backgroundColor: "#1c1c1e",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  floatingDeleteInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  floatingDeleteInnerPressed: {
    opacity: 0.7,
  },
  floatingDeleteText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  // Confirmation Bottom Sheet Styles
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 10003,
  },
  confirmSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: CONFIRM_SHEET_HEIGHT,
    backgroundColor: "#141416",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    zIndex: 10004,
    elevation: 16,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  confirmDragHandleArea: {
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
  },
  confirmContent: {
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  confirmIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  confirmSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  confirmActions: {
    width: "100%",
    gap: 10,
  },
  confirmDeleteBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmCancelBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelBtnText: {
    color: "#d1d5db",
    fontSize: 14,
    fontWeight: "500",
  },
  btnPressed: {
    opacity: 0.75,
  },
});

export default CommentsDrawer;

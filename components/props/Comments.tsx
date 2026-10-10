import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Keyboard,
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
import Svg, { Line, Polyline } from "react-native-svg";
import useAuth from "../../hooks/useAuth";
import PopButton from "./PopButton"; // your existing PopButton
import pallete from "../../lib/Colors";
import { useToast } from "../../hooks/useToast";
import { api } from "../../lib/api";
import { useUser } from "../../hooks/useUser";
import { IComment } from "../../types/Comment";
import { useNetworkStatus } from "../../hooks/useNetwork";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAWER_HEIGHT = SCREEN_HEIGHT * 0.85;
const CLOSE_THRESHOLD = 120;

// ─── Types ────────────────────────────────────────────────────
export type Comment = {
  _id: string;
  by: {
    _id: string;
    name?: string;
    username?: string;
    userId: string;
    image: string;
  };
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

// ─── Component ────────────────────────────────────────────────
const CommentsDrawer = ({
  visible,
  reload,
  onClose,
  chapterId,
  initialComments = [],
  isQuestion = false,
}: Props) => {
  const {accessToken} = useAuth();
  const { user } = useUser();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus()
  const translateY = useSharedValue(DRAWER_HEIGHT);
  const context = useSharedValue({ y: 0 });

  // Open / Close animation
  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: 50,
        stiffness: 200,
      });
      fetchComments();
    } else {
      translateY.value = withTiming(DRAWER_HEIGHT, { duration: 250 });
    }
  }, [visible]);

  const keyboardOffset = useSharedValue(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showListener = Keyboard.addListener(showEvent, (e) => {
      // Smoothly animate the offset to match keyboard height
      keyboardOffset.value = withTiming(e.endCoordinates.height, {
        duration: Platform.OS === "ios" ? e.duration : 200,
      });
    });

    const hideListener = Keyboard.addListener(hideEvent, (e) => {
      keyboardOffset.value = withTiming(0, {
        duration: Platform.OS === "ios" ? e.duration : 200,
      });
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Define animated style using the shared value
  const inputAnimatedStyle = useAnimatedStyle(() => {
    return {
      marginBottom: keyboardOffset.value, // or bottom: keyboardOffset.value if position: 'absolute'
    };
  });

  const fetchComments = async () => {
    setComments(initialComments);
  };

  const closeDrawer = useCallback(() => {
    translateY.value = withTiming(DRAWER_HEIGHT, { duration: 250 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose]);

  // ─── Gesture ────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      translateY.value = Math.max(0, newY); // only allow dragging down
    })
    .onEnd((event) => {
      if (event.translationY > CLOSE_THRESHOLD || event.velocityY > 800) {
        translateY.value = withTiming(DRAWER_HEIGHT, { duration: 250 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, {
          damping: 50,
          stiffness: 200,
        });
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

  // ─── Post Comment ───────────────────────────────────────────
  const handleSend = async () => {
     if (!isConnected) {
      showToast({
        title: "Please connect to the Internet.",
      });
      return;
    }
    if (!text.trim() || !accessToken || posting) {
      showToast({ title: "Alredy sent please wait" });
      return;
    }

    setPosting(true);
    try {
      const res = await api.post(
        isQuestion ? "/question/comment" : "/chapter/comment/add",
        {
          chapterId,
          text: text.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (res.data?.success && user) {
        // Optimistically add the new comment
        const newComment: Comment = {
          _id: res.data?._id || Date.now().toString(),
          by: {
            _id: user._id,
            name: user.name || "Anonymous",
            userId: "@" + user.userId,
            image: user?.image || "",
          },
          text: text.trim(),
          createdAt: new Date().toISOString(),
        };
        setComments((prev) => [newComment, ...prev]);
        setText("");
      } else {
        console.warn("Failed to post comment:", res.data?.message);
      }
    } catch (err) {
      console.error("Comment post error:", err);
    } finally {
      reload();
      setPosting(false);
    }
  };

  const getCommentsOfQue = async () => {
    try {
      const initialComments = await api.get(
        `/question/get-comments/${chapterId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      setComments(initialComments.data.data);
    } catch (error) {
      console.error("error while loding comment for the ques, ", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isQuestion && accessToken && visible) {
      getCommentsOfQue();
    } else if (!isQuestion && accessToken && visible) {
      setLoading(false)
    }
  }, [accessToken, visible, isConnected]);

  // ─── Render Item ────────────────────────────────────────────
  const renderComment = ({ item }: { item: Comment }) => (
    <PopButton>
      <View style={styles.commentItem}>
        <Image
          source={{
            uri: item.by.image || "https://via.placeholder.com/64",
          }}
          style={styles.userAvatar}
        />
        <View style={styles.commentContent}>
          <View style={styles.commentMeta}>
            <Text style={styles.userName}>{item.by?.name || "Anonymous"}</Text>
            <Text style={styles.userHandle}>{item.by?.userId || "@user"}</Text>
            <Text style={styles.commentDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
      </View>
    </PopButton>
  );

  if (!visible) return null;

  return (
    <GestureHandlerRootView
      style={[styles.rootContainer, { zIndex: 9999, elevation: 9999 }]}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, animatedStyle]}>
        <GestureDetector gesture={panGesture}>
          {/* Drag Handle */}
          <View>
            <View style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerText}>Comments</Text>
              <View style={styles.headerCount}>
                <Text style={styles.headerCountText}>
                  {formatCount(comments.length)}
                </Text>
              </View>
            </View>
          </View>
        </GestureDetector>

        {/* Comments List */}
        <FlatList
          data={comments}
          keyExtractor={(item) => item._id}
          renderItem={renderComment}
          scrollEnabled={true}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <>
              {loading ? (
                <ActivityIndicator color={pallete.accent} size={30} />
              ) : (
                  <View style={styles.emptyCommentsBox}>
                    <Text style={styles.emptyTitleText}>No Comments Yet</Text>
                    <Text style={styles.emptyText}>Be the first to share your thoughts about this!</Text>
                  </View>
              )}
            </>
          }
        />

        {/* Input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
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
                editable={!posting}
              />

              <PopButton onPress={handleSend}>
                <View
                  style={[
                    styles.sendBtn,
                    (!text.trim() || posting) && styles.sendBtnDisabled,
                  ]}>
                  {posting ? (
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
    </GestureHandlerRootView>
  );
};

// ─── Helpers ──────────────────────────────────────────────────
const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getFullYear()).slice(-2)}`;
  } catch {
    return "";
  }
};

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
};

// ─── Styles ───────────────────────────────────────────────────
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
    flex: 1,
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
    paddingBottom: 20,
  },
  commentItem: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    color: "#9ca3af",
  },
  userHandle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
  },
  commentDate: {
    fontSize: 11,
    color: "#9ca3af",
    opacity: 0.7,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#e5e7eb",
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 14,
  },
  emptyTitleText : {
    textAlign: "center",
    color: "#c5c5c5",
fontWeight: "600",
    fontSize: 18,
    marginTop: 40,
  }, 
  emptyCommentsBox : {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  inputWrapper: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 44,
    backgroundColor: "rgba(15, 15, 15, 0.95)",
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
    paddingVertical: 6,
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
});

export default CommentsDrawer;

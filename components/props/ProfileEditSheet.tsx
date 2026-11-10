import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import pallete from "../../lib/Colors";
import { api } from "../../lib/api";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { avatarUri } from "../../lib/imageUpload";
import CachedImage from "./CachedImage";

const ACCENT = "#00D2B4";
const DANGER = "#ef4444";
const NAME_MAX = 40;
const BIO_MAX = 160;

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set([
  "admin",
  "administrator",
  "readapt",
  "root",
  "support",
  "help",
  "official",
  "moderator",
  "system",
  "api",
  "dev",
  "developer",
  "guest",
  "null",
  "undefined",
]);

type Props = {
  visible: boolean;
  onClose: () => void;
  onChangePhoto: () => void;
  isUploadingPhoto?: boolean;
};

type UsernameState = {
  checking: boolean;
  available: boolean | null;
  message: string;
};

const validateName = (value: string): string | null => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length < 2) return "Name must be at least 2 characters";
  if (clean.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer`;
  if (!NAME_PATTERN.test(clean)) return "That name contains unsupported characters";
  return null;
};

/**
 * Edit profile sheet
 * ---------------------------------------------------------------------------
 * Saves optimistically: the header in the profile screen updates the moment
 * the user taps Save, the sheet closes immediately, and the request runs in
 * the background. If the server rejects it we roll the local user back and
 * explain why, so a flaky connection never leaves a lie on screen.
 */
export default function ProfileEditSheet({
  visible,
  onClose,
  onChangePhoto,
  isUploadingPhoto,
}: Props) {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useUser() as any;
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.userId || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [usernameState, setUsernameState] = useState<UsernameState>({
    checking: false,
    available: true,
    message: "",
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset the draft every time the sheet opens, not on every user change
  // (otherwise an in-flight save would fight the typing).
  useEffect(() => {
    if (!visible) return;
    setName(user?.name || "");
    setUsername(user?.userId || "");
    setBio(user?.bio || "");
    setUsernameState({ checking: false, available: true, message: "" });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    },
    []
  );

  const checkUsername = useCallback(
    (value: string) => {
      const clean = value.trim().toLowerCase();

      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();

      if (!clean || (user?.userId && clean === String(user.userId).toLowerCase())) {
        setUsernameState({ checking: false, available: true, message: "" });
        return;
      }
      if (!USERNAME_PATTERN.test(clean)) {
        setUsernameState({
          checking: false,
          available: false,
          message: "Use 3–20 letters, numbers or underscores",
        });
        return;
      }
      if (RESERVED.has(clean)) {
        setUsernameState({ checking: false, available: false, message: "That username is reserved" });
        return;
      }

      setUsernameState({ checking: true, available: null, message: "Checking…" });

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const res = await api.get(
            `/check-username?username=${encodeURIComponent(clean)}`,
            { signal: controller.signal, timeout: 8000 }
          );
          setUsernameState({
            checking: false,
            available: Boolean(res.data?.available),
            message: res.data?.message || (res.data?.available ? "Available" : "Already taken"),
          });
        } catch (error: any) {
          if (error?.name === "CanceledError" || error?.message === "canceled") return;
          setUsernameState({
            checking: false,
            available: null,
            message: "Couldn't verify — you can still save",
          });
        }
      }, 350);
    },
    [user?.userId]
  );

  const nameError = validateName(name);
  const usernameClean = username.trim().toLowerCase();
  const usernameError =
    usernameState.available === false ? usernameState.message || "Username unavailable" : null;
  const canSave =
    !nameError && !usernameError && usernameState.available !== false && !usernameState.checking;

  const handleSave = async () => {
    if (!canSave) return;

    if (!isConnected) {
      showToast({ title: "Please connect to the Internet to save changes." });
      return;
    }

    const cleanName = name.replace(/\s+/g, " ").trim();
    const cleanUsername = usernameClean;
    const cleanBio = bio.trim();
    const previous = {
      name: user?.name,
      userId: user?.userId,
      bio: user?.bio,
    };

    Keyboard.dismiss();
    // Optimistic: header updates now, sheet closes now.
    updateUser?.({ name: cleanName, userId: cleanUsername, bio: cleanBio });
    onClose();

    try {
      const res = await api.post(
        "/update/details",
        { name: cleanName, username: cleanUsername, bio: cleanBio },
        { timeout: 12000 }
      );

      if (!res.data?.success) throw new Error(res.data?.message || "Could not update profile");
      if (res.data.user) updateUser?.(res.data.user);
      showToast({ title: "Profile updated" });
    } catch (error: any) {
      const status = error?.response?.status;

      // Older deployments don't have /update/details yet: fall back to the
      // profile-setup endpoint so editing still works after a partial deploy.
      if (status === 404) {
        try {
          const fallback = await api.post("/update/profile-setup", {
            name: cleanName,
            username: cleanUsername,
            profession: user?.profession || "Other",
            bio: cleanBio,
            interests: user?.interests || [],
            visibility: user?.visibility || "Public",
          });
          if (fallback.data?.success) {
            if (fallback.data.user) updateUser?.(fallback.data.user);
            showToast({ title: "Profile updated" });
            return;
          }
        } catch (fallbackError: any) {
          rollback(previous, fallbackError);
          return;
        }
      }

      rollback(previous, error);
    }
  };

  const rollback = (previous: any, error: any) => {
    updateUser?.(previous);
    const message =
      error?.response?.status === 401
        ? "Your session expired. Please log in again."
        : error?.response?.data?.message ||
          error?.message ||
          "Could not save your changes. Please try again.";
    showToast({ title: message });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === "android"}
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />

        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>Edit profile</Text>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              hitSlop={10}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
                <Path d="M18 6 6 18M6 6l12 12" />
              </Svg>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.photoRow}>
              <CachedImage
                uri={avatarUri(user, "md")}
                label={user?.name}
                style={styles.photo}
                letterSize={26}
                transition={0}
              />
              <View style={styles.photoInfo}>
                <Text style={styles.photoTitle}>Profile photo</Text>
                <Text style={styles.photoHint}>JPG, PNG, WebP or HEIC · up to 10 MB</Text>
                <Pressable
                  onPress={onChangePhoto}
                  disabled={isUploadingPhoto}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.photoAction}>
                    {isUploadingPhoto ? "Uploading…" : "Change photo"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>NAME</Text>
                <Text style={[styles.counter, name.length > NAME_MAX && styles.counterOver]}>
                  {name.length}/{NAME_MAX}
                </Text>
              </View>
              <TextInput
                style={[styles.input, Boolean(nameError && name.length > 0) && styles.inputError]}
                value={name}
                onChangeText={setName}
                placeholder="Your display name"
                placeholderTextColor="rgba(148, 163, 184, 0.5)"
                maxLength={NAME_MAX + 10}
                autoCapitalize="words"
                returnKeyType="next"
                selectionColor={ACCENT}
              />
              {name.length > 0 && nameError ? <Text style={styles.helperError}>{nameError}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>USERNAME</Text>
              <View style={[styles.input, styles.usernameRow]}>
                <Text style={styles.at}>@</Text>
                <TextInput
                  style={styles.usernameInput}
                  value={username}
                  onChangeText={(value) => {
                    const clean = value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
                    setUsername(clean);
                    checkUsername(clean);
                  }}
                  placeholder="username"
                  placeholderTextColor="rgba(148, 163, 184, 0.5)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  returnKeyType="done"
                  selectionColor={ACCENT}
                />
                {usernameState.checking ? <ActivityIndicator size="small" color={ACCENT} /> : null}
              </View>
              {usernameState.message ? (
                <Text
                  style={[
                    styles.helper,
                    usernameState.available === false && styles.helperError,
                    usernameState.available === true && styles.helperOk,
                  ]}
                >
                  {usernameState.message}
                </Text>
              ) : (
                <Text style={styles.helper}>3–20 characters. Letters, numbers and underscores.</Text>
              )}
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>BIO</Text>
                <Text style={[styles.counter, bio.length > BIO_MAX && styles.counterOver]}>
                  {bio.length}/{BIO_MAX}
                </Text>
              </View>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="A line about you and what you're reading"
                placeholderTextColor="rgba(148, 163, 184, 0.5)"
                maxLength={BIO_MAX}
                multiline
                textAlignVertical="top"
                selectionColor={ACCENT}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                !canSave && styles.saveBtnDisabled,
                pressed && canSave && { transform: [{ scale: 0.99 }] },
              ]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.saveBtnText}>Save changes</Text>
            </Pressable>

            {!isConnected ? (
              <Text style={styles.offlineNote}>
                You're offline — changes will fail until you reconnect.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  panel: {
    backgroundColor: pallete.panelbg || "#101018",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingTop: 8,
    maxHeight: "88%",
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  photoRow: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  photo: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: ACCENT },
  photoInfo: { flex: 1, marginLeft: 14 },
  photoTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  photoHint: { color: "rgba(148,163,184,0.8)", fontSize: 11.5, marginTop: 3 },
  photoAction: { color: ACCENT, fontSize: 13, fontWeight: "700", marginTop: 6 },
  field: { marginBottom: 18 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  counter: { color: "rgba(148,163,184,0.6)", fontSize: 11, fontWeight: "600" },
  counterOver: { color: DANGER },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  inputError: { borderColor: "rgba(239,68,68,0.55)" },
  usernameRow: { flexDirection: "row", alignItems: "center", paddingVertical: 0, gap: 4 },
  at: { color: "rgba(148,163,184,0.9)", fontSize: 15, fontWeight: "700", marginLeft: 2 },
  usernameInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  bioInput: { minHeight: 84, paddingTop: 12 },
  helper: { color: "rgba(148,163,184,0.65)", fontSize: 11.5, marginTop: 7 },
  helperError: { color: "#f87171", fontSize: 11.5, marginTop: 7 },
  helperOk: { color: ACCENT, fontSize: 11.5, marginTop: 7 },
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: "#04211d", fontSize: 15.5, fontWeight: "800" },
  offlineNote: {
    color: "#f59e0b",
    fontSize: 11.5,
    textAlign: "center",
    marginTop: 10,
  },
});

/**
 * Optional native modules
 * ---------------------------------------------------------------------------
 * `expo-clipboard` and `expo-image-manipulator` ship native code, so a JS
 * bundle that was built before those packages were installed (an older dev
 * client, a stale APK, Expo Go on a different SDK) raises
 * "Cannot find native module 'ExpoClipboard'" during import — which kills the
 * whole screen before it can render.
 *
 * Loading them lazily, inside a try/catch, keeps the app usable on any build:
 * the feature degrades (share sheet instead of copy, picker-only photo change
 * instead of client-side resize) instead of crashing at startup.
 */

type ClipboardModule = typeof import("expo-clipboard");
type ManipulatorModule = typeof import("expo-image-manipulator");

let clipboardModule: ClipboardModule | null | undefined;
let manipulatorModule: ManipulatorModule | null | undefined;

const loadModule = <T>(loader: () => T): T | null => {
  try {
    const resolved = loader();
    return resolved && (resolved as any).default ? ((resolved as any).default as T) : resolved;
  } catch {
    return null;
  }
};

/** `null` when the running binary has no clipboard native module. */
export const getClipboard = (): ClipboardModule | null => {
  if (clipboardModule === undefined) {
    clipboardModule = loadModule(() => require("expo-clipboard") as ClipboardModule);
  }
  return clipboardModule;
};

/** `null` when the running binary has no image-manipulator native module. */
export const getImageManipulator = (): ManipulatorModule | null => {
  if (manipulatorModule === undefined) {
    manipulatorModule = loadModule(
      () => require("expo-image-manipulator") as ManipulatorModule
    );
  }
  return manipulatorModule;
};

/**
 * Copies text and reports whether it actually landed on the clipboard, so the
 * caller can fall back to a share sheet on builds without the module.
 */
export const copyText = async (text: string): Promise<boolean> => {
  const clipboard = getClipboard();
  if (!clipboard) return false;
  try {
    await clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
};

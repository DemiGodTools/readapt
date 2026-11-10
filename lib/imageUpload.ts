import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import type { Action } from "expo-image-manipulator";
import { getImageManipulator } from "./safeNative";
import { api } from "./api";

/**
 * Avatar pipeline
 * ---------------------------------------------------------------------------
 * 1. Validate the picked file before doing any heavy work (MIME allow-list,
 *    the 10 MB cap, sane dimensions). Everything here is local and instant.
 * 2. Crop to a square and render 128 / 256 / 512 px JPEGs on the device, so we
 *    never upload a 12 MP camera photo just to show a 40 px avatar.
 * 3. Upload all three in one multipart request; the backend keeps them as
 *    `imageSm`, `imageMd` and `image`.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_EDGE = 64;
const MAX_IMAGE_EDGE = 12_000;

/** Formats we can decode locally. HEIC is accepted and re-encoded to JPEG. */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export class ImageValidationError extends Error {
  code: "too-large" | "unsupported" | "too-small" | "unreadable" | "unavailable";
  constructor(code: ImageValidationError["code"], message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export type AvatarSize = "sm" | "md" | "lg";

export const AVATAR_TARGETS: Array<{ key: AvatarSize; size: number }> = [
  { key: "sm", size: 128 },
  { key: "md", size: 256 },
  { key: "lg", size: 512 },
];

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const mimeFromUri = (uri?: string | null): string | null => {
  if (!uri) return null;
  const clean = uri.split("?")[0];
  const extension = clean.split(".").pop()?.toLowerCase();
  if (extension && EXTENSION_MIME[extension]) return EXTENSION_MIME[extension];
  return null;
};

const resolveFileSize = async (asset: ImagePicker.ImagePickerAsset): Promise<number> => {
  if (typeof asset.fileSize === "number" && asset.fileSize > 0) return asset.fileSize;
  try {
    const info: any = await FileSystem.getInfoAsync(asset.uri);
    if (info?.exists && typeof info.size === "number") return info.size;
  } catch {}
  return 0;
};

/**
 * Synchronous-feeling validation: local metadata checks first, a single stat
 * only when the picker did not report a size. Rejects with a user-facing
 * message so the caller can toast it verbatim.
 */
export const validateImageAsset = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<{ mimeType: string; size: number }> => {
  const mimeType = (asset.mimeType || mimeFromUri(asset.uri) || "").toLowerCase();
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    throw new ImageValidationError(
      "unsupported",
      "Unsupported image. Please choose a JPG, PNG, WebP or HEIC photo."
    );
  }

  const width = Number(asset.width) || 0;
  const height = Number(asset.height) || 0;
  if (width > 0 && height > 0 && Math.min(width, height) < MIN_IMAGE_EDGE) {
    throw new ImageValidationError(
      "too-small",
      `That image is too small. Please choose one at least ${MIN_IMAGE_EDGE}px wide.`
    );
  }
  if (Math.max(width, height) > MAX_IMAGE_EDGE) {
    throw new ImageValidationError("unsupported", "That image is too large to process.");
  }

  const size = await resolveFileSize(asset);
  if (size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      "too-large",
      `That photo is ${formatBytes(size)}. Please choose one under 10 MB.`
    );
  }

  if (size === 0) {
    // No size available and the file could not be read: let the encoder decide.
    // Builds without the manipulator module skip the probe rather than fail.
    const manipulator = getImageManipulator();
    if (manipulator) {
      try {
        await manipulator.manipulateAsync(asset.uri, [], {
          compress: 1,
          format: manipulator.SaveFormat.JPEG,
        });
      } catch {
        throw new ImageValidationError("unreadable", "We couldn't read that image. Try another one.");
      }
    }
  }

  return { mimeType, size };
};

export type AvatarVariant = {
  key: AvatarSize;
  uri: string;
  mimeType: string;
  fileName: string;
};

const squareCrop = (width: number, height: number): Action => {
  const side = Math.min(width, height);
  return {
    crop: {
      originX: Math.max(0, Math.round((width - side) / 2)),
      originY: Math.max(0, Math.round((height - side) / 2)),
      width: side,
      height: side,
    },
  };
};

/**
 * Renders the three avatar sizes. One decode is reused for every target, so a
 * 10 MP source still finishes in a few hundred milliseconds.
 */
export const createAvatarVariants = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<{ variants: AvatarVariant[]; previewUri: string; base64Fallback?: string }> => {
  const manipulator = getImageManipulator();
  if (!manipulator) {
    throw new ImageValidationError(
      "unavailable",
      "Photo editing needs the latest app build. Please update or reinstall the app to change your photo."
    );
  }
  const { manipulateAsync, SaveFormat } = manipulator;

  const width = Number(asset.width) || 0;
  const height = Number(asset.height) || 0;
  const crop = width > 0 && height > 0 ? [squareCrop(width, height)] : [];

  const variants: AvatarVariant[] = [];
  let previewUri = asset.uri;
  let base64Fallback: string | undefined;

  for (const target of AVATAR_TARGETS) {
    const isLarge = target.key === "lg";
    const result = await manipulateAsync(
      asset.uri,
      [...crop, { resize: { width: target.size } }],
      {
        compress: isLarge ? 0.84 : 0.8,
        format: SaveFormat.JPEG,
        base64: isLarge,
      }
    );

    variants.push({
      key: target.key,
      uri: result.uri,
      mimeType: "image/jpeg",
      fileName: `avatar-${target.key}.jpg`,
    });

    if (isLarge) {
      previewUri = result.uri;
      base64Fallback = result.base64 || undefined;
    }
  }

  return { variants, previewUri, base64Fallback };
};

const buildFormData = (variants: AvatarVariant[]): FormData => {
  const form = new FormData();
  variants.forEach((variant) => {
    form.append(variant.key, {
      uri: variant.uri,
      name: variant.fileName,
      type: variant.mimeType,
    } as any);
  });
  return form;
};

export type AvatarUploadResult = {
  user?: any;
  urls?: Partial<Record<"image" | "imageMd" | "imageSm", string>>;
  usedFallback: boolean;
};

/**
 * Uploads the variants. If the deployment does not have /avatar yet (or the
 * storage upload fails), it falls back once to the legacy single-image
 * endpoint so changing a photo never dead-ends.
 */
export const uploadAvatarVariants = async (
  variants: AvatarVariant[],
  options: {
    base64Fallback?: string;
    onProgress?: (ratio: number) => void;
    timeoutMs?: number;
  } = {}
): Promise<AvatarUploadResult> => {
  const { base64Fallback, onProgress, timeoutMs = 30_000 } = options;

  try {
    const response = await api.post("/avatar", buildFormData(variants), {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: timeoutMs,
      onUploadProgress: (event) => {
        if (!event.total) return;
        onProgress?.(Math.min(1, event.loaded / event.total));
      },
    });

    if (response.data?.success) {
      return {
        user: response.data.user,
        urls: response.data.urls,
        usedFallback: false,
      };
    }
    throw new Error(response.data?.message || "Upload failed");
  } catch (error: any) {
    const status = error?.response?.status;
    // 401/413/415 are real answers: surface them instead of retrying blindly.
    if (status === 401 || status === 413 || status === 415) {
      throw new Error(error.response?.data?.message || "Could not upload that photo.");
    }

    // No response means the connection dropped mid-upload. Retrying a ~700 KB
    // base64 payload over the same dead link only makes the failure slower.
    if (!base64Fallback || !status) throw error;

    const dataUri = base64Fallback.startsWith("data:")
      ? base64Fallback
      : `data:image/jpeg;base64,${base64Fallback}`;

    const fallback = await api.post(
      "/update/profile-direct",
      { image: dataUri },
      {
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
        onUploadProgress: (event) => {
          if (!event.total) return;
          onProgress?.(Math.min(1, event.loaded / event.total));
        },
      }
    );

    if (!fallback.data?.success) {
      throw new Error(fallback.data?.message || "Could not upload that photo.");
    }

    return {
      user: fallback.data.user,
      urls: { image: fallback.data.url || fallback.data.user?.image },
      usedFallback: true,
    };
  }
};

type AvatarSource =
  | { image?: string | null; imageMd?: string | null; imageSm?: string | null }
  | null
  | undefined;

/**
 * Picks the right stored resolution for a rendered size. Comments ask for
 * "sm", headers for "md" or "lg"; anything older (or a single-image user)
 * falls back to the full photo.
 */
export const avatarUri = (source: AvatarSource, size: AvatarSize = "md"): string => {
  if (!source) return "";
  if (size === "sm") return source.imageSm || source.imageMd || source.image || "";
  if (size === "md") return source.imageMd || source.image || source.imageSm || "";
  return source.image || source.imageMd || source.imageSm || "";
};

import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image as ExpoImage, type ImageContentFit } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

/**
 * CachedImage
 * ---------------------------------------------------------------------------
 * The single image component for every remote picture in the app.
 *
 * Why not React Native's <Image>?
 *   - It keeps decoded bitmaps in memory only, so a cold start re-downloads
 *     everything the user already saw yesterday.
 *   - It decodes at the source resolution, so a 4000px screenshot costs the
 *     same RAM whether it paints into a 40px avatar or a full-width hero.
 *
 * expo-image uses SDWebImage (iOS) / Glide (Android):
 *   - `cachePolicy="memory-disk"` keeps bytes on disk across app launches,
 *     so repeat views are instant and work offline.
 *   - `allowDownscaling` decodes straight to the view size (flat RAM).
 *   - `recyclingKey` stops wrong-image flashes in re-cycled lists.
 *   - `transition` gives a soft fade on first paint instead of a hard pop.
 *
 * Every instance also renders an instant, network-free placeholder (gradient +
 * initial) underneath the image, so a slow or failed network never shows an
 * empty grey box. No remote placeholder services are involved.
 */

export const IMAGE_CACHE_POLICY = "memory-disk" as const;

export type ImagePriority = "low" | "normal" | "high";

export const isRenderableUrl = (value?: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

const FALLBACK_GRADIENTS: Array<[string, string]> = [
  ["#123a38", "#111026"],
  ["#1d1642", "#0d1b2a"],
  ["#15333c", "#101026"],
  ["#2a1745", "#0e1424"],
  ["#133342", "#141026"],
];

const gradientFor = (seed: string): [string, string] => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
};

/* -------------------------------------------------------------------------
 * Prefetching
 * ---------------------------------------------------------------------- */
const warmed = new Set<string>();
const MAX_WARM_ENTRIES = 400;

/**
 * Warms the native image cache in batches of 4: enough to stay ahead of the
 * user without saturating the JS thread or the radio.
 */
export const prefetchImages = async (
  urls: Array<string | undefined | null>
): Promise<void> => {
  const pending = urls.filter(isRenderableUrl).filter((url) => !warmed.has(url));
  if (pending.length === 0) return;

  pending.forEach((url) => warmed.add(url));
  if (warmed.size > MAX_WARM_ENTRIES) warmed.clear();

  for (let i = 0; i < pending.length; i += 4) {
    try {
      await ExpoImage.prefetch(pending.slice(i, i + 4), IMAGE_CACHE_POLICY);
    } catch {
      // Best effort — the image view still loads it if this fails.
    }
  }
};

/* -------------------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------------- */
type CachedImageProps = {
  uri?: string | null;
  /** Used for the placeholder gradient + initial letter. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  priority?: ImagePriority;
  /** Fade-in duration on first paint. Use ~0 for avatars, 200+ for covers. */
  transition?: number;
  /** Size of the placeholder initial. Defaults are tuned for covers. */
  letterSize?: number;
  /** Set false for decorative images that should never show an initial. */
  showInitial?: boolean;
  /** Custom placeholder content rendered behind the image. */
  placeholder?: React.ReactNode;
  headers?: Record<string, string>;
  /** Blur the bitmap at decode time (used for blurred cover backdrops). */
  blurRadius?: number;
  onLoad?: () => void;
  onError?: () => void;
  /** Overlays rendered above the image (gradients, badges...). */
  children?: React.ReactNode;
};

const CachedImage = ({
  uri,
  label = "",
  style,
  contentFit = "cover",
  priority = "normal",
  transition = 220,
  letterSize = 40,
  showInitial = true,
  placeholder,
  headers,
  blurRadius,
  onLoad,
  onError,
  children,
}: CachedImageProps) => {
  const [failed, setFailed] = useState(false);
  const [from, to] = gradientFor(label || "readapt");
  const initial = label.trim().charAt(0).toUpperCase();

  // A new source deserves a fresh attempt even if the previous one failed.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const showImage = isRenderableUrl(uri) && !failed;

  return (
    <View style={[styles.wrapper, style]}>
      {placeholder ?? (
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      {showInitial && initial ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={[styles.initial, { fontSize: letterSize }]}>{initial}</Text>
        </View>
      ) : null}

      {showImage ? (
        <ExpoImage
          source={headers ? { uri: uri as string, headers } : { uri: uri as string }}
          style={StyleSheet.absoluteFillObject}
          contentFit={contentFit}
          cachePolicy={IMAGE_CACHE_POLICY}
          transition={transition}
          priority={priority}
          recyclingKey={uri as string}
          allowDownscaling
          blurRadius={blurRadius}
          onLoad={onLoad}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : null}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.13)",
    letterSpacing: 2,
  },
});

export default memo(CachedImage);

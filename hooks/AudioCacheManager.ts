import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSingleDownloaded } from "../lib/downloadManager";

const CACHE_DIR = `${FileSystem.cacheDirectory || ""}audio_cache/`;
const CACHE_METADATA_KEY = "@readapt_audio_cache_metadata_v1";
const MAX_CACHE_SIZE_BYTES = 250 * 1024 * 1024; // 250MB Limit

interface CachedItem {
  trackId: string;
  url: string;
  localPath: string;
  sizeBytes: number;
  lastUsedAt: number;
  isComplete: boolean;
}

const activeDownloads = new Map<string, FileSystem.DownloadResumable>();
const cacheIndex: Map<string, CachedItem> = new Map();
let isInitialized = false;

const ensureCacheDir = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  } catch (_) {}
};

const sanitizeFileName = (id: string, url: string): string => {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = url.includes(".m4a") ? ".m4a" : url.includes(".aac") ? ".aac" : ".mp3";
  return `${safeId}${ext}`;
};

const loadIndex = async () => {
  if (isInitialized) return;
  isInitialized = true;
  await ensureCacheDir();
  try {
    const raw = await AsyncStorage.getItem(CACHE_METADATA_KEY);
    if (raw) JSON.parse(raw).forEach((item: CachedItem) => cacheIndex.set(item.trackId, item));
  } catch (_) {}
};

const saveIndex = async () => {
  try { await AsyncStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(Array.from(cacheIndex.values()))); } catch (_) {}
};

export const AudioCacheManager = {
  async getCachedTrackUri(trackId: string, remoteUrl: string): Promise<{ uri: string; isComplete: boolean } | null> {
    try {
      const dl = await getSingleDownloaded(trackId);
      if (dl?.localUri && (await FileSystem.getInfoAsync(dl.localUri)).exists) return { uri: dl.localUri, isComplete: true };

      await loadIndex();
      const item = cacheIndex.get(trackId);
      if (item) {
        if ((await FileSystem.getInfoAsync(item.localPath)).exists) {
          item.lastUsedAt = Date.now();
          void saveIndex();
          return { uri: item.localPath, isComplete: item.isComplete };
        } else {
          cacheIndex.delete(trackId);
          void saveIndex();
        }
      }

      const filePath = `${CACHE_DIR}${sanitizeFileName(trackId, remoteUrl)}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        cacheIndex.set(trackId, { trackId, url: remoteUrl, localPath: filePath, sizeBytes: fileInfo.size || 0, lastUsedAt: Date.now(), isComplete: true });
        void saveIndex();
        return { uri: filePath, isComplete: true };
      }
    } catch (_) {}
    return null;
  },

  async cacheTrackInBackground(trackId: string, remoteUrl: string): Promise<void> {
    if (!remoteUrl || !remoteUrl.startsWith("http") || activeDownloads.has(trackId)) return;
    await loadIndex();
    if (cacheIndex.get(trackId)?.isComplete) return;

    const localPath = `${CACHE_DIR}${sanitizeFileName(trackId, remoteUrl)}`;
    try {
      const downloadResumable = FileSystem.createDownloadResumable(remoteUrl, localPath, {}, () => {});
      activeDownloads.set(trackId, downloadResumable);
      const result = await downloadResumable.downloadAsync();
      activeDownloads.delete(trackId);

      if (result?.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        cacheIndex.set(trackId, { trackId, url: remoteUrl, localPath: result.uri, sizeBytes: fileInfo.exists ? fileInfo.size || 0 : 0, lastUsedAt: Date.now(), isComplete: true });
        await saveIndex();
        void this.pruneCacheIfNeeded();
      }
    } catch (_) { activeDownloads.delete(trackId); }
  },

  warmTrackMetadata(trackId: string, remoteUrl: string): void {
    if (!trackId || !remoteUrl) return;
    void this.getCachedTrackUri(trackId, remoteUrl);
  },

  async pruneCacheIfNeeded(): Promise<void> {
    try {
      const items = Array.from(cacheIndex.values());
      let totalBytes = items.reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
      if (totalBytes <= MAX_CACHE_SIZE_BYTES) return;
      items.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

      for (const item of items) {
        if (totalBytes <= MAX_CACHE_SIZE_BYTES * 0.75) break;
        try {
          await FileSystem.deleteAsync(item.localPath, { idempotent: true });
          cacheIndex.delete(item.trackId);
          totalBytes -= item.sizeBytes || 0;
        } catch (_) {}
      }
      await saveIndex();
    } catch (_) {}
  },
};
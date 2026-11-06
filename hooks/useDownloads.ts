import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IChapter } from '../types/Chapter';
import * as FileSystem from 'expo-file-system/legacy';

export interface DownloadedChapter extends IChapter {
  localUri: string;
  dateAdded: string;
  fileSize: string;
  userId?: string;
}

export interface DownloadStatus {
  id: string;
  percent: number;
  progressText: string;
  status: 'downloading' | 'completed' | 'failed';
}

export interface ActiveDownloadItem {
  id: string;
  chapter: IChapter;
  percent: number; // 0 to 100
  bytesWritten: number;
  totalBytes: number;
  status: 'downloading' | 'completed' | 'failed';
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
};

// Global active downloads state shared across all components
const activeDownloadsMap = new Map<string, ActiveDownloadItem>();
const activeDownloadListeners = new Set<() => void>();

const notifyActiveDownloadListeners = () => {
  activeDownloadListeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
};

// Resolve current logged-in user ID for storage isolation
export const getActiveUserId = async (): Promise<string> => {
  try {
    const raw = await AsyncStorage.getItem('cached_user_profile');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?._id) return String(u._id);
      if (u?.id) return String(u.id);
      if (u?.email) return String(u.email).toLowerCase().trim();
    }
  } catch {}
  return 'guest';
};

export const getUserDownloadsKey = async (overrideUserId?: string): Promise<string> => {
  const uid = overrideUserId || (await getActiveUserId());
  return `@downloaded_chapters_${uid}`;
};

export const useDownloads = () => {
  const [downloads, setDownloads] = useState<DownloadedChapter[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>(() =>
    Array.from(activeDownloadsMap.values())
  );

  // Sync active downloads from the singleton store
  useEffect(() => {
    const syncActive = () => {
      setActiveDownloads(Array.from(activeDownloadsMap.values()));
    };
    activeDownloadListeners.add(syncActive);
    syncActive();
    return () => {
      activeDownloadListeners.delete(syncActive);
    };
  }, []);

  // --------------------------------------------------
  // Load saved downloads for the current active user
  // --------------------------------------------------
  const loadDownloads = useCallback(async () => {
    try {
      setIsLoading(true);
      const key = await getUserDownloadsKey();
      const jsonValue = await AsyncStorage.getItem(key);
      const data: DownloadedChapter[] = jsonValue != null ? JSON.parse(jsonValue) : [];
      setDownloads(data);
    } catch (error) {
      console.error('Error reading downloads:', error);
      setDownloads([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDownloads();

    // Listen for auth state change or global downloads change
    const subAuth = DeviceEventEmitter.addListener('AUTH_STATE_CHANGED', () => {
      loadDownloads();
    });
    const subDownloads = DeviceEventEmitter.addListener('DOWNLOADS_CHANGED', () => {
      loadDownloads();
    });

    return () => {
      subAuth.remove();
      subDownloads.remove();
    };
  }, [loadDownloads]);

  // --------------------------------------------------
  // Download chapter with real-time resumable progress
  // --------------------------------------------------
  const downloadChapter = async (
    chapter: IChapter
  ): Promise<string | null> => {
    const chapterId = chapter._id;

    // Avoid duplicate concurrent download for the same chapter
    if (activeDownloadsMap.has(chapterId)) {
      const existing = activeDownloadsMap.get(chapterId);
      if (existing?.status === 'downloading') {
        return null;
      }
    }

    try {
      const activeUid = await getActiveUserId();
      const userKey = await getUserDownloadsKey(activeUid);

      // Register in active downloads store immediately
      const activeItem: ActiveDownloadItem = {
        id: chapterId,
        chapter,
        percent: 0,
        bytesWritten: 0,
        totalBytes: 0,
        status: 'downloading',
      };
      activeDownloadsMap.set(chapterId, activeItem);
      notifyActiveDownloadListeners();

      const fileExtension =
        chapter.media
          ?.split('?')[0]
          .split('.')
          .pop()
          ?.toLowerCase() ||
        (chapter.type === 'audio' ? 'mp3' : 'pdf');

      const targetDir = FileSystem.documentDirectory;
      if (!targetDir) {
        throw new Error('Document directory is unavailable');
      }

      const localPath = `${targetDir}${chapterId}.${fileExtension}`;

      // Check whether already downloaded on disk
      const fileInfo = await FileSystem.getInfoAsync(localPath);

      if (fileInfo.exists) {
        const size = 'size' in fileInfo ? Number(fileInfo.size || 0) : 0;
        const newEntry: DownloadedChapter = {
          ...chapter,
          localUri: fileInfo.uri,
          dateAdded: new Date().toISOString(),
          fileSize: formatFileSize(size),
          userId: activeUid,
        };

        const jsonValue = await AsyncStorage.getItem(userKey);
        const existing: DownloadedChapter[] = jsonValue ? JSON.parse(jsonValue) : [];
        const updated = [newEntry, ...existing.filter((item) => item._id !== chapterId)];

        await AsyncStorage.setItem(userKey, JSON.stringify(updated));
        setDownloads(updated);

        activeItem.percent = 100;
        activeItem.status = 'completed';
        notifyActiveDownloadListeners();
        DeviceEventEmitter.emit('DOWNLOADS_CHANGED');
        DeviceEventEmitter.emit('DOWNLOAD_COMPLETED', { chapter, uri: fileInfo.uri });

        setTimeout(() => {
          activeDownloadsMap.delete(chapterId);
          notifyActiveDownloadListeners();
        }, 1200);

        return fileInfo.uri;
      }

      // Create resumable download with progress tracking
      const downloadResumable = FileSystem.createDownloadResumable(
        chapter.media,
        localPath,
        {},
        (downloadProgress) => {
          const written = downloadProgress.totalBytesWritten;
          const total = downloadProgress.totalBytesExpectedToWrite;
          const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;

          const item = activeDownloadsMap.get(chapterId);
          if (item) {
            item.percent = pct;
            item.bytesWritten = written;
            item.totalBytes = total;
            notifyActiveDownloadListeners();
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) {
        throw new Error('Download completed but URI is missing');
      }

      const downloadedInfo = await FileSystem.getInfoAsync(result.uri);
      if (!downloadedInfo.exists) {
        throw new Error('Downloaded file does not exist');
      }

      const fileSize = 'size' in downloadedInfo ? Number(downloadedInfo.size || 0) : 0;
      const fileSizeFormatted = formatFileSize(fileSize);
      const newEntry: DownloadedChapter = {
        ...chapter,
        localUri: result.uri,
        dateAdded: new Date().toISOString(),
        fileSize: fileSizeFormatted,
        userId: activeUid,
      };

      const jsonValue = await AsyncStorage.getItem(userKey);
      const existing: DownloadedChapter[] = jsonValue ? JSON.parse(jsonValue) : [];
      const updated = [newEntry, ...existing.filter((item) => item._id !== chapterId)];

      await AsyncStorage.setItem(userKey, JSON.stringify(updated));
      setDownloads(updated);

      activeItem.percent = 100;
      activeItem.status = 'completed';
      notifyActiveDownloadListeners();
      DeviceEventEmitter.emit('DOWNLOADS_CHANGED');
      DeviceEventEmitter.emit('DOWNLOAD_COMPLETED', { chapter, uri: result.uri });

      setTimeout(() => {
        activeDownloadsMap.delete(chapterId);
        notifyActiveDownloadListeners();
      }, 1200);

      return result.uri;
    } catch (error: any) {
      console.error('Download error:', error);
      const item = activeDownloadsMap.get(chapterId);
      if (item) {
        item.status = 'failed';
        notifyActiveDownloadListeners();
        setTimeout(() => {
          activeDownloadsMap.delete(chapterId);
          notifyActiveDownloadListeners();
        }, 3000);
      }
      return null;
    }
  };

  // --------------------------------------------------
  // Delete chapter
  // --------------------------------------------------
  const deleteChapter = async (id: string): Promise<void> => {
    try {
      const activeUid = await getActiveUserId();
      const userKey = await getUserDownloadsKey(activeUid);

      const itemToDelete = downloads.find((item) => item._id === id);
      if (itemToDelete) {
        const path = itemToDelete.localUri.replace(/^file:\/\//, '');
        const exists = await ReactNativeBlobUtil.fs.exists(path);
        if (exists) {
          await ReactNativeBlobUtil.fs.unlink(path);
        }
      }

      const updated = downloads.filter((item) => item._id !== id);
      await AsyncStorage.setItem(userKey, JSON.stringify(updated));
      setDownloads(updated);
      DeviceEventEmitter.emit('DOWNLOADS_CHANGED');
    } catch (error) {
      console.error('Failed to delete chapter:', error);
    }
  };

  const downloadStatuses: Record<string, DownloadStatus> = {};
  activeDownloads.forEach((ad) => {
    downloadStatuses[ad.id] = {
      id: ad.id,
      percent: ad.percent,
      progressText: `${ad.percent}%`,
      status: ad.status,
    };
  });

  return {
    downloads,
    isLoading,
    activeDownloads,
    downloadStatuses,
    downloadChapter,
    deleteChapter,
    refreshDownloads: loadDownloads,
  };
};

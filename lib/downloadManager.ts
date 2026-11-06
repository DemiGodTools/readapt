import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IChapter } from '../types/Chapter';

export interface DownloadedChapter extends IChapter {
  localUri: string;
  dateAdded: string;
  userId?: string;
}

// Resolve current logged in user's ID for storage isolation
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

export const getDownloadsKey = async (overrideUserId?: string): Promise<string> => {
  const uid = overrideUserId || (await getActiveUserId());
  return `@downloaded_chapters_${uid}`;
};

// Get all downloaded chapters saved for the active user
export const getDownloadedChapters = async (targetUserId?: string): Promise<DownloadedChapter[]> => {
  try {
    const key = await getDownloadsKey(targetUserId);
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading downloads', e);
    return [];
  }
};

export const checkIsDownloaded = async (chapterId: string, targetUserId?: string): Promise<boolean> => {
  try {
    const key = await getDownloadsKey(targetUserId);
    const jsonValue = await AsyncStorage.getItem(key);
    const downloaded: DownloadedChapter[] = jsonValue != null ? JSON.parse(jsonValue) : [];
    return downloaded.some((item) => item._id === chapterId);
  } catch (e) {
    console.error('Error reading downloads', e);
    return false;
  }
};

// Get single downloaded chapter for active user
export const getSingleDownloaded = async (chapterId: string, targetUserId?: string): Promise<DownloadedChapter | undefined> => {
  try {
    const key = await getDownloadsKey(targetUserId);
    const jsonValue = await AsyncStorage.getItem(key);
    const downloads: DownloadedChapter[] = jsonValue != null ? JSON.parse(jsonValue) : [];
    return downloads.find((item) => item._id === chapterId);
  } catch (e) {
    console.error('Error reading downloads', e);
    return undefined;
  }
};

// Download chapter media and save metadata scoped to active user
export const downloadChapter = async (
  chapter: IChapter,
  onProgress?: (progress: number) => void
) => {
  try {
    const activeUid = await getActiveUserId();
    const key = await getDownloadsKey(activeUid);

    // 1. Create a local file path
    const fileExtension = chapter.media.split('?')[0].split('.').pop() || (chapter.type === 'audio' ? 'mp3' : 'pdf');
    const documentDir = (FileSystem as any).documentDirectory || '';
    const localUri = `${documentDir}${chapter._id}.${fileExtension}`;

    // 2. Setup download resumable to track progress
    const downloadResumable = FileSystem.createDownloadResumable(
      chapter.media,
      localUri,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite;
        if (onProgress) onProgress(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) throw new Error('Download failed');

    // 3. Save metadata to user-scoped AsyncStorage
    const currentDownloads = await getDownloadedChapters(activeUid);
    const newEntry: DownloadedChapter = {
      ...chapter,
      localUri: result.uri,
      dateAdded: new Date().toISOString(),
      userId: activeUid,
    };

    const updated = [newEntry, ...currentDownloads.filter((item) => item._id !== chapter._id)];
    await AsyncStorage.setItem(key, JSON.stringify(updated));

    return result.uri;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
};

// Delete a chapter file and remove from user-scoped storage
export const deleteDownloadedChapter = async (id: string, targetUserId?: string) => {
  try {
    const activeUid = targetUserId || (await getActiveUserId());
    const key = await getDownloadsKey(activeUid);
    const downloads = await getDownloadedChapters(activeUid);
    const itemToDelete = downloads.find((item) => item._id === id);

    if (itemToDelete) {
      await FileSystem.deleteAsync(itemToDelete.localUri, { idempotent: true });
    }

    const updated = downloads.filter((item) => item._id !== id);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete chapter', e);
  }
};

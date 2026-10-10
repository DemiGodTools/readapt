import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IChapter } from '../types/Chapter';

const DOWNLOADS_KEY = '@downloaded_chapters';

export interface DownloadedChapter extends IChapter {
  localUri: string;
  dateAdded: string;
}

// Get all downloaded chapters saved in AsyncStorage
export const getDownloadedChapters = async (): Promise<DownloadedChapter[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(DOWNLOADS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading downloads', e);
    return [];
  }
};

export const checkIsDownloaded = async (chapterId: string) : Promise<boolean> => {
    try {
    const jsonValue = await AsyncStorage.getItem(DOWNLOADS_KEY);
    const downloaded: DownloadedChapter[] =  jsonValue != null ? JSON.parse(jsonValue) : [];
    const downloadedMatch = downloaded.find(item => item._id === chapterId)
    return downloadedMatch ? true : false
  } catch (e) {
    console.error('Error reading downloads', e);
    return false;
  }
}

// Get single donwloaded chapter
export const getSingleDownloaded = async (chapterId: string): Promise<DownloadedChapter | undefined> => {
   try {
    const jsonValue = await AsyncStorage.getItem(DOWNLOADS_KEY);
    const downloads : DownloadedChapter[] =  jsonValue != null ? JSON.parse(jsonValue) : [];
    return downloads.find(item => item._id === chapterId)
  } catch (e) {
    console.error('Error reading downloads', e);
    return ;
  }
}

// Download chapter media and save metadata
export const downloadChapter = async (
  chapter: IChapter,
  onProgress?: (progress: number) => void
) => {
  try {
    // 1. Create a local file path
    const fileExtension = chapter.media.split('.').pop() || 'mp3';
    const documentDir = (FileSystem as any).documentDirectory || '';
    const localUri = `${documentDir}${chapter._id}.${fileExtension}`;

    // 2. Setup download resumable to track progress
    const downloadResumable = FileSystem.createDownloadResumable(
      chapter.media,
      localUri,
      {},
      (downloadProgress) => {
        console.log(downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite, "download progress")
        const progress =
          downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite;
        if (onProgress) onProgress(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) throw new Error('Download failed');

    // 3. Save metadata to AsyncStorage
    const currentDownloads = await getDownloadedChapters();
    const newEntry: DownloadedChapter = {
      ...chapter,
      localUri: result.uri,
      dateAdded: (new Date()).toISOString(),
    };

    const updated = [...currentDownloads.filter((item) => item._id !== chapter._id), newEntry];
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(updated));

    return result.uri;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
};

// Delete a chapter file and remove from storage
export const deleteDownloadedChapter = async (id: string) => {
  try {
    const downloads = await getDownloadedChapters();
    const itemToDelete = downloads.find((item) => item._id === id);

    if (itemToDelete) {
      // Remove physical file
      await FileSystem.deleteAsync(itemToDelete.localUri, { idempotent: true });
    }

    // Remove from storage
    const updated = downloads.filter((item) => item._id !== id);
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete chapter', e);
  }
};
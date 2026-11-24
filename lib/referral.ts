export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.readapt.app";

/**
 * Standardized, crisp share message used across all screens.
 * Contains user invite code and ends with the Play Store app download link.
 */
export const getReferralShareMessage = (code: string): string => {
  const cleanCode = (code || "READAPT").trim();
  return `Join me on Readapt! Use my invite code: ${cleanCode}\n\nDownload: ${PLAY_STORE_URL}`;
};

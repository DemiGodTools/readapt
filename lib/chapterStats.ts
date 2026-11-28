/**
 * Passive RAM cache for confirmed chapter engagement counters (likes & comments).
 * Prevents initialBookData / downloads / disk-cache hydration passes from flickering
 * counts to 0 before /chapter/:id answers, with zero extra network calls.
 */
export interface ChapterStats {
  likes?: number;
  commentsCount?: number;
  qnaCommentsCount?: number;
  liked?: boolean;
  updatedAt: number;
}

const MAX_STATS_ENTRIES = 250;
const statsMap = new Map<string, ChapterStats>();

export function resolveCommentsCount(book: any, fallback = 0): number {
  if (!book) return Math.max(0, fallback);
  if (typeof book.commentsCount === "number" && Number.isFinite(book.commentsCount)) {
    return Math.max(0, book.commentsCount);
  }
  if (typeof book.comments === "number" && Number.isFinite(book.comments)) {
    return Math.max(0, book.comments);
  }
  if (Array.isArray(book.comments)) {
    return book.comments.length;
  }
  return Math.max(0, fallback);
}

export function resolveQnaCommentsCount(book: any, fallback = 0): number {
  if (!book) return Math.max(0, fallback);
  if (typeof book.qnaCommentsCount === "number" && Number.isFinite(book.qnaCommentsCount)) {
    return Math.max(0, book.qnaCommentsCount);
  }
  if (typeof book.qnaComments === "number" && Number.isFinite(book.qnaComments)) {
    return Math.max(0, book.qnaComments);
  }
  if (Array.isArray(book.qnaComments)) {
    return book.qnaComments.length;
  }
  return Math.max(0, fallback);
}

export function getChapterStats(chapterId?: string | null): ChapterStats | undefined {
  if (!chapterId) return undefined;
  return statsMap.get(String(chapterId));
}

export function updateChapterStats(
  chapterId: string | undefined | null,
  patch: Partial<Omit<ChapterStats, "updatedAt">>
): ChapterStats | undefined {
  if (!chapterId) return undefined;
  const id = String(chapterId);
  const existing = statsMap.get(id) || { updatedAt: Date.now() };
  const next: ChapterStats = { ...existing, updatedAt: Date.now() };

  if (typeof patch.likes === "number" && Number.isFinite(patch.likes)) {
    next.likes = Math.max(0, patch.likes);
  }
  if (typeof patch.commentsCount === "number" && Number.isFinite(patch.commentsCount)) {
    next.commentsCount = Math.max(0, patch.commentsCount);
  }
  if (typeof patch.qnaCommentsCount === "number" && Number.isFinite(patch.qnaCommentsCount)) {
    next.qnaCommentsCount = Math.max(0, patch.qnaCommentsCount);
  }
  if (typeof patch.liked === "boolean") {
    next.liked = patch.liked;
  }

  statsMap.delete(id);
  statsMap.set(id, next);
  if (statsMap.size > MAX_STATS_ENTRIES) {
    const oldestKey = statsMap.keys().next().value;
    if (oldestKey) statsMap.delete(oldestKey);
  }
  return next;
}

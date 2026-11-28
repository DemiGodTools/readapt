/**
 * Cooldown-guarded navigation helper that prevents rage-tapping from pushing
 * duplicate stacked heavy screens (e.g., ReadBook, AudioRdr, SeriesOverview).
 */
let lastNavTime = 0;
let lastNavSignature = "";

export function safeNavigate(
  navigation: any,
  screen: string,
  params?: Record<string, any>,
  cooldownMs: number = 500
): boolean {
  if (!navigation?.navigate || !screen) return false;
  const now = Date.now();
  const targetId = params?.bookId || params?.seriesId || params?.subCategoryId || "";
  const sig = `${screen}:${targetId}`;

  if (now - lastNavTime < cooldownMs && (sig === lastNavSignature || now - lastNavTime < 280)) {
    return false;
  }

  lastNavTime = now;
  lastNavSignature = sig;
  navigation.navigate(screen as never, params as never);
  return true;
}

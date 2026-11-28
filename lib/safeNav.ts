import { navigationRef } from "../components/nav/MainNavigation";

/**
 * Cooldown & stack-guarded navigation helper that prevents rapid/double taps from
 * opening multiple book/series readers stacked on top of each other.
 */
const READER_SCREENS = new Set(["ReadBook", "AudioRdr"]);

let lastNavTime = 0;

export interface SafeNavOptions {
  cooldownMs?: number;
  /** Pass true only when deliberately switching books from inside ReadBook / AudioRdr. */
  replaceIfInReader?: boolean;
}

export function safeNavigate(
  navigation: any,
  screen: string,
  params?: Record<string, any>,
  options: number | SafeNavOptions = 850
): boolean {
  if (!navigation?.navigate || !screen) return false;
  const opts: SafeNavOptions =
    typeof options === "number" ? { cooldownMs: options } : options;
  const cooldownMs = opts.cooldownMs ?? 850;
  const now = Date.now();

  const currentRouteName = navigationRef?.isReady?.()
    ? (navigationRef.getCurrentRoute() as any)?.name
    : undefined;

  if (currentRouteName && READER_SCREENS.has(currentRouteName)) {
    if (opts.replaceIfInReader) {
      if (now - lastNavTime < cooldownMs) return false;
      lastNavTime = now;
      if (typeof navigation.replace === "function") {
        navigation.replace(screen as never, params as never);
      } else {
        navigation.navigate(screen as never, params as never);
      }
      return true;
    }
    // User already opened a reader; ignore any late tap from the underlying listing screen
    if (READER_SCREENS.has(screen)) {
      return false;
    }
  }

  // Strict transition lock across ALL cards/routes so fast taps on different books only open the first one
  if (now - lastNavTime < cooldownMs) {
    return false;
  }

  lastNavTime = now;
  navigation.navigate(screen as never, params as never);
  return true;
}

// File: lib/entitlements.ts
import { SubscriptionPlan } from "../enums";

/**
 * ⚡ GOOGLE PLAY COMPLIANT EARLY ACCESS SWITCH:
 * When true:
 * - Bypasses all paywalls and removes any 3rd-party Razorpay dependencies
 * - Grants 100% full VIP access (Pro features, background audio, downloads, annotations) to all community users
 * - Prevents Google Play Console rejection (Guaranteed compliance with Play Billing Policy)
 * - In 2 weeks, set this to false to activate official Google Play In-App Billing!
 */
export const IS_EARLY_ACCESS_FREE = true;

export const PLAN_NAMES: Record<number, string> = {
  [SubscriptionPlan.FREE]: "Free",
  [SubscriptionPlan.BASIC]: "Basic",
  [SubscriptionPlan.STANDARD]: "Standard",
  [SubscriptionPlan.PRO]: "Pro",
};

/**
 * Normalizes DB plan numbers (handles legacy `4` as Pro `3`)
 */
export const normalizePlanTier = (rawPlan: any): number => {
  const num = Number(rawPlan);
  if (!Number.isFinite(num) || num <= 0) return SubscriptionPlan.FREE;
  if (num === 1) return SubscriptionPlan.BASIC;
  if (num === 2) return SubscriptionPlan.STANDARD;
  if (num >= 3) return SubscriptionPlan.PRO;
  return SubscriptionPlan.FREE;
};

export const normalizeRequiredContentTier = (rawFor: any): number => {
  return normalizePlanTier(rawFor);
};

export interface EntitlementState {
  rawPlan: number;
  rawPlanName: string;
  effectivePlan: number;
  effectivePlanName: string;
  isSubscribed: boolean;
  isExpired: boolean;
  expiresAtMs: number | null;
  formattedExpiryDateTime: string;
  canComment: boolean;
  canAnnotate: boolean;
  canDownload: boolean;
  canBackgroundPlay: boolean;
}

export const formatDateTimeIST = (dateInput?: string | Date | number | null): string => {
  if (!dateInput) return "Unknown Time";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "Unknown Time";
  return `${d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} at ${d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })}`;
};

export const getEntitlementState = (
  user: any,
  nowMs: number = Date.now()
): EntitlementState => {
  // ⚡ EARLY ACCESS MODE: Give all users full VIP Pro perks without payment
  if (IS_EARLY_ACCESS_FREE) {
    return {
      rawPlan: SubscriptionPlan.PRO,
      rawPlanName: "Early Access",
      effectivePlan: SubscriptionPlan.PRO,
      effectivePlanName: "Early Access",
      isSubscribed: true,
      isExpired: false,
      expiresAtMs: null,
      formattedExpiryDateTime: "Free Community Access",
      canComment: true,
      canAnnotate: true,
      canDownload: true,
      canBackgroundPlay: true,
    };
  }

  const rawPlan = normalizePlanTier(user?.subscription?.plan);
  const rawPlanName = PLAN_NAMES[rawPlan] || "Free";
  const rawExpiresOn = user?.subscription?.expiresOn;

  let expiresAtMs: number | null = null;
  if (rawExpiresOn) {
    const parsed = new Date(rawExpiresOn).getTime();
    if (!isNaN(parsed)) {
      expiresAtMs = parsed;
    }
  }

  // If rawPlan > 0, it MUST have a valid future expiresAtMs to be active
  const isExpired =
    rawPlan > 0 && (expiresAtMs === null || expiresAtMs <= nowMs);

  const effectivePlan = isExpired ? SubscriptionPlan.FREE : rawPlan;
  const effectivePlanName = PLAN_NAMES[effectivePlan] || "Free";

  return {
    rawPlan,
    rawPlanName,
    effectivePlan,
    effectivePlanName,
    isSubscribed: effectivePlan > SubscriptionPlan.FREE,
    isExpired,
    expiresAtMs,
    formattedExpiryDateTime: expiresAtMs
      ? formatDateTimeIST(expiresAtMs)
      : formatDateTimeIST(nowMs),
    canComment: effectivePlan >= SubscriptionPlan.BASIC,
    canAnnotate: effectivePlan >= SubscriptionPlan.BASIC,
    canDownload: effectivePlan >= SubscriptionPlan.STANDARD,
    canBackgroundPlay: effectivePlan >= SubscriptionPlan.PRO,
  };
};

export const canUserAccessChapter = (
  user: any,
  chapterFor: any,
  nowMs: number = Date.now()
): {
  allowed: boolean;
  reason?: string;
  requiredTier: number;
  requiredTierName: string;
  entitlement: EntitlementState;
} => {
  const entitlement = getEntitlementState(user, nowMs);
  const requiredTier = normalizeRequiredContentTier(chapterFor);
  const requiredTierName = PLAN_NAMES[requiredTier] || "Free";

  // ⚡ 100% UNRESTRICTED ACCESS IN EARLY ACCESS
  if (IS_EARLY_ACCESS_FREE) {
    return { allowed: true, requiredTier, requiredTierName, entitlement };
  }

  if (requiredTier === SubscriptionPlan.FREE) {
    return { allowed: true, requiredTier, requiredTierName, entitlement };
  }

  if (entitlement.isExpired) {
    return {
      allowed: false,
      reason: `Your ${entitlement.rawPlanName} plan has expired. Please renew to access ${requiredTierName} content.`,
      requiredTier,
      requiredTierName,
      entitlement,
    };
  }

  if (entitlement.effectivePlan < requiredTier) {
    return {
      allowed: false,
      reason: `Upgrade to ${requiredTierName} plan to access this content.`,
      requiredTier,
      requiredTierName,
      entitlement,
    };
  }

  return { allowed: true, requiredTier, requiredTierName, entitlement };
};

// Single source of runtime configuration. Everything date-related reads from here,
// never from `new Date()` directly, so the assessment's simulated "today" is consistent.

export const TIME_ZONE = "Africa/Gaborone"; // UTC+2, no daylight saving

export interface AppConfig {
  /** Simulated "today" as YYYY-MM-DD (assessment: 2026-10-06). */
  today: string;
  /** Optional fixed clock for demos/tests. When unset, the real clock is used. */
  nowOverride: Date | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const today = env.APP_TODAY?.trim() || "2026-10-06";
  if (!ISO_DATE.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00Z`))) {
    throw new Error(`APP_TODAY must be YYYY-MM-DD, got "${today}"`);
  }

  const rawNow = env.APP_NOW?.trim();
  let nowOverride: Date | null = null;
  if (rawNow) {
    nowOverride = new Date(rawNow);
    if (Number.isNaN(nowOverride.getTime())) {
      throw new Error(`APP_NOW must be an ISO 8601 timestamp, got "${rawNow}"`);
    }
  }

  return { today, nowOverride };
}

/** Current instant: the override if set, otherwise the real clock. */
export function now(config: AppConfig): Date {
  return config.nowOverride ?? new Date();
}

// Display logic for personal access tokens. Headless and pure so it can be
// tested without a DOM — the panel itself stays a thin rendering layer.

import type { AccessTokenSummary } from "../../shared/api-types.ts";
import { relativeTime } from "./format-time.ts";
import { TOKEN_PREFIX } from "../../shared/access-token-format.ts";

const DAY = 24 * 60 * 60 * 1000;

/** Offered expiries. `null` means the token never expires. */
export const EXPIRY_OPTIONS = [
  { value: "30", days: 30, label: "30 days" },
  { value: "90", days: 90, label: "90 days" },
  { value: "365", days: 365, label: "1 year" },
  { value: "never", days: null, label: "No expiry" },
] as const;

export const DEFAULT_EXPIRY = "90";

/**
 * The label for a stored expiry value. Base UI's Select renders the raw value
 * in a closed trigger unless it is given children, so the trigger showed "90"
 * and "never" where it should have read "90 days" and "No expiry".
 */
export function expiryLabel(value: string): string {
  return EXPIRY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** Close enough to expiry that a working CLI is about to start failing. */
export const EXPIRING_SOON_MS = 7 * DAY;

export type TokenState = "active" | "expiring" | "expired";

export function tokenState(
  token: Pick<AccessTokenSummary, "expiresAt">,
  now = new Date(),
): TokenState {
  if (token.expiresAt === null) return "active";
  const at = Date.parse(token.expiresAt);
  // Mirror the server, which fails closed on an unparseable expiry.
  if (Number.isNaN(at)) return "expired";
  const remaining = at - now.getTime();
  if (remaining <= 0) return "expired";
  return remaining <= EXPIRING_SOON_MS ? "expiring" : "active";
}

/**
 * A token nobody has used in this long is probably a machine that's gone, a
 * login that was retried, or a test. It is flagged, never removed.
 */
export const UNUSED_AFTER_MS = 90 * DAY;

/** The last sign of life: last use, or creation for a token never used. */
function lastActivity(
  token: Pick<AccessTokenSummary, "lastUsedAt" | "createdAt">,
): number {
  const used = token.lastUsedAt === null ? NaN : Date.parse(token.lastUsedAt);
  return Number.isNaN(used) ? Date.parse(token.createdAt) : used;
}

/** Expired, or idle past `UNUSED_AFTER_MS`: what "Revoke unused" clears. */
export function isUnused(
  token: Pick<AccessTokenSummary, "lastUsedAt" | "createdAt" | "expiresAt">,
  now = new Date(),
): boolean {
  if (tokenState(token, now) === "expired") return true;
  const at = lastActivity(token);
  return !Number.isNaN(at) && now.getTime() - at >= UNUSED_AFTER_MS;
}

/**
 * Most recently active first, so the machine you're on sits at the top and
 * the forgotten ones sink. Ties fall back to newest.
 */
export function sortTokens<
  T extends Pick<AccessTokenSummary, "lastUsedAt" | "createdAt">,
>(tokens: readonly T[]): T[] {
  const key = (t: T) => lastActivity(t) || 0;
  return [...tokens].sort(
    (a, b) =>
      key(b) - key(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/**
 * `relativeTime` mid-sentence: "just now" and "3 days ago" lose their capital,
 * a date ("Aug 3") keeps it. Lowercasing the lot read "Last used aug 3".
 */
function sinceInSentence(at: Date, now: Date): string {
  const text = relativeTime(at, now);
  return text === "Just now" || text.endsWith(" ago") ? text.toLowerCase() : text;
}

/** "Created 3 days ago" · "Created Aug 3". */
export function describeCreated(
  token: Pick<AccessTokenSummary, "createdAt">,
  now = new Date(),
): string {
  const at = Date.parse(token.createdAt);
  if (Number.isNaN(at)) return "Created";
  return `Created ${sinceInSentence(new Date(at), now)}`;
}

/** "Never expires" · "Expired 3 days ago" · "Expires in 5 days". */
export function describeExpiry(
  token: Pick<AccessTokenSummary, "expiresAt">,
  now = new Date(),
): string {
  if (token.expiresAt === null) return "Never expires";
  const at = Date.parse(token.expiresAt);
  if (Number.isNaN(at)) return "Expired";

  const remaining = at - now.getTime();
  if (remaining <= 0) return `Expired ${relativeTime(new Date(at), now)}`;

  const days = Math.ceil(remaining / DAY);
  if (days === 1) return "Expires tomorrow";
  if (days <= 60) return `Expires in ${days} days`;
  return `Expires ${new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

/**
 * `last_used_at` is throttled server-side to roughly an hour, so this is
 * deliberately vague — it answers "is this token still in use?", not "when
 * exactly was the last request?".
 */
export function describeLastUsed(
  token: Pick<AccessTokenSummary, "lastUsedAt">,
  now = new Date(),
): string {
  if (token.lastUsedAt === null) return "Never used";
  const at = Date.parse(token.lastUsedAt);
  if (Number.isNaN(at)) return "Never used";
  return `Last used ${sinceInSentence(new Date(at), now)}`;
}

/** How a token is identified in the list, since the token itself is gone. */
export function displayToken(prefix: string): string {
  return `${TOKEN_PREFIX}${prefix}…`;
}

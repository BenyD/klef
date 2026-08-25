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
  return `Last used ${relativeTime(new Date(at), now).toLowerCase()}`;
}

/** How a token is identified in the list, since the token itself is gone. */
export function displayToken(prefix: string): string {
  return `${TOKEN_PREFIX}${prefix}…`;
}

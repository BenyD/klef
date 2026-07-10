import { passkeyProviderName } from "../shared/passkey-provider.ts";

export interface PasskeySignup {
  name: string;
  email: string;
}

// The auth page's passkey-first sign-up carries its form fields through the
// WebAuthn `context` string as JSON ({ name, email }). It crosses the network
// unauthenticated, so parse defensively: anything malformed is simply "not a
// sign-up" (null) rather than an error.
export function parsePasskeySignupContext(
  context: string | null | undefined,
): PasskeySignup | null {
  if (!context) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(context);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { name, email } = parsed as Record<string, unknown>;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!trimmedName || trimmedName.length > 200) return null;
  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    return null;
  }
  return { name: trimmedName, email: normalizedEmail };
}

/**
 * Default stored label for a new passkey: provider plus month, e.g.
 * "iCloud Keychain · Jul 2026". The month distinguishes multiple keys from
 * the same provider. Null when the AAGUID is unknown; the UI then shows its
 * own AAGUID-based fallback.
 */
export function defaultPasskeyName(
  aaguid: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const provider = passkeyProviderName(aaguid);
  if (!provider) return null;
  const month = now.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  return `${provider} · ${month}`;
}

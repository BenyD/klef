import { passkeyProviderName } from "../shared/passkey-provider.ts";

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

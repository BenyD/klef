// The user closing or timing out the WebAuthn prompt is a no-op, not an
// error to surface. simplewebauthn reports a dismissed or timed-out prompt
// (NotAllowedError) as ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY and an explicit
// abort as ERROR_CEREMONY_ABORTED; Better Auth's passkey client reports
// non-WebAuthn failures as AUTH_CANCELLED.
const PASSKEY_CANCEL_CODES = new Set([
  "ERROR_CEREMONY_ABORTED",
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
  "AUTH_CANCELLED",
]);

export function isPasskeyCancel(
  error: { code?: string; message?: string } | null | undefined,
) {
  return !!error?.code && PASSKEY_CANCEL_CODES.has(error.code);
}

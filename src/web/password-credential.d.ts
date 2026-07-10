// PasswordCredential (Credential Management API) is Chromium-only and does
// not ship in TypeScript's lib.dom. Minimal surface for the recovery-key
// panel's save-to-manager button; callers feature-detect before using it.
interface PasswordCredentialInit {
  id: string;
  name?: string;
  password: string;
}

declare class PasswordCredential implements Credential {
  constructor(init: PasswordCredentialInit);
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly password: string;
}

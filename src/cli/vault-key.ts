// SPDX-License-Identifier: AGPL-3.0-or-later
//
// One way for commands to encrypt and decrypt, whichever way the vault was
// unlocked: through a running unlock agent if it holds this vault's key, or by
// prompting for the passphrase on the terminal if not. Commands open it once
// and reuse it, which is what makes `--all` one prompt rather than one per
// file.

import { homedir } from "node:os";
import { decryptBlob, encryptBlob } from "../shared/crypto.ts";
import type { EncryptedBlob, VaultKeyMaterial } from "../shared/types.ts";
import { agentRequest, agentStatus, AgentError } from "./agent-client.ts";
import { vaultFingerprint } from "./agent-protocol.ts";
import { agentSocketPath } from "./paths.ts";
import { unlockVault } from "./unlock.ts";

export interface VaultCipher {
  /** How the vault was opened, for tests and for nothing that prints. */
  source: "agent" | "passphrase";
  encrypt: (plaintext: string) => Promise<EncryptedBlob>;
  decrypt: (blob: EncryptedBlob) => Promise<string>;
}

/** A cipher over a key held in this process. */
export function localCipher(dek: CryptoKey): VaultCipher {
  return {
    source: "passphrase",
    encrypt: (plaintext) => encryptBlob(dek, plaintext),
    decrypt: (blob) => decryptBlob(dek, blob),
  };
}

const LOCKED_MID_COMMAND =
  "The vault locked while this was running. Unlock again and rerun it.";

/** A cipher whose key stays in the agent; only operations cross the socket. */
export function agentCipher(socketPath: string): VaultCipher {
  return {
    source: "agent",
    async encrypt(plaintext) {
      const res = await agentRequest(socketPath, { op: "encrypt", plaintext });
      if (!res) throw new AgentError(LOCKED_MID_COMMAND);
      if (!res.ok) throw new AgentError(res.error);
      if (!("blob" in res)) throw new AgentError("The unlock agent sent the wrong reply.");
      return res.blob;
    },
    async decrypt(blob) {
      const res = await agentRequest(socketPath, { op: "decrypt", blob });
      if (!res) throw new AgentError(LOCKED_MID_COMMAND);
      if (!res.ok) throw new AgentError(res.error);
      if (!("plaintext" in res)) throw new AgentError("The unlock agent sent the wrong reply.");
      return res.plaintext;
    },
  };
}

/**
 * Use the agent when it is unlocked for this vault; otherwise prompt. An
 * agent holding a different vault's key (another account, another server, or
 * a passphrase changed since) is passed over rather than asked to fail.
 */
export async function openVault(
  keyMaterial: VaultKeyMaterial,
  env: NodeJS.ProcessEnv,
  prompt?: (question: string) => Promise<string>,
): Promise<VaultCipher> {
  const socketPath = agentSocketPath(env, homedir());
  const status = await agentStatus(socketPath);
  if (status && status.fingerprint === (await vaultFingerprint(keyMaterial.wrappedDek))) {
    return agentCipher(socketPath);
  }
  return localCipher(await unlockVault(keyMaterial, prompt));
}

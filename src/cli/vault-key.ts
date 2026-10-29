// SPDX-License-Identifier: MIT
//
// One way for commands to encrypt and decrypt, whichever way the vault was
// unlocked: through a running unlock agent if it holds this vault's key, or by
// prompting for the passphrase on the terminal if not. Commands open it once
// and reuse it, which is what makes `--all` one prompt rather than one per
// file.

import { homedir } from "node:os";
import { decryptBlob, encryptBlob, importAesKey } from "../shared/crypto.ts";
import type { EncryptedBlob, VaultKeyMaterial } from "../shared/types.ts";
import { agentRequest, agentStatus, AgentError } from "./agent-client.ts";
import { vaultFingerprint } from "./agent-protocol.ts";
import { agentSocketPath } from "./paths.ts";
import { unlockVaultBytes } from "./unlock.ts";
import { forgetKey, loadRememberedKey, rememberKey } from "./key-store.ts";

export interface VaultCipher {
  /** How the vault was opened, for tests and for nothing that prints. */
  source: "remembered" | "agent" | "passphrase";
  encrypt: (plaintext: string) => Promise<EncryptedBlob>;
  decrypt: (blob: EncryptedBlob) => Promise<string>;
}

/** A cipher over a key held in this process. */
export function localCipher(dek: CryptoKey, source: "remembered" | "passphrase" = "passphrase"): VaultCipher {
  return {
    source,
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
 * Open the vault without asking where possible: the key this device
 * remembered, then a running unlock agent that holds this vault's key, and
 * only then the passphrase, which is remembered for next time unless that is
 * turned off. An agent holding a different vault's key (another account,
 * another server, or a passphrase changed since) is passed over rather than
 * asked to fail.
 */
export async function openVault(
  keyMaterial: VaultKeyMaterial,
  env: NodeJS.ProcessEnv,
  prompt?: (question: string) => Promise<string>,
): Promise<VaultCipher> {
  const remembered = await loadRememberedKey(env, keyMaterial);
  if (remembered) return forgetOnFailure(localCipher(remembered.key, "remembered"), env);

  const socketPath = agentSocketPath(env, homedir());
  const status = await agentStatus(socketPath);
  if (status && status.fingerprint === (await vaultFingerprint(keyMaterial.wrappedDek))) {
    return agentCipher(socketPath);
  }

  const bytes = await unlockVaultBytes(keyMaterial, prompt);
  try {
    await rememberKey(env, keyMaterial, bytes);
    return localCipher(await importAesKey(bytes));
  } finally {
    bytes.fill(0);
  }
}

/**
 * A remembered key that cannot decrypt is the wrong key for this vault (the
 * fingerprint only says which vault, not that the key still opens it), so it
 * is forgotten and the error says to unlock again.
 */
function forgetOnFailure(cipher: VaultCipher, env: NodeJS.ProcessEnv): VaultCipher {
  return {
    ...cipher,
    async decrypt(blob) {
      try {
        return await cipher.decrypt(blob);
      } catch {
        await forgetKey(env);
        throw new AgentError("The key remembered on this device no longer opens the vault, so it was forgotten. Unlock again.");
      }
    },
  };
}

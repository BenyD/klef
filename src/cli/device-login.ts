// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The browser half of `klef login`.
//
// The CLI starts a request, prints a short code, opens the browser, and waits.
// The user approves on a page that requires a real session, and the CLI
// collects a token sealed to a key only it holds. No token passes through a
// clipboard, which is the step that leaked one when this was paste-only.

import { CliError } from "./ui.ts";
import { spawn } from "node:child_process";
import { hostname, type as osType } from "node:os";
import { DEVICE_POLL_INTERVAL_MS } from "../shared/device-code.ts";
import { tidyMachineLabel } from "./machine-label.ts";
import {
  generateSealKeypair,
  isSealedToken,
  openToken,
  type SealedToken,
} from "../shared/device-seal.ts";
import { isSealedVaultKey, openVaultKey } from "../shared/device-unlock.ts";
import type { Bytes } from "../shared/encoding.ts";

export class DeviceLoginError extends CliError {
  constructor(message: string) {
    super("server", message);
  }
}

interface StartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

/**
 * Names this machine on the approval page, so the user knows what they are
 * approving, and in the web app's token list once they have.
 */
export function machineLabel(): string {
  return tidyMachineLabel(`${osType()} on ${hostname()}`).slice(0, 60);
}

/**
 * Open a URL in the user's browser. Best effort: if it fails the code and URL
 * are already on screen, so the flow still completes by hand.
 */
export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // Nothing to do; the URL is printed either way.
  }
}

async function post(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DeviceLoginError(`Couldn't reach ${new URL(url).origin}. Are you online?`);
  }
}

export interface DeviceLogin {
  userCode: string;
  verificationUri: string;
  /**
   * Resolves once approved: the access token, and the vault key's raw bytes
   * when the browser also unlocked this CLI (null when it did not). `userId`
   * opens the key: it is sealed to this login's user code and the approver.
   */
  collect: () => Promise<{ token: string; openVaultKey: (userId: string) => Promise<Bytes | null> }>;
}

/**
 * Begin a browser login. Returns the code to show the user and a function that
 * waits for approval; the caller decides how to present the waiting.
 */
export async function beginDeviceLogin(
  baseUrl: string,
  label = machineLabel(),
): Promise<DeviceLogin> {
  const { publicJwk, privateKey } = await generateSealKeypair();

  const res = await post(`${baseUrl}/api/cli/device`, { label, publicJwk });
  if (!res.ok) {
    throw new DeviceLoginError(
      `Couldn't start a login (${res.status}). Try \`klef login --paste\` instead.`,
    );
  }
  const started = (await res.json()) as StartResponse;

  const deadline = Date.now() + started.expiresIn * 1000;
  const intervalMs = Math.max(started.interval * 1000, DEVICE_POLL_INTERVAL_MS);

  async function collect(): Promise<{ token: string; openVaultKey: (userId: string) => Promise<Bytes | null> }> {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));

      const poll = await post(`${baseUrl}/api/cli/device/token`, {
        deviceCode: started.deviceCode,
      });

      if (poll.status === 428) continue; // still waiting on the browser
      if (poll.status === 403) {
        throw new DeviceLoginError("That request was denied in the browser.");
      }
      if (poll.status === 410) {
        throw new DeviceLoginError("That code expired. Run `klef login` again.");
      }
      if (!poll.ok) {
        throw new DeviceLoginError(`Login failed (${poll.status}).`);
      }

      const body = (await poll.json()) as { sealedToken?: unknown; sealedVaultKey?: unknown };
      if (!isSealedToken(body.sealedToken)) {
        throw new DeviceLoginError("The server sent a token this machine can't open.");
      }
      const token = await openSealed(privateKey, body.sealedToken);
      const sealedKey = isSealedVaultKey(body.sealedVaultKey) ? body.sealedVaultKey : null;
      return {
        token,
        async openVaultKey(userId: string) {
          if (!sealedKey) return null;
          try {
            return await openVaultKey(privateKey, publicJwk, sealedKey, { userCode: started.userCode, userId });
          } catch {
            // Sealed for someone or something else: sign in, but stay locked.
            return null;
          }
        },
      };
    }
    throw new DeviceLoginError("That code expired. Run `klef login` again.");
  }

  return {
    userCode: started.userCode,
    verificationUri: started.verificationUri,
    collect,
  };
}

async function openSealed(
  privateKey: CryptoKey,
  sealed: SealedToken,
): Promise<string> {
  try {
    return await openToken(privateKey, sealed);
  } catch {
    // Only this process holds the private half, so a failure here means the
    // seal was not made for us.
    throw new DeviceLoginError(
      "The token that came back wasn't sealed to this machine. Run `klef login` again.",
    );
  }
}

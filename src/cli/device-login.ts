// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The browser half of `klef login`.
//
// The CLI starts a request, prints a short code, opens the browser, and waits.
// The user approves on a page that requires a real session, and the CLI
// collects a token sealed to a key only it holds. No token passes through a
// clipboard, which is the step that leaked one when this was paste-only.

import { spawn } from "node:child_process";
import { hostname, type as osType } from "node:os";
import { DEVICE_POLL_INTERVAL_MS } from "../shared/device-code.ts";
import {
  generateSealKeypair,
  isSealedToken,
  openToken,
  type SealedToken,
} from "../shared/device-seal.ts";

export class DeviceLoginError extends Error {}

interface StartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

/** Names this machine on the approval page, so the user knows what they are approving. */
export function machineLabel(): string {
  return `${osType()} on ${hostname()}`.slice(0, 60);
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
  /** Resolves with the access token once approved. */
  collect: () => Promise<string>;
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

  async function collect(): Promise<string> {
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

      const body = (await poll.json()) as { sealedToken?: unknown };
      if (!isSealedToken(body.sealedToken)) {
        throw new DeviceLoginError("The server sent a token this machine can't open.");
      }
      return openSealed(privateKey, body.sealedToken);
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

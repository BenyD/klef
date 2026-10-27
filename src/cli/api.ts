// SPDX-License-Identifier: AGPL-3.0-or-later
//
// HTTP client for the Klef API, authenticated with a personal access token.
//
// Everything this client fetches is either ciphertext or a plaintext name. It
// has no way to obtain a secret value, because the server has no way to serve
// one — decryption happens after this layer, against a key derived locally.
//
// Note the explicit field declarations instead of TypeScript parameter
// properties. Parameter properties emit runtime code, so Node's type-stripping
// refuses them, and the whole CLI is written to stay strip-compatible: `node
// src/cli/index.ts` runs the source as-is, with no build step between the code
// you read and the code that handles your keys.

import { command } from "./invocation.ts";
import { CliError, type NextStep } from "./ui.ts";
import type { VaultTree } from "../shared/api-types.ts";
import type { EncryptedBlob, VaultKeyMaterial } from "../shared/types.ts";

export class ApiError extends CliError {
  readonly status: number;

  constructor(message: string, status: number, options: { hint?: string; next?: (string | NextStep)[] } = {}) {
    super(status === 0 ? "network" : status === 401 ? "token_rejected" : "server", message, options);
    this.status = status;
  }
}

/** A 401 means the token is gone, expired, or revoked — always actionable. */
export class UnauthorizedError extends ApiError {
  constructor() {
    super("Your access token was rejected.", 401, {
      hint: "It may have expired or been revoked. Sign in again.",
      next: [command("login")],
    });
  }
}

export interface VaultStatus {
  exists: boolean;
  keyMaterial?: VaultKeyMaterial;
}

export interface CurrentVersion {
  id: string;
  blob: EncryptedBlob;
  createdAt: string;
}

export class KlefApi {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl;
    this.#token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${this.#token}`,
        },
      });
    } catch {
      // Status 0 marks "never got a response", distinct from any HTTP failure.
      throw new ApiError(`Couldn't reach ${this.#baseUrl}. Are you online?`, 0);
    }

    if (res.status === 401) throw new UnauthorizedError();
    if (res.status === 403) {
      throw new ApiError(
        "That action needs a browser session; access tokens can't perform it.",
        403,
      );
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
    }

    return res.json() as Promise<T>;
  }

  /** Cheap token check: who does this token belong to? */
  whoami(): Promise<{ user: { id: string; email: string; name: string } }> {
    return this.request("/api/me");
  }

  /** Wrapped DEK + KDF params. Opaque — unwrapping happens locally. */
  vault(): Promise<VaultStatus> {
    return this.request("/api/vault");
  }

  /** Workspace / project / file names. Plaintext by design. */
  tree(): Promise<VaultTree> {
    return this.request("/api/tree");
  }

  /** Every version of a file, newest first: ids and dates, nothing encrypted. */
  versions(fileId: string): Promise<{ versions: { id: string; createdAt: string; isCurrent: boolean }[] }> {
    return this.request(`/api/files/${encodeURIComponent(fileId)}/versions`);
  }

  /** One version's opaque blob, by id: the base a three-way merge needs. */
  version(fileId: string, versionId: string): Promise<{ version: CurrentVersion }> {
    return this.request(`/api/files/${encodeURIComponent(fileId)}/versions/${encodeURIComponent(versionId)}`);
  }

  currentVersion(fileId: string): Promise<{ version: CurrentVersion | null }> {
    return this.request(`/api/files/${encodeURIComponent(fileId)}/current`);
  }

  /**
   * Create an empty env file in a project. Names and the environment label are
   * plaintext by design; the contents arrive afterwards as an encrypted
   * version, like any other save.
   */
  createFile(
    projectId: string,
    name: string,
    environment: string | null,
  ): Promise<{ id: string; name: string }> {
    return this.request("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, name, environment }),
    });
  }

  /**
   * Add a version. Saves are append-only server-side: a new row becomes the
   * current one and every earlier version stays, so a bad push is recoverable
   * from the web app rather than destructive.
   */
  saveVersion(fileId: string, blob: EncryptedBlob): Promise<{ id: string; createdAt: string }> {
    return this.request(`/api/files/${encodeURIComponent(fileId)}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blob }),
    });
  }
}

import type { AccessTokenSummary } from "../shared/api-types.ts";
import { apiFetch } from "./api-fetch.ts";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const listTokens = () =>
  req<{ tokens: AccessTokenSummary[] }>("/api/tokens").then((r) => r.tokens);

/**
 * The `token` field is the only time the plaintext token exists outside the
 * user's clipboard — the server stores only its hash. Show it once, then let
 * it go.
 */
export const createToken = (name: string, expiresInDays: number | null) =>
  req<{ token: string; accessToken: AccessTokenSummary }>("/api/tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      expiresInDays === null ? { name } : { name, expiresInDays },
    ),
  });

export const revokeToken = (id: string) =>
  req(`/api/tokens/${id}`, { method: "DELETE" });

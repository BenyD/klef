import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logout } from "./commands/logout.ts";
import { loadToken, saveToken } from "./credentials.ts";
import { resetUi } from "./ui.ts";

// `klef logout` revoking its own token, so signing out of a machine doesn't
// leave a live token behind in the web app's list.

const TOKEN = `klef_pat_${"a".repeat(43)}`;

let dir: string;
let env: NodeJS.ProcessEnv;
let output: string[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-logout-"));
  env = {
    KLEF_API_URL: "https://klef.test",
    KLEF_NO_KEYCHAIN: "1",
    KLEF_CONFIG_DIR: path.join(dir, ".config"),
    KLEF_AGENT_SOCK: path.join(dir, ".agent", "agent.sock"),
  };
  output = [];
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUi();
  await rm(dir, { recursive: true, force: true });
  // The token is a credential; signing out never prints it.
  expect(output.join("\n")).not.toContain(TOKEN);
});

function server(status: number) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: status === 200 }), { status }),
  );
}

describe("klef logout", () => {
  it("revokes the stored token, then forgets it", async () => {
    await saveToken(TOKEN, env);
    const fetchSpy = server(200);
    vi.stubGlobal("fetch", fetchSpy);

    expect(await logout(env)).toBe(0);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://klef.test/api/cli/token");
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(await loadToken(env)).toBeNull();
    expect(output.join("\n")).toContain("revoked its token");
  });

  it("counts an already rejected token as revoked", async () => {
    await saveToken(TOKEN, env);
    vi.stubGlobal("fetch", server(401));
    expect(await logout(env)).toBe(0);
    expect(output.join("\n")).toContain("revoked its token");
  });

  it("still signs out offline, and says the token still works", async () => {
    await saveToken(TOKEN, env);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    expect(await logout(env)).toBe(0);
    expect(await loadToken(env)).toBeNull();
    expect(output.join("\n")).toContain("so it still works");
  });

  it("never revokes a token from KLEF_TOKEN", async () => {
    env.KLEF_TOKEN = TOKEN;
    const fetchSpy = server(200);
    vi.stubGlobal("fetch", fetchSpy);
    expect(await logout(env)).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("KLEF_TOKEN is still set");
  });
});

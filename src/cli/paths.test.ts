import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentSocketPath, apiBaseUrl, configDir, credentialsFile, tokenSlot } from "./paths.ts";

const HOME = "/home/dev";

describe("configDir", () => {
  it("defaults to ~/.config/klef", () => {
    expect(configDir({}, HOME)).toBe(path.join(HOME, ".config", "klef"));
  });

  it("honours XDG_CONFIG_HOME", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/xdg" }, HOME)).toBe(path.join("/xdg", "klef"));
  });

  it("lets KLEF_CONFIG_DIR win outright, for tests and sandboxes", () => {
    expect(configDir({ KLEF_CONFIG_DIR: "/tmp/x", XDG_CONFIG_HOME: "/xdg" }, HOME)).toBe(
      "/tmp/x",
    );
  });
});

describe("credentialsFile", () => {
  it("sits inside the config directory", () => {
    expect(credentialsFile({ KLEF_CONFIG_DIR: "/tmp/x" }, HOME)).toBe(
      path.join("/tmp/x", "credentials.json"),
    );
  });
  it("keeps another server's token in its own file, so klef.sh's is never sent there", () => {
    const env = { KLEF_CONFIG_DIR: "/tmp/x", KLEF_API_URL: "https://klef.example.com/" };
    expect(credentialsFile(env, HOME)).toBe(path.join("/tmp/x", "credentials-klef.example.com.json"));
    expect(tokenSlot(env)).toBe("klef.example.com");
    expect(tokenSlot({ KLEF_API_URL: "https://klef.sh" })).toBeNull();
    expect(tokenSlot({})).toBeNull();
  });
});

describe("apiBaseUrl", () => {
  it("defaults to klef.sh and trims a trailing slash", () => {
    expect(apiBaseUrl({})).toBe("https://klef.sh");
    expect(apiBaseUrl({ KLEF_API_URL: "https://klef.example.com/" })).toBe("https://klef.example.com");
  });

  it("refuses plain http except to this machine, since the token goes in every request", () => {
    expect(() => apiBaseUrl({ KLEF_API_URL: "http://klef.example.com" })).toThrow(/https/);
    expect(() => apiBaseUrl({ KLEF_API_URL: "not a url" })).toThrow(/not a URL/);
    expect(apiBaseUrl({ KLEF_API_URL: "http://localhost:5173" })).toBe("http://localhost:5173");
    expect(apiBaseUrl({ KLEF_API_URL: "http://127.0.0.1:8787" })).toBe("http://127.0.0.1:8787");
  });
});

describe("agentSocketPath", () => {
  it("prefers the runtime directory, which is cleared on logout", () => {
    expect(agentSocketPath({ XDG_RUNTIME_DIR: "/run/user/1000" }, HOME)).toBe(
      path.join("/run/user/1000", "klef-agent.sock"),
    );
  });

  it("falls back to its own directory under the config dir when there is no runtime dir", () => {
    expect(agentSocketPath({ KLEF_CONFIG_DIR: "/tmp/x" }, HOME)).toBe(
      path.join("/tmp/x", "run", "agent.sock"),
    );
  });

  it("is overridable, so tests never touch a shared socket", () => {
    expect(agentSocketPath({ KLEF_AGENT_SOCK: "/tmp/s.sock" }, HOME)).toBe("/tmp/s.sock");
  });
});

describe("apiBaseUrl over the network", () => {
  it("defaults to the hosted instance", () => {
    expect(apiBaseUrl({})).toBe("https://klef.sh");
  });

  it("points at a self-hosted instance when told to", () => {
    expect(apiBaseUrl({ KLEF_API_URL: "https://klef.example.com" })).toBe(
      "https://klef.example.com",
    );
  });

  it("strips trailing slashes so paths concatenate cleanly", () => {
    expect(apiBaseUrl({ KLEF_API_URL: "http://localhost:5173///" })).toBe(
      "http://localhost:5173",
    );
  });

  it("ignores a blank override", () => {
    expect(apiBaseUrl({ KLEF_API_URL: "   " })).toBe("https://klef.sh");
  });
});

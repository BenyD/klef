import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectDoctor } from "./commands/doctor.ts";
import { ISSUES_URL, toCliError } from "./ui.ts";

// `klef doctor` is pasted into public issues, so what matters most is what it
// leaves out.

let dir: string;
let cwd: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-doctor-"));
  cwd = path.join(dir, "repo");
  await mkdir(cwd);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const TOKEN = "klef_pat_doctor_must_never_print_this_0123456789";

describe("klef doctor", () => {
  it("reports versions, setup and links, and never a token or a licence key", async () => {
    const config = path.join(dir, "config");
    await mkdir(path.join(config, "kit"), { recursive: true });
    await writeFile(
      path.join(config, "kit", "acme.json"),
      JSON.stringify({ workerName: "acme", instanceId: "lki_secretish", databaseId: "db", url: "https://acme.workers.dev", version: "1.0.0" }),
    );
    await writeFile(path.join(cwd, ".klef.json"), JSON.stringify({ workspace: "Personal", project: "api", file: ".env.local" }));
    const env = { KLEF_CONFIG_DIR: config, KLEF_TOKEN: TOKEN, KLEF_API_URL: "http://127.0.0.1:9", KLEF_NO_KEYCHAIN: "1" };

    const report = await collectDoctor(env, cwd);
    expect(report).toMatchObject({
      signedIn: true,
      tokenStore: "environment",
      server: { url: "http://127.0.0.1:9", reachable: false },
      project: { workspace: "Personal", project: "api", file: ".env.local" },
      kits: [{ workerName: "acme", version: "1.0.0", deployed: true }],
    });
    const text = JSON.stringify(report);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("lki_secretish");
  });

  it("says plainly when the server address is not one it will use", async () => {
    const report = await collectDoctor({ KLEF_CONFIG_DIR: dir, KLEF_API_URL: "http://klef.example.com", KLEF_NO_KEYCHAIN: "1" }, cwd);
    expect(report.server).toEqual({ url: "(KLEF_API_URL is not a valid https URL)", reachable: false });
  });
});

describe("an unexpected error", () => {
  it("is called a bug, with doctor and where to report it", () => {
    const err = toCliError(new TypeError("x is undefined"));
    expect(err.code).toBe("internal");
    expect(err.hint).toContain(ISSUES_URL);
    expect(err.next.map((n) => n.command).join(" ")).toMatch(/doctor/);
  });
});

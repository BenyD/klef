import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isLicenseKeyShape,
  isWorkerName,
  kitWranglerConfig,
  parseDatabaseId,
  parseDatabaseNames,
  unfinishedSetup,
  parseDeployUrl,
  isKitVersion,
  kitNotices,
  kitServer,
  kitStateFile,
  pickDeployment,
  secretSteps,
  updateCheckDue,
  type KitState,
} from "./kit-lib.ts";

const BUILT = {
  compatibility_date: "2026-06-25",
  compatibility_flags: ["nodejs_compat"],
  rules: [{ type: "ESModule", globs: ["**/*.js"] }],
  no_bundle: true,
  assets: { not_found_handling: "single-page-application", run_worker_first: ["/", "/api/*"] },
  observability: { enabled: true },
};

describe("kitWranglerConfig", () => {
  it("runs the built Worker with its own database, self-hosted, and nothing of klef.sh's", () => {
    const config = kitWranglerConfig(BUILT, { name: "acme-klef", databaseId: "11111111-2222-3333-4444-555555555555" });
    expect(config).toEqual({
      name: "acme-klef",
      main: "worker/index.js",
      compatibility_date: "2026-06-25",
      compatibility_flags: ["nodejs_compat"],
      rules: BUILT.rules,
      no_bundle: true,
      assets: {
        binding: "ASSETS",
        directory: "client",
        not_found_handling: "single-page-application",
        run_worker_first: ["/", "/api/*"],
      },
      d1_databases: [
        {
          binding: "DB",
          database_name: "acme-klef-db",
          database_id: "11111111-2222-3333-4444-555555555555",
          migrations_dir: "migrations",
        },
      ],
      vars: { KLEF_SELF_HOSTED: "true" },
      observability: { enabled: true },
    });
    const text = JSON.stringify(config);
    expect(text).not.toMatch(/klef\.sh|DODO|routes/);
  });

  it("leaves a placeholder until setup creates the database", () => {
    const config = kitWranglerConfig(BUILT, { name: "klef", databaseId: null }) as { d1_databases: { database_id: string }[] };
    expect(config.d1_databases[0]!.database_id).toBe("REPLACED_BY_SETUP");
  });
});

describe("parsers", () => {
  it("finds the database id in either output format", () => {
    const id = "6e2e8c39-dba0-4543-b12b-1c3c29050905";
    expect(parseDatabaseId(`[[d1_databases]]\nbinding = "DB"\ndatabase_name = "klef-db"\ndatabase_id = "${id}"`)).toBe(id);
    expect(parseDatabaseId(`{ "binding": "DB", "database_id": "${id}" }`)).toBe(id);
    expect(parseDatabaseId("Successfully created DB")).toBeNull();
  });

  it("finds the workers.dev URL a deploy prints", () => {
    expect(parseDeployUrl("Uploaded klef (3.2 sec)\nDeployed klef triggers\n  https://klef.acme.workers.dev\nCurrent Version ID: x")).toBe(
      "https://klef.acme.workers.dev",
    );
    expect(parseDeployUrl("Deployed with a custom domain only")).toBeNull();
  });
});

describe("checks", () => {
  it("accepts Worker names Cloudflare does", () => {
    expect(isWorkerName("klef")).toBe(true);
    expect(isWorkerName("acme-klef-2")).toBe(true);
    expect(isWorkerName("Klef")).toBe(false);
    expect(isWorkerName("-klef")).toBe(false);
    expect(isWorkerName("klef_db")).toBe(false);
    expect(isWorkerName("")).toBe(false);
  });

  it("accepts licence keys and nothing that could be a path or a command", () => {
    expect(isLicenseKeyShape("KLF-1234-abcd_EFGH")).toBe(true);
    expect(isLicenseKeyShape("../../etc/passwd")).toBe(false);
    expect(isLicenseKeyShape("key; rm -rf /")).toBe(false);
    expect(isLicenseKeyShape("short")).toBe(false);
  });

  it("compares versions numerically", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });
});

describe("secretSteps", () => {
  it("prints one command per secret the Worker reads, with callbacks on the deployed URL", () => {
    const steps = secretSteps("https://klef.acme.workers.dev", "4.125.0", "acme-klef");
    expect(steps.map((s) => s.command)).toEqual(
      ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"].map(
        (n) => `npx wrangler@4.125.0 secret put ${n} --name acme-klef`,
      ),
    );
    expect(steps[4]!.hint).toContain("https://klef.acme.workers.dev/api/auth/callback/github");
  });
});

describe("where kits come from and live", () => {
  it("downloads from klef.sh unless told otherwise, never from KLEF_API_URL", () => {
    expect(kitServer({})).toBe("https://klef.sh");
    expect(kitServer({ KLEF_API_URL: "https://klef.acme.dev" })).toBe("https://klef.sh");
    expect(kitServer({ KLEF_KIT_SERVER: "http://localhost:5193/" })).toBe("http://localhost:5193");
  });

  it("keeps one state file per deployment under the config directory", () => {
    expect(kitStateFile("/home/a/.config/klef", "acme-klef")).toBe("/home/a/.config/klef/kit/acme-klef.json");
  });

  it("picks the deployment named, or the only one", () => {
    expect(pickDeployment(["klef"], undefined)).toBe("klef");
    expect(pickDeployment(["klef", "staging"], "staging")).toBe("staging");
    expect(pickDeployment(["klef", "staging"], undefined)).toEqual({ error: expect.stringContaining("Name the one you mean") });
    expect(pickDeployment([], undefined)).toEqual({ error: expect.stringContaining("No kit deployment") });
    expect(pickDeployment(["klef"], "other")).toEqual({ error: expect.stringContaining("other") });
  });

  it("only takes plain versions, which end up in paths and commands", () => {
    expect(isKitVersion("1.10.0")).toBe(true);
    for (const bad of ["1.0", "1.0.0-beta", "../1.0.0", "1.0.0; rm"]) expect(isKitVersion(bad), bad).toBe(false);
  });
});

describe("update notices", () => {
  const NOW = Date.parse("2027-10-15T12:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  const run = (sub: string) => `klef ${sub}`;
  const dep = (over: Partial<KitState> = {}): KitState => ({
    workerName: "acme",
    instanceId: "lki_1",
    databaseId: "db",
    url: "https://acme.you.workers.dev",
    version: "1.0.0",
    updatesUntil: "2028-11-01T00:00:00.000Z",
    ...over,
  });

  it("passes the version and when updates end to the Worker", () => {
    const config = kitWranglerConfig(BUILT, { name: "acme", databaseId: null, version: "1.2.0", updatesUntil: "2027-11-01T00:00:00.000Z" });
    expect((config as { vars: Record<string, string> }).vars).toEqual({
      KLEF_SELF_HOSTED: "true",
      KLEF_KIT_VERSION: "1.2.0",
      KLEF_KIT_UPDATES_UNTIL: "2027-11-01T00:00:00.000Z",
    });
  });

  it("checks at most once a day", () => {
    expect(updateCheckDue(null, NOW)).toBe(true);
    expect(updateCheckDue(new Date(NOW - DAY + 1000).toISOString(), NOW)).toBe(false);
    expect(updateCheckDue(new Date(NOW - DAY).toISOString(), NOW)).toBe(true);
    expect(updateCheckDue("garbage", NOW)).toBe(true);
  });

  it("says when a newer kit is out, with the command", () => {
    expect(kitNotices([dep()], "1.1.0", NOW, run)).toEqual([
      "Klef kit 1.1.0 is out; acme runs 1.0.0. Update it with: klef kit update acme",
    ]);
    expect(kitNotices([dep({ version: "1.1.0" })], "1.1.0", NOW, run)).toEqual([]);
    expect(kitNotices([dep()], null, NOW, run)).toEqual([]);
  });

  it("warns in the last 30 days of updates, and points at renewing once they end", () => {
    expect(kitNotices([dep({ updatesUntil: "2027-11-01T00:00:00.000Z" })], "1.0.0", NOW, run)).toEqual([
      "Updates for acme end on 1 November 2027. Renew at https://klef.sh/kit to keep getting them.",
    ]);
    expect(kitNotices([dep({ updatesUntil: "2027-10-01T00:00:00.000Z" })], "1.1.0", NOW, run)).toEqual([
      "Klef kit 1.1.0 is out, but acme's updates ended on 1 October 2027. Renew at https://klef.sh/kit to get it; 1.0.0 keeps running.",
    ]);
    expect(kitNotices([dep({ updatesUntil: "2027-10-01T00:00:00.000Z" })], "1.0.0", NOW, run)).toEqual([]);
  });

  it("says nothing for a setup that never finished, or an old state file without the date", () => {
    expect(kitNotices([dep({ version: null })], "9.0.0", NOW, run)).toEqual([]);
    expect(kitNotices([dep({ updatesUntil: undefined })], "1.0.0", NOW, run)).toEqual([]);
  });
});


describe("unfinishedSetup", () => {
  const state = (workerName: string, over: Partial<KitState> = {}): KitState => ({
    workerName,
    instanceId: `lki_${workerName}`,
    databaseId: null,
    url: null,
    version: null,
    ...over,
  });

  it("hands a setup that stopped before creating anything to a new name", () => {
    expect(unfinishedSetup([state("klef")], "klef-test")?.instanceId).toBe("lki_klef");
  });

  it("carries on one that got as far as its database, but never one that deployed", () => {
    expect(unfinishedSetup([state("a", { databaseId: "db" })], "b")?.databaseId).toBe("db");
    expect(unfinishedSetup([state("a", { url: "https://a.workers.dev" })], "b")).toBeNull();
    expect(unfinishedSetup([state("a", { version: "1.0.0" })], "b")).toBeNull();
  });

  it("leaves the name being set up alone, and gives up when it can't tell which one is meant", () => {
    expect(unfinishedSetup([state("klef")], "klef")).toBeNull();
    expect(unfinishedSetup([state("a"), state("b")], "c")).toBeNull();
  });
});

describe("parseDatabaseNames", () => {
  it("reads names from wrangler d1 list --json, and nothing from anything else", () => {
    expect(parseDatabaseNames('[{"uuid":"1","name":"klef-db"},{"uuid":"2","name":"other"}]')).toEqual(["klef-db", "other"]);
    expect(parseDatabaseNames("not json")).toEqual([]);
    expect(parseDatabaseNames('{"name":"x"}')).toEqual([]);
  });
});

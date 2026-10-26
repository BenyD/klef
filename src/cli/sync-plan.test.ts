import { describe, expect, it } from "vitest";
import { decideSync, quickState, type SyncInput } from "./sync-plan.ts";

const baseline = { versionId: "v1", mtimeMs: 1000, size: 4 };
const untouched = { text: "A=1\n", mtimeMs: 1000, size: 4 };
const edited = { text: "A=2\nB=3\n", mtimeMs: 2000, size: 8 };

function decide(input: Partial<SyncInput>) {
  return decideSync({
    local: untouched,
    inVault: true,
    vault: { text: "A=1\n", versionId: "v1" },
    baseline,
    ...input,
  }).action;
}

describe("decideSync", () => {
  it("is in sync when both copies match, record or not", () => {
    expect(decide({})).toBe("in-sync");
    expect(decide({ baseline: null, local: edited, vault: { text: edited.text, versionId: "v9" } })).toBe(
      "in-sync",
    );
  });

  it("pulls a file that is missing here", () => {
    expect(decide({ local: null, baseline: null })).toBe("pull");
  });

  it("pulls a vault change over a local file nobody touched", () => {
    expect(decide({ vault: { text: "A=9\n", versionId: "v2" } })).toBe("pull");
  });

  it("pushes a local edit when the vault has not moved", () => {
    expect(decide({ local: edited })).toBe("push");
  });

  it("stops when both sides changed", () => {
    expect(decide({ local: edited, vault: { text: "A=9\n", versionId: "v2" } })).toBe("conflict");
  });

  it("stops when the files differ and this machine never synced them", () => {
    expect(decide({ local: edited, baseline: null })).toBe("conflict");
  });

  it("stops when neither side moved yet they differ", () => {
    expect(decide({ local: { ...untouched, text: "A=7\n" } })).toBe("conflict");
  });

  it("treats a touched file of the same size as edited", () => {
    expect(decide({ local: { text: "A=2\n", mtimeMs: 1500, size: 4 } })).toBe("push");
  });

  it("creates a vault file that exists only here", () => {
    expect(decide({ inVault: false, vault: null, baseline: null })).toBe("create");
  });

  it("pushes the first version of an empty vault file", () => {
    expect(decide({ vault: null, baseline: null })).toBe("push");
  });

  it("has nothing to do when neither side has the file", () => {
    expect(decide({ local: null, inVault: false, vault: null })).toBe("absent");
    expect(decide({ local: null, vault: null })).toBe("absent");
  });

  it("will not push or create from an empty file", () => {
    const empty = { text: "  \n", mtimeMs: 3000, size: 3 };
    expect(decide({ local: empty })).toBe("conflict");
    expect(decide({ local: empty, inVault: false, vault: null })).toBe("conflict");
  });
});

describe("quickState", () => {
  const base = { versionId: "v1", mtimeMs: 1000, size: 4 };
  const same = { mtimeMs: 1000, size: 4 };

  it("says what it can without the passphrase", () => {
    expect(quickState({ local: same, vaultVersionId: "v1", baseline: base })).toBe("in-sync");
    expect(quickState({ local: { mtimeMs: 2000, size: 4 }, vaultVersionId: "v1", baseline: base })).toBe("edited-here");
    expect(quickState({ local: same, vaultVersionId: "v2", baseline: base })).toBe("changed-in-vault");
    expect(quickState({ local: { mtimeMs: 2000, size: 9 }, vaultVersionId: "v2", baseline: base })).toBe("both-changed");
  });

  it("covers the files one side lacks, and the never-synced ones", () => {
    expect(quickState({ local: null, vaultVersionId: "v1", baseline: null })).toBe("missing-here");
    expect(quickState({ local: same, vaultVersionId: null, baseline: null })).toBe("only-here");
    expect(quickState({ local: null, vaultVersionId: null, baseline: null })).toBe("absent");
    expect(quickState({ local: same, vaultVersionId: "v1", baseline: null })).toBe("unknown");
  });
});

import { describe, expect, it } from "vitest";
import { compareEnvs, keysOf } from "./env-drift.ts";

describe("keysOf", () => {
  it("collects entry keys, ignoring comments and blanks", () => {
    expect(keysOf("# c\nA=1\n\nexport B=2\n")).toEqual(["A", "B"]);
  });
  it("collapses duplicate keys to first-seen order", () => {
    expect(keysOf("B=1\nA=2\nB=3")).toEqual(["B", "A"]);
  });
});

describe("compareEnvs", () => {
  const dev = { id: "d", label: "development", text: "API_KEY=x\nDB_URL=y\nDEBUG=1" };
  const prod = { id: "p", label: "production", text: "API_KEY=x\nDB_URL=y" };

  it("flags a key present in one env but missing in another", () => {
    const r = compareEnvs([dev, prod]);
    expect(r.columns.map((c) => c.label)).toEqual(["development", "production"]);
    expect(r.drifted.map((d) => d.key)).toEqual(["DEBUG"]);
    // DEBUG present in dev (col 0), missing in prod (col 1).
    expect(r.drifted[0]!.present).toEqual([true, false]);
    expect(r.gaps).toBe(1);
  });

  it("reports no drift when every env has the same keys", () => {
    const r = compareEnvs([
      { id: "a", label: "dev", text: "A=1\nB=2" },
      { id: "b", label: "prod", text: "B=9\nA=8" },
    ]);
    expect(r.drifted).toEqual([]);
    expect(r.gaps).toBe(0);
    expect(r.rows.map((row) => row.key)).toEqual(["A", "B"]);
  });

  it("counts gaps across more than two environments", () => {
    const r = compareEnvs([
      { id: "a", label: "dev", text: "A=1\nB=2\nC=3" },
      { id: "b", label: "staging", text: "A=1\nB=2" },
      { id: "c", label: "prod", text: "A=1" },
    ]);
    // B missing in prod; C missing in staging and prod → 3 gaps.
    expect(r.drifted.map((d) => d.key)).toEqual(["B", "C"]);
    expect(r.gaps).toBe(3);
  });

  it("sorts the full key matrix stably", () => {
    const r = compareEnvs([
      { id: "a", label: "one", text: "ZED=1\nalpha=2\nMID=3" },
    ]);
    expect(r.rows.map((row) => row.key)).toEqual(["alpha", "MID", "ZED"]);
    // A single file can't drift against itself.
    expect(r.drifted).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { mergeEnv } from "./env-merge.ts";

describe("mergeEnv, first sync (no base)", () => {
  it("takes the union and keeps the local file's formatting", () => {
    const local = "# App\nA=1\n\nB = 'two'  # note\n";
    const vault = "A=1\nVAULT_ONLY=\"x y\"\n";
    const r = mergeEnv(local, vault, null);
    expect(r.conflicts).toEqual([]);
    expect(r.fromVault).toEqual(["VAULT_ONLY"]);
    expect(r.fromLocal).toEqual(["B"]);
    expect(r.text).toBe("# App\nA=1\n\nB = 'two'  # note\nVAULT_ONLY=\"x y\"\n");
  });

  it("stops only on keys whose values differ, and writes nothing", () => {
    const r = mergeEnv("A=1\nB=2\n", "A=1\nB=3\nC=4\n", null);
    expect(r.conflicts).toEqual(["B"]);
    expect(r.text).toBeNull();
    expect(r.fromVault).toEqual(["C"]);
  });

  it("handles the Lensdrop case: 20 local-only, 1 vault-only, 1 changed", () => {
    const shared = "DATABASE_URL=postgres://x\n";
    const localOnly = Array.from({ length: 20 }, (_, i) => `L${i}=v\n`).join("");
    const local = `${shared}${localOnly}API_KEY=new\n`;
    const vault = `${shared}API_KEY=old\nPROBE_GALLERY_ID=g1\n`;
    const r = mergeEnv(local, vault, null);
    expect(r.conflicts).toEqual(["API_KEY"]);
    expect(r.fromVault).toEqual(["PROBE_GALLERY_ID"]);
    expect(r.fromLocal).toHaveLength(20);
    // Once API_KEY is settled, PROBE_GALLERY_ID comes across instead of being dropped.
    const settled = mergeEnv(local.replace("API_KEY=new", "API_KEY=old"), vault, null);
    expect(settled.text).toContain("PROBE_GALLERY_ID=g1");
    expect(settled.text!.match(/^L\d+=/gm)).toHaveLength(20);
  });

  it("copies the vault's line as written, export and quotes included", () => {
    const r = mergeEnv("A=1", "export TOKEN = \"a b\"\n", null);
    expect(r.text).toBe("A=1\nexport TOKEN = \"a b\"");
  });
});

describe("mergeEnv, with a base (three-way)", () => {
  const base = "A=1\nB=2\nC=3\n";

  it("takes whichever side changed a key", () => {
    const r = mergeEnv("A=1\nB=20\nC=3\n", "A=10\nB=2\nC=3\n", base);
    expect(r.text).toBe("A=10\nB=20\nC=3\n");
    expect(r.fromVault).toEqual(["A"]);
    expect(r.fromLocal).toEqual(["B"]);
  });

  it("never brings back a key one side deleted", () => {
    const deletedHere = mergeEnv("A=1\nB=2\n", "A=1\nB=2\nC=3\nD=4\n", base);
    expect(deletedHere.text).toBe("A=1\nB=2\nD=4\n");
    expect(deletedHere.removedThere).toEqual(["C"]);
    expect(deletedHere.fromVault).toEqual(["D"]);

    const deletedThere = mergeEnv("# keep\nA=1\nB=2\nC=3\n", "A=1\nC=3\n", base);
    expect(deletedThere.text).toBe("# keep\nA=1\nC=3\n");
    expect(deletedThere.removedHere).toEqual(["B"]);
  });

  it("is a conflict when both sides changed one key differently", () => {
    const r = mergeEnv("A=5\nB=2\nC=3\n", "A=6\nB=2\nC=3\n", base);
    expect(r.conflicts).toEqual(["A"]);
    expect(r.text).toBeNull();
  });

  it("agrees when both sides made the same change", () => {
    const r = mergeEnv("A=5\nB=2\nC=3\n", "A=5\nB=2\nC=3\n", base);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toBe("A=5\nB=2\nC=3\n");
  });

  it("is a conflict when one side deleted what the other changed", () => {
    expect(mergeEnv("A=1\nC=3\n", "A=1\nB=9\nC=3\n", base).conflicts).toEqual(["B"]);
  });
});

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

describe("mergeEnv, CRLF files", () => {
  it("merges by key instead of seeing no keys and keeping this file", () => {
    const base = "A=1\r\nB=2\r\n";
    const r = mergeEnv("A=1\r\nB=2\r\nC=3\r\n", "A=9\r\nB=2\r\n", base);
    expect(r.fromVault).toEqual(["A"]);
    expect(r.fromLocal).toEqual(["C"]);
    expect(r.text).toBe("A=9\r\nB=2\r\nC=3\r\n");
  });
});

describe("mergeEnv, multi-line values", () => {
  const key = (body: string) => `K="BEGIN\n${body}\nEND"\n`;

  it("takes a value the vault rotated, every line of it", () => {
    const base = `${key("old")}A=1\n`;
    const r = mergeEnv(`${key("old")}A=1\nB=2\n`, `${key("new")}A=1\n`, base);
    expect(r.fromVault).toEqual(["K"]);
    expect(r.fromLocal).toEqual(["B"]);
    expect(r.text).toBe(`${key("new")}A=1\nB=2\n`);
  });

  it("is a conflict when both sides changed a line inside the value", () => {
    const base = `${key("old")}A=1\n`;
    const r = mergeEnv(`${key("mine")}A=1\n`, `${key("theirs")}A=1\n`, base);
    expect(r.conflicts).toEqual(["K"]);
    expect(r.text).toBeNull();
  });

  it("brings a key the vault added across whole", () => {
    const r = mergeEnv("A=1\n", `A=1\n${key("x")}`, null);
    expect(r.fromVault).toEqual(["K"]);
    expect(r.text).toBe(`A=1\n${key("x")}`);
  });

  it("removes a key the vault deleted with all its lines, and no stray keys", () => {
    const base = `A=1\nK="BEGIN\nX=mid\nEND"\nB=2\n`;
    const r = mergeEnv(`${base}C=3\n`, "A=1\nB=2\n", base);
    expect(r.removedHere).toEqual(["K"]);
    expect(r.text).toBe("A=1\nB=2\nC=3\n");
  });

  it("edits from the bottom up, so a value that grows doesn't move the next edit", () => {
    const base = 'K="a\nb"\nM=1\nZ=1\n';
    const r = mergeEnv('K="a\nb"\nM=1\nZ=1\nL=1\n', 'K="a\nb\nc\nd"\nM=2\nZ=1\n', base);
    expect(r.text).toBe('K="a\nb\nc\nd"\nM=2\nZ=1\nL=1\n');
  });
});

describe("mergeEnv, comments", () => {
  const base = "# Old\nA=1\n";

  it("stops when the vault changed a comment this file has differently", () => {
    const r = mergeEnv("# Old\nA=1\nB=2\n", "# New\nA=1\n", base);
    expect(r.otherLines).toBe(true);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toBeNull();
  });

  it("keeps this file's comments when only this file changed them", () => {
    const r = mergeEnv("# Mine\nA=1\nB=2\n", "# Old\nA=1\nV=3\n", base);
    expect(r.otherLines).toBe(false);
    expect(r.text).toBe("# Mine\nA=1\nB=2\nV=3\n");
  });

  it("ignores blank lines and line endings when comparing them", () => {
    expect(mergeEnv("# Old\r\n\r\nA=1\r\nB=2\r\n", "# Old\nA=1\n\n", base).otherLines).toBe(false);
  });

  it("goes by keys alone on a first sync, with no base to compare comments with", () => {
    expect(mergeEnv("# Mine\nA=1\n", "# Theirs\nA=1\nB=2\n", null)).toMatchObject({ otherLines: false, text: "# Mine\nA=1\nB=2\n" });
  });
});

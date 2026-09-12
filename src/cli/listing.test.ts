import { describe, expect, it } from "vitest";
import { formatListing, linkArgs, listFiles, listingJson, shellQuote } from "./listing.ts";
import type { VaultTree } from "../shared/api-types.ts";

const file = (name: string, environment: string | null, versionId: string | null) => ({
  id: `f-${name}`,
  name,
  currentVersionId: versionId,
  environment,
  createdAt: "2026-01-01",
});

const TREE: VaultTree = {
  workspaces: [
    {
      id: "w1",
      name: "Maxapp GmbH",
      icon: null,
      createdAt: "2026-01-01",
      projects: [
        {
          id: "p1",
          name: "Ewig",
          framework: null,
          icon: null,
          createdAt: "2026-01-01",
          files: [
            file(".env.local", "development", "v1"),
            file(".env.production", "production", null),
          ],
        },
      ],
    },
    {
      id: "w2",
      name: "Personal",
      icon: null,
      createdAt: "2026-01-01",
      projects: [
        {
          id: "p2",
          name: "klef",
          framework: null,
          icon: null,
          createdAt: "2026-01-01",
          files: [file(".dev.vars", null, "v2")],
        },
        // A project with no files contributes nothing to the listing.
        { id: "p3", name: "empty", framework: null, icon: null, createdAt: "2026-01-01", files: [] },
      ],
    },
  ],
};

const EMPTY: VaultTree = { workspaces: [] };

describe("listFiles", () => {
  it("flattens every file in tree order", () => {
    expect(listFiles(TREE).map((e) => `${e.project}/${e.file}`)).toEqual([
      "Ewig/.env.local",
      "Ewig/.env.production",
      "klef/.dev.vars",
    ]);
  });

  it("reports whether there is anything to pull", () => {
    const [local, production] = listFiles(TREE);
    expect(local?.hasVersion).toBe(true);
    expect(production?.hasVersion).toBe(false);
  });

  it("carries a null environment through unchanged", () => {
    expect(listFiles(TREE)[2]?.environment).toBeNull();
  });

  it("is empty for an empty vault", () => {
    expect(listFiles(EMPTY)).toEqual([]);
  });
});

describe("shellQuote", () => {
  it("leaves safe names alone", () => {
    expect(shellQuote("Ewig")).toBe("Ewig");
    expect(shellQuote(".env.local")).toBe(".env.local");
  });

  it("quotes names with spaces", () => {
    expect(shellQuote("Maxapp GmbH")).toBe("'Maxapp GmbH'");
  });

  it("escapes an embedded single quote", () => {
    expect(shellQuote("Beny's Team")).toBe("'Beny'\\''s Team'");
  });

  it("quotes the empty string rather than vanishing", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("linkArgs", () => {
  it("produces a pasteable argument list", () => {
    expect(linkArgs(listFiles(TREE)[0]!)).toBe("'Maxapp GmbH' Ewig .env.local");
  });
});

describe("listingJson", () => {
  it("exposes names and flags, never ids", () => {
    const json = listingJson(TREE);
    expect(json.files).toHaveLength(3);
    expect(json.files[0]).toEqual({
      workspace: "Maxapp GmbH",
      project: "Ewig",
      file: ".env.local",
      environment: "development",
      hasVersion: true,
    });
    expect(JSON.stringify(json)).not.toContain("f-.env.local");
  });
});

describe("formatListing", () => {
  const commands = { link: "klef link", list: "klef list" };
  const render = (tree: VaultTree) => formatListing(listFiles(tree), commands).join("\n");

  it("groups files under workspace / project", () => {
    const out = render(TREE);
    expect(out).toContain("  Maxapp GmbH / Ewig");
    expect(out).toContain("  Personal / klef");
  });

  it("annotates the environment and an unsaved file", () => {
    const out = render(TREE);
    expect(out).toContain(".env.production  (production, no saved version yet)");
  });

  it("never offers an example with nothing to pull", () => {
    const unsaved: VaultTree = {
      workspaces: [
        {
          id: "w",
          name: "Solo",
          icon: null,
          createdAt: "2026-01-01",
          projects: [
            {
              id: "p",
              name: "site",
              framework: null,
              icon: null,
              createdAt: "2026-01-01",
              files: [file(".env", "development", null), file(".env.local", "development", "v1")],
            },
          ],
        },
      ],
    };
    expect(render(unsaved)).toContain("klef link Solo site .env.local");
  });

  it("prefers plain quoting over an escaped apostrophe", () => {
    // Both are pullable and both need quoting; the one without the apostrophe
    // is the better thing to put in front of someone.
    const mixed: VaultTree = {
      workspaces: [
        {
          id: "w1",
          name: "Beny's Team",
          icon: null,
          createdAt: "2026-01-01",
          projects: [
            {
              id: "p1",
              name: "beny.one",
              framework: null,
              icon: null,
              createdAt: "2026-01-01",
              files: [file(".env", null, "v1")],
            },
          ],
        },
        {
          id: "w2",
          name: "Maxapp GmbH",
          icon: null,
          createdAt: "2026-01-01",
          projects: [
            {
              id: "p2",
              name: "Ewig",
              framework: null,
              icon: null,
              createdAt: "2026-01-01",
              files: [file(".env.local", "development", "v2")],
            },
          ],
        },
      ],
    };
    expect(render(mixed)).toContain("klef link 'Maxapp GmbH' Ewig .env.local");
  });

  it("still quotes correctly when every candidate needs it", () => {
    const spaced: VaultTree = {
      workspaces: [
        {
          id: "w",
          name: "Beny's Team",
          icon: null,
          createdAt: "2026-01-01",
          projects: [
            {
              id: "p",
              name: "beny.one",
              framework: null,
              icon: null,
              createdAt: "2026-01-01",
              files: [file(".env", null, "v1")],
            },
          ],
        },
      ],
    };
    expect(render(spaced)).toContain("klef link 'Beny'\\''s Team' beny.one .env");
  });

  it("leaves no trailing whitespace on an unannotated file", () => {
    const bare: VaultTree = {
      workspaces: [
        {
          id: "w",
          name: "Solo",
          icon: null,
          createdAt: "2026-01-01",
          projects: [
            {
              id: "p",
              name: "site",
              framework: null,
              icon: null,
              createdAt: "2026-01-01",
              files: [file(".env", null, "v1"), file(".env.production", "production", "v2")],
            },
          ],
        },
      ],
    };
    expect(render(bare)).toContain("\n    .env\n");
  });

  it("prefers an example that needs no shell quoting", () => {
    // "Maxapp GmbH / Ewig / .env.local" comes first and has a version, but
    // "Personal / klef / .dev.vars" needs no quoting, so it wins.
    expect(render(TREE)).toContain("klef link Personal klef .dev.vars");
  });

  it("points at the machine-readable form", () => {
    expect(render(TREE)).toContain("klef list --json");
  });

  it("says so when the vault is empty", () => {
    expect(render(EMPTY)).toBe("No env files in your vault yet. Create one in the web app first.");
  });
});

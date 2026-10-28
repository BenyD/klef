// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT_HINT,
  parseLayoutHint,
  readLayoutHint,
  rememberLayout,
  treeHint,
} from "./layout-hint.ts";

// happy-dom here ships no localStorage; stub one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

beforeEach(() => store.clear());

describe("parseLayoutHint", () => {
  it("falls back to the default for nothing or garbage", () => {
    expect(parseLayoutHint(null)).toEqual(DEFAULT_LAYOUT_HINT);
    expect(parseLayoutHint("not json")).toEqual(DEFAULT_LAYOUT_HINT);
    expect(parseLayoutHint('{"files":"3"}')).toEqual(DEFAULT_LAYOUT_HINT);
  });

  it("clamps counts and lines expanded flags up with projects", () => {
    const hint = parseLayoutHint(
      JSON.stringify({
        files: [2, -1, 99, 1.7, "x"],
        expanded: [true, "yes"],
        tabs: 3,
        fileOpen: true,
      }),
    );
    expect(hint).toEqual({
      files: [2, 0, 12, 1, 0],
      expanded: [true, false, false, false, false],
      tabs: 3,
      fileOpen: true,
    });
  });

  it("never claims an open file without a tab to hold it", () => {
    expect(
      parseLayoutHint(JSON.stringify({ files: [], tabs: 0, fileOpen: true }))
        .fileOpen,
    ).toBe(false);
  });

  it("caps the number of projects", () => {
    const hint = parseLayoutHint(JSON.stringify({ files: Array(40).fill(1) }));
    expect(hint.files).toHaveLength(12);
  });
});

describe("rememberLayout", () => {
  it("merges each half without losing the other", () => {
    rememberLayout(treeHint([{ id: "a", files: [1, 2] }, { id: "b", files: [] }], new Set(["b"])));
    rememberLayout({ tabs: 2, fileOpen: true });
    expect(readLayoutHint()).toEqual({
      files: [2, 0],
      expanded: [false, true],
      tabs: 2,
      fileOpen: true,
    });
    // Nothing identifying is stored.
    expect([...store.values()].join()).not.toMatch(/"a"|"b"/);
  });
});

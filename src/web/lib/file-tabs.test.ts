import { describe, expect, it } from "vitest";
import {
  closeTabs,
  cycleTab,
  moveTab,
  openTab,
  othersOf,
  restoreTabs,
  rightOf,
  serializeTabs,
  tabForDigit,
  tabGroups,
  type Tab,
  type TabState,
} from "./file-tabs.ts";

const tab = (id: string, name = `.env.${id}`, project = "web"): Tab => ({
  id,
  name,
  projectId: `p-${project}`,
  project,
});
const [a, b, c, d] = [tab("a"), tab("b"), tab("c"), tab("d")];
const state = (activeId: string | null, tabs = [a, b, c, d]): TabState<Tab> => ({
  tabs,
  activeId,
});
const ids = (s: TabState<Tab>) => s.tabs.map((t) => t.id);

describe("openTab", () => {
  it("appends a new tab and activates it", () => {
    const s = openTab(state("a", [a, b]), c);
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(s.activeId).toBe("c");
  });

  it("places a tab after its project's last tab", () => {
    const [w1, api1, w2] = [tab("w1"), tab("api1", ".env", "api"), tab("w2")];
    expect(ids(openTab(state("w1", [w1, api1]), w2))).toEqual([
      "w1",
      "w2",
      "api1",
    ]);
  });

  it("focuses an already open tab without moving it", () => {
    const s = openTab(state("c"), a);
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
    expect(s.activeId).toBe("a");
  });
});

describe("closeTabs", () => {
  it("moves focus to the right neighbour when the active tab closes", () => {
    expect(closeTabs(state("b"), ["b"]).activeId).toBe("c");
  });

  it("falls back to the left neighbour at the end of the strip", () => {
    expect(closeTabs(state("d"), ["d"]).activeId).toBe("c");
  });

  it("keeps focus when a different tab closes", () => {
    const s = closeTabs(state("b"), ["d"]);
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(s.activeId).toBe("b");
  });

  it("skips tabs closing in the same batch", () => {
    expect(closeTabs(state("b"), ["b", "c"]).activeId).toBe("d");
    expect(closeTabs(state("c"), ["c", "d"]).activeId).toBe("b");
  });

  it("leaves nothing active once every tab is closed", () => {
    const s = closeTabs(state("a", [a]), ["a"]);
    expect(s).toEqual({ tabs: [], activeId: null });
  });
});

describe("othersOf / rightOf", () => {
  it("lists the tabs to close for 'close others' and 'close to the right'", () => {
    expect(othersOf([a, b, c], "b")).toEqual(["a", "c"]);
    expect(rightOf([a, b, c, d], "b")).toEqual(["c", "d"]);
    expect(rightOf([a, b], "b")).toEqual([]);
    expect(rightOf([a, b], "zzz")).toEqual([]);
  });
});

describe("moveTab", () => {
  it("moves a tab to a new index", () => {
    expect(moveTab([a, b, c, d], 0, 2).map((t) => t.id)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(moveTab([a, b, c, d], 3, 0).map((t) => t.id)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("clamps out-of-range targets and ignores bad sources", () => {
    expect(moveTab([a, b, c], 0, 99).map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(moveTab([a, b], 5, 0).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("cycleTab", () => {
  it("steps forward and back, wrapping at the ends", () => {
    expect(cycleTab(state("a"), 1)).toBe("b");
    expect(cycleTab(state("d"), 1)).toBe("a");
    expect(cycleTab(state("a"), -1)).toBe("d");
  });

  it("starts from an end when nothing is active", () => {
    expect(cycleTab(state(null), 1)).toBe("a");
    expect(cycleTab(state(null), -1)).toBe("d");
    expect(cycleTab(state(null, []), 1)).toBeNull();
  });
});

describe("tabForDigit", () => {
  it("maps 1..8 to positions and 9 to the last tab", () => {
    expect(tabForDigit([a, b, c, d], 2)).toBe("b");
    expect(tabForDigit([a, b, c, d], 9)).toBe("d");
    expect(tabForDigit([a, b], 5)).toBeNull();
    expect(tabForDigit([], 1)).toBeNull();
  });
});

describe("serializeTabs / restoreTabs", () => {
  const known = new Map([a, b, c].map((t) => [t.id, t]));
  const resolve = (id: string) => known.get(id) ?? null;

  it("round-trips ids and the active tab", () => {
    const raw = serializeTabs(state("b", [a, b, c]));
    expect(JSON.parse(raw)).toEqual({ ids: ["a", "b", "c"], activeId: "b" });
    expect(restoreTabs(raw, resolve)).toEqual(state("b", [a, b, c]));
  });

  it("drops files that no longer exist, and an active tab among them", () => {
    const raw = serializeTabs(state("d"));
    expect(restoreTabs(raw, resolve)).toEqual(state(null, [a, b, c]));
  });

  it("restores nothing from missing or malformed storage", () => {
    const empty = { tabs: [], activeId: null };
    expect(restoreTabs(null, resolve)).toEqual(empty);
    expect(restoreTabs("not json", resolve)).toEqual(empty);
    expect(restoreTabs('{"ids":"a"}', resolve)).toEqual(empty);
    expect(restoreTabs("null", resolve)).toEqual(empty);
  });
});

describe("project groups", () => {
  const [w1, w2] = [tab("w1"), tab("w2")];
  const api1 = tab("api1", ".env", "api");
  const api2 = tab("api2", ".env.local", "api");

  it("lists each project's run in order of its first tab", () => {
    const groups = tabGroups([w1, api1, w2, api2]);
    expect(groups.map((g) => g.project)).toEqual(["web", "api"]);
    expect(groups.map((g) => g.tabs.map((t) => t.id))).toEqual([
      ["w1", "w2"],
      ["api1", "api2"],
    ]);
  });

  it("keeps a dragged tab inside its own group", () => {
    // Dropping w1 between the api tabs sends it back after w2.
    expect(moveTab([w1, w2, api1, api2], 0, 2).map((t) => t.id)).toEqual([
      "w2",
      "w1",
      "api1",
      "api2",
    ]);
  });

  it("moves a whole group when its tab is dragged to the front", () => {
    expect(moveTab([w1, w2, api1, api2], 2, 0).map((t) => t.id)).toEqual([
      "api1",
      "api2",
      "w1",
      "w2",
    ]);
  });

  it("regroups tabs restored from an ungrouped save", () => {
    const all = new Map([w1, w2, api1].map((t) => [t.id, t]));
    const raw = JSON.stringify({ ids: ["w1", "api1", "w2"], activeId: "w2" });
    const restored = restoreTabs(raw, (id) => all.get(id) ?? null);
    expect(ids(restored)).toEqual(["w1", "w2", "api1"]);
  });
});

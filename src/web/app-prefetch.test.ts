import { afterEach, describe, expect, it, vi } from "vitest";

const fetchVault = vi.fn();
const getTree = vi.fn();
vi.mock("./vault-api.ts", () => ({ fetchVault: () => fetchVault() }));
vi.mock("./structure-api.ts", () => ({ getTree: () => getTree() }));

const {
  PREFETCH_MAX_AGE_MS,
  prefetchAppData,
  resetPrefetch,
  takePrefetchedTree,
  takePrefetchedVault,
} = await import("./app-prefetch.ts");

afterEach(() => {
  resetPrefetch();
  fetchVault.mockReset();
  getTree.mockReset();
});

describe("app prefetch", () => {
  it("starts the vault and tree requests together, once", () => {
    fetchVault.mockResolvedValue({ exists: true });
    getTree.mockResolvedValue({ workspaces: [] });
    prefetchAppData("u1", 1000);
    prefetchAppData("u1", 1001); // every render calls it
    expect(fetchVault).toHaveBeenCalledTimes(1);
    expect(getTree).toHaveBeenCalledTimes(1);
  });

  it("hands each prefetch out exactly once", async () => {
    fetchVault.mockResolvedValue({ exists: true });
    getTree.mockResolvedValue({ workspaces: [] });
    prefetchAppData("u1", 1000);
    await expect(takePrefetchedVault("u1", 1000)).resolves.toEqual({ exists: true });
    expect(takePrefetchedVault("u1", 1000)).toBeNull();
    await expect(takePrefetchedTree(1000)).resolves.toEqual({ workspaces: [] });
    expect(takePrefetchedTree(1000)).toBeNull();
  });

  it("never gives one user's vault to another", () => {
    fetchVault.mockResolvedValue({ exists: true });
    getTree.mockResolvedValue({ workspaces: [] });
    prefetchAppData("u1", 1000);
    expect(takePrefetchedVault("u2", 1000)).toBeNull();
  });

  it("refetches for a new user instead of reusing the last one's", () => {
    fetchVault.mockResolvedValue({ exists: true });
    getTree.mockResolvedValue({ workspaces: [] });
    prefetchAppData("u1", 1000);
    prefetchAppData("u2", 1001);
    expect(fetchVault).toHaveBeenCalledTimes(2);
    expect(getTree).toHaveBeenCalledTimes(2);
  });

  it("drops a stale prefetch", () => {
    fetchVault.mockResolvedValue({ exists: true });
    getTree.mockResolvedValue({ workspaces: [] });
    prefetchAppData("u1", 1000);
    const later = 1000 + PREFETCH_MAX_AGE_MS + 1;
    expect(takePrefetchedVault("u1", later)).toBeNull();
    expect(takePrefetchedTree(later)).toBeNull();
  });

  it("keeps a failed prefetch from surfacing as an unhandled rejection", async () => {
    fetchVault.mockRejectedValue(new Error("offline"));
    getTree.mockRejectedValue(new Error("offline"));
    prefetchAppData("u1", 1000);
    // Nobody takes them; the test runner fails on unhandled rejections.
    await new Promise((r) => setTimeout(r, 0));
    await expect(takePrefetchedVault("u1", 1000)).rejects.toThrow("offline");
  });
});

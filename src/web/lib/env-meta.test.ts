// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ENV_META, envMeta } from "./env-meta.ts";

describe("envMeta", () => {
  it("returns preset meta unchanged without overrides", () => {
    expect(envMeta("production")).toEqual(ENV_META.production);
  });

  it("gives custom labels the shared dot and their own text", () => {
    expect(envMeta("staging")).toEqual({
      label: "staging",
      dot: "bg-violet-500",
    });
  });

  it("applies renames to presets but keeps their dot color", () => {
    expect(envMeta("preview", { preview: "Staging" })).toEqual({
      label: "Staging",
      dot: ENV_META.preview.dot,
    });
    // Other presets are untouched by an unrelated rename.
    expect(envMeta("production", { preview: "Staging" })).toEqual(
      ENV_META.production,
    );
  });

  it("never renames custom labels", () => {
    expect(envMeta("qa", { preview: "qa" }).dot).toBe("bg-violet-500");
  });
});

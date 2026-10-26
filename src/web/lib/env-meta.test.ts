// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ENV_META, envMeta } from "./env-meta.ts";

describe("envMeta", () => {
  it("returns preset labels unchanged without overrides", () => {
    expect(envMeta("production")).toEqual(ENV_META.production);
  });

  it("shows custom labels as typed", () => {
    expect(envMeta("staging")).toEqual({ label: "staging" });
  });

  it("applies renames to presets only", () => {
    expect(envMeta("preview", { preview: "Staging" })).toEqual({
      label: "Staging",
    });
    expect(envMeta("production", { preview: "Staging" })).toEqual(
      ENV_META.production,
    );
    expect(envMeta("qa", { preview: "qa" })).toEqual({ label: "qa" });
  });
});

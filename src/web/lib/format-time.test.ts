import { describe, expect, it } from "vitest";
import { absoluteTime, relativeTime } from "./format-time.ts";

const NOW = new Date("2026-07-07T21:00:00");
const at = (iso: string) => relativeTime(new Date(iso), NOW);

describe("relativeTime", () => {
  it("covers the recent past in growing units", () => {
    expect(at("2026-07-07T20:59:30")).toBe("Just now");
    expect(at("2026-07-07T20:59:00")).toBe("1 minute ago");
    expect(at("2026-07-07T20:15:00")).toBe("45 minutes ago");
    expect(at("2026-07-07T19:00:00")).toBe("2 hours ago");
    expect(at("2026-07-05T21:00:00")).toBe("2 days ago");
  });

  it("switches to absolute dates after a week", () => {
    expect(at("2026-06-20T12:00:00")).toMatch(/Jun 20/);
    // Prior years spell the year out.
    expect(at("2025-06-20T12:00:00")).toMatch(/2025/);
  });
});

describe("absoluteTime", () => {
  it("includes date and time, with the year only when it differs", () => {
    const sameYear = absoluteTime(new Date("2026-07-07T09:36:00"), NOW);
    expect(sameYear).toMatch(/Jul 7/);
    expect(sameYear).toMatch(/9:36/);
    expect(sameYear).not.toMatch(/2026/);
    expect(absoluteTime(new Date("2025-07-07T09:36:00"), NOW)).toMatch(/2025/);
  });
});

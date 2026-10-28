import { describe, expect, it } from "vitest";
import { tidyMachineLabel } from "./machine-label.ts";

describe("tidyMachineLabel", () => {
  it("names the OS the way people do and drops mDNS suffixes", () => {
    expect(tidyMachineLabel("Darwin on Benys-MacBook-Pro.local")).toBe("macOS on Benys-MacBook-Pro");
    expect(tidyMachineLabel("Windows_NT on DESKTOP-42")).toBe("Windows on DESKTOP-42");
    expect(tidyMachineLabel("Linux on devbox.lan")).toBe("Linux on devbox");
  });

  it("keeps a real domain, and anything it doesn't recognise", () => {
    expect(tidyMachineLabel("Linux on ci.example.com")).toBe("Linux on ci.example.com");
    expect(tidyMachineLabel("macOS")).toBe("macOS");
    expect(tidyMachineLabel("  a terminal ")).toBe("a terminal");
  });

  it("is idempotent, so the server can tidy what a new CLI already did", () => {
    const once = tidyMachineLabel("Darwin on mbp.local");
    expect(tidyMachineLabel(once)).toBe(once);
  });
});

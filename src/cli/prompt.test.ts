import { describe, expect, it } from "vitest";
import { NoTerminalError, promptSecret, confirm } from "./prompt.ts";

// A token or passphrase must never be typed onto a stream whose echo the CLI
// cannot switch off. This is the regression: /dev/tty opened through fs gives
// a stream with no isTTY and no setRawMode, so the terminal driver echoed
// every character and a pasted access token was printed in the clear.
//
// Tests run without a controlling terminal, which is exactly the condition
// that has to fail closed.
describe("promptSecret", () => {
  it("refuses to prompt when there is no terminal it can control", async () => {
    await expect(promptSecret("Access token: ")).rejects.toThrow(NoTerminalError);
  });

  it("says how to proceed rather than just failing", async () => {
    await expect(promptSecret("Master passphrase: ")).rejects.toThrow(
      /interactive terminal/i,
    );
  });
});

describe("confirm", () => {
  it("also refuses without a terminal", async () => {
    await expect(confirm("Continue?")).rejects.toThrow(NoTerminalError);
  });
});

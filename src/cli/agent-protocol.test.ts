import { describe, expect, it } from "vitest";
import { setupVault } from "../shared/crypto.ts";
import {
  describeLockAfter,
  describeTimeLeft,
  encodeFrame,
  parseLockAfter,
  parseRequest,
  ProtocolError,
  vaultFingerprint,
} from "./agent-protocol.ts";

const BLOB = { v: 1, alg: "AES-GCM", nonce: "bm9uY2U=", ciphertext: "Y3Q=" } as const;

describe("parseRequest", () => {
  it("accepts each operation", () => {
    expect(parseRequest('{"op":"status"}')).toEqual({ op: "status" });
    expect(parseRequest('{"op":"lock"}')).toEqual({ op: "lock" });
    expect(parseRequest(JSON.stringify({ op: "encrypt", plaintext: "A=1\n" }))).toEqual({
      op: "encrypt",
      plaintext: "A=1\n",
    });
    expect(parseRequest(JSON.stringify({ op: "decrypt", blob: BLOB }))).toEqual({
      op: "decrypt",
      blob: BLOB,
    });
  });

  it("drops fields an operation does not take", () => {
    expect(parseRequest('{"op":"status","extra":1}')).toEqual({ op: "status" });
  });

  // There is no operation that returns the key, and asking for one by name is
  // refused like any other unknown request.
  it("refuses unknown operations, including any that ask for the key", () => {
    for (const op of ["export", "key", "dek", "getKey", undefined, 3]) {
      expect(() => parseRequest(JSON.stringify({ op }))).toThrow(ProtocolError);
    }
  });

  it("refuses malformed requests", () => {
    for (const raw of ["nope", "[]", "null", '"status"']) {
      expect(() => parseRequest(raw)).toThrow(ProtocolError);
    }
    expect(() => parseRequest('{"op":"encrypt"}')).toThrow(/plaintext/);
    expect(() => parseRequest('{"op":"encrypt","plaintext":1}')).toThrow(/plaintext/);
    expect(() => parseRequest('{"op":"decrypt","blob":{"v":1}}')).toThrow(/blob/);
  });
});

describe("encodeFrame", () => {
  it("is one line of JSON, so a newline inside a value cannot split it", () => {
    const frame = encodeFrame({ op: "encrypt", plaintext: "A=1\nB=2\n" });
    expect(frame.endsWith("\n")).toBe(true);
    expect(frame.slice(0, -1)).not.toContain("\n");
    expect(parseRequest(frame.slice(0, -1))).toEqual({ op: "encrypt", plaintext: "A=1\nB=2\n" });
  });
});

describe("vaultFingerprint", () => {
  it("is stable for one vault and differs between vaults", async () => {
    const a = await setupVault("one passphrase");
    const b = await setupVault("another passphrase");
    const fa = await vaultFingerprint(a.keyMaterial.wrappedDek);
    expect(await vaultFingerprint(structuredClone(a.keyMaterial.wrappedDek))).toBe(fa);
    expect(await vaultFingerprint(b.keyMaterial.wrappedDek)).not.toBe(fa);
  });
});

describe("describeTimeLeft", () => {
  it("rounds down to whole minutes", () => {
    expect(describeTimeLeft(14 * 60_000 + 59_000)).toBe("14 min");
    expect(describeTimeLeft(60_000)).toBe("1 min");
  });

  it("does not claim zero minutes while still unlocked", () => {
    expect(describeTimeLeft(59_000)).toBe("under a minute");
  });

  it("switches to hours and days for long timeouts", () => {
    expect(describeTimeLeft(119 * 60_000)).toBe("119 min");
    expect(describeTimeLeft(8 * 60 * 60_000)).toBe("8 hours");
    expect(describeTimeLeft(6 * 24 * 60 * 60_000 + 5_000)).toBe("6 days");
  });
});

describe("parseLockAfter", () => {
  const WEEK = 7 * 24 * 60;

  it("reads minutes, hours and days", () => {
    expect(parseLockAfter("30m", WEEK)).toBe(30);
    expect(parseLockAfter("30", WEEK)).toBe(30);
    expect(parseLockAfter("8h", WEEK)).toBe(480);
    expect(parseLockAfter("7d", WEEK)).toBe(WEEK);
    expect(parseLockAfter("2H", WEEK)).toBe(120);
  });

  it("refuses anything it would have to guess at", () => {
    for (const bad of ["", "forever", "0", "0h", "1.5h", "-1h", "8w", "8d", "h"]) {
      expect(parseLockAfter(bad, WEEK)).toBeNull();
    }
  });
});

describe("describeLockAfter", () => {
  it("says it the way it was asked for", () => {
    expect(describeLockAfter(15)).toBe("15 minutes");
    expect(describeLockAfter(1)).toBe("1 minute");
    expect(describeLockAfter(60)).toBe("1 hour");
    expect(describeLockAfter(480)).toBe("8 hours");
    expect(describeLockAfter(7 * 24 * 60)).toBe("7 days");
  });
});

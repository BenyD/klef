import { describe, expect, it } from "vitest";
import { SEND } from "./constants.ts";
import {
  createSend,
  isSendId,
  MAX_SEND_BYTES,
  openSend,
  padSendText,
  parseSendUrl,
  sendUrl,
  unpadSendText,
} from "./send.ts";

const secret = "klef-test-9f3a7c2e5b1d8a64";

describe("padding", () => {
  it("pads to the first bucket that fits and comes back exactly", () => {
    for (const text of ["", "a", secret, "é".repeat(300), "x".repeat(MAX_SEND_BYTES)]) {
      const padded = padSendText(text);
      expect(SEND.paddingBuckets).toContain(padded.length);
      expect(unpadSendText(padded)).toBe(text);
    }
    expect(padSendText(secret).length).toBe(256);
    expect(padSendText("x".repeat(253)).length).toBe(1024);
  });

  it("refuses text over the limit and a length that does not fit", () => {
    expect(() => padSendText("x".repeat(MAX_SEND_BYTES + 1))).toThrow();
    const padded = padSendText("abc");
    new DataView(padded.buffer).setUint32(0, 9999, false);
    expect(() => unpadSendText(padded)).toThrow();
  });
});

describe("sends", () => {
  it("opens with the key from the link", async () => {
    const { stored, fragmentKey } = await createSend(secret);
    expect(isSendId(stored.id)).toBe(true);
    expect(stored.kdfParams).toBeUndefined();
    expect(await openSend(stored, fragmentKey)).toBe(secret);
  });

  it("keeps the secret and the key out of what the server stores", async () => {
    const { stored, fragmentKey } = await createSend(secret);
    const json = JSON.stringify(stored);
    expect(json).not.toContain(secret);
    expect(json).not.toContain(fragmentKey);
  });

  it("refuses a wrong key, a tampered blob, and a blob moved to another id", async () => {
    const a = await createSend(secret);
    const b = await createSend(secret);
    await expect(openSend(a.stored, b.fragmentKey)).rejects.toThrow();
    await expect(openSend({ ...a.stored, id: b.stored.id }, a.fragmentKey)).rejects.toThrow();
    const ct = a.stored.blob.ciphertext;
    const flipped = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    await expect(openSend({ ...a.stored, blob: { ...a.stored.blob, ciphertext: flipped } }, a.fragmentKey)).rejects.toThrow();
    await expect(openSend(a.stored, a.fragmentKey.slice(0, 20))).rejects.toThrow(/incomplete/);
  });

  it("needs the passphrase when one was set, and only the right one", async () => {
    const { stored, fragmentKey } = await createSend(secret, { passphrase: "correct horse" });
    expect(stored.kdfParams?.id).toBe("argon2id");
    expect(await openSend(stored, fragmentKey, "correct horse")).toBe(secret);
    await expect(openSend(stored, fragmentKey)).rejects.toThrow(/passphrase/);
    await expect(openSend(stored, fragmentKey, "wrong horse")).rejects.toThrow();
    // Dropping the KDF params does not turn it into a passphrase-free send.
    const { kdfParams: _, ...withoutParams } = stored;
    await expect(openSend(withoutParams, fragmentKey)).rejects.toThrow();
  });

  it("builds a link and reads it back", async () => {
    const { stored, fragmentKey } = await createSend(secret);
    const url = sendUrl("https://klef.sh/", stored.id, fragmentKey);
    expect(url).toBe(`https://klef.sh/s/${stored.id}#${fragmentKey}`);
    expect(parseSendUrl(url)).toEqual({ id: stored.id, fragmentKey });
    expect(parseSendUrl("https://klef.sh/s/abc#def")).toBeNull();
    expect(isSendId("../../etc")).toBe(false);
  });
});

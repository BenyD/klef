// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptBlob, importAesKey, randomBytes } from "../../shared/crypto.ts";
import type { EncryptedBlob } from "../../shared/types.ts";
import { FilePane } from "./FilePane.tsx";

// A real DEK shared with the mocked useVault, so encryption in the component is
// genuine and we can decrypt what it persists.
const holder = vi.hoisted(() => ({
  dek: null as CryptoKey | null,
  saved: [] as { fileId: string; blob: EncryptedBlob }[],
  current: null as { id: string; blob: EncryptedBlob; createdAt: string } | null,
}));

vi.mock("../vault-context.ts", () => ({
  useVault: () => ({ dek: holder.dek }),
}));

vi.mock("../structure-api.ts", () => ({
  getCurrentVersion: async () => ({ version: holder.current }),
  saveVersion: async (fileId: string, blob: EncryptedBlob) => {
    holder.saved.push({ fileId, blob });
    holder.current = { id: "v-new", blob, createdAt: "now" };
    return { id: "v-new", createdAt: "now" };
  },
}));

beforeAll(async () => {
  holder.dek = await importAesKey(randomBytes(32));
});
beforeEach(() => {
  holder.saved = [];
  holder.current = null;
});
afterEach(cleanup);

describe("FilePane (the save loop)", () => {
  it("encrypts the pasted text and persists a blob that decrypts back", async () => {
    render(<FilePane file={{ id: "f1", name: ".env", project: "p", workspace: "w", environment: null }} onSaved={() => {}} />);

    const textarea = await screen.findByPlaceholderText(/Paste your config/i);
    const content = "API_KEY=abc123\n# comment\nDB_URL=postgres://x\n";
    fireEvent.change(textarea, { target: { value: content } });

    const save = screen.getByRole("button", { name: /save version/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    // The review dialog gates the save; nothing persists until confirmed.
    expect(holder.saved).toHaveLength(0);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Review changes");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /save version/i }),
    );

    await waitFor(() => expect(holder.saved).toHaveLength(1));

    // The server only ever received an opaque blob, not the plaintext.
    const blob = holder.saved[0]!.blob;
    expect(JSON.stringify(blob)).not.toContain("API_KEY");
    expect(blob.alg).toBe("AES-GCM");
    // …and that blob decrypts back to exactly what was typed.
    expect(await decryptBlob(holder.dek!, blob)).toBe(content);
  });

  it("shows a diff against the stored version and disables save when unchanged", async () => {
    // Seed a stored version "A=1".
    const { encryptBlob } = await import("../../shared/crypto.ts");
    holder.current = {
      id: "v0",
      blob: await encryptBlob(holder.dek!, "A=1"),
      createdAt: "now",
    };

    render(
      <FilePane file={{ id: "f2", name: ".env", project: "p", workspace: "w", environment: null }} onSaved={() => {}} />,
    );

    const textarea = await screen.findByDisplayValue("A=1");
    const save = () =>
      screen.getByRole("button", { name: /save version/i }) as HTMLButtonElement;
    // No changes yet → save disabled.
    expect(save().disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "A=2" } });
    expect(save().disabled).toBe(false);

    // A change reveals the review trigger; opening it renders the diff sheet
    // (portaled to body), showing the removed line (the new line is also in
    // the textarea, so we assert on the removed one which only appears here).
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    await waitFor(() =>
      expect(document.querySelector('[data-diff="remove"]')?.textContent).toContain("A=1"),
    );
    expect(document.querySelector('[data-diff="add"]')?.textContent).toContain("A=2");

    // Reverting the edit hides the review toggle again.
    fireEvent.change(textarea, { target: { value: "A=1" } });
    expect(save().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /review/i })).toBeNull();
  });
});

describe("FilePane format gating", () => {
  it("offers the table view for a dotenv file", async () => {
    render(
      <FilePane
        file={{ id: "fd", name: ".env", project: "p", workspace: "w", environment: null }}
        onSaved={() => {}}
      />,
    );
    await screen.findByPlaceholderText(/Paste your config/i);
    expect(screen.getByRole("tab", { name: /table view/i })).toBeTruthy();
  });

  it("hides the table and shows the format for a non-dotenv file", async () => {
    render(
      <FilePane
        file={{ id: "fj", name: "config.json", project: "p", workspace: "w", environment: null }}
        onSaved={() => {}}
      />,
    );
    await screen.findByPlaceholderText(/Paste your config/i);
    // No KV table lens for JSON; the detected format is shown instead.
    expect(screen.queryByRole("tab", { name: /table view/i })).toBeNull();
    expect(screen.getByText("json")).toBeTruthy();
  });
});

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { setupVault } from "../../shared/crypto.ts";
import { generateSealKeypair, type DeviceJwk } from "../../shared/device-seal.ts";
import type { VaultKeyMaterial } from "../../shared/types.ts";
import { CliAuthorize, type CliAuthorizeApi } from "./CliAuthorize.tsx";

/**
 * Dev-only (/dev/cli, like /dev/toasts): the `klef login` approval page
 * against a stand-in server, so its states can be seen without a CLI or a
 * signed-in account. A real throwaway vault and a real CLI key pair, so
 * "Approve and unlock" runs the actual sealing code. ?method=passkey shows
 * the passkey path. Nothing here leaves the page.
 */
export function CliLab() {
  const [params] = useSearchParams();
  const passkey = params.get("method") === "passkey";
  const [api, setApi] = useState<CliAuthorizeApi | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ keyMaterial }, { publicJwk }] = await Promise.all([setupVault("preview passphrase"), generateSealKeypair()]);
      setApi(standIn(keyMaterial, publicJwk, passkey));
    })();
  }, [passkey]);

  if (!api) return null;
  return <CliAuthorize userId="preview-user" api={api} />;
}

function standIn(keyMaterial: VaultKeyMaterial, publicJwk: DeviceJwk, passkey: boolean): CliAuthorizeApi {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  return {
    fetch: async (path) =>
      String(path).includes("/pending/")
        ? json({ ok: true, userCode: "WXYZ-2345", label: "macOS on bens-macbook", expiresAt: "", publicJwk })
        : json({ ok: true }),
    vault: async () => ({
      exists: true,
      keyMaterial,
      passkeyWraps: passkey
        ? [{ passkeyId: "p", credentialId: "c", prfSalt: "AAAA", wrappedDek: keyMaterial.wrappedDek }]
        : [],
    }),
    prf: () => Promise.reject(new Error("No passkey in the preview")),
  };
}

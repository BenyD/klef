import { useTheme } from "next-themes";
import { toast } from "sonner";
import { MoonIcon, SunIcon } from "lucide-react";
import { Banner } from "./Banner.tsx";
import { Button } from "./ui/button.tsx";

/**
 * Dev-only gallery for the toast styles (/dev/toasts). The route is only
 * registered when import.meta.env.DEV, so this never ships.
 */
export function ToastLab() {
  const { resolvedTheme, setTheme } = useTheme();

  const demos: { label: string; fire: () => void }[] = [
    {
      label: "Default",
      fire: () => toast("Sync complete"),
    },
    {
      label: "Success",
      fire: () =>
        toast.success("Version saved", {
          description: "web/.env.production is now at v14.",
        }),
    },
    {
      label: "Info",
      fire: () =>
        toast.info("Loaded into editor", {
          description: "Save to restore this version.",
        }),
    },
    {
      label: "Warning",
      fire: () =>
        toast.warning("Passphrase is weak", {
          description: "Consider a longer passphrase.",
        }),
    },
    {
      label: "Error",
      fire: () =>
        toast.error("Couldn't save version", {
          description: "The server rejected the write.",
        }),
    },
    {
      label: "Title only",
      fire: () => toast.success("Copied to clipboard"),
    },
    {
      label: "With action",
      fire: () =>
        toast.error("Couldn't save version", {
          description: "Your changes are still local.",
          action: { label: "Retry", onClick: () => toast.success("Version saved") },
        }),
    },
    {
      label: "Action + cancel",
      fire: () =>
        toast.warning("Discard local changes?", {
          description: "This restores the last saved version.",
          action: { label: "Discard", onClick: () => {} },
          cancel: { label: "Keep", onClick: () => {} },
        }),
    },
    {
      label: "Promise",
      fire: () =>
        toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
          loading: "Encrypting and uploading",
          success: "Version saved",
          error: "Upload failed",
        }),
    },
    {
      label: "Loading",
      fire: () => {
        const id = toast.loading("Encrypting and uploading", {
          description: "Hang tight.",
        });
        setTimeout(() => toast.dismiss(id), 2500);
      },
    },
  ];

  return (
    <div className="klef-screen flex min-h-svh flex-col">
      {/* Banner variants, topmost one mirroring the live early-access strip. */}
      <Banner variant="warning">
        <span className="font-medium">Klef is in early access.</span>
        <span className="text-muted-foreground">
          {" "}
          Found a bug?{" "}
          <a
            href="https://github.com/BenyD/klef/issues"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline underline-offset-4"
          >
            Report it on GitHub
          </a>
        </span>
      </Banner>
      <Banner variant="info">
        <span className="font-medium">Scheduled maintenance.</span>
        <span className="text-muted-foreground"> Saturday 02:00 UTC</span>
      </Banner>
      <Banner variant="success">
        <span className="font-medium">Passkeys are here.</span>
        <span className="text-muted-foreground"> Add one in settings</span>
      </Banner>
      <Banner variant="error">
        <span className="font-medium">Sync is degraded.</span>
        <span className="text-muted-foreground">
          {" "}
          Saves may take longer than usual
        </span>
      </Banner>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Toast lab</h1>
        <p className="text-muted-foreground text-sm">
          Click a style to fire it. Hover a toast for the close button, hover
          the stack to expand it.
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        {demos.map(({ label, fire }) => (
          <Button key={label} variant="outline" onClick={fire}>
            {label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
        Switch theme
      </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { cn } from "../lib/utils.ts";

// Notion-style workspace avatar: the uploaded icon when set, the cube glyph
// otherwise. sm rides in the topbar and menus; md is the settings tile.
export function WorkspaceIcon({
  workspace,
  size = "sm",
  className,
}: {
  workspace: { name: string; icon?: string | null } | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const icon = workspace?.icon ?? null;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [icon]);

  if (size === "md") {
    return (
      <div
        className={cn(
          "bg-muted ring-border flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1",
          className,
        )}
      >
        {icon && !broken ? (
          <img
            src={icon}
            alt=""
            className="size-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <Box className="text-muted-foreground size-6" />
        )}
      </div>
    );
  }

  if (icon && !broken) {
    return (
      <img
        src={icon}
        alt=""
        className={cn("size-4 shrink-0 rounded-sm object-cover", className)}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <Box className={cn("text-muted-foreground size-4 shrink-0", className)} />
  );
}

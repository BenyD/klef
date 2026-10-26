import { Contrast } from "lucide-react";
import { useThemeSwitch } from "../lib/use-theme-switch.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

export function ThemeGlyph({ className }: { className?: string }) {
  return (
    <Contrast className={cn("klef-theme-glyph dark:rotate-180", className)} />
  );
}

// Default theme is "system"; clicking swaps between light and dark.
export function ThemeToggle({
  size = "icon",
}: {
  size?: "icon" | "icon-sm";
}) {
  const toggle = useThemeSwitch();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            aria-label="Toggle theme"
            className="text-muted-foreground"
            onClick={toggle}
          >
            <ThemeGlyph />
          </Button>
        }
      />
      <TooltipContent>Toggle theme</TooltipContent>
    </Tooltip>
  );
}

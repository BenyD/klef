import { Contrast } from "lucide-react";
import { useThemeSwitch } from "../lib/use-theme-switch.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

export function ThemeGlyph({ className }: { className?: string }) {
  return (
    <Contrast
      className={cn(
        "ease-spring transition-transform duration-500 dark:rotate-180",
        className,
      )}
    />
  );
}

// Default theme is "system"; clicking swaps between light and dark.
export function ThemeToggle() {
  const toggle = useThemeSwitch();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
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

import type { MouseEvent } from "react";
import { Contrast } from "lucide-react";
import { useTheme } from "next-themes";
import { switchTheme } from "../lib/theme.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

// Shared by the app toggle below and the marketing page's plain-CSS button
// (Landing.tsx), so the toggle behavior and icon spin stay in one place.
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  return (e: MouseEvent) =>
    switchTheme(resolvedTheme === "dark" ? "light" : "dark", setTheme, {
      x: e.clientX,
      y: e.clientY,
    });
}

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

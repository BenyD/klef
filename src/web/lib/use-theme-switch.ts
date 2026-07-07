import type { MouseEvent } from "react";
import { useTheme } from "next-themes";
import { switchTheme } from "./theme.ts";

// Shared by the app's ThemeToggle and the marketing layout's plain-CSS
// button, so the toggle behavior stays in one place. Lives apart from
// ThemeToggle.tsx to keep that file component-only (Fast Refresh).
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  return (e: MouseEvent) =>
    switchTheme(resolvedTheme === "dark" ? "light" : "dark", setTheme, {
      x: e.clientX,
      y: e.clientY,
    });
}

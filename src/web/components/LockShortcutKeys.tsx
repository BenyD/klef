import { isMacPlatform } from "../lib/auto-lock.ts";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";

// The lock chord (Cmd/Ctrl+Shift+L) rendered as keycaps, matching the
// platform. Shown in the lock button tooltip and the security settings.
// Hidden on phones: no keyboard, no shortcut hints.
export function LockShortcutKeys() {
  const mac = isMacPlatform();
  return (
    <KbdGroup className="max-sm:hidden">
      <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
      <Kbd>{mac ? "⇧" : "Shift"}</Kbd>
      <Kbd>L</Kbd>
    </KbdGroup>
  );
}

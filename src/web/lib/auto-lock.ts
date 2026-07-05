// Client-side lock ergonomics: an inactivity auto-lock and a global keyboard
// shortcut. Both call the vault's lock() — clearing the in-memory DEK — and
// are mounted only while the vault is unlocked (VaultHome).

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "klef:auto-lock-minutes";
const CHANGE_EVENT = "klef:auto-lock-changed";

export const AUTO_LOCK_DEFAULT_MINUTES = 15;

export const AUTO_LOCK_OPTIONS = [
  { minutes: 5, label: "After 5 minutes" },
  { minutes: 10, label: "After 10 minutes" },
  { minutes: 15, label: "After 15 minutes" },
  { minutes: 30, label: "After 30 minutes" },
  { minutes: 60, label: "After 1 hour" },
  { minutes: 0, label: "Never" },
] as const;

export function getAutoLockMinutes(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return AUTO_LOCK_DEFAULT_MINUTES;
    const minutes = Number(raw);
    return AUTO_LOCK_OPTIONS.some((o) => o.minutes === minutes)
      ? minutes
      : AUTO_LOCK_DEFAULT_MINUTES;
  } catch {
    return AUTO_LOCK_DEFAULT_MINUTES;
  }
}

export function setAutoLockMinutes(minutes: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(minutes));
  } catch {
    // localStorage may be unavailable; the in-page event still updates state.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  // "storage" fires for changes made in other tabs.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAutoLockMinutes(): number {
  return useSyncExternalStore(subscribe, getAutoLockMinutes);
}

/** How often the inactivity deadline is checked. Exported for tests. */
export const AUTO_LOCK_CHECK_INTERVAL_MS = 30_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Lock the vault after the configured minutes without pointer/keyboard
 * activity. Uses a wall-clock deadline checked on an interval (rather than one
 * long timeout) so throttled background tabs still lock promptly: the check
 * also runs the moment the tab becomes visible again.
 */
export function useAutoLock(lock: () => void): void {
  const minutes = useAutoLockMinutes();
  useEffect(() => {
    if (!minutes) return;
    const limitMs = minutes * 60_000;
    let lastActivity = Date.now();
    const touch = () => {
      lastActivity = Date.now();
    };
    const check = () => {
      if (Date.now() - lastActivity >= limitMs) lock();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) check();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, touch, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(check, AUTO_LOCK_CHECK_INTERVAL_MS);
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, touch);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [minutes, lock]);
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/** Global Cmd/Ctrl+Shift+L → lock. */
export function useLockShortcut(lock: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lock]);
}

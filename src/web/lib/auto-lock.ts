// Client-side lock ergonomics: an inactivity auto-lock and a global keyboard
// shortcut. Both call the vault's lock() — clearing the in-memory DEK — and
// are mounted only while the vault is unlocked (VaultHome).

import { useEffect, useSyncExternalStore } from "react";
import {
  AUTO_LOCK_DEFAULT_MINUTES,
  REMEMBER_DEVICE_MINUTES,
} from "../../shared/lock-policy.ts";

const STORAGE_KEY = "klef:auto-lock-minutes";
const CHANGE_EVENT = "klef:auto-lock-changed";

// Shared with the CLI's unlock agent, so both lock on the same schedule.
export { AUTO_LOCK_DEFAULT_MINUTES, REMEMBER_DEVICE_MINUTES };

export const AUTO_LOCK_OPTIONS = [
  { minutes: 5, label: "After 5 minutes" },
  { minutes: 10, label: "After 10 minutes" },
  { minutes: 15, label: "After 15 minutes" },
  { minutes: 30, label: "After 30 minutes" },
  { minutes: 60, label: "After 1 hour" },
  { minutes: 8 * 60, label: "After 8 hours" },
  { minutes: 24 * 60, label: "After 1 day" },
  { minutes: REMEMBER_DEVICE_MINUTES, label: "After 7 days" },
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

// The setting is also how long a reopened tab may restore the key without the
// passphrase (see dek-store.ts), so "Keep unlocked on this device" is just a
// long setting. A day or more, or never, counts as remembering this device.
const REMEMBERS_DEVICE_FROM_MINUTES = 24 * 60;

export function remembersDevice(minutes = getAutoLockMinutes()): boolean {
  return minutes === 0 || minutes >= REMEMBERS_DEVICE_FROM_MINUTES;
}

/**
 * Apply the unlock screen's "Keep unlocked on this device" box. Ticking it
 * opts in to the 7-day window unless a remembering setting is already chosen;
 * clearing it is the revoke, back to the default. Leaves an unrelated choice
 * (say, 30 minutes) alone when the box matches it.
 */
export function applyRememberDevice(remember: boolean): void {
  if (remember === remembersDevice()) return;
  setAutoLockMinutes(remember ? REMEMBER_DEVICE_MINUTES : AUTO_LOCK_DEFAULT_MINUTES);
}

/**
 * How old a remembered key may be when a tab opens and still be restored. The
 * same clock as the idle lock, so closing the browser never buys a longer
 * unlocked window than staying idle would.
 */
export function rememberedKeyMaxAgeMs(minutes = getAutoLockMinutes()): number {
  return minutes > 0 ? minutes * 60_000 : Infinity;
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

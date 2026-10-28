// Per-device UI preferences, localStorage-backed with the same event wiring
// as auto-lock so every mounted consumer updates live (including other tabs).

import { useSyncExternalStore } from "react";

const CONFIRM_SAVE_KEY = "klef:confirm-save-review";
const CONFIRM_LOAD_KEY = "klef:confirm-load-version";
const CHANGE_EVENT = "klef:preferences-changed";

function notify() {
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

function getFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

function setFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the in-page event still updates state.
  }
  notify();
}

/** Whether saving a version first opens the review-changes dialog. */
export function getConfirmSaveReview(): boolean {
  return getFlag(CONFIRM_SAVE_KEY);
}

export function setConfirmSaveReview(on: boolean): void {
  setFlag(CONFIRM_SAVE_KEY, on);
}

export function useConfirmSaveReview(): boolean {
  return useSyncExternalStore(subscribe, getConfirmSaveReview);
}

/** Whether loading an old version warns before replacing unsaved edits. */
export function getConfirmLoadVersion(): boolean {
  return getFlag(CONFIRM_LOAD_KEY);
}

export function setConfirmLoadVersion(on: boolean): void {
  setFlag(CONFIRM_LOAD_KEY, on);
}

export function useConfirmLoadVersion(): boolean {
  return useSyncExternalStore(subscribe, getConfirmLoadVersion);
}

// Per-device UI preferences, localStorage-backed with the same event wiring
// as auto-lock so every mounted consumer updates live (including other tabs).

import { useSyncExternalStore } from "react";

const CONFIRM_SAVE_KEY = "klef:confirm-save-review";
const CHANGE_EVENT = "klef:preferences-changed";

/** Whether saving a version first opens the review-changes dialog. */
export function getConfirmSaveReview(): boolean {
  try {
    return localStorage.getItem(CONFIRM_SAVE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setConfirmSaveReview(on: boolean): void {
  try {
    localStorage.setItem(CONFIRM_SAVE_KEY, on ? "on" : "off");
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

export function useConfirmSaveReview(): boolean {
  return useSyncExternalStore(subscribe, getConfirmSaveReview);
}

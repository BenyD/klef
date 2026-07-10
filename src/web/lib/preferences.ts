// Per-device UI preferences, localStorage-backed with the same event wiring
// as auto-lock so every mounted consumer updates live (including other tabs).

import { useSyncExternalStore } from "react";
import {
  ENVIRONMENTS,
  normalizeEnvironment,
  type PresetEnvironment,
} from "../../shared/api-types.ts";

const CONFIRM_SAVE_KEY = "klef:confirm-save-review";
const CONFIRM_LOAD_KEY = "klef:confirm-load-version";
const ENV_LABELS_KEY = "klef:env-labels";
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

// Preset environments can be renamed for display ("preview" shown as
// "Staging"). Stored file labels stay canonical; only rendering changes.
export type EnvLabelOverrides = Partial<Record<PresetEnvironment, string>>;

function readEnvLabelsRaw(): string {
  try {
    return localStorage.getItem(ENV_LABELS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

export function parseEnvLabels(raw: string): EnvLabelOverrides {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const overrides: EnvLabelOverrides = {};
    for (const env of ENVIRONMENTS) {
      const value = (parsed as Record<string, unknown>)[env];
      if (typeof value === "string" && value.trim()) {
        overrides[env] = value.trim();
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

export function getEnvLabelOverrides(): EnvLabelOverrides {
  return parseEnvLabels(readEnvLabelsRaw());
}

/**
 * Renames a preset for display; null (or a label that normalizes back onto
 * the preset itself) restores the default.
 */
export function setEnvLabelOverride(
  env: PresetEnvironment,
  label: string | null,
): void {
  const overrides = getEnvLabelOverrides();
  const normalized = label === null ? null : normalizeEnvironment(label);
  if (normalized === null || normalized === env) delete overrides[env];
  else overrides[env] = normalized;
  try {
    localStorage.setItem(ENV_LABELS_KEY, JSON.stringify(overrides));
  } catch {
    // localStorage may be unavailable; the in-page event still updates state.
  }
  notify();
}

// useSyncExternalStore needs a referentially stable snapshot, so consumers
// subscribe to the raw JSON string and memoize the parse (see useEnvMeta).
export function useEnvLabelsRaw(): string {
  return useSyncExternalStore(subscribe, readEnvLabelsRaw);
}

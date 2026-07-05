import { useRef, useState } from "react";
import type { z } from "zod";

// Progressive field validation: an error appears once a field has been blurred
// (or on a submit attempt), and then updates live as the value changes, so
// users see problems as they leave a field rather than only after submit.
//
// Values are passed into each call (they live in the caller's own state), and
// the schema is read through a ref so a schema that varies by mode (e.g. the
// auth page's sign-in vs sign-up rules) always validates against the current one.
export function useFieldValidation<K extends string>(schema: z.ZodType) {
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  // Read only through the setter's updater to avoid stale-closure reads.
  const [, setTouched] = useState<Partial<Record<K, boolean>>>({});

  function compute(values: Record<string, unknown>): Partial<Record<K, string>> {
    const parsed = schemaRef.current.safeParse(values);
    if (parsed.success) return {};
    const out: Partial<Record<K, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in out)) {
        out[key as K] = issue.message;
      }
    }
    return out;
  }

  function errorsForTouched(
    values: Record<string, unknown>,
    touchedFields: Partial<Record<K, boolean>>,
  ): Partial<Record<K, string>> {
    const all = compute(values);
    const next: Partial<Record<K, string>> = {};
    for (const field of Object.keys(touchedFields) as K[]) {
      if (touchedFields[field]) next[field] = all[field];
    }
    return next;
  }

  /** Mark a field touched (on blur) and surface its error. */
  function blur(field: K, values: Record<string, unknown>) {
    setTouched((prev) => {
      const nextTouched = { ...prev, [field]: true };
      setErrors(errorsForTouched(values, nextTouched));
      return nextTouched;
    });
  }

  /** Re-validate already-touched fields as the value changes (call on change). */
  function change(values: Record<string, unknown>) {
    setTouched((prev) => {
      setErrors(errorsForTouched(values, prev));
      return prev;
    });
  }

  /** Validate everything on submit; returns true when the form is valid. */
  function validateAll(values: Record<string, unknown>, fields: K[]): boolean {
    const all = compute(values);
    const allTouched: Partial<Record<K, boolean>> = {};
    for (const field of fields) allTouched[field] = true;
    setTouched(allTouched);
    setErrors(all);
    return Object.keys(all).length === 0;
  }

  function reset() {
    setErrors({});
    setTouched({});
  }

  return { errors, blur, change, validateAll, reset };
}

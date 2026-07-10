// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Line-level diff for env files. Pure and dependency-free. Used in-browser to
// show the user what changed between the stored version and their paste before
// saving — the server never sees this. Key/value-aware diffing is a Phase 7
// concern; this operates on raw lines, preserving the blob-is-source-of-truth
// rule.

export type DiffType = "same" | "add" | "remove";

export interface DiffOp {
  type: DiffType;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
}

function splitLines(text: string): string[] {
  // Normalize CRLF so a platform difference alone doesn't read as a change.
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized === "") return [];
  // Git-style: a trailing newline terminates the last line rather than
  // opening a phantom empty one, so "A\nB\n" is two lines, not three.
  const body = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return body.split("\n");
}

/**
 * Classic LCS line diff. Returns a flat sequence of operations in original
 * order; a "changed" line shows as a remove followed by an add.
 */
export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of LCS of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: "remove", text: a[i]! });
      i++;
    } else {
      ops.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", text: a[i++]! });
  while (j < m) ops.push({ type: "add", text: b[j++]! });
  return ops;
}

export function diffStats(ops: DiffOp[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "add") added++;
    else if (op.type === "remove") removed++;
  }
  return { added, removed };
}

/**
 * Note for a final-newline state the line ops can't express, git's
 * "\ No newline at end of file". Without it, "A\n" -> "A" would review as
 * +0 -0 with Save enabled and nothing visibly different. Null when there is
 * nothing to say.
 */
export function finalNewlineNote(
  oldText: string,
  newText: string,
): string | null {
  if (newText !== "" && !newText.endsWith("\n")) {
    return "No newline at end of file";
  }
  if (newText !== "" && oldText !== "" && !oldText.endsWith("\n")) {
    return "Newline added at end of file";
  }
  return null;
}

/** True when the two texts are identical (after CRLF normalization). */
export function isUnchanged(oldText: string, newText: string): boolean {
  return (
    oldText.replace(/\r\n/g, "\n") === newText.replace(/\r\n/g, "\n")
  );
}

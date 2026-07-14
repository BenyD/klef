// Whitespace hygiene for env text. Trailing spaces and trailing blank lines
// are invisible but real: they ride into the stored blob byte-for-byte (the
// crypto contract never trims), and a stray space after a value breaks some
// parsers. So we surface them as a warning with an opt-in cleanup rather than
// silently rewriting the user's text.

export interface EnvLint {
  /** 1-based line numbers whose content has trailing spaces or tabs. */
  trailingSpaceLines: number[];
  /** Count of whitespace-only lines at the end (beyond one final newline). */
  trailingBlankLines: number;
  /** True when either problem is present. */
  hasIssues: boolean;
}

// A file may or may not end in a newline; that final newline is style, not a
// blank line, so peel it off before counting.
function bodyLines(text: string): { lines: string[]; finalNewline: boolean } {
  const finalNewline = text.endsWith("\n");
  const body = finalNewline ? text.slice(0, -1) : text;
  return { lines: body === "" ? [] : body.split("\n"), finalNewline };
}

export function lintEnvText(text: string): EnvLint {
  const { lines } = bodyLines(text);

  const trailingSpaceLines: number[] = [];
  lines.forEach((line, i) => {
    // Only lines with actual content — a blank line is counted below, not here.
    if (line.trim() !== "" && /[ \t]+$/.test(line)) {
      trailingSpaceLines.push(i + 1);
    }
  });

  let trailingBlankLines = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.trim() === "") trailingBlankLines++;
    else break;
  }

  return {
    trailingSpaceLines,
    trailingBlankLines,
    hasIssues: trailingSpaceLines.length > 0 || trailingBlankLines > 0,
  };
}

/**
 * Trim trailing spaces from every line and drop trailing blank lines, keeping
 * the file's final-newline style. Content lines and their values are otherwise
 * untouched, so this stays a surgical whitespace-only rewrite.
 */
export function cleanEnvWhitespace(text: string): string {
  const { lines, finalNewline } = bodyLines(text);
  const trimmed = lines.map((line) => line.replace(/[ \t]+$/, ""));
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  if (trimmed.length === 0) return "";
  return trimmed.join("\n") + (finalNewline ? "\n" : "");
}

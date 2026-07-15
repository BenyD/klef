// Whitespace hygiene for env text. We flag one thing only: trailing spaces or
// tabs on a value line. There's no formal .env spec and parsers disagree on
// whether that space is part of the value (some trim it, shell `source` and
// others don't), so it's a real, invisible footgun.
//
// We deliberately do NOT warn about blank lines or the final newline: a single
// trailing newline is good practice (POSIX, git, concatenation), and extra
// blank lines are harmless — every env/JSON/YAML/TOML parser skips them.

export interface EnvLint {
  /** 1-based line numbers whose content has trailing spaces or tabs. */
  trailingSpaceLines: number[];
  /** True when there's trailing whitespace worth cleaning up. */
  hasIssues: boolean;
}

// A file may or may not end in a newline; that final newline is style, not a
// blank line, so peel it off before looking at the lines.
function bodyLines(text: string): { lines: string[]; finalNewline: boolean } {
  const finalNewline = text.endsWith("\n");
  const body = finalNewline ? text.slice(0, -1) : text;
  return { lines: body === "" ? [] : body.split("\n"), finalNewline };
}

export function lintEnvText(text: string): EnvLint {
  const { lines } = bodyLines(text);

  const trailingSpaceLines: number[] = [];
  lines.forEach((line, i) => {
    // Only lines with content; a blank line's whitespace is not a value footgun.
    if (line.trim() !== "" && /[ \t]+$/.test(line)) {
      trailingSpaceLines.push(i + 1);
    }
  });

  return {
    trailingSpaceLines,
    hasIssues: trailingSpaceLines.length > 0,
  };
}

/**
 * Trim trailing spaces and tabs from every line, keeping blank lines and the
 * file's final-newline style untouched. Only the invisible trailing whitespace
 * that parsers disagree on is removed.
 */
export function cleanEnvWhitespace(text: string): string {
  const { lines, finalNewline } = bodyLines(text);
  if (lines.length === 0) return text;
  const trimmed = lines.map((line) => line.replace(/[ \t]+$/, ""));
  return trimmed.join("\n") + (finalNewline ? "\n" : "");
}

// Tiny env tokenizer for syntax highlighting in the raw editor. Line-based,
// mirroring env-table.ts's grammar: comments, `export`-prefixed entries,
// quoted vs bare values; anything else stays plain (multi-line values parse
// as plain continuation lines by design).

export interface EnvToken {
  type:
    | "comment"
    | "export"
    | "key"
    | "eq"
    | "value"
    | "string"
    | "trailing-space"
    | "text";
  text: string;
}

const COMMENT_RE = /^(\s*)(#.*)$/;
const ENTRY_RE = /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/;
const TRAILING_WS_RE = /[ \t]+$/;

// Whitespace at the end of a line is invisible but real: parsers disagree on
// whether `KEY=value ` keeps the space, so it gets its own token for the
// editor to make visible. Peeled off before the grammar so the other tokens
// stay clean; Klef never trims it from the stored text.
export function tokenizeEnvLine(line: string): EnvToken[] {
  const ws = TRAILING_WS_RE.exec(line);
  if (!ws) return tokenizeBody(line);
  const tokens = tokenizeBody(line.slice(0, ws.index));
  tokens.push({ type: "trailing-space", text: ws[0] });
  return tokens;
}

function tokenizeBody(line: string): EnvToken[] {
  const comment = COMMENT_RE.exec(line);
  if (comment) {
    const tokens: EnvToken[] = [];
    if (comment[1]) tokens.push({ type: "text", text: comment[1] });
    tokens.push({ type: "comment", text: comment[2]! });
    return tokens;
  }

  const m = ENTRY_RE.exec(line);
  if (!m) return line === "" ? [] : [{ type: "text", text: line }];

  const [, indent, exp, key, eq, value] = m;
  const tokens: EnvToken[] = [];
  if (indent) tokens.push({ type: "text", text: indent });
  if (exp) tokens.push({ type: "export", text: exp });
  tokens.push({ type: "key", text: key! });
  tokens.push({ type: "eq", text: eq! });
  if (value) {
    const quoted = value.startsWith('"') || value.startsWith("'");
    tokens.push({ type: quoted ? "string" : "value", text: value });
  }
  return tokens;
}

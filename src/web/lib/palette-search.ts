// Matching and ranking for the command menu. Headless and pure so it can be
// tested without a DOM: the menu hands it items with a few searchable fields
// (file name, project, environment...) and renders whatever comes back, in
// order, with the matched characters highlighted.

/** One searchable string on an item, with how much a match there counts. */
export interface SearchField {
  text: string;
  /** Multiplier for a match in this field; the item's name is usually 1. */
  weight?: number;
}

export interface Searchable {
  id: string;
  fields: SearchField[];
}

export interface FieldMatch {
  score: number;
  /** Indices into the field's text that matched, ascending. */
  indices: number[];
}

export interface SearchResult<T extends Searchable> {
  item: T;
  score: number;
  /** Matched indices per field, aligned with item.fields (empty = no match). */
  highlights: number[][];
}

// Characters that start a "word" inside a name: `.env.production` has words
// env and production, `STRIPE_SECRET_KEY` has stripe, secret and key.
const SEPARATORS = new Set([" ", ".", "_", "-", "/", ":", "@"]);

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1] as string;
  if (SEPARATORS.has(prev)) return true;
  // camelCase boundary: aB
  const cur = text[i] as string;
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase();
}

/**
 * Scores `query` as a subsequence of `text`, case-insensitively, or returns
 * null when it isn't one. Prefers, in order: an exact match, a prefix, a
 * contiguous run starting at a word, and characters that land on word starts
 * and follow each other. Scattered matches still count, just for little, so
 * "prd" finds `.env.production` below anything that spells it out.
 */
export function fuzzyMatch(text: string, query: string): FieldMatch | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === "") return { score: 0, indices: [] };
  if (q.length > t.length) return null;

  if (t === q) return { score: 100, indices: range(0, q.length) };

  // A contiguous substring beats any scattered match, and one that starts a
  // word beats one buried mid-word.
  let best: FieldMatch | null = null;
  for (let at = t.indexOf(q); at !== -1; at = t.indexOf(q, at + 1)) {
    const score =
      at === 0 ? 80 : isWordStart(text, at) ? 70 : 50 - Math.min(at, 20) / 2;
    if (!best || score > best.score) {
      best = { score, indices: range(at, at + q.length) };
    }
  }
  if (best) return best;

  // Subsequence: greedy, but preferring a word start for each character when
  // one is available before the next character could match anywhere else.
  const indices: number[] = [];
  let from = 0;
  for (const ch of q) {
    let pick = -1;
    for (let i = from; i < t.length; i++) {
      if (t[i] !== ch) continue;
      if (pick === -1) pick = i;
      if (isWordStart(text, i)) {
        pick = i;
        break;
      }
    }
    if (pick === -1) return null;
    indices.push(pick);
    from = pick + 1;
  }

  let score = 10;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k] as number;
    if (isWordStart(text, i)) score += 3;
    if (k > 0 && i === (indices[k - 1] as number) + 1) score += 2;
  }
  // Spread out matches read as coincidence: penalise the gaps.
  const span = (indices.at(-1) as number) - (indices[0] as number) + 1;
  score -= (span - indices.length) * 0.5;
  return { score: Math.max(score, 1), indices };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

/** Whitespace-separated tokens; "lens prod" is two. */
export function tokenize(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Every token must match some field of an item (AND across tokens, OR across
 * fields), so "lens prod" finds Lensdrop's `.env.production` and nothing that
 * only has one of the two. Each token takes its best weighted field. Results
 * come back best first; ties keep the input order, so callers can pre-sort by
 * recency.
 */
export function searchItems<T extends Searchable>(
  items: readonly T[],
  query: string,
): SearchResult<T>[] {
  const tokens = tokenize(query);
  const results: SearchResult<T>[] = [];
  items.forEach((item) => {
    const highlights: number[][] = item.fields.map(() => []);
    let total = 0;
    for (const token of tokens) {
      let bestScore = -1;
      let bestField = -1;
      let bestIndices: number[] = [];
      item.fields.forEach((field, f) => {
        const m = fuzzyMatch(field.text, token);
        if (!m) return;
        const weighted = m.score * (field.weight ?? 1);
        if (weighted > bestScore) {
          bestScore = weighted;
          bestField = f;
          bestIndices = m.indices;
        }
      });
      if (bestField === -1) return;
      total += bestScore;
      highlights[bestField] = mergeIndices(
        highlights[bestField] as number[],
        bestIndices,
      );
    }
    results.push({ item, score: total, highlights });
  });
  // Array.prototype.sort is stable, so equal scores keep input order.
  return results.sort((a, b) => b.score - a.score);
}

function mergeIndices(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

/**
 * Splits text into runs for rendering, marking which ones matched:
 * ("prod", [0,1]) -> [{text:"pr", match:true}, {text:"od", match:false}].
 */
export function highlightRuns(
  text: string,
  indices: readonly number[],
): { text: string; match: boolean }[] {
  const hit = new Set(indices);
  const runs: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const match = hit.has(i);
    const last = runs.at(-1);
    if (last && last.match === match) last.text += text[i];
    else runs.push({ text: text[i] as string, match });
  }
  return runs;
}

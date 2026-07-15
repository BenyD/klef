// Klef stores any config file's raw bytes, not just dotenv (see the crypto
// contract in src/shared/BLOB_FORMAT.md). This detects a file's format so the
// UI can adapt: dotenv files get the KV table and key-level features, while
// JSON/YAML/TOML/other fall back to the raw editor + version history. Detection
// is read-only and never drives a rewrite — the stored text is always verbatim.

export const CONFIG_FORMATS = ["dotenv", "json", "yaml", "toml", "other"] as const;
export type ConfigFormat = (typeof CONFIG_FORMATS)[number];

// dotenv is the only format with editable-table + key-diff support today; the
// rest are stored and edited as raw text until per-format readers land.
export function isDotenv(format: ConfigFormat): format is "dotenv" {
  return format === "dotenv";
}

function basename(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

// dotenv files rarely carry a helpful extension: ".env", ".env.local",
// ".env.production", or a bare "env". The dotenv segment is the signal, not a
// trailing ".production"-style suffix, so this is checked before extensions.
function looksLikeDotenvName(base: string): boolean {
  const lower = base.toLowerCase();
  return (
    lower === ".env" ||
    lower === "env" ||
    lower.startsWith(".env.") ||
    lower.endsWith(".env")
  );
}

const EXT_FORMAT: Record<string, ConfigFormat> = {
  env: "dotenv",
  json: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
};

function extensionFormat(base: string): ConfigFormat | null {
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null; // no ext, or a dotfile like ".env" (handled above)
  return EXT_FORMAT[base.slice(dot + 1).toLowerCase()] ?? null;
}

// Content sniff for names with no telling extension ("config", "secrets").
// Conservative on purpose: only clear signals win, and anything ambiguous
// stays "other" so we never mis-parse a file as dotenv.
function sniffContent(content: string): ConfigFormat {
  const trimmed = content.trimStart();
  if (trimmed === "") return "other";
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    // A leading "[" is also a TOML section header; disambiguate by whether the
    // whole thing parses as JSON.
    try {
      JSON.parse(content);
      return "json";
    } catch {
      if (trimmed[0] === "{") return "other";
    }
  }

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));

  if (lines.some((l) => /^\[[^\]]+\]$/.test(l))) return "toml"; // [section]
  if (content.startsWith("---")) return "yaml"; // document marker

  const kvEquals = lines.filter((l) => /^[A-Za-z_][\w.-]*\s*=/.test(l)).length;
  const kvColon = lines.filter((l) => /^[A-Za-z_][\w.-]*:\s/.test(l)).length;
  // A block of KEY=value lines with no ":" mapping reads as dotenv; a block of
  // "key: value" reads as yaml. Mixed or neither stays other.
  if (kvEquals > 0 && kvColon === 0) return "dotenv";
  if (kvColon > 0 && kvEquals === 0) return "yaml";
  return "other";
}

/**
 * Best-effort format for a file. The name is authoritative when it carries a
 * known extension or a dotenv shape; otherwise the content (if given) is
 * sniffed. Falls back to "other", which is always safe — it just means the raw
 * editor with no format-specific features.
 */
export function detectFormat(name: string, content?: string): ConfigFormat {
  const base = basename(name.trim());
  if (looksLikeDotenvName(base)) return "dotenv";
  const byExt = extensionFormat(base);
  if (byExt) return byExt;
  if (content !== undefined) return sniffContent(content);
  return "other";
}

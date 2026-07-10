import {
  useEffect,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Diff, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { cn } from "../lib/utils.ts";
import {
  appendBlock,
  appendEntry,
  diffEntryRows,
  ENV_KEY_RE,
  isEnvBlock,
  parseEnvText,
  removeLine,
  removeLines,
  setEntry,
  type EntryChange,
  type EnvEntry,
} from "../lib/env-table.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

interface Props {
  text: string;
  onChange: (next: string) => void;
  /** Saved text the diff toggle compares against. */
  baseline?: string;
  /** True while an older version is open in the compare panel; keeps the diff view on. */
  comparing?: boolean;
}

// Inputs sit dense in rows here; the app-wide 3px focus halo reads as a blob
// at this size. A hairline accent border marks the focused cell instead.
const CELL_FOCUS =
  "focus-visible:ring-0 focus-visible:border-ring aria-invalid:ring-0";

// The KV lens over the same draft the raw editor edits. Every change maps to
// a one-line mutation of the underlying text (see env-table.ts), so comments
// and formatting survive and the diff/save flow downstream is unchanged.
//
// The table stays clean by default; the Diff toggle overlays changes inline
// (old lines red, current rows green), matching the review panel's colors.
export function EnvTable({ text, onChange, baseline, comparing = false }: Props) {
  // Changes show by default; the toggle is for hiding them while editing.
  const [diffWanted, setDiffWanted] = useState(true);
  // Bulk selection, keyed by line index. Any text change shifts indices, so
  // the selection resets rather than silently pointing at different rows.
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  useEffect(() => {
    setSelectedRows(new Set());
  }, [text]);

  const lines = parseEnvText(text);
  // A trailing "" element is just the file's final newline, not a blank row.
  // Blank lines are hidden entirely: they'd render as empty separator rows,
  // and the comment headers already delimit sections. They survive verbatim
  // in the text; the Code view is where whitespace is edited.
  const visible = (
    lines.length > 0 && lines[lines.length - 1]!.raw === ""
      ? lines.slice(0, -1)
      : lines
  ).filter((l) => l.kind === "entry" || l.raw.trim() !== "");
  const entries = visible.filter((l): l is EnvEntry => l.kind === "entry");

  const rowDiff =
    baseline === undefined ? null : diffEntryRows(baseline, text);
  const showDiff = (comparing || diffWanted) && rowDiff !== null;
  const dirty =
    rowDiff !== null && (rowDiff.changes.size > 0 || rowDiff.removed.length > 0);

  const allSelected =
    entries.length > 0 && entries.every((e) => selectedRows.has(e.index));

  function toggleAll(checked: boolean) {
    setSelectedRows(checked ? new Set(entries.map((e) => e.index)) : new Set());
  }

  function toggleRow(index: number, checked: boolean) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  // Pasting a whole env block into any input splits it into rows (appended
  // verbatim, so comments and formatting survive). Returns whether handled.
  function pasteBlock(block: string): boolean {
    if (!isEnvBlock(block)) return false;
    onChange(appendBlock(text, block));
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.length > 0 && (
        <div className="flex h-7 items-center gap-3">
          <div className="flex items-center gap-2 pl-2.5">
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && selectedRows.size > 0}
              onCheckedChange={(checked) => toggleAll(checked === true)}
              aria-label="Select all keys"
            />
            <span className="text-muted-foreground text-xs">
              {selectedRows.size > 0
                ? `${selectedRows.size} selected`
                : "Select all"}
            </span>
          </div>
          {selectedRows.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive h-7"
              onClick={() => onChange(removeLines(text, [...selectedRows]))}
            >
              <Trash2 />
              Delete
            </Button>
          )}
          {baseline !== undefined && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={showDiff ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label="Show changes"
                    aria-pressed={showDiff}
                    disabled={comparing}
                    onClick={() => setDiffWanted((v) => !v)}
                    className="text-muted-foreground relative ml-auto"
                  >
                    <Diff />
                    {dirty && !showDiff && (
                      <span
                        className="bg-primary absolute top-1 right-1 size-1.5 rounded-full"
                        aria-hidden="true"
                      />
                    )}
                  </Button>
                }
              />
              <TooltipContent>
                {comparing
                  ? "Comparing a version"
                  : showDiff
                    ? "Hide changes"
                    : "Show changes"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {(visible.length > 0 ||
        (showDiff && (rowDiff?.removed.length ?? 0) > 0)) && (
        <div className="overflow-hidden rounded-md border">
          <ul className="divide-y">
            {visible.map((line) =>
              line.kind === "entry" ? (
                <EntryRow
                  key={`${line.index}:${line.raw}`}
                  entry={line}
                  change={showDiff ? rowDiff?.changes.get(line.index) : undefined}
                  selected={selectedRows.has(line.index)}
                  onSelect={(checked) => toggleRow(line.index, checked)}
                  onEdit={(next) => onChange(setEntry(text, line.index, next))}
                  onRemove={() => onChange(removeLine(text, line.index))}
                  onPasteBlock={pasteBlock}
                />
              ) : (
                <li
                  key={`${line.index}:${line.raw}`}
                  className="text-muted-foreground/70 px-3 py-1.5 font-mono text-xs whitespace-pre-wrap"
                >
                  {line.raw || "\u{a0}"}
                </li>
              ),
            )}
            {/* Keys the baseline has that the draft doesn't, as removed diff
                lines. Restore appends at the end; the original position went
                away with the line, and the crypto contract forbids
                re-serializing. */}
            {showDiff &&
              rowDiff?.removed.map((r, i) => (
                <li
                  key={`removed:${i}:${r.key}`}
                  className="flex items-center gap-2 bg-diff-remove/5 py-0.5 pr-2 pl-3"
                >
                  <span className="w-3 shrink-0 text-center font-mono text-xs text-diff-remove/60 select-none">
                    -
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-diff-remove line-through">
                    {`${r.key}=${r.value}`}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Restore"
                          className="shrink-0 text-diff-remove/70 hover:text-diff-remove"
                          onClick={() =>
                            onChange(appendEntry(text, r.key, r.value))
                          }
                        >
                          <Undo2 />
                        </Button>
                      }
                    />
                    <TooltipContent>Restore key</TooltipContent>
                  </Tooltip>
                </li>
              ))}
          </ul>
        </div>
      )}
      <AddRow
        onAdd={(key, value) => onChange(appendEntry(text, key, value))}
        onPasteBlock={pasteBlock}
      />
    </div>
  );
}

// Shared paste hook-up: intercept the paste only when it's an env block.
function blockPasteHandler(onPasteBlock: (block: string) => boolean) {
  return (e: ClipboardEvent<HTMLInputElement>) => {
    if (onPasteBlock(e.clipboardData.getData("text"))) e.preventDefault();
  };
}

// Inputs hold local state while focused and commit on blur/Enter. Committing
// per keystroke would rewrite the draft mid-edit, and a momentarily invalid
// key (e.g. cleared to retype) would reclassify the line and drop the input.
function EntryRow({
  entry,
  change,
  selected,
  onSelect,
  onEdit,
  onRemove,
  onPasteBlock,
}: {
  entry: EnvEntry;
  change?: EntryChange;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: (next: { key?: string; value?: string }) => void;
  onRemove: () => void;
  onPasteBlock: (block: string) => boolean;
}) {
  const onPaste = blockPasteHandler(onPasteBlock);
  const [key, setKey] = useState(entry.key);
  const [value, setValue] = useState(entry.value);
  useEffect(() => {
    setKey(entry.key);
    setValue(entry.value);
  }, [entry.key, entry.value]);

  const keyValid = ENV_KEY_RE.test(key);

  function commit() {
    const next: { key?: string; value?: string } = {};
    if (keyValid && key !== entry.key) next.key = key;
    if (!keyValid) setKey(entry.key); // revert an invalid key on blur
    if (value !== entry.value) next.value = value;
    if (next.key !== undefined || next.value !== undefined) onEdit(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setKey(entry.key);
      setValue(entry.value);
    }
  }

  return (
    <li className="flex flex-col">
      {/* The baseline's line, diff-style, with the current row green below;
          one click puts the old value back. */}
      {change?.status === "modified" && (
        <div className="flex items-center gap-2 bg-diff-remove/5 py-0.5 pr-2 pl-3">
          <span className="w-3 shrink-0 text-center font-mono text-xs text-diff-remove/60 select-none">
            -
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-diff-remove line-through">
            {`${entry.key}=${change.baseValue ?? ""}`}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Revert"
                  className="shrink-0 text-diff-remove/70 hover:text-diff-remove"
                  onClick={() => onEdit({ value: change.baseValue ?? "" })}
                >
                  <RotateCcw />
                </Button>
              }
            />
            <TooltipContent>Revert value</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1",
          change && "bg-diff-add/5",
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={`Select ${entry.key}`}
          className="ml-0.5"
        />
        <Input
          aria-label={`Key for ${entry.key}`}
          value={key}
          aria-invalid={!keyValid || undefined}
          onChange={(e) => setKey(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className={cn(
            "h-7 w-2/5 max-w-56 shrink-0 border-transparent bg-transparent px-1.5 font-mono text-xs text-ellipsis shadow-none",
            CELL_FOCUS,
            !keyValid && "text-destructive",
          )}
        />
        <span className="text-muted-foreground/50 select-none">=</span>
        {/* Long values fade out with an ellipsis well before the row icons
            instead of clipping against them; the full text is there on focus. */}
        <Input
          aria-label={`Value for ${entry.key}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="empty"
          className={cn(
            "h-7 flex-1 border-transparent bg-transparent pr-4 pl-1.5 font-mono text-xs text-ellipsis shadow-none",
            CELL_FOCUS,
          )}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${entry.key}`}
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function AddRow({
  onAdd,
  onPasteBlock,
}: {
  onAdd: (key: string, value: string) => void;
  onPasteBlock: (block: string) => boolean;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const keyValid = ENV_KEY_RE.test(key);
  const onPaste = blockPasteHandler(onPasteBlock);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!keyValid) return;
    onAdd(key, value);
    setKey("");
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        aria-label="New key"
        placeholder="NEW_KEY"
        value={key}
        aria-invalid={(key !== "" && !keyValid) || undefined}
        onChange={(e) => setKey(e.target.value)}
        onPaste={onPaste}
        className={cn("h-8 w-2/5 max-w-56 font-mono text-xs", CELL_FOCUS)}
      />
      <span className="text-muted-foreground/50 select-none">=</span>
      <Input
        aria-label="New value"
        placeholder="value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
        className={cn("h-8 flex-1 font-mono text-xs", CELL_FOCUS)}
      />
      <Button type="submit" size="sm" variant="outline" disabled={!keyValid}>
        <Plus />
        Add
      </Button>
    </form>
  );
}

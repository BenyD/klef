// SPDX-License-Identifier: MIT
//
// Reading and writing local env files, the one shape every command uses.

import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { CliError } from "./ui.ts";

/** Env files are owner-only; they hold the plaintext this whole tool protects. */
export const OWNER_ONLY = 0o600;

export interface LocalFile {
  text: string;
  mtimeMs: number;
  size: number;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * The file's text, or a usage error when it isn't valid UTF-8. The vault keeps
 * files byte for byte as text, and decoding loosely would quietly swap the
 * bad bytes for U+FFFD and upload that instead.
 */
function decode(file: string, bytes: Uint8Array): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new CliError("usage", `${path.basename(file)} isn't valid UTF-8 text, so Klef won't read it.`, {
      hint: "Save it as UTF-8 first; reading it any other way would change its bytes.",
    });
  }
}

const isMissing = (err: unknown) => err instanceof Error && "code" in err && err.code === "ENOENT";

/** The file and its mtime and size, or null when it does not exist. */
export async function readLocalFile(file: string): Promise<LocalFile | null> {
  try {
    const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
    return { text: decode(file, bytes), mtimeMs: info.mtimeMs, size: info.size };
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

function unsafe(message: string): CliError {
  return new CliError("unsafe_path", message, {
    hint: "Klef writes plaintext only to a regular file inside this directory.",
  });
}

/**
 * Refuse a destination that would put plaintext somewhere other than where it
 * reads as: a symlink (a cloned repo's `.env.local -> ~/.zshrc`), something
 * that isn't a regular file, or a parent directory that resolves outside
 * `root` through a symlinked folder. resolveWritePath checked the path's
 * text; this checks the filesystem.
 */
async function checkDestination(destination: string, root: string): Promise<void> {
  const existing = await lstat(destination).catch((err: unknown) => {
    if (isMissing(err)) return null;
    throw err;
  });
  if (existing?.isSymbolicLink()) {
    throw unsafe(`Refusing to write ${path.basename(destination)} because it is a symlink, and writing would follow it.`);
  }
  if (existing && !existing.isFile()) {
    throw unsafe(`Refusing to write ${path.basename(destination)} because it is not a regular file.`);
  }
  const [base, parent] = await Promise.all([realpath(root), realpath(path.dirname(destination))]);
  const rel = path.relative(base, parent);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw unsafe(`Refusing to write ${path.basename(destination)} because its folder resolves outside ${base}.`);
  }
}

/**
 * Write plaintext exactly as given, owner-only, creating parent directories.
 * Atomic: the text goes to a new 0600 file beside it, which then replaces the
 * old one, so a crash or Ctrl-C leaves the old file or the new one, never half
 * of either, and the plaintext is never readable under the old file's mode.
 * The rename replaces a symlink rather than following it, and
 * checkDestination refuses one before that anyway.
 */
export async function writeEnvFile(destination: string, plaintext: string, root: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  await checkDestination(destination, root);
  const temp = path.join(path.dirname(destination), `.${path.basename(destination)}.klef-${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temp, plaintext, { mode: OWNER_ONLY, flag: "wx" });
    await rename(temp, destination);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

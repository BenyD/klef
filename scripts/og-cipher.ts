/* Deterministic ciphertext backdrop for the OG image: a grid of fixed-width
   tokens that reads as encrypted env data. Pure and seeded so `pnpm og`
   reproduces the same PNG byte-for-byte. */

export type CipherToken = {
  text: string;
  /** Env-ish names render warmer than plain ciphertext. */
  kind: "junk" | "env";
  /** 0..1 brightness jitter so the grid doesn't look stamped. */
  shade: number;
};

export const TOKEN_LENGTH = 8;

const ENV_WORDS = [
  "API_KEY",
  "TOKEN",
  "SECRET",
  "NONCE",
  "SALT",
  "DB_URL",
  "REDIS_UR",
  "AES_GCM",
  "KEK",
  "DEK",
];

const JUNK_CHARS = "ABCDEF0123456789%&#*+=/<>$-";

/** Tiny seeded PRNG (mulberry32): enough randomness for a texture. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function junkToken(rand: () => number): string {
  let text = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const char = JUNK_CHARS[Math.floor(rand() * JUNK_CHARS.length)] ?? "*";
    text += rand() < 0.2 ? " " : char;
  }
  return text;
}

/** Roughly one env name per row, padded to the fixed token width. */
export function cipherGrid(
  seed: number,
  rows: number,
  cols: number,
): CipherToken[][] {
  const rand = mulberry32(seed);
  return Array.from({ length: rows }, () => {
    const envAt = Math.floor(rand() * cols * 1.5);
    return Array.from({ length: cols }, (_, col): CipherToken => {
      const shade = rand();
      if (col === envAt) {
        const word = ENV_WORDS[Math.floor(rand() * ENV_WORDS.length)] ?? "KEY";
        return {
          text: word.slice(0, TOKEN_LENGTH).padEnd(TOKEN_LENGTH),
          kind: "env",
          shade,
        };
      }
      return { text: junkToken(rand), kind: "junk", shade };
    });
  });
}

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";

const CHARSET = "ABCDEF0123456789#%&$<>/=*+-";
const ENV_WORDS = [
  "API_KEY",
  "DB_URL",
  "SECRET",
  "TOKEN",
  "AWS_KEY",
  "REDIS_URL",
  "JWT",
  "SALT",
  "NONCE",
  "CIPHER",
  "PRIVATE",
  "SESSION",
];
const randChar = () => CHARSET[Math.floor(Math.random() * CHARSET.length)]!;

function randToken() {
  if (Math.random() < 0.16) {
    return ENV_WORDS[Math.floor(Math.random() * ENV_WORDS.length)]!;
  }
  const len = 4 + Math.floor(Math.random() * 5);
  return Array.from({ length: len }, randChar).join("");
}

// Branded loading splash: a full-screen field of scrambling ciphertext (with
// .env keys hidden in it) behind the wordmark decrypting out of cipher glyphs.
// Radial-masked to keep the center clean. Reduced-motion safe.
export function Splash() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6">
        <div className="klef-splash-mark bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
          <KeyRound className="size-7" />
        </div>
        <span className="text-muted-foreground font-mono text-sm tracking-wordmark">
          KLEF
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden">
      <CipherField />

      <div
        className="relative z-10 flex flex-col items-center gap-6"
        aria-label="Loading"
      >
        <div className="klef-splash-mark bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
          <KeyRound className="size-7" />
        </div>
        <Scramble
          value="KLEF"
          mode="reveal"
          className="text-foreground font-mono text-base font-bold tracking-wordmark"
        />
      </div>
    </div>
  );
}

// Ambient background: a grid of short cipher tokens, a fraction re-scrambling
// each tick. One interval drives them all (cheap), masked to fade the center.
// Shared with NotFound, which reuses the splash's visual language.
export function CipherField() {
  const COUNT = 420;
  const [cells, setCells] = useState(() =>
    Array.from({ length: COUNT }, randToken),
  );

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setCells((prev) =>
        prev.map((c) => (Math.random() < 0.4 ? randToken() : c)),
      );
      timer = window.setTimeout(tick, 110);
    };
    timer = window.setTimeout(tick, 110);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="klef-splash-field" aria-hidden="true">
      {cells.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

export function Scramble({
  value,
  mode = "reveal",
  className,
}: {
  value: string;
  mode?: "reveal" | "stream";
  className?: string;
}) {
  const [out, setOut] = useState(mode === "reveal" ? "" : value);
  const raf = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    let frame = 0;
    let queue: { to: string; start: number; end: number; char?: string }[] = [];

    const build = () => {
      // All glyphs scramble from the start (~1s of rolling cipher), then each
      // resolves near the end, so the word decrypts in rather than snapping.
      queue = Array.from(value, (ch) => ({
        to: ch,
        start: 0,
        end: 56 + Math.floor(Math.random() * 26),
      }));
      frame = 0;
    };

    const tick = () => {
      if (mode === "stream") {
        setOut(Array.from(value, randChar).join(""));
        timer.current = window.setTimeout(() => {
          raf.current = requestAnimationFrame(tick);
        }, 65);
        return;
      }

      let output = "";
      let done = 0;
      for (const q of queue) {
        if (frame >= q.end) {
          done++;
          output += q.to;
        } else if (frame >= q.start) {
          if (!q.char || Math.random() < 0.28) q.char = randChar();
          output += q.char;
        }
      }
      setOut(output);

      // Resolve once and settle (no loop).
      if (done < queue.length) {
        frame++;
        raf.current = requestAnimationFrame(tick);
      }
    };

    build();
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(timer.current);
    };
  }, [value, mode]);

  return <span className={className}>{out || " "}</span>;
}

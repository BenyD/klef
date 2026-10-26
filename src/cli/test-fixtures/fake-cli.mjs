#!/usr/bin/env node
// A stand-in for `vercel`, `gh` and `wrangler`, chosen by the name it was run
// as. State lives in the JSON file $FAKE_STATE so a test can seed it and read
// back what was written. Every argv is recorded, so tests can check that no
// value was ever passed as an argument.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const statePath = process.env.FAKE_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
state.calls.push([tool, ...args]);
const save = () => writeFileSync(statePath, JSON.stringify(state));
const stdin = () => readFileSync(0, "utf8");
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const fail = (message) => {
  save();
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

if (tool === "vercel") {
  const [, sub] = args;
  if (sub === "ls") {
    const vars = state.vercel[args[2]] ?? [];
    process.stdout.write("Retrieving project…\n");
    process.stdout.write(JSON.stringify({
      envs: [
        ...vars.map((v) => ({
          key: v.key,
          // Like the real CLI: not decrypted, and absent when Sensitive.
          value: v.type === "sensitive" ? undefined : "eyJ2IjoiY2lwaGVydGV4dCJ9",
          type: v.type,
          target: [args[2]],
        })),
        { key: "VERCEL_URL", value: "x.vercel.app", type: "system", target: [args[2]] },
      ],
    }));
  } else if (sub === "pull") {
    const file = args[2];
    const vars = state.vercel[flag("--environment")] ?? [];
    const lines = ["# Created by Vercel CLI", 'VERCEL_OIDC_TOKEN="oidc"'];
    for (const v of vars) {
      const value = v.type === "sensitive" ? "" : v.value.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      lines.push(`${v.key}="${value}"`);
    }
    writeFileSync(file, `${lines.join("\n")}\n`);
    state.pulledFiles.push(file);
  } else if (sub === "add") {
    const [, , key, target] = args;
    const value = stdin();
    if (key === "FAIL_ME") fail(`Error: could not save ${key}=${value}: ${value} is invalid`);
    const vars = (state.vercel[target] ??= []);
    const existing = vars.find((v) => v.key === key);
    if (existing) existing.value = value;
    else vars.push({ key, value, type: "encrypted" });
  } else {
    fail(`fake vercel: unhandled ${args.join(" ")}`);
  }
} else if (tool === "gh") {
  const env = flag("--env");
  const scope = env ? (state.github.envs[env] ??= {}) : state.github.repo;
  if (args[1] === "list") {
    process.stdout.write(JSON.stringify(Object.keys(scope).map((name) => ({ name }))));
  } else if (args[1] === "set") {
    scope[args[2].toUpperCase()] = stdin();
  } else {
    fail(`fake gh: unhandled ${args.join(" ")}`);
  }
} else if (tool === "wrangler") {
  const key = `${flag("--name") ?? "config"}|${flag("--env") ?? ""}`;
  const worker = (state.cloudflare[key] ??= {});
  if (args[1] === "list") {
    process.stdout.write(JSON.stringify(Object.keys(worker).map((name) => ({ name, type: "secret_text" }))));
  } else if (args[1] === "bulk") {
    Object.assign(worker, JSON.parse(stdin()));
  } else {
    fail(`fake wrangler: unhandled ${args.join(" ")}`);
  }
}
save();

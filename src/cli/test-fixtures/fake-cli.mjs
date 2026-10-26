#!/usr/bin/env node
// A stand-in for `vercel`, `gh` and `wrangler`, chosen by the name it was run
// as, answering the listing commands `klef audit` uses from the JSON file at
// $FAKE_STATE. Every argv is recorded so a test can check what was run.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const statePath = process.env.FAKE_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
state.calls.push([tool, ...args]);
writeFileSync(statePath, JSON.stringify(state));

const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
if (state.signedOut?.includes(tool)) fail(`Error: ${tool}: not signed in. API_TOKEN=leaky-${tool}`);

if (tool === "vercel" && args[0] === "env" && args[1] === "ls") {
  const vars = state.vercel[args[2]] ?? [];
  process.stdout.write("Retrieving project…\n");
  process.stdout.write(JSON.stringify({
    envs: [
      // Like the real CLI: a readable value for variables that are not Sensitive.
      ...vars.map((v) => ({ key: v.key, value: v.type === "sensitive" ? undefined : v.value, type: v.type })),
      { key: "VERCEL_URL", value: "x.vercel.app", type: "system" },
    ],
  }));
} else if (tool === "gh" && args[0] === "secret" && args[1] === "list") {
  const env = flag("--env");
  const scope = env ? state.github.envs[env] : state.github.repo;
  if (!scope) fail(`HTTP 404: Not Found (https://api.github.com/repos/o/r/environments/${env}/secrets)`);
  process.stdout.write(JSON.stringify(scope.map((name) => ({ name }))));
} else if (tool === "wrangler" && args[0] === "secret" && args[1] === "list") {
  process.stdout.write(JSON.stringify(state.cloudflare.map((name) => ({ name, type: "secret_text" }))));
} else {
  fail(`fake ${tool}: unhandled ${args.join(" ")}`);
}

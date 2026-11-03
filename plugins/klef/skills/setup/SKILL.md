---
name: setup
description: Set up Klef in this repository. Signs in through the browser, links the repo to a project in the vault and pulls its env files.
disable-model-invocation: true
---

Set up Klef (https://klef.sh) for this repository.

1. Run `npx @klefsh/cli setup --json` from the repository root.
2. It may open the browser for the user to approve this device with
   "Approve and unlock" (one passkey touch, or their passphrase typed in the
   browser). Tell the user to look for the tab, then wait. Never ask for the
   passphrase in the chat.
3. If it stops with a question (which workspace or project to link, or
   whether to write agent instructions), ask the user and rerun the exact
   command it prints.
4. When it finishes, run `npx @klefsh/cli status --json` and tell the user
   which files are linked and their sync state, by name only. Then check
   that git ignores every env file it wrote
   (`git ls-files --error-unmatch <path>` should fail for each).

Never open, print or summarise an env file, and never echo a value. The klef
skill in this plugin has the full rules.

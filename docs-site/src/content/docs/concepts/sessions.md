---
title: Staying signed in and unlocked
description: How long a sign-in lasts, how auto-lock works, and what "Keep unlocked for 7 days" trades away.
sidebar:
  order: 5
---

Klef remembers the two gates separately: being signed in, and being unlocked.

## Sign-in lasts 30 days

A browser sign-in is a session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) that lasts 30 days and slides forward when you use Klef, at most once a day. Being signed in reaches ciphertext and names, never a value.

The CLI signs in with an [access token](#access-tokens) instead.

## Auto-lock

The unlocked data key is forgotten after a period without use. The default is **15 minutes**. Change it in Settings, Security, Vault, Auto-lock:

5, 10, 15 or 30 minutes; 1 hour; 8 hours; 1 day; 7 days; or Never.

The setting belongs to the browser you set it in. To spare you a prompt on every reload, the browser keeps the unlocked key in IndexedDB as a non-extractable key: page code can ask it to decrypt, but cannot read its bytes, and it belongs to the signed-in user. It is used only while it is younger than the auto-lock time. Locking, signing out or auto-lock deletes it.

## Keep unlocked for 7 days

The unlock screen has an opt-in checkbox, **Keep unlocked for 7 days**. It sets auto-lock to 7 days for that browser, so you skip the passphrase there until 7 days pass without use.

The trade-off, plainly: while it is on, anyone who can use that browser profile, or code running in Klef's origin there (an XSS bug, or a malicious extension with access to the site), can decrypt your vault for up to 7 days after the last use, without your passphrase. They still cannot export the key itself, and nothing about it reaches the server.

Use it only on a device you trust and do not share. To turn it off, clear the box at your next unlock or pick a shorter auto-lock in Settings. Locking ends the current window at once.

## The CLI's unlock agent

`klef unlock` asks for your passphrase once and starts a small background process that holds the key in memory, so later commands do not prompt. Like `ssh-agent`, it offers operations ("decrypt this", "encrypt that") over a socket only your user can reach, and never hands out the key itself.

- It locks after **15 minutes** without an encrypt or decrypt, the same default as the web app.
- `klef unlock --for 8h` holds it longer: up to **7 days** of idle time. Any use resets the clock.
- `klef lock` forgets the key at once.
- The key is never written to disk, the OS keychain or an environment variable.

While it is unlocked, any process running as you can ask it to decrypt. That is the same trade every agent of this kind makes, and why the idle timeout exists. The unlock agent is not available on Windows yet; there, each command asks for the passphrase.

## Access tokens

The CLI holds an **access token**, an auth credential and nothing more. It reaches ciphertext and the names Klef stores anyway, but it cannot decrypt: that needs your passphrase-derived key, which is never sent or stored.

`klef login` creates one through the browser. You can also make one by hand in Settings, Security, Access tokens, with an expiry of 30 days, 90 days (the default), 1 year, or none. A token is shown once, and Klef stores only its hash. Revoke any token from the same list.

A token deliberately cannot mint or revoke tokens, approve a CLI sign-in, change your vault's key material, or delete workspaces, projects or files. Those stay in the browser.

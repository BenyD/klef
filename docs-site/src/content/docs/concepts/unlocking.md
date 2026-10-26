---
title: Passphrase, passkeys and recovery key
description: The three ways to unlock your vault, and how to change or replace each one.
sidebar:
  order: 4
---

Three things can unlock a vault. Each one leads to the same data key; see [End-to-end encryption](/docs/concepts/encryption/) for how.

## Master passphrase

You choose it when you create the vault. It must be at least 8 characters. The strength meter checks for length, upper and lower case, and a number or symbol, but a long phrase you will remember beats a short clever one: the passphrase is the only thing between an attacker with a copy of the database and your data.

The passphrase never leaves your device. In the browser it is typed into the unlock screen; in the CLI it is read from the terminal itself (`/dev/tty`), never from a flag, a pipe or an environment variable.

**To change it:** Settings, Security, Vault, Master passphrase, then Change. You need the current passphrase. Your recovery key keeps working after the change.

## Passkeys

A passkey can do two different jobs in Klef, and they are separate:

- **Sign in.** Add one in Settings, Security, Passkeys, then use "Sign in with a passkey" on the sign-in page. You cannot create an account with a passkey; add it after signing in with Google or GitHub.
- **Unlock the vault.** Turn on "Unlocks vault" for a passkey in the same list. Klef asks for your passphrase and then the passkey, and wraps your data key with a secret the passkey derives (the WebAuthn PRF extension). The unlock screen then offers "Unlock with a passkey" and prompts for it as soon as you arrive.

Unlocking with a passkey needs an authenticator and browser that support PRF. Your passphrase keeps working either way.

## Recovery key

The recovery key is 128 random bits, shown as `KLEF-` followed by groups of five characters. It is shown exactly once, when you create the vault, and Klef cannot show it again or recover it.

**If you forget your passphrase:** on the unlock screen, choose "Forgot your passphrase? Use your recovery key". Enter the recovery key and a new master passphrase. The recovery key stays valid afterwards.

**To replace the recovery key:** Settings, Security, Recovery key, Generate new key. You need your passphrase. The old key stops working at once, and the new one is shown once, with Copy and Download buttons.

:::danger
If you lose both your passphrase and your recovery key, your data is gone. There is no reset Klef could perform, because Klef never has the keys. To start over, delete the account in Settings, Profile, Danger zone, and sign up again.
:::

## Locking

Locking forgets the key on this device and keeps you signed in. Lock with the lock menu, with <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>, or let auto-lock do it. In the CLI, `klef lock` stops the unlock agent. See [Staying signed in and unlocked](/docs/concepts/sessions/).

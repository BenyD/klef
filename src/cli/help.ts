// SPDX-License-Identifier: AGPL-3.0-or-later

export const HELP = `klef - zero-knowledge .env sync

Usage:
  klef <command> [options]

Commands:
  login              Store an access token minted in the web app
  logout             Forget the stored token on this machine
  status             Show sign-in state and what this directory is linked to
  link [ws] [proj]   Link this directory to a file in the vault (.klef.json)
  pull               Write the vault's copy of the env file to disk
  push               Send this directory's env file up as a new version
  help               Show this

Options:
  --file <name>      Which env file in the vault (pull defaults to the linked one)
  --path <path>      Which local file to read or write (default: the file's name)
  -y, --yes          Skip the confirmation on push
  -h, --help         Show this
  -v, --version      Print the version

Environment:
  KLEF_API_URL       Point at a self-hosted instance (default: https://klef.sh)
  KLEF_TOKEN         Use this access token instead of the stored one
  KLEF_NO_KEYCHAIN   Store the token in a 0600 file instead of the OS keychain

klef never prints a secret value. Pull writes to a file, push reports only how
many lines changed, and nothing goes to stdout either way.
The master passphrase is read from the terminal only, never from a flag or a
pipe, so the process that spawned klef cannot supply or observe it.
`;

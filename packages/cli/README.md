# @akropolys/cli

Command-line utilities for [Akropolys](https://akropolys.cloud): set up a project in one command, check connectivity, and lint catalog payloads before you ingest them.

## Install

```bash
npm install -g @akropolys/cli
# or run on demand
npx @akropolys/cli <command>
```

## Commands

### `akropolys init`

The setup wizard. It detects your framework and package manager, installs
`@akropolys/sdk` and `@akropolys/kiku`, signs you in through the browser, lets
you pick or create a site, mints an API key for it, and writes everything to
`.env.local` (or `.env`) — then prints the snippet that mounts the widget.

```bash
npx @akropolys/cli init
npx @akropolys/cli init --skip-install
npx @akropolys/cli init --no-login    # paste a Site ID and key instead
npx @akropolys/cli init --api-url https://...
```

Sign-in opens `shell.akropolys.cloud/cli-login`, which shows a code to match
against your terminal. Approving it posts a short-lived dashboard token back to
a loopback server the CLI opened; the token is held in memory for the run and is
never written to disk.

Written variables, prefixed for the detected framework (`NEXT_PUBLIC_`, `VITE_`,
`PUBLIC_`):

```
NEXT_PUBLIC_AKROPOLYS_SITE_ID=...
NEXT_PUBLIC_AKROPOLYS_API_KEY=...
NEXT_PUBLIC_AKROPOLYS_API_URL=...
```

A freshly minted key also carries the ASEP signing pair, which is shown only
once. If you accept it, `AKROPOLYS_KID` and `AKROPOLYS_PRIVATE_KEY` are written
alongside — unprefixed, because only your server may read them.

Existing values are updated in place; nothing else in the file is touched, and
the env file is added to `.gitignore` if it is not already covered.

### `akropolys doctor`

Verifies your local config and that the API is reachable. Reads `AKROPOLYS_*` under any of the `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` prefixes (or none) from `.env` / `.env.local`.

```bash
akropolys doctor        # health check
akropolys doctor -v     # also print the resolved config
```

### `akropolys inspect [file]`

Statically checks a catalog JSON payload for ingestion issues — missing stable identifier, sparse attributes — before you push it.

```bash
akropolys inspect catalog.json
cat catalog.json | akropolys inspect --stdin
akropolys inspect catalog.json --strict   # exit 3 if any warning fires
```

## License

MIT

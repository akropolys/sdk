# @akropolys/cli

Command-line utilities for [Akropolys](https://akropolys.cloud): scaffold local config, check connectivity, and lint catalog payloads before you ingest them.

## Install

```bash
npm install -g @akropolys/cli
# or run on demand
npx @akropolys/cli <command>
```

## Commands

### `akropolys init`

Interactively writes an `.env` with your site credentials:

```
NEXT_PUBLIC_AKROPOLYS_SITE_ID=...
NEXT_PUBLIC_AKROPOLYS_API_TOKEN=...
```

### `akropolys doctor`

Verifies your local config and that the API is reachable. Reads `NEXT_PUBLIC_AKROPOLYS_*` or `VITE_AKROPOLYS_*` from `.env` / `.env.local`.

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

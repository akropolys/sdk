# @akropolys/sdk

## 1.6.4

### Patch Changes

- Surface the server's message when a chat stream fails (e.g. the guest chat limit) instead of a bare "Stream request failed: <status>".

## 1.6.3

### Patch Changes

- Preserve an explicit `fields` object during ingest instead of nesting it, so curated fields (price, category, …) are indexed at `fields.<key>` rather than being lost at `fields.fields.<key>`.

## 1.6.2

### Patch Changes

- Document `AkropolysConfig` props with JSDoc, export `AkropolysProviderProps`, and make missing-config errors prop-first.

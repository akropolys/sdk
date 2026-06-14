# SDK Architecture Split: @akropolys/sdk & @akropolys/kiku

This implementation plan details the refactoring of the SDK into a monorepo under the new organization name **Akropolys**, renaming the conversational assistant to **Kiku** (like Claude is to Anthropic), and designing a headless event-driven streaming API.

---

## 1. Core API Design: KikuStream

To support the *"data pipeline, not a UI library"* mental model, the core `@akropolys/sdk` package will expose an event-emitter style stream class `KikuStream` for vanilla JS environments, and a React hook `useKiku` that wraps it.

### A. The Vanilla Event-Emitter (`KikuStream`)
When calling the API client directly, it returns a `KikuStream` instance:
```typescript
import { AkropolysClient } from '@akropolys/sdk';

const client = new AkropolysClient({ siteId, apiToken, apiUrl });

const stream = client.chat('What is the cheapest phone?');

stream.on('token', (token: string) => {
  // Handle incremental word-by-word streaming
});

stream.on('meta', (meta: ChatMetadata) => {
  // Handle search results, cart updates, and parsed intents
});

stream.on('done', (fullMessage: string) => {
  // Fired when the stream finishes
});

stream.on('error', (error: Error) => {
  // Handle stream errors
});
```

### B. The React Hook (`useKiku`)
Exposed from `@akropolys/sdk`, wrapping the stream state and providing standard callbacks:
```typescript
import { useKiku } from '@akropolys/sdk';

const { send, messages, loading, streaming } = useKiku({
  onToken: (token) => { /* Custom logic */ },
  onMeta: (meta) => { /* Custom metadata handling */ },
  onDone: (message) => { /* Log or write to DB */ },
  onError: (err) => { /* Handle UI notification */ }
});
```

### C. Hook State vs. Stream Events Design
To provide both maximum flexibility and ease of use:
1. **`AkropolysClient.chat(query, history)` (Core SDK Engine)**: Purely stream-oriented. Returns `KikuStream` which emits events but **does not maintain state/history**.
2. **`useKiku` (Core SDK React Hook)**: Maintained for drop-in React usage. Internally manages a `messages: ChatMessage[]` React state representation of the conversation history. It accepts an optional `initialMessages: ChatMessage[]` and updates the list as queries complete. Developers wanting to bypass this can subscribe directly to the event emitters.

---

## 2. Monorepo Package Structure

```
C:\Users\user\Desktop\sdk/
├── package.json (root private workspace)
├── pnpm-workspace.yaml
├── .changeset/
└── packages/
    ├── sdk/                       ← Headless Core SDK (@akropolys/sdk)
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tsup.config.ts
    │   └── src/
    │       ├── index.ts           (exports clients, hooks, events, types)
    │       ├── client.ts          (AkropolysClient)
    │       ├── api.ts             (AkropolysAPI)
    │       ├── stream.ts          (KikuStream)
    │       ├── types.ts
    │       ├── commerce.ts
    │       ├── property.ts
    │       └── hooks/
    │           ├── useKiku.ts
    │           ├── useSearch.ts
    │           ├── useIngest.ts
    │           ├── useListIngest.ts
    │           ├── usePageIngest.ts
    │           ├── useCart.ts
    │           ├── usePaymentPolling.ts
    │           └── useAkropolys.ts (deprecated)
    │
    └── kiku/                      ← UI Components Library (@akropolys/kiku)
        ├── package.json
        ├── tsconfig.json
        ├── tsup.config.ts
        └── src/
            ├── index.ts           (exports KikuChat, KikuButton, SearchBar, Sparkle)
            ├── styles.css         (vanilla CSS stylesheet)
            ├── components/
            │   ├── KikuButton.tsx
            │   ├── KikuChat.tsx
            │   ├── SearchBar.tsx
            │   ├── Sparkle.tsx
            │   ├── CartBadge.tsx
            │   ├── CartDrawer.tsx
            │   ├── CheckoutModal.tsx
            │   ├── ComparisonMatrix.tsx
            │   └── AkropolysProvider.tsx
            └── utils/
                ├── cn.ts
                └── markdown.tsx
```

---

## 3. Configuration & Dependency Management

### A. Root `pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
```

### B. Root `package.json`
```json
{
  "name": "akropolys-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm --filter \"*\" build",
    "dev": "pnpm --filter \"*\" dev"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.1",
    "typescript": "^5.0.0"
  }
}
```

### C. `@akropolys/sdk` Build Configuration
* **tsup.config.ts**: 
  ```typescript
  import { defineConfig } from 'tsup';
  export default defineConfig({
    entry: ['src/index.ts', 'src/commerce.ts', 'src/property.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    external: ['react', 'react-dom'],
  });
  ```

### D. `@akropolys/kiku` Build Configuration & Peer Dependencies
* **peerDependencies**: 
  ```json
  "peerDependencies": {
    "react": ">=17",
    "react-dom": ">=17",
    "@akropolys/sdk": "^1.0.0"
  }
  ```
  *(We use compatible range matching `^1.0.0` for developer flexibility rather than pinning exact versions).*
* **tsup.config.ts**: 
  ```typescript
  import { defineConfig } from 'tsup';
  export default defineConfig({
    entry: {
      index: 'src/index.ts',
      styles: 'src/styles.css' // Compile CSS as a separate entrypoint
    },
    format: ['cjs', 'esm'],
    dts: true,
    external: ['react', 'react-dom', '@akropolys/sdk'],
    banner: { js: "'use client';" }
  });
  ```

---

## 4. Phased Execution Order

To keep tracks clean and avoid compounding compilation errors, we will execute the refactoring in the following order:

### Phase 1: Monorepo Shell Setup
1. Define `pnpm-workspace.yaml` at the root.
2. Initialize root `package.json` with workspace commands.
3. Install base dependencies at root (`pnpm install`).

### Phase 2: Core SDK Decoupling & Isolation
1. Create `packages/sdk/` directories and initial package configurations.
2. Move core headless files from `src/` to `packages/sdk/src/`.
3. Design and implement the new `KikuStream` interface and `useKiku` hook.
4. Rename `AkropolysClient` to `AkropolysClient` and `AkropolysAPI` to `AkropolysAPI`.
5. Run `pnpm build` in `packages/sdk` and verify it compiles cleanly without any CSS errors.

### Phase 3: UI Component Migration
1. Create `packages/kiku/` directories and package configurations.
2. Move UI components, styles, and utils to `packages/kiku/src/`.
3. Update imports inside components to pull from `@akropolys/sdk` and point them to the new components/hook signatures (`useKiku`, `KikuChat`, etc.).
4. Run `pnpm build` in `packages/kiku` and verify it builds both JS and CSS bundles successfully.

### Phase 4: Versioning & Changesets Setup
1. Install `@changesets/cli` to the root workspace.
2. Initialize changesets using `pnpm changeset init`.
3. Create a first changeset indicating the migration of packages to `@akropolys/sdk` and `@akropolys/kiku`.

# @akropolys/kiku

## 1.7.7

### Patch Changes

- Reasoning is shown as a collapsible "Thought for Xs" block, delivered as a structured stream event (raw tags can no longer leak into answers).
- "Continue generating" now also appears when a response is interrupted mid-answer, resuming into the same bubble instead of losing the partial answer.

## 1.6.1

### Patch Changes

- Show product cards and suggestion pills only for items the answer actually referenced (via `<entity_ref>`), instead of dumping raw retrieval candidates for questions that didn't ask for them.

## 2.0.0

### Major Changes

- Initial release of @akropolys/sdk (headless core) and @akropolys/kiku (UI components), migrating from Akropolys naming architecture.

### Patch Changes

- Updated dependencies
  - @akropolys/sdk@2.0.0

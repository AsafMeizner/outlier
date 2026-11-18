---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/tsconfig*.json"
---

# TypeScript

- Node runs the server's `.ts` files directly (type stripping), so code must be erasable: no `enum`, no
  `namespace`, no constructor parameter properties, no `import x = require()`. Use `as const` objects and unions.
- Import local files with their extension: `import { x } from './match.ts'`. Type-only imports use `import type`.
- `noUncheckedIndexedAccess` is on: `arr[i]` is `T | undefined`. Narrow it (`?? fallback`, a guard); don't add `!`.
- Two targets: `tsconfig.server.json` (server, shared, tests, tools, e2e) and `tsconfig.web.json` (web, shared).
  Run `npm run typecheck` after any change to `shared/`.
- No `any`; use `unknown` and narrow. No `@ts-ignore`; if unavoidable, `@ts-expect-error: reason`.
- Tests strip types, so passing tests do not mean the types are right: always run typecheck too.

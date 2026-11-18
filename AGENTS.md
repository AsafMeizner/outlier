# Agent instructions

The full guide for AI coding agents is [CLAUDE.md](CLAUDE.md) (it applies to any agent, not only Claude),
with more detail in [docs/architecture.md](docs/architecture.md) and the path-scoped notes in `.claude/rules/`.

Before you finish a change, run:

```sh
npm run check   # typecheck, lint, server + web tests, question-bank validation, build
```

The three rules that break most often: no network requests at runtime, every user-facing string in both
`web/src/i18n/en.ts` and `he.ts`, and daily puzzles only ever use brand-new prompts.

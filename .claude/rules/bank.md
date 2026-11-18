---
paths:
  - "bank/**"
  - "tools/validate-bank.ts"
  - "server/packs.ts"
---

# Question bank

- Packs are JSON (`{ title, prompts: [{ text, category, answers: [{ answer, tier, aliases? }] }] }`), plain text or
  CSV; `server/packs.ts` parses all three. JSON packs are written with 1-space indentation.
- Tiers: 1 Mainstream, 2 Familiar, 3 Uncommon, 4 Rare, 5 Outlier, 6 One of a Kind. Exactly one tier-6 answer per
  prompt: the single rarest answer that is still undeniably correct.
- Aim for 50-90 answers per prompt (the validator warns under 25). About a third should have aliases (other spellings,
  short forms; for Hebrew, spellings with and without matres lectionis and the English name where Israelis use it).
- The prompt's language is detected from its text (Hebrew letters = Hebrew). Categories are free text but reuse the
  existing ones so themed packs (Practice) group well.
- No prompt may repeat another, in any pack (the validator checks exact duplicates; also avoid near-duplicates).
- Each file in `bank/packs` is imported once per server (setting `starterPacks`). Do not rename shipped files.
- Always finish with `npm run validate-bank`: 0 errors, and no warnings for new packs.
- To write a new pack, use the `write-question-pack` skill.

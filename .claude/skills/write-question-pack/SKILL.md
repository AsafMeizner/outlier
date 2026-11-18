---
name: write-question-pack
description: Write a new Outlier question pack (bank/packs/*.json) in English or Hebrew, with ranked answers, tiers 1-6, aliases and no duplicate prompts, then validate it. Use when asked for more questions, a new pack, more daily prompts, or a themed pack.
---

# Write a question pack

A pack is 30 prompts on one theme, in one language, saved as `bank/packs/<lang>-<theme>.json`. Each prompt is an open
list question with many valid answers, ranked by how many people would think of them.

## 1. Check what exists

```sh
node tools/list-prompts.ts en      # or he; prints "file | category | text"
```

Pick a theme the bank covers thinly. Reuse existing category names where they fit (Practice groups by category).

## 2. Write it

```json
{
 "title": "Space & Sky",
 "prompts": [
  {
   "text": "Name a constellation",
   "category": "Science",
   "answers": [
    { "answer": "Orion", "tier": 1 },
    { "answer": "Ursa Major", "tier": 1, "aliases": ["Great Bear", "Big Dipper"] }
   ]
  }
 ]
}
```

- `text`: "Name a ..." / "Name something ..." (Hebrew: "שם של ...", "משהו ש..."), at most 140 characters,
  answerable by ordinary adults, fine for an office.
- 50-90 answers per prompt (never under 35). Only answers you are sure are correct; prefer closed, checkable sets.
- Tiers by how many people would say it: 1 Mainstream (the first 5-8 obvious ones), 2 Familiar, 3 Uncommon, 4 Rare,
  5 Outlier, and **exactly one** tier 6 One of a Kind: the single rarest answer that is still undeniably right.
  Rough shape: 6 / 10 / 15 / 15 / 15 / 1.
- Aliases for about a third of answers: other spellings, short forms, the English name in a Hebrew pack. An alias must
  not match another answer or its aliases.
- Hebrew: natural Israeli Hebrew in text, categories and answers. Write the file with an editor or the Write tool;
  shell heredocs corrupt Hebrew.
- No prompt may repeat or closely paraphrase an existing one.
- Save with 1-space indentation (`JSON.stringify(pack, null, 1)`) and a final newline.

## 3. Validate

```sh
node tools/validate-bank.ts bank/packs/<file>.json   # this pack
npm run validate-bank                                 # the whole bank, catches duplicates across packs
```

Fix until it reports 0 errors and 0 warnings.

## 4. Ship

Commit the file. On the next start every server imports it once (new files only), so it reaches existing installs.
The offline zip (`npm run bundle`) includes it automatically.

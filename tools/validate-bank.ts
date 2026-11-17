#!/usr/bin/env node
// Validate question-pack files. Usage: node tools/validate-bank.ts [bank/packs/*.json]
// With no arguments it checks every pack in bank/packs. Exit code 1 when any file has errors; warnings do not fail.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { keysFor, normalize } from '../server/match.ts';
import { parsePack, type Pack } from '../server/packs.ts';

let files = process.argv.slice(2);
if (!files.length) {
  const dir = resolve(import.meta.dirname, '..', 'bank', 'packs');
  files = readdirSync(dir).filter(f => /\.(json|txt|csv)$/.test(f)).map(f => join(dir, f));
}

const seenPrompts = new Map<string, string>();
let errorCount = 0, warnCount = 0, promptCount = 0, answerCount = 0;

for (const file of files) {
  const errors: string[] = [], warnings: string[] = [];
  let pack: Pack;
  try { pack = parsePack(readFileSync(file, 'utf8'), file); }
  catch (e) { console.log(`\n${file}\n  ERROR ${(e as Error).message}`); errorCount++; continue; }
  pack.prompts.forEach((p, pi) => {
    const where = `#${pi + 1} "${p.text}"`;
    if (p.text.length < 8) errors.push(`${where}: prompt text too short`);
    if (p.text.length > 140) warnings.push(`${where}: prompt longer than 140 characters`);
    if (!p.category) warnings.push(`${where}: no category`);
    const nk = normalize(p.text);
    const seen = seenPrompts.get(nk);
    if (seen) errors.push(`${where}: duplicate prompt (also in ${seen})`);
    seenPrompts.set(nk, file);
    if (p.answers.length < 25) warnings.push(`${where}: only ${p.answers.length} answers (aim for 30+)`);
    const owner = new Map<string, number>();
    const tiers = [0, 0, 0, 0, 0, 0];
    p.answers.forEach((a, ai) => {
      if (!a.answer.trim()) { errors.push(`${where}: answer ${ai + 1} is empty`); return; }
      if (!(Number.isInteger(a.tier) && a.tier >= 1 && a.tier <= 5)) errors.push(`${where}: "${a.answer}" has tier ${a.tier} (must be 1-5)`);
      tiers[a.tier] = (tiers[a.tier] ?? 0) + 1;
      for (const text of [a.answer, ...a.aliases]) {
        for (const k of keysFor(text)) {
          const prev = owner.get(k);
          if (prev !== undefined && prev !== ai) errors.push(`${where}: "${text}" collides with "${p.answers[prev]?.answer ?? ''}"`);
          owner.set(k, ai);
        }
      }
    });
    if (!tiers[1]) warnings.push(`${where}: no tier-1 (Mainstream) answers`);
    if (!tiers[5]) warnings.push(`${where}: no tier-5 (Outlier) answers`);
    promptCount++; answerCount += p.answers.length;
  });
  const uniqErrors = [...new Set(errors)];
  if (uniqErrors.length || warnings.length) {
    console.log(`\n${file}`);
    for (const e of uniqErrors) console.log('  ERROR', e);
    for (const w of warnings) console.log('  warn ', w);
  }
  errorCount += uniqErrors.length; warnCount += warnings.length;
}
console.log(`\n${files.length} file(s), ${promptCount} prompts, ${answerCount} answers, ${errorCount} error(s), ${warnCount} warning(s)`);
process.exit(errorCount ? 1 : 0);

#!/usr/bin/env node
// Validate question-pack files. Usage: node tools/validate-bank.mjs bank/packs/*.json
// Exit code 1 when any file has errors. Warnings do not fail.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { keysFor, normalize } from '../src/match.mjs';
import { parsePack } from '../src/packs.mjs';

let files = process.argv.slice(2);
if (!files.length) {
  const dir = resolve(import.meta.dirname, '..', 'bank', 'packs');
  files = readdirSync(dir).filter(f => /\.(json|txt|csv)$/.test(f)).map(f => join(dir, f));
}

const seenPrompts = new Map();
let errorCount = 0, warnCount = 0, promptCount = 0, answerCount = 0;

for (const file of files) {
  const errors = [], warnings = [];
  let pack;
  try { pack = parsePack(readFileSync(file, 'utf8'), file); }
  catch (e) { console.log(`\n${file}\n  ERROR ${e.message}`); errorCount++; continue; }
  pack.prompts.forEach((p, pi) => {
    const where = `#${pi + 1} "${p.text}"`;
    if (!p.text || p.text.length < 8) errors.push(`${where}: prompt text too short`);
    if (p.text.length > 140) warnings.push(`${where}: prompt longer than 140 characters`);
    if (!p.category) warnings.push(`${where}: no category`);
    const nk = normalize(p.text);
    if (seenPrompts.has(nk)) errors.push(`${where}: duplicate prompt (also in ${seenPrompts.get(nk)})`);
    seenPrompts.set(nk, file);
    if (p.answers.length < 25) warnings.push(`${where}: only ${p.answers.length} answers (aim for 30+)`);
    const owner = new Map();
    const tiers = [0, 0, 0, 0, 0, 0];
    p.answers.forEach((a, ai) => {
      if (!a.answer?.trim()) { errors.push(`${where}: answer ${ai + 1} is empty`); return; }
      if (!(a.tier >= 1 && a.tier <= 5 && Number.isInteger(a.tier))) errors.push(`${where}: "${a.answer}" has tier ${a.tier} (must be 1-5)`);
      tiers[a.tier] = (tiers[a.tier] || 0) + 1;
      for (const text of [a.answer, ...(a.aliases || [])]) {
        for (const k of keysFor(text)) {
          if (owner.has(k) && owner.get(k) !== ai) errors.push(`${where}: "${text}" collides with "${p.answers[owner.get(k)].answer}"`);
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

// The one-line-per-answer text format used by the game editor and the admin's paste box:
//   "<tier 1-5> <answer> | <other spelling> | <other spelling>"
import type { AnswerFull, AnswerInput } from '../../../shared/api.ts';

export interface ParsedAnswers {
  answers: AnswerInput[];
  /** 1-based line numbers that could not be read. */
  bad: number[];
}

const LINE = /^\s*([1-5])[\s.):-]+(.+)$/u;

/**
 * Read answer lines. Answers that match an existing one by name keep its id,
 * so editing a played prompt updates answers in place instead of replacing them.
 */
export function parseAnswerLines(text: string, existing: readonly AnswerFull[] = []): ParsedAnswers {
  const byName = new Map(existing.map(a => [a.answer.trim().toLowerCase(), a.id]));
  const answers: AnswerInput[] = [];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const m = LINE.exec(raw);
    const parts = m?.[2]?.split('|').map(s => s.trim()).filter(Boolean) ?? [];
    const [answer, ...aliases] = parts;
    if (!m || !answer) { bad.push(i + 1); return; }
    answers.push({ id: byName.get(answer.toLowerCase()) ?? null, answer, tier: Number(m[1]), aliases });
  });
  return { answers, bad };
}

export function formatAnswerLines(answers: readonly Pick<AnswerFull, 'answer' | 'tier' | 'aliases'>[]): string {
  return [...answers]
    .sort((a, b) => a.tier - b.tier || a.answer.localeCompare(b.answer))
    .map(a => [`${a.tier} ${a.answer}`, ...a.aliases].join(' | '))
    .join('\n');
}

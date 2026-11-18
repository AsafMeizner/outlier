import { describe, expect, it } from 'vitest';
import { formatAnswerLines, parseAnswerLines } from './answers.ts';

describe('answer lines', () => {
  it('reads tiers 1-6, aliases after |, and reports unreadable lines', () => {
    const { answers, bad } = parseAnswerLines('1 Apple\n\n6 Salak | snake fruit\n7 Nope\nno tier here\n3) Fig');
    expect(answers).toEqual([
      { id: null, answer: 'Apple', tier: 1, aliases: [] },
      { id: null, answer: 'Salak', tier: 6, aliases: ['snake fruit'] },
      { id: null, answer: 'Fig', tier: 3, aliases: [] },
    ]);
    expect(bad).toEqual([4, 5]);
  });

  it('keeps the id of an existing answer with the same name, so edits update in place', () => {
    const { answers } = parseAnswerLines('2 apple', [{ id: 7, answer: 'Apple', tier: 1, aliases: [] }]);
    expect(answers[0]?.id).toBe(7);
  });

  it('formats sorted by tier then name, and reads back the same', () => {
    const list = [{ answer: 'Fig', tier: 3, aliases: [] }, { answer: 'Apple', tier: 1, aliases: ['Pomme'] }];
    const text = formatAnswerLines(list);
    expect(text).toBe('1 Apple | Pomme\n3 Fig');
    expect(parseAnswerLines(text).answers.map(a => [a.tier, a.answer, a.aliases])).toEqual([[1, 'Apple', ['Pomme']], [3, 'Fig', []]]);
  });
});

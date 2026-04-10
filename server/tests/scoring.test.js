import { describe, it, expect } from 'vitest';
import { normalizeText, calculateScore } from '../src/scoring.js';

describe('normalizeText', () => {
  it('strips spaces and punctuation', () => {
    expect(normalizeText('海，風！刮 過')).toBe('海風刮過');
  });

  it('converts simplified to traditional', () => {
    expect(normalizeText('海风')).toBe('海風');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('calculateScore', () => {
  const correct = '海風刮過了無人的街道'; // 10 chars normalized

  it('perfect traditional Chinese answer scores 100 accuracy + speed bonus', () => {
    const result = calculateScore('海風刮過了無人的街道', correct, 5000, 30000);
    expect(result.accuracyScore).toBe(100);
    expect(result.speedBonus).toBe(41); // floor((1 - 5000/30000) * 50)
    expect(result.total).toBe(141);
  });

  it('perfect simplified Chinese answer scores same as traditional', () => {
    const result = calculateScore('海风刮过了无人的街道', correct, 5000, 30000);
    expect(result.accuracyScore).toBe(100);
  });

  it('partial answer (4/10 chars) scores 40 with no speed bonus below 60%', () => {
    const result = calculateScore('海風刮過', correct, 5000, 30000);
    expect(result.accuracyScore).toBe(40);
    expect(result.speedBonus).toBe(0); // accuracy < 60%
    expect(result.total).toBe(40);
  });

  it('empty answer scores 0', () => {
    const result = calculateScore('', correct, null, 30000);
    expect(result.accuracyScore).toBe(0);
    expect(result.speedBonus).toBe(0);
    expect(result.total).toBe(0);
  });

  it('speed bonus is 0 when submitted at end of timer', () => {
    const result = calculateScore('海風刮過了無人的街道', correct, 30000, 30000);
    expect(result.accuracyScore).toBe(100);
    expect(result.speedBonus).toBe(0);
  });

  it('accuracy exposed as a ratio', () => {
    const result = calculateScore('海風刮過了無人的街道', correct, 5000, 30000);
    expect(result.accuracy).toBeCloseTo(1.0);
  });
});

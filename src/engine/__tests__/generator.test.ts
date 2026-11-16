import { describe, expect, it } from 'vitest';
import { generatePhrases } from '../generator';
import { MODIFIER_ENTRIES, NOUN_ENTRIES } from '../lexiconNouns';
import { MODAL_ENTRIES } from '../lexiconParticles';
import { VERB_ENTRIES } from '../lexiconVerbs';
import {
  VALID_PINYIN_INITIALS,
  getWordInitials,
  parseUserString,
} from '../pinyinUtils';

const INITIAL_LIST = Array.from(VALID_PINYIN_INITIALS);

describe('SZM Lexicon & Pinyin Integrity', () => {
  it('ensures every lexicon entry has valid pinyin initials matching character count', () => {
    for (const n of NOUN_ENTRIES) {
      expect(n.initials.length).toBe(Array.from(n.word).length);
      for (const ch of n.initials) {
        expect(VALID_PINYIN_INITIALS.has(ch)).toBe(true);
      }
    }
    for (const v of VERB_ENTRIES) {
      expect(v.initials.length).toBe(Array.from(v.word).length);
      for (const ch of v.initials) {
        expect(VALID_PINYIN_INITIALS.has(ch)).toBe(true);
      }
    }
    for (const m of MODAL_ENTRIES) {
      expect(m.initials.length).toBe(1);
      expect(VALID_PINYIN_INITIALS.has(m.initials)).toBe(true);
    }
  });

  it('covers all 23 standard Hanyu Pinyin initials in 1-char animate nouns, transitive verbs, and modifiers', () => {
    for (const init of INITIAL_LIST) {
      const n1Animate = NOUN_ENTRIES.filter(
        (n) =>
          n.initials === init &&
          (n.tags.includes('person') || n.tags.includes('animal'))
      );
      const vt1 = VERB_ENTRIES.filter(
        (v) => v.initials === init && v.transitive
      );
      const mod1 = MODIFIER_ENTRIES.filter((m) => m.initials === init);

      expect(n1Animate.length, `Missing animate N1 for ${init}`).toBeGreaterThan(0);
      expect(vt1.length, `Missing VT1 for ${init}`).toBeGreaterThan(0);
      expect(mod1.length, `Missing MOD1 for ${init}`).toBeGreaterThan(0);
    }
  });
});

describe('Input Parsing & Validation', () => {
  it('validates string lengths strictly as 2 or 3', () => {
    expect(parseUserString('我').valid).toBe(false);
    expect(parseUserString('一心一意').valid).toBe(false);
    expect(parseUserString('a').valid).toBe(false);
    expect(parseUserString('abcd').valid).toBe(false);
    expect(parseUserString('12').valid).toBe(false);

    const p1 = parseUserString('周杰伦');
    expect(p1.valid).toBe(true);
    expect(p1.initials).toBe('zjl');

    const p2 = parseUserString('音乐');
    expect(p2.valid).toBe(true);
    expect(p2.initials).toBe('yy');

    const p3 = parseUserString('快乐');
    expect(p3.valid).toBe(true);
    expect(p3.initials).toBe('kl');

    const p4 = parseUserString('SZM');
    expect(p4.valid).toBe(true);
    expect(p4.initials).toBe('szm');
  });

  it('handles i/u/v mapping cleanly when enabled or rejects when disabled', () => {
    const mapped = parseUserString('iu', {}, true);
    expect(mapped.valid).toBe(true);
    expect(mapped.hasIUV).toBe(true);
    expect(mapped.initials).toBe('yw');

    const strict = parseUserString('iu', {}, false);
    expect(strict.valid).toBe(false);
  });
});

describe('Phrase Generation Quality & 100% Coverage', () => {
  it('generates natural phrases for classic & repo examples', () => {
    const cases: [string, string][] = [
      ['zjd', 'szm'],
      ['周杰伦', '昆凌'],
      ['春风', '晚星'],
      ['张三', '李四'],
      ['小猫', '奶茶'],
      ['摸鱼', '下班'],
    ];

    for (const [rawA, rawB] of cases) {
      const a = parseUserString(rawA);
      const b = parseUserString(rawB);
      const res = generatePhrases({ initA: a.initials, initB: b.initials, limit: 10 });
      expect(res.length).toBeGreaterThan(3);

      console.log(
        `[${rawA}(${a.initials}) + ${rawB}(${b.initials})] =>`,
        res.slice(0, 5).map((r) => `${r.text}(${r.initials}|${r.patternLabel})`).join(' / ')
      );

      for (const phrase of res) {
        const expected =
          phrase.order === 'AB'
            ? a.initials + b.initials
            : b.initials + a.initials;
        expect(phrase.initials).toBe(expected);
        expect(Array.from(phrase.text).length).toBe(expected.length);
        // 必须包含谓语
        expect(phrase.segments.some((s) => s.role === 'predicate')).toBe(true);
        // 至少包含主语或宾语
        expect(phrase.hasSubject || phrase.hasObject).toBe(true);
        // 逐段验证词级首字母精确一致
        const segInit = phrase.segments
          .map((seg) => getWordInitials(seg.word))
          .join('');
        expect(segInit).toBe(expected);
      }
    }
  });

  it('survives adversarial rare initial combinations (oo, ee, aa, rr, kq)', () => {
    const hardPairs: [string, string][] = [
      ['oo', 'oo'],
      ['ooo', 'ooo'],
      ['ee', 'oo'],
      ['aa', 'ee'],
      ['rr', 'oo'],
      ['kk', 'qq'],
      ['oe', 'ra'],
      ['aeo', 'roa'],
    ];

    for (const [initA, initB] of hardPairs) {
      const res = generatePhrases({ initA, initB, limit: 6 });
      expect(res.length, `Failed on ${initA}+${initB}`).toBeGreaterThan(0);
      console.log(
        `[HARD ${initA}+${initB}] =>`,
        res.slice(0, 3).map((r) => `${r.text}[${r.patternLabel}]`).join(' / ')
      );
    }
  });

  it('achieves 100% success across 300 deterministic pseudo-random 2-3 letter pairs', () => {
    let state = 42;
    const nextRand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    const randInitStr = (len: number) =>
      Array.from({ length: len }, () => INITIAL_LIST[nextRand() % INITIAL_LIST.length]).join('');

    for (let i = 0; i < 300; i++) {
      const lenA = (nextRand() % 2) + 2; // 2 or 3
      const lenB = (nextRand() % 2) + 2; // 2 or 3
      const a = randInitStr(lenA);
      const b = randInitStr(lenB);
      const res = generatePhrases({ initA: a, initB: b, limit: 5 });
      expect(res.length, `Empty result on random pair #${i}: ${a} + ${b}`).toBeGreaterThan(0);
      const top = res[0];
      expect([a + b, b + a]).toContain(top.initials);
    }
  });
});

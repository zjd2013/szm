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
      expect(m.initials.length).toBe(Array.from(m.word).length);
      for (const ch of m.initials) {
        expect(VALID_PINYIN_INITIALS.has(ch)).toBe(true);
      }
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

describe('Flexible Input Lengths (No 2-3 Restriction)', () => {
  it('accepts 1-char, 2-char, 3-char, 4-char, and longer strings', () => {
    expect(parseUserString('').valid).toBe(false);
    expect(parseUserString('123').valid).toBe(false);

    expect(parseUserString('我').valid).toBe(true);
    expect(parseUserString('a').valid).toBe(true);
    expect(parseUserString('一心一意').valid).toBe(true);
    expect(parseUserString('春风十里不如你').valid).toBe(true);
    expect(parseUserString('z j d s z m').initials).toBe('zjdszm');
  });
});

describe('Natural Fluency & Multi-Length Generation', () => {
  it('generates smooth, idiomatic phrases across short, medium, and long inputs', () => {
    const cases: [string, string][] = [
      ['我', '你'],             // 1 + 1 = 2
      ['我', '爱你'],           // 1 + 2 = 3
      ['周杰伦', '昆凌'],       // 3 + 2 = 5
      ['zjd', 'szm'],           // 3 + 3 = 6
      ['春风', '晚星'],         // 2 + 2 = 4
      ['张三', '李四'],         // 2 + 2 = 4
      ['小猫', '奶茶'],         // 2 + 2 = 4
      ['摸鱼', '下班'],         // 2 + 2 = 4
      ['今天', '不想上班'],     // 2 + 4 = 6
      ['春风十里', '桃花'],     // 4 + 2 = 6
      ['恭喜发财', '万事如意'], // 4 + 4 = 8
      ['今天天气真好', '出去吃顿火锅'], // 6 + 6 = 12
    ];

    for (const [rawA, rawB] of cases) {
      const a = parseUserString(rawA);
      const b = parseUserString(rawB);
      const res = generatePhrases({ initA: a.initials, initB: b.initials, limit: 8 });
      expect(res.length, `No result for ${rawA}+${rawB}`).toBeGreaterThan(0);

      console.log(
        `[${rawA}(${a.initials}) + ${rawB}(${b.initials})] =>`,
        res.slice(0, 5).map((r) => `${r.text}(${r.initials})`).join(' / ')
      );

      for (const phrase of res) {
        const expected =
          phrase.order === 'AB'
            ? a.initials + b.initials
            : b.initials + a.initials;
        expect(phrase.initials).toBe(expected);
        const segInit = phrase.segments
          .map((seg) => getWordInitials(seg.word))
          .join('');
        expect(segInit).toBe(expected);
      }
    }
  });

  it('covers 100% of all 23x23 = 529 single-character pairs (1+1 length=2)', () => {
    for (const c1 of INITIAL_LIST) {
      for (const c2 of INITIAL_LIST) {
        const res = generatePhrases({ initA: c1, initB: c2, limit: 2 });
        expect(res.length, `Failed 1+1 pair: ${c1}+${c2}`).toBeGreaterThan(0);
      }
    }
  });

  it('achieves 100% success across 250 random pairs of lengths 1 to 7 each', () => {
    let state = 20261116;
    const nextRand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    const randInitStr = (len: number) =>
      Array.from({ length: len }, () => INITIAL_LIST[nextRand() % INITIAL_LIST.length]).join('');

    for (let i = 0; i < 250; i++) {
      const lenA = (nextRand() % 7) + 1; // 1..7
      const lenB = (nextRand() % 7) + 1; // 1..7
      const a = randInitStr(lenA);
      const b = randInitStr(lenB);
      const res = generatePhrases({ initA: a, initB: b, limit: 4 });
      expect(res.length, `Empty on #${i}: ${a} + ${b}`).toBeGreaterThan(0);
      expect([a + b, b + a]).toContain(res[0].initials);
    }
  });
});

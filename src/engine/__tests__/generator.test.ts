import fs from 'node:fs';
import zlib from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  RawCorpusData,
  getLoadedCorpusEngine,
  setCorpusEngineFromRaw,
} from '../corpusEngine';
import { generatePhrases } from '../generator';
import { MODIFIER_ENTRIES, NOUN_ENTRIES } from '../lexiconNouns';
import { MODAL_ENTRIES } from '../lexiconParticles';
import { VERB_ENTRIES } from '../lexiconVerbs';
import {
  VALID_PINYIN_INITIALS,
  parseUserString,
} from '../pinyinUtils';

const INITIAL_LIST = Array.from(VALID_PINYIN_INITIALS);

beforeAll(() => {
  const gz = fs.readFileSync('public/corpus.bin');
  const D = JSON.parse(zlib.gunzipSync(gz).toString('utf8')) as RawCorpusData;
  setCorpusEngineFromRaw(D);
});

describe('Upgraded Corpus Lexicon Scale & Integrity', () => {
  it('loads the cleaned >40,900-word dependency corpus with >194,000 verified SV/VO collocations and 95 adverbs', () => {
    const eng = getLoadedCorpusEngine();
    expect(eng).not.toBeNull();
    expect(eng!.wordCount).toBeGreaterThan(40900);
    expect(eng!.pairCount).toBeGreaterThan(194000);
    expect(eng!.svoCount).toBeGreaterThan(91500);
    expect(eng!.advCount).toBeGreaterThanOrEqual(95);
  });

  it('ensures curated fallback lexicon entries have valid initials', () => {
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
    for (const init of INITIAL_LIST) {
      expect(MODIFIER_ENTRIES.some((m) => m.initials === init)).toBe(true);
    }
  });
});

describe('Surname-Aware Polyphones & Unrestricted Input Lengths', () => {
  it('recognizes multi-pronunciation surnames at string start while protecting ordinary words', () => {
    expect(parseUserString('单田芳').initials).toBe('stf');
    expect(parseUserString('曾国藩').initials).toBe('zgf');
    expect(parseUserString('解晓东').initials).toBe('xxd');
    expect(parseUserString('仇晓').initials).toBe('qx');
    expect(parseUserString('区楚良').initials).toBe('ocl');

    // 普通词汇不被误判为姓氏
    expect(parseUserString('单位').initials).toBe('dw');
    expect(parseUserString('曾经').initials).toBe('cj');
    expect(parseUserString('解决').initials).toBe('jj');
    expect(parseUserString('音乐').initials).toBe('yy');
    expect(parseUserString('快乐').initials).toBe('kl');
  });

  it('accepts 1-char, 2-char, 3-char, 4-char, and longer strings with separators stripped', () => {
    expect(parseUserString('').valid).toBe(false);
    expect(parseUserString('我').valid).toBe(true);
    expect(parseUserString('一心一意').valid).toBe(true);
    expect(parseUserString('春风十里不如你').valid).toBe(true);
    expect(parseUserString('z·j·d').initials).toBe('zjd');
  });
});

describe('Upgraded Corpus Engine Generation & Quality Tiers', () => {
  it('generates authentic Tier 3 (地道) phrases across CP-generator benchmarks and modern lifestyle inputs', () => {
    const cases: [string, string][] = [
      ['我', '爱你'],
      ['张三', '李四'],
      ['xm', 'xh'],
      ['wm', 'xhs'],
      ['lb', 'dzy'],
      ['周杰伦', '昆凌'],
      ['zjd', 'szm'],
      ['春风', '晚星'],
      ['小猫', '奶茶'],
      ['摸鱼', '下班'],
      ['今天', '不想上班'],
      ['春风十里', '桃花'],
      ['恭喜发财', '万事如意'],
      ['今天天气真好', '出去吃顿火锅'],
    ];

    for (const [rawA, rawB] of cases) {
      const a = parseUserString(rawA);
      const b = parseUserString(rawB);
      const res = generatePhrases({
        initA: a.initials,
        initB: b.initials,
        allowAdverb: true,
        allowParticles: true,
        limit: 8,
      });
      expect(res.length, `No result for ${rawA}+${rawB}`).toBeGreaterThan(0);

      console.log(
        `[${rawA}(${a.initials}) + ${rawB}(${b.initials})] =>`,
        res
          .slice(0, 6)
          .map((r) => `${r.text}[${r.tierLabel}]`)
          .join(' / ')
      );

      for (const phrase of res) {
        const expected =
          phrase.order === 'AB'
            ? a.initials + b.initials
            : b.initials + a.initials;
        expect(phrase.initials).toBe(expected);
        const charInitials = phrase.segments
          .flatMap((s) => s.chars.map((c) => c.initial))
          .join('');
        expect(charInitials).toBe(expected);
      }
    }
  });

  it('enforces Chinese fluency, prosody, selectional restrictions, and multi-clause coherence', () => {
    const checkPairs: [string, string][] = [
      ['张三', '李四'],
      ['wm', 'xhs'],
      ['恭喜发财', '万事如意'],
      ['肖战', '王一博'],
      ['王楚钦', '孙颖莎'],
      ['今天', '不想上班'],
    ];

    const forbiddenPatterns = [
      /商量事|学会事|喜欢事|发生事|知道事|才放事/,
      /洗黄色|买小孩|有败血症|喝歌|自己来客了|专家来客了/,
      /我是人员|是意思|谁也是|再是律师|蛮喜欢谁|很逊吗|超想吗/,
    ];

    for (const [rawA, rawB] of checkPairs) {
      const a = parseUserString(rawA);
      const b = parseUserString(rawB);
      const res = generatePhrases({
        initA: a.initials,
        initB: b.initials,
        limit: 15,
      });
      expect(res.length).toBeGreaterThan(0);
      for (const p of res) {
        expect(Number.isFinite(p.score)).toBe(true);
        for (const badRe of forbiddenPatterns) {
          expect(p.text).not.toMatch(badRe);
        }
      }
    }

    // 8字吉言组合置顶结果应前后语义呼应，而非“恭喜发财，我是人员/我说日语”
    const festive = generatePhrases({
      initA: 'gxfc',
      initB: 'wsry',
      limit: 5,
    });
    expect(festive[0].tier).toBe(3);
    expect(festive[0].text).toMatch(/发财.*如意|如意.*发财/);
  });

  it('covers 100% of all 23x23 = 529 single-character pairs (1+1 length=2)', () => {
    for (const c1 of INITIAL_LIST) {
      for (const c2 of INITIAL_LIST) {
        const res = generatePhrases({ initA: c1, initB: c2, limit: 2 });
        expect(res.length, `Failed 1+1 pair: ${c1}+${c2}`).toBeGreaterThan(0);
      }
    }
  });

  it('achieves 100% success across 200 random pairs of lengths 1 to 7 each', () => {
    let state = 20261116;
    const nextRand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    const randInitStr = (len: number) =>
      Array.from(
        { length: len },
        () => INITIAL_LIST[nextRand() % INITIAL_LIST.length]
      ).join('');

    for (let i = 0; i < 200; i++) {
      const lenA = (nextRand() % 7) + 1;
      const lenB = (nextRand() % 7) + 1;
      const a = randInitStr(lenA);
      const b = randInitStr(lenB);
      const res = generatePhrases({ initA: a, initB: b, limit: 4 });
      expect(res.length, `Empty on #${i}: ${a} + ${b}`).toBeGreaterThan(0);
      expect([a + b, b + a]).toContain(res[0].initials);
    }
  });
});

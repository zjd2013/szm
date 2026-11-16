import { ADVERB_ENTRIES, VERB_ENTRIES } from './lexiconVerbs';
import { MODAL_ENTRIES } from './lexiconParticles';
import { MODIFIER_ENTRIES, NOUN_ENTRIES } from './lexiconNouns';
import { getWordPinyinArray } from './pinyinUtils';
import {
  AnnotatedChar,
  GeneratedPhrase,
  ModalEntry,
  ModifierEntry,
  NounEntry,
  OrderFilter,
  PhraseSegment,
  SemTag,
  StructureFilter,
  StyleVibe,
  VerbEntry,
  VibeFilter,
} from './types';

// ==================== 索引构建 ====================
const nounsByInit = new Map<string, NounEntry[]>();
for (const n of NOUN_ENTRIES) {
  const arr = nounsByInit.get(n.initials) ?? [];
  arr.push(n);
  nounsByInit.set(n.initials, arr);
}
for (const arr of nounsByInit.values()) {
  arr.sort((a, b) => b.weight - a.weight);
}

const verbsByInit = new Map<string, VerbEntry[]>();
for (const v of VERB_ENTRIES) {
  const arr = verbsByInit.get(v.initials) ?? [];
  arr.push(v);
  verbsByInit.set(v.initials, arr);
}
for (const arr of verbsByInit.values()) {
  arr.sort((a, b) => b.weight - a.weight);
}

const modalsInitByChar = new Map<string, ModalEntry[]>();
const modalsEndByChar = new Map<string, ModalEntry[]>();
for (const m of MODAL_ENTRIES) {
  if (m.pos === 'init' || m.pos === 'both') {
    const arr = modalsInitByChar.get(m.initials) ?? [];
    arr.push(m);
    modalsInitByChar.set(m.initials, arr);
  }
  if (m.pos === 'end' || m.pos === 'both') {
    const arr = modalsEndByChar.get(m.initials) ?? [];
    arr.push(m);
    modalsEndByChar.set(m.initials, arr);
  }
}

const modifiersByChar = new Map<string, ModifierEntry[]>();
for (const mod of MODIFIER_ENTRIES) {
  const arr = modifiersByChar.get(mod.initials) ?? [];
  arr.push(mod);
  modifiersByChar.set(mod.initials, arr);
}

const adverbsByChar = new Map<string, typeof ADVERB_ENTRIES>();
for (const adv of ADVERB_ENTRIES) {
  const arr = adverbsByChar.get(adv.initials) ?? [];
  arr.push(adv);
  adverbsByChar.set(adv.initials, arr);
}

const ASPECT_PARTICLES: { word: string; init: string; wtBonus: number }[] = [
  { word: '了', init: 'l', wtBonus: 2 },
  { word: '着', init: 'z', wtBonus: 3 },
  { word: '过', init: 'g', wtBonus: 3 },
];

function hasIntersection(a: SemTag[], b: SemTag[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (b.includes(a[i])) return true;
  }
  return false;
}

function intersectTags(a: SemTag[], b: SemTag[]): SemTag[] {
  return a.filter((t) => b.includes(t));
}

// 缓存合成短语，避免重复计算
const nounCandCache = new Map<string, NounEntry[]>();
const vtCandCache = new Map<string, VerbEntry[]>();
const viCandCache = new Map<string, VerbEntry[]>();

function getNounCandidates(sub: string): NounEntry[] {
  const cached = nounCandCache.get(sub);
  if (cached) return cached;

  const lexical = nounsByInit.get(sub) ?? [];
  const results: NounEntry[] = [...lexical];
  const seenWords = new Set(lexical.map((x) => x.word));

  if (sub.length === 2 && results.length < 7) {
    const mods = modifiersByChar.get(sub[0]) ?? [];
    const heads = nounsByInit.get(sub[1]) ?? [];
    for (const mod of mods) {
      for (const h of heads) {
        if (h.isPronoun) continue;
        if (mod.word === h.word) continue;
        const shared = intersectTags(h.tags, mod.targetTags);
        if (shared.length === 0) continue;
        const w = mod.word + h.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          initials: sub,
          tags: shared,
          vibe: mod.vibe === 'funny' || h.vibe === 'funny' ? 'funny' : mod.vibe,
          weight: Math.round((mod.weight + h.weight) * 0.45),
          synthetic: true,
        });
      }
    }
  } else if (sub.length === 3 && results.length < 5) {
    const mods = modifiersByChar.get(sub[0]) ?? [];
    const heads2 = getNounCandidates(sub.slice(1));
    for (const mod of mods.slice(0, 3)) {
      for (const h2 of heads2.slice(0, 6)) {
        if (h2.isPronoun) continue;
        if (h2.word.includes(mod.word)) continue;
        const shared = intersectTags(h2.tags, mod.targetTags);
        if (shared.length === 0) continue;
        const w = mod.word + h2.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          initials: sub,
          tags: shared,
          vibe: h2.vibe,
          weight: Math.round((mod.weight + h2.weight) * 0.44),
          synthetic: true,
        });
      }
    }
  }

  results.sort((a, b) => b.weight - a.weight);
  const capped = results.slice(0, 14);
  nounCandCache.set(sub, capped);
  return capped;
}

function getVerbCandidates(sub: string, needTransitive: boolean): VerbEntry[] {
  const cache = needTransitive ? vtCandCache : viCandCache;
  const cached = cache.get(sub);
  if (cached) return cached;

  const lexical = (verbsByInit.get(sub) ?? []).filter((v) =>
    needTransitive ? v.transitive : v.intransitive
  );
  const results: VerbEntry[] = [...lexical];
  const seenWords = new Set(lexical.map((v) => v.word));

  if (sub.length === 2 && results.length < 6) {
    // 1) V1 + 动态助词（了/着/过），极自然汉语谓语
    const aspect = ASPECT_PARTICLES.find((p) => p.init === sub[1]);
    if (aspect) {
      const v1List = (verbsByInit.get(sub[0]) ?? []).filter((v) =>
        needTransitive ? v.transitive : v.intransitive
      );
      for (const v1 of v1List) {
        if (v1.word === aspect.word) continue;
        const w = v1.word + aspect.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          initials: sub,
          transitive: v1.transitive,
          intransitive: v1.intransitive,
          sTags: v1.sTags,
          oTags: v1.oTags,
          vibe: v1.vibe,
          weight: Math.min(92, v1.weight - 4 + aspect.wtBonus),
          synthetic: true,
        });
      }
    }

    // 2) ADV1 + V1（如：也爱、常看、独赏、偷吃、轻抚、狂啃）
    const advs = adverbsByChar.get(sub[0]) ?? [];
    const v1List = (verbsByInit.get(sub[1]) ?? []).filter((v) =>
      needTransitive ? v.transitive : v.intransitive
    );
    for (const adv of advs) {
      for (const v1 of v1List) {
        if (adv.word === v1.word) continue;
        const w = adv.word + v1.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          initials: sub,
          transitive: v1.transitive,
          intransitive: v1.intransitive,
          sTags: v1.sTags,
          oTags: v1.oTags,
          vibe: adv.vibe === 'funny' || v1.vibe === 'funny' ? 'funny' : adv.vibe,
          weight: Math.round((adv.weight + v1.weight) * 0.47),
          synthetic: true,
        });
      }
    }
  }

  results.sort((a, b) => b.weight - a.weight);
  const capped = results.slice(0, 14);
  cache.set(sub, capped);
  return capped;
}

interface TemplateSpec {
  mInit: 0 | 1;
  s: 0 | 1 | 2 | 3;
  v: 1 | 2;
  o: 0 | 1 | 2 | 3;
  mEnd: 0 | 1;
  rhythmBonus: number;
}

function getTemplatesForLength(len: number): TemplateSpec[] {
  const templates: TemplateSpec[] = [];
  const mInits: (0 | 1)[] = [0, 1];
  const mEnds: (0 | 1)[] = [0, 1];
  const sLens: (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];
  const vLens: (1 | 2)[] = [1, 2];
  const oLens: (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];

  for (const mInit of mInits) {
    for (const mEnd of mEnds) {
      if (mInit + mEnd > 1) continue; // 最多一个语气词，避免“哇...呀”冗余
      for (const s of sLens) {
        for (const v of vLens) {
          for (const o of oLens) {
            if (mInit + s + v + o + mEnd !== len) continue;
            if (s === 0 && o === 0) continue; // 至少包含主语或宾语之一，体现（主）谓（宾）结构

            // 汉语韵律自然度加分
            let rhythmBonus = 0;
            if (s > 0 && o > 0) {
              rhythmBonus += 14; // 完整主谓宾优先展示
              if (s === 2 && v === 2 && o === 2) rhythmBonus += 14; // 2+2+2 黄金律动（如 狮子瞄准鸡蛋）
              else if (s === 2 && v === 1 && o === 3) rhythmBonus += 12; // 2+1+3（如 少主买炸鸡店）
              else if (s === 3 && v === 1 && o === 2) rhythmBonus += 11; // 3+1+2
              else if (s === 2 && v === 1 && o === 2 && mInit + mEnd === 0) rhythmBonus += 11; // 2+1+2
              else if (s === 2 && v === 1 && o === 2) rhythmBonus += 8; // 2+1+2+语
              else if (s === 1 && v === 2 && o === 2 && mInit + mEnd === 0) rhythmBonus += 10; // 1+2+2
              else if (s === 1 && v === 2 && o === 2) rhythmBonus += 8; // 1+2+2+语
              else if (s === 2 && v === 2 && o === 1) rhythmBonus += 7; // 2+2+1
              else if (s === 1 && v === 2 && o === 1) rhythmBonus += 9; // 1+2+1
              else if (s === 1 && v === 1 && o === 2) rhythmBonus += 9; // 1+1+2
              else if (s === 2 && v === 1 && o === 1) rhythmBonus += 8; // 2+1+1
              else if (s === 1 && v === 1 && o === 1 && mEnd === 1) rhythmBonus += 10; // 1+1+1+语（如 我爱你呀）
            } else if (s > 0 && o === 0) {
              // 主 + 谓 (+ 语气词)
              if (s === 2 && v === 2) rhythmBonus += 10;
              else if (s === 3 && v === 2) rhythmBonus += 11;
              else if (v === 2 && mEnd === 1) rhythmBonus += 8;
            } else if (s === 0 && o > 0) {
              // 谓 + 宾 (+ 语气词)
              if (v === 2 && o === 2) rhythmBonus += 10;
              else if (v === 2 && o === 3) rhythmBonus += 10;
              else if (v === 1 && o === 2 && mEnd === 1) rhythmBonus += 8;
            }

            if (mEnd === 1) rhythmBonus += 1;
            if (mInit === 1) rhythmBonus -= 3;

            templates.push({ mInit, s, v, o, mEnd, rhythmBonus });
          }
        }
      }
    }
  }
  return templates;
}

// 确定性哈希微扰（用于“换一批”在保持高质量前提下轮换多样短语）
function hashJitter(str: string, seed: number): number {
  if (seed === 0) return 0;
  let h = 2166136261 ^ seed * 16777619;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 * 14 - 7; // [-7, +7]
}

const HERBIVORES = new Set(['兔', '鹿', '羊', '牛', '马', '兔子', '白兔', '小白兔', '白鹿', '麋鹿', '绵羊', '羔羊', '骏马', '白马']);
const MEAT_WORDS = new Set(['肉', '鱼', '虾', '蟹', '鸡', '鸭', '鹅', '小鱼', '龙虾', '小龙虾', '螃蟹', '章鱼', '烤肉', '烧烤', '炸鸡', '鸡腿', '牛排', '排骨', '红烧肉', '酸菜鱼', '鹅肉']);
const EAT_VERBS = new Set(['吃', '啃', '吞', '尝', '偷吃', '狂炫', '品尝']);

function hasDuplicateCharsAcrossWords(words: string[]): boolean {
  const seen = new Set<string>();
  for (const w of words) {
    // 单词内部叠字允许（如“星星”“猫咪”“妹妹”），跨成分重复字禁止（如“小猫摸猫咪”）
    const localChars = new Set(Array.from(w));
    for (const ch of localChars) {
      if (seen.has(ch)) return true;
    }
    for (const ch of localChars) {
      seen.add(ch);
    }
  }
  return false;
}

function decidePhraseVibe(vibes: StyleVibe[]): StyleVibe {
  if (vibes.includes('funny')) return 'funny';
  if (vibes.includes('poetic')) return 'poetic';
  return 'daily';
}

function formatPatternInfo(t: TemplateSpec): { code: string; label: string } {
  const codes: string[] = [];
  const labels: string[] = [];
  if (t.mInit) {
    codes.push('M');
    labels.push('语气词');
  }
  if (t.s) {
    codes.push('S');
    labels.push('主');
  }
  codes.push('V');
  labels.push('谓');
  if (t.o) {
    codes.push('O');
    labels.push('宾');
  }
  if (t.mEnd) {
    codes.push('M');
    labels.push('语气词');
  }
  return {
    code: codes.join(''),
    label: labels.join(' + '),
  };
}

interface RawCandidate {
  text: string;
  initials: string;
  order: 'AB' | 'BA';
  sourceSplitIndex: number;
  firstSource: 'A' | 'B';
  secondSource: 'A' | 'B';
  template: TemplateSpec;
  vibe: StyleVibe;
  score: number;
  sWord?: string;
  vWord: string;
  oWord?: string;
  mInitWord?: string;
  mEndWord?: string;
}

function generateForSequence(
  seq: string,
  order: 'AB' | 'BA',
  splitIndex: number,
  seed: number
): RawCandidate[] {
  const len = seq.length;
  const templates = getTemplatesForLength(len);
  const candidates: RawCandidate[] = [];
  const firstSource: 'A' | 'B' = order === 'AB' ? 'A' : 'B';
  const secondSource: 'A' | 'B' = order === 'AB' ? 'B' : 'A';

  for (const tpl of templates) {
    let pos = 0;
    const mInitSlice = tpl.mInit ? seq.slice(pos, (pos += tpl.mInit)) : '';
    const sSlice = tpl.s ? seq.slice(pos, (pos += tpl.s)) : '';
    const vSlice = seq.slice(pos, (pos += tpl.v));
    const oSlice = tpl.o ? seq.slice(pos, (pos += tpl.o)) : '';
    const mEndSlice = tpl.mEnd ? seq.slice(pos, (pos += tpl.mEnd)) : '';

    const mInitList: (ModalEntry | null)[] = tpl.mInit
      ? modalsInitByChar.get(mInitSlice) ?? []
      : [null];
    if (mInitList.length === 0) continue;

    const mEndList: (ModalEntry | null)[] = tpl.mEnd
      ? modalsEndByChar.get(mEndSlice) ?? []
      : [null];
    if (mEndList.length === 0) continue;

    const needVt = tpl.o > 0;
    const vList = getVerbCandidates(vSlice, needVt);
    if (vList.length === 0) continue;

    const sList: (NounEntry | null)[] = tpl.s
      ? getNounCandidates(sSlice)
      : [null];
    if (sList.length === 0) continue;

    const oList: (NounEntry | null)[] = tpl.o
      ? getNounCandidates(oSlice)
      : [null];
    if (oList.length === 0) continue;

    for (const v of vList.slice(0, 10)) {
      for (const s of sList.slice(0, 10)) {
        if (s && !hasIntersection(s.tags, v.sTags)) continue;

        for (const o of oList.slice(0, 10)) {
          if (o && !hasIntersection(o.tags, v.oTags)) continue;

          // 语义细粒度常识过滤
          if (s && o) {
            // 禁止同代词自反（如“我爱我”“你懂你”）
            if (s.isPronoun && o.isPronoun && s.word[0] === o.word[0]) continue;
            // 草食动物不吃肉类
            if (
              HERBIVORES.has(s.word) &&
              EAT_VERBS.has(v.word) &&
              MEAT_WORDS.has(o.word)
            ) {
              continue;
            }
          }

          for (const mI of mInitList.slice(0, 3)) {
            for (const mE of mEndList.slice(0, 4)) {
              const parts: string[] = [];
              const vibes: StyleVibe[] = [v.vibe];
              let totalWeight = v.weight;
              let partCount = 1;

              if (mI) {
                parts.push(mI.word);
                vibes.push(mI.vibe);
                totalWeight += mI.weight;
                partCount++;
              }
              if (s) {
                parts.push(s.word);
                vibes.push(s.vibe);
                totalWeight += s.weight;
                partCount++;
              }
              parts.push(v.word);
              if (o) {
                parts.push(o.word);
                vibes.push(o.vibe);
                totalWeight += o.weight;
                partCount++;
              }
              if (mE) {
                parts.push(mE.word);
                vibes.push(mE.vibe);
                totalWeight += mE.weight;
                partCount++;
              }

              if (hasDuplicateCharsAcrossWords(parts)) continue;

              const text = parts.join('');
              const avgWeight = totalWeight / partCount;

              // 原生多字词（非临时合成）成词度奖励
              let coherenceBonus = 0;
              if (s && !s.synthetic && s.initials.length >= 2) coherenceBonus += 3;
              if (!v.synthetic && v.initials.length >= 2) coherenceBonus += 3.5;
              if (o && !o.synthetic && o.initials.length >= 2) coherenceBonus += 3;

              // 风格一致性微调加分：文艺主语 + 文艺谓语 + 文艺宾语更惊艳
              if (s && o && s.vibe === v.vibe && v.vibe === o.vibe) {
                coherenceBonus += 3.5;
              } else if (s && s.vibe === v.vibe) {
                coherenceBonus += 1.5;
              }
              // 跨 A/B 边界刚好落在语法成分边界上时，读起来更有巧合感！
              let boundaryCursor = 0;
              for (const part of parts) {
                boundaryCursor += Array.from(part).length;
                if (boundaryCursor === splitIndex) {
                  coherenceBonus += 2.5;
                  break;
                }
              }

              const score =
                avgWeight +
                tpl.rhythmBonus +
                coherenceBonus +
                hashJitter(text + order, seed);

              candidates.push({
                text,
                initials: seq,
                order,
                sourceSplitIndex: splitIndex,
                firstSource,
                secondSource,
                template: tpl,
                vibe: decidePhraseVibe(vibes),
                score,
                sWord: s?.word,
                vWord: v.word,
                oWord: o?.word,
                mInitWord: mI?.word,
                mEndWord: mE?.word,
              });
            }
          }
        }
      }
    }
  }

  return candidates;
}

function hydrateCandidate(raw: RawCandidate, idx: number): GeneratedPhrase {
  const fullPinyins = getWordPinyinArray(raw.text);
  let cursor = 0;

  const makeSegment = (
    role: PhraseSegment['role'],
    roleLabel: PhraseSegment['roleLabel'],
    shortLabel: PhraseSegment['shortLabel'],
    word: string
  ): PhraseSegment => {
    const wChars = Array.from(word);
    const annotated: AnnotatedChar[] = wChars.map((ch) => {
      const i = cursor++;
      return {
        char: ch,
        pinyin: fullPinyins[i] || raw.initials[i],
        initial: raw.initials[i],
        source: i < raw.sourceSplitIndex ? raw.firstSource : raw.secondSource,
      };
    });
    return {
      role,
      roleLabel,
      shortLabel,
      word,
      chars: annotated,
    };
  };

  const segments: PhraseSegment[] = [];
  if (raw.mInitWord) {
    segments.push(makeSegment('modal_init', '语气词', '语', raw.mInitWord));
  }
  if (raw.sWord) {
    segments.push(makeSegment('subject', '主语', '主', raw.sWord));
  }
  segments.push(makeSegment('predicate', '谓语', '谓', raw.vWord));
  if (raw.oWord) {
    segments.push(makeSegment('object', '宾语', '宾', raw.oWord));
  }
  if (raw.mEndWord) {
    segments.push(makeSegment('modal_end', '语气词', '语', raw.mEndWord));
  }

  const { code, label } = formatPatternInfo(raw.template);

  return {
    id: `${raw.order}-${raw.text}-${idx}`,
    text: raw.text,
    initials: raw.initials,
    order: raw.order,
    orderLabel: raw.order === 'AB' ? '正序 A + B' : '交换 B + A',
    sourceSplitIndex: raw.sourceSplitIndex,
    firstSource: raw.firstSource,
    secondSource: raw.secondSource,
    patternCode: code,
    patternLabel: label,
    hasSubject: Boolean(raw.sWord),
    hasObject: Boolean(raw.oWord),
    hasModal: Boolean(raw.mInitWord || raw.mEndWord),
    vibe: raw.vibe,
    score: Math.round(raw.score * 10) / 10,
    segments,
  };
}

export interface GenerateOptions {
  initA: string;
  initB: string;
  orderFilter?: OrderFilter;
  structureFilter?: StructureFilter;
  vibeFilter?: VibeFilter;
  seed?: number;
  limit?: number;
}

export function generatePhrases(opts: GenerateOptions): GeneratedPhrase[] {
  const {
    initA,
    initB,
    orderFilter = 'all',
    structureFilter = 'all',
    vibeFilter = 'all',
    seed = 0,
    limit = 24,
  } = opts;

  if (!initA || !initB) return [];

  const seqAB = initA + initB;
  const seqBA = initB + initA;

  let pool: RawCandidate[] = [];
  if (orderFilter === 'all' || orderFilter === 'AB') {
    pool = pool.concat(generateForSequence(seqAB, 'AB', initA.length, seed));
  }
  if (
    (orderFilter === 'all' || orderFilter === 'BA') &&
    (seqBA !== seqAB || orderFilter === 'BA')
  ) {
    pool = pool.concat(generateForSequence(seqBA, 'BA', initB.length, seed));
  }

  // 结构过滤
  if (structureFilter === 'full_svo') {
    pool = pool.filter((c) => c.sWord && c.oWord);
  } else if (structureFilter === 'compact') {
    pool = pool.filter((c) => !c.sWord || !c.oWord);
  } else if (structureFilter === 'with_modal') {
    pool = pool.filter((c) => c.mInitWord || c.mEndWord);
  }

  // 风格过滤
  if (vibeFilter !== 'all') {
    pool = pool.filter((c) => c.vibe === vibeFilter);
  }

  // 按分数排序并去重同文本
  pool.sort((a, b) => b.score - a.score);

  const uniquePool: RawCandidate[] = [];
  const seenText = new Set<string>();
  for (const c of pool) {
    if (seenText.has(c.text)) continue;
    seenText.add(c.text);
    uniquePool.push(c);
  }

  // 多样性重排（MMR 思想）：避免前排全是同一个主语/谓语/宾语刷屏，同时兼顾 AB 与 BA 均衡
  const selected: RawCandidate[] = [];
  const sCount = new Map<string, number>();
  const vCount = new Map<string, number>();
  const oCount = new Map<string, number>();
  let abCount = 0;
  let baCount = 0;

  const remaining = uniquePool.slice(0, 350);

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestAdjusted = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let penalty = 0;
      if (c.sWord) penalty += (sCount.get(c.sWord) ?? 0) * 6.5;
      penalty += (vCount.get(c.vWord) ?? 0) * 7.5;
      if (c.oWord) penalty += (oCount.get(c.oWord) ?? 0) * 6.5;

      // 若用户选全部顺序且 seqAB !== seqBA，适当平衡正序与逆序出现比例
      if (orderFilter === 'all' && seqAB !== seqBA) {
        if (c.order === 'AB' && abCount > baCount + 2) penalty += 5;
        if (c.order === 'BA' && baCount > abCount + 2) penalty += 5;
      }

      const adjusted = c.score - penalty;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    selected.push(chosen);
    if (chosen.sWord) sCount.set(chosen.sWord, (sCount.get(chosen.sWord) ?? 0) + 1);
    vCount.set(chosen.vWord, (vCount.get(chosen.vWord) ?? 0) + 1);
    if (chosen.oWord) oCount.set(chosen.oWord, (oCount.get(chosen.oWord) ?? 0) + 1);
    if (chosen.order === 'AB') abCount++;
    else baCount++;
  }

  return selected.map((c, idx) => hydrateCandidate(c, idx));
}

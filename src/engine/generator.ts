import {
  ADVERB_ENTRIES,
  AdverbEntry,
  NATURAL_VO_PAIRS,
  NATURAL_VP_SET,
  VERB_ENTRIES,
} from './lexiconVerbs';
import { getLoadedCorpusEngine, TIER_META } from './corpusEngine';
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
const AUX_PREFIX_CHARS = new Set(['想', '爱', '去', '来', '快', '偷']);

const nounsByInit = new Map<string, NounEntry[]>();
for (const n of NOUN_ENTRIES) {
  const entry: NounEntry = { ...n, headWord: n.word };
  const arr = nounsByInit.get(entry.initials) ?? [];
  arr.push(entry);
  nounsByInit.set(entry.initials, arr);
}
for (const arr of nounsByInit.values()) {
  arr.sort((a, b) => b.weight - a.weight);
}

const verbsByInit = new Map<string, VerbEntry[]>();
for (const v of VERB_ENTRIES) {
  const coreVerb =
    v.word.length === 2 && AUX_PREFIX_CHARS.has(v.word[0])
      ? v.word[1]
      : v.word;
  const entry: VerbEntry = { ...v, coreVerb };
  const arr = verbsByInit.get(entry.initials) ?? [];
  arr.push(entry);
  verbsByInit.set(entry.initials, arr);
}
for (const arr of verbsByInit.values()) {
  arr.sort((a, b) => b.weight - a.weight);
}

const modalsInitByInit = new Map<string, ModalEntry[]>();
const modalsEndByInit = new Map<string, ModalEntry[]>();
for (const m of MODAL_ENTRIES) {
  if (m.pos === 'init' || m.pos === 'both') {
    const arr = modalsInitByInit.get(m.initials) ?? [];
    arr.push(m);
    modalsInitByInit.set(m.initials, arr);
  }
  if (m.pos === 'end' || m.pos === 'both') {
    const arr = modalsEndByInit.get(m.initials) ?? [];
    arr.push(m);
    modalsEndByInit.set(m.initials, arr);
  }
}

const modifiersByInit = new Map<string, ModifierEntry[]>();
for (const mod of MODIFIER_ENTRIES) {
  const arr = modifiersByInit.get(mod.initials) ?? [];
  arr.push(mod);
  modifiersByInit.set(mod.initials, arr);
}

const adverbsByInit = new Map<string, AdverbEntry[]>();
for (const adv of ADVERB_ENTRIES) {
  const arr = adverbsByInit.get(adv.initials) ?? [];
  arr.push(adv);
  adverbsByInit.set(adv.initials, arr);
}

const ASPECT_PARTICLES: { word: string; init: string; wtBonus: number }[] = [
  { word: '了', init: 'l', wtBonus: 3 },
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

const nounCandCache = new Map<string, NounEntry[]>();
const vtCandCache = new Map<string, VerbEntry[]>();
const viCandCache = new Map<string, VerbEntry[]>();

function getNounCandidates(sub: string): NounEntry[] {
  const cached = nounCandCache.get(sub);
  if (cached) return cached;

  const lexical = nounsByInit.get(sub) ?? [];
  const results: NounEntry[] = [...lexical];
  const seenWords = new Set(lexical.map((x) => x.word));

  const tryCombineModHead = (
    mods: ModifierEntry[],
    heads: NounEntry[],
    factor: number,
    isNaturalPrefix: boolean
  ) => {
    for (const mod of mods) {
      for (const h of heads) {
        if (h.isPronoun) continue;
        if (h.word.includes(mod.word) || mod.word.includes(h.word)) continue;
        const shared = intersectTags(h.tags, mod.targetTags);
        if (shared.length === 0) continue;
        const w = mod.word + h.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          headWord: h.headWord ?? h.word,
          initials: sub,
          tags: shared,
          vibe: mod.vibe === 'funny' || h.vibe === 'funny' ? 'funny' : mod.vibe,
          weight: Math.round((mod.weight + h.weight) * factor),
          synthetic: !isNaturalPrefix,
        });
      }
    }
  };

  if (sub.length === 2 && results.length < 7) {
    // 1字定语 + 1字核心名词（如：热茶、冰水、小猫、胖猪、白鸥）
    const mods1 = modifiersByInit.get(sub[0]) ?? [];
    const heads1 = nounsByInit.get(sub[1]) ?? [];
    tryCombineModHead(mods1, heads1, 0.46, false);
  } else if (sub.length === 3) {
    // 优先：2字自然数量/领属定语 + 1字名词（如：一杯茶、一碗面、一只猫、我家猫）
    const mods2 = modifiersByInit.get(sub.slice(0, 2)) ?? [];
    const heads1 = nounsByInit.get(sub[2]) ?? [];
    tryCombineModHead(mods2, heads1, 0.49, true);

    // 其次：1字定语 + 2字词典名词（如：热奶茶、冰西瓜、小考拉）
    if (results.length < 8) {
      const mods1 = (modifiersByInit.get(sub[0]) ?? []).slice(0, 4);
      const heads2 = getNounCandidates(sub.slice(1)).slice(0, 8);
      tryCombineModHead(mods1, heads2, 0.45, false);
    }
  } else if (sub.length === 4) {
    // 2字自然数量/形容定语 + 2字词典名词（如：一杯奶茶、一顿火锅、我家小猫、冰镇西瓜）
    const mods2 = modifiersByInit.get(sub.slice(0, 2)) ?? [];
    const heads2 = (nounsByInit.get(sub.slice(2)) ?? []).slice(0, 10);
    tryCombineModHead(mods2, heads2, 0.495, true);

    if (results.length < 5) {
      const mods1 = (modifiersByInit.get(sub[0]) ?? []).slice(0, 3);
      const heads3 = (nounsByInit.get(sub.slice(1)) ?? []).slice(0, 8);
      tryCombineModHead(mods1, heads3, 0.46, false);
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

  const addAdvVerb = (
    advs: AdverbEntry[],
    verbs: VerbEntry[],
    factor: number,
    naturalFluent: boolean
  ) => {
    for (const adv of advs) {
      for (const v of verbs) {
        if (adv.psychOnly && !v.psych) continue;
        if (v.word.includes(adv.word) || adv.word.includes(v.word)) continue;
        const sTags: SemTag[] = adv.humanOnly
          ? intersectTags(v.sTags, ['person'])
          : v.sTags;
        if (sTags.length === 0) continue;
        const w = adv.word + v.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          coreVerb: v.coreVerb ?? v.word,
          initials: sub,
          transitive: v.transitive,
          intransitive: v.intransitive,
          sTags,
          oTags: v.oTags,
          vibe: adv.vibe === 'funny' || v.vibe === 'funny' ? 'funny' : v.vibe,
          weight: Math.round((adv.weight + v.weight) * factor),
          psych: v.psych,
          synthetic: !naturalFluent,
        });
      }
    }
  };

  if (sub.length === 2) {
    // 1) V1 + 了/着/过（吃了、看着、爱过、睡了）
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
          coreVerb: v1.coreVerb ?? v1.word,
          initials: sub,
          transitive: v1.transitive,
          intransitive: v1.intransitive,
          sTags: v1.sTags,
          oTags: v1.oTags,
          vibe: v1.vibe,
          weight: Math.min(96, v1.weight - 2 + aspect.wtBonus),
        });
      }
    }

    // 2) 1字高频助动/副词 + 1字核心动词（如：想吹、最懂、再送、别哭、也爱、要吃）
    if (results.length < 10) {
      const advs1 = (adverbsByInit.get(sub[0]) ?? []).slice(0, 6);
      const v1List = (verbsByInit.get(sub[1]) ?? [])
        .filter((v) => (needTransitive ? v.transitive : v.intransitive))
        .slice(0, 8);
      addAdvVerb(advs1, v1List, 0.49, true);
    }
  } else if (sub.length === 3) {
    // 1) 2字状语/连动 + 1字动词（如：快来追、下班吃、不想去、一起看、偷偷买）
    const advs2 = (adverbsByInit.get(sub.slice(0, 2)) ?? []).slice(0, 6);
    const v1List = (verbsByInit.get(sub[2]) ?? [])
      .filter((v) => (needTransitive ? v.transitive : v.intransitive))
      .slice(0, 8);
    addAdvVerb(advs2, v1List, 0.495, true);

    // 2) 1字助动/副词 + 2字核心动词（如：最喜欢、很想念、想下班、要发财、去逛街）
    const advs1 = (adverbsByInit.get(sub[0]) ?? []).slice(0, 6);
    const v2List = (verbsByInit.get(sub.slice(1)) ?? [])
      .filter((v) => (needTransitive ? v.transitive : v.intransitive))
      .slice(0, 8);
    addAdvVerb(advs1, v2List, 0.495, true);

    // 3) 2字动词 + 了/过（如：下班了、喜欢过、睡着了）
    const aspect = ASPECT_PARTICLES.find((p) => p.init === sub[2]);
    if (aspect) {
      const v2Base = (verbsByInit.get(sub.slice(0, 2)) ?? [])
        .filter((v) => (needTransitive ? v.transitive : v.intransitive))
        .slice(0, 6);
      for (const v2 of v2Base) {
        if (v2.word.includes(aspect.word)) continue;
        const w = v2.word + aspect.word;
        if (seenWords.has(w)) continue;
        seenWords.add(w);
        results.push({
          word: w,
          coreVerb: v2.coreVerb ?? v2.word,
          initials: sub,
          transitive: v2.transitive,
          intransitive: v2.intransitive,
          sTags: v2.sTags,
          oTags: v2.oTags,
          vibe: v2.vibe,
          weight: Math.min(97, v2.weight - 1),
        });
      }
    }
  } else if (sub.length === 4) {
    // 2字时间/状态状语 + 2字核心动词（如：不想上班、下班摸鱼、周末逛街、一起看海、偷偷喜欢）
    const advs2 = (adverbsByInit.get(sub.slice(0, 2)) ?? []).slice(0, 6);
    const v2List = (verbsByInit.get(sub.slice(2)) ?? [])
      .filter((v) => (needTransitive ? v.transitive : v.intransitive))
      .slice(0, 8);
    addAdvVerb(advs2, v2List, 0.5, true);
  }

  results.sort((a, b) => b.weight - a.weight);
  const capped = results.slice(0, 14);
  cache.set(sub, capped);
  return capped;
}

interface TemplateSpec {
  mInit: number;
  s: number;
  v: number;
  o: number;
  mEnd: number;
  rhythmBonus: number;
}

const templateCache = new Map<number, TemplateSpec[]>();

function getSingleClauseTemplates(len: number): TemplateSpec[] {
  const cached = templateCache.get(len);
  if (cached) return cached;

  const templates: TemplateSpec[] = [];

  if (len === 2) {
    templates.push(
      { mInit: 0, s: 1, v: 1, o: 0, mEnd: 0, rhythmBonus: 12 }, // 你笑、猫睡
      { mInit: 0, s: 0, v: 1, o: 1, rhythmBonus: 14, mEnd: 0 }, // 看海、喝茶、想你
      { mInit: 0, s: 0, v: 2, o: 0, mEnd: 0, rhythmBonus: 13 }, // 下班、摸鱼、发财
      { mInit: 0, s: 0, v: 1, o: 0, mEnd: 1, rhythmBonus: 10 }  // 走吧、来呀
    );
    templateCache.set(len, templates);
    return templates;
  }

  const mInits = len >= 5 ? [0, 1, 2] : [0, 1];
  const mEnds = len >= 5 ? [0, 1, 2] : [0, 1];
  const maxNP = Math.min(4, len - 1);
  const maxVP = Math.min(4, len - 1);

  for (const mInit of mInits) {
    for (const mEnd of mEnds) {
      if (mInit > 0 && mEnd > 0 && len < 7) continue;
      for (let s = 0; s <= maxNP; s++) {
        for (let v = 1; v <= maxVP; v++) {
          const o = len - mInit - s - v - mEnd;
          if (o < 0 || o > maxNP) continue;
          if (s === 0 && o === 0 && v < 2) continue;

          let rhythmBonus = 0;
          if (s > 0 && o > 0) {
            rhythmBonus += 13;
            // 鼓励现代汉语顺畅的双音节/助动韵律，抑制全单字硬拼
            if (s >= 2 && v >= 2 && o >= 2) rhythmBonus += 13;
            else if (s === 1 && v >= 2 && o >= 2) rhythmBonus += 12; // 我想吃火锅 / 我最喜欢你
            else if (s >= 2 && v === 1 && o >= 2) rhythmBonus += 11; // 小猫吃小鱼
            else if (s === 1 && v === 1 && o >= 2) rhythmBonus += 10; // 我想炒饭 / 你吃小面
            else if (s >= 2 && v >= 2 && o === 1) rhythmBonus += 9;  // 咱家来客啦
            else if (s === 1 && v >= 2 && o === 1) rhythmBonus += 10; // 我喜欢你
            else if (s === 2 && v === 1 && o === 1) rhythmBonus += 8;  // 老师找书
            else if (s === 1 && v === 1 && o === 1) rhythmBonus += 9;  // 我爱你
          } else if (s > 0 && o === 0) {
            if (v >= 2 && s >= 2) rhythmBonus += 19; // 今天不想上班 / 万事如意 / 春风微醺
            else if (s === 1 && v >= 2) rhythmBonus += 17; // 我想下班 / 哥想发财
            else rhythmBonus += 6;
          } else if (s === 0 && o > 0) {
            if (v >= 2 && o >= 2) rhythmBonus += 16; // 想买奶茶 / 快来追锦鲤
            else if (v === 1 && o >= 2) rhythmBonus += 11; // 喝奶茶吧
            else rhythmBonus += 6;
          } else {
            // 省略主宾的复合谓语短句（如：下班摸鱼、恭喜发财、一起看海）
            rhythmBonus += v >= 4 ? 18 : 13;
          }

          if (mInit === 2) rhythmBonus += 4; // “其实/原来/听说”十分口语自然
          if (mInit === 1) rhythmBonus -= 3;
          if (mEnd === 2) rhythmBonus += 3;  // “好吗/对吧/的呀”
          if (mEnd === 1) rhythmBonus += 1;

          templates.push({ mInit, s, v, o, mEnd, rhythmBonus });
        }
      }
    }
  }

  templateCache.set(len, templates);
  return templates;
}

function hashJitter(str: string, seed: number): number {
  if (seed === 0) return 0;
  let h = 2166136261 ^ (seed * 16777619);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000) * 14 - 7;
}

const HERBIVORES = new Set([
  '兔', '鹿', '羊', '牛', '马', '兔子', '白鹿', '小鹿', '绵羊', '白马', '小白兔',
]);
const MEAT_WORDS = new Set([
  '肉', '鱼', '虾', '蟹', '鸡', '鸭', '鹅', '小鱼', '小龙虾', '烤肉', '烧烤', '炸鸡',
  '烤鱼', '烤串', '鸡腿', '鸡翅', '牛肉', '排骨', '牛排', '红烧肉', '酸菜鱼',
]);
const EAT_VERBS = new Set(['吃', '啃', '吞', '尝', '偷吃', '狂炫', '品尝']);

function hasDuplicateCharsAcrossWords(words: string[]): boolean {
  const seen = new Set<string>();
  for (const w of words) {
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

interface RawPart {
  role: PhraseSegment['role'];
  roleLabel: PhraseSegment['roleLabel'];
  shortLabel: PhraseSegment['shortLabel'];
  word: string;
  clauseBreakAfter?: boolean;
}

interface RawCandidate {
  plainChars: string;
  displayText: string;
  initials: string;
  order: 'AB' | 'BA';
  sourceSplitIndex: number;
  firstSource: 'A' | 'B';
  secondSource: 'A' | 'B';
  patternCode: string;
  patternLabel: string;
  hasSubject: boolean;
  hasObject: boolean;
  hasModal: boolean;
  vibe: StyleVibe;
  score: number;
  parts: RawPart[];
  sKey?: string;
  vKey: string;
  oKey?: string;
}

function generateSingleClause(
  seq: string,
  order: 'AB' | 'BA',
  splitIndex: number,
  seed: number
): RawCandidate[] {
  const len = seq.length;
  if (len < 2 || len > 11) return [];

  const templates = getSingleClauseTemplates(len);
  const candidates: RawCandidate[] = [];
  const firstSource: 'A' | 'B' = order === 'AB' ? 'A' : 'B';
  const secondSource: 'A' | 'B' = order === 'AB' ? 'B' : 'A';

  // 当模板很多（如 7~10 字）时，限制每槽位枚举深度保证毫秒级响应
  const slotCap = len >= 8 ? 5 : len >= 6 ? 7 : 10;

  for (const tpl of templates) {
    let pos = 0;
    const mInitSlice = tpl.mInit ? seq.slice(pos, (pos += tpl.mInit)) : '';
    const sSlice = tpl.s ? seq.slice(pos, (pos += tpl.s)) : '';
    const vSlice = seq.slice(pos, (pos += tpl.v));
    const oSlice = tpl.o ? seq.slice(pos, (pos += tpl.o)) : '';
    const mEndSlice = tpl.mEnd ? seq.slice(pos, (pos += tpl.mEnd)) : '';

    const mInitList: (ModalEntry | null)[] = tpl.mInit
      ? (modalsInitByInit.get(mInitSlice) ?? []).slice(0, 4)
      : [null];
    if (mInitList.length === 0) continue;

    const mEndList: (ModalEntry | null)[] = tpl.mEnd
      ? (modalsEndByInit.get(mEndSlice) ?? []).slice(0, 4)
      : [null];
    if (mEndList.length === 0) continue;

    const needVt = tpl.o > 0;
    const vList = getVerbCandidates(vSlice, needVt).slice(0, slotCap);
    if (vList.length === 0) continue;

    const sList: (NounEntry | null)[] = tpl.s
      ? getNounCandidates(sSlice).slice(0, slotCap)
      : [null];
    if (sList.length === 0) continue;

    const oList: (NounEntry | null)[] = tpl.o
      ? getNounCandidates(oSlice)
          .filter((n) => !n.subjectOnly)
          .slice(0, slotCap)
      : [null];
    if (oList.length === 0) continue;

    for (const v of vList) {
      for (const s of sList) {
        if (s && !hasIntersection(s.tags, v.sTags)) continue;

        for (const o of oList) {
          if (o && !hasIntersection(o.tags, v.oTags)) continue;

          if (s && o) {
            if (s.isPronoun && o.isPronoun && s.word[0] === o.word[0]) continue;
            const sHead = s.headWord ?? s.word;
            const oHead = o.headWord ?? o.word;
            const vCore = v.coreVerb ?? v.word;
            if (
              HERBIVORES.has(sHead) &&
              EAT_VERBS.has(vCore) &&
              MEAT_WORDS.has(oHead)
            ) {
              continue;
            }
          }

          for (const mI of mInitList) {
            for (const mE of mEndList) {
              const wordList: string[] = [];
              const parts: RawPart[] = [];
              const vibes: StyleVibe[] = [v.vibe];
              let weightedCharSum = v.weight * tpl.v;

              if (mI) {
                wordList.push(mI.word);
                parts.push({
                  role: 'modal_init',
                  roleLabel: '语气词',
                  shortLabel: '语',
                  word: mI.word,
                });
                vibes.push(mI.vibe);
                weightedCharSum += mI.weight * tpl.mInit;
              }
              if (s) {
                wordList.push(s.word);
                parts.push({
                  role: 'subject',
                  roleLabel: '主语',
                  shortLabel: '主',
                  word: s.word,
                });
                vibes.push(s.vibe);
                weightedCharSum += s.weight * tpl.s;
              }
              wordList.push(v.word);
              parts.push({
                role: 'predicate',
                roleLabel: '谓语',
                shortLabel: '谓',
                word: v.word,
              });
              if (o) {
                wordList.push(o.word);
                parts.push({
                  role: 'object',
                  roleLabel: '宾语',
                  shortLabel: '宾',
                  word: o.word,
                });
                vibes.push(o.vibe);
                weightedCharSum += o.weight * tpl.o;
              }
              if (mE) {
                wordList.push(mE.word);
                parts.push({
                  role: 'modal_end',
                  roleLabel: '语气词',
                  shortLabel: '语',
                  word: mE.word,
                });
                vibes.push(mE.vibe);
                weightedCharSum += mE.weight * tpl.mEnd;
              }

              if (hasDuplicateCharsAcrossWords(wordList)) continue;

              const avgWeight = weightedCharSum / len;
              let fluencyBonus = 0;

              // 1) 母语级固定动宾/复合谓语惯用搭配奖励（如“吃饭”“买奶茶”“不想上班”“恭喜发财”）
              if (o) {
                const vCore = v.coreVerb ?? v.word;
                const oHead = o.headWord ?? o.word;
                if (
                  NATURAL_VO_PAIRS.has(vCore + oHead) ||
                  NATURAL_VO_PAIRS.has(v.word + o.word)
                ) {
                  fluencyBonus += 12;
                }
              } else if (NATURAL_VP_SET.has(v.word)) {
                fluencyBonus += 12;
              }

              // 2) 原生多字词成词奖励，抑制临时硬凑的偏正合成词
              if (s && !s.synthetic && tpl.s >= 2) fluencyBonus += 3.5;
              if (!v.synthetic && tpl.v >= 2) fluencyBonus += 4;
              if (o && !o.synthetic && tpl.o >= 2) fluencyBonus += 3.5;
              if (s?.synthetic) fluencyBonus -= 5;
              if (o?.synthetic) fluencyBonus -= 5;

              // 3) 风格协调度
              if (s && o && s.vibe === v.vibe && v.vibe === o.vibe) {
                fluencyBonus += 3;
              } else if (s && !o && s.vibe === v.vibe) {
                fluencyBonus += 3;
              }

              // 4) A/B 拼接分界刚好落在词语边界上更顺畅
              let cursor = 0;
              for (const w of wordList) {
                cursor += Array.from(w).length;
                if (cursor === splitIndex) {
                  fluencyBonus += 2.5;
                  break;
                }
              }

              const plainChars = wordList.join('');
              const codes: string[] = [];
              const labels: string[] = [];
              if (mI) {
                codes.push('M');
                labels.push('语气词');
              }
              if (s) {
                codes.push('S');
                labels.push('主');
              }
              codes.push('V');
              labels.push('谓');
              if (o) {
                codes.push('O');
                labels.push('宾');
              }
              if (mE) {
                codes.push('M');
                labels.push('语气词');
              }

              const score =
                avgWeight +
                tpl.rhythmBonus +
                fluencyBonus +
                hashJitter(plainChars + order, seed);

              candidates.push({
                plainChars,
                displayText: plainChars,
                initials: seq,
                order,
                sourceSplitIndex: splitIndex,
                firstSource,
                secondSource,
                patternCode: codes.join(''),
                patternLabel: labels.join(' + '),
                hasSubject: Boolean(s),
                hasObject: Boolean(o),
                hasModal: Boolean(mI || mE),
                vibe: decidePhraseVibe(vibes),
                score,
                parts,
                sKey: s?.headWord ?? s?.word,
                vKey: v.coreVerb ?? v.word,
                oKey: o?.headWord ?? o?.word,
              });
            }
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// 针对中长及超长输入（6~24字），支持分句对仗与多句连贯组合，100% 覆盖任意声母长度
function mergeTwoClauses(
  left: RawCandidate,
  right: RawCandidate,
  seq: string,
  order: 'AB' | 'BA',
  splitIndex: number,
  bonus: number
): RawCandidate {
  const firstSource: 'A' | 'B' = order === 'AB' ? 'A' : 'B';
  const secondSource: 'A' | 'B' = order === 'AB' ? 'B' : 'A';
  const k = left.initials.length;
  const rLen = right.initials.length;
  const len = k + rLen;

  const leftParts = left.parts.map((p, idx) =>
    idx === left.parts.length - 1 ? { ...p, clauseBreakAfter: true } : p
  );
  const mergedParts = [...leftParts, ...right.parts];
  const combinedScore = (left.score * k + right.score * rLen) / len + bonus;

  const isMulti =
    left.patternCode.includes('+') || right.patternCode.includes('+');

  return {
    plainChars: left.plainChars + right.plainChars,
    displayText: `${left.displayText}，${right.displayText}`,
    initials: seq,
    order,
    sourceSplitIndex: splitIndex,
    firstSource,
    secondSource,
    patternCode: isMulti ? 'MULTI' : `${left.patternCode}+${right.patternCode}`,
    patternLabel: isMulti
      ? '多句连贯（主）谓（宾）'
      : `${left.patternLabel} ， ${right.patternLabel}`,
    hasSubject: left.hasSubject && right.hasSubject,
    hasObject: left.hasObject && right.hasObject,
    hasModal: left.hasModal || right.hasModal,
    vibe: decidePhraseVibe([left.vibe, right.vibe]),
    score: combinedScore,
    parts: mergedParts,
    sKey: left.sKey ?? right.sKey,
    vKey: `${left.vKey}+${right.vKey}`,
    oKey: right.oKey ?? left.oKey,
  };
}

function generateMultiClause(
  seq: string,
  order: 'AB' | 'BA',
  splitIndex: number,
  seed: number,
  isFallbackForMedium = false
): RawCandidate[] {
  const len = seq.length;
  if (len < 6) return [];

  const results: RawCandidate[] = [];
  const mid = Math.floor(len / 2);
  const candidateSplits = new Set<number>();

  for (const k of [splitIndex, mid, len - mid, mid - 1, mid + 1, 4, len - 4, 3, len - 3]) {
    if (k >= 3 && len - k >= 3) {
      candidateSplits.add(k);
    }
  }

  for (const k of candidateSplits) {
    const leftSeq = seq.slice(0, k);
    const rightSeq = seq.slice(k);

    let leftPool = generateSingleClause(leftSeq, order, k, seed).slice(0, 10);
    if (leftPool.length === 0 && k >= 6) {
      leftPool = generateMultiClause(leftSeq, order, Math.floor(k / 2), seed, true).slice(0, 6);
    }

    let rightPool = generateSingleClause(rightSeq, order, len - k, seed).slice(0, 10);
    if (rightPool.length === 0 && len - k >= 6) {
      rightPool = generateMultiClause(
        rightSeq,
        order,
        Math.floor((len - k) / 2),
        seed,
        true
      ).slice(0, 6);
    }

    const baseBonus = isFallbackForMedium
      ? -4
      : k === len - k
        ? 4
        : k === splitIndex
          ? 4
          : 1;

    for (const left of leftPool) {
      for (const right of rightPool) {
        if (hasDuplicateCharsAcrossWords([left.plainChars, right.plainChars])) {
          // 超长句（>=14字）允许跨分句偶发重字保底，短句严格去重
          if (len < 14) continue;
        }
        results.push(
          mergeTwoClauses(left, right, seq, order, splitIndex, baseBonus)
        );
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 80);
}

function generateForSequence(
  seq: string,
  order: 'AB' | 'BA',
  splitIndex: number,
  seed: number
): RawCandidate[] {
  const single = generateSingleClause(seq, order, splitIndex, seed);
  if (seq.length >= 8) {
    const multi = generateMultiClause(seq, order, splitIndex, seed, false);
    return [...single, ...multi];
  }
  if (seq.length >= 6 && single.length < 8) {
    const fallbackMulti = generateMultiClause(seq, order, splitIndex, seed, true);
    return [...single, ...fallbackMulti];
  }
  return single;
}

function hydrateCandidate(raw: RawCandidate, idx: number): GeneratedPhrase {
  const fullPinyins = getWordPinyinArray(raw.plainChars);
  let cursor = 0;

  const segments: PhraseSegment[] = raw.parts.map((p) => {
    const wChars = Array.from(p.word);
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
      role: p.role,
      roleLabel: p.roleLabel,
      shortLabel: p.shortLabel,
      word: p.word,
      chars: annotated,
      clauseBreakAfter: p.clauseBreakAfter,
    };
  });

  const tier = raw.score >= 125 ? 3 : raw.score >= 108 ? 2 : 1;
  return {
    id: `${raw.order}-${raw.plainChars}-${idx}`,
    text: raw.displayText,
    initials: raw.initials,
    order: raw.order,
    orderLabel: raw.order === 'AB' ? '正序 A + B' : '交换 B + A',
    sourceSplitIndex: raw.sourceSplitIndex,
    firstSource: raw.firstSource,
    secondSource: raw.secondSource,
    patternCode: raw.patternCode,
    patternLabel: raw.patternLabel,
    hasSubject: raw.hasSubject,
    hasObject: raw.hasObject,
    hasModal: raw.hasModal,
    tier,
    tierLabel: TIER_META[tier].label,
    tierDesc: TIER_META[tier].desc,
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
  allowParticles?: boolean;
  allowAdverb?: boolean;
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
    allowParticles = true,
    allowAdverb = true,
    seed = 0,
    limit = 24,
  } = opts;

  if (!initA || !initB) return [];

  // 1) 优先调用升级版 4.09万词 + 19.6万依存搭配统计语料引擎
  const corpusEng = getLoadedCorpusEngine();
  if (corpusEng) {
    const corpusResults = corpusEng.generate({
      initA,
      initB,
      orderFilter,
      structureFilter,
      vibeFilter,
      allowParticles,
      allowAdverb,
      seed,
      limit,
    });
    if (corpusResults.length >= Math.min(limit, 6)) {
      return corpusResults;
    }
    // 极端刁钻组合（如全 o/e）由下方全声母规则引擎补充保底
    const fallback = generateRuleBasedPhrases(opts);
    const seen = new Set(corpusResults.map((r) => r.text.replace(/，/g, '')));
    for (const f of fallback) {
      if (corpusResults.length >= limit) break;
      const plain = f.text.replace(/，/g, '');
      if (seen.has(plain)) continue;
      seen.add(plain);
      corpusResults.push({
        ...f,
        tier: 0,
        tierLabel: TIER_META[0].label,
        tierDesc: TIER_META[0].desc,
      });
    }
    return corpusResults;
  }

  return generateRuleBasedPhrases(opts);
}

function generateRuleBasedPhrases(opts: GenerateOptions): GeneratedPhrase[] {
  const {
    initA,
    initB,
    orderFilter = 'all',
    structureFilter = 'all',
    vibeFilter = 'all',
    allowParticles = true,
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

  if (!allowParticles) {
    pool = pool.filter((c) => !c.hasModal);
  }

  if (structureFilter === 'full_svo' || structureFilter === 'SVO') {
    pool = pool.filter((c) => c.hasSubject && c.hasObject);
  } else if (structureFilter === 'SV') {
    pool = pool.filter((c) => c.hasSubject && !c.hasObject);
  } else if (structureFilter === 'VO') {
    pool = pool.filter((c) => !c.hasSubject && c.hasObject);
  } else if (structureFilter === 'V') {
    pool = pool.filter((c) => !c.hasSubject && !c.hasObject);
  } else if (structureFilter === 'compact') {
    pool = pool.filter((c) => !c.hasSubject || !c.hasObject);
  } else if (structureFilter === 'with_modal') {
    pool = pool.filter((c) => c.hasModal);
  }

  if (vibeFilter !== 'all') {
    pool = pool.filter((c) => c.vibe === vibeFilter);
  }

  pool.sort((a, b) => b.score - a.score);

  const uniquePool: RawCandidate[] = [];
  const seenPlain = new Set<string>();
  for (const c of pool) {
    if (seenPlain.has(c.plainChars)) continue;
    seenPlain.add(c.plainChars);
    uniquePool.push(c);
  }

  // 多样性重排（MMR）：防止同一个核心动词/主语/宾语霸榜，并均衡正逆序
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
      if (c.sKey) penalty += (sCount.get(c.sKey) ?? 0) * 6.5;
      penalty += (vCount.get(c.vKey) ?? 0) * 7.5;
      if (c.oKey) penalty += (oCount.get(c.oKey) ?? 0) * 6.5;

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
    if (chosen.sKey) sCount.set(chosen.sKey, (sCount.get(chosen.sKey) ?? 0) + 1);
    vCount.set(chosen.vKey, (vCount.get(chosen.vKey) ?? 0) + 1);
    if (chosen.oKey) oCount.set(chosen.oKey, (oCount.get(chosen.oKey) ?? 0) + 1);
    if (chosen.order === 'AB') abCount++;
    else baCount++;
  }

  return selected.map((c, idx) => hydrateCandidate(c, idx));
}

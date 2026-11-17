import {
  AnnotatedChar,
  GeneratedPhrase,
  OrderFilter,
  PhraseSegment,
  QualityTier,
  StructureFilter,
  StyleVibe,
  VibeFilter,
} from './types';

export interface RawCorpusData {
  W: [
    string,
    string,
    number,
    number,
    number,
    number,
    number | null,
    number | null,
    number | null,
  ][];
  SV: [number, number, number, number][];
  VO: [number, number, number][];
  SVO: [number, number, number, number][];
  AV: Record<string, [number, number][]>;
  APY: Record<string, string>;
  P: Record<string, number>;
}

export const TIER_META: Record<
  QualityTier,
  { label: '地道' | '通顺' | '勉强' | '硬凑'; desc: string }
> = {
  3: {
    label: '地道',
    desc: '整组搭配在真实语料或现代高频表达中多次出现',
  },
  2: {
    label: '通顺',
    desc: '各组搭配都在语料中出现过，或有细粒度同类词搭配作佐证',
  },
  1: {
    label: '勉强',
    desc: '搭配得到语义大类上的间接支持，语法结构成立',
  },
  0: {
    label: '硬凑',
    desc: '仅保证语法结构和首字母准确，用于刁钻字母组合兜底',
  },
};

const PARTICLES_1: Record<string, string[]> = {
  a: ['啊'],
  b: ['吧', '呗'],
  n: ['呢', '呐'],
  m: ['吗', '嘛'],
  l: ['了', '啦', '咯', '喽', '嘞'],
  y: ['呀', '哟', '耶'],
  o: ['哦', '噢', '喔'],
  h: ['哈'],
  w: ['哇'],
};

const PARTICLE_PY: Record<string, string> = {
  啊: 'a',
  吧: 'ba',
  呗: 'bei',
  呢: 'ne',
  呐: 'na',
  吗: 'ma',
  嘛: 'ma',
  了: 'le',
  啦: 'la',
  咯: 'lo',
  喽: 'lou',
  嘞: 'lei',
  呀: 'ya',
  哟: 'yo',
  耶: 'ye',
  哦: 'o',
  噢: 'o',
  喔: 'o',
  哈: 'ha',
  哇: 'wa',
};

const PARTICLES_2: Record<string, { word: string; py: string[] }[]> = {
  hm: [{ word: '好吗', py: ['hǎo', 'ma'] }],
  hb: [{ word: '好吧', py: ['hǎo', 'ba'] }],
  db: [{ word: '对吧', py: ['duì', 'ba'] }],
  sb: [{ word: '是吧', py: ['shì', 'ba'] }],
  xb: [{ word: '行吧', py: ['xíng', 'ba'] }],
  xm: [{ word: '行吗', py: ['xíng', 'ma'] }],
};

const AFTER_LE = new Set(['吗', '吧', '啊', '呀', '嘛', '哦', '呢']);
const RARE_P = new Set([
  '哈', '哇', '呗', '哟', '耶', '喽', '嘞', '咯', '噢', '喔', '呐',
]);

const PRONOUN_SET = new Set([
  '我', '你', '他', '她', '它', '您', '咱', '谁', '俺',
  '我们', '你们', '他们', '她们', '它们', '咱们', '大家', '自己',
]);

const POETIC_RE =
  /春风|晚风|清风|微风|海风|秋风|星河|星辰|银河|星光|晚星|晚霞|月光|月色|月亮|日落|夕阳|烟花|山海|山河|人间|江南|长安|桃花|樱花|玫瑰|海棠|茉莉|白雪|雪花|偏爱|暗恋|想念|思念|拥抱|守护|微醺|心动|温柔|浪漫|治愈|拂|赏|吻|梦|诗/;
const FUNNY_RE =
  /摸鱼|躺平|暴富|发财|干饭|偷吃|撸|考拉|柴犬|锦鲤|学霸|打工人|瞄准|加班|熬夜|红包|呗|哟|哈|哇|傻|笨|胖/;

function inferVibe(text: string): StyleVibe {
  if (FUNNY_RE.test(text)) return 'funny';
  if (POETIC_RE.test(text)) return 'poetic';
  return 'daily';
}

function stripTone(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

interface WordRec {
  i: number;
  t: string;
  py: string[];
  ini: string;
  cs: number;
  ci: number;
  ct: number;
  co: number;
  k: [number, number];
  nr: number;
}

interface AdvRec {
  t: string;
  py: string[];
  ini: string;
}

interface ScoredClause {
  plainChars: string;
  displayText: string;
  ini: string;
  s: WordRec | null;
  adv: AdvRec | null;
  v: WordRec;
  o: WordRec | null;
  pWord: string;
  pPy: string[];
  score: number;
  tier: QualityTier;
  order: 'AB' | 'BA';
  struct: 'SVO' | 'SV' | 'VO' | 'V';
  parts: {
    role: PhraseSegment['role'];
    roleLabel: PhraseSegment['roleLabel'];
    shortLabel: PhraseSegment['shortLabel'];
    word: string;
    py: string[];
    clauseBreakAfter?: boolean;
  }[];
  sKey: string;
  vKey: string;
  oKey: string;
  advKey: string;
}

export interface CorpusGenerateOptions {
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

export interface CorpusEngineInstance {
  wordCount: number;
  pairCount: number;
  svoCount: number;
  advCount: number;
  generate: (opts: CorpusGenerateOptions) => GeneratedPhrase[];
}

function hashJitter(str: string, seed: number): number {
  if (seed === 0) return 0;
  let h = 2166136261 ^ (seed * 16777619);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000) * 1.4 - 0.7;
}

function hasDuplicateChars(a: string, b: string): boolean {
  const setA = new Set(Array.from(a));
  for (const ch of Array.from(b)) {
    if (setA.has(ch)) return true;
  }
  return false;
}

export function createCorpusEngine(D: RawCorpusData): CorpusEngineInstance {
  const words: WordRec[] = D.W.map((w, i) => {
    const syl = w[1].split(' ');
    return {
      i,
      t: w[0],
      py: syl,
      ini: syl.map((x) => stripTone(x)[0]).join(''),
      cs: w[2],
      ci: w[3],
      ct: w[4],
      co: w[5],
      k: [w[6] == null ? -1 : w[6], w[8] == null ? -1 : w[8]],
      nr: w[7] ? 1 : 0,
    };
  });

  let NS = 0;
  let NI = 0;
  let NT = 0;
  let NO = 0;

  const byS = new Map<string, WordRec[]>();
  const byVi = new Map<string, WordRec[]>();
  const byVt = new Map<string, WordRec[]>();
  const byO = new Map<string, WordRec[]>();

  function pushMap<K, V>(m: Map<K, V[]>, k: K, v: V) {
    let a = m.get(k);
    if (!a) {
      a = [];
      m.set(k, a);
    }
    a.push(v);
  }

  for (const w of words) {
    NS += w.cs;
    NI += w.ci;
    NT += w.ct;
    NO += w.co;
    if (w.cs > 0) pushMap(byS, w.ini, w);
    if (w.ci > 0) pushMap(byVi, w.ini, w);
    if (w.ct > 0) pushMap(byVt, w.ini, w);
    if (w.co > 0) pushMap(byO, w.ini, w);
  }

  for (const a of byS.values()) a.sort((x, y) => y.cs - x.cs);
  for (const a of byVi.values()) a.sort((x, y) => y.ci - x.ci);
  for (const a of byVt.values()) a.sort((x, y) => y.ct - x.ct);
  for (const a of byO.values()) a.sort((x, y) => y.co - x.co);

  const M = 1e6;
  const svMap = new Map<number, number>();
  const svfMap = new Map<number, number>();
  const voMap = new Map<number, number>();
  const svoMap = new Map<string, number>();

  const svByKey = new Map<string, [number, number, number, number][]>();
  const voByKey = new Map<string, [number, number, number][]>();
  const sByV = new Map<number, [number, number, number, number][]>();
  const oByV = new Map<number, [number, number, number][]>();

  function inc(m: Map<number, number>, k: number, n: number) {
    m.set(k, (m.get(k) || 0) + n);
  }

  const K = [0, 1].map(() => ({
    S: new Map<number, number>(),
    O: new Map<number, number>(),
    sv: new Map<number, number>(),
    svN: new Map<number, number>(),
    svf: new Map<number, number>(),
    svfN: new Map<number, number>(),
    vo: new Map<number, number>(),
    voN: new Map<number, number>(),
  }));

  for (const w of words) {
    for (let g = 0; g < 2; g++) {
      const kg = w.k[g];
      if (kg >= 0) {
        if (w.cs > 0) inc(K[g].S, kg, w.cs);
        if (w.co > 0) inc(K[g].O, kg, w.co);
      }
    }
  }

  for (const p of D.SV) {
    const s = words[p[0]];
    const v = words[p[1]];
    if (!s || !v || (s.cs === 0 && s.co === 0) || (v.ci === 0 && v.ct === 0)) {
      continue;
    }
    svMap.set(p[0] * M + p[1], p[2]);
    if (p[3]) svfMap.set(p[0] * M + p[1], p[3]);
    pushMap(svByKey, `${s.ini}|${v.ini}`, p);
    pushMap(sByV, p[1], p);
    for (let g = 0; g < 2; g++) {
      const kg = s.k[g];
      if (kg >= 0) {
        const key = kg * M + p[1];
        inc(K[g].sv, key, p[2]);
        inc(K[g].svN, key, 1);
        if (p[3]) {
          inc(K[g].svf, key, p[3]);
          inc(K[g].svfN, key, 1);
        }
      }
    }
  }

  for (const p of D.VO) {
    const v = words[p[0]];
    const o = words[p[1]];
    if (!v || !o || (v.ci === 0 && v.ct === 0) || o.co === 0) continue;
    voMap.set(p[0] * M + p[1], p[2]);
    pushMap(voByKey, `${v.ini}|${o.ini}`, p);
    pushMap(oByV, p[0], p);
    for (let g = 0; g < 2; g++) {
      const kg = o.k[g];
      if (kg >= 0) {
        const key = p[0] * M + kg;
        inc(K[g].vo, key, p[2]);
        inc(K[g].voN, key, 1);
      }
    }
  }

  for (const p of D.SVO) {
    svoMap.set(`${p[0]},${p[1]},${p[2]}`, p[3]);
  }

  // 语气词统计
  let pMax = 1;
  const pCount: Record<string, number> = {};
  for (const p of Object.keys(PARTICLE_PY)) {
    pCount[p] = (D.P && D.P[p]) || 5;
    pMax = Math.max(pMax, pCount[p]);
  }

  // 支持 1字 与 2字 状语索引
  const advByIni = new Map<string, AdvRec[]>();
  const avMap = new Map<string, number>();
  const avByKey = new Map<string, WordRec[]>();
  const APY = D.APY || {};

  for (const a of Object.keys(D.AV || {})) {
    const pyStr = APY[a];
    if (!pyStr) continue;
    const pyArr = pyStr.split(' ');
    const ini = pyArr.map((x) => stripTone(x)[0]).join('');
    const rec: AdvRec = { t: a, py: pyArr, ini };
    pushMap(advByIni, ini, rec);

    for (const p of D.AV[a]) {
      const vw = words[p[0]];
      if (!vw || (vw.ci === 0 && vw.ct === 0)) continue;
      avMap.set(`${a}|${p[0]}`, p[1]);
      pushMap(avByKey, `${a}|${vw.ini}`, vw);
    }
  }

  const TIER_W = 4.5;
  const STRONG = 4;
  const L_EXACT = 0.55;
  const L_K = [0.12, 0.25];
  const L_BASE = 0.08;
  const MIN_C = [6, 4];
  const MIN_N = [3, 2];
  const MIN_LIFT = [3, 2];

  function pSV(s: WordRec, v: WordRec, withObj: boolean): [number, QualityTier] {
    const c = (withObj ? svMap : svfMap).get(s.i * M + v.i) || 0;
    const base = (withObj ? v.ct : v.ci) / (withObj ? NT : NI);
    let p = L_EXACT * (c / s.cs) + L_BASE * base;
    let lvl: QualityTier = c >= STRONG ? 3 : c > 0 ? 2 : 0;

    for (let g = 0; g < 2; g++) {
      const kg = s.k[g];
      if (kg < 0) continue;
      const key = kg * M + v.i;
      const ck = (withObj ? K[g].sv : K[g].svf).get(key) || 0;
      if (!ck) continue;
      const kTotal = K[g].S.get(kg) || 1;
      const pk = ck / kTotal;
      p += L_K[g] * pk;
      const nDistinct = (withObj ? K[g].svN : K[g].svfN).get(key) || 0;
      const targetLvl = (g + 1) as QualityTier;
      if (
        lvl < targetLvl &&
        ck >= MIN_C[g] &&
        pk / base >= MIN_LIFT[g] &&
        nDistinct >= MIN_N[g]
      ) {
        lvl = targetLvl;
      }
    }
    return [p, lvl];
  }

  function pVO(v: WordRec, o: WordRec): [number, QualityTier] {
    const c = voMap.get(v.i * M + o.i) || 0;
    const base = o.co / NO;
    let p = L_EXACT * (c / v.ct) + L_BASE * base;
    let lvl: QualityTier = c >= STRONG ? 3 : c > 0 ? 2 : 0;

    for (let g = 0; g < 2; g++) {
      const kg = o.k[g];
      if (kg < 0) continue;
      const key = v.i * M + kg;
      const ck = K[g].vo.get(key) || 0;
      if (!ck) continue;
      const ko = K[g].O.get(kg) || 1;
      p += L_K[g] * (ck / v.ct) * (o.co / ko);
      const nDistinct = K[g].voN.get(key) || 0;
      const targetLvl = (g + 1) as QualityTier;
      if (
        lvl < targetLvl &&
        ck >= MIN_C[g] &&
        ck / v.ct / (ko / NO) >= MIN_LIFT[g] &&
        nDistinct >= MIN_N[g]
      ) {
        lvl = targetLvl;
      }
    }
    return [p, lvl];
  }

  function scoreCore(
    s: WordRec | null,
    v: WordRec,
    o: WordRec | null,
    adv: AdvRec | null,
    ca: number
  ): { base: number; tier: QualityTier } {
    let lp = 0;
    let n = 0;
    let a: [number, QualityTier] | null = null;
    let b: [number, QualityTier] | null = null;
    let tier: QualityTier = 0;

    if (s) {
      lp += Math.log(s.cs / NS);
      n++;
      a = pSV(s, v, Boolean(o));
      lp += Math.log(Math.max(1e-12, a[0]));
      n++;
    } else {
      lp += Math.log(Math.max(1e-12, (o ? v.ct : v.ci) / (o ? NT : NI)));
      n++;
    }

    if (o) {
      b = pVO(v, o);
      lp += Math.log(Math.max(1e-12, b[0]));
      n++;
    }

    if (s && o && a && b) {
      if (svoMap.get(`${s.i},${v.i},${o.i}`)) {
        tier = 3;
      } else {
        const lo = Math.min(a[1], b[1]);
        const hi = Math.max(a[1], b[1]);
        tier = lo >= 2 && hi >= 3 ? 2 : lo >= 1 ? 1 : 0;
        if (
          tier === 2 &&
          v.t === '是' &&
          !PRONOUN_SET.has(s.t) &&
          !(s.k[0] >= 0 && s.k[0] === o.k[0])
        ) {
          tier = 1;
        }
      }
    } else if (s && a) {
      tier = a[1];
    } else if (o && b) {
      tier = b[1];
    } else {
      tier = adv ? 3 : 2;
    }

    if (adv) {
      lp += Math.log(Math.max(1e-6, Math.min(1, ca / (v.ci + v.ct))));
      n++;
    }

    const nr = (s ? s.nr : 0) + (o ? o.nr : 0);
    return { base: lp / n - 1.2 * nr, tier };
  }

  function particleOptions(
    letters: string
  ): { word: string; py: string[]; lastChar: string; logW: number }[] {
    if (!letters) {
      return [{ word: '', py: [], lastChar: '', logW: 0 }];
    }
    const out: { word: string; py: string[]; lastChar: string; logW: number }[] =
      [];
    if (letters.length === 1) {
      for (const p of PARTICLES_1[letters] || []) {
        out.push({
          word: p,
          py: [PARTICLE_PY[p]],
          lastChar: p,
          logW: Math.log(pCount[p] / pMax),
        });
      }
    } else if (letters.length === 2) {
      if (letters[0] === 'l') {
        for (const p of PARTICLES_1[letters[1]] || []) {
          if (AFTER_LE.has(p)) {
            const combo = '了' + p;
            out.push({
              word: combo,
              py: ['le', PARTICLE_PY[p]],
              lastChar: p,
              logW: Math.log(((D.P && D.P[combo]) || 30) / pMax),
            });
          }
        }
      }
      for (const item of PARTICLES_2[letters] || []) {
        out.push({
          word: item.word,
          py: item.py,
          lastChar: item.word.slice(-1),
          logW: Math.log(((D.P && D.P[item.word]) || 8000) / pMax),
        });
      }
    }
    return out;
  }

  function topWords(m: Map<string, WordRec[]>, k: string, n: number): WordRec[] {
    const a = m.get(k);
    return a ? a.slice(0, n) : [];
  }

  function coreCandidates(
    struct: 'SVO' | 'SV' | 'VO' | 'V',
    iS: string,
    iV: string,
    iO: string,
    xv: WordRec[] | null
  ): [WordRec | null, WordRec, WordRec | null][] {
    const out: [WordRec | null, WordRec, WordRec | null][] = [];
    const seen = new Set<string>();

    function add(s: WordRec | null, v: WordRec, o: WordRec | null) {
      const key = `${s ? s.i : -1},${v.i},${o ? o.i : -1}`;
      if (seen.has(key)) return;
      if (s && o && s.i === o.i) return;
      seen.add(key);
      out.push([s, v, o]);
    }

    function partnersS(v: WordRec, ini: string, n: number): WordRec[] {
      const arr = sByV.get(v.i) || [];
      const r: WordRec[] = [];
      for (let x = 0; x < arr.length && r.length < n; x++) {
        const w = words[arr[x][0]];
        if (w && w.ini === ini && w.cs > 0) r.push(w);
      }
      return r;
    }

    function partnersO(v: WordRec, ini: string, n: number): WordRec[] {
      const arr = oByV.get(v.i) || [];
      const r: WordRec[] = [];
      for (let x = 0; x < arr.length && r.length < n; x++) {
        const w = words[arr[x][1]];
        if (w && w.ini === ini && w.co > 0) r.push(w);
      }
      return r;
    }

    if (xv) {
      for (const v of xv) {
        if (struct === 'V') {
          if (v.ci > 0) add(null, v, null);
          continue;
        }
        if (!iO && v.ci === 0) continue;
        if (iO && v.ct === 0) continue;
        const ss: (WordRec | null)[] = iS
          ? partnersS(v, iS, 10).concat(topWords(byS, iS, 8))
          : [null];
        const oo: (WordRec | null)[] = iO
          ? partnersO(v, iO, 10).concat(topWords(byO, iO, 6))
          : [null];
        for (const s of ss) {
          for (const o of oo) {
            add(s, v, o);
          }
        }
      }
      return out;
    }

    if (struct === 'V') {
      for (const v of topWords(byVi, iV, 14)) add(null, v, null);
    } else if (struct === 'SV') {
      for (const p of (svByKey.get(`${iS}|${iV}`) || []).slice(0, 180)) {
        if (p[3] > 0 && words[p[1]].ci > 0) add(words[p[0]], words[p[1]], null);
      }
      const a = topWords(byS, iS, 18);
      const b = topWords(byVi, iV, 18);
      for (const s of a) {
        for (const v of b) add(s, v, null);
      }
    } else if (struct === 'VO') {
      for (const p of (voByKey.get(`${iV}|${iO}`) || []).slice(0, 180)) {
        add(null, words[p[0]], words[p[1]]);
      }
      const a = topWords(byVt, iV, 18);
      const b = topWords(byO, iO, 18);
      for (const v of a) {
        for (const o of b) add(null, v, o);
      }
    } else {
      const gS = topWords(byS, iS, 14);
      const gO = topWords(byO, iO, 14);
      const gV = topWords(byVt, iV, 10);

      for (const p of (voByKey.get(`${iV}|${iO}`) || []).slice(0, 75)) {
        const v = words[p[0]];
        const o = words[p[1]];
        let n = 0;
        const ss = sByV.get(v.i) || [];
        for (let x = 0; x < ss.length && n < 12; x++) {
          const s = words[ss[x][0]];
          if (s && s.ini === iS && s.cs > 0) {
            add(s, v, o);
            n++;
          }
        }
        for (const s of gS) add(s, v, o);
      }

      for (const p of (svByKey.get(`${iS}|${iV}`) || []).slice(0, 75)) {
        const s = words[p[0]];
        const v = words[p[1]];
        if (v.ct === 0) continue;
        let n = 0;
        const oo = oByV.get(v.i) || [];
        for (let x = 0; x < oo.length && n < 12; x++) {
          const o = words[oo[x][1]];
          if (o && o.ini === iO && o.co > 0) {
            add(s, v, o);
            n++;
          }
        }
        for (const o of gO) add(s, v, o);
      }

      for (let i = 0; i < gS.length && i < 10; i++) {
        for (let j = 0; j < gV.length; j++) {
          for (let k = 0; k < gO.length && k < 10; k++) {
            add(gS[i], gV[j], gO[k]);
          }
        }
      }
    }

    return out;
  }

  function matchesStructFilter(
    struct: 'SVO' | 'SV' | 'VO' | 'V',
    hasModal: boolean,
    filter: StructureFilter
  ): boolean {
    if (filter === 'all') return true;
    if (filter === 'SVO' || filter === 'full_svo') return struct === 'SVO';
    if (filter === 'SV') return struct === 'SV';
    if (filter === 'VO') return struct === 'VO';
    if (filter === 'V') return struct === 'V';
    if (filter === 'compact') return struct !== 'SVO';
    if (filter === 'with_modal') return hasModal;
    return true;
  }

  function generateSingleClauses(
    T: string,
    order: 'AB' | 'BA',
    opts: {
      allowParticles: boolean;
      allowAdverb: boolean;
      structureFilter: StructureFilter;
      seed: number;
    }
  ): ScoredClause[] {
    const N = T.length;
    if (N < 2 || N > 10) return [];

    const maxP = opts.allowParticles ? Math.min(2, N - 1) : 0;
    // 支持 1字 和 2字 状语（N >= 4 时允许 2字状语如“不想/一起/偷偷”）
    const maxA = opts.allowAdverb ? (N >= 4 ? 2 : 1) : 0;
    const best = new Map<string, ScoredClause>();

    for (let pl = 0; pl <= maxP; pl++) {
      const core = T.slice(0, N - pl);
      const pOpts = particleOptions(T.slice(N - pl));
      if (!pOpts.length) continue;

      const L = core.length;
      if (L < 1) continue;

      for (let la = 0; la <= Math.min(maxA, L - 1); la++) {
        for (let ls = 0; ls <= Math.min(4, L - 1 - la); ls++) {
          for (let lv = 1; lv <= Math.min(4, L - ls - la); lv++) {
            const lo = L - ls - la - lv;
            if (lo < 0 || lo > 4) continue;

            const struct: 'SVO' | 'SV' | 'VO' | 'V' =
              ls && lo ? 'SVO' : ls ? 'SV' : lo ? 'VO' : 'V';

            if (!matchesStructFilter(struct, pl > 0, opts.structureFilter)) {
              continue;
            }
            // 单独一个单字动词不算短语；但 N===2 时的双字动词（如“摸鱼/下班”）或带状语/语气词允许通过
            if (
              struct === 'V' &&
              pl === 0 &&
              la === 0 &&
              lv < 2 &&
              opts.structureFilter !== 'V'
            ) {
              continue;
            }
            if (
              struct === 'V' &&
              pl === 0 &&
              la === 0 &&
              N > 2 &&
              opts.structureFilter !== 'V'
            ) {
              continue;
            }

            const iS = core.slice(0, ls);
            const iA = la ? core.slice(ls, ls + la) : '';
            const iV = core.slice(ls + la, ls + la + lv);
            const iO = core.slice(ls + la + lv);

            const advList: (AdvRec | null)[] = la
              ? advByIni.get(iA) || []
              : [null];
            if (!advList.length) continue;

            for (const adv of advList) {
              const xv = adv
                ? (avByKey.get(`${adv.t}|${iV}`) || []).slice(0, 40)
                : null;
              if (adv && (!xv || xv.length === 0)) continue;

              const cands = coreCandidates(struct, iS, iV, iO, xv);
              for (let k = 0; k < cands.length; k++) {
                const [s, v, o] = cands[k];
                let ca = 0;
                if (adv) {
                  ca = avMap.get(`${adv.t}|${v.i}`) || 0;
                  if (!ca) continue;
                  // 避免主语与时间状语同词重复（如“今天今天上班”）
                  if (s && s.t === adv.t) continue;
                }

                const sc = scoreCore(s, v, o, adv, ca);

                for (const pOpt of pOpts) {
                  const plainChars =
                    (s ? s.t : '') +
                    (adv ? adv.t : '') +
                    v.t +
                    (o ? o.t : '') +
                    pOpt.word;

                  let tier: QualityTier = sc.tier;
                  if (
                    tier === 3 &&
                    pOpt.word &&
                    (RARE_P.has(pOpt.lastChar) ||
                      (pOpt.word.length > 1 && pOpt.logW < -4))
                  ) {
                    tier = 2;
                  }

                  const score =
                    tier * TIER_W +
                    sc.base +
                    pOpt.logW * 0.55 +
                    hashJitter(plainChars + order, opts.seed);

                  const cur = best.get(plainChars);
                  if (cur && cur.score >= score) continue;

                  const parts: ScoredClause['parts'] = [];
                  if (s) {
                    parts.push({
                      role: 'subject',
                      roleLabel: '主语',
                      shortLabel: '主',
                      word: s.t,
                      py: s.py,
                    });
                  }
                  if (adv) {
                    parts.push({
                      role: 'adverb',
                      roleLabel: '状语',
                      shortLabel: '状',
                      word: adv.t,
                      py: adv.py,
                    });
                  }
                  parts.push({
                    role: 'predicate',
                    roleLabel: '谓语',
                    shortLabel: '谓',
                    word: v.t,
                    py: v.py,
                  });
                  if (o) {
                    parts.push({
                      role: 'object',
                      roleLabel: '宾语',
                      shortLabel: '宾',
                      word: o.t,
                      py: o.py,
                    });
                  }
                  if (pOpt.word) {
                    parts.push({
                      role: 'modal_end',
                      roleLabel: '语气词',
                      shortLabel: '语',
                      word: pOpt.word,
                      py: pOpt.py,
                    });
                  }

                  best.set(plainChars, {
                    plainChars,
                    displayText: plainChars,
                    ini: T,
                    s,
                    adv,
                    v,
                    o,
                    pWord: pOpt.word,
                    pPy: pOpt.py,
                    score,
                    tier,
                    order,
                    struct,
                    parts,
                    sKey: s ? String(s.i) : '',
                    vKey: String(v.i),
                    oKey: o ? String(o.i) : '',
                    advKey: adv ? adv.t : '',
                  });
                }
              }
            }
          }
        }
      }
    }

    const arr = Array.from(best.values());
    arr.sort((x, y) => y.score - x.score);
    return arr;
  }

  // 长串（8~24字，或 6~7 字高阶结果不足时）连贯多分句组合
  function generateMultiClauses(
    T: string,
    order: 'AB' | 'BA',
    splitIndex: number,
    opts: {
      allowParticles: boolean;
      allowAdverb: boolean;
      seed: number;
    },
    isMediumFallback = false
  ): ScoredClause[] {
    const len = T.length;
    if (len < 6) return [];

    const subOpts = {
      allowParticles: opts.allowParticles,
      allowAdverb: opts.allowAdverb,
      structureFilter: 'all' as StructureFilter,
      seed: opts.seed,
    };

    const mid = Math.floor(len / 2);
    const splits = new Set<number>();
    const preferred =
      len >= 11 ? [4, splitIndex, mid] : [splitIndex, mid, len - mid, mid - 1];
    for (const k of preferred) {
      if (k >= 3 && len - k >= 3 && splits.size < 3) {
        splits.add(k);
      }
    }
    if (splits.size === 0 && len >= 6) {
      splits.add(mid);
    }

    const merged = new Map<string, ScoredClause>();

    for (const k of splits) {
      const leftSeq = T.slice(0, k);
      const rightSeq = T.slice(k);

      let leftPool =
        k <= 7 ? generateSingleClauses(leftSeq, order, subOpts).slice(0, 10) : [];
      if (leftPool.length === 0 && k >= 6) {
        leftPool = generateMultiClauses(
          leftSeq,
          order,
          Math.floor(k / 2),
          opts,
          true
        ).slice(0, 6);
      }

      let rightPool =
        len - k <= 7
          ? generateSingleClauses(rightSeq, order, subOpts).slice(0, 10)
          : [];
      if (rightPool.length === 0 && len - k >= 6) {
        rightPool = generateMultiClauses(
          rightSeq,
          order,
          Math.floor((len - k) / 2),
          opts,
          true
        ).slice(0, 6);
      }

      const symBonus = isMediumFallback
        ? -6.0
        : k === len - k || k === splitIndex
          ? 0.6
          : 0.1;

      for (const l of leftPool) {
        for (const r of rightPool) {
          if (len < 14 && hasDuplicateChars(l.plainChars, r.plainChars)) {
            continue;
          }
          const plainChars = l.plainChars + r.plainChars;
          const tier = Math.min(l.tier, r.tier) as QualityTier;
          const baseAvg =
            ((l.score - l.tier * TIER_W) * k +
              (r.score - r.tier * TIER_W) * (len - k)) /
            len;
          const score = tier * TIER_W + baseAvg + symBonus;

          const cur = merged.get(plainChars);
          if (cur && cur.score >= score) continue;

          const leftParts = l.parts.map((p, idx) =>
            idx === l.parts.length - 1 ? { ...p, clauseBreakAfter: true } : p
          );

          merged.set(plainChars, {
            plainChars,
            displayText: `${l.displayText}，${r.displayText}`,
            ini: T,
            s: l.s ?? r.s,
            adv: l.adv ?? r.adv,
            v: l.v,
            o: r.o ?? l.o,
            pWord: r.pWord || l.pWord,
            pPy: [],
            score,
            tier,
            order,
            struct:
              l.s && l.o && r.s && r.o
                ? 'SVO'
                : l.s || r.s
                  ? 'SV'
                  : 'VO',
            parts: [...leftParts, ...r.parts],
            sKey: l.sKey || r.sKey,
            vKey: `${l.vKey}+${r.vKey}`,
            oKey: r.oKey || l.oKey,
            advKey: l.advKey || r.advKey,
          });
        }
      }
    }

    const list = Array.from(merged.values());
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, 96);
  }

  function diversify(list: ScoredClause[], limit: number): ScoredClause[] {
    const pool = list.slice(0, 1200);
    const out: ScoredClause[] = [];
    const used = new Map<string, number>();
    const coreUsed = new Map<string, number>();
    const structUsed = new Map<string, number>();

    const incUsed = (m: Map<string, number>, k: string) =>
      m.set(k, (m.get(k) || 0) + 1);
    const coreKey = (it: ScoredClause) =>
      `${it.sKey}|${it.vKey}|${it.oKey}`;

    function pen(it: ScoredClause): number {
      let p = 0;
      if (it.sKey) p += 1.1 * (used.get('s' + it.sKey) || 0);
      p += 1.6 * (used.get('v' + it.vKey) || 0);
      if (it.oKey) p += 1.3 * (used.get('o' + it.oKey) || 0);
      p += 6.0 * (coreUsed.get(coreKey(it)) || 0);
      if (it.advKey) p += 0.8 * (used.get('a' + it.advKey) || 0);
      p += 0.25 * (structUsed.get(it.struct + it.order) || 0);
      return p;
    }

    function capped(it: ScoredClause): boolean {
      const sCap = it.s && PRONOUN_SET.has(it.s.t) ? 12 : 4;
      return (
        (used.get('v' + it.vKey) || 0) >= 4 ||
        Boolean(it.oKey && (used.get('o' + it.oKey) || 0) >= 4) ||
        Boolean(it.sKey && (used.get('s' + it.sKey) || 0) >= sCap)
      );
    }

    while (out.length < limit && pool.length > 0) {
      let bi = -1;
      let bs = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].score <= bs) break;
        if (capped(pool[i])) continue;
        const e = pool[i].score - pen(pool[i]);
        if (e > bs) {
          bs = e;
          bi = i;
        }
      }
      if (bi < 0) break;
      const it = pool.splice(bi, 1)[0];
      out.push(it);
      if (it.sKey) incUsed(used, 's' + it.sKey);
      incUsed(used, 'v' + it.vKey);
      if (it.oKey) incUsed(used, 'o' + it.oKey);
      if (it.advKey) incUsed(used, 'a' + it.advKey);
      incUsed(coreUsed, coreKey(it));
      incUsed(structUsed, it.struct + it.order);
    }
    return out;
  }

  function hydrate(
    it: ScoredClause,
    splitIndex: number,
    idx: number
  ): GeneratedPhrase {
    const firstSource: 'A' | 'B' = it.order === 'AB' ? 'A' : 'B';
    const secondSource: 'A' | 'B' = it.order === 'AB' ? 'B' : 'A';
    let cursor = 0;

    const segments: PhraseSegment[] = it.parts.map((p) => {
      const wChars = Array.from(p.word);
      const chars: AnnotatedChar[] = wChars.map((ch, ci) => {
        const globalIdx = cursor++;
        return {
          char: ch,
          pinyin: p.py[ci] || it.ini[globalIdx],
          initial: it.ini[globalIdx],
          source: globalIdx < splitIndex ? firstSource : secondSource,
        };
      });
      return {
        role: p.role,
        roleLabel: p.roleLabel,
        shortLabel: p.shortLabel,
        word: p.word,
        chars,
        clauseBreakAfter: p.clauseBreakAfter,
      };
    });

    const isMulti = it.parts.some((p) => p.clauseBreakAfter);
    const labelParts = it.parts.map((p) =>
      p.clauseBreakAfter ? `${p.shortLabel} ，` : p.shortLabel
    );
    const patternLabel = isMulti
      ? labelParts.join(' ')
      : it.parts.map((p) => p.shortLabel).join(' + ');

    const meta = TIER_META[it.tier];
    const vibe = inferVibe(it.plainChars);

    return {
      id: `${it.order}-${it.plainChars}-${idx}`,
      text: it.displayText,
      initials: it.ini,
      order: it.order,
      orderLabel: it.order === 'AB' ? '正序 A + B' : '交换 B + A',
      sourceSplitIndex: splitIndex,
      firstSource,
      secondSource,
      patternCode: it.struct,
      patternLabel,
      hasSubject: it.parts.some((p) => p.role === 'subject'),
      hasObject: it.parts.some((p) => p.role === 'object'),
      hasAdverb: it.parts.some((p) => p.role === 'adverb'),
      hasModal: it.parts.some(
        (p) => p.role === 'modal_init' || p.role === 'modal_end'
      ),
      tier: it.tier,
      tierLabel: meta.label,
      tierDesc: meta.desc,
      vibe,
      score: Math.round(it.score * 100) / 100,
      segments,
    };
  }

  function generate(opts: CorpusGenerateOptions): GeneratedPhrase[] {
    const {
      initA,
      initB,
      orderFilter = 'all',
      structureFilter = 'all',
      vibeFilter = 'all',
      allowParticles = true,
      allowAdverb = true,
      seed = 0,
      limit = 60,
    } = opts;

    if (!initA || !initB) return [];

    const targets: [string, 'AB' | 'BA', number][] = [];
    if (orderFilter === 'all' || orderFilter === 'AB') {
      targets.push([initA + initB, 'AB', initA.length]);
    }
    if (
      (orderFilter === 'all' || orderFilter === 'BA') &&
      (initA + initB !== initB + initA || orderFilter === 'BA')
    ) {
      targets.push([initB + initA, 'BA', initB.length]);
    }

    let allClauses: { clause: ScoredClause; split: number }[] = [];

    for (const [seq, ord, split] of targets) {
      const single = generateSingleClauses(seq, ord, {
        allowParticles,
        allowAdverb,
        structureFilter,
        seed,
      });

      let combined = single;
      if (seq.length >= 8) {
        const multi = generateMultiClauses(
          seq,
          ord,
          split,
          { allowParticles, allowAdverb, seed },
          false
        ).filter((m) =>
          matchesStructFilter(m.struct, Boolean(m.pWord), structureFilter)
        );
        combined = [...single, ...multi];
      } else if (
        seq.length >= 6 &&
        single.filter((x) => x.tier >= 2).length < 2
      ) {
        const fallbackMulti = generateMultiClauses(
          seq,
          ord,
          split,
          { allowParticles, allowAdverb, seed },
          true
        ).filter((m) =>
          matchesStructFilter(m.struct, Boolean(m.pWord), structureFilter)
        );
        combined = [...single, ...fallbackMulti];
      }

      for (const c of combined) {
        allClauses.push({ clause: c, split });
      }
    }

    if (vibeFilter !== 'all') {
      allClauses = allClauses.filter(
        (item) => inferVibe(item.clause.plainChars) === vibeFilter
      );
    }

    // 去重并保留最高分
    const bestByText = new Map<string, { clause: ScoredClause; split: number }>();
    for (const item of allClauses) {
      const prev = bestByText.get(item.clause.plainChars);
      if (!prev || item.clause.score > prev.clause.score) {
        bestByText.set(item.clause.plainChars, item);
      }
    }

    const splitLookup = new Map<string, number>();
    let deduped = Array.from(bestByText.values()).map((x) => {
      splitLookup.set(x.clause.plainChars, x.split);
      return x.clause;
    });
    deduped.sort((a, b) => b.score - a.score);

    // 同一核心主谓宾带不同句末语气词时只保留最佳一条，避免重复感
    const seenCore = new Set<string>();
    deduped = deduped.filter((x) => {
      const k = `${x.sKey}|${x.advKey}|${x.vKey}|${x.oKey}|${x.pWord ? 1 : 0}`;
      if (seenCore.has(k)) return false;
      seenCore.add(k);
      return true;
    });

    // 按语料评级分层多样化（地道 > 通顺 > 勉强 > 硬凑）
    const caps = [12, 24, limit, limit];
    let selected: ScoredClause[] = [];
    for (let t = 3 as QualityTier; t >= 0 && selected.length < limit; t--) {
      const layer = deduped.filter((x) => x.tier === t);
      if (!layer.length) continue;
      const room = Math.min(
        limit - selected.length,
        t >= 2
          ? limit
          : Math.max(0, caps[t] - (selected.length >= 12 ? caps[t] - 6 : 0))
      );
      if (room > 0) {
        selected = selected.concat(diversify(layer, room));
      }
    }

    return selected.map((c, idx) =>
      hydrate(c, splitLookup.get(c.plainChars) ?? 1, idx)
    );
  }

  return {
    wordCount: words.length,
    pairCount: D.SV.length + D.VO.length,
    svoCount: D.SVO.length,
    advCount: Object.keys(D.AV || {}).length,
    generate,
  };
}

let cachedEngine: CorpusEngineInstance | null = null;
let loadingPromise: Promise<CorpusEngineInstance> | null = null;

export function getLoadedCorpusEngine(): CorpusEngineInstance | null {
  return cachedEngine;
}

export function setCorpusEngineFromRaw(D: RawCorpusData): CorpusEngineInstance {
  cachedEngine = createCorpusEngine(D);
  return cachedEngine;
}

export async function loadCorpusEngine(): Promise<CorpusEngineInstance> {
  if (cachedEngine) return cachedEngine;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const baseUrl =
      typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
        ? import.meta.env.BASE_URL
        : './';
    const url = `${baseUrl.replace(/\/?$/, '/')}corpus.bin`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`加载升级语料词库失败 (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf);
    let jsonText: string;

    // 检测 gzip 魔数 0x1f 0x8b（兼容服务端预解压与原始二进制传输）
    if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([u8]).stream().pipeThrough(ds);
      jsonText = await new Response(stream).text();
    } else {
      jsonText = new TextDecoder('utf-8').decode(u8);
    }

    const D = JSON.parse(jsonText) as RawCorpusData;
    cachedEngine = createCorpusEngine(D);
    return cachedEngine;
  })();

  return loadingPromise;
}

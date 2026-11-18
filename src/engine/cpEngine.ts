/**
 * CP-generator v2 双语料引擎接入层
 *
 * 数据：public/cp-corpus.bin（gzip JSON，880 万条字幕/聊天/菜谱/点评/问答短句
 *      统计出的 7.45 万词、60.5 万组依存搭配、74.6 万条语料原句）
 * 引擎：src/engine/cpEngineLib.js（移植自 csna350akioi/CP-generator）
 *
 * 职责：
 *  1. 惰性加载并创建引擎（离线单文件，与 corpus.bin 同套路）；
 *  2. 把 CP 的分段结果（M/S/D/V/O/P/X）归一化为本项目的 GeneratedPhrase 契约，
 *     并逐字校验首字母序列与目标完全一致（不一致即丢弃，宁缺毋滥）；
 *  3. 对 CP 结果施加本项目的过滤口径：禁句清单、顺序/结构/风格过滤、
 *     「可带状语」开关与语料原句后置过滤 —— CP 的原句命中评级只认共现频次，
 *     会放过「我蛮喜欢谁」这类句子，必须用共享守卫兜底。
 */
import { PhraseEngine } from './cpEngineLib';
import type {
  CpEngineInstance,
  CpGenerated,
  CpGenerateOptions,
  CpSeg,
  CpSegRole,
} from './cpEngineLib';

export type { CpEngineInstance } from './cpEngineLib';
import { TIER_META, inferVibe } from './corpusEngine';
import { isForbiddenPhrase } from './fluencyGuards';
import type {
  AnnotatedChar,
  ConstituentRole,
  GeneratedPhrase,
  OrderFilter,
  PhraseSegment,
  QualityTier,
  StructureFilter,
  VibeFilter,
} from './types';

let cpEngine: CpEngineInstance | null = null;
let loadingPromise: Promise<CpEngineInstance | null> | null = null;

export function getLoadedCpEngine(): CpEngineInstance | null {
  return cpEngine;
}

/** 测试或预构建场景：直接用已解析的 JSON 数据创建引擎 */
export function setCpEngineFromRaw(D: unknown): CpEngineInstance {
  cpEngine = PhraseEngine.create(D);
  return cpEngine;
}

/**
 * 浏览器侧惰性加载 gzip 语料。失败返回 null（不抛错、不中断页面，
 * 仅退回单引擎 + 规则兜底），并允许后续重试。
 */
export async function loadCpEngine(): Promise<CpEngineInstance | null> {
  if (cpEngine) return cpEngine;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const baseUrl =
        typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
          ? import.meta.env.BASE_URL
          : './';
      const url = `${baseUrl.replace(/\/?$/, '/')}cp-corpus.bin`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`加载 CP 语料失败 (${res.status})`);
      }
      const u8 = new Uint8Array(await res.arrayBuffer());
      let jsonText: string;

      // 同 corpus.bin：兼容服务端预解压与原始 gzip 二进制传输
      if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([u8]).stream().pipeThrough(ds);
        jsonText = await new Response(stream).text();
      } else {
        jsonText = new TextDecoder('utf-8').decode(u8);
      }

      const D = JSON.parse(jsonText);
      return setCpEngineFromRaw(D);
    } catch (err) {
      console.error('CP 语料引擎加载失败:', err);
      loadingPromise = null; // 允许重试
      return null;
    }
  })();

  return loadingPromise;
}

function stripTone(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** CP 分段角色 → 本项目成分角色（含 CP 特有的定语 M 与助词 X：的/地/了/着/过） */
const CP_ROLE_META: Record<
  CpSegRole,
  {
    role: ConstituentRole;
    roleLabel: PhraseSegment['roleLabel'];
    shortLabel: PhraseSegment['shortLabel'];
  }
> = {
  M: { role: 'modifier', roleLabel: '定语', shortLabel: '定' },
  S: { role: 'subject', roleLabel: '主语', shortLabel: '主' },
  D: { role: 'adverb', roleLabel: '状语', shortLabel: '状' },
  V: { role: 'predicate', roleLabel: '谓语', shortLabel: '谓' },
  O: { role: 'object', roleLabel: '宾语', shortLabel: '宾' },
  P: { role: 'modal_end', roleLabel: '语气词', shortLabel: '语' },
  X: { role: 'aux', roleLabel: '助词', shortLabel: '助' },
};

/**
 * 把 CP 的一条生成结果映射为 GeneratedPhrase。
 * 逐字重建首字母并要求与目标串（A+B 或 B+A）完全一致，任何不一致都返回 null。
 */
function normalizeCpResult(
  cp: CpGenerated,
  initA: string,
  initB: string,
  idx: number
): GeneratedPhrase | null {
  if (!cp.text || !Array.isArray(cp.segs) || cp.segs.length === 0) return null;
  if (!Number.isFinite(cp.score)) return null;

  const order = cp.order;
  const firstSource: 'A' | 'B' = order === 'AB' ? 'A' : 'B';
  const secondSource: 'A' | 'B' = order === 'AB' ? 'B' : 'A';
  const splitIndex = order === 'AB' ? initA.length : initB.length;
  const expectedInitials = order === 'AB' ? initA + initB : initB + initA;

  let cursor = 0;
  let initials = '';
  const segments: PhraseSegment[] = [];

  for (const seg of cp.segs as CpSeg[]) {
    const meta = CP_ROLE_META[seg.role];
    if (!meta) return null;
    const chars = Array.from(seg.t);
    if (chars.length === 0 || chars.length !== seg.py.length) return null;

    const annotated: AnnotatedChar[] = [];
    for (let i = 0; i < chars.length; i++) {
      const py = seg.py[i];
      const ini = stripTone(py).charAt(0);
      if (!ini) return null;
      initials += ini;
      annotated.push({
        char: chars[i],
        pinyin: py,
        initial: ini,
        source: cursor < splitIndex ? firstSource : secondSource,
      });
      cursor++;
    }

    segments.push({
      role: meta.role,
      roleLabel: meta.roleLabel,
      shortLabel: meta.shortLabel,
      word: seg.t,
      chars: annotated,
    });
  }

  if (initials !== expectedInitials) return null;

  const tier: QualityTier = cp.tier >= 0 && cp.tier <= 3 ? (cp.tier as QualityTier) : 0;
  const meta = TIER_META[tier];
  const patternLabel = segments
    .filter((s) => s.role !== 'aux') // 助词不计入「主+谓+宾」式结构标签
    .map((s) => s.shortLabel)
    .join(' + ');

  return {
    id: `${order}-${cp.text}-${idx}`,
    text: cp.text,
    initials,
    order,
    orderLabel: order === 'AB' ? '正序 A + B' : '交换 B + A',
    sourceSplitIndex: splitIndex,
    firstSource,
    secondSource,
    patternCode: cp.struct,
    patternLabel,
    hasSubject: segments.some((s) => s.role === 'subject'),
    hasObject: segments.some((s) => s.role === 'object'),
    hasAdverb: segments.some((s) => s.role === 'adverb'),
    hasModal: segments.some((s) => s.role === 'modal_end'),
    tier,
    tierLabel: meta.label,
    tierDesc: meta.desc,
    vibe: inferVibe(cp.text),
    score: Math.round(cp.score * 100) / 100,
    seen: cp.seen > 0 ? cp.seen : undefined,
    segments,
  };
}

export interface CpGenerateRequest {
  initA: string;
  initB: string;
  orderFilter?: OrderFilter;
  structureFilter?: StructureFilter;
  vibeFilter?: VibeFilter;
  allowParticles?: boolean;
  allowAdverb?: boolean;
  limit?: number;
}

const DIRECT_STRUCTS = new Set<StructureFilter>(['SVO', 'SV', 'VO', 'V']);

/**
 * CP 引擎单次生成（含本项目全部后置过滤）。引擎未加载时返回 []。
 * 结果按 CP 自身「评级分层 + 层内多样化」排序；跨引擎合并由 generator.ts 负责。
 */
export function generateCpPhrases(req: CpGenerateRequest): GeneratedPhrase[] {
  const eng = getLoadedCpEngine();
  if (!eng) return [];

  const {
    initA,
    initB,
    orderFilter = 'all',
    structureFilter = 'all',
    vibeFilter = 'all',
    allowParticles = true,
    allowAdverb = true,
    limit = 24,
  } = req;

  if (!initA || !initB) return [];

  const struct: CpGenerateOptions['struct'] =
    structureFilter === 'full_svo'
      ? 'SVO'
      : DIRECT_STRUCTS.has(structureFilter)
        ? (structureFilter as 'SVO' | 'SV' | 'VO' | 'V')
        : undefined;

  const cpOpts: CpGenerateOptions = {
    swap: true, // 两种拼接顺序都生成，顺序口径与本项目一致，随后统一后置过滤
    particles: allowParticles,
    mods: true, // 定语/助词始终放开（本项目的开关只针对状语，状语在下方后置过滤）
    struct,
    limit: Math.min(Math.max(limit, 24), 96),
  };

  let raws: CpGenerated[];
  try {
    raws = eng.generate(initA, initB, cpOpts);
  } catch (err) {
    console.error('CP 引擎生成失败:', err);
    return [];
  }

  const out: GeneratedPhrase[] = [];
  for (let i = 0; i < raws.length; i++) {
    const phrase = normalizeCpResult(raws[i], initA, initB, i);
    if (!phrase) continue;

    // 共享流畅度守卫（CP 原句命中评级会放过的不自然句式）
    if (isForbiddenPhrase(phrase.text)) continue;
    // 顺序过滤
    if (orderFilter !== 'all' && phrase.order !== orderFilter) continue;
    // 结构过滤（与 generator 规则引擎同一口径；direct 结构已预传给 CP，这里兜底校验）
    if (structureFilter === 'full_svo' || structureFilter === 'SVO') {
      if (!(phrase.hasSubject && phrase.hasObject)) continue;
    } else if (structureFilter === 'SV') {
      if (!(phrase.hasSubject && !phrase.hasObject)) continue;
    } else if (structureFilter === 'VO') {
      if (!(!phrase.hasSubject && phrase.hasObject)) continue;
    } else if (structureFilter === 'V') {
      if (!(!phrase.hasSubject && !phrase.hasObject)) continue;
    } else if (structureFilter === 'compact') {
      if (phrase.hasSubject && phrase.hasObject) continue;
    } else if (structureFilter === 'with_modal') {
      if (!phrase.hasModal) continue;
    }
    // 风格过滤（复用 SZM 语料引擎的 inferVibe 口径）
    if (vibeFilter !== 'all' && phrase.vibe !== vibeFilter) continue;
    // 状语开关
    if (!allowAdverb && phrase.hasAdverb) continue;

    out.push(phrase);
  }
  return out;
}

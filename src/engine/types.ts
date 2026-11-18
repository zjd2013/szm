export type SemTag =
  | 'person'
  | 'animal'
  | 'food'
  | 'drink'
  | 'nature'
  | 'item'
  | 'text'
  | 'place'
  | 'abstract';

export type StyleVibe = 'daily' | 'poetic' | 'funny';

/**
 * 语料搭配真实度四级评定（借鉴并升级自 602 万影视字幕依存句法模型）：
 * 3 = 地道（整组搭配在真实语料/精选现代语料中多次出现）
 * 2 = 通顺（各组搭配分别出现过，或有细粒度同类词搭配佐证）
 * 1 = 勉强（搭配得到粗粒度语义类别间接支持）
 * 0 = 硬凑（仅保证语法结构与首字母准确，兜底生成）
 */
export type QualityTier = 0 | 1 | 2 | 3;

export interface NounEntry {
  word: string;
  headWord?: string;
  initials: string;
  tags: SemTag[];
  vibe: StyleVibe;
  weight: number;
  isPronoun?: boolean;
  subjectOnly?: boolean;
  synthetic?: boolean;
}

export interface VerbEntry {
  word: string;
  coreVerb?: string;
  initials: string;
  transitive: boolean;
  intransitive: boolean;
  sTags: SemTag[];
  oTags: SemTag[];
  vibe: StyleVibe;
  weight: number;
  psych?: boolean;
  synthetic?: boolean;
}

export interface ModalEntry {
  word: string;
  initials: string;
  pos: 'init' | 'end' | 'both';
  vibe: StyleVibe;
  weight: number;
}

export interface ModifierEntry {
  word: string;
  initials: string;
  targetTags: SemTag[];
  vibe: StyleVibe;
  weight: number;
}

export interface ParsedCharToken {
  index: number;
  rawChar: string;
  isChinese: boolean;
  pinyinDisplay: string;
  selectedInitial: string;
  altInitials: string[];
  mappedFromIUV?: string;
}

export interface ParsedStringInput {
  raw: string;
  valid: boolean;
  error?: string;
  chars: ParsedCharToken[];
  initials: string;
  hasPolyphone: boolean;
  hasIUV: boolean;
}

export type ConstituentRole =
  | 'modal_init'
  | 'subject'
  | 'adverb'
  | 'predicate'
  | 'object'
  | 'modal_end'
  | 'modifier'
  | 'aux';

export interface AnnotatedChar {
  char: string;
  pinyin: string;
  initial: string;
  source: 'A' | 'B';
}

export interface PhraseSegment {
  role: ConstituentRole;
  roleLabel: '语气词' | '主语' | '状语' | '谓语' | '宾语' | '定语' | '助词';
  shortLabel: '语' | '主' | '状' | '谓' | '宾' | '定' | '助';
  word: string;
  chars: AnnotatedChar[];
  clauseBreakAfter?: boolean;
}

export interface GeneratedPhrase {
  id: string;
  text: string;
  initials: string;
  order: 'AB' | 'BA';
  orderLabel: string;
  sourceSplitIndex: number;
  firstSource: 'A' | 'B';
  secondSource: 'A' | 'B';
  patternCode: string;
  patternLabel: string;
  hasSubject: boolean;
  hasObject: boolean;
  hasAdverb?: boolean;
  hasModal: boolean;
  tier: QualityTier;
  tierLabel: '地道' | '通顺' | '勉强' | '硬凑';
  tierDesc: string;
  vibe: StyleVibe;
  score: number;
  /** CP-generator 引擎：整句在 880 万条短句语料中的原样命中次数（可选展示徽标） */
  seen?: number;
  segments: PhraseSegment[];
}

export type OrderFilter = 'all' | 'AB' | 'BA';
export type StructureFilter =
  | 'all'
  | 'SVO'
  | 'SV'
  | 'VO'
  | 'V'
  | 'full_svo'
  | 'compact'
  | 'with_modal';
export type VibeFilter = 'all' | 'daily' | 'poetic' | 'funny';

export type SemTag =
  | 'person'   // 人物/角色/代词：我、你、少年、少主、神仙、老板
  | 'animal'   // 动物/萌宠：小猫、狮子、海鸥、白鹿、企鹅
  | 'food'     // 固体食物：火锅、西瓜、鸡蛋、莲藕、炸鸡
  | 'drink'    // 饮品/汤酒：奶茶、可乐、咖啡、清茶、美酒
  | 'nature'   // 自然/风物：春风、月亮、星河、桃花、山海
  | 'item'     // 器物/物件：吉他、宝剑、灯笼、单车、雨伞
  | 'text'     // 文本/文艺载体：情书、字谜、故事、诗篇、日记
  | 'place'    // 场所/空间/界面：桌面、人间、江南、窗台、炸鸡店
  | 'abstract'; // 情感/时间/抽象：梦想、温柔、青春、欧气、秘密

export type StyleVibe = 'daily' | 'poetic' | 'funny';

export type ConstituentRole =
  | 'modal_init'
  | 'subject'
  | 'predicate'
  | 'object'
  | 'modal_end';

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

export interface CharAnalysis {
  index: number;
  rawChar: string;
  isChinese: boolean;
  isAlpha: boolean;
  defaultInitial: string;
  selectedInitial: string;
  altInitials: string[]; // 多音字候选首字母
  pinyinDisplay: string;
  mappedFromIUV?: 'i' | 'u' | 'v';
}

export interface ParsedStringInput {
  raw: string;
  trimmed: string;
  valid: boolean;
  error?: string;
  chars: CharAnalysis[];
  initials: string;
  hasIUV: boolean;
  hasPolyphone: boolean;
}

export interface AnnotatedChar {
  char: string;
  pinyin: string;
  initial: string;
  source: 'A' | 'B';
}

export interface PhraseSegment {
  role: ConstituentRole;
  roleLabel: '语气词' | '主语' | '谓语' | '宾语';
  shortLabel: '语' | '主' | '谓' | '宾';
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
  sourceSplitIndex: number; // 前 sourceSplitIndex 个字对应第一个拼接串
  firstSource: 'A' | 'B';
  secondSource: 'A' | 'B';
  patternCode: string;      // 如 "SVO", "SVOM", "SV", "VO", "VOM", "MSVO"
  patternLabel: string;     // 如 "主 + 谓 + 宾", "主 + 谓 + 宾 + 语气词"
  hasSubject: boolean;
  hasObject: boolean;
  hasModal: boolean;
  vibe: StyleVibe;
  score: number;
  segments: PhraseSegment[];
}

export type OrderFilter = 'all' | 'AB' | 'BA';
export type StructureFilter = 'all' | 'full_svo' | 'compact' | 'with_modal';
export type VibeFilter = 'all' | StyleVibe;

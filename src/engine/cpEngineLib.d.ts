/**
 * cpEngineLib.js (vendored CP-generator engine v2) 的类型声明。
 * 原实现为无类型的单文件 JS，这里仅声明「首字母造句工坊」用到的表面 API。
 */

export type CpSegRole = 'M' | 'S' | 'D' | 'V' | 'O' | 'P' | 'X';

export interface CpSeg {
  role: CpSegRole;
  t: string;
  py: string[];
}

export interface CpGenerated {
  text: string;
  segs: CpSeg[];
  order: 'AB' | 'BA';
  tier: number;
  struct: 'SVO' | 'SV' | 'VO' | 'V';
  score: number;
  /** 语料原句命中次数（0 表示并非整句原样出现） */
  seen: number;
}

export interface CpGenerateOptions {
  swap?: boolean;
  particles?: boolean;
  mods?: boolean;
  struct?: 'SVO' | 'SV' | 'VO' | 'V';
  limit?: number;
  raw?: boolean;
}

export interface CpEngineInstance {
  generate: (a: string, b: string, opts?: CpGenerateOptions) => CpGenerated[];
  wordCount: number;
  pairCount: number;
  phraseCount: number;
}

export declare const PhraseEngine: {
  create(D: unknown): CpEngineInstance;
  unpack(D: unknown): unknown;
  VALID: string;
  PARTICLES: Record<string, string[]>;
  PARTICLE_PY: Record<string, string>;
  AFTER_LE: Record<string, number>;
};

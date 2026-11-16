import { pinyin } from 'pinyin-pro';
import { CharAnalysis, ParsedStringInput } from './types';

export const VALID_PINYIN_INITIALS = new Set([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q',
  'r', 's', 't', 'w', 'x', 'y', 'z',
]);

export const MAX_INPUT_CHARS = 12;

const HAN_REGEX = /^\p{Script=Han}$/u;
const ALPHA_REGEX = /^[a-zA-Z]$/;

const IUV_MAP: Record<'i' | 'u' | 'v', string> = {
  i: 'y',
  u: 'w',
  v: 'y',
};

// 常见多音字（首字母不同且日常/姓氏高频）
const COMMON_POLYPHONE_INITIALS: Record<string, string[]> = {
  长: ['c', 'z'],
  乐: ['l', 'y'],
  行: ['x', 'h'],
  重: ['z', 'c'],
  单: ['d', 's', 'c'],
  曾: ['c', 'z'],
  沈: ['s', 'c'],
  解: ['j', 'x'],
  区: ['q', 'o'],
  查: ['c', 'z'],
  仇: ['c', 'q'],
  朝: ['c', 'z'],
  传: ['c', 'z'],
  藏: ['c', 'z'],
  调: ['d', 't'],
  弹: ['t', 'd'],
  奇: ['q', 'j'],
  厦: ['x', 's'],
  臭: ['c', 'x'],
  省: ['s', 'x'],
  率: ['l', 's'],
  降: ['j', 'x'],
  强: ['q', 'j'],
  卡: ['k', 'q'],
  壳: ['k', 'q'],
  扒: ['b', 'p'],
  便: ['b', 'p'],
  泊: ['b', 'p'],
  参: ['c', 's'],
  澄: ['c', 'd'],
  攒: ['z', 'c'],
  提: ['t', 'd'],
  阿: ['a', 'e'],
  恶: ['e', 'w'],
  给: ['g', 'j'],
  颈: ['j', 'g'],
  龟: ['g', 'j', 'q'],
  吭: ['k', 'h'],
  巷: ['x', 'h'],
  稽: ['j', 'q'],
  系: ['x', 'j'],
  茄: ['q', 'j'],
  贾: ['j', 'g'],
  见: ['j', 'x'],
  校: ['x', 'j'],
  芥: ['j', 'g'],
  矜: ['j', 'q'],
  溃: ['k', 'h'],
  蔓: ['m', 'w'],
  秘: ['m', 'b'],
  鸟: ['n', 'd'],
  弄: ['n', 'l'],
  刨: ['p', 'b'],
  炮: ['p', 'b'],
  瀑: ['p', 'b'],
  栖: ['q', 'x'],
  亲: ['q', 'x'],
  折: ['z', 's'],
  识: ['s', 'z'],
  宿: ['s', 'x'],
  汤: ['t', 's'],
  陶: ['t', 'y'],
  尾: ['w', 'y'],
  尉: ['w', 'y'],
  蔚: ['w', 'y'],
  纤: ['x', 'q'],
  吓: ['x', 'h'],
  叶: ['y', 'x'],
  遗: ['y', 'w'],
  吁: ['x', 'y'],
  轧: ['y', 'z', 'g'],
  粘: ['z', 'n'],
  属: ['s', 'z'],
  幢: ['z', 'c'],
};

export function getWordInitials(word: string): string {
  const arr = pinyin(word, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
  });
  return arr.map((s) => s.toLowerCase().trim()).join('');
}

export function getWordPinyinArray(word: string): string[] {
  return pinyin(word, {
    type: 'array',
  });
}

export function parseUserString(
  raw: string,
  overrides: Record<number, string> = {},
  allowIUVMapping = true
): ParsedStringInput {
  // 自动忽略首尾及中间空白符，方便用户输入如 "z j d" 或多字短语
  const cleaned = raw.replace(/\s+/g, '');
  const codePoints = Array.from(cleaned);

  if (codePoints.length === 0) {
    return {
      raw,
      trimmed: cleaned,
      valid: false,
      error: '请输入至少 1 个字符（汉字或英文字母，不限 2–3 字）',
      chars: [],
      initials: '',
      hasIUV: false,
      hasPolyphone: false,
    };
  }

  if (codePoints.length > MAX_INPUT_CHARS) {
    return {
      raw,
      trimmed: cleaned,
      valid: false,
      error: `当前长度为 ${codePoints.length}，单串建议不超过 ${MAX_INPUT_CHARS} 个字符以保证流畅度`,
      chars: [],
      initials: '',
      hasIUV: false,
      hasPolyphone: false,
    };
  }

  for (const ch of codePoints) {
    if (!HAN_REGEX.test(ch) && !ALPHA_REGEX.test(ch)) {
      return {
        raw,
        trimmed: cleaned,
        valid: false,
        error: `包含不支持的字符「${ch}」，请仅输入中文汉字或英文字母`,
        chars: [],
        initials: '',
        hasIUV: false,
        hasPolyphone: false,
      };
    }
  }

  const wordFirsts = pinyin(cleaned, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
  });
  const wordPinyins = pinyin(cleaned, {
    type: 'array',
  });

  const chars: CharAnalysis[] = [];
  let hasIUV = false;
  let hasPolyphone = false;

  for (let i = 0; i < codePoints.length; i++) {
    const ch = codePoints[i];
    if (HAN_REGEX.test(ch)) {
      let defaultInit = (wordFirsts[i] || '').toLowerCase();
      if (!VALID_PINYIN_INITIALS.has(defaultInit)) {
        defaultInit = 'y';
      }

      const explicitAlts = COMMON_POLYPHONE_INITIALS[ch];
      const altSet = new Set<string>([defaultInit]);
      if (explicitAlts) {
        for (const a of explicitAlts) {
          if (VALID_PINYIN_INITIALS.has(a)) altSet.add(a);
        }
      }
      const altInitials = Array.from(altSet);
      if (altInitials.length > 1) {
        hasPolyphone = true;
      }

      const override = overrides[i];
      const selectedInitial =
        override && altInitials.includes(override) ? override : defaultInit;

      chars.push({
        index: i,
        rawChar: ch,
        isChinese: true,
        isAlpha: false,
        defaultInitial: defaultInit,
        selectedInitial,
        altInitials,
        pinyinDisplay: wordPinyins[i] || selectedInitial,
      });
    } else {
      const lower = ch.toLowerCase();
      if (lower === 'i' || lower === 'u' || lower === 'v') {
        hasIUV = true;
        if (!allowIUVMapping) {
          return {
            raw,
            trimmed: cleaned,
            valid: false,
            error: `汉语拼音中没有以「${lower.toUpperCase()}」开头的汉字，可开启 i/u/v 谐音映射`,
            chars: [],
            initials: '',
            hasIUV: true,
            hasPolyphone: false,
          };
        }
        const mapped = IUV_MAP[lower];
        chars.push({
          index: i,
          rawChar: ch,
          isChinese: false,
          isAlpha: true,
          defaultInitial: mapped,
          selectedInitial: mapped,
          altInitials: [mapped],
          pinyinDisplay: `${lower}→${mapped}`,
          mappedFromIUV: lower,
        });
      } else {
        chars.push({
          index: i,
          rawChar: ch,
          isChinese: false,
          isAlpha: true,
          defaultInitial: lower,
          selectedInitial: lower,
          altInitials: [lower],
          pinyinDisplay: lower,
        });
      }
    }
  }

  return {
    raw,
    trimmed: cleaned,
    valid: true,
    chars,
    initials: chars.map((c) => c.selectedInitial).join(''),
    hasIUV,
    hasPolyphone,
  };
}

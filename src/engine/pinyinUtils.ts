import { pinyin } from 'pinyin-pro';
import charmapData from './charmapData.json';
import { ParsedCharToken, ParsedStringInput } from './types';

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

// 作姓氏时读音不同的字（借鉴自 CP-generator，用于人名首字智能识别及多音切换）
const SURNAME_INITIALS: Record<string, string> = {
  单: 's',
  曾: 'z',
  解: 'x',
  仇: 'q',
  区: 'o',
  查: 'z',
  翟: 'z',
  尉: 'y',
  繁: 'p',
  秘: 'b',
  覃: 'q',
  种: 'c',
  折: 's',
  召: 's',
  朴: 'p',
  盖: 'g',
  员: 'y',
  贾: 'j',
  沈: 's',
  石: 's',
};

// 常见非姓氏固定词前缀保护（避免“简单/曾经/解决/查询”等普通词首字被误判为姓氏）
const NON_SURNAME_WORDS = new Set([
  '单位', '单纯', '单独', '单身', '单车', '单词', '单一', '单曲',
  '曾经', '曾祖',
  '解决', '解释', '解放', '解散', '解剖', '解除', '解锁',
  '仇恨', '仇人', '仇敌',
  '区域', '区别', '区分', '区间',
  '查询', '查找', '查看', '查房', '查明',
  '秘密', '秘诀', '秘书', '秘籍',
  '繁荣', '繁华', '繁忙', '繁星',
  '种植', '种子', '种类', '种族',
  '折腾', '折磨', '折扣', '折纸',
  '召唤', '召集', '召开',
  '朴素', '朴实',
  '盖子', '盖章', '盖饭',
  '员工',
  '石头', '石榴', '石化',
]);

const EXTRA_POLYPHONES: Record<string, string[]> = {
  长: ['c', 'z'],
  乐: ['l', 'y'],
  行: ['x', 'h'],
  重: ['z', 'c'],
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
  便: ['b', 'p'],
  参: ['c', 's'],
  提: ['t', 'd'],
  阿: ['a', 'e'],
  恶: ['e', 'w'],
  给: ['g', 'j'],
  系: ['x', 'j'],
  校: ['x', 'j'],
  宿: ['s', 'x'],
  吓: ['x', 'h'],
  属: ['s', 'z'],
};

const CM_POLY: Record<string, string> = charmapData.p;

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
  // 自动忽略空格与常见分隔符（· . - _ , ， 、）
  const cleaned = raw.replace(/[\s·.\-_,，、]+/g, '');
  const codePoints = Array.from(cleaned);

  if (codePoints.length === 0) {
    return {
      raw,
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

  const chars: ParsedCharToken[] = [];
  let hasIUV = false;
  let hasPolyphone = false;

  for (let i = 0; i < codePoints.length; i++) {
    const ch = codePoints[i];
    if (HAN_REGEX.test(ch)) {
      let defaultInit = (wordFirsts[i] || '').toLowerCase();
      if (!VALID_PINYIN_INITIALS.has(defaultInit)) {
        defaultInit = 'y';
      }

      // 若位于首字、是典型多音姓氏、且当前不是常见普通双字词（2~3字人名场景），优先采用姓氏声母
      const surnameInit = SURNAME_INITIALS[ch];
      const prefix2 = codePoints.slice(0, 2).join('');
      if (
        i === 0 &&
        surnameInit &&
        codePoints.length >= 2 &&
        codePoints.length <= 3 &&
        !NON_SURNAME_WORDS.has(prefix2)
      ) {
        defaultInit = surnameInit;
      }

      const altSet = new Set<string>([defaultInit]);
      if (CM_POLY[ch]) {
        for (const a of CM_POLY[ch]) {
          if (VALID_PINYIN_INITIALS.has(a)) altSet.add(a);
        }
      }
      if (EXTRA_POLYPHONES[ch]) {
        for (const a of EXTRA_POLYPHONES[ch]) {
          if (VALID_PINYIN_INITIALS.has(a)) altSet.add(a);
        }
      }
      if (surnameInit && VALID_PINYIN_INITIALS.has(surnameInit)) {
        altSet.add(surnameInit);
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
          selectedInitial: lower,
          altInitials: [lower],
          pinyinDisplay: lower,
        });
      }
    }
  }

  return {
    raw,
    valid: true,
    chars,
    initials: chars.map((c) => c.selectedInitial).join(''),
    hasIUV,
    hasPolyphone,
  };
}

import { pinyin } from 'pinyin-pro';
import { CharAnalysis, ParsedStringInput } from './types';

export const VALID_PINYIN_INITIALS = new Set([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q',
  'r', 's', 't', 'w', 'x', 'y', 'z',
]);

const HAN_REGEX = /^\p{Script=Han}$/u;
const ALPHA_REGEX = /^[a-zA-Z]$/;

const IUV_MAP: Record<'i' | 'u' | 'v', string> = {
  i: 'y',
  u: 'w',
  v: 'y',
};

// 常见多音字（首字母不同且日常/姓氏高频），优先只展示现代汉语常用首字母避免生僻古音干扰
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
  畜: ['c', 'x'],
  省: ['s', 'x'],
  率: ['l', 's'],
  降: ['j', 'x'],
  强: ['q', 'j'],
  倔: ['j'],
  卡: ['k', 'q'],
  壳: ['k', 'q'],
  扒: ['b', 'p'],
  辟: ['b', 'p'],
  便: ['b', 'p'],
  泊: ['b', 'p'],
  参: ['c', 's'],
  差: ['c'],
  称: ['c'],
  澄: ['c', 'd'],
  尺: ['c'],
  处: ['c'],
  伺: ['c', 's'],
  攒: ['z', 'c'],
  沓: ['t', 'd'],
  提: ['t', 'd'],
  度: ['d'],
  囤: ['t', 'd'],
  阿: ['a', 'e'],
  恶: ['e', 'w'],
  佛: ['f'],
  给: ['g', 'j'],
  颈: ['j', 'g'],
  龟: ['g', 'j', 'q'],
  吭: ['k', 'h'],
  巷: ['x', 'h'],
  哄: ['h'],
  稽: ['j', 'q'],
  系: ['x', 'j'],
  茄: ['q', 'j'],
  贾: ['j', 'g'],
  见: ['j', 'x'],
  校: ['x', 'j'],
  侥: ['j', 'y'],
  角: ['j'],
  脚: ['j'],
  觉: ['j'],
  嚼: ['j'],
  芥: ['j', 'g'],
  矜: ['j', 'q'],
  劲: ['j'],
  溃: ['k', 'h'],
  烙: ['l'],
  勒: ['l'],
  俩: ['l'],
  撩: ['l'],
  露: ['l'],
  陆: ['l'],
  绿: ['l'],
  蔓: ['m', 'w'],
  埋: ['m'],
  脉: ['m'],
  氓: ['m'],
  秘: ['m', 'b'],
  模: ['m'],
  抹: ['m'],
  缪: ['m'],
  难: ['n'],
  泥: ['n'],
  鸟: ['n', 'd'],
  尿: ['n', 's'],
  弄: ['n', 'l'],
  疟: ['n', 'y'],
  娜: ['n'],
  胖: ['p', 'x'],
  刨: ['p', 'b'],
  炮: ['p', 'b'],
  喷: ['p'],
  朴: ['p'],
  瀑: ['p', 'b'],
  曝: ['p', 'b'],
  栖: ['q', 'x'],
  翘: ['q'],
  切: ['q'],
  亲: ['q', 'x'],
  曲: ['q'],
  雀: ['q'],
  塞: ['s'],
  色: ['s'],
  煞: ['s'],
  杉: ['s'],
  折: ['z', 's'],
  什: ['s'],
  识: ['s', 'z'],
  似: ['s'],
  宿: ['s', 'x'],
  遂: ['s'],
  汤: ['t', 's'],
  趟: ['t'],
  陶: ['t', 'y'],
  拓: ['t'],
  尾: ['w', 'y'],
  尉: ['w', 'y'],
  蔚: ['w', 'y'],
  纤: ['x', 'q'],
  吓: ['x', 'h'],
  鲜: ['x'],
  相: ['x'],
  削: ['x'],
  血: ['x'],
  殷: ['y'],
  钥: ['y'],
  叶: ['y', 'x'],
  遗: ['y', 'w'],
  屹: ['y'],
  吁: ['x', 'y'],
  予: ['y'],
  约: ['y'],
  晕: ['y'],
  载: ['z'],
  择: ['z'],
  扎: ['z'],
  轧: ['y', 'z', 'g'],
  粘: ['z', 'n'],
  涨: ['z'],
  着: ['z'],
  正: ['z'],
  殖: ['z'],
  中: ['z'],
  种: ['z'],
  轴: ['z'],
  属: ['s', 'z'],
  著: ['z'],
  转: ['z'],
  幢: ['z', 'c'],
  综: ['z'],
  钻: ['z'],
  柞: ['z'],
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
  const trimmed = raw.trim();
  const codePoints = Array.from(trimmed);

  if (codePoints.length === 0) {
    return {
      raw,
      trimmed,
      valid: false,
      error: '请输入长度为 2 或 3 的字符串（汉字或字母）',
      chars: [],
      initials: '',
      hasIUV: false,
      hasPolyphone: false,
    };
  }

  if (codePoints.length < 2 || codePoints.length > 3) {
    return {
      raw,
      trimmed,
      valid: false,
      error: `当前长度为 ${codePoints.length}，请输入恰好 2 或 3 个字符`,
      chars: [],
      initials: '',
      hasIUV: false,
      hasPolyphone: false,
    };
  }

  // 检查是否包含非汉字且非英文字母字符
  for (const ch of codePoints) {
    if (!HAN_REGEX.test(ch) && !ALPHA_REGEX.test(ch)) {
      return {
        raw,
        trimmed,
        valid: false,
        error: `包含不支持的字符「${ch}」，请仅输入中文汉字或英文字母`,
        chars: [],
        initials: '',
        hasIUV: false,
        hasPolyphone: false,
      };
    }
  }

  // 对整串计算上下文拼音与首字母（确保“音乐”“长大”“重庆”等多音词自动识别正确）
  const wordFirsts = pinyin(trimmed, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
  });
  const wordPinyins = pinyin(trimmed, {
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
        // 极个别如“嗯(ǹg -> n)”已属合法，兜底保护
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
            trimmed,
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
    trimmed,
    valid: true,
    chars,
    initials: chars.map((c) => c.selectedInitial).join(''),
    hasIUV,
    hasPolyphone,
  };
}

import { ModalEntry, StyleVibe } from './types';
import { getWordInitials } from './pinyinUtils';

const RAW_MODALS: {
  w: string;
  pos: 'init' | 'end' | 'both';
  v: StyleVibe;
  wt: number;
}[] = [
  // 1字 句末高频自然语气词
  { w: '呀', pos: 'both', v: 'daily', wt: 96 },
  { w: '啊', pos: 'both', v: 'daily', wt: 95 },
  { w: '吧', pos: 'end', v: 'daily', wt: 96 },
  { w: '啦', pos: 'end', v: 'daily', wt: 96 },
  { w: '哦', pos: 'both', v: 'daily', wt: 94 },
  { w: '呢', pos: 'end', v: 'daily', wt: 94 },
  { w: '嘛', pos: 'end', v: 'daily', wt: 92 },
  { w: '吗', pos: 'end', v: 'daily', wt: 93 },
  { w: '哇', pos: 'both', v: 'funny', wt: 92 },
  { w: '哟', pos: 'both', v: 'funny', wt: 90 },
  { w: '耶', pos: 'end', v: 'funny', wt: 89 },
  { w: '呗', pos: 'end', v: 'funny', wt: 90 },
  { w: '呐', pos: 'end', v: 'poetic', wt: 88 },
  { w: '了', pos: 'end', v: 'daily', wt: 94 },
  { w: '哈', pos: 'both', v: 'funny', wt: 88 },
  { w: '呵', pos: 'end', v: 'funny', wt: 78 },
  { w: '哉', pos: 'end', v: 'poetic', wt: 68 },
  { w: '诶', pos: 'both', v: 'daily', wt: 89 },
  { w: '噢', pos: 'init', v: 'daily', wt: 86 },
  { w: '哎', pos: 'init', v: 'daily', wt: 89 },
  { w: '嗨', pos: 'init', v: 'daily', wt: 90 },
  { w: '喂', pos: 'init', v: 'funny', wt: 88 },
  { w: '咦', pos: 'init', v: 'funny', wt: 90 },
  { w: '哼', pos: 'init', v: 'funny', wt: 88 },

  // 2字 句首自然口语衔接词（长句润滑剂）
  { w: '其实', pos: 'init', v: 'daily', wt: 96 },
  { w: '原来', pos: 'init', v: 'daily', wt: 96 },
  { w: '听说', pos: 'init', v: 'daily', wt: 96 },
  { w: '果然', pos: 'init', v: 'daily', wt: 95 },
  { w: '刚好', pos: 'init', v: 'daily', wt: 95 },
  { w: '反正', pos: 'init', v: 'daily', wt: 94 },
  { w: '不如', pos: 'init', v: 'daily', wt: 95 },
  { w: '干脆', pos: 'init', v: 'funny', wt: 94 },
  { w: '也许', pos: 'init', v: 'poetic', wt: 94 },
  { w: '幸好', pos: 'init', v: 'daily', wt: 95 },
  { w: '明明', pos: 'init', v: 'daily', wt: 94 },
  { w: '居然', pos: 'init', v: 'funny', wt: 95 },
  { w: '竟然', pos: 'init', v: 'funny', wt: 94 },
  { w: '难道', pos: 'init', v: 'daily', wt: 93 },
  { w: '好像', pos: 'init', v: 'daily', wt: 94 },
  { w: '大概', pos: 'init', v: 'daily', wt: 93 },

  // 2字 句末口语语气词组
  { w: '好吗', pos: 'end', v: 'daily', wt: 95 },
  { w: '好吧', pos: 'end', v: 'daily', wt: 94 },
  { w: '对吧', pos: 'end', v: 'daily', wt: 94 },
  { w: '是吧', pos: 'end', v: 'daily', wt: 94 },
  { w: '行吗', pos: 'end', v: 'daily', wt: 93 },
  { w: '行吧', pos: 'end', v: 'daily', wt: 93 },
  { w: '的呀', pos: 'end', v: 'daily', wt: 93 },
  { w: '的吧', pos: 'end', v: 'daily', wt: 92 },
  { w: '的哦', pos: 'end', v: 'daily', wt: 92 },
  { w: '的呢', pos: 'end', v: 'daily', wt: 92 },
];

export const MODAL_ENTRIES: ModalEntry[] = RAW_MODALS.map((m) => ({
  word: m.w,
  initials: getWordInitials(m.w),
  pos: m.pos,
  vibe: m.v,
  weight: m.wt,
}));

import { ModalEntry, StyleVibe } from './types';
import { getWordInitials } from './pinyinUtils';

const RAW_MODALS: {
  w: string;
  pos: 'init' | 'end' | 'both';
  v: StyleVibe;
  wt: number;
}[] = [
  // 句末高频语气词
  { w: '呀', pos: 'both', v: 'daily', wt: 96 },
  { w: '啊', pos: 'both', v: 'daily', wt: 95 },
  { w: '吧', pos: 'end', v: 'daily', wt: 95 },
  { w: '啦', pos: 'end', v: 'daily', wt: 96 },
  { w: '哦', pos: 'both', v: 'daily', wt: 94 },
  { w: '呢', pos: 'end', v: 'daily', wt: 93 },
  { w: '嘛', pos: 'end', v: 'daily', wt: 92 },
  { w: '吗', pos: 'end', v: 'daily', wt: 91 },
  { w: '哇', pos: 'both', v: 'funny', wt: 93 },
  { w: '哟', pos: 'both', v: 'funny', wt: 90 },
  { w: '耶', pos: 'end', v: 'funny', wt: 89 },
  { w: '呗', pos: 'end', v: 'funny', wt: 89 },
  { w: '呐', pos: 'end', v: 'poetic', wt: 89 },
  { w: '了', pos: 'end', v: 'daily', wt: 92 },
  { w: '哈', pos: 'both', v: 'funny', wt: 88 },
  { w: '呵', pos: 'end', v: 'funny', wt: 82 },
  { w: '哉', pos: 'end', v: 'poetic', wt: 86 },
  { w: '诶', pos: 'both', v: 'daily', wt: 89 },
  { w: '噢', pos: 'init', v: 'daily', wt: 88 },
  { w: '哎', pos: 'init', v: 'daily', wt: 89 },
  { w: '嗨', pos: 'init', v: 'daily', wt: 90 },
  { w: '喂', pos: 'init', v: 'funny', wt: 88 },
  { w: '咦', pos: 'init', v: 'funny', wt: 90 },
  { w: '哼', pos: 'init', v: 'funny', wt: 89 },
];

export const MODAL_ENTRIES: ModalEntry[] = RAW_MODALS.map((m) => ({
  word: m.w,
  initials: getWordInitials(m.w),
  pos: m.pos,
  vibe: m.v,
  weight: m.wt,
}));

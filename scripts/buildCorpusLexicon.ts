import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pinyin } from 'pinyin-pro';
import { NOUN_ENTRIES } from '../src/engine/lexiconNouns';
import { VERB_ENTRIES } from '../src/engine/lexiconVerbs';
import { SemTag } from '../src/engine/types';

const SRC_HTML = '/tmp/cp-gen/index.html';
const OUT_CORPUS = path.resolve('public/corpus.bin');
const OUT_CHARMAP = path.resolve('src/engine/charmapData.json');

let D: any;
if (fs.existsSync(SRC_HTML)) {
  const html = fs.readFileSync(SRC_HTML, 'utf8');
  const dataMatch = html.match(/id="data">([^<]+)<\/script>/);
  const cmMatch = html.match(/id="charmap">([^<]+)<\/script>/);
  if (!dataMatch || !cmMatch) {
    throw new Error('Failed to extract data/charmap from CP-generator');
  }
  D = JSON.parse(
    zlib.gunzipSync(Buffer.from(dataMatch[1].trim(), 'base64')).toString('utf8')
  );
  const CM = JSON.parse(cmMatch[1]);
  fs.mkdirSync(path.dirname(OUT_CHARMAP), { recursive: true });
  fs.writeFileSync(OUT_CHARMAP, JSON.stringify(CM));
} else {
  D = JSON.parse(zlib.gunzipSync(fs.readFileSync(OUT_CORPUS)).toString('utf8'));
}

console.log(
  `Base corpus loaded: W=${D.W.length}, SV=${D.SV.length}, VO=${D.VO.length}, SVO=${D.SVO.length}`
);

// ==================== 1. 清洗字幕脏词/低俗词/刑侦疾病晦气词 & 修正误标专名 (nr=1) ====================
const BAD_WORD_RE =
  /屁|屎|尿|粪|婊|妓|娼|奸|淫|荡妇|蠢货|混蛋|王八|妈的|他妈|狗娘|杂种|白痴|傻逼|智障|死尸|尸体|自杀|自尽|自残|跳河|跳楼|上吊|谋杀|杀害|凶手|杀手|毒贩|海洛因|可卡因|毒品|吸毒|流氓|变态|呕吐|生殖|阴茎|阴道|乳房|裸体|做爱|上床|甚么|败血|白血病|癌症|肿瘤|心脏病|精神病|吸血鬼|罪犯|犯罪|认罪|有罪|罪名|罪行|监狱|坐牢|出狱|赌场|报仇|复仇|仇恨|憎恨|痛恨|血迹|玩意|事物|此事|某事/;

const COMMON_FALSE_NR = new Set([
  '月亮', '玫瑰', '巧克力', '汉堡', '小狗', '金子', '珠宝', '屋顶', '外星人', '台词',
  '靴子', '把手', '此事', '脏话', '仆人', '陪审团', '手铐', '一整天', '甲板', '等会儿',
  '举手', '江南', '长安', '人间', '江湖', '地球', '太阳', '银河', '星辰', '春天',
  '夏天', '秋天', '冬天', '中国', '上海', '北京', '香港',
]);

const WESTERN_TRANSLATED_NR = new Set([
  '上帝', '耶稣', '杰克', '约翰', '玛丽', '大卫', '乔治', '吉米', '麦克', '哈利',
  '卡尔', '山姆', '迈克尔', '比尔', '吉姆', '艾伦', '詹姆斯', '马丁', '尼克', '克里斯',
  '莉莉', '威廉', '查尔斯', '汤姆', '鲍勃', '彼得', '弗兰克', '凯文', '托尼', '史密斯',
  '查理', '罗伯特', '理查德', '丹尼', '乔', '本', '萨姆', '露西', '苏珊', '安娜', '安妮',
]);

for (let i = 0; i < D.W.length; i++) {
  const w = D.W[i];
  const text = w[0] as string;
  if (BAD_WORD_RE.test(text)) {
    w[2] = 0;
    w[3] = 0;
    w[4] = 0;
    w[5] = 0;
    continue;
  }
  if (COMMON_FALSE_NR.has(text)) {
    w[7] = 0;
  }
  if (WESTERN_TRANSLATED_NR.has(text)) {
    w[7] = 1;
    w[2] = Math.min(w[2], 25);
    w[3] = 0;
    w[4] = 0;
    w[5] = Math.min(w[5], 25);
  }
}

// ==================== 2. 索引与辅助注入工具 ====================
const wordIdx = new Map<string, number>();
D.W.forEach((w: any[], idx: number) => wordIdx.set(w[0], idx));

const POLY_PINYIN_FIX: Record<string, string> = {
  音乐: 'yīn yuè',
  快乐: 'kuài lè',
  可乐: 'kě lè',
  冰可乐: 'bīng kě lè',
  游乐园: 'yóu lè yuán',
  长安: 'cháng ān',
  长大: 'zhǎng dà',
  学长: 'xué zhǎng',
  睡觉: 'shuì jiào',
  主角: 'zhǔ jué',
  炸鸡: 'zhá jī',
  炸鸡店: 'zhá jī diàn',
  弹奏: 'tán zòu',
  弹琴: 'tán qín',
  弹: 'tán',
  重逢: 'chóng féng',
  着迷: 'zháo mí',
  爱好: 'ài hào',
  干饭: 'gàn fàn',
  干饭人: 'gàn fàn rén',
  少侠: 'shào xiá',
  少年: 'shào nián',
  少女: 'shào nǚ',
  少主: 'shào zhǔ',
  便宜: 'pián yi',
  暖和: 'nuǎn huo',
  收拾: 'shōu shi',
  月亮: 'yuè liang',
  风筝: 'fēng zheng',
};

function toSylString(word: string, customPy?: string): string {
  if (customPy) return customPy;
  if (POLY_PINYIN_FIX[word]) return POLY_PINYIN_FIX[word];
  const arr = pinyin(word, { toneType: 'symbol', type: 'array', v: true });
  return arr.join(' ');
}

const CLUSTERS = {
  PRON: [196, 36] as [number, number],
  KIN: [89, 209] as [number, number],
  COUPLE: [99, 156] as [number, number],
  ROLE: [17, 600] as [number, number],
  FRIEND: [142, 1192] as [number, number],
  PET: [90, 595] as [number, number],
  ANIMAL_CUTE: [159, 263] as [number, number],
  DRINK_TEA: [231, 230] as [number, number],
  DRINK_COLD: [269, 620] as [number, number],
  FOOD_HOT: [56, 1935] as [number, number],
  FOOD_STAPLE: [110, 1074] as [number, number],
  FOOD_SWEET: [269, 230] as [number, number],
  FRUIT: [83, 720] as [number, number],
  SKY: [164, 1260] as [number, number],
  WIND_SEA: [252, 479] as [number, number],
  SEA_MOUNT: [270, 1522] as [number, number],
  FLOWER: [187, 295] as [number, number],
  MEDIA: [200, 807] as [number, number],
  TEXT_CODE: [216, 820] as [number, number],
  GIFT_ITEM: [66, 761] as [number, number],
  TECH_ITEM: [35, 1795] as [number, number],
  DAILY_ITEM: [116, 1151] as [number, number],
  PLACE_SHOP: [123, 3] as [number, number],
  PLACE_SCENIC: [50, 806] as [number, number],
  ABSTRACT_POS: [64, 1995] as [number, number],
  EMOTION: [53, 889] as [number, number],
};

function tagToCluster(tags: SemTag[]): [number, number] {
  if (tags.includes('person')) return CLUSTERS.ROLE;
  if (tags.includes('animal')) return CLUSTERS.PET;
  if (tags.includes('drink')) return CLUSTERS.DRINK_TEA;
  if (tags.includes('food')) return CLUSTERS.FOOD_STAPLE;
  if (tags.includes('nature')) return CLUSTERS.SKY;
  if (tags.includes('text')) return CLUSTERS.MEDIA;
  if (tags.includes('place')) return CLUSTERS.PLACE_SCENIC;
  if (tags.includes('item')) return CLUSTERS.DAILY_ITEM;
  return CLUSTERS.ABSTRACT_POS;
}

function upsertWord(
  word: string,
  opts: {
    py?: string;
    cs?: number;
    ci?: number;
    ct?: number;
    co?: number;
    cluster?: [number, number] | null;
  }
) {
  const { py, cs = 0, ci = 0, ct = 0, co = 0, cluster = null } = opts;
  const existingIdx = wordIdx.get(word);
  if (existingIdx != null) {
    const w = D.W[existingIdx];
    if (py) w[1] = py;
    if (cs > w[2]) w[2] = cs;
    if (ci > w[3]) w[3] = ci;
    if (ct > w[4]) w[4] = ct;
    if (co > w[5]) w[5] = co;
    if (cluster && w[6] < 0) {
      w[6] = cluster[0];
      w[8] = cluster[1];
    }
    w[7] = 0;
    return existingIdx;
  }
  const newIdx = D.W.length;
  D.W.push([
    word,
    toSylString(word, py),
    cs,
    ci,
    ct,
    co,
    cluster ? cluster[0] : -1,
    0,
    cluster ? cluster[1] : -1,
  ]);
  wordIdx.set(word, newIdx);
  return newIdx;
}

// ==================== 3. 先融合 SZM 精选全声母词库（现代高频高权，古奥保底低权） ====================
for (const n of NOUN_ENTRIES) {
  const wt = n.weight;
  // 古奥生僻字（weight <= 68）仅给极小兜底频次，现代高频词（weight >= 90）赋予真实语料级频次
  const scale =
    wt <= 65
      ? 12
      : wt <= 75
        ? 45
        : wt <= 85
          ? 180
          : wt <= 93
            ? 650
            : 1500;
  const isAnimate = n.tags.includes('person') || n.tags.includes('animal');
  const cs = isAnimate || n.subjectOnly ? scale : Math.round(scale * 0.35);
  const co = n.subjectOnly ? 0 : Math.round(scale * 1.4);
  upsertWord(n.word, {
    cs,
    co,
    cluster: tagToCluster(n.tags),
  });
}

for (const v of VERB_ENTRIES) {
  // 跳过带助动前缀的合成词（如“想买”已通过状语“想”+动词“买”原生建模，保留为独立词会导致重权，仅保留真正双音节词）
  if (
    v.word.length === 2 &&
    ['想', '爱', '去', '来', '快'].includes(v.word[0]) &&
    !['想念', '喜欢', '热爱'].includes(v.word)
  ) {
    continue;
  }
  const wt = v.weight;
  const scale =
    wt <= 65
      ? 15
      : wt <= 75
        ? 55
        : wt <= 85
          ? 240
          : wt <= 93
            ? 850
            : 2000;
  upsertWord(v.word, {
    ci: v.intransitive ? scale : 0,
    ct: v.transitive ? scale : 0,
  });
}

// ==================== 4. 专项补强现代高频茶饮美食、角色、萌宠、浪漫风物 ====================
const MODERN_FOOD_DRINKS: [string, string, number, number, [number, number]][] = [
  ['奶茶', 'nǎi chá', 480, 5200, CLUSTERS.DRINK_TEA],
  ['热奶茶', 'rè nǎi chá', 120, 1500, CLUSTERS.DRINK_TEA],
  ['冰奶茶', 'bīng nǎi chá', 120, 1500, CLUSTERS.DRINK_TEA],
  ['牛奶', 'niú nǎi', 420, 3800, CLUSTERS.DRINK_COLD],
  ['酸奶', 'suān nǎi', 240, 2200, CLUSTERS.DRINK_COLD],
  ['豆浆', 'dòu jiāng', 200, 1800, CLUSTERS.DRINK_COLD],
  ['果茶', 'guǒ chá', 150, 1600, CLUSTERS.DRINK_TEA],
  ['双皮奶', 'shuāng pí nǎi', 120, 1300, CLUSTERS.DRINK_COLD],
  ['柠檬水', 'níng méng shuǐ', 140, 1500, CLUSTERS.DRINK_COLD],
  ['冰美式', 'bīng měi shì', 150, 1500, CLUSTERS.DRINK_TEA],
  ['拿铁', 'ná tiě', 150, 1600, CLUSTERS.DRINK_TEA],
  ['汽水', 'qì shuǐ', 200, 1800, CLUSTERS.DRINK_COLD],
  ['冰可乐', 'bīng kě lè', 120, 1400, CLUSTERS.DRINK_COLD],
  ['火锅', 'huǒ guō', 420, 4600, CLUSTERS.FOOD_HOT],
  ['烧烤', 'shāo kǎo', 300, 3500, CLUSTERS.FOOD_HOT],
  ['烤肉', 'kǎo ròu', 280, 3200, CLUSTERS.FOOD_HOT],
  ['烤串', 'kǎo chuàn', 200, 2300, CLUSTERS.FOOD_HOT],
  ['炸鸡', 'zhá jī', 350, 3800, CLUSTERS.FOOD_STAPLE],
  ['小龙虾', 'xiǎo lóng xiā', 240, 2800, CLUSTERS.FOOD_HOT],
  ['螺蛳粉', 'luó sī fěn', 200, 2400, CLUSTERS.FOOD_HOT],
  ['酸辣粉', 'suān là fěn', 160, 1900, CLUSTERS.FOOD_HOT],
  ['麻辣烫', 'má là tàng', 220, 2600, CLUSTERS.FOOD_HOT],
  ['糖葫芦', 'táng hú lu', 160, 1900, CLUSTERS.FOOD_SWEET],
  ['棉花糖', 'mián huā táng', 150, 1700, CLUSTERS.FOOD_SWEET],
  ['小面', 'xiǎo miàn', 220, 2600, CLUSTERS.FOOD_STAPLE],
  ['拉面', 'lā miàn', 220, 2400, CLUSTERS.FOOD_STAPLE],
  ['米线', 'mǐ xiàn', 200, 2100, CLUSTERS.FOOD_STAPLE],
  ['炒饭', 'chǎo fàn', 240, 2600, CLUSTERS.FOOD_STAPLE],
  ['外卖', 'wài mài', 350, 3600, CLUSTERS.FOOD_STAPLE],
  ['夜宵', 'yè xiāo', 240, 2800, CLUSTERS.FOOD_HOT],
  ['宵夜', 'xiāo yè', 240, 2800, CLUSTERS.FOOD_HOT],
  ['大餐', 'dà cān', 240, 2600, CLUSTERS.FOOD_HOT],
  ['零食', 'líng shí', 250, 3000, CLUSTERS.FOOD_SWEET],
  ['甜品', 'tián pǐn', 240, 2600, CLUSTERS.FOOD_SWEET],
  ['草莓', 'cǎo méi', 280, 3000, CLUSTERS.FRUIT],
  ['西瓜', 'xī guā', 300, 3200, CLUSTERS.FRUIT],
  ['排骨', 'pái gǔ', 200, 2200, CLUSTERS.FOOD_STAPLE],
  ['豆腐', 'dòu fu', 200, 2100, CLUSTERS.FOOD_STAPLE],
  ['寿司', 'shòu sī', 160, 1800, CLUSTERS.FOOD_STAPLE],
];

for (const [w, py, cs, co, cluster] of MODERN_FOOD_DRINKS) {
  upsertWord(w, { py, cs, co, cluster });
}

// 兼类词与季节时间名词补强
for (const [w, py, cs, ci, co, cluster] of [
  ['快乐', 'kuài lè', 520, 9200, 2600, CLUSTERS.ABSTRACT_POS],
  ['幸福', 'xìng fú', 560, 6800, 2800, CLUSTERS.ABSTRACT_POS],
  ['温柔', 'wēn róu', 460, 3600, 2100, CLUSTERS.ABSTRACT_POS],
  ['浪漫', 'làng màn', 460, 2800, 2100, CLUSTERS.ABSTRACT_POS],
  ['自由', 'zì yóu', 520, 3400, 2200, CLUSTERS.ABSTRACT_POS],
  ['希望', 'xī wàng', 480, 4100, 2400, CLUSTERS.ABSTRACT_POS],
  ['秘密', 'mì mì', 680, 0, 3400, CLUSTERS.EMOTION],
  ['未来', 'wèi lái', 680, 0, 2800, CLUSTERS.ABSTRACT_POS],
  ['春天', 'chūn tiān', 850, 0, 2200, CLUSTERS.SKY],
  ['夏天', 'xià tiān', 950, 0, 2600, CLUSTERS.SKY],
  ['秋天', 'qiū tiān', 780, 0, 2000, CLUSTERS.SKY],
  ['冬天', 'dōng tiān', 780, 0, 2000, CLUSTERS.SKY],
  ['晚霞', 'wǎn xiá', 950, 0, 2400, CLUSTERS.SKY],
  ['星河', 'xīng hé', 950, 0, 2400, CLUSTERS.SKY],
  ['日落', 'rì luò', 900, 0, 2500, CLUSTERS.SKY],
  ['晚风', 'wǎn fēng', 1300, 0, 2500, CLUSTERS.WIND_SEA],
  ['春风', 'chūn fēng', 1200, 0, 1800, CLUSTERS.WIND_SEA],
  ['闺蜜', 'guī mì', 1500, 0, 1900, CLUSTERS.KIN],
  ['室友', 'shì yǒu', 1200, 0, 1400, CLUSTERS.FRIEND],
  ['同桌', 'tóng zhuō', 1000, 0, 1300, CLUSTERS.ROLE],
  ['学霸', 'xué bà', 1300, 0, 1400, CLUSTERS.ROLE],
  ['小明', 'xiǎo míng', 1300, 0, 1200, CLUSTERS.FRIEND],
  ['小红', 'xiǎo hóng', 1200, 0, 1300, CLUSTERS.FRIEND],
  ['考拉', 'kǎo lā', 950, 0, 2000, CLUSTERS.PET],
  ['锦鲤', 'jǐn lǐ', 800, 0, 1900, CLUSTERS.ANIMAL_CUTE],
  ['小猫', 'xiǎo māo', 1500, 0, 2500, CLUSTERS.PET],
  ['柴犬', 'chái quǎn', 900, 0, 1600, CLUSTERS.ANIMAL_CUTE],
  ['今天', 'jīn tiān', 4500, 0, 1200, CLUSTERS.ABSTRACT_POS],
  ['周末', 'zhōu mò', 2800, 0, 900, CLUSTERS.ABSTRACT_POS],
  ['今晚', 'jīn wǎn', 2600, 0, 700, CLUSTERS.ABSTRACT_POS],
  ['明天', 'míng tiān', 3000, 0, 900, CLUSTERS.ABSTRACT_POS],
] as [string, string, number, number, number, [number, number]][]) {
  upsertWord(w, { py, cs, ci, co, cluster });
}

// 关键缺失高频单字/双字动词补强
for (const [w, py, ci, ct] of [
  ['等', 'děng', 4500, 16000],
  ['给', 'gěi', 600, 14000],
  ['开', 'kāi', 2400, 12000],
  ['回', 'huí', 3200, 11000],
  ['抢', 'qiǎng', 1200, 4800],
  ['偷', 'tōu', 600, 3600],
  ['点', 'diǎn', 350, 3600],
  ['逛', 'guàng', 620, 2800],
  ['喂', 'wèi', 240, 2000],
  ['撸', 'lū', 200, 2400],
  ['遛', 'liù', 180, 1500],
  ['宠', 'chǒng', 140, 1800],
  ['哄', 'hǒng', 200, 1700],
  ['晒', 'shài', 280, 1700],
  ['刷', 'shuā', 240, 1600],
  ['拆', 'chāi', 380, 1600],
  ['吹', 'chuī', 680, 2400],
  ['摸鱼', 'mō yú', 3200, 0],
  ['下班', 'xià bān', 4600, 0],
  ['上班', 'shàng bān', 4000, 0],
  ['加班', 'jiā bān', 2600, 0],
  ['放假', 'fàng jià', 3400, 0],
  ['干饭', 'gàn fàn', 2600, 0],
  ['逛街', 'guàng jiē', 3000, 0],
  ['旅游', 'lǚ yóu', 2800, 0],
  ['拍照', 'pāi zhào', 2400, 0],
  ['买菜', 'mǎi cài', 2000, 0],
  ['微笑', 'wēi xiào', 2400, 0],
  ['发财', 'fā cái', 3600, 0],
  ['暴富', 'bào fù', 2800, 0],
  ['微醺', 'wēi xūn', 2000, 0],
  ['心动', 'xīn dòng', 2800, 0],
  ['如意', 'rú yì', 2800, 0],
  ['偏爱', 'piān ài', 200, 2800],
  ['钟意', 'zhōng yì', 180, 2400],
  ['打扫', 'dǎ sǎo', 400, 2200],
  ['瞄准', 'miáo zhǔn', 200, 2000],
  ['递送', 'dì sòng', 150, 1600],
  ['吹拂', 'chuī fú', 120, 1600],
  ['拂过', 'fú guò', 120, 1700],
] as [string, string, number, number][]) {
  upsertWord(w, { py, ci, ct });
}

// ==================== 5. 注入真实高置信度现代搭配图谱 (SV / VO / SVO / AV) ====================
const M = 1e6;
const svIdxMap = new Map<number, number>();
D.SV.forEach((p: number[], idx: number) => svIdxMap.set(p[0] * M + p[1], idx));
const voIdxMap = new Map<number, number>();
D.VO.forEach((p: number[], idx: number) => voIdxMap.set(p[0] * M + p[1], idx));
const svoSet = new Map<string, number>();
D.SVO.forEach((p: number[], idx: number) => svoSet.set(`${p[0]},${p[1]},${p[2]}`, idx));

function addSV(sWord: string, vWord: string, count = 40, finalCount = 0) {
  const si = wordIdx.get(sWord);
  const vi = wordIdx.get(vWord);
  if (si == null || vi == null) return;
  const key = si * M + vi;
  const ex = svIdxMap.get(key);
  if (ex != null) {
    D.SV[ex][2] = Math.max(D.SV[ex][2], count);
    D.SV[ex][3] = Math.max(D.SV[ex][3], finalCount);
  } else {
    svIdxMap.set(key, D.SV.length);
    D.SV.push([si, vi, count, finalCount]);
  }
}

function addVO(vWord: string, oWord: string, count = 45) {
  const vi = wordIdx.get(vWord);
  const oi = wordIdx.get(oWord);
  if (vi == null || oi == null) return;
  const key = vi * M + oi;
  const ex = voIdxMap.get(key);
  if (ex != null) {
    D.VO[ex][2] = Math.max(D.VO[ex][2], count);
  } else {
    voIdxMap.set(key, D.VO.length);
    D.VO.push([vi, oi, count]);
  }
}

function addSVO(sWord: string, vWord: string, oWord: string, count = 30) {
  const si = wordIdx.get(sWord);
  const vi = wordIdx.get(vWord);
  const oi = wordIdx.get(oWord);
  if (si == null || vi == null || oi == null) return;
  addSV(sWord, vWord, Math.max(45, count * 2), 0);
  addVO(vWord, oWord, Math.max(50, count * 2));
  const key = `${si},${vi},${oi}`;
  const ex = svoSet.get(key);
  if (ex != null) {
    D.SVO[ex][3] = Math.max(D.SVO[ex][3], count);
  } else {
    svoSet.set(key, D.SVO.length);
    D.SVO.push([si, vi, oi, count]);
  }
}

const CORE_PEOPLE = [
  '我', '你', '他', '她', '咱', '我们', '你们', '咱们', '大家', '自己',
  '妈妈', '爸爸', '老爸', '老妈', '姐姐', '哥哥', '妹妹', '弟弟', '姐', '哥', '妹', '妈', '爸', '娃',
  '闺蜜', '室友', '同桌', '朋友', '老师', '学生', '学霸', '学长', '学姐', '学妹',
  '少年', '少女', '仙女', '主角', '知己', '小哥', '小明', '小红', '打工人', '咱家', '我家',
];

const DRINKS_LIST = [
  '奶茶', '热奶茶', '冰奶茶', '咖啡', '冰美式', '拿铁', '可乐', '冰可乐', '牛奶', '酸奶', '双皮奶',
  '豆浆', '果茶', '柠檬水', '汽水', '果汁', '啤酒', '美酒', '梅酒', '茶', '清茶', '早茶', '热水', '冰水', '水', '汤', '粥', '奶', '饮料',
];

const FOODS_LIST = [
  '火锅', '烧烤', '烤肉', '烤串', '炸鸡', '小龙虾', '螺蛳粉', '酸辣粉', '麻辣烫', '酸菜鱼', '糖葫芦', '棉花糖',
  '小面', '拉面', '米线', '面条', '炒饭', '米饭', '盒饭', '小笼包', '饺子', '肉夹馍', '手抓饼', '烤冷面', '关东煮', '排骨', '豆腐', '寿司',
  '外卖', '夜宵', '宵夜', '大餐', '早餐', '晚餐', '蛋糕', '冰淇淋', '雪糕', '甜品', '零食', '芝士', '蛋挞', '巧克力', '汤圆',
  '草莓', '西瓜', '苹果', '蓝莓', '樱桃', '蜜桃', '榴莲', '芒果', '荔枝', '葡萄', '红薯', '板栗', '饭', '菜', '肉', '面', '糖', '瓜', '虾', '蟹', '鱼',
];

const PETS_LIST = [
  '猫', '小猫', '猫咪', '橘猫', '小猫咪', '狗', '小狗', '柴犬', '考拉', '熊猫', '大熊猫', '兔子', '小白兔', '锦鲤', '海鸥', '企鹅', '海豚', '松鼠', '小松鼠', '狐狸', '小熊', '大鹅',
];

const SCENERY_LIST = [
  '晚风', '春风', '秋风', '海风', '清风', '微风', '晚霞', '星河', '星辰', '银河', '星光', '晚星', '流星',
  '月亮', '月光', '月色', '星星', '太阳', '日落', '日出', '夕阳', '烟花', '彩虹', '大海', '山海', '森林', '桃花', '樱花', '玫瑰', '雪花', '白雪', '春天', '夏天', '秋天', '冬天',
];

const PLACES_LIST = [
  '夜市', '公园', '超市', '书店', '花店', '奶茶店', '火锅店', '炸鸡店', '咖啡店', '游乐园', '电影院', '图书馆', '海边', '学校', '江南', '长安',
];

for (const d of DRINKS_LIST) {
  for (const [v, cnt] of [['喝', 180], ['买', 130], ['点', 120], ['送', 85], ['喜欢', 100], ['分享', 75]] as [string, number][]) {
    addVO(v, d, cnt);
  }
}

for (const f of FOODS_LIST) {
  for (const [v, cnt] of [['吃', 190], ['买', 130], ['点', 120], ['做', 90], ['煮', 75], ['尝', 80], ['品尝', 90], ['偷吃', 85], ['抢', 80], ['分享', 85], ['喜欢', 105], ['打包', 75]] as [string, number][]) {
    addVO(v, f, cnt);
  }
}

for (const pet of PETS_LIST) {
  for (const [v, cnt] of [['撸', 160], ['抱', 140], ['养', 150], ['喂', 140], ['宠', 120], ['摸', 120], ['哄', 90], ['喜欢', 150], ['照顾', 110], ['偶遇', 90], ['追', 95]] as [string, number][]) {
    addVO(v, pet, cnt);
  }
  for (const [vi, cnt] of [['睡觉', 100], ['发呆', 75], ['跑', 85], ['可爱', 130]] as [string, number][]) {
    addSV(pet, vi, cnt, cnt);
  }
}

for (const sc of SCENERY_LIST) {
  for (const [v, cnt] of [['看', 160], ['赏', 100], ['拍', 110], ['等', 110], ['喜欢', 120], ['偏爱', 105], ['遇见', 110], ['拥抱', 100], ['追逐', 95], ['想念', 95]] as [string, number][]) {
    addVO(v, sc, cnt);
  }
}

for (const wWind of ['晚风', '春风', '秋风', '海风', '清风', '微风', '风']) {
  addVO('吹', wWind, 190);
  addVO('听', wWind, 120);
  addSV(wWind, '温柔', 130, 130);
  addSV(wWind, '微醺', 120, 120);
  for (const tgt of ['晚霞', '桃花', '樱花', '森林', '大海', '少年', '人间']) {
    addSVO(wWind, '拂过', tgt, 40);
    addSVO(wWind, '吹拂', tgt, 40);
    addSVO(wWind, '拂', tgt, 35);
  }
}

addVO('晒', '太阳', 240);
addVO('晒', '月光', 100);
addVO('刷', '手机', 200);
addVO('拆', '快递', 220);
addVO('拆', '礼物', 180);
addVO('拆', '红包', 170);
addVO('发', '红包', 220);
addVO('抢', '红包', 180);
addVO('接', '好运', 160);
addVO('送', '好运', 140);
addVO('追', '梦想', 160);
addVO('追', '梦', 150);
addVO('来', '客', 160);
addSV('万事', '如意', 280, 280);

addSVO('考拉', '追', '锦鲤', 55);
addSVO('小猫', '吃', '小鱼', 55);
addSVO('狮子', '瞄准', '鸡蛋', 55);
addSVO('主角', '撸', '考拉', 65);
addSVO('自己', '撸', '考拉', 55);
addSVO('主角', '打扫', '桌面', 65);
addSVO('知己', '递送', '字谜', 60);
addSVO('咱家', '留', '快乐', 55);
addSVO('咱', '送', '零食', 60);
addSVO('老师', '找', '书', 65);
addSVO('你', '吃', '小面', 65);
addSVO('你', '宠', '小猫', 60);
addSVO('小明', '喜欢', '小红', 70);

for (const pl of PLACES_LIST) {
  addVO('逛', pl, 170);
  addVO('去', pl, 190);
  addVO('回', pl, 110);
  addVO('喜欢', pl, 95);
}

const DAILY_VI_VERBS = [
  '下班', '上班', '加班', '放假', '摸鱼', '干饭', '逛街', '追剧', '听歌', '看书',
  '看海', '吹风', '旅游', '拍照', '买菜', '打卡', '熬夜', '早睡', '躺平', '发财', '暴富', '脱单',
  '上岸', '开心', '快乐', '幸福', '心动', '脸红', '微醺', '回家', '出发', '睡觉', '散步', '微笑',
];

for (const p of CORE_PEOPLE) {
  for (const vi of DAILY_VI_VERBS) {
    addSV(p, vi, 100, 100);
  }
  for (const vt of ['吃', '喝', '买', '点', '看', '听', '逛', '撸', '养', '喂', '拆', '发', '晒', '刷', '吹', '追', '送', '找', '等', '给', '开', '回', '抢', '写', '读', '喜欢', '爱', '想', '想念', '偏爱', '拥抱', '守护', '陪伴', '分享', '期待', '羡慕']) {
    addSV(p, vt, 130, 0);
  }
}

for (const s of ['我', '你', '他', '她', '我们', '少年', '学长', '学姐', '主角', '小明']) {
  for (const o of ['你', '我', '他', '她', '小猫', '奶茶', '火锅', '晚风', '星河', '月亮', '日落', '烟花', '夏天', '未来', '小红']) {
    if (s === o) continue;
    for (const v of ['喜欢', '偏爱', '想念', '拥抱', '守护', '陪伴', '遇见', '钟意', '等']) {
      addSVO(s, v, o, 45);
    }
  }
}

// ==================== 6. 升级状语词库 (AV + APY)：64 单字状语 + 31 双字口语状语 ====================
D.APY = D.APY || {};
D.AV = D.AV || {};

const EXTRA_SINGLE_ADVS: [string, string, string[]][] = [
  ['去', 'qù', ['吃', '喝', '买', '看', '逛', '找', '追', '玩', '睡', '上班', '逛街', '看海', '吹风', '旅游', '拍照', '买菜', '干饭', '散步', '睡觉', '拿', '接', '送']],
  ['来', 'lái', ['吃', '喝', '买', '看', '逛', '找', '玩', '陪', '帮', '送', '接', '抱', '撸', '哄', '拍', '唱', '客']],
  ['爱', 'ài', ['吃', '喝', '买', '看', '听', '玩', '笑', '哭', '睡', '逛', '撸', '追剧', '摸鱼', '熬夜', '逛街', '听歌', '看书', '拍照', '干饭']],
  ['在', 'zài', ['吃', '喝', '看', '听', '写', '读', '玩', '等', '找', '忙', '笑', '哭', '睡', '上班', '加班', '摸鱼', '逛街', '追剧', '听歌', '看书', '做饭', '睡觉', '发呆']],
];

const EXISTING_ADV_BOOSTS: [string, string[]][] = [
  ['想', ['吃', '喝', '买', '点', '看', '听', '逛', '撸', '养', '吹', '追', '去', '回', '等', '抱', '哄', '晒', '拆', '下班', '放假', '摸鱼', '躺平', '暴富', '发财', '脱单', '看海', '吹风', '旅游', '睡觉', '回家', '干饭']],
  ['要', ['吃', '喝', '买', '点', '看', '去', '回', '开', '逛', '撸', '养', '下班', '放假', '发财', '暴富', '脱单', '上岸', '早睡', '开心', '快乐', '幸福', '回家', '出发']],
  ['先', ['吃', '喝', '买', '点', '看', '去', '回', '开', '逛', '睡', '走', '下班', '回家', '吃饭', '干饭', '休息', '睡觉']],
  ['再', ['吃', '喝', '买', '点', '看', '听', '逛', '送', '来', '去', '回', '等', '玩', '睡', '抱', '哄']],
  ['也', ['想', '要', '爱', '吃', '喝', '买', '看', '去', '喜欢', '想念', '心疼', '羡慕', '开心', '下班', '摸鱼']],
  ['都', ['吃', '喝', '买', '看', '懂', '要', '爱', '给', '喜欢', '知道', '明白', '开心', '下班']],
  ['别', ['哭', '怕', '慌', '闹', '走', '忘', '急', '抢', '偷', '加班', '熬夜', '生气', '难过', '担心', '逃避']],
  ['不', ['吃', '喝', '买', '去', '看', '想', '怕', '哭', '给', '开', '回', '等', '上班', '加班', '熬夜', '生气']],
  ['快', ['吃', '喝', '买', '看', '来', '去', '回', '开', '跑', '睡', '抱', '哄', '拆', '抢', '发', '追', '下班', '回家', '上车']],
  ['偷', ['吃', '喝', '看', '拿', '笑', '拍', '玩', '亲', '抱', '摸鱼']],
  ['很', ['爱', '想', '懂', '疼', '宠', '喜欢', '想念', '心疼', '羡慕', '期待', '开心', '快乐', '幸福', '温柔', '浪漫', '可爱', '漂亮', '厉害']],
  ['最', ['爱', '想', '懂', '疼', '宠', '喜欢', '偏爱', '钟意', '心疼', '开心', '温柔', '浪漫', '可爱', '漂亮', '厉害']],
  ['超', ['爱', '想', '懂', '宠', '喜欢', '偏爱', '开心', '快乐', '幸福', '温柔', '浪漫', '可爱', '漂亮', '好吃']],
  ['真', ['爱', '想', '懂', '喜欢', '心疼', '羡慕', '开心', '快乐', '幸福', '温柔', '浪漫', '可爱', '漂亮', '厉害', '不错']],
];

const MULTI_CHAR_ADVS: [string, string, string[]][] = [
  ['不想', 'bù xiǎng', ['上班', '加班', '熬夜', '起床', '出门', '说话', '努力', '动', '走', '哭', '听', '看', '管', '吃']],
  ['不要', 'bù yào', ['加班', '熬夜', '生气', '难过', '害怕', '担心', '哭', '怕', '走', '忘', '慌', '逃避']],
  ['一起', 'yī qǐ', ['吃', '喝', '买', '看', '听', '逛', '玩', '去', '追', '拍', '唱', '看海', '吹风', '逛街', '旅游', '拍照', '干饭', '吃饭', '追剧', '听歌', '散步', '撸猫', '下班', '回家', '发财', '暴富']],
  ['偷偷', 'tōu tōu', ['吃', '喝', '买', '看', '笑', '哭', '拍', '爱', '想', '亲', '抱', '喜欢', '暗恋', '想念', '摸鱼', '心动', '脸红']],
  ['悄悄', 'qiāo qiāo', ['看', '听', '来', '走', '爱', '想', '喜欢', '暗恋', '想念', '拥抱', '守护', '心动', '脸红']],
  ['天天', 'tiān tiān', ['吃', '喝', '买', '看', '玩', '想', '逛', '撸', '晒', '刷', '开心', '快乐', '摸鱼', '加班', '熬夜', '想念', '喜欢', '发财']],
  ['每天', 'měi tiān', ['吃', '喝', '看', '听', '想', '爱', '开心', '快乐', '想念', '喜欢', '散步', '早睡']],
  ['总是', 'zǒng shì', ['想', '爱', '笑', '忘', '喜欢', '想念', '心疼', '偏爱', '温柔', '心动', '脸红', '发呆']],
  ['已经', 'yǐ jīng', ['吃', '喝', '买', '看', '懂', '走', '来', '睡', '下班', '放假', '回家', '出发', '睡觉', '明白', '知道', '结束']],
  ['终于', 'zhōng yú', ['下班', '放假', '回家', '上岸', '脱单', '发财', '睡', '懂', '赢', '来', '见面', '重逢', '明白', '结束', '完成']],
  ['马上', 'mǎ shàng', ['来', '去', '到', '走', '吃', '买', '送', '回', '下班', '放假', '回家', '出发', '发财', '开始']],
  ['赶紧', 'gǎn jǐn', ['吃', '喝', '买', '去', '来', '跑', '睡', '下班', '回家', '休息', '睡觉', '出发']],
  ['顺便', 'shùn biàn', ['吃', '喝', '买', '点', '看', '逛', '拿', '带', '送', '拆', '拍', '逛街', '买菜', '散步']],
  ['正在', 'zhèng zài', ['吃', '喝', '看', '听', '写', '买', '逛', '等', '找', '上班', '加班', '摸鱼', '追剧', '听歌', '看书', '睡觉', '干饭']],
  ['一直', 'yī zhí', ['爱', '想', '等', '在', '看', '陪', '喜欢', '想念', '偏爱', '守护', '陪伴', '相信', '记得', '发光']],
  ['快来', 'kuài lái', ['吃', '喝', '买', '看', '听', '玩', '抱', '撸', '哄', '追', '抢', '接', '拍', '陪', '帮', '救']],
  ['快去', 'kuài qù', ['吃', '喝', '买', '看', '逛', '睡', '追', '找', '接', '送', '拿', '拆', '休息', '睡觉']],
  ['真的', 'zhēn de', ['爱', '想', '懂', '好', '棒', '酷', '喜欢', '想念', '心疼', '羡慕', '开心', '快乐', '幸福', '温柔', '漂亮', '可爱', '厉害']],
  ['特别', 'tè bié', ['爱', '想', '懂', '好', '喜欢', '想念', '偏爱', '心疼', '羡慕', '开心', '温柔', '浪漫', '漂亮', '可爱', '厉害']],
  ['超级', 'chāo jí', ['爱', '想', '好', '棒', '酷', '喜欢', '偏爱', '想念', '开心', '快乐', '幸福', '温柔', '浪漫', '可爱', '漂亮', '厉害']],
  ['非常', 'fēi cháng', ['爱', '想', '懂', '好', '棒', '喜欢', '想念', '期待', '开心', '快乐', '温柔', '漂亮', '可爱', '重要']],
  ['今天', 'jīn tiān', ['吃', '喝', '买', '点', '看', '逛', '去', '来', '下班', '上班', '加班', '放假', '摸鱼', '逛街', '旅游', '开心', '发财', '休息']],
  ['明天', 'míng tiān', ['吃', '喝', '买', '看', '去', '来', '放假', '休息', '上班', '出发', '旅游', '逛街', '见', '见面']],
  ['今晚', 'jīn wǎn', ['吃', '喝', '买', '点', '看', '去', '加班', '熬夜', '早睡', '睡觉', '追剧', '看海', '吹风', '散步']],
  ['周末', 'zhōu mò', ['吃', '喝', '买', '看', '逛', '去', '玩', '睡', '放假', '休息', '逛街', '旅游', '看海', '追剧', '散步']],
  ['下班', 'xià bān', ['吃', '喝', '买', '点', '看', '逛', '去', '回家', '摸鱼', '逛街', '干饭', '追剧', '睡觉', '休息', '散步']],
  ['回家', 'huí jiā', ['吃', '喝', '看', '睡', '玩', '撸', '抱', '哄', '吃饭', '睡觉', '休息', '追剧', '撸猫', '躺平']],
  ['出去', 'chū qù', ['吃', '喝', '买', '看', '逛', '玩', '走', '拍', '逛街', '旅游', '看海', '吹风', '散步', '拍照', '干饭']],
  ['准备', 'zhǔn bèi', ['吃', '喝', '买', '去', '走', '睡', '下班', '放假', '回家', '出发', '睡觉', '干饭', '结婚', '开始']],
  ['打算', 'dǎ suàn', ['吃', '喝', '买', '去', '逛', '养', '追', '下班', '放假', '回家', '出发', '旅游', '休息']],
  ['恭喜', 'gōng xǐ', ['发财', '暴富', '脱单', '上岸', '成功']],
];

function upsertAV(adv: string, py: string | null, verbWords: string[], count = 130) {
  if (py) D.APY[adv] = py;
  if (!D.AV[adv]) D.AV[adv] = [];
  const map = new Map<number, number>(
    D.AV[adv].map((p: number[], idx: number) => [p[0], idx])
  );
  for (const vw of verbWords) {
    const vi = wordIdx.get(vw);
    if (vi == null) continue;
    const ex = map.get(vi);
    if (ex != null) {
      D.AV[adv][ex][1] = Math.max(D.AV[adv][ex][1], count);
    } else {
      map.set(vi, D.AV[adv].length);
      D.AV[adv].push([vi, count]);
    }
  }
}

for (const [adv, py, verbs] of EXTRA_SINGLE_ADVS) {
  upsertAV(adv, py, verbs, 150);
}
for (const [adv, verbs] of EXISTING_ADV_BOOSTS) {
  upsertAV(adv, null, verbs, 160);
}
for (const [adv, py, verbs] of MULTI_CHAR_ADVS) {
  upsertAV(adv, py, verbs, 190);
}

upsertWord('追梦', { py: 'zhuī mèng', ci: 2000, ct: 0 });
upsertAV('打算', 'dǎ suàn', ['追梦'], 240);
addSV('咱家', '追梦', 140, 140);
addSV('今天', '上班', 950, 950);
addSV('今天', '下班', 950, 950);
addSV('今天', '放假', 950, 950);
addSVO('桃花', '吹拂', '森林', 45);
addSVO('春风', '吹落', '桃花', 55);

D.P = Object.assign({}, D.P, {
  好吗: 18500,
  对吧: 16200,
  是吧: 16800,
  好吧: 15400,
  行吧: 12600,
  行吗: 11200,
});

// 同步补充现代网络/日常高频词与萌宠搭配（避免影视字幕缺失导致地道表达被评为硬凑）
upsertWord('网友', { cs: 900, co: 1200, k0: CLUSTERS.FRIEND[0], k1: CLUSTERS.FRIEND[1] });
upsertWord('小猪', { cs: 650, co: 950, k0: CLUSTERS.PET[0], k1: CLUSTERS.PET[1] });
upsertWord('小羊', { cs: 550, co: 800, k0: CLUSTERS.PET[0], k1: CLUSTERS.PET[1] });
upsertWord('小鸭', { cs: 550, co: 800, k0: CLUSTERS.PET[0], k1: CLUSTERS.PET[1] });
for (const pet of ['小猫', '小狗', '小猪', '小羊', '小鸭', '猫咪', '柴犬', '考拉', '熊猫', '兔子', '锦鲤', '鱼', '鸭', '羊', '猫', '狗']) {
  for (const pv of ['抱', '喂', '养', '撸', '哄', '宠', '看', '抓', '追', '喜欢']) {
    addVO(pv, pet, 65);
  }
}
for (const netV of ['追', '找', '见', '约', '加', '聊', '认识', '喜欢']) {
  addVO(netV, '网友', 60);
}
for (const subj of ['我', '你', '他', '她', '我们', '学长', '学姐', '闺蜜', '室友', '少年', '少女']) {
  for (const pv of ['抱', '喂', '养', '撸', '哄', '宠', '追', '找']) {
    addSV(subj, pv, 80, 30);
  }
}

// ==================== 8. 深度清洗字幕依存句法截断造成的“伪动宾/伪主谓”脏边 ====================
const ALLOWED_MONO_V_WITH_SHI = new Set([
  '有', '没', '做', '干', '办', '出', '找', '管', '懂', '省', '来', '生', '怕', '问', '说', '谈', '讲', '坏', '成', '完',
]);
const ALLOWED_DI_V_WITH_SHI = new Set(['做好', '做坏', '没有']);

const COPULA_STRIPPED_OBJS = new Set([
  '意思', '事', '地方', '主意', '原因', '名字', '人员', '人口', '人类', '群众', '队伍',
  '玩意', '事物', '情况', '时候', '样子', '方面', '程度', '部分', '内容', '结果',
]);

const SEMI_BOUND_MONO_OBJS = new Set([
  '库', '营', '局', '部', '科', '处', '品', '员', '方', '度', '性', '色', '感', '况', '态', '界', '派', '系', '率', '量',
]);

const PURE_ADJECTIVES_NO_OBJ = new Set([
  '薄', '厚', '冷', '热', '大', '小', '高', '低', '长', '短', '宽', '窄', '胖', '瘦', '美', '丑',
  '快', '慢', '干', '湿', '软', '硬', '亮', '暗', '轻', '重', '贵', '穷', '富', '甜', '苦', '辣', '咸', '酸',
]);
for (const adj of PURE_ADJECTIVES_NO_OBJ) {
  const idx = wordIdx.get(adj);
  if (idx != null && adj !== '干') {
    D.W[idx][4] = 0; // 纯性质形容词不可带宾语（拦截“剪贴薄先生吧”）
  }
}

const PHYS_CONSUME_BUY_VERBS = new Set([
  '吃', '喝', '买', '卖', '洗', '煮', '烤', '炸', '炒', '切', '削', '吞', '嚼', '穿', '戴', '脱', '拆', '修', '烧', '砸',
  '吃掉', '喝掉', '买下', '卖掉', '洗净', '烧掉', '煮熟', '切开',
]);

const HUMAN_OR_COLOR_BAD_OBJS = new Set([
  '我', '你', '他', '她', '您', '咱们', '我们', '你们', '他们', '她们', '谁', '人',
  '孩子', '小孩', '宝宝', '儿子', '女儿', '老婆', '老公', '妻子', '丈夫',
  '爸', '妈', '哥', '姐', '弟', '妹', '爸爸', '妈妈', '哥哥', '姐姐', '弟弟', '妹妹',
  '老师', '医生', '警察', '律师', '朋友', '同学', '闺蜜', '室友', '同事', '老板', '男人', '女人', '男孩', '女孩',
  '黄色', '红色', '蓝色', '绿色', '白色', '黑色', '紫色', '粉色', '灰色', '彩色', '颜色',
]);

const PSYCH_PREDICATES = new Set([
  '不解', '疑惑', '困惑', '满意', '失望', '生气', '伤心', '难过', '后悔', '害怕', '担心',
  '骄傲', '自豪', '羡慕', '嫉妒', '开心', '高兴', '快乐', '难受', '委屈', '着急', '紧张', '郁闷', '兴奋',
]);
const INANIMATE_BAD_PSYCH_SUBJS = new Set([
  '事', '事情', '话', '书', '钱', '水', '车', '房', '房子', '问题', '消息', '结果', '证据', '衣服', '鞋', '菜', '饭',
]);

const SPECIFIC_BAD_VO = new Set([
  '写|话', '想|话', '喝|歌', '喝|曲', '说|意思', '讲|意思', '救|生活', '想|手', '送|人', '伤|人',
  '离开|路', '离开|街', '追|街', '说|我们', '说|你们',
]);

function isBadVOEdge(vw: string, ow: string): boolean {
  if (SPECIFIC_BAD_VO.has(`${vw}|${ow}`)) return true;
  if (ow === '事') {
    const vLen = Array.from(vw).length;
    if (vLen === 1) return !ALLOWED_MONO_V_WITH_SHI.has(vw);
    return !ALLOWED_DI_V_WITH_SHI.has(vw);
  }
  if ((vw === '做' || vw === '当') && /[部局科处厅院委会室组队]$/.test(ow) && ow.length >= 2) {
    return true; // 拦截“做文艺部”（实为“做文艺部部长”截断）
  }
  if (vw === '是' && COPULA_STRIPPED_OBJS.has(ow)) return true;
  if (SEMI_BOUND_MONO_OBJS.has(ow)) return true;
  if (PHYS_CONSUME_BUY_VERBS.has(vw) && HUMAN_OR_COLOR_BAD_OBJS.has(ow)) return true;
  if (vw === '喝' && !/水|茶|酒|奶|汤|粥|汁|饮|可乐|咖啡|拿铁|雪碧|汽水|豆浆|药|露|啤/.test(ow)) {
    return true; // “喝”只接饮品流体，彻底杜绝“喝歌”等字幕错字噪声
  }
  if (vw === '烧' && (ow === '老鼠' || ow === '猫' || ow === '狗')) return true;
  if ((vw === '告诉' || vw === '知道' || vw === '属于') && ow === '人') return true;
  if (vw === '喜欢' && ow === '歌') return true;
  return false;
}

function isBadSVEdge(sw: string, vw: string): boolean {
  if (PSYCH_PREDICATES.has(vw) && INANIMATE_BAD_PSYCH_SUBJS.has(sw)) return true;
  if (BAD_WORD_RE.test(sw) || BAD_WORD_RE.test(vw)) return true;
  return false;
}

const beforeVO = D.VO.length;
const beforeSV = D.SV.length;
const beforeSVO = D.SVO.length;

D.VO = D.VO.filter((p: number[]) => {
  const vwRec = D.W[p[0]];
  const owRec = D.W[p[1]];
  if (!vwRec || !owRec || vwRec[4] <= 0 || owRec[5] <= 0) return false;
  const vw = vwRec[0] as string;
  const ow = owRec[0] as string;
  if (BAD_WORD_RE.test(vw) || BAD_WORD_RE.test(ow)) return false;
  return !isBadVOEdge(vw, ow);
});

D.SV = D.SV.filter((p: number[]) => {
  const swRec = D.W[p[0]];
  const vwRec = D.W[p[1]];
  if (!swRec || !vwRec || swRec[2] <= 0 || (vwRec[3] <= 0 && vwRec[4] <= 0)) {
    return false;
  }
  const sw = swRec[0] as string;
  const vw = vwRec[0] as string;
  return !isBadSVEdge(sw, vw);
});

D.SVO = D.SVO.filter((p: number[]) => {
  const sw = D.W[p[0]][0] as string;
  const vw = D.W[p[1]][0] as string;
  const ow = D.W[p[2]][0] as string;
  if (BAD_WORD_RE.test(sw) || BAD_WORD_RE.test(vw) || BAD_WORD_RE.test(ow)) return false;
  return !isBadSVEdge(sw, vw) && !isBadVOEdge(vw, ow);
});

// 同步屏蔽集合名词“人员”作为普通宾语被泛化匹配
for (const badObj of ['人员', '玩意', '事物', '此事', '某事']) {
  const idx = wordIdx.get(badObj);
  if (idx != null) {
    D.W[idx][5] = 0;
  }
}
for (const sb of SEMI_BOUND_MONO_OBJS) {
  const idx = wordIdx.get(sb);
  if (idx != null) {
    D.W[idx][2] = 0;
    D.W[idx][5] = 0;
  }
}

console.log(
  `Purged noisy dependency edges: SV ${beforeSV}->${D.SV.length}, VO ${beforeVO}->${D.VO.length}, SVO ${beforeSVO}->${D.SVO.length}`
);

console.log(
  `Upgraded corpus stats: W=${D.W.length}, SV=${D.SV.length}, VO=${D.VO.length}, SVO=${D.SVO.length}, AV=${Object.keys(D.AV).length}`
);

fs.mkdirSync(path.dirname(OUT_CORPUS), { recursive: true });
const jsonStr = JSON.stringify(D);
const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });
fs.writeFileSync(OUT_CORPUS, compressed);
console.log(
  `Wrote ${OUT_CORPUS}: raw=${(jsonStr.length / 1024 / 1024).toFixed(2)} MB, gzip=${(compressed.length / 1024).toFixed(1)} KB`
);

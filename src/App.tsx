import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Dices,
  Filter,
  Info,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { InputCard } from './components/InputCard';
import { PhraseCard } from './components/PhraseCard';
import { generatePhrases } from './engine/generator';
import { parseUserString } from './engine/pinyinUtils';
import {
  OrderFilter,
  StructureFilter,
  VibeFilter,
} from './engine/types';

interface PresetPair {
  label: string;
  a: string;
  b: string;
}

const PRESETS: PresetPair[] = [
  { label: '周杰伦 + 昆凌', a: '周杰伦', b: '昆凌' },
  { label: 'zjd + szm', a: 'zjd', b: 'szm' },
  { label: '我 + 爱你', a: '我', b: '爱你' },
  { label: '春风 + 晚星', a: '春风', b: '晚星' },
  { label: '小猫 + 奶茶', a: '小猫', b: '奶茶' },
  { label: '今天 + 不想上班', a: '今天', b: '不想上班' },
  { label: '恭喜发财 + 万事如意', a: '恭喜发财', b: '万事如意' },
];

const RANDOM_POOL: [string, string][] = [
  ['星河', '少年'],
  ['火锅', '快乐'],
  ['海鸥', '晚霞'],
  ['小猫', '奶茶'],
  ['白鹿', '长安'],
  ['锦鲤', '好运'],
  ['可乐', '炸鸡'],
  ['今天', '不想上班'],
  ['宇航员', '月亮'],
  ['小猫咪', '晒太阳'],
  ['打工人', '喝咖啡'],
  ['恭喜发财', '万事如意'],
  ['春风十里', '桃花'],
  ['我', '想下班'],
  ['xswl', 'yyds'],
  ['klm', 'xzy'],
];

export const App: React.FC = () => {
  const [inputA, setInputA] = useState('周杰伦');
  const [inputB, setInputB] = useState('昆凌');
  const [overridesA, setOverridesA] = useState<Record<number, string>>({});
  const [overridesB, setOverridesB] = useState<Record<number, string>>({});
  const [allowIUV, setAllowIUV] = useState(true);

  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [structureFilter, setStructureFilter] =
    useState<StructureFilter>('all');
  const [vibeFilter, setVibeFilter] = useState<VibeFilter>('all');
  const [seed, setSeed] = useState(0);

  const handleChangeA = (val: string) => {
    setInputA(val);
    setOverridesA({});
    setSeed(0);
  };

  const handleChangeB = (val: string) => {
    setInputB(val);
    setOverridesB({});
    setSeed(0);
  };

  const handleSwapInputs = () => {
    setInputA(inputB);
    setInputB(inputA);
    setOverridesA(overridesB);
    setOverridesB(overridesA);
  };

  const handleApplyPreset = (a: string, b: string) => {
    setInputA(a);
    setInputB(b);
    setOverridesA({});
    setOverridesB({});
    setSeed(0);
  };

  const handleRandomPair = () => {
    const candidates = RANDOM_POOL.filter(
      ([a, b]) => !(a === inputA && b === inputB)
    );
    const pick =
      candidates[Math.floor(Math.random() * candidates.length)] ||
      RANDOM_POOL[0];
    handleApplyPreset(pick[0], pick[1]);
  };

  const parsedA = useMemo(
    () => parseUserString(inputA, overridesA, allowIUV),
    [inputA, overridesA, allowIUV]
  );
  const parsedB = useMemo(
    () => parseUserString(inputB, overridesB, allowIUV),
    [inputB, overridesB, allowIUV]
  );

  const bothValid = parsedA.valid && parsedB.valid;
  const anyIUV = parsedA.hasIUV || parsedB.hasIUV;

  const phrases = useMemo(() => {
    if (!bothValid) return [];
    return generatePhrases({
      initA: parsedA.initials,
      initB: parsedB.initials,
      orderFilter,
      structureFilter,
      vibeFilter,
      seed,
      limit: 21,
    });
  }, [
    bothValid,
    parsedA.initials,
    parsedB.initials,
    orderFilter,
    structureFilter,
    vibeFilter,
    seed,
  ]);

  const featuredPhrase = phrases[0] ?? null;
  const restPhrases = phrases.slice(1);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 pb-16">
      {/* 顶部栏 */}
      <header className="border-b border-stone-200/80 bg-white/85 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-amber-300 font-mono text-sm font-black tracking-tighter shadow-xs">
              SZM
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-stone-900">
                首字母造句工坊
              </h1>
              <p className="text-xs text-stone-500 hidden sm:block">
                双串首字母正逆序拼接 ·（主）谓（宾）+ 语气词 智能短语生成
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRandomPair}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
          >
            <Dices className="h-4 w-4 text-amber-700" />
            随机灵感
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">
        {/* 快捷示例芯片栏 */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-stone-500 mr-1">
            试试这些组合：
          </span>
          {PRESETS.map((p) => {
            const active =
              inputA.trim() === p.a && inputB.trim() === p.b;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => handleApplyPreset(p.a, p.b)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'border-stone-800 bg-stone-900 text-white shadow-xs'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* 双输入区 */}
        <section className="relative grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
          <InputCard
            slot="A"
            value={inputA}
            onChange={handleChangeA}
            parsed={parsedA}
            overrides={overridesA}
            onSelectPolyphone={(idx, init) =>
              setOverridesA((prev) => ({ ...prev, [idx]: init }))
            }
            placeholder="例如：周杰伦 或 zjd"
          />

          <div className="flex items-center justify-center py-0.5 md:py-0">
            <button
              type="button"
              onClick={handleSwapInputs}
              title="交换字符串 A 与 B"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-xs hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 transition-all cursor-pointer"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          <InputCard
            slot="B"
            value={inputB}
            onChange={handleChangeB}
            parsed={parsedB}
            overrides={overridesB}
            onSelectPolyphone={(idx, init) =>
              setOverridesB((prev) => ({ ...prev, [idx]: init }))
            }
            placeholder="例如：昆凌 或 szm"
          />
        </section>

        {/* i/u/v 谐音提示条 */}
        {anyIUV && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                现代汉语拼音中没有以 <code className="font-mono font-bold">I / U / V</code> 作为声母开头的汉字，支持按输入法惯例谐音映射（i→y, u→w, v→y）。
              </span>
            </div>
            <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowIUV}
                onChange={(e) => setAllowIUV(e.target.checked)}
                className="rounded border-amber-300 text-amber-700 focus:ring-amber-500"
              />
              开启 i/u/v 谐音映射
            </label>
          </div>
        )}

        {/* 首字母双序拼合可视化 */}
        {bothValid && (
          <section className="mt-5 rounded-2xl border border-stone-200/90 bg-white p-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold text-stone-500">
                  目标首字母序列（共 {parsedA.initials.length + parsedB.initials.length} 字）：
                </span>

                {/* 正序 A + B */}
                <button
                  type="button"
                  onClick={() =>
                    setOrderFilter((prev) => (prev === 'AB' ? 'all' : 'AB'))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all cursor-pointer ${
                    orderFilter === 'AB'
                      ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-stone-50/70 hover:bg-stone-100/80'
                  }`}
                >
                  <span className="font-medium text-stone-600">正序 A+B</span>
                  <span className="font-mono text-sm font-bold uppercase text-amber-700">
                    {parsedA.initials}
                  </span>
                  <span className="text-stone-300">+</span>
                  <span className="font-mono text-sm font-bold uppercase text-teal-700">
                    {parsedB.initials}
                  </span>
                </button>

                {/* 逆序 B + A */}
                <button
                  type="button"
                  onClick={() =>
                    setOrderFilter((prev) => (prev === 'BA' ? 'all' : 'BA'))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all cursor-pointer ${
                    orderFilter === 'BA'
                      ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-500/20'
                      : 'border-stone-200 bg-stone-50/70 hover:bg-stone-100/80'
                  }`}
                >
                  <span className="font-medium text-stone-600">交换 B+A</span>
                  <span className="font-mono text-sm font-bold uppercase text-teal-700">
                    {parsedB.initials}
                  </span>
                  <span className="text-stone-300">+</span>
                  <span className="font-mono text-sm font-bold uppercase text-amber-700">
                    {parsedA.initials}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSeed((s) => s + 1)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-stone-800 active:scale-[0.99] transition-all cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                换一批短语
              </button>
            </div>

            {/* 语法与风格筛选器 */}
            <div className="mt-3.5 flex flex-wrap items-center gap-y-2 gap-x-4 border-t border-stone-100 pt-3 text-xs">
              <div className="flex items-center gap-1.5 text-stone-500">
                <Filter className="h-3.5 w-3.5" />
                <span>筛选：</span>
              </div>

              {/* 顺序过滤 */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['all', '全部顺序'],
                    ['AB', '仅 A+B'],
                    ['BA', '仅 B+A'],
                  ] as [OrderFilter, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOrderFilter(val)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                      orderFilter === val
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <span className="hidden sm:inline text-stone-200">|</span>

              {/* 句式过滤 */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['all', '全部（主）谓（宾）'],
                    ['full_svo', '完整 主+谓+宾'],
                    ['compact', '精炼 主谓/谓宾'],
                    ['with_modal', '含语气词'],
                  ] as [StructureFilter, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStructureFilter(val)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                      structureFilter === val
                        ? 'bg-amber-700 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <span className="hidden sm:inline text-stone-200">|</span>

              {/* 风格过滤 */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['all', '全部风格'],
                    ['daily', '日常自然'],
                    ['poetic', '文艺浪漫'],
                    ['funny', '沙雕整活'],
                  ] as [VibeFilter, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setVibeFilter(val)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                      vibeFilter === val
                        ? 'bg-teal-700 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 结果展示区 */}
        <section className="mt-6">
          {!bothValid ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-sm font-semibold text-stone-700">
                请在上方输入两个汉字或字母字符串（不限 2–3 字）
              </p>
              <p className="mt-1 text-xs text-stone-500">
                支持单字、词语、短句或首字母缩写（如「我 + 爱你」「周杰伦 + 昆凌」「今天 + 不想上班」「zjd + szm」）
              </p>
            </div>
          ) : phrases.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-stone-700">
                当前细分筛选条件下暂无匹配短语
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {structureFilter === 'with_modal'
                  ? `提示：当前首尾字母（${parsedA.initials[0].toUpperCase()} / ${parsedA.initials.slice(-1).toUpperCase()} / ${parsedB.initials[0].toUpperCase()} / ${parsedB.initials.slice(-1).toUpperCase()}）可能不含现代汉语常用语气词，可切换至「全部（主）谓（宾）」查看`
                  : '建议放宽句式或风格筛选条件以查看全部结果'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOrderFilter('all');
                  setStructureFilter('all');
                  setVibeFilter('all');
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置筛选条件
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 首推大图卡 */}
              {featuredPhrase && (
                <PhraseCard phrase={featuredPhrase} featured />
              )}

              {/* 更多候选网格 */}
              {restPhrases.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {restPhrases.map((p) => (
                    <PhraseCard key={p.id} phrase={p} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 底部语法图例说明 */}
        <footer className="mt-10 rounded-2xl border border-stone-200/80 bg-white/70 p-4 text-xs text-stone-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-stone-700">语法图例：</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                主语（可选）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                谓语（必选核心动词）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                宾语（可选）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
                语气词（啊/呀/吧/啦/哦/呢/嘛等）
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-amber-700" />
                来自字符串 A
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-teal-700" />
                来自字符串 B
              </span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;

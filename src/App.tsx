import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Database,
  Dices,
  Filter,
  Info,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { InputCard } from './components/InputCard';
import { PhraseCard } from './components/PhraseCard';
import {
  CorpusEngineInstance,
  loadCorpusEngine,
} from './engine/corpusEngine';
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
  { label: '张三 + 李四', a: '张三', b: '李四' },
  { label: 'xm + xh', a: 'xm', b: 'xh' },
  { label: 'wm + xhs', a: 'wm', b: 'xhs' },
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
  ['lb', 'dzy'],
  ['wm', 'xhs'],
  ['xm', 'xh'],
  ['我', '爱你'],
];

const PAGE_SIZE = 15;

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
  const [allowParticles, setAllowParticles] = useState(true);
  const [allowAdverb, setAllowAdverb] = useState(true);

  const [page, setPage] = useState(0);
  const [seed, setSeed] = useState(0);

  const [corpusStats, setCorpusStats] = useState<{
    ready: boolean;
    words: number;
    pairs: number;
    advs: number;
  }>({
    ready: false,
    words: 0,
    pairs: 0,
    advs: 0,
  });

  useEffect(() => {
    let mounted = true;
    loadCorpusEngine()
      .then((eng: CorpusEngineInstance) => {
        if (!mounted) return;
        setCorpusStats({
          ready: true,
          words: eng.wordCount,
          pairs: eng.pairCount,
          advs: eng.advCount,
        });
      })
      .catch(() => {
        // 若离线环境未能加载压缩包，自动无缝使用内置规则词库兜底
      });
    return () => {
      mounted = false;
    };
  }, []);

  const resetPagination = () => {
    setPage(0);
  };

  const handleChangeA = (val: string) => {
    setInputA(val);
    setOverridesA({});
    setSeed(0);
    resetPagination();
  };

  const handleChangeB = (val: string) => {
    setInputB(val);
    setOverridesB({});
    setSeed(0);
    resetPagination();
  };

  const handleSwapInputs = () => {
    setInputA(inputB);
    setInputB(inputA);
    setOverridesA(overridesB);
    setOverridesB(overridesA);
    resetPagination();
  };

  const handleApplyPreset = (a: string, b: string) => {
    setInputA(a);
    setInputB(b);
    setOverridesA({});
    setOverridesB({});
    setSeed(0);
    resetPagination();
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

  const allPhrases = useMemo(() => {
    if (!bothValid) return [];
    return generatePhrases({
      initA: parsedA.initials,
      initB: parsedB.initials,
      orderFilter,
      structureFilter,
      vibeFilter,
      allowParticles,
      allowAdverb,
      seed,
      limit: 75,
    });
  }, [
    bothValid,
    parsedA.initials,
    parsedB.initials,
    orderFilter,
    structureFilter,
    vibeFilter,
    allowParticles,
    allowAdverb,
    seed,
    corpusStats.ready,
  ]);

  const totalPages = Math.max(1, Math.ceil(allPhrases.length / PAGE_SIZE));
  const safePage = page < totalPages ? page : 0;
  const visiblePhrases = allPhrases.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  const handleNextBatch = () => {
    if (totalPages > 1 && safePage + 1 < totalPages) {
      setPage(safePage + 1);
    } else {
      setPage(0);
      setSeed((s) => s + 1);
    }
  };

  const featuredPhrase = visiblePhrases[0] ?? null;
  const restPhrases = visiblePhrases.slice(1);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 pb-16">
      {/* 顶部栏 */}
      <header className="border-b border-stone-200/80 bg-white/85 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-800 text-amber-100 font-serif text-lg font-black tracking-tight shadow-xs">
              词
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-stone-900">
                  首字母造句工坊
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  <Database className="h-3 w-3" />
                  {corpusStats.ready
                    ? `${corpusStats.words.toLocaleString()} 词 · ${corpusStats.pairs.toLocaleString()} 组依存搭配`
                    : '升级语料词库加载中…'}
                </span>
              </div>
              <p className="text-xs text-stone-500 hidden sm:block">
                双串首字母正逆序拼接 ·［主语］+［状语］+ 谓语 +［宾语］+［语气词］语料概率引擎
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRandomPair}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
          >
            <Dices className="h-4 w-4 text-rose-700" />
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
            onSelectPolyphone={(idx, init) => {
              setOverridesA((prev) => ({ ...prev, [idx]: init }));
              resetPagination();
            }}
            placeholder="例如：周杰伦、张三 或 xm"
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
            onSelectPolyphone={(idx, init) => {
              setOverridesB((prev) => ({ ...prev, [idx]: init }));
              resetPagination();
            }}
            placeholder="例如：昆凌、李四 或 xh"
          />
        </section>

        {/* i/u/v 谐音提示条 */}
        {anyIUV && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                现代汉语拼音中没有以{' '}
                <code className="font-mono font-bold">I / U / V</code>{' '}
                作为声母开头的汉字，支持按输入法惯例谐音映射（i→y, u→w, v→y）。
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

        {/* 首字母双序拼合与语料引擎控制台 */}
        {bothValid && (
          <section className="mt-5 rounded-2xl border border-stone-200/90 bg-white p-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold text-stone-500">
                  目标序列（共{' '}
                  {parsedA.initials.length + parsedB.initials.length} 字）：
                </span>

                {/* 正序 A + B */}
                <button
                  type="button"
                  onClick={() => {
                    setOrderFilter((prev) => (prev === 'AB' ? 'all' : 'AB'));
                    resetPagination();
                  }}
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
                  <span className="text-stone-300">·</span>
                  <span className="font-mono text-sm font-bold uppercase text-teal-700">
                    {parsedB.initials}
                  </span>
                </button>

                {/* 逆序 B + A */}
                <button
                  type="button"
                  onClick={() => {
                    setOrderFilter((prev) => (prev === 'BA' ? 'all' : 'BA'));
                    resetPagination();
                  }}
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
                  <span className="text-stone-300">·</span>
                  <span className="font-mono text-sm font-bold uppercase text-amber-700">
                    {parsedA.initials}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                {allPhrases.length > 0 && (
                  <span className="text-xs text-stone-400">
                    共 {allPhrases.length} 条 · 第 {safePage + 1}/{totalPages} 批
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleNextBatch}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-stone-800 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  换一批
                </button>
              </div>
            </div>

            {/* 语法成分开关 + 结构与风格过滤 */}
            <div className="mt-3.5 flex flex-wrap items-center gap-y-2.5 gap-x-4 border-t border-stone-100 pt-3 text-xs">
              <div className="flex items-center gap-1.5 text-stone-500">
                <Filter className="h-3.5 w-3.5" />
                <span>语法开关：</span>
              </div>

              <label
                title="允许在谓语前加入 1～2 字高频口语状语（如 不/很/都/想/先/不想/一起/偷偷…）"
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-medium text-stone-700 cursor-pointer select-none hover:bg-stone-100"
              >
                <input
                  type="checkbox"
                  checked={allowAdverb}
                  onChange={(e) => {
                    setAllowAdverb(e.target.checked);
                    resetPagination();
                  }}
                  className="rounded border-stone-300 text-violet-700 focus:ring-violet-500"
                />
                <span>可带状语</span>
                <span className="text-stone-400 hidden sm:inline">
                  (不/很/想/不想…)
                </span>
              </label>

              <label
                title="允许句末携带自然语气助词（了/吗/吧/呀/啦/了吗/好吗/对吧…）"
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-medium text-stone-700 cursor-pointer select-none hover:bg-stone-100"
              >
                <input
                  type="checkbox"
                  checked={allowParticles}
                  onChange={(e) => {
                    setAllowParticles(e.target.checked);
                    resetPagination();
                  }}
                  className="rounded border-stone-300 text-purple-700 focus:ring-purple-500"
                />
                <span>可带语气词</span>
              </label>

              <span className="hidden sm:inline text-stone-200">|</span>

              {/* 句式过滤 */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['all', '不限结构'],
                    ['SVO', '主谓宾'],
                    ['SV', '主谓'],
                    ['VO', '谓宾'],
                    ['V', '谓'],
                  ] as [StructureFilter, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setStructureFilter(val);
                      resetPagination();
                    }}
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
                    onClick={() => {
                      setVibeFilter(val);
                      resetPagination();
                    }}
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
                支持单字、词语、姓名、短句或首字母缩写（如「周杰伦 + 昆凌」「张三 + 李四」「xm + xh」「今天 + 不想上班」）
              </p>
            </div>
          ) : visiblePhrases.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-stone-700">
                当前细分筛选条件下暂无匹配短语
              </p>
              <p className="mt-1 text-xs text-stone-500">
                建议开启「可带状语」「可带语气词」或将结构切换回「不限结构」查看全部高分搭配
              </p>
              <button
                type="button"
                onClick={() => {
                  setOrderFilter('all');
                  setStructureFilter('all');
                  setVibeFilter('all');
                  setAllowAdverb(true);
                  setAllowParticles(true);
                  resetPagination();
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置筛选与开关
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {featuredPhrase && (
                <PhraseCard phrase={featuredPhrase} featured />
              )}

              {restPhrases.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {restPhrases.map((p) => (
                    <PhraseCard key={p.id} phrase={p} />
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <span className="text-xs text-stone-500">
                    共 {allPhrases.length} 条结果 · 第 {safePage + 1} /{' '}
                    {totalPages} 批
                  </span>
                  <button
                    type="button"
                    onClick={handleNextBatch}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:border-stone-300 hover:text-stone-900 shadow-2xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    换一批
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 底部语法图例与升级词库说明 */}
        <footer className="mt-10 space-y-3 rounded-2xl border border-stone-200/80 bg-white/75 p-4 sm:p-5 text-xs text-stone-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-stone-700">语法图例：</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                主语（可选）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                状语（不/很/想/不想/一起…）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                谓语（必选核心）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                宾语（可选）
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
                语气词（了/吗/吧/呀/了吗/好吗…）
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

          <details className="border-t border-stone-200/70 pt-2.5 text-stone-500">
            <summary className="cursor-pointer font-medium text-stone-700 hover:text-stone-900 select-none">
              升级版语料词库与评级原理说明
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              <li>
                <b>4.09 万词 + 19.6 万组依存搭配升级词库</b>：在约 602 万条真实对白依存句法统计词表的基础上，清洗了低俗词、翻译腔西方人名与专名误标，补齐了原语料缺失的现代高频茶饮美食（奶茶、炸鸡、螺蛳粉、草莓等）、萌宠风物（考拉、晚霞、星河、夏天等）、职场校园日常（闺蜜、摸鱼、撸猫、逛街、等、给、开、回等）以及全部 23 个拼音声母单字兜底。
              </li>
              <li>
                <b>单双字状语与复合语气词</b>：不仅支持 64 个单字状语（不、很、都、想、先、去、来…），还升级支持 31 个双字口语状语（不想、不要、一起、偷偷、已经、终于、快来、打算…）与双字句末语气词（了吗、了吧、好吗、对吧…）。
              </li>
              <li>
                <b>四级真实度评定</b>：「地道」代表整组搭配在真实语料或现代高频表达中多次出现；「通顺」代表各段搭配分别出现过或有同类语义簇支撑；「勉强」「硬凑」仅在刁钻字母组合下保底出现。同时突破 2–3 字限制，支持 1～12 字单串与长句自动分句。
              </li>
            </ul>
          </details>
        </footer>
      </main>
    </div>
  );
};

export default App;

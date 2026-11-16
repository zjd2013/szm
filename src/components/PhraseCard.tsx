import React, { useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import {
  ConstituentRole,
  GeneratedPhrase,
  StyleVibe,
} from '../engine/types';

const ROLE_STYLES: Record<
  ConstituentRole,
  { badge: string; box: string; underline: string }
> = {
  modal_init: {
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    box: 'bg-rose-50/60 border-rose-200/80 text-rose-950',
    underline: 'bg-rose-400',
  },
  subject: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    box: 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950',
    underline: 'bg-emerald-500',
  },
  predicate: {
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    box: 'bg-amber-50/70 border-amber-200/90 text-amber-950',
    underline: 'bg-amber-500',
  },
  object: {
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    box: 'bg-sky-50/60 border-sky-200/80 text-sky-950',
    underline: 'bg-sky-500',
  },
  modal_end: {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    box: 'bg-purple-50/60 border-purple-200/80 text-purple-950',
    underline: 'bg-purple-400',
  },
};

const VIBE_LABELS: Record<StyleVibe, { label: string; style: string }> = {
  daily: {
    label: '日常自然',
    style: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  poetic: {
    label: '文艺浪漫',
    style: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  funny: {
    label: '沙雕整活',
    style: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

interface PhraseCardProps {
  phrase: GeneratedPhrase;
  featured?: boolean;
}

export const PhraseCard: React.FC<PhraseCardProps> = ({
  phrase,
  featured = false,
}) => {
  const [copiedMode, setCopiedMode] = useState<'plain' | 'detail' | null>(null);

  const handleCopy = async (mode: 'plain' | 'detail') => {
    const content =
      mode === 'plain'
        ? phrase.text
        : `${phrase.text}（${phrase.initials.toUpperCase()} · ${
            phrase.segments.map((s) => `${s.shortLabel}:${s.word}`).join(' ')
          }）`;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 1600);
    } catch {
      // 忽略剪贴板受限异常
    }
  };

  const vibeMeta = VIBE_LABELS[phrase.vibe];

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border transition-all ${
        featured
          ? 'border-amber-300/90 bg-gradient-to-br from-amber-50/70 via-white to-teal-50/50 p-5 sm:p-6 shadow-sm'
          : 'border-stone-200/90 bg-white p-4 sm:p-5 hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      {/* 顶部元信息栏 */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-700 px-2.5 py-0.5 text-xs font-semibold text-white">
              <Sparkles className="h-3 w-3" />
              首选推荐
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              phrase.order === 'AB'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-teal-200 bg-teal-50 text-teal-800'
            }`}
          >
            {phrase.order === 'AB' ? '正序 A + B' : '交换 B + A'}
          </span>
          <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600">
            {phrase.patternLabel}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${vibeMeta.style}`}
          >
            {vibeMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleCopy('plain')}
            title="复制短语"
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors cursor-pointer"
          >
            {copiedMode === 'plain' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700">已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>复制</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleCopy('detail')}
            title="连同首字母与语法标注一起复制"
            className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-500 hover:bg-stone-50 hover:text-stone-800 transition-colors cursor-pointer"
          >
            {copiedMode === 'detail' ? (
              <span className="text-emerald-700 font-medium">已带解析复制</span>
            ) : (
              <span>带解析</span>
            )}
          </button>
        </div>
      </div>

      {/* 核心逐字拼音首字母与汉字符号对齐展示 */}
      <div className="my-1 flex flex-wrap items-end gap-x-2.5 gap-y-3">
        {phrase.segments.map((seg, sIdx) => {
          const roleStyle = ROLE_STYLES[seg.role];
          return (
            <React.Fragment key={sIdx}>
              <div className="flex flex-col items-center">
                <div className="flex items-end gap-1 sm:gap-1.5">
                  {seg.chars.map((c, cIdx) => {
                    const isSourceA = c.source === 'A';
                    return (
                      <div
                        key={cIdx}
                        className="flex flex-col items-center min-w-[2.1rem]"
                      >
                        {/* 顶层：首字母来源徽标（A琥珀色 / B青黛色） */}
                        <span
                          className={`mb-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[11px] font-bold uppercase ${
                            isSourceA
                              ? 'bg-amber-700/90 text-white'
                              : 'bg-teal-700/90 text-white'
                          }`}
                          title={`来自字符串 ${c.source} · 首字母 ${c.initial.toUpperCase()}`}
                        >
                          {c.initial}
                        </span>
                        {/* 中层：完整声调拼音 */}
                        <span className="text-[11px] font-mono text-stone-400 leading-tight">
                          {c.pinyin}
                        </span>
                        {/* 底层：汉字本体 */}
                        <span
                          className={`mt-0.5 font-bold tracking-wide text-stone-900 ${
                            featured
                              ? 'text-2xl sm:text-3xl'
                              : 'text-xl sm:text-2xl'
                          }`}
                        >
                          {c.char}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 语法成分下划线与标签 */}
                <div className="mt-1.5 flex w-full flex-col items-center">
                  <div
                    className={`h-1 w-full rounded-full opacity-80 ${roleStyle.underline}`}
                  />
                  <span
                    className={`mt-1 inline-flex items-center rounded border px-1.5 py-0.2 text-[10px] font-semibold ${roleStyle.badge}`}
                  >
                    {seg.roleLabel}：{seg.word}
                  </span>
                </div>
              </div>
              {seg.clauseBreakAfter && (
                <span
                  className={`self-center pb-3 font-bold text-stone-400 ${
                    featured ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
                  }`}
                >
                  ，
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 底部首字母拼接拆解说明 */}
      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-2.5 text-xs text-stone-500">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-stone-400">拼音首字母：</span>
          <span
            className={`font-bold uppercase ${
              phrase.firstSource === 'A' ? 'text-amber-700' : 'text-teal-700'
            }`}
          >
            {phrase.initials.slice(0, phrase.sourceSplitIndex)}
          </span>
          <span className="text-stone-300">+</span>
          <span
            className={`font-bold uppercase ${
              phrase.secondSource === 'A' ? 'text-amber-700' : 'text-teal-700'
            }`}
          >
            {phrase.initials.slice(phrase.sourceSplitIndex)}
          </span>
          <span className="text-stone-400">
            ({phrase.firstSource}+{phrase.secondSource})
          </span>
        </div>
      </div>
    </div>
  );
};

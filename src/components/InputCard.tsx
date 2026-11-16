import React from 'react';
import { AlertCircle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { ParsedStringInput } from '../engine/types';

interface InputCardProps {
  slot: 'A' | 'B';
  value: string;
  onChange: (val: string) => void;
  parsed: ParsedStringInput;
  overrides: Record<number, string>;
  onSelectPolyphone: (charIdx: number, initial: string) => void;
  placeholder: string;
}

export const InputCard: React.FC<InputCardProps> = ({
  slot,
  value,
  onChange,
  parsed,
  onSelectPolyphone,
  placeholder,
}) => {
  const isA = slot === 'A';
  const charCount = Array.from(value.replace(/\s+/g, '')).length;

  const badgeBg = isA
    ? 'bg-amber-700 text-white'
    : 'bg-teal-700 text-white';
  const ringFocus = isA
    ? 'focus-within:border-amber-600 focus-within:ring-amber-500/20'
    : 'focus-within:border-teal-600 focus-within:ring-teal-500/20';
  const tileAccent = isA
    ? 'border-amber-200 bg-amber-50/70 text-amber-950'
    : 'border-teal-200 bg-teal-50/70 text-teal-950';
  const initPillAccent = isA
    ? 'bg-amber-700 text-white'
    : 'bg-teal-700 text-white';

  return (
    <div className="flex flex-col rounded-2xl border border-stone-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold tracking-wider ${badgeBg}`}
          >
            {slot}
          </span>
          <span className="text-sm font-semibold text-stone-800">
            字符串 {slot}
          </span>
          <span className="text-xs text-stone-400">（汉字或字母，不限 2–3 字）</span>
        </div>

        <div className="flex items-center gap-1.5">
          {parsed.valid ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/70">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {charCount} 字
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200/70">
              <AlertCircle className="h-3.5 w-3.5" />
              {charCount === 0 ? '待输入' : `${charCount} 字`}
            </span>
          )}
        </div>
      </div>

      {/* 输入框 */}
      <div
        className={`relative flex items-center rounded-xl border border-stone-300 bg-stone-50/60 px-3.5 py-2.5 transition-all focus-within:bg-white focus-within:ring-4 ${ringFocus}`}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={`字符串 ${slot}`}
          className="w-full bg-transparent text-lg font-semibold tracking-wide text-stone-900 placeholder:font-normal placeholder:text-stone-400 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="清空"
            className="ml-2 rounded-lg p-1 text-stone-400 hover:bg-stone-200/60 hover:text-stone-600 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 逐字符首字母提取预览 / 错误提示 */}
      <div className="mt-3 min-h-[54px]">
        {!parsed.valid ? (
          <p className="flex items-center gap-1.5 text-xs text-rose-600 pt-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{parsed.error}</span>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {parsed.chars.map((ch) => (
              <div
                key={ch.index}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${tileAccent}`}
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-mono text-stone-500">
                    {ch.pinyinDisplay}
                  </span>
                  <span className="text-sm font-bold">{ch.rawChar}</span>
                </div>

                {ch.altInitials.length > 1 ? (
                  <div className="flex items-center gap-1 border-l border-stone-300/70 pl-2">
                    {ch.altInitials.map((alt) => {
                      const active = alt === ch.selectedInitial;
                      return (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => onSelectPolyphone(ch.index, alt)}
                          title={`多音字切换首字母为 ${alt.toUpperCase()}`}
                          className={`h-6 min-w-6 rounded-md px-1.5 text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                            active
                              ? initPillAccent + ' shadow-xs'
                              : 'bg-white/90 text-stone-600 hover:bg-stone-100 border border-stone-200'
                          }`}
                        >
                          {alt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold uppercase ${initPillAccent}`}
                  >
                    {ch.selectedInitial}
                  </span>
                )}
              </div>
            ))}

            <div className="ml-auto flex items-center gap-1 text-xs text-stone-500">
              <span>首字母：</span>
              <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-sm font-bold uppercase text-stone-800">
                {parsed.initials}
              </code>
            </div>
          </div>
        )}

        {parsed.valid && parsed.hasPolyphone && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-stone-500">
            <Sparkles className="h-3 w-3 text-amber-600" />
            检测到多音字，可点击字符右侧字母按钮切换读音首字母
          </p>
        )}
      </div>
    </div>
  );
};

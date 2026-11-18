/**
 * 双引擎共享的流畅度守卫：不自然/不合语法却容易被纯统计模型评为高分的句式。
 *
 * 该清单同时用于 (1) 测试断言、(2) CP-generator v2 引擎结果的后置过滤 ——
 * CP 的「语料原句命中」评级只看搭配是否出现过，会放过诸如
 * 「我蛮喜欢谁」（程度副词 + 疑问代词）这类与 SZM 质量标准冲突的句子。
 */
export const FORBIDDEN_PATTERNS: RegExp[] = [
  /商量事|学会事|喜欢事|发生事|知道事|才放事/,
  /洗黄色|买小孩|有败血症|喝歌|自己来客了|专家来客了/,
  /我是人员|是意思|谁也是|再是律师|蛮喜欢谁|很逊吗|超想吗/,
];

export function isForbiddenPhrase(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

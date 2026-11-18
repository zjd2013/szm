/* 移植自 csna350akioi/CP-generator (https://csna350akioi.github.io/CP-generator/)
 * 「首字母造句工坊」离线双语料引擎之一。原项目以单文件 HTML 发布、未附 LICENSE；
 * 此处保留原作者全部实现与注释，仅将 UMD 尾部改写为 ESM 导出，配合 public/cp-corpus.bin 使用。
 */

/* 首字母造句 —— 生成引擎 v2
 *
 * 短语骨架:  [定语(的)] 主语  [状语(地)] 谓语 [了/着/过]  [定语(的)] 宾语  [语气词]
 *
 * 数据 D:
 *   W   [[词, "带调拼音", 主语, 谓语(不带宾), 谓语(带宾), 宾语, 直接定语, 带"的"定语, 状语, 粗语义类, 细语义类, 标志位, 中语义类]...]
 *       标志位: 1 专名  2 代词  4 形容词性
 *   SV  [[主, 谓, 次数, 其中"谓语在句末"的次数]...]      VO  [[谓, 宾, 次数]...]      SVO [[主, 谓, 宾, 次数]...]
 *   MN  [[定, 中心语, 直接修饰, 带"的", "中心语+定"作谓语句]...]   AV  [[状, 谓, 直接修饰, 带"地"]...]
 *   PH  {结构: [[词..., 次数]...]}   语料里整句出现过的短语. 结构串: M定 e的 S主 D状 i地 V谓 l了 z着 g过 O宾
 *   ASP {谓: [了, 着, 过]}    APY {状语: 作状语时的读音}    P {语气词: 次数}
 *
 * 打分: 每个"依存关系"(主–谓 / 谓–宾 / 定–中 / 状–中) 各自估计 P(从属词 | 中心词),
 *       用 精确搭配 + 细/中/粗三种粒度的语义类 + 词频 插值平滑; 再减去 α·log P(从属词) 以偏向"有特点的搭配"而不是万能高频词.
 * 评级: 每个关系有一个"支持强度"(3 多次出现 / 2 出现过或细类支持 / 1 粗类支持 / 0 无), 整句评级取最弱的一环;
 *       语料里整句出现过的直接评为"地道".
 */
const __root = {};
(function (root) {
  'use strict';

  var PARTICLES = {
    a: ['啊'], b: ['吧', '呗'], n: ['呢', '呐'], m: ['吗', '嘛'], l: ['了', '啦', '咯', '喽', '嘞'],
    y: ['呀', '哟', '耶'], o: ['哦', '噢', '喔'], h: ['哈'], w: ['哇']
  };
  var PARTICLE_PY = {
    '啊': 'a', '吧': 'ba', '呗': 'bei', '呢': 'ne', '呐': 'na', '吗': 'ma', '嘛': 'ma', '了': 'le', '啦': 'la',
    '咯': 'lo', '喽': 'lou', '嘞': 'lei', '呀': 'ya', '哟': 'yo', '耶': 'ye', '哦': 'o', '噢': 'o', '喔': 'o',
    '哈': 'ha', '哇': 'wa'
  };
  var AFTER_LE = { '吗': 1, '吧': 1, '啊': 1, '呀': 1, '嘛': 1, '哦': 1, '呢': 1 };
  var RARE_P = { '哈': 1, '哇': 1, '呗': 1, '哟': 1, '耶': 1, '喽': 1, '嘞': 1, '咯': 1, '噢': 1, '喔': 1, '呐': 1 };
  var ASPECT = { l: ['了', 'le', 0], z: ['着', 'zhe', 1], g: ['过', 'guò', 2] };
  var VALID = 'abcdefghjklmnopqrstwxyz';

  function strip(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  function createEngine(D) {
    var APY = D.APY || {};
    var words = D.W.map(function (w, i) {
      var syl = w[1].split(' ');
      var o = {
        i: i, t: w[0], py: syl, ini: syl.map(function (x) { return strip(x)[0]; }).join(''),
        cs: w[2], ci: w[3], ct: w[4], co: w[5], cm: w[6], cmd: w[7], cd: w[8], k: [w[9], w[12] == null ? -1 : w[12], w[10]],
        nr: w[11] & 1, pron: w[11] & 2, adj: w[11] & 4, cdi: 0
      };
      o.cn = o.cs + o.co; o.cv = o.ci + o.ct;
      o.dpy = APY[o.t] ? [APY[o.t]] : syl;                       // 作状语时的读音 (还 hái / 都 dōu / 得 děi ...)
      o.dini = APY[o.t] ? strip(APY[o.t])[0] : o.ini;
      return o;
    });
    var M = 1e6;
    var byText = new Map();
    words.forEach(function (w) { if (!byText.has(w.t)) byText.set(w.t, w); });
    function push(m, k, v) { var a = m.get(k); if (!a) m.set(k, a = []); a.push(v); }
    function inc(m, k, n) { m.set(k, (m.get(k) || 0) + n); }

    // ---------------------------------------------------------------- 词表索引 (按首字母)
    var NS = 0, NI = 0, NT = 0, NO = 0, NN = 0, NV = 0;
    var byS = new Map(), byVi = new Map(), byVt = new Map(), byO = new Map(), byM = new Map(), byD = new Map();
    words.forEach(function (w) {
      NS += w.cs; NI += w.ci; NT += w.ct; NO += w.co; NN += w.cn; NV += w.cv;
      if (w.cs) push(byS, w.ini, w);
      if (w.ci) push(byVi, w.ini, w);
      if (w.ct) push(byVt, w.ini, w);
      if (w.co) push(byO, w.ini, w);
      if (w.cm || w.cmd) push(byM, w.ini, w);
      if (w.cd) push(byD, w.dini, w);
    });
    function sortBy(m, f) { m.forEach(function (a) { a.sort(function (x, y) { return f(y) - f(x); }); }); }
    sortBy(byS, function (w) { return w.cs; }); sortBy(byVi, function (w) { return w.ci; }); sortBy(byVt, function (w) { return w.ct; });
    sortBy(byO, function (w) { return w.co; }); sortBy(byM, function (w) { return w.cm + w.cmd; }); sortBy(byD, function (w) { return w.cd; });
    function top(m, k, n) { var a = m.get(k); return a ? a.slice(0, n) : []; }

    // ---------------------------------------------------------------- 搭配表 + 语义类级别的统计 (g=0 粗类, g=1 细类)
    var svMap = new Map(), svfMap = new Map(), voMap = new Map(), svoMap = new Map(), mnMap = new Map(), avMap = new Map();
    var svByKey = new Map(), voByKey = new Map(), mnByKey = new Map(), avByKey = new Map();
    var NG = 3;                                      // 语义类的三种粒度: 0 粗 / 1 中 / 2 细
    var K = [0, 1, 2].map(function () { return { S: new Map(), O: new Map(), N: new Map(), V: new Map(), Mm: new Map() }; });
    // "同类词也这么搭"的统计不预先全算出来 (太占内存), 而是把搭配按"头词"分组, 用到哪个词再现算、现缓存:
    //   sv 按谓语分组(看同类主语)  vo 按谓语分组(看同类宾语)  mn 按定语分组(看同类名词)  nm 按名词分组(看同类定语)  av 按状语分组(看同类谓语)
    var HEAD = { sv: [], vo: [], mn: [], nm: [], av: [] };
    function addHead(t, i, p) { (t[i] || (t[i] = [])).push(p); }
    var aggMemo = { sv: new Map(), vo: new Map(), mn: new Map(), nm: new Map(), av: new Map() }, aggSize = 0;
    var EMPTY3 = [new Map(), new Map(), new Map()];
    /** 头词 head 的搭配按"另一个词的语义类"汇总 -> 三种粒度各一张表: 类 -> [各列之和..., 不同词数, 第 2 列非零的不同词数] */
    function classAgg(name, head, other, from, nv) {
      var memo = aggMemo[name], r = memo.get(head);
      if (r) return r;
      var rows = HEAD[name][head];
      if (!rows) return EMPTY3;
      r = [new Map(), new Map(), new Map()];
      for (var i = 0; i < rows.length; i++) {
        var p = rows[i], k = words[p[other]].k;
        for (var g = 0; g < NG; g++) {
          if (k[g] < 0) continue;
          var a = r[g].get(k[g]);
          if (!a) { a = []; for (var z = 0; z < nv + 2; z++) a.push(0); r[g].set(k[g], a); }
          for (var j = 0; j < nv; j++) a[j] += p[from + j] || 0;
          a[nv]++;
          if (p[from + 1]) a[nv + 1]++;
        }
      }
      aggSize += rows.length; memo.set(head, r); return r;
    }
    words.forEach(function (w) {
      for (var g = 0; g < NG; g++) if (w.k[g] >= 0) {
        if (w.cs) inc(K[g].S, w.k[g], w.cs);
        if (w.co) inc(K[g].O, w.k[g], w.co);
        if (w.cn) inc(K[g].N, w.k[g], w.cn);
        if (w.cv) inc(K[g].V, w.k[g], w.cv);
        if (w.cm) inc(K[g].Mm, w.k[g], w.cm);
      }
    });
    D.SV.forEach(function (p) {
      var s = words[p[0]], v = words[p[1]];
      svMap.set(p[0] * M + p[1], p[2]);
      if (p[3]) svfMap.set(p[0] * M + p[1], p[3]);
      push(svByKey, s.ini + '|' + v.ini, p);
      addHead(HEAD.sv, p[1], p);
    });
    D.VO.forEach(function (p) {
      var v = words[p[0]], o = words[p[1]];
      voMap.set(p[0] * M + p[1], p[2]);
      push(voByKey, v.ini + '|' + o.ini, p);
      addHead(HEAD.vo, p[0], p);
    });
    // 形容词谓语句 "鸡腿(很)软烂" 也是 "软烂(的)鸡腿" 的证据: 并进定中搭配表的第 5 列
    var MN = D.MN.slice(), mnTmp = new Map();        // 行本身原地改 (只会把第 5 列调大, 重复建索引也无妨)
    MN.forEach(function (p) { mnTmp.set(p[0] * M + p[1], p); });
    D.SV.forEach(function (p) {
      var s = words[p[0]], v = words[p[1]];
      if (!v.adj || !p[3] || !(v.cm || v.cmd) || s.pron || s === v) return;
      var row = mnTmp.get(p[1] * M + p[0]);
      if (row) { if (row[4] < p[3]) row[4] = p[3]; }
      else { row = [p[1], p[0], 0, 0, p[3]]; mnTmp.set(p[1] * M + p[0], row); MN.push(row); }
    });
    mnTmp = null;
    MN.sort(function (x, y) { return (y[2] + y[3] + 0.5 * y[4]) - (x[2] + x[3] + 0.5 * x[4]); });
    MN.forEach(function (p) {
      var m = words[p[0]], n = words[p[1]];
      mnMap.set(p[0] * M + p[1], p);
      push(mnByKey, m.ini + '|' + n.ini, p);
      addHead(HEAD.mn, p[0], p); addHead(HEAD.nm, p[1], p);
    });
    D.AV.forEach(function (p) {
      var a = words[p[0]], v = words[p[1]];
      avMap.set(p[0] * M + p[1], p);
      a.cdi += p[3];
      push(avByKey, a.dini + '|' + v.ini, p);
      addHead(HEAD.av, p[0], p);
    });
    // 主谓宾三元组; 另按 (主语粗类, 谓语, 宾语粗类) 汇总 —— "同类的主语带着同类的宾语用过这个谓语"
    var svoK = new Map();
    function svoKey(s, v, o) { return v.i * M + ((s.pron ? 0 : s.k[0] + 2) * 1000) + (o.pron ? 0 : o.k[0] + 2); }
    D.SVO.forEach(function (p) {
      svoMap.set(p[0] + ',' + p[1] + ',' + p[2], p[3]);
      var s = words[p[0]], o = words[p[2]];
      if ((s.pron || s.k[0] >= 0) && (o.pron || o.k[0] >= 0)) inc(svoK, svoKey(s, words[p[1]], o), 1);
    });

    // ---------------------------------------------------------------- 语料里整句出现过的短语
    // 几十万条, 所以存得很省: 每种结构一张定长整数表; 整句 -> 次数 用数值哈希查; 按首字母只存"第几张表第几行", 用到时再还原
    var nPh = 0, phOps = [], phTab = [], phStride = [], PH_SH = 4194304;
    function phCand(code) {
      var pi = Math.floor(code / PH_SH), at = (code % PH_SH) * phStride[pi], t = phTab[pi], ops = phOps[pi];
      var c = { ms: null, des: 0, s: null, d: null, di: 0, v: null, asp: '', mo: null, deo: 0, o: null, n: t[at + phStride[pi] - 1] }, pend = null, pde = 0;
      for (var r = 0; r < ops.length; r++) {
        var ch = ops[r];
        if (ch === 'e') { pde = 1; continue; }
        if (ch === 'i') { c.di = 1; continue; }
        if (ASPECT[ch]) { c.asp = ch; continue; }
        var w = words[t[at++]];
        if (ch === 'M') { pend = w; pde = 0; }
        else if (ch === 'S') { c.s = w; if (pend) { c.ms = pend; c.des = pde; pend = null; } }
        else if (ch === 'O') { c.o = w; if (pend) { c.mo = pend; c.deo = pde; pend = null; } }
        else if (ch === 'D') c.d = w;
        else if (ch === 'V') c.v = w;
      }
      return !c.v || pend ? null : c;
    }
    function phN(code) { var pi = Math.floor(code / PH_SH); return phTab[pi][(code % PH_SH + 1) * phStride[pi] - 1]; }
    var phTotal = 0;
    Object.keys(D.PH || {}).forEach(function (roles) {
      var rows = D.PH[roles], st = roles.replace(/[eilzg]/g, '').length + 1, t;
      if (rows.tab) t = rows.tab;
      else { t = new Int32Array(rows.length * st); for (var i = 0; i < rows.length; i++) for (var j = 0; j < st; j++) t[i * st + j] = rows[i][j]; }
      phOps.push(roles); phTab.push(t); phStride.push(st); phTotal += t.length / st;
      if (D._own) D.PH[roles] = null;
    });
    // 整句 -> 次数: 开放定址哈希表 (键是 53 位指纹)
    var phCap = 1024; while (phCap < phTotal * 1.7) phCap *= 2;
    var phKeys = new Float64Array(phCap), phVals = new Int32Array(phCap);
    function phSet(key, n) {
      var i = key % phCap;
      while (phVals[i] && phKeys[i] !== key) i = i + 1 === phCap ? 0 : i + 1;
      phKeys[i] = key; if (n > phVals[i]) phVals[i] = n;
    }
    var phMap = { get: function (key) {
      var i = key % phCap;
      while (phVals[i]) { if (phKeys[i] === key) return phVals[i]; i = i + 1 === phCap ? 0 : i + 1; }
      return 0;
    } };
    // 首字母 -> 短语: 按首字母串的哈希分桶 (计数排序), 桶里存 "第几张表第几行" 和校验用的第二个哈希
    var IB = 1 << 20, iniH2 = 0;
    function iniHash(str) {
      var h1 = -2128831035, h2 = 5381;
      for (var i = 0; i < str.length; i++) { var ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 16777619); h2 = (Math.imul(h2, 33) + ch) | 0; }
      iniH2 = h2; h1 ^= h1 >>> 15;
      return h1 & (IB - 1);
    }
    var phStart = new Uint32Array(IB + 1), phCode = new Uint32Array(phTotal), phChk = new Int32Array(phTotal), phBkt = new Uint32Array(phTotal);
    (function () {
      var k = 0, pi, i, n;
      for (pi = 0; pi < phOps.length; pi++) for (i = 0, n = phTab[pi].length / phStride[pi]; i < n; i++, k++) {
        var code = pi * PH_SH + i, c = phCand(code);
        phBkt[k] = IB;                               // IB = 无效
        if (!c) continue;
        var ini = (c.ms ? c.ms.ini + (c.des ? 'd' : '') : '') + (c.s ? c.s.ini : '') + (c.d ? c.d.dini + (c.di ? 'd' : '') : '') + c.v.ini + c.asp +
          (c.mo ? c.mo.ini + (c.deo ? 'd' : '') : '') + (c.o ? c.o.ini : '');
        phSet(candKey(c), c.n);
        var bk = iniHash(ini);
        phBkt[k] = bk; phChk[k] = iniH2; phStart[bk + 1]++; nPh++;
      }
      for (i = 0; i < IB; i++) phStart[i + 1] += phStart[i];
      var fill = phStart.slice(0, IB), chk = new Int32Array(phTotal);
      for (k = 0, pi = 0; pi < phOps.length; pi++) for (i = 0, n = phTab[pi].length / phStride[pi]; i < n; i++, k++) {
        if (phBkt[k] === IB) continue;
        var at = fill[phBkt[k]]++;
        phCode[at] = pi * PH_SH + i; chk[at] = phChk[k];
      }
      phChk = chk; phBkt = null;
    })();
    var phByIni = { get: function (ini) {            // -> 短语编号数组 (按出现次数从多到少), 没有则 undefined
      var bk = iniHash(ini), h2 = iniH2, out = null;
      for (var i = phStart[bk], e = phStart[bk + 1]; i < e; i++) if (phChk[i] === h2) (out || (out = [])).push(phCode[i]);
      if (out && out.length > 1) out.sort(function (x, y) { return phN(y) - phN(x); });
      return out || undefined;
    } };
    /** 一句话 (各成分 + 的/地/了着过) 的数值指纹, 53 位 */
    function phKey(ms, des, s, d, di, v, asp, mo, deo, o) {
      var h1 = -2128831035, h2 = 461845907, x;
      x = ms ? ms.i * 2 + 2 + (des ? 1 : 0) : 0; h1 = Math.imul(h1 ^ x, 16777619); h2 = Math.imul(h2 + x | 0, -2048144789); h2 ^= h2 >>> 13;
      x = s ? s.i + 1 : 0; h1 = Math.imul(h1 ^ x, 16777619); h1 ^= h1 >>> 15; h2 = Math.imul(h2 + x | 0, -2048144789); h2 ^= h2 >>> 13;
      x = d ? d.i * 2 + 2 + (di ? 1 : 0) : 0; h1 = Math.imul(h1 ^ x, 16777619); h1 ^= h1 >>> 15; h2 = Math.imul(h2 + x | 0, -2048144789); h2 ^= h2 >>> 13;
      x = v.i * 4 + (asp === 'l' ? 1 : asp === 'z' ? 2 : asp === 'g' ? 3 : 0); h1 = Math.imul(h1 ^ x, 16777619); h1 ^= h1 >>> 15; h2 = Math.imul(h2 + x | 0, -2048144789); h2 ^= h2 >>> 13;
      x = mo ? mo.i * 2 + 2 + (deo ? 1 : 0) : 0; h1 = Math.imul(h1 ^ x, 16777619); h1 ^= h1 >>> 15; h2 = Math.imul(h2 + x | 0, -2048144789); h2 ^= h2 >>> 13;
      x = o ? o.i + 1 : 0; h1 = Math.imul(h1 ^ x, 16777619); h1 ^= h1 >>> 15; h2 = Math.imul(h2 + x | 0, -2048144789); h2 ^= h2 >>> 13;
      return (h1 >>> 6) * 134217728 + (h2 >>> 5);
    }
    function candKey(c) { return phKey(c.ms, c.des, c.s, c.d, c.di, c.v, c.asp, c.mo, c.deo, c.o); }

    var pMax = 1, pCount = {};
    Object.keys(PARTICLE_PY).forEach(function (p) { pCount[p] = (D.P && D.P[p]) || 5; pMax = Math.max(pMax, pCount[p]); });

    // ---------------------------------------------------------------- 关系打分
    var TIER_W = 4.5, STRONG = 4, ALPHA = 0.45, REL_W = 3;
    var L_EXACT = 0.55, L_K = [0.07, 0.12, 0.2], L_BASE = 0.06;            // 插值权重: 精确 / [粗类, 中类, 细类] / 词频
    var MIN_C = [8, 6, 4], MIN_N = [3, 3, 2], MIN_LIFT = [3, 3, 2];        // 语义类支持的门槛: 次数 / 不同词数 / 提升度
    // 这些状语后面的谓语不能再带 了/着/过 (不吃了饭 ✗  会买了房 ✗  很喜欢过 ✗); 例外: 没…过 / 别…着 等
    var NOASP = {}, OK_G = {}, OK_Z = {};
    ('不 别 没 没有 未 会 能 要 想 得 敢 肯 该 再 正 在 正在 将 可以 应该 必须 愿意 需要 能够 想要 不要 不用 不会 不能 不想 不敢 不该 不必 无法 喜欢 爱 准备 打算 开始 继续 ' +
      '很 太 最 更 挺 真 好 蛮 超 极 非常 比较 特别 十分 有点 相当 格外 尤其 稍微 多么 这么 那么 如此 超级 不太 不大 不怎么').split(' ').forEach(function (w) { NOASP[w] = 1; });
    // 程度副词只修饰形容词 / 心理动词 (很香 ✓ 很喜欢你 ✓ 太花椒油 ✗)
    var DEG = {};
    '很 太 最 更 挺 真 好 蛮 超 极 非常 比较 特别 十分 有点 相当 格外 尤其 稍微 多么 这么 那么 如此 超级 不太 不大 不怎么 越来越 更加 极其 分外 颇 较 最为 极为 有些 稍 略'.split(' ').forEach(function (w) { DEG[w] = 1; });
    '没 没有 还没 从没 从未 未 未曾 不曾'.split(' ').forEach(function (w) { OK_G[w] = 1; });
    '别 不要 没 没有 正 在 正在'.split(' ').forEach(function (w) { OK_Z[w] = 1; });
    /** 一组搭配的支持强度.  c 精确搭配(等效)次数, lift = P(从|主)/P(从), fine/coarse 是否有同类词佐证
     *  3 多次出现, 或出现过且同类词也这么搭   2 出现过   1.5 仅细类佐证   1 仅粗类佐证 / 偶然共现   0 无 */
    function level(c, lift, fine, coarse) {
      var ex = c >= STRONG ? ((lift >= 0.3 || c >= 10) ? 3 : 2) : c >= 1.5 ? (lift >= 1 ? 2 : 1) : 0;
      if (ex === 2 && fine) return 3;
      if (ex >= 2) return ex;
      return fine === 2 ? 1.75 : fine ? 1.5 : (coarse || ex) ? 1 : 0;
    }
    /** 同类词佐证够不够: 0 不够 / 1 够 / 2 很充分 (同类里有好几个不同的词都这么搭, 次数也多) */
    function clsOK(g, n, lift, distinct) {
      if (n < MIN_C[g] || lift < MIN_LIFT[g] || distinct < MIN_N[g]) return 0;
      return n >= 3 * MIN_C[g] && distinct >= MIN_N[g] + 1 && lift >= 2 * MIN_LIFT[g] ? 2 : 1;
    }
    var cache = { sv: new Map(), svo: new Map(), vo: new Map(), mn: new Map(), mne: new Map(), av: new Map(), avi: new Map() };

    /** 主–谓  P(谓|主)   -> [得分, 强度] */
    function lSV(s, v, withObj) {
      var ck = s.i * M + v.i, memo = withObj ? cache.svo : cache.sv, r = memo.get(ck);
      if (r) return r;
      var c = (withObj ? svMap : svfMap).get(ck) || 0;
      var base = (withObj ? v.ct : v.ci) / (withObj ? NT : NI);
      var p = L_EXACT * (c / s.cs) + L_BASE * base, cls = [0, 0, 0], ag = classAgg('sv', v.i, 0, 2, 2);
      for (var g = 0; g < NG; g++) {
        var x = s.k[g] < 0 ? null : ag[g].get(s.k[g]), n = x ? (withObj ? x[0] : x[1]) : 0;
        if (!n) continue;
        var pk = n / K[g].S.get(s.k[g]);
        p += L_K[g] * pk;
        cls[g] = clsOK(g, n, pk / base, withObj ? x[2] : x[3]);
      }
      r = [Math.log(p) - ALPHA * Math.log(base), level(c, c / s.cs / base, Math.max(cls[1], cls[2]), cls[0])];
      memo.set(ck, r); return r;
    }
    /** 谓–宾  P(宾|谓) */
    function lVO(v, o) {
      var ck = v.i * M + o.i, r = cache.vo.get(ck);
      if (r) return r;
      var c = voMap.get(ck) || 0, base = o.co / NO;
      var p = L_EXACT * (c / v.ct) + L_BASE * base, cls = [0, 0, 0], ag = classAgg('vo', v.i, 1, 2, 1);
      for (var g = 0; g < NG; g++) {
        var x = o.k[g] < 0 ? null : ag[g].get(o.k[g]), n = x ? x[0] : 0;
        if (!n) continue;
        var ko = K[g].O.get(o.k[g]);
        p += L_K[g] * (n / v.ct) * (o.co / ko);
        cls[g] = clsOK(g, n, (n / v.ct) / (ko / NO), x[1]);
      }
      r = [Math.log(p) - ALPHA * Math.log(base), level(c, c / v.ct / base, Math.max(cls[1], cls[2]), cls[0])];
      cache.vo.set(ck, r); return r;
    }
    /** 把 [直接修饰, 带"的", 谓语句] 三种证据折算成"这个定语以这种形式修饰这个名词"的等效次数 */
    function mnEvidence(m, a, de) {
      if (!a) return 0;
      if (m.adj) return de ? a[1] + 0.5 * a[2] + 0.5 * a[0] : a[0] + (m.t.length >= 2 ? 0.5 * (a[1] + a[2]) : 0);
      if (m.pron) return de ? a[1] + a[0] : a[0];
      return de ? a[1] : a[0];
    }
    /** 定–中  P(定|中心语) */
    function lMN(m, n, de) {
      var ck = m.i * M + n.i, memo = de ? cache.mne : cache.mn, r = memo.get(ck);
      if (r) return r;
      var cm = de ? m.cmd : m.cm;
      if (!cm || m === n) { r = [-30, -1]; memo.set(ck, r); return r; }
      var pr = mnMap.get(ck), e = mnEvidence(m, pr ? pr.slice(2) : null, de), base = cm / NN;
      var p = L_EXACT * (e / n.cn) + L_BASE * base, cls = [0, 0, 0];
      var agM = classAgg('mn', m.i, 1, 2, 3), agN = de || !m.cm ? EMPTY3 : classAgg('nm', n.i, 0, 2, 3);
      for (var g = 0; g < NG; g++) {
        var a, ek, pk;
        if (n.k[g] >= 0 && (a = agM[g].get(n.k[g]))) {               // 这个定语修饰过同类名词
          ek = mnEvidence(m, a, de); pk = ek / K[g].N.get(n.k[g]);
          p += L_K[g] * pk;
          cls[g] = clsOK(g, ek, pk / base, a[3]);
        }
        if (m.k[g] >= 0 && (a = agN[g].get(m.k[g]))) {  // 同类定语修饰过这个名词 (仅直接修饰)
          var km = K[g].Mm.get(m.k[g]) || 1;
          ek = a[0]; pk = (ek / n.cn) * (m.cm / km);
          p += 0.5 * L_K[g] * pk;
          if (!cls[g] && ek >= MIN_C[g] && (ek / n.cn) / (km / NN) >= MIN_LIFT[g] && a[3] >= MIN_N[g] + 1) cls[g] = 1;
        }
      }
      r = [Math.log(p) - ALPHA * Math.log(base), level(e, e / n.cn / base, Math.max(cls[1], cls[2]), cls[0])];
      memo.set(ck, r); return r;
    }
    /** 状–中  P(状|谓) */
    function lAV(a, v, di) {
      var ck = a.i * M + v.i, memo = di ? cache.avi : cache.av, r = memo.get(ck);
      if (r) return r;
      if (a === v || (di && (!a.cdi || a.t.length < 2))) { r = [-30, -1]; memo.set(ck, r); return r; }
      var pr = avMap.get(ck), e = pr ? (di ? pr[3] + 0.5 * pr[2] : pr[2]) : 0, base = (di ? a.cdi : a.cd) / NV;
      var p = L_EXACT * (e / v.cv) + L_BASE * base, cls = [0, 0, 0], ag = classAgg('av', a.i, 1, 2, 2);
      for (var g = 0; g < NG; g++) {
        var x;
        if (v.k[g] < 0 || !(x = ag[g].get(v.k[g]))) continue;
        var ek = di ? x[1] + 0.5 * x[0] : x[0], pk = ek / K[g].V.get(v.k[g]);
        p += L_K[g] * pk;
        if (a.t.length >= 2) cls[g] = clsOK(g, ek, pk / base, x[2]);                                          // 单字状语不靠同类词佐证
      }
      // 不 / 很 / 都 这类万能状语本身出现率极高, 提升度天然偏低, 不按提升度降级
      r = [Math.log(p) - ALPHA * Math.log(base), level(e, Math.max(1, e / v.cv / base), Math.max(cls[1], cls[2]), cls[0])];
      memo.set(ck, r); return r;
    }
    /** 谓语 + 了/着/过 */
    function lASP(v, x) {
      var a = D.ASP && D.ASP[v.i], c = a ? a[ASPECT[x][2]] : 0;
      if (!c) return [-30, -1];
      var q = c / v.cv;                                // 是·着 / 有·过 这类零星出现的不算数
      return [Math.log(Math.min(1, q)) * 0.5 - 0.6, q < 0.004 ? 1 : (c >= 10 && q >= 0.01) ? 3 : 2];
    }

    /** 一组搭配按支持强度折算成"可靠度" */
    var BITS = []; for (var bi = 0; bi < 64; bi++) { var bn = 0; for (var bj = bi; bj; bj >>= 1) bn += bj & 1; BITS.push(bn); }
    /** x|y 相邻时, 交界处能不能拼出另一个常用词 (不含 x+y 整个连起来的情况) */
    var ambMemo = new Map(), wordFreq = null;
    function ambig(x, y) {
      var key = x.i * M + y.i, r = ambMemo.get(key);
      if (r !== undefined) return r;
      r = false;
      var xt = x.t, yt = y.t;
      for (var a = 1; a <= xt.length && !r; a++) for (var b = 1; b <= yt.length && a + b <= 4; b++) {
        if (a === xt.length && b === yt.length) continue;
        var w = byText.get(xt.slice(xt.length - a) + yt.slice(0, b));
        if (w && w.cs + w.co + w.ci + w.ct + w.cm + w.cd >= 20) { r = true; break; }
      }
      if (ambMemo.size > 300000) ambMemo.clear();
      ambMemo.set(key, r); return r;
    }
    function rChunk(n) { return n >= 5 ? R_CHUNK : n >= 3 ? 0.94 : 0.9; }   // 整段出现的次数越多越可信
    function nounFuse(x, y) {
      var w = byText.get(x.t + y.t);
      return !!w && w.cs + w.co >= 20 && w.cs + w.co >= 2 * (w.ci + w.ct);
    }
    function rOf(lvl) { return lvl >= 3 ? 0.85 : lvl >= 2 ? 0.7 : lvl >= 1.75 ? 0.68 : lvl >= 1.5 ? 0.5 : lvl >= 1 ? 0.3 : 0.1; }
    var R_CHUNK = 0.97, T_NATIVE = 0.84, T_FLUENT = 0.57, T_OK = 0.28;

    /** 整句打分. c = {ms,des,s,d,di,v,asp,mo,deo,o}  ->  {base, tier, hit}
     *  整句可靠度 = 各组搭配可靠度的乘积 —— 环节越多、越弱, 整句越可能别扭;
     *  如果其中一段 (主状谓 / 状谓宾 / 谓定宾 / 定主谓 / 主谓宾 …) 在语料里整段出现过, 这一段里的搭配按"确凿"算. */
    function scoreCand(c) {
      var s = c.s, v = c.v, o = c.o, ms = c.ms, mo = c.mo, d = c.d, asp = c.asp;
      var lp = (1 - ALPHA) * Math.log(s ? s.cs / NS : (o ? v.ct : v.ci) / (o ? NT : NI)), n = 1, worst = 0, nl = 0, lo = 3, dbg = '';
      var sv = null, vo = null, lms = null, lmo = null, av = null, la = null;
      function link(x, nm) { dbg += nm + x[1] + '(' + x[0].toFixed(1) + ') '; lp += x[0]; n++; nl++; if (x[0] < worst) worst = x[0]; if (x[1] < lo) lo = x[1]; return x; }
      if (s) sv = link(lSV(s, v, !!o), 'sv');
      if (o) vo = link(lVO(v, o), 'vo');
      if (ms) lms = link(lMN(ms, s, c.des), 'ms');
      if (mo) lmo = link(lMN(mo, o, c.deo), 'mo');
      if (d) av = link(lAV(d, v, c.di), 'av');
      if (asp) la = link(lASP(v, asp), 'asp');
      if (lo < 0) return { tier: -1 };
      if (d && asp && NOASP[d.t] && !(asp === 'g' && OK_G[d.t]) && !(asp === 'z' && OK_Z[d.t])) return { tier: -1 };
      var hit = nl >= 2 ? phMap.get(candKey(c)) || 0 : 0;
      var svo = s && o ? svoMap.get(s.i + ',' + v.i + ',' + o.i) || 0 : 0;
      var rel = 1, tier;
      if (!nl) rel = 0.8;
      else if (hit >= 2) rel = 1;
      else {
        var rsv = sv ? rOf(sv[1]) : 1, rvo = vo ? rOf(vo[1]) : 1, rms = lms ? rOf(lms[1]) : 1, rmo = lmo ? rOf(lmo[1]) : 1, rav = av ? rOf(av[1]) : 1, ras = la ? (la[1] >= 3 ? 0.92 : la[1] >= 2 ? 0.8 : 0.4) : 1;
        // 整段出现过的子短语: 依次去掉若干成分 (至少还剩两组搭配), 剩下的那一段若在语料里整段出现过, 其中的搭配按"确凿"算.
        //   成分和搭配一一对应: 1 主(主谓) 2 宾(谓宾) 4 主语的定语 8 宾语的定语 16 状语 32 了着过
        var cov = 0, cn = [0, 0, 0, 0, 0, 0], predN = 0;
        if (nl >= 3) {
          var full = (s ? 1 : 0) | (o ? 2 : 0) | (ms ? 4 : 0) | (mo ? 8 : 0) | (d ? 16 : 0) | (asp ? 32 : 0);
          for (var m = (full - 1) & full; m > 0; m = (m - 1) & full) {
            if (((m & 4) && !(m & 1)) || ((m & 8) && !(m & 2)) || BITS[m] < 2) continue;
            var pn = phMap.get(phKey(m & 4 ? ms : null, m & 4 ? c.des : 0, m & 1 ? s : null, m & 16 ? d : null, m & 16 ? c.di : 0, v, m & 32 ? asp : '',
              m & 8 ? mo : null, m & 8 ? c.deo : 0, m & 2 ? o : null));
            if (pn) { cov |= m; if (m === (full & ~1)) predN = pn; for (var b6 = 0; b6 < 6; b6++) if ((m >> b6 & 1) && pn > cn[b6]) cn[b6] = pn; }
          }
        }
        if (cov) {
          if ((cov & 1) && sv[1] >= 1.5) rsv = Math.max(rsv, rChunk(cn[0]));
          if ((cov & 2) && vo[1] >= 1.5) rvo = Math.max(rvo, rChunk(cn[1]));
          if ((cov & 4) && lms[1] >= 1.5) rms = Math.max(rms, rChunk(cn[2]));
          if ((cov & 8) && lmo[1] >= 1.5) rmo = Math.max(rmo, rChunk(cn[3]));
          if ((cov & 16) && av[1] >= 1.5) rav = Math.max(rav, rChunk(cn[4]));
          if (cov & 32) ras = Math.max(ras, rChunk(cn[5]));
          dbg += '[' + cov + '] ';
        }
        // 代词主语 + 整段出现过的谓语部分: 语料里省略主语的句子, 主语多半就是"我 / 你 / 他", 补上去很自然
        var pronOK = predN && s.pron && !ms && sv[1] >= 2;
        if (pronOK) rsv = Math.max(rsv, sv[1] >= 3 ? 0.93 : 0.88);
        rel = rsv * rvo * rms * rmo * rav * ras;
        var rel0 = rel;
        // 主谓、谓宾各自成立不代表凑在一起也成立 (汤·煮·肉): 没有三元组证据时, 看同类主语+同类宾语是否用过这个谓语
        if (s && o && !svo && !pronOK) {
          var kk = (s.pron || s.k[0] >= 0) && (o.pron || o.k[0] >= 0) ? svoK.get(svoKey(s, v, o)) || 0 : 0;
          rel *= kk >= (s.pron ? 1 : 2) ? 0.92 : 0.6;
          // "X 是 Y" 几乎和任何名词都搭配过: 额外要求主宾同类(或主语是代词)
          if (v.t === '是' && !s.pron && !(s.k[0] >= 0 && s.k[0] === o.k[0])) rel *= 0.6;
        }
        // 程度副词 + 普通动词: 带宾语时要求"状谓宾"整段出现过; 不带宾语时要求这组搭配本身常见
        if (d && DEG[d.t] && !v.adj) {
          if (o ? !(cov & 16) : av[1] < 3) rel *= 0.45;
        }
        // 单字名词 / 单字定语歧义大, 搭配证据没那么可靠 (整段出现过的除外)
        if (s && !s.pron && s.t.length === 1 && !(cov & 1) && !(ms && lms[1] >= 3)) rel *= 0.92;
        if (o && !o.pron && o.t.length === 1 && !(cov & 2) && !(mo && lmo[1] >= 3)) rel *= 0.92;
        if (ms && !ms.pron && ms.t.length === 1 && !(cov & 4)) rel *= 0.92;
        if (mo && !mo.pron && mo.t.length === 1 && !(cov & 8)) rel *= 0.92;
        // 歧义切分: 相邻两个词的交界处如果能拼出另一个常用词 (吃|好玩|家 -> 吃好 / 玩家), 读的人多半会读岔.
        //   这两个词自己就是出现过的搭配、或者这一段整段出现过, 就不算
        var amb = 0;
        if (ms && !c.des && lms[1] < 2 && !(cov & 4) && ambig(ms, s)) amb++;
        if (s && d && ambig(s, d)) amb++;
        if (s && !d && sv[1] < 2 && !(cov & 1) && ambig(s, v)) amb++;
        if (d && !c.di && av[1] < 2 && !(cov & 16) && ambig(d, v)) amb++;
        if (!asp && mo && !(cov & 8 && cov & 2) && ambig(v, mo)) amb++;
        if (!asp && o && !mo && vo[1] < 2 && !(cov & 2) && ambig(v, o)) amb++;
        if (mo && !c.deo && lmo[1] < 2 && !(cov & 8) && ambig(mo, o)) amb++;
        if (amb) { rel *= amb > 1 ? 0.4 : 0.6; dbg += 'amb' + amb + ' '; }
        // 谓语和相邻的词正好连成一个名词 (快乐·人·生 / 蟹黄·汤·包): 读起来是个名词短语, 不是一句话
        if ((s && !d && nounFuse(s, v)) || (d && !c.di && nounFuse(d, v)) || (!asp && o && !mo && nounFuse(v, o)) || (!asp && mo && nounFuse(v, mo))) { rel *= 0.5; dbg += 'nf '; }
      }
      // 整句只原样出现过一次: 是真人说过的话, 只要切分没有歧义就算"地道"
      if (hit === 1 && rel >= 0.9 * rel0 && lo >= 2) rel = Math.max(rel, 0.86);
      tier = (hit >= 2 || rel >= T_NATIVE) ? 3 : rel >= T_FLUENT ? 2 : rel >= T_OK ? 1 : 0;
      if (tier === 3 && !hit && s && s.nr && !s.pron) tier = 2;                           // 专名当主语 (某某·转世): 没有整句证据不叫"地道"
      var nr = (s && !s.pron ? s.nr : 0) + (o && !o.pron ? o.nr : 0), mean = lp / n;
      // 平均搭配强度和最弱一环各占一半: 一句话的自然程度取决于最别扭的那组搭配
      var base = 0.5 * mean + 0.5 * Math.min(worst, mean) + REL_W * Math.log(rel) - 1.2 * nr + (hit ? 0.25 * Math.log(1 + hit) : 0) + (svo ? 0.2 * Math.log(1 + svo) : 0)
        - 0.35 * ((c.des ? 1 : 0) + (c.deo ? 1 : 0) + (c.di ? 1 : 0));
      // 单字状语、了/着/过 最容易被拿来"凑字母": 没有整句证据时略降权, 让干净利落的说法排在前面
      if (!hit) base -= (d && d.t.length === 1 ? 0.5 : 0) + (asp ? 0.4 : 0);
      return { base: base, tier: tier, hit: hit, rel: rel, lo: lo, nl: nl, dbg: dbg + 'rel=' + rel.toFixed(2) };
    }

    // ---------------------------------------------------------------- 语气词和句子配不配
    // 词库里记了"句末词 + 语气词""状语 + 语气词"各出现多少次 (终于…了 很多, 终于…吗 几乎没有; 太…了 ✓ 太…吗 ✗)
    var PP = D.PP || null, ppIdx = {}, ppBase = [];
    if (PP) PP.L.forEach(function (p, i) { ppIdx[p] = i; ppBase.push(Math.max(PP.T[i + 1], 1) / PP.T[0]); });
    var QW = {};
    '什么 谁 哪 哪里 哪儿 哪个 哪些 怎么 怎样 怎么样 怎么办 为什么 为何 多少 几 何时 啥 咋 干嘛 干吗 如何 几点 多久 多大 哪天 几号'.split(' ').forEach(function (w) { QW[w] = 1; });
    function ppLift(row, idx) {                       // row = [总次数, 语气词号, 次数, ...] -> [P(语气词|词) / P(语气词), 次数, 总次数]
      var cnt = 0, base = ppBase[idx];
      for (var i = 1; i < row.length; i += 2) if (row[i] === idx) { cnt = row[i + 1]; break; }
      return [((cnt + 20 * base) / (row[0] + 20)) / base, cnt, row[0]];
    }
    function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
    /** -> { lw 加到语气词得分上的对数修正, bad 0 正常 / 1 不配 / 2 不合语法, att 句末词后面跟这个语气词的次数 } */
    function particleFit(c, ps) {
      var pstr = ps.join(''), last = c.o || c.v, bad = 0, lw = 0, att = 0;
      if (ps[0] === '了' && c.asp === 'l' && !c.o) return { bad: 2 };          // 吃了了 ✗
      // "啊"的音变: 哇 只跟在 u / ao / ou 后面, 呐 只跟在 -n 后面
      var syl = strip(last.py[last.py.length - 1]), p0 = ps[ps.length - 1];
      if (p0 === '哇' && !/(u|ao)$/.test(syl)) bad = 1;
      if (p0 === '呐' && !/n$/.test(syl)) bad = 1;
      // 有疑问词的句子不用"吗"
      if (pstr.indexOf('吗') >= 0 && ((c.s && QW[c.s.t]) || (c.o && QW[c.o.t]) || (c.d && QW[c.d.t]) || (c.mo && QW[c.mo.t]) || (c.ms && QW[c.ms.t]))) bad = 1;
      var idx = PP ? ppIdx[pstr] : undefined;
      if (idx === undefined) return { lw: 0, bad: bad, att: PP ? 0 : 9 };
      var row = PP.F[last.i], x;
      if (row) {
        x = ppLift(row, idx); att = x[1]; lw += clamp(Math.log(x[0]), -3, 1.5);
        if (x[0] < 0.2 && x[2] >= 50) bad = 1;
      }
      if (c.d && (row = PP.A[c.d.i])) {
        x = ppLift(row, idx); lw += clamp(Math.log(x[0]), -3, 1);
        if (x[0] < 0.15 && x[2] >= 100) bad = 1;
      }
      return { lw: lw, bad: bad, att: att };
    }

    function particleOptions(letters) {
      if (!letters) return [[[], 0]];
      var out = [];
      if (letters.length === 1) {
        (PARTICLES[letters] || []).forEach(function (p) { out.push([[p], Math.log(pCount[p] / pMax)]); });
      } else if (letters.length === 2 && letters[0] === 'l') {
        (PARTICLES[letters[1]] || []).forEach(function (p) {
          if (AFTER_LE[p]) out.push([['了', p], Math.log(((D.P && D.P['了' + p]) || 3) / pMax)]);
        });
      }
      return out;
    }

    // ---------------------------------------------------------------- 候选生成
    function groupBy(m, key, pos, lim) {              // 搭配表里首字母吻合的搭配, 按 pos 位置上的词分组
      var arr = m.get(key), g = new Map();
      if (!arr) return g;
      for (var i = 0; i < arr.length && i < lim; i++) push(g, arr[i][pos], words[arr[i][1 - pos]]);
      return g;
    }
    function uniq(a) { var s = new Set(), r = []; for (var i = 0; i < a.length; i++) if (a[i] && !s.has(a[i])) { s.add(a[i]); r.push(a[i]); } return r; }
    /** 从候选里挑出"关系成立"的, 按得分排序截断.  f(w) -> [得分, 强度] */
    function pick(cands, f, minLvl, cap) {
      var r = [];
      for (var i = 0; i < cands.length; i++) { var x = f(cands[i]); if (x[1] >= minLvl) r.push([cands[i], x[0] + x[1] * 2]); }
      r.sort(function (a, b) { return b[1] - a[1]; });
      if (r.length > cap) r.length = cap;
      return r.map(function (x) { return x[0]; });
    }

    /** 一种切分 g = {iMs, des, iS, iD, di, iV, asp, iMo, deo, iO} 下的所有候选 */
    function genSeg(g, emit) {
      var needO = !!g.iO, plain = !g.iMs && !g.iD && !g.iMo && !g.asp;
      var nslot = (g.iS ? 1 : 0) + (g.iMs ? 1 : 0) + (g.iD ? 1 : 0) + (g.iO ? 1 : 0) + (g.iMo ? 1 : 0);
      var CAP = nslot >= 4 ? { s: 5, m: 2, d: 3, o: 6 } : nslot === 3 ? { s: 8, m: 3, d: 5, o: 10 } : { s: 14, m: 5, d: 8, o: 16 };
      var minLvl = plain ? 0 : 1;
      var sG = g.iS ? groupBy(svByKey, g.iS + '|' + g.iV, 1, 400) : null;
      var oG = g.iO ? groupBy(voByKey, g.iV + '|' + g.iO, 0, 400) : null;
      var dG = g.iD ? groupBy(avByKey, g.iD + '|' + g.iV, 1, 400) : null;
      var msG = g.iMs ? groupBy(mnByKey, g.iMs + '|' + g.iS, 1, 300) : null;
      var moG = g.iMo ? groupBy(mnByKey, g.iMo + '|' + g.iO, 1, 300) : null;
      var topS = g.iS ? top(byS, g.iS, 14) : [], topO = g.iO ? top(byO, g.iO, 14) : [], topD = g.iD ? top(byD, g.iD, 12) : [];
      var topMs = g.iMs ? top(byM, g.iMs, 12) : [], topMo = g.iMo ? top(byM, g.iMo, 12) : [];
      // 带定语时, 把"有现成定语搭配"的名词也拉进主语/宾语候选
      var nounS = msG ? Array.from(msG.keys()).slice(0, 40).map(function (i) { return words[i]; }).filter(function (w) { return w.cs; }) : [];
      var nounO = moG ? Array.from(moG.keys()).slice(0, 40).map(function (i) { return words[i]; }).filter(function (w) { return w.co; }) : [];

      var vs = top(needO ? byVt : byVi, g.iV, 24);
      [sG, oG, dG].forEach(function (G) { if (G) { var n = 0; G.forEach(function (_, vi) { if (n++ < 150) vs.push(words[vi]); }); } });
      vs = uniq(vs);
      var memoS = new Map(), memoO = new Map();
      function mods(n, G, tops, de) {                 // 名词 n 的定语候选 (主语、宾语的定语首字母不同, 分开缓存)
        var modMemo = G === msG ? memoS : memoO, r = modMemo.get(n.i);
        if (r) return r;
        r = pick(uniq((G.get(n.i) || []).concat(tops)), function (m) { return lMN(m, n, de); }, 1, CAP.m);
        modMemo.set(n.i, r); return r;
      }
      for (var vi = 0; vi < vs.length; vi++) {
        var v = vs[vi];
        if (needO ? !v.ct : !v.ci) continue;
        if (g.asp && lASP(v, g.asp)[1] < 0) continue;
        var S = [null], O = [null], Dv = [null];
        if (g.iS) { S = pick(uniq((sG.get(v.i) || []).concat(topS, nounS)), function (s) { return lSV(s, v, needO); }, minLvl, CAP.s); if (!S.length) continue; }
        if (g.iD) { Dv = pick(uniq((dG.get(v.i) || []).concat(topD)), function (a) { return lAV(a, v, g.di); }, 1, CAP.d); if (!Dv.length) continue; }
        if (g.iO) { O = pick(uniq((oG.get(v.i) || []).concat(topO, nounO)), function (o) { return lVO(v, o); }, minLvl, CAP.o); if (!O.length) continue; }
        for (var si = 0; si < S.length; si++) {
          var s = S[si], MS = g.iMs ? mods(s, msG, topMs, g.des) : [null];
          for (var mi = 0; mi < MS.length; mi++) for (var di = 0; di < Dv.length; di++) for (var oi = 0; oi < O.length; oi++) {
            var o = O[oi];
            if (s && s === o) continue;
            var MO = g.iMo ? mods(o, moG, topMo, g.deo) : [null];
            for (var mj = 0; mj < MO.length; mj++) {
              if (MS[mi] && MS[mi] === MO[mj]) continue;
              emit({ ms: MS[mi], des: g.des, s: s, d: Dv[di], di: g.di, v: v, asp: g.asp, mo: MO[mj], deo: g.deo, o: o });
            }
          }
        }
      }
    }

    /** 枚举 core 的所有切分 */
    function segmentations(core, opts, cb) {
      var L = core.length, mods = opts.mods !== false;
      for (var ls = 0; ls <= Math.min(4, L - 1); ls++) {
        for (var lms = 0; lms <= (ls && mods ? 3 : 0); lms++) for (var des = 0; des <= (lms ? 1 : 0); des++) {
          var p0 = lms + des + ls;
          if (p0 >= L) continue;
          if (des && core[lms] !== 'd') continue;
          for (var ld = 0; ld <= (mods ? 4 : 0); ld++) for (var di = 0; di <= (ld >= 2 ? 1 : 0); di++) {
            var p1 = p0 + ld + di;
            if (p1 >= L) continue;
            if (di && core[p0 + ld] !== 'd') continue;
            for (var lv = 1; lv <= Math.min(4, L - p1); lv++) for (var la = 0; la <= (mods ? 1 : 0); la++) {
              var p2 = p1 + lv + la;
              if (p2 > L) continue;
              if (la && !ASPECT[core[p1 + lv]]) continue;
              var rest = L - p2;
              for (var lmo = 0; lmo <= (rest && mods ? 3 : 0); lmo++) for (var deo = 0; deo <= (lmo ? 1 : 0); deo++) {
                var lo = rest - lmo - deo;
                if (rest ? (lo < 1 || lo > 4) : (lmo || deo)) continue;
                if (deo && core[p2 + lmo] !== 'd') continue;
                cb({
                  iMs: core.slice(0, lms), des: des, iS: core.slice(lms + des, p0), iD: core.slice(p0, p0 + ld), di: di,
                  iV: core.slice(p1, p1 + lv), asp: la ? core[p1 + lv] : '', iMo: core.slice(p2, p2 + lmo), deo: deo, iO: core.slice(p2 + lmo + deo)
                });
              }
            }
          }
        }
      }
    }

    /** 反过来用: 给一句现成的话 (不含句末语气词), 找出它所有合乎 [定(的)]主[状(地)]谓[了着过][定(的)]宾 的切分.
     *  只保留"每组搭配都在语料里出现过"的分析 (建库时用来从原始文本里认出整句 / 句尾的谓语短语). */
    var ASP_CH = { '了': 'l', '着': 'z', '过': 'g' };
    function analyze(text, noSubj, minLo) {
      var L = text.length, out = [];
      function W(a, b) { return b > a && b - a <= 4 ? byText.get(text.slice(a, b)) : null; }
      for (var lms = 0; lms <= (noSubj ? 0 : 3); lms++) {
        var ms = lms ? W(0, lms) : null;
        if (lms && !ms) continue;
        for (var des = 0; des <= (lms ? 1 : 0); des++) {
          if (des ? (text[lms] !== '的' || !ms.cmd) : (ms && !ms.cm)) continue;
          var p = lms + des;
          for (var ls = lms ? 1 : 0; ls <= (noSubj ? 0 : 4); ls++) {
            var sb = ls ? W(p, p + ls) : null;
            if (ls && !(sb && sb.cs)) continue;
            var p0 = p + ls;
            for (var ld = 0; ld <= 4; ld++) {
              var d = ld ? W(p0, p0 + ld) : null;
              if (ld && !(d && d.cd)) continue;
              for (var di = 0; di <= (ld >= 2 ? 1 : 0); di++) {
                if (di && text[p0 + ld] !== '地') continue;
                var p1 = p0 + ld + di;
                for (var lv = 1; lv <= 4 && p1 + lv <= L; lv++) {
                  var v = W(p1, p1 + lv);
                  if (!v || !(v.ci || v.ct)) continue;
                  for (var la = 0; la <= 1; la++) {
                    var asp = la ? ASP_CH[text[p1 + lv]] : '';
                    if (la && !asp) continue;
                    var p2 = p1 + lv + la, rest = L - p2;
                    if (rest < 0) continue;
                    if (!rest) { if (v.ci) out.push({ ms: ms, des: des, s: sb, d: d, di: di, v: v, asp: asp, mo: null, deo: 0, o: null }); continue; }
                    if (!v.ct) continue;
                    for (var lmo = 0; lmo <= 3 && lmo < rest; lmo++) {
                      var mo = lmo ? W(p2, p2 + lmo) : null;
                      if (lmo && !mo) continue;
                      for (var deo = 0; deo <= (lmo ? 1 : 0); deo++) {
                        if (deo ? (text[p2 + lmo] !== '的' || !mo.cmd) : (mo && !mo.cm)) continue;
                        var o = W(p2 + lmo + deo, L);
                        if (!o || !o.co || o === sb) continue;
                        out.push({ ms: ms, des: des, s: sb, d: d, di: di, v: v, asp: asp, mo: mo, deo: deo, o: o });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      var res = [];
      for (var i = 0; i < out.length; i++) {
        var sc = scoreCand(out[i]);
        if (sc.tier >= 0 && sc.nl >= 1 && sc.lo >= (minLo || 2)) res.push({ c: out[i], sc: sc });
      }
      res.sort(function (x, y) { return y.sc.rel - x.sc.rel || y.sc.base - x.sc.base; });
      return res;
    }

    /** 现成短语 + 一个成分: 语料里整段出现过的短语, 前面添个主语 / 状语, 后面添个宾语, 或给宾语添个定语.
     *  添上去的那组搭配必须是出现过的 —— 字母多的时候, 这样拼出来的句子比逐词硬拼的可靠得多. */
    function compose(core, mods, emit) {
      var L = core.length, memo = new Map(), CH = 240, K = 10;
      function grp(tbl, key, pos) { var k = (tbl === svByKey ? 's' : tbl === avByKey ? 'a' : tbl === voByKey ? 'o' : 'm') + key, g = memo.get(k); if (!g) memo.set(k, g = groupBy(tbl, key, pos, 4000)); return g; }
      function mk(c, x) { var r = { ms: c.ms, des: c.des, s: c.s, d: c.d, di: c.di, v: c.v, asp: c.asp, mo: c.mo, deo: c.deo, o: c.o }; for (var k in x) r[k] = x[k]; return r; }
      function plain(c) { return mods || !(c.ms || c.mo || c.d || c.asp); }
      var i, j, n, list, c, cands, x, ini;
      for (var l1 = 1; l1 <= Math.min(4, L - 2); l1++) {
        // 主语 + [谓…]   /   状语 + [谓…]
        list = phByIni.get(core.slice(l1)); ini = core.slice(0, l1);
        if (list) for (i = 0; i < list.length && i < CH; i++) {
          c = phCand(list[i]);
          if (c.s || c.ms || !plain(c)) continue;
          cands = grp(svByKey, ini + '|' + c.v.ini, 1).get(c.v.i);
          if (cands) for (j = 0, n = 0; j < cands.length && n < K; j++) { x = cands[j]; if (x !== c.o && lSV(x, c.v, !!c.o)[1] >= 2) { emit(mk(c, { s: x })); n++; } }
          if (mods && !c.d) {
            cands = grp(avByKey, ini + '|' + c.v.ini, 1).get(c.v.i);
            if (cands) for (j = 0, n = 0; j < cands.length && n < K; j++) { x = cands[j]; if (lAV(x, c.v, 0)[1] >= 2) { emit(mk(c, { d: x, di: 0 })); n++; } }
          }
        }
        // […谓] + 宾语
        list = phByIni.get(core.slice(0, L - l1)); ini = core.slice(L - l1);
        if (list) for (i = 0; i < list.length && i < CH; i++) {
          c = phCand(list[i]);
          if (c.o || !c.v.ct || !plain(c)) continue;
          cands = grp(voByKey, c.v.ini + '|' + ini, 0).get(c.v.i);
          if (cands) for (j = 0, n = 0; j < cands.length && n < K; j++) { x = cands[j]; if (x !== c.s && lVO(c.v, x)[1] >= 2) { emit(mk(c, { o: x })); n++; } }
        }
        // […谓 宾] 的宾语前插一个定语
        if (mods && l1 <= 3) for (var lo = 1; lo <= 4 && l1 + lo < L; lo++) {
          list = phByIni.get(core.slice(0, L - lo - l1) + core.slice(L - lo)); ini = core.slice(L - lo - l1, L - lo);
          if (list) for (i = 0; i < list.length && i < CH; i++) {
            c = phCand(list[i]);
            if (!c.o || c.mo || c.o.ini.length !== lo) continue;
            cands = grp(mnByKey, ini + '|' + c.o.ini, 1).get(c.o.i);
            if (cands) for (j = 0, n = 0; j < cands.length && n < K; j++) { x = cands[j]; if (x !== c.v && lMN(x, c.o, 0)[1] >= 2) { emit(mk(c, { mo: x, deo: 0 })); n++; } }
          }
        }
      }
    }

    function skeleton(c) { return c.s && c.o ? 'SVO' : c.s ? 'SV' : c.o ? 'VO' : 'V'; }
    function textOf(c) {
      return (c.ms ? c.ms.t + (c.des ? '的' : '') : '') + (c.s ? c.s.t : '') + (c.d ? c.d.t + (c.di ? '地' : '') : '') + c.v.t + (c.asp ? ASPECT[c.asp][0] : '') +
        (c.mo ? c.mo.t + (c.deo ? '的' : '') : '') + (c.o ? c.o.t : '');
    }

    function generateFor(T, opts, order, sink) {
      var N = T.length, maxP = opts.particles === false ? 0 : 2, mods = opts.mods !== false;
      for (var pl = 0; pl <= maxP && pl < N; pl++) {
        var core = T.slice(0, N - pl), pOpts = particleOptions(T.slice(N - pl));
        if (!pOpts.length) continue;
        var emit = function (c) {
          var st = skeleton(c);
          if (opts.struct && opts.struct !== st) return;
          var bare = !c.s && !c.o && !c.d && !c.asp;
          if (bare && !pl && opts.struct !== 'V') return;                 // 单独一个词不算短语
          var sc = scoreCand(c);
          if (sc.tier < 0) return;
          for (var q = 0; q < pOpts.length; q++) sink(c, pOpts[q][0], sc, pOpts[q][1], order, st);
        };
        (phByIni.get(core) || []).forEach(function (code) {               // 语料里整句出现过的短语直接入选
          var c = phCand(code);
          if (!mods && (c.ms || c.mo || c.d || c.asp)) return;
          emit(c);
        });
        compose(core, mods, emit);
        segmentations(core, opts, function (g) { genSeg(g, emit); });
      }
    }

    function trimCaches() {                          // 搭配得分缓存封顶, 免得越用越占内存
      var csz = 0, ck;
      for (ck in cache) csz += cache[ck].size;
      if (csz > 400000) for (ck in cache) cache[ck].clear();
      if (aggSize > 1500000) { for (ck in aggMemo) aggMemo[ck].clear(); aggSize = 0; }
    }

    /** 主入口: a, b 为两个首字母串. opts = {swap, particles, mods, struct, limit} */
    function generate(a, b, opts) {
      opts = opts || {};
      trimCaches();
      var targets = [[a + b, 'AB']];
      if (opts.swap !== false && a !== b) targets.push([b + a, 'BA']);
      var best = new Map();
      function sink(c, ps, sc, pw, order, struct) {
        var text = textOf(c) + ps.join('');
        var tier = sc.tier;
        if (ps.length) {
          var cp = particleFit(c, ps);
          if (cp.bad > 1) return;
          pw += cp.lw;
          if (cp.bad) tier = Math.min(tier, 1);                                // 语气词和句子不配: 最多"勉强"
          else if (tier === 3 && (cp.att < 2 || RARE_P[ps[ps.length - 1]])) tier = 2;   // "地道"要求这个词后面真的跟过这个语气词
        }
        var score = tier * TIER_W + sc.base + pw * 0.55 - (ps.length ? 0.4 : 0);
        var cur = best.get(text);
        if (cur && cur.score >= score) return;
        best.set(text, { text: text, c: c, ps: ps, score: score, tier: tier, order: order, struct: struct, hit: sc.hit, dbg: sc.dbg });
      }
      targets.forEach(function (t) { generateFor(t[0], opts, t[1], sink); });
      var list = Array.from(best.values());
      list.sort(function (x, y) { return y.score - x.score; });
      var seenCore = new Set();
      list = list.filter(function (x) {
        var k = candKey(x.c) + '|' + (x.ps.length ? 1 : 0);
        if (seenCore.has(k)) return false; seenCore.add(k); return true;
      });
      if (opts.raw) return list.slice(0, opts.limit || 96).map(format);       // 调试: 不做多样化
      // 严格按评级分层(地道 > 通顺 > 勉强 > 硬凑), 层内做多样化; 低评级只在高评级不够时少量补充
      var limit = opts.limit || 96, out = [], caps = [12, 24, limit, limit];
      for (var t = 3; t >= 0 && out.length < limit; t--) {
        var layer = list.filter(function (x) { return x.tier === t; });
        var room = Math.min(limit - out.length, t >= 2 ? limit : Math.max(0, caps[t] - (out.length >= 12 ? caps[t] - 6 : 0)));
        out = out.concat(diversify(layer, room));
      }
      return out.map(format);
    }

    /** 贪心重排: 反复用到同一个词 / 同一种结构的结果逐步降权, 让前排更丰富 */
    function diversify(list, limit) {
      var pool = list.slice(0, 1500), out = [], used = new Map(), shape = new Map();
      function get(k) { return used.get(k) || 0; }
      function bump(m, k) { m.set(k, (m.get(k) || 0) + 1); }
      function shapeKey(it) { var c = it.c; return (c.ms ? 'm' : '') + (c.s ? 's' : '') + (c.d ? 'd' : '') + 'v' + c.asp + (c.mo ? 'm' : '') + (c.o ? 'o' : '') + (it.ps.length ? 'p' : '') + it.order; }
      function pen(it) {
        var c = it.c, p = 0, x;
        // 只差一个凑字的状语 / 助词 / 语气词的"近似重复"重罚; 只是共用某个词的轻罚
        if (c.o) p += 1.5 * get('vo' + c.v.i + ',' + c.o.i);
        if (c.s) p += 1.5 * get('sv' + c.s.i + ',' + c.v.i);
        if (!c.s && !c.o) p += 1.5 * get('v' + c.v.i);
        if (c.s) p += (c.s.pron ? 0.2 : 0.4) * get('s' + c.s.i);
        p += 0.5 * get('v' + c.v.i);
        // "定语+中心语"当作一个整体看: 同一个名词短语换个动词再出现, 只罚一次
        if (c.o) { x = c.mo ? get('mo' + c.mo.i + ',' + c.o.i) : 0; p += x ? 0.3 * x : 0.45 * get('o' + c.o.i) + (c.mo ? 0.4 * get('m' + c.mo.i) : 0); }
        if (c.ms) { x = get('ms' + c.ms.i + ',' + c.s.i); p += x ? 0.3 * x : 0.4 * get('m' + c.ms.i); }
        if (c.d) p += 0.5 * get('d' + c.d.i);
        p += 0.1 * (shape.get(shapeKey(it)) || 0);
        if (it.ps.length) p += 0.5 * get('p' + it.ps.join('')) + 0.12 * get('p*');
        return p;
      }
      function capped(it) {
        var c = it.c;
        return get('v' + c.v.i) >= 4 || (c.o && get('o' + c.o.i) >= 4) || (c.s && get('s' + c.s.i) >= (c.s.pron ? 10 : 4)) ||
          (c.d && get('d' + c.d.i) >= 4) || (c.ms && get('m' + c.ms.i) >= 4) || (c.mo && get('m' + c.mo.i) >= 4);
      }
      while (out.length < limit && pool.length) {
        var bi = -1, bs = -Infinity;
        for (var i = 0; i < pool.length; i++) {
          if (pool[i].score <= bs) break;            // pool 按原始分降序, 后面的不可能更高
          if (capped(pool[i])) continue;
          var e = pool[i].score - pen(pool[i]);
          if (e > bs) { bs = e; bi = i; }
        }
        if (bi < 0) break;
        var it = pool.splice(bi, 1)[0], c = it.c;
        out.push(it);
        if (c.s) { bump(used, 's' + c.s.i); bump(used, 'sv' + c.s.i + ',' + c.v.i); }
        bump(used, 'v' + c.v.i);
        if (c.o) { bump(used, 'o' + c.o.i); bump(used, 'vo' + c.v.i + ',' + c.o.i); }
        if (c.d) bump(used, 'd' + c.d.i);
        if (c.ms) { bump(used, 'm' + c.ms.i); bump(used, 'ms' + c.ms.i + ',' + c.s.i); }
        if (c.mo) { bump(used, 'm' + c.mo.i); bump(used, 'mo' + c.mo.i + ',' + c.o.i); }
        bump(shape, shapeKey(it));
        if (it.ps.length) { bump(used, 'p' + it.ps.join('')); bump(used, 'p*'); }
      }
      return out;
    }

    function format(it) {
      var c = it.c, segs = [];
      function w(role, x, py) { segs.push({ role: role, t: x.t, py: py || x.py }); }
      function f(t, py) { segs.push({ role: 'X', t: t, py: [py] }); }
      if (c.ms) { w('M', c.ms); if (c.des) f('的', 'de'); }
      if (c.s) w('S', c.s);
      if (c.d) { w('D', c.d, c.d.dpy); if (c.di) f('地', 'de'); }
      w('V', c.v);
      if (c.asp) f(ASPECT[c.asp][0], ASPECT[c.asp][1]);
      if (c.mo) { w('M', c.mo); if (c.deo) f('的', 'de'); }
      if (c.o) w('O', c.o);
      it.ps.forEach(function (p) { segs.push({ role: 'P', t: p, py: [PARTICLE_PY[p]] }); });
      return { text: it.text, segs: segs, order: it.order, tier: it.tier, struct: it.struct, score: it.score, seen: it.hit, dbg: it.dbg };
    }

    var nPair = D.SV.length + D.VO.length + D.MN.length + D.AV.length;
    if (D._own) D.W = D.SV = D.VO = D.SVO = D.MN = D.AV = D.PH = null;      // 解包出来的中间表用完即弃 (行已被各索引引用), 省内存
    return {
      generate: generate, wordCount: words.length,
      pairCount: nPair, phraseCount: nPh, _words: words, _analyze: analyze, _trim: trimCaches
    };
  }

  /** 页面内嵌的词库为了省体积做了差分编码: 每张表按前两列排序后摊平, 第 1 列存差值, 第 2 列在第 1 列不变时存差值. 这里还原. */
  function unpack(D) {
    if (!D.Z) return D;
    function table(flat, w) {
      var out = [], a = 0, b = 0;
      for (var i = 0; i < flat.length; i += w) {
        var da = flat[i];
        a += da; b = da ? flat[i + 1] : b + flat[i + 1];
        var row = new Array(w);                     // 定长, 免得 push 预留一大截空位 (几十万行, 很占内存)
        row[0] = a; row[1] = b;
        for (var j = 2; j < w; j++) row[j] = flat[i + j];
        out.push(row);
      }
      return out;
    }
    function byCount(t, col) { t.sort(function (x, y) { return y[col] - x[col]; }); return t; }
    var R = { _own: 1, W: D.W, ASP: D.ASP, APY: D.APY, P: D.P, PP: D.PP, N: D.N, PH: {} };
    R.SV = byCount(table(D.SV, 4), 2); R.VO = byCount(table(D.VO, 3), 2); R.SVO = byCount(table(D.SVO, 4), 3);
    R.MN = table(D.MN, 5).sort(function (x, y) { return (y[2] + y[3]) - (x[2] + x[3]); });
    R.AV = table(D.AV, 4).sort(function (x, y) { return (y[2] + y[3]) - (x[2] + x[3]); });
    Object.keys(D.PH).forEach(function (roles) {
      var w = roles.replace(/[eilzg]/g, '').length + 1, flat = D.PH[roles], t = new Int32Array(flat.length), a = 0, b = 0;
      for (var i = 0; i < flat.length; i += w) {
        var da = flat[i];
        a += da; b = da ? flat[i + 1] : b + flat[i + 1];
        t[i] = a; t[i + 1] = b;
        for (var j = 2; j < w; j++) t[i + j] = flat[i + j];
      }
      R.PH[roles] = { tab: t };
      D.PH[roles] = null;
    });
    return R;
  }

  root.PhraseEngine = { create: function (D) { return createEngine(unpack(D)); }, unpack: unpack, VALID: VALID, PARTICLES: PARTICLES, PARTICLE_PY: PARTICLE_PY, AFTER_LE: AFTER_LE };
})(__root);

export const PhraseEngine = __root.PhraseEngine;

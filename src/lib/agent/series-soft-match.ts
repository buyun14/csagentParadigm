/**
 * 车系近音/ASR 软匹配（设计层，替代逐条堆谐音词）
 *
 * 策略：
 * 1. 精确匹配由 matchSeriesFromText 负责；
 * 2. 未命中时：在候选车系列表内做编辑距离 + 同音簇加权；
 * 3. 仅当唯一最优解时返回（歧义宁可不认，交给 LLM+品牌车系列表确认）。
 *
 * 同音簇是「音类」而非「一对一映射」，可覆盖未见过的错字组合（送→宋、维→威）。
 */

/** 常见 ASR 同音/近音簇（可扩展；勿做成一对一词典） */
const PHONETIC_CLUSTERS: readonly (readonly string[])[] = [
  ['送', '宋', '颂', '松'],
  ['维', '威', '微', '围', '唯', '为'],
  ['蔚', '未', '卫', '位'],
  ['魏', '味', '喂'],
  ['秦', '琴', '勤'],
  ['迪', '滴', '的', '帝'],
  ['田', '天'],
  ['鹏', '朋', '彭'],
  ['捷', '杰', '结'],
  ['途', '图', '涂'],
  ['兰', '蓝', '栏'],
  ['达', '大', '打'],
];

const CHAR_TO_CLUSTER = (() => {
  const m = new Map<string, number>();
  PHONETIC_CLUSTERS.forEach((cluster, idx) => {
    for (const ch of cluster) m.set(ch, idx);
  });
  return m;
})();

export function charsPhoneticRelated(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = CHAR_TO_CLUSTER.get(a);
  const cb = CHAR_TO_CLUSTER.get(b);
  return ca !== undefined && ca === cb;
}

/** Levenshtein 距离（按 Unicode 码元，中文一字符一步） */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = new Array(cols);
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[cols - 1];
}

/** 同长串的同音对齐得分：同位同音/相同字符数 */
function phoneticAlignScore(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i] || charsPhoneticRelated(a[i], b[i])) score += 1;
  }
  return score;
}

const SUFFIX_RE = /^(.*?)(PLUS|PRO|MAX|ULTRA|UP|CDM|C-DM|DM-I|DM|EV|L)$/i;

export function normalizeSeriesKey(raw: string): { core: string; suffix: string; full: string } {
  const full = raw.trim().replace(/\s+/g, '').toUpperCase();
  const m = full.match(SUFFIX_RE);
  if (m && m[1]) {
    return { core: m[1], suffix: m[2].toUpperCase(), full };
  }
  return { core: full, suffix: '', full };
}

export interface SoftSeriesCandidate {
  series: string;
  brand: string;
  distance: number;
  phoneticScore: number;
}

/**
 * 在给定品牌→车系列表中找唯一近音最优解。
 * maxDistance 默认 1（维兰达≈威兰达、送PLUS≈宋PLUS）。
 */
export function softMatchSeriesAmong(
  utterance: string,
  brandSeries: Array<{ brand: string; series: string }>,
  maxDistance = 1
): SoftSeriesCandidate | null {
  const input = normalizeSeriesKey(utterance);
  // 无后缀时至少 2 字；有 PLUS 等后缀时允许单字词干（送plus）
  if (!input.full) return null;
  if (!input.suffix && input.full.length < 2) return null;
  if (input.suffix && !input.core) return null;

  const scored: SoftSeriesCandidate[] = [];

  for (const { brand, series } of brandSeries) {
    const cand = normalizeSeriesKey(series);
    const bothHaveSuffix = Boolean(input.suffix && cand.suffix);
    const suffixOk =
      !input.suffix ||
      !cand.suffix ||
      input.suffix === cand.suffix ||
      input.suffix.replace(/-/g, '') === cand.suffix.replace(/-/g, '');

    if (input.suffix && cand.suffix && !suffixOk) continue;

    // 双方都有后缀 → 只比词干；否则比全名（避免 送PLUS 去比 汉 全名）
    const left = bothHaveSuffix ? input.core : input.full;
    const right = bothHaveSuffix ? cand.core : cand.full;

    // 输入有后缀时，候选也应有同后缀（送plus 不跟无 PLUS 的「宋」比）
    if (input.suffix && !cand.suffix) continue;

    const distance = editDistance(left, right);
    if (distance > maxDistance) continue;

    // 无后缀的单字乱跳拒绝；有后缀的单字词干必须同音簇命中（送≈宋，送≉秦）
    if (left.length <= 1 && distance > 0) {
      if (!bothHaveSuffix || !charsPhoneticRelated(left, right)) continue;
    }

    const phoneticScore = phoneticAlignScore(left, right);
    if (distance > 0) {
      const minLen = Math.min(left.length, right.length);
      const need = minLen <= 1 ? 1 : Math.ceil(minLen * 0.5);
      if (phoneticScore < need) continue;
    }

    scored.push({ series, brand, distance, phoneticScore });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (b.phoneticScore !== a.phoneticScore) return b.phoneticScore - a.phoneticScore;
    return b.series.length - a.series.length;
  });

  const best = scored[0];
  const ties = scored.filter(
    (s) => s.distance === best.distance && s.phoneticScore === best.phoneticScore
  );
  const seriesSet = new Set(ties.map((t) => t.series));
  if (seriesSet.size !== 1) return null;

  const brands = new Set(ties.filter((t) => t.series === best.series).map((t) => t.brand));
  return {
    series: best.series,
    brand: brands.size === 1 ? [...brands][0] : best.brand,
    distance: best.distance,
    phoneticScore: best.phoneticScore,
  };
}

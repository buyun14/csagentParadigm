import { describe, it, expect } from 'vitest';
import {
  editDistance,
  softMatchSeriesAmong,
  charsPhoneticRelated,
  normalizeSeriesKey,
} from './series-soft-match';
import { matchSeriesFromText, softResolveSeriesFromText } from './knowledge-base';

describe('series-soft-match 近音软匹配', () => {
  it('editDistance 同长替换为 1', () => {
    expect(editDistance('维兰达', '威兰达')).toBe(1);
    expect(editDistance('送', '宋')).toBe(1);
    expect(editDistance('送', '秦')).toBe(1);
  });

  it('同音簇：送≈宋，送≉秦', () => {
    expect(charsPhoneticRelated('送', '宋')).toBe(true);
    expect(charsPhoneticRelated('送', '秦')).toBe(false);
    expect(charsPhoneticRelated('维', '威')).toBe(true);
  });

  it('normalizeSeriesKey 解析 PLUS 后缀', () => {
    expect(normalizeSeriesKey('送plus')).toEqual({ core: '送', suffix: 'PLUS', full: '送PLUS' });
    expect(normalizeSeriesKey('宋PLUS')).toEqual({ core: '宋', suffix: 'PLUS', full: '宋PLUS' });
  });

  it('软匹配：送plus → 宋PLUS（不误认秦PLUS）', () => {
    const hit = softMatchSeriesAmong('送plus', [
      { brand: '比亚迪', series: '宋PLUS' },
      { brand: '比亚迪', series: '秦PLUS' },
      { brand: '比亚迪', series: '元PLUS' },
    ]);
    expect(hit?.series).toBe('宋PLUS');
  });

  it('软匹配：维兰达 → 威兰达', () => {
    const hit = softMatchSeriesAmong('维兰达', [
      { brand: '丰田', series: '威兰达' },
      { brand: '丰田', series: '汉兰达' },
    ]);
    expect(hit?.series).toBe('威兰达');
  });

  it('等距异音并列 → null（宁可不认）', () => {
    // 人为构造：无同音簇支撑时不应瞎认
    const hit = softMatchSeriesAmong('甲乙', [
      { brand: 'X', series: '丙乙' },
      { brand: 'X', series: '丁乙' },
    ]);
    expect(hit).toBeNull();
  });
});

describe('knowledge-base 软匹配接入', () => {
  it('维兰达 → 威兰达/丰田（无需 ASR 词表）', () => {
    expect(matchSeriesFromText('维兰达')).toEqual({ series: '威兰达', brand: '丰田', soft: true });
    expect(softResolveSeriesFromText('维兰达')).toEqual({ series: '威兰达', brand: '丰田' });
  });

  it('送plus → 宋PLUS/比亚迪（同音簇优先于秦PLUS，标 soft）', () => {
    const hit = matchSeriesFromText('送plus', '比亚迪');
    expect(hit?.series).toBe('宋PLUS');
    expect(hit?.brand).toBe('比亚迪');
    expect(hit?.soft).toBe(true);
  });

  it('品牌限定：捷途下旅行者精确命中', () => {
    expect(matchSeriesFromText('旅行者', '捷途')).toEqual({ series: '旅行者', brand: '捷途', soft: false });
  });
});

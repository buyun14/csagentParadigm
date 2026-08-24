import { describe, it, expect } from 'vitest';
import {
  isInfoComplete,
  nextMissingField,
  stateFromSlots,
  advanceState,
  normalizeTiming,
  resolveObjection,
  gateSeries,
  commitPendingSeries,
  updateStall,
  turnQuestion,
  STALL_LIMIT,
  initialPolicyMeta,
  buildPolicyPromptBlock,
} from './policy';
import type { CollectedSlots } from './types';

const empty: CollectedSlots = {
  brand: null, series: null, model: null, city: null, timing: null,
  surname: null, phoneTail: null, vehicleType: null, powerType: null,
};

describe('policy 采集契约', () => {
  it('nextMissing 按品牌→车系→城市→时间→姓氏', () => {
    expect(nextMissingField(empty)).toBe('brand');
    expect(nextMissingField({ ...empty, brand: '捷途' })).toBe('series');
    expect(nextMissingField({ ...empty, brand: '捷途', series: '旅行者' })).toBe('city');
    expect(nextMissingField({ ...empty, brand: '捷途', series: '旅行者', city: '北京' })).toBe('timing');
    expect(
      nextMissingField({
        ...empty, brand: '捷途', series: '旅行者', city: '北京', timing: '下个月',
      })
    ).toBe('surname');
    expect(
      nextMissingField({
        ...empty, brand: '捷途', series: '旅行者', city: '北京', timing: '下个月', surname: '王',
      })
    ).toBeNull();
  });

  it('isInfoComplete 不依赖 phoneTail', () => {
    const slots = {
      ...empty, brand: 'a', series: 'b', city: 'c', timing: '下个月', surname: '王',
    };
    expect(isInfoComplete(slots)).toBe(true);
    expect(isInfoComplete({ ...slots, surname: null })).toBe(false);
  });

  it('stateFromSlots 不落后于槽位', () => {
    expect(stateFromSlots(empty)).toBe('BRAND_INQUIRY');
    expect(stateFromSlots({ ...empty, brand: '蔚来' })).toBe('MODEL_INQUIRY');
    expect(stateFromSlots({ ...empty, brand: '蔚来', series: 'ES8' })).toBe('CITY_INQUIRY');
    expect(
      stateFromSlots({
        ...empty, brand: '蔚来', series: 'ES8', city: '北京', timing: '下个月', surname: '王',
      })
    ).toBe('FAREWELL');
  });

  it('advanceState 只进不退且闭环强制 FAREWELL', () => {
    const full = {
      ...empty, brand: '蔚来', series: 'ES8', city: '北京', timing: '下个月', surname: '王',
    };
    expect(advanceState('CITY_INQUIRY', full, 'BRAND_INQUIRY')).toBe('FAREWELL');
    expect(advanceState('MODEL_INQUIRY', { ...empty, brand: '蔚来' }, 'GREETING')).toBe(
      'MODEL_INQUIRY'
    );
  });
});

describe('policy timing / 异议', () => {
  it('normalizeTiming 受控枚举', () => {
    expect(normalizeTiming('半个月以后')).toBe('半个月后');
    expect(normalizeTiming('看车的话我已经去看过了')).toBe('已看车');
    expect(normalizeTiming('看价格吧')).toBe('看价格');
    expect(normalizeTiming('下个月')).toBe('下个月');
  });

  it('resolveObjection 映射', () => {
    expect(resolveObjection('abuse', '')).toBe('ABUSE');
    expect(resolveObjection('out_of_scope', '多少钱')).toBe('PRICE');
    expect(resolveObjection('ask_recommend', '帮我推荐')).toBe('OFF_TOPIC');
    expect(resolveObjection('filter_vehicle', '要SUV')).toBe('OFF_TOPIC');
    expect(resolveObjection('disagree', '不考虑')).toBe('REJECT');
  });
});

describe('policy EntityGate', () => {
  it('exact → commit', () => {
    const r = gateSeries(
      { series: '旅行者', brand: '捷途', mode: 'exact' },
      { ...empty, brand: '捷途' },
      initialPolicyMeta()
    );
    expect(r.action).toBe('commit');
  });

  it('soft → pending 复述', () => {
    const r = gateSeries(
      { series: '宋PLUS', brand: '比亚迪', mode: 'soft' },
      { ...empty, brand: '比亚迪' },
      initialPolicyMeta()
    );
    expect(r.action).toBe('pending');
    if (r.action === 'pending') {
      expect(r.confirmReply).toContain('宋PLUS');
    }
  });

  it('跨品牌 soft → reject', () => {
    const r = gateSeries(
      { series: 'ES8', brand: '蔚来', mode: 'soft' },
      { ...empty, brand: '捷途' },
      initialPolicyMeta()
    );
    expect(r.action).toBe('reject');
  });

  it('commitPendingSeries 入槽并清空 pending', () => {
    const meta = {
      ...initialPolicyMeta(),
      pendingSeries: '宋PLUS',
      pendingBrand: '比亚迪',
    };
    const r = commitPendingSeries(meta, { ...empty, brand: '比亚迪' });
    expect(r?.slots.series).toBe('宋PLUS');
    expect(r?.meta.pendingSeries).toBeNull();
  });
});

describe('policy stall', () => {
  it(`连续 ${STALL_LIMIT} 轮未推进 → shouldExit`, () => {
    let meta = initialPolicyMeta();
    let shouldExit = false;
    for (let i = 0; i < STALL_LIMIT; i++) {
      const r = updateStall(meta, empty, empty, false);
      meta = r.meta;
      shouldExit = r.shouldExit;
    }
    expect(shouldExit).toBe(true);
  });

  it('推进后清零 stall', () => {
    let meta = { ...initialPolicyMeta(), stallCount: 2, stallField: 'brand' as const };
    const after = { ...empty, brand: '蔚来' };
    const r = updateStall(meta, empty, after, true);
    expect(r.meta.stallCount).toBe(0);
    expect(r.shouldExit).toBe(false);
  });
});

describe('policy prompt / turnQuestion', () => {
  it('turnQuestion 只问缺失项', () => {
    expect(turnQuestion(empty)).toContain('品牌');
    expect(turnQuestion({ ...empty, brand: '捷途', series: '旅行者' })).toContain('城市');
  });

  it('buildPolicyPromptBlock 含使命与门禁', () => {
    const p = buildPolicyPromptBlock(empty);
    expect(p).toContain('外呼线索初筛');
    expect(p).toContain('ASR门禁');
    expect(p).toContain('严禁索要手机号');
  });
});

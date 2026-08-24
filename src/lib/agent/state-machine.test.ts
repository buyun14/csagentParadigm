import { describe, it, expect } from 'vitest';
import { generateResponse } from './state-machine';
import { recognizeIntent } from './intent';
import { initialPolicyMeta, type PolicyMeta } from './policy';
import type { CollectedSlots } from './types';

const emptySlots: CollectedSlots = {
  brand: null,
  series: null,
  model: null,
  city: null,
  timing: null,
  surname: null,
  phoneTail: null,
  vehicleType: null,
  powerType: null,
};

function run(
  input: string,
  current: Parameters<typeof generateResponse>[0],
  slots: CollectedSlots = emptySlots,
  meta: PolicyMeta = initialPolicyMeta()
) {
  const intentResult = recognizeIntent(input, { brandHint: slots.brand });
  return generateResponse(current, 'NONE', slots, intentResult, [], meta, input);
}

describe('generateResponse 状态机（政策口径）', () => {
  it('GREETING + 问候 → BRAND_INQUIRY', () => {
    const r = run('你好', 'GREETING');
    expect(r.nextState).toBe('BRAND_INQUIRY');
    expect(r.reply.length).toBeGreaterThan(0);
  });

  it('GREETING + 直接说品牌 → MODEL_INQUIRY + 槽位回填', () => {
    const r = run('我看蔚来', 'GREETING');
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.updatedSlots.brand).toBe('蔚来');
  });

  it('GREETING + 五菱缤果S → CITY_INQUIRY（精确入槽，不回问开场）', () => {
    const r = run('五菱缤果S', 'GREETING');
    expect(r.nextState).toBe('CITY_INQUIRY');
    expect(r.updatedSlots.brand).toBe('五菱汽车');
    expect(r.updatedSlots.series).toBe('缤果S');
    expect(r.reply).toContain('购车');
    expect(r.reply).not.toContain('关注什么车');
  });

  it('GREETING + 否定 → 柔性挽留留在流程', () => {
    const r = run('不考虑', 'GREETING');
    expect(r.nextState).toBe('BRAND_INQUIRY');
  });

  it('BRAND_INQUIRY + 确认品牌 → MODEL_INQUIRY', () => {
    const r = run('比亚迪吧', 'BRAND_INQUIRY');
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.updatedSlots.brand).toBe('比亚迪');
  });

  it('BRAND_INQUIRY + 我不是看蔚来 → 否定不收集品牌', () => {
    const r = run('我不是看蔚来', 'BRAND_INQUIRY');
    expect(r.updatedSlots.brand).toBeNull();
    expect(r.nextState).toBe('BRAND_INQUIRY');
  });

  it('MODEL_INQUIRY + 确认车系 → CITY_INQUIRY', () => {
    const r = run('ES8', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.nextState).toBe('CITY_INQUIRY');
    expect(r.updatedSlots.series).toBe('ES8');
  });

  it('MODEL_INQUIRY + 询问车辆（无品牌）→ 非空引导回复', () => {
    const r = run('有什么车', 'MODEL_INQUIRY');
    expect(r.reply.length).toBeGreaterThan(0);
  });

  it('CITY_INQUIRY + 确认城市 → TIMING_INQUIRY', () => {
    const r = run('我在北京', 'CITY_INQUIRY', {
      ...emptySlots, brand: '蔚来', series: 'ES8',
    });
    expect(r.nextState).toBe('TIMING_INQUIRY');
    expect(r.updatedSlots.city).toBe('北京');
  });

  it('TIMING_INQUIRY + 确认时间 → CONTACT_COLLECTION', () => {
    const r = run('下个月', 'TIMING_INQUIRY', {
      ...emptySlots, brand: '蔚来', series: 'ES8', city: '北京',
    });
    expect(r.nextState).toBe('CONTACT_COLLECTION');
    expect(r.updatedSlots.timing).toBe('下个月');
  });

  it('MODEL_INQUIRY + 旅行者 → CITY_INQUIRY（不重列全系）', () => {
    const r = run('旅行者', 'MODEL_INQUIRY', { ...emptySlots, brand: '捷途' });
    expect(r.nextState).toBe('CITY_INQUIRY');
    expect(r.updatedSlots.series).toBe('旅行者');
    expect(r.reply).toContain('购车');
    expect(r.reply).not.toContain('X70');
  });

  it('TIMING_INQUIRY + 半个月以后 → CONTACT_COLLECTION', () => {
    const r = run('半个月以后', 'TIMING_INQUIRY', {
      ...emptySlots, brand: '丰田', series: '威兰达', city: '开封',
    });
    expect(r.nextState).toBe('CONTACT_COLLECTION');
    expect(r.updatedSlots.timing).toBe('半个月后');
  });

  it('TIMING_INQUIRY + 看价格吧 → 记时间并推进（破死锁）', () => {
    const r = run('看价格吧', 'TIMING_INQUIRY', {
      ...emptySlots, brand: '本田', series: '奥德赛', city: '保定',
    });
    expect(r.nextState).toBe('CONTACT_COLLECTION');
    expect(r.updatedSlots.timing).toBe('看价格');
  });

  it('TIMING_INQUIRY + 问价超范围 → 软着陆仍停在时间收集', () => {
    const r = run('市场价格什么价格？', 'TIMING_INQUIRY', {
      ...emptySlots, brand: '本田', series: '奥德赛', city: '保定',
    });
    expect(r.nextState).toBe('TIMING_INQUIRY');
    expect(r.nextException).toBe('OUT_OF_SCOPE');
    expect(r.reply).toContain('4S');
  });

  it('CONTACT_COLLECTION + 姓氏 → FAREWELL（需其它项已齐）', () => {
    const r = run('我姓王', 'CONTACT_COLLECTION', {
      ...emptySlots, brand: '蔚来', series: 'ES8', city: '北京', timing: '下个月',
    });
    expect(r.nextState).toBe('FAREWELL');
    expect(r.updatedSlots.surname).toBe('王');
  });

  it('FAREWELL 终态不退出', () => {
    const r = run('你好', 'FAREWELL');
    expect(r.nextState).toBe('FAREWELL');
  });

  it('护栏：辱骂 → FAREWELL + ABUSE', () => {
    const r = run('你神经病啊', 'BRAND_INQUIRY');
    expect(r.nextState).toBe('FAREWELL');
    expect(r.nextException).toBe('ABUSE');
  });

  it('护栏：反感 → FAREWELL', () => {
    const r = run('不要再打了', 'MODEL_INQUIRY');
    expect(r.nextState).toBe('FAREWELL');
  });

  it('偏离话题 → 拉回 + OFF_TRACK', () => {
    const r = run('今天天气不错哈哈', 'BRAND_INQUIRY');
    expect(r.nextException).toBe('OFF_TRACK');
    expect(r.nextState).toBe('BRAND_INQUIRY');
  });

  it('超范围问题（价格）→ OUT_OF_SCOPE 引导 4S 店', () => {
    const r = run('落地多少钱？', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.nextException).toBe('OUT_OF_SCOPE');
    expect(r.reply).toContain('4S');
  });

  it('输入不清 → UNCLEAR 澄清追问', () => {
    const r = run('？', 'CITY_INQUIRY', {
      ...emptySlots, brand: '蔚来', series: 'ES8',
    });
    expect(r.nextException).toBe('UNCLEAR');
  });

  it('MODEL_INQUIRY + 切换品牌 → 更新槽位并重列车型', () => {
    const r = run('其实我想看理想', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.updatedSlots.brand).toBe('理想');
    expect(r.updatedSlots.series).toBeNull();
    expect(r.nextState).toBe('MODEL_INQUIRY');
  });

  it('filter_vehicle / 推荐 → 坍缩为拉回缺失项（不当导购）', () => {
    const r = run('有没有MPV', 'MODEL_INQUIRY', { ...emptySlots, brand: '理想' });
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.reply).toContain('理想');
  });

  it('防误收集：否定意图中提到的品牌不入槽', () => {
    const r = run('我不想看蔚来', 'BRAND_INQUIRY');
    expect(r.updatedSlots.brand).toBeNull();
  });

  it('不回问：品牌已确认 + 同意 → 推进到车型', () => {
    const r = run('可以', 'BRAND_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.reply).not.toMatch(/哪个品牌/);
  });

  it('不回问：车系已确认 + 同意 → 推进到城市', () => {
    const r = run('可以', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来', series: 'ES8' });
    expect(r.nextState).toBe('CITY_INQUIRY');
    expect(r.reply).not.toContain('哪款');
  });

  it('不回问：城市已确认 + 同意 → 推进到时间', () => {
    const r = run('可以', 'CITY_INQUIRY', {
      ...emptySlots, brand: '蔚来', series: 'ES8', city: '北京',
    });
    expect(r.nextState).toBe('TIMING_INQUIRY');
  });

  it('不回问：时间已确认 + 同意 → 推进到联系方式', () => {
    const r = run('可以', 'TIMING_INQUIRY', {
      ...emptySlots, brand: '蔚来', series: 'ES8', city: '北京', timing: '下个月',
    });
    expect(r.nextState).toBe('CONTACT_COLLECTION');
  });

  it('不回问：五项齐备 + 同意 → FAREWELL', () => {
    const r = run('可以', 'CONTACT_COLLECTION', {
      ...emptySlots, brand: '蔚来', series: 'ES8', city: '北京', timing: '下个月', surname: '王',
    });
    expect(r.nextState).toBe('FAREWELL');
    expect(r.reply).not.toContain('贵姓');
  });

  it('软匹配 送plus → pending 复述，不直接入槽', () => {
    const r = run('送plus', 'MODEL_INQUIRY', { ...emptySlots, brand: '比亚迪' });
    expect(r.updatedSlots.series).toBeNull();
    expect(r.updatedPolicyMeta.pendingSeries).toBe('宋PLUS');
    expect(r.reply).toContain('宋PLUS');
    expect(r.reply).toContain('对吧');
  });

  it('pending 确认后入槽并推进城市', () => {
    const meta = {
      ...initialPolicyMeta(),
      pendingSeries: '宋PLUS',
      pendingBrand: '比亚迪',
    };
    const r = run('对', 'MODEL_INQUIRY', { ...emptySlots, brand: '比亚迪' }, meta);
    expect(r.updatedSlots.series).toBe('宋PLUS');
    expect(r.updatedPolicyMeta.pendingSeries).toBeNull();
    expect(r.nextState).toBe('CITY_INQUIRY');
  });

  it('连续 3 轮答非所问 → stall 软退出', () => {
    let meta = initialPolicyMeta();
    const state = 'BRAND_INQUIRY' as const;
    const slots = emptySlots;
    let last = run('今天天气不错哈哈', state, slots, meta);
    meta = last.updatedPolicyMeta;
    last = run('股票怎么样啊', state, slots, meta);
    meta = last.updatedPolicyMeta;
    last = run('你喜欢吃什么', state, slots, meta);
    expect(last.nextState).toBe('FAREWELL');
    expect(last.reply).toContain('不打扰');
  });
});

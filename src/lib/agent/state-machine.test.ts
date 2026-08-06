import { describe, it, expect } from 'vitest';
import { generateResponse } from './state-machine';
import { recognizeIntent } from './intent';
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

function run(input: string, current: Parameters<typeof generateResponse>[0], slots: CollectedSlots = emptySlots) {
  const intentResult = recognizeIntent(input);
  return generateResponse(current, 'NONE', slots, intentResult, []);
}

describe('generateResponse 状态机', () => {
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

  it('GREETING + 否定 → 柔性挽留留在流程', () => {
    const r = run('不考虑', 'GREETING');
    expect(r.nextState).toBe('BRAND_INQUIRY');
  });

  it('BRAND_INQUIRY + 确认品牌 → MODEL_INQUIRY', () => {
    const r = run('比亚迪吧', 'BRAND_INQUIRY');
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.updatedSlots.brand).toBe('比亚迪');
  });

  it('MODEL_INQUIRY + 确认车系 → CITY_INQUIRY', () => {
    const r = run('ES8', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.nextState).toBe('CITY_INQUIRY');
    expect(r.updatedSlots.series).toBe('ES8');
  });

  it('CITY_INQUIRY + 确认城市 → TIMING_INQUIRY', () => {
    const r = run('我在北京', 'CITY_INQUIRY');
    expect(r.nextState).toBe('TIMING_INQUIRY');
    expect(r.updatedSlots.city).toBe('北京');
  });

  it('TIMING_INQUIRY + 确认时间 → CONTACT_COLLECTION', () => {
    const r = run('下个月', 'TIMING_INQUIRY');
    expect(r.nextState).toBe('CONTACT_COLLECTION');
    expect(r.updatedSlots.timing).toBe('下个月');
  });

  it('CONTACT_COLLECTION + 姓氏 → FAREWELL', () => {
    const r = run('我姓王', 'CONTACT_COLLECTION');
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
    expect(r.reply).toContain('四S店');
  });

  it('输入不清 → UNCLEAR 澄清追问', () => {
    const r = run('嗯？', 'CITY_INQUIRY');
    expect(r.nextException).toBe('UNCLEAR');
  });

  it('MODEL_INQUIRY + 切换品牌 → 更新槽位并重列车型', () => {
    const r = run('其实我想看理想', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.updatedSlots.brand).toBe('理想');
    expect(r.updatedSlots.series).toBeNull();
    expect(r.nextState).toBe('MODEL_INQUIRY');
  });

  it('MODEL_INQUIRY + 类型描述 → 列出全部车系并停留（筛选能力已随附加字段移除）', () => {
    // 知识库仅品牌+车系，无类型字段：'有没有MPV' 不再筛选，列出品牌全部车系
    const r = run('有没有MPV', 'MODEL_INQUIRY', { ...emptySlots, brand: '理想' });
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.reply).toContain('理想');
    expect(r.reply).toContain('L9'); // 全部车系中应包含 MPV 车型 MEGA 及其他
  });

  it('防误收集：否定意图中提到的品牌不入槽', () => {
    const r = run('我不想看蔚来', 'BRAND_INQUIRY');
    // “不想”触发 disagree，实体收集被跳过，品牌不入槽
    expect(r.updatedSlots.brand).toBeNull();
  });

  it('不回问：品牌已确认 + 同意 → 推进到车型而非追问品牌', () => {
    const r = run('可以', 'BRAND_INQUIRY', { ...emptySlots, brand: '蔚来' });
    expect(r.nextState).toBe('MODEL_INQUIRY');
    expect(r.reply).not.toContain('品牌');
  });

  it('不回问：车系已确认 + 同意 → 推进到城市而非追问车系', () => {
    const r = run('可以', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来', series: 'ES8' });
    expect(r.nextState).toBe('CITY_INQUIRY');
    expect(r.reply).not.toContain('哪款');
  });

  it('不回问：城市已确认 + 同意 → 推进到时间', () => {
    const r = run('可以', 'CITY_INQUIRY', { ...emptySlots, city: '北京' });
    expect(r.nextState).toBe('TIMING_INQUIRY');
    expect(r.reply).not.toContain('城市');
  });

  it('不回问：时间已确认 + 同意 → 推进到联系方式', () => {
    const r = run('可以', 'TIMING_INQUIRY', { ...emptySlots, timing: '下个月' });
    expect(r.nextState).toBe('CONTACT_COLLECTION');
  });

  it('不回问：姓氏已确认 + 同意 → 信息闭环推进结束', () => {
    const r = run('可以', 'CONTACT_COLLECTION', { ...emptySlots, surname: '王' });
    expect(r.nextState).toBe('FAREWELL');
    expect(r.reply).not.toContain('贵姓');
  });
});

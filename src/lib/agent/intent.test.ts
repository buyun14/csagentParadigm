import { describe, it, expect } from 'vitest';
import { recognizeIntent } from './intent';

describe('recognizeIntent 意图识别', () => {
  it('空输入 → unclear', () => {
    const r = recognizeIntent('');
    expect(r.intent).toBe('unclear');
  });

  it('辱骂 → abuse（高置信度）', () => {
    const r = recognizeIntent('你是个傻逼');
    expect(r.intent).toBe('abuse');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('反感表达 → dislike', () => {
    const r = recognizeIntent('别打了，烦死了');
    expect(r.intent).toBe('dislike');
  });

  it('告别 → farewell', () => {
    const r = recognizeIntent('好的再见');
    expect(r.intent).toBe('farewell');
  });

  it('等待 → wait', () => {
    const r = recognizeIntent('您稍等一下');
    expect(r.intent).toBe('wait');
  });

  it('简单问候 → greet', () => {
    const r = recognizeIntent('你好');
    expect(r.intent).toBe('greet');
  });

  it('肯定 → agree', () => {
    const r = recognizeIntent('可以');
    expect(r.intent).toBe('agree');
  });

  it('否定 → disagree', () => {
    const r = recognizeIntent('不用了，不考虑');
    expect(r.intent).toBe('disagree');
  });

  it('品牌确认：包含品牌名 → confirm_brand + 实体', () => {
    const r = recognizeIntent('我看蔚来');
    expect(r.intent).toBe('confirm_brand');
    expect(r.entities.brand).toBe('蔚来');
  });

  it('车系确认：ES8 → confirm_model + 品牌/车系实体', () => {
    const r = recognizeIntent('想看蔚来 ES8');
    expect(r.intent).toBe('confirm_model');
    expect(r.entities.series).toBe('ES8');
    expect(r.entities.brand).toBe('蔚来');
  });

  it('城市确认：我在北京 → confirm_city', () => {
    const r = recognizeIntent('我在北京');
    expect(r.intent).toBe('confirm_city');
    expect(r.entities.city).toBe('北京');
  });

  it('时间确认：下个月 → confirm_time', () => {
    const r = recognizeIntent('下个月买');
    expect(r.intent).toBe('confirm_time');
    expect(r.entities.timing).toBe('下个月');
  });

  it('姓氏确认：我姓张 → confirm_surname', () => {
    const r = recognizeIntent('我姓张');
    expect(r.intent).toBe('confirm_surname');
    expect(r.entities.surname).toBe('张');
  });

  it('手机尾号：尾号1234 → phoneTail 实体', () => {
    const r = recognizeIntent('尾号是1234');
    expect(r.entities.phoneTail).toBe('1234');
  });

  it('纯 4 位数字 → phoneTail', () => {
    const r = recognizeIntent('5678');
    expect(r.entities.phoneTail).toBe('5678');
  });

  it('车身类型筛选 → filter_vehicle', () => {
    const r = recognizeIntent('想要个SUV');
    expect(r.intent).toBe('filter_vehicle');
    expect(r.entities.vehicleType).toBe('SUV');
  });

  it('超范围问题（价格）→ out_of_scope', () => {
    const r = recognizeIntent('这车多少钱？');
    expect(r.intent).toBe('out_of_scope');
  });

  it('完全无关 → off_track', () => {
    const r = recognizeIntent('今天天气不错哈哈哈');
    expect(r.intent).toBe('off_track');
  });
});

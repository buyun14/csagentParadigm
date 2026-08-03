import { describe, it, expect } from 'vitest';
import { checkCache } from './cache';

describe('cache 固定话术缓存', () => {
  it('辱骂关键词 → ANY:abuse', () => {
    const r = checkCache('GREETING', '你傻逼吧');
    expect(r?.key).toBe('ANY:abuse');
    expect(r?.next_state).toBe('FAREWELL');
  });

  it('反感关键词 → ANY:dislike', () => {
    const r = checkCache('BRAND_INQUIRY', '别打了，又是推销');
    expect(r?.key).toBe('ANY:dislike');
  });

  it('等待/忙 → ANY:wait（保持当前状态）', () => {
    const r = checkCache('MODEL_INQUIRY', '稍等一下');
    expect(r?.key).toBe('ANY:wait');
    expect(r?.next_state).toBe('');
  });

  it('GREETING 状态 + 简单问候 → GREETING:greet', () => {
    const r = checkCache('GREETING', '喂，你好');
    expect(r?.key).toBe('GREETING:greet');
  });

  it('FAREWELL 状态 → FAREWELL:farewell', () => {
    const r = checkCache('FAREWELL', '嗯好');
    expect(r?.key).toBe('FAREWELL:farewell');
  });

  it('普通输入不命中缓存', () => {
    const r = checkCache('BRAND_INQUIRY', '我想看蔚来');
    expect(r).toBeNull();
  });
});

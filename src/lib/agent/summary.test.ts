import { describe, it, expect } from 'vitest';
import { buildConversationSummary, composeContext, SUMMARY_THRESHOLD, KEEP_RECENT } from './summary';
import type { ChatMessage, CollectedSlots } from './types';

const emptySlots: CollectedSlots = {
  brand: null, series: null, model: null, city: null, timing: null,
  surname: null, phoneTail: null, vehicleType: null, powerType: null,
};

function msg(role: 'agent' | 'customer', content: string, i: number): ChatMessage {
  return { id: `m-${i}`, role, content, timestamp: i };
}

function buildLongHistory(turns: number): ChatMessage[] {
  const arr: ChatMessage[] = [];
  for (let i = 0; i < turns; i++) {
    arr.push(msg('agent', `第${i}轮提问`, i * 2));
    arr.push(msg('customer', i === 0 ? '我想看蔚来' : '嗯好', i * 2 + 1));
  }
  return arr;
}

describe('rolling summary 对话历史摘要', () => {
  it('短对话不触发摘要', () => {
    const messages = buildLongHistory(3);
    const s = buildConversationSummary(messages, emptySlots);
    expect(s.active).toBe(false);
    expect(s.text).toBeNull();
  });

  it(`超过 ${SUMMARY_THRESHOLD} 条消息触发摘要`, () => {
    const messages = buildLongHistory(10); // 20 条
    const s = buildConversationSummary(messages, emptySlots);
    expect(s.active).toBe(true);
    expect(s.text).toContain('历史摘要');
    expect(s.archivedCount).toBe(messages.length - KEEP_RECENT);
  });

  it('摘要包含已确认信息槽位', () => {
    const messages = buildLongHistory(10);
    const slots = { ...emptySlots, brand: '蔚来', series: 'ES8', city: '北京', surname: '王' };
    const s = buildConversationSummary(messages, slots);
    expect(s.text).toContain('品牌:蔚来');
    expect(s.text).toContain('车系:ES8');
    expect(s.text).toContain('姓氏:王');
  });

  it('摘要包含早期客户消息提及的实体', () => {
    const messages = buildLongHistory(10);
    const s = buildConversationSummary(messages, emptySlots);
    // 第一轮客户说"我想看蔚来"被归档，resolveBrand 提取到蔚来
    expect(s.text).toContain('蔚来');
  });

  it('composeContext 合并摘要与最近消息', () => {
    const messages = buildLongHistory(10);
    const recent = messages.slice(-4).map((m) => ({ role: m.role, content: m.content }));
    const { context, summary } = composeContext(messages, { ...emptySlots, brand: '理想' }, recent);
    expect(summary.active).toBe(true);
    expect(context).toContain('历史摘要');
    expect(context).toContain('客服:');
  });

  it('短对话 composeContext 只含最近消息', () => {
    const messages = buildLongHistory(2);
    const recent = messages.slice(-2).map((m) => ({ role: m.role, content: m.content }));
    const { context, summary } = composeContext(messages, emptySlots, recent);
    expect(summary.active).toBe(false);
    expect(context).not.toContain('历史摘要');
  });
});

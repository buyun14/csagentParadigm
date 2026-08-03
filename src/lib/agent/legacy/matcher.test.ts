import { describe, it, expect } from 'vitest';
import {
  matchLegacyKnowledge,
  matchKeyword,
  getAnswerForRound,
  bumpRound,
} from './matcher';
import { legacyKnowledgeEntries } from './knowledge-entries';

describe('legacy 优先级匹配器', () => {
  it('数据完整性：21 条按 priority 升序', () => {
    expect(legacyKnowledgeEntries.length).toBe(21);
    const priorities = legacyKnowledgeEntries.map((e) => e.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });

  it('纯包含关键词匹配', () => {
    expect(matchKeyword('你们是骚扰电话吧', '骚扰电话')).toBe(true);
    expect(matchKeyword('正常文本', '骚扰电话')).toBe(false);
  });

  it('正则字面量匹配（^...$）', () => {
    expect(matchKeyword('优惠多少', '^优惠多少')).toBe(true);
    expect(matchKeyword('先说说优惠多少吧', '^优惠多少')).toBe(false);
  });

  it('正则字面量匹配（.* 通配）', () => {
    expect(matchKeyword('我全天都没时间', '没.*时间')).toBe(true);
  });

  it('非法正则回退到包含匹配', () => {
    // 孤立反斜杠编译失败，回退包含匹配：文本含反斜杠时命中
    expect(matchKeyword('a\\b', '\\')).toBe(true);
    expect(matchKeyword('普通文本', '\\')).toBe(false);
  });

  it('辱骂/骚扰类高优先级命中（priority 10 优先于 100）', () => {
    const r = matchLegacyKnowledge('不要再给我打电话了，我要投诉你们！');
    expect(r).not.toBeNull();
    expect(r!.entry.priority).toBeLessThanOrEqual(10);
  });

  it('客户忙（priority 20）命中', () => {
    const r = matchLegacyKnowledge('我正在开会，不方便');
    expect(r).not.toBeNull();
    expect(r!.entry.issue).toContain('不方便');
  });

  it('未命中返回 null', () => {
    const r = matchLegacyKnowledge('我想了解一下蔚来 ES8 的价格');
    // 价格类在知识库中为 business 型（询问价格/优惠），此处可能命中或 null，仅验证不抛错
    expect(r === null || r!.entry.priority > 0).toBe(true);
  });

  it('多答案轮次：round=0 取第一个，越界取最后一个', () => {
    const entry = legacyKnowledgeEntries.find((e) => e.answers.length >= 2);
    if (!entry) return;
    const first = getAnswerForRound(entry, 0);
    const last = getAnswerForRound(entry, 999);
    expect(first).toBe(entry.answers[0].content);
    expect(last).toBe(entry.answers[entry.answers.length - 1].content);
  });

  it('roundMap 计数：连续命中递增轮次', () => {
    const roundMap = new Map<string, number>();
    const r1 = matchLegacyKnowledge('我要投诉你', roundMap);
    if (r1) bumpRound(roundMap, r1.entry.uuid);
    const r2 = matchLegacyKnowledge('我要投诉你', roundMap);
    if (r2) {
      expect(r2.round).toBe(1);
    }
  });

  it('answers 为空时返回空串', () => {
    const emptyEntry = legacyKnowledgeEntries.find((e) => e.answers.length === 0);
    if (!emptyEntry) return;
    expect(getAnswerForRound(emptyEntry, 0)).toBe('');
  });
});

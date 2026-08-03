import { describe, it, expect } from 'vitest';
import {
  createSpecialTokenState,
  handleAiUnknown,
  handleAiUnknownEnd,
  handleUserNotAnswer,
  resetSpecialTokens,
  AI_UNKNOWN_MAX,
} from './special-tokens';

describe('特殊令牌 special-tokens', () => {
  it('初始状态计数为 0', () => {
    expect(createSpecialTokenState()).toEqual({ aiUnknownCount: 0, userNotAnswerCount: 0 });
  });

  it('AI_UNKNOWN 未达阈值：递增计数、不挂机', () => {
    const s = createSpecialTokenState();
    const r1 = handleAiUnknown(s);
    expect(r1.escalated).toBe(false);
    expect(r1.shouldHangup).toBe(false);
    expect(r1.updated.aiUnknownCount).toBe(1);
    expect(r1.reply.length).toBeGreaterThan(0);
  });

  it(`AI_UNKNOWN 连续 ${AI_UNKNOWN_MAX} 次 → 升级 AI_UNKNOWN_END 并挂机`, () => {
    let s = createSpecialTokenState();
    let r;
    for (let i = 0; i < AI_UNKNOWN_MAX; i++) {
      r = handleAiUnknown(s);
      s = r.updated;
    }
    expect(r!.escalated).toBe(true);
    expect(r!.shouldHangup).toBe(true);
    expect(r!.updated.aiUnknownCount).toBe(0);
    // 最终处理话术来自老系统知识库条目
    expect(r!.reply).toContain('顾问');
  });

  it('AI_UNKNOWN_END 直接挂机', () => {
    const s = createSpecialTokenState();
    const r = handleAiUnknownEnd(s);
    expect(r.shouldHangup).toBe(true);
    expect(r.escalated).toBe(true);
  });

  it('USER_NOT_ANSWER 多答案轮次：前两轮提醒、末轮挂机', () => {
    let s = createSpecialTokenState();
    const r1 = handleUserNotAnswer(s);
    expect(r1.shouldHangup).toBe(false);
    expect(r1.updated.userNotAnswerCount).toBe(1);
    s = r1.updated;
    const r2 = handleUserNotAnswer(s);
    expect(r2.shouldHangup).toBe(false);
    s = r2.updated;
    const r3 = handleUserNotAnswer(s);
    expect(r3.shouldHangup).toBe(true);
    // 挂机后重置计数
    expect(r3.updated.userNotAnswerCount).toBe(0);
  });

  it('resetSpecialTokens 清零全部计数', () => {
    let s = createSpecialTokenState();
    s = handleAiUnknown(s).updated;
    s = handleUserNotAnswer(s).updated;
    expect(s.aiUnknownCount).toBeGreaterThan(0);
    expect(s.userNotAnswerCount).toBeGreaterThan(0);
    expect(resetSpecialTokens(s)).toEqual({ aiUnknownCount: 0, userNotAnswerCount: 0 });
  });
});

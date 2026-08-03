import { legacyKnowledgeEntries } from './knowledge-entries';
import { getAnswerForRound } from './matcher';
import type { LegacyKnowledgeEntry } from './legacy-types';

/**
 * 老系统特殊令牌落地（文本版逻辑）
 *
 * 老系统知识库含 3 个系统级特殊令牌（非关键词，由平台侧信号注入）：
 * - AI_UNKNOWN：LLM 无法应答（"抱歉，暂时没听清您的问题…"），连续 3 次后升级 AI_UNKNOWN_END → 挂机
 * - AI_UNKNOWN_END：连续 3 次无法回答的最终处理（转人工顾问 + hangup）
 * - USER_NOT_ANSWER：用户不回答（静音超时，语音侧信号），多答案轮次后 hangup
 *
 * 语音信号源由平台提供；本模块负责计数与动作逻辑，可在模拟输入下独立测试。
 */

export const AI_UNKNOWN_MAX = 3;

export interface SpecialTokenState {
  /** AI_UNKNOWN 连续次数（未升级时） */
  aiUnknownCount: number;
  /** USER_NOT_ANSWER 连续次数 */
  userNotAnswerCount: number;
}

export interface SpecialTokenResult {
  updated: SpecialTokenState;
  /** 应答话术 */
  reply: string;
  /** 是否应结束对话（挂机） */
  shouldHangup: boolean;
  /** 是否升级为 AI_UNKNOWN_END */
  escalated: boolean;
}

export function createSpecialTokenState(): SpecialTokenState {
  return { aiUnknownCount: 0, userNotAnswerCount: 0 };
}

/** 按 issue 查找知识条目 */
function findEntry(issue: string): LegacyKnowledgeEntry | undefined {
  return legacyKnowledgeEntries.find((e) => e.issue === issue);
}

/**
 * AI_UNKNOWN：无法应答信号。
 * 连续 AI_UNKNOWN_MAX 次 → 升级 AI_UNKNOWN_END（取"AI连续3次无法回答的最终处理"条目）并重置计数；
 * 未达阈值 → 取"无法应答处理"条目按轮次应答。
 */
export function handleAiUnknown(state: SpecialTokenState): SpecialTokenResult {
  const count = state.aiUnknownCount + 1;
  const entry = findEntry('无法应答处理');

  if (count >= AI_UNKNOWN_MAX) {
    const endEntry = findEntry('AI连续3次无法回答的最终处理');
    return {
      updated: { ...state, aiUnknownCount: 0 },
      reply: endEntry?.answers[0]?.content ?? '您好，暂时无法回答您的问题，稍后会有专业顾问联系您。',
      shouldHangup: true,
      escalated: true,
    };
  }

  const reply = entry ? getAnswerForRound(entry, count - 1) : '抱歉，暂时没听清您的问题，您能再说一遍吗？';
  return {
    updated: { ...state, aiUnknownCount: count },
    reply,
    shouldHangup: false,
    escalated: false,
  };
}

/**
 * AI_UNKNOWN_END：连续 3 次无法回答的最终处理（转人工 + 挂机）
 */
export function handleAiUnknownEnd(state: SpecialTokenState): SpecialTokenResult {
  const endEntry = findEntry('AI连续3次无法回答的最终处理');
  return {
    updated: { ...state, aiUnknownCount: 0 },
    reply: endEntry?.answers[0]?.content ?? '您好，暂时无法回答您的问题，稍后会有专业顾问联系您。',
    shouldHangup: true,
    escalated: true,
  };
}

/**
 * USER_NOT_ANSWER：用户不回答（静音超时）。
 * 按"用户不回答"条目多答案轮次应答；当轮答案 method 为 hangup 时结束对话并重置计数。
 */
export function handleUserNotAnswer(state: SpecialTokenState): SpecialTokenResult {
  const count = state.userNotAnswerCount + 1;
  const entry = findEntry('用户不回答');
  const answer = entry?.answers[Math.min(count - 1, entry.answers.length - 1)];
  const reply = entry ? getAnswerForRound(entry, count - 1) : '喂，您能听到我说话吗？';
  // hangup 与 appoint_process（转向其他流程/结束当前轮）均视为结束语义
  const shouldHangup = answer?.method === 'hangup' || answer?.method === 'appoint_process';

  return {
    updated: { ...state, userNotAnswerCount: shouldHangup ? 0 : count },
    reply,
    shouldHangup,
    escalated: false,
  };
}

/** 正常对话轮次时重置全部特殊令牌计数（客户正常说话了） */
export function resetSpecialTokens(state: SpecialTokenState): SpecialTokenState {
  return { aiUnknownCount: 0, userNotAnswerCount: 0 };
}

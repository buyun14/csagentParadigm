import type { ChatMessage, CollectedSlots } from './types';
import { resolveBrand, resolveType, resolvePower } from './knowledge-base';

/**
 * 对话历史摘要（rolling summary）
 *
 * 老系统根因：低代码平台没有"历史上下文"变量，每轮 LLM 都在失忆状态下运行。
 * 本模块提供规则式早期对话压缩：对话超过阈值后，把早期消息归档为摘要
 * （已确认信息 + 早期提及实体），仅保留最近 N 条原文，从机制上保证长对话记忆可延续。
 *
 * 不调用 LLM（避免摘要本身的成本与延迟），基于槽位状态 + 实体抽取实现。
 */

/** 超过该消息条数（≈6 轮）触发摘要 */
export const SUMMARY_THRESHOLD = 12;

/** 始终保留的最近消息条数 */
export const KEEP_RECENT = 8;

export interface ConversationSummary {
  /** 摘要文本（注入 prompt 用），未达阈值时为 null */
  text: string | null;
  /** 是否触发了摘要归档 */
  active: boolean;
  /** 归档的早期消息条数 */
  archivedCount: number;
}

/**
 * 生成对话摘要：早期消息归档 + 已确认信息 + 早期提及实体
 */
export function buildConversationSummary(
  messages: ChatMessage[],
  slots: CollectedSlots
): ConversationSummary {
  if (messages.length <= SUMMARY_THRESHOLD) {
    return { text: null, active: false, archivedCount: 0 };
  }

  const early = messages.slice(0, messages.length - KEEP_RECENT);

  // 1. 已确认信息（来自槽位）
  const confirmedParts = [
    slots.brand && `品牌:${slots.brand}`,
    slots.series && `车系:${slots.series}`,
    slots.city && `城市:${slots.city}`,
    slots.timing && `购车时间:${slots.timing}`,
    slots.surname && `姓氏:${slots.surname}`,
  ].filter(Boolean) as string[];
  const confirmed = confirmedParts.length > 0 ? confirmedParts.join('、') : '暂无';

  // 2. 早期客户消息中提及但未入槽位的实体（补充记忆）
  const mentioned: string[] = [];
  for (const m of early) {
    if (m.role !== 'customer') continue;
    const text = m.content;
    const brand = resolveBrand(text);
    if (brand && !mentioned.includes(brand)) mentioned.push(brand);
    const type = resolveType(text);
    if (type && !mentioned.includes(type)) mentioned.push(type);
    const power = resolvePower(text);
    if (power && !mentioned.includes(power)) mentioned.push(power);
  }

  const extra = mentioned.length > 0 ? `；早期提及：${mentioned.join('、')}` : '';
  const text = `【历史摘要】早期 ${early.length} 条消息已归档。已确认信息：${confirmed}${extra}。以上为已归档内容，勿重复询问。`;

  return { text, active: true, archivedCount: early.length };
}

/**
 * 将摘要与最近消息合并为完整上下文（供 prompt 注入）
 */
export function composeContext(
  messages: ChatMessage[],
  slots: CollectedSlots,
  recentHistory: Array<{ role: string; content: string }>
): { context: string; summary: ConversationSummary } {
  const summary = buildConversationSummary(messages, slots);
  const recentText = recentHistory
    .map((m) => `${m.role === 'agent' ? '客服' : '客户'}: ${m.content}`)
    .join('\n');
  const context = summary.text ? `${summary.text}\n${recentText}` : recentText;
  return { context, summary };
}

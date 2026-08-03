import { legacyKnowledgeEntries } from './knowledge-entries';
import type { LegacyKnowledgeEntry } from './legacy-types';

/**
 * 优先级匹配器：将老系统 21 条优先级知识库落地为可调用模块。
 * - 按 priority 升序匹配（越小越优先，与老系统一致）；
 * - keywords 支持"正则字面量"（含 .* ^ $ (|) ? 等元字符时按正则编译，失败回退包含匹配）与"纯包含匹配"；
 * - forbid 标记仅由业务层决定处理策略，不阻止匹配本身；
 * - 多答案轮次：answers 为数组，按命中次数顺序取用（老系统"多答案顺序播放"的文本版）。
 */

export interface LegacyMatchResult {
  /** 命中的知识条目 */
  entry: LegacyKnowledgeEntry;
  /** 命中的关键词（原文，便于调试） */
  matchedKeyword: string;
  /** 多答案轮次计数（第几次命中该条目，从 0 开始） */
  round: number;
}

/** 判断关键词是否为"正则字面量"（含正则元字符则按正则处理） */
function isRegexLike(keyword: string): boolean {
  return /[\\^$.*+?()[\]{}|]/.test(keyword);
}

/** 单个关键词匹配：正则字面量按正则编译，否则按包含匹配 */
export function matchKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  if (isRegexLike(keyword)) {
    try {
      return new RegExp(keyword).test(text);
    } catch {
      // 非法正则回退到包含匹配，避免一条坏词表拖垮整体
      return text.includes(keyword);
    }
  }
  return text.includes(keyword);
}

/**
 * 按优先级匹配：遍历所有条目（priority 升序），返回第一个命中项。
 * @param input 客户输入文本
 * @param roundMap 可选：各条目已命中次数（用于多答案轮次），缺省 0
 */
export function matchLegacyKnowledge(
  input: string,
  roundMap?: Map<string, number>
): LegacyMatchResult | null {
  const text = input.trim();
  if (!text) return null;

  for (const entry of legacyKnowledgeEntries) {
    for (const kw of entry.keywords) {
      if (matchKeyword(text, kw)) {
        const round = roundMap?.get(entry.uuid) ?? 0;
        return { entry, matchedKeyword: kw, round };
      }
    }
  }
  return null;
}

/**
 * 获取条目第 round 次的应答文本（多答案轮次；越界取最后一个）
 */
export function getAnswerForRound(entry: LegacyKnowledgeEntry, round: number): string {
  const answers = entry.answers;
  if (answers.length === 0) return '';
  const idx = Math.min(Math.max(round, 0), answers.length - 1);
  return answers[idx].content;
}

/**
 * 便捷：命中次数自增器（配合 roundMap 使用）
 */
export function bumpRound(roundMap: Map<string, number>, uuid: string): number {
  const next = (roundMap.get(uuid) ?? 0) + 1;
  roundMap.set(uuid, next);
  return next;
}

/**
 * 轻量缓存机制
 * 缓存固定话术，跳过 LLM 调用
 */

import type { MainDialogState } from './types';

// 缓存配置
interface CacheEntry {
  response: string;
  nextState?: MainDialogState;
}

// 缓存规则
const CACHE_RULES: Array<{
  state: MainDialogState | '*';
  intentKeywords: string[];
  entry: CacheEntry;
}> = [
  // 问候场景
  {
    state: 'GREETING',
    intentKeywords: ['喂', '你好', '嗯', '在', '说'],
    entry: {
      response: '喂，你好。这边是互联网汽车营销中心的，价格合适的话，您这边考虑过买车吗？给您做一个报价，您参考了解一下哈，您看最近有比较关注哪款车呀？',
    },
  },
  // 告别场景
  {
    state: 'FAREWELL',
    intentKeywords: ['再见', '拜拜', '好的', '嗯'],
    entry: {
      response: '好的，那就不打扰您了，祝您生活愉快，再见。',
      nextState: 'FAREWELL',
    },
  },
  // 辱骂场景
  {
    state: '*',
    intentKeywords: ['滚', '骂', '傻', '烦', '吵'],
    entry: {
      response: '不好意思打扰了，祝您生活愉快，再见。',
      nextState: 'FAREWELL',
    },
  },
  // 反感场景
  {
    state: '*',
    intentKeywords: ['别打了', '不要', '不需要', '不用'],
    entry: {
      response: '理解您的感受，那就不打扰了，如果有需要随时联系我们。',
      nextState: 'FAREWELL',
    },
  },
];

/**
 * 检查是否命中缓存
 */
export function checkCache(
  currentState: MainDialogState,
  userInput: string
): { hit: boolean; response?: string; nextState?: MainDialogState } {
  const normalizedInput = userInput.trim().toLowerCase();

  for (const rule of CACHE_RULES) {
    // 检查状态匹配
    if (rule.state !== '*' && rule.state !== currentState) {
      continue;
    }

    // 检查关键词匹配
    const matched = rule.intentKeywords.some(keyword => 
      normalizedInput.includes(keyword.toLowerCase())
    );

    if (matched) {
      return {
        hit: true,
        response: rule.entry.response,
        nextState: rule.entry.nextState,
      };
    }
  }

  return { hit: false };
}

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  return {
    totalRules: CACHE_RULES.length,
    states: [...new Set(CACHE_RULES.map(r => r.state))],
  };
}

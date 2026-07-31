import type { MainDialogState, CacheEntry } from '@/lib/agent/types';

/**
 * 轻量缓存机制
 * 用于固定话术场景，命中时跳过 LLM 调用
 */

// 默认缓存话术
const defaultCacheEntries: CacheEntry[] = [
  // 开场白
  {
    key: 'GREETING:greet',
    response: '喂，你好。这边是互联网汽车营销中心的，价格合适的话，您这边考虑过买车吗？给您做一个报价，您参考了解一下哈，您看最近有比较关注哪款车呀？',
    intent: 'greet',
    next_state: 'BRAND_INQUIRY',
  },
  // 结束语
  {
    key: 'FAREWELL:farewell',
    response: '好的，稍后会有专人联系您，祝您生活愉快，再见。',
    intent: 'farewell',
    next_state: 'FAREWELL',
  },
  // 辱骂退出
  {
    key: 'ANY:abuse',
    response: '不好意思打扰了，祝您生活愉快，再见。',
    intent: 'abuse',
    next_state: 'FAREWELL',
  },
  // 反感退出
  {
    key: 'ANY:dislike',
    response: '理解您的感受，那就不打扰了，如果有需要随时联系我们。',
    intent: 'dislike',
    next_state: 'FAREWELL',
  },
  // 等待回应
  {
    key: 'ANY:wait',
    response: '好的，您先忙，不着急。',
    intent: 'wait',
    next_state: '', // 保持当前状态
  },
];

// 缓存存储（运行时可修改）
let cacheStore: Map<string, CacheEntry> = new Map(
  defaultCacheEntries.map(entry => [entry.key, entry])
);

/**
 * 检测是否命中缓存
 * @param currentState 当前状态
 * @param intent 识别到的意图（可选，用于预判）
 * @param userInput 用户输入（用于关键词检测）
 */
export function checkCache(
  currentState: MainDialogState,
  userInput: string
): CacheEntry | null {
  const input = userInput.trim().toLowerCase();

  // 1. 检测辱骂关键词
  if (detectAbuse(input)) {
    return cacheStore.get('ANY:abuse') || null;
  }

  // 2. 检测反感关键词
  if (detectDislike(input)) {
    return cacheStore.get('ANY:dislike') || null;
  }

  // 3. 检测等待/稍等
  if (detectWait(input)) {
    return cacheStore.get('ANY:wait') || null;
  }

  // 4. GREETING 状态 + 简单问候 → 固定开场
  if (currentState === 'GREETING' && isSimpleGreet(input)) {
    return cacheStore.get('GREETING:greet') || null;
  }

  // 5. FAREWELL 状态 → 固定结束语
  if (currentState === 'FAREWELL') {
    return cacheStore.get('FAREWELL:farewell') || null;
  }

  return null;
}

// 辱骂检测
function detectAbuse(input: string): boolean {
  const abuseKeywords = ['傻逼', '妈的', '滚', '操', '草', 'fuck', 'shit', '去死', '神经病', '有病'];
  return abuseKeywords.some(kw => input.includes(kw));
}

// 反感检测
function detectDislike(input: string): boolean {
  const dislikeKeywords = ['别打了', '不要打', '又是推销', '烦死了', '不需要', '别烦我', '骚扰', '投诉'];
  return dislikeKeywords.some(kw => input.includes(kw));
}

// 等待检测
function detectWait(input: string): boolean {
  const waitKeywords = ['等一下', '稍等', '等会', '现在忙', '在开会', '一会'];
  return waitKeywords.some(kw => input.includes(kw));
}

// 简单问候检测
function isSimpleGreet(input: string): boolean {
  const greetKeywords = ['喂', '你好', '嗯', '哦', '啊', '嗨', 'hi', 'hello'];
  // 只匹配纯问候（没有其他内容）
  if (input.length <= 6) {
    return greetKeywords.some(kw => input.includes(kw));
  }
  return false;
}

/**
 * 获取所有缓存条目（用于前端编辑）
 */
export function getAllCacheEntries(): CacheEntry[] {
  return Array.from(cacheStore.values());
}

/**
 * 更新缓存条目
 */
export function updateCacheEntry(key: string, entry: Partial<CacheEntry>): boolean {
  const existing = cacheStore.get(key);
  if (!existing) return false;
  cacheStore.set(key, { ...existing, ...entry });
  return true;
}

/**
 * 添加缓存条目
 */
export function addCacheEntry(entry: CacheEntry): void {
  cacheStore.set(entry.key, entry);
}

/**
 * 删除缓存条目
 */
export function removeCacheEntry(key: string): boolean {
  return cacheStore.delete(key);
}

/**
 * 重置缓存为默认
 */
export function resetCache(): void {
  cacheStore = new Map(
    defaultCacheEntries.map(entry => [entry.key, entry])
  );
}

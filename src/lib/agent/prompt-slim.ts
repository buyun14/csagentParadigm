import type { MainDialogState, CollectedSlots } from '@/lib/agent/types';
import { knowledgeBase } from './knowledge-base';

// 格式化槽位信息
function formatSlots(slots: CollectedSlots): string {
  return `品牌:${slots.brand || '无'}, 车系:${slots.series || '无'}, 城市:${slots.city || '无'}, 时间:${slots.timing || '无'}, 姓氏:${slots.surname || '无'}, 手机尾号:${slots.phoneTail || '无'}`;
}

// 状态目标（精简版）
const stateGoals: Record<MainDialogState, string> = {
  GREETING: '开场问候，询问关注品牌',
  BRAND_INQUIRY: '确认品牌',
  MODEL_INQUIRY: '确认车系',
  CITY_INQUIRY: '确认城市',
  TIMING_INQUIRY: '确认购车时间',
  CONTACT_COLLECTION: '收集姓氏',
  FAREWELL: '告别',
};

/**
 * 构建精简版 System Prompt（快通道用）
 * 特点：短角色设定 + 按需知识库 + 精简护栏
 */
export function buildSlimPrompt(
  currentState: MainDialogState,
  slots: CollectedSlots,
  recentHistory: Array<{ role: string; content: string }>
): string {
  const kbSection = buildSlimKnowledgeSection(slots);
  const historySection = recentHistory.length > 0
    ? `\n【最近对话】\n${recentHistory.slice(-4).map(m => `${m.role === 'agent' ? '客服' : '客户'}: ${m.content}`).join('\n')}`
    : '';

  return `你是汽车营销中心电话客服。口语化、简短、自然。称呼"先生/女士"。

【状态】${currentState}（${stateGoals[currentState]}）
【已收集】品牌:${slots.brand || '无'}, 车系:${slots.series || '无'}, 城市:${slots.city || '无'}, 时间:${slots.timing || '无'}, 姓氏:${slots.surname || '无'}
${kbSection}${historySection}

【规则】辱骂→道歉退出 | 反感→安抚退出 | 偏离→拉回 | 问价格→引导对接4S店 | 不清晰→追问 | 不编造车型 | 每次只问一个

返回JSON:
{"intent":"意图","next_state":"下一状态","response":"回复"}`;
}

/**
 * 构建完整版 System Prompt（慢通道用）
 */
export function buildFullPrompt(
  currentState: MainDialogState,
  slots: CollectedSlots,
  fullHistory: Array<{ role: string; content: string }>
): string {
  const kbSection = buildFullKnowledgeSection(slots);
  const historySection = fullHistory.length > 0
    ? `\n【对话历史】\n${fullHistory.map(m => `${m.role === 'agent' ? '客服' : '客户'}: ${m.content}`).join('\n')}`
    : '';

  return `你是互联网汽车营销中心的电话客服坐席。通过外呼了解客户购车意向，收集信息后授权给当地4S店报价。

说话风格：自然口语化，像真人坐席，适当用语气词（嗯、哈、吧、呀），回复简短（1-3句），称呼"先生/女士"。

【当前状态】${currentState}（${stateGoals[currentState]}）
【已收集信息】
- 品牌：${slots.brand || '未收集'}
- 车系：${slots.series || '未收集'}
- 城市：${slots.city || '未收集'}
- 购车时间：${slots.timing || '未收集'}
- 客户姓氏：${slots.surname || '未收集'}
- 手机尾号：${slots.phoneTail || '未收集'}
${kbSection}${historySection}

【护栏规则】
1. 客户辱骂 → "不好意思打扰了，祝您生活愉快，再见" → next_state: FAREWELL
2. 客户反感（"又是推销""别打了"）→ "理解您的感受，不打扰了" → next_state: FAREWELL
3. 偏离话题 → 简短回应后柔性拉回
4. 问价格/优惠/配置 → "具体价格帮您对接当地4S店精准报价"
5. 输入不清晰 → 礼貌澄清
6. 不编造知识库没有的车型
7. 不一次问多个问题

返回JSON:
{"emotion":"neutral/interested/annoyed/angry","entities":{...},"reasoning":"决策理由","guardrail_check":"护栏检查结果"}`;
}

// 精简版知识库（只注入当前品牌）
function buildSlimKnowledgeSection(slots: CollectedSlots): string {
  if (slots.brand) {
    const brandData = knowledgeBase.brands[slots.brand];
    if (brandData) {
      const series = Object.entries(brandData.series)
        .map(([name, info]) => `${name}(${info.type}/${info.power})`)
        .join(',');
      return `\n【${slots.brand}】${series}`;
    }
  }
  // 没有品牌时，只列品牌名
  const brands = Object.keys(knowledgeBase.brands).join('、');
  return `\n【品牌】${brands}`;
}

// 完整版知识库
function buildFullKnowledgeSection(slots: CollectedSlots): string {
  if (slots.brand) {
    const brandData = knowledgeBase.brands[slots.brand];
    if (brandData) {
      const seriesList = Object.entries(brandData.series)
        .map(([name, info]) => `  - ${name}: ${info.type} / ${info.power} / ${info.priceRange}`)
        .join('\n');
      return `\n【知识库 - ${slots.brand}】\n${seriesList}`;
    }
  }
  const overview = Object.entries(knowledgeBase.brands)
    .map(([name, data]) => `  - ${name}: ${Object.keys(data.series).join('、')}`)
    .join('\n');
  return `\n【知识库概览】\n${overview}`;
}

/**
 * 估算 prompt token 数（粗略：中文1字≈1.5token，英文1词≈1token）
 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa3]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.3);
}

/**
 * 慢通道 Prompt（完整版，用于情绪分析、实体深度抽取、决策推理）
 */
export function buildSlowPrompt(
  state: MainDialogState,
  slots: CollectedSlots,
  history: Array<{ role: string; content: string }>,
  fastResponse: string
): string {
  const slotsText = formatSlots(slots);
  const kbSection = buildFullKnowledgeSection(slots);
  const historyText = history.slice(-12).map(m => `${m.role === 'agent' ? '客服' : '客户'}: ${m.content}`).join('\n');

  return `你是汽车营销中心客服。请深度分析以下对话。

【状态】${state}
【已收集】${slotsText}
【对话历史】
${historyText}

【快通道回复】${fastResponse}
${kbSection}

请分析：
1. 客户情绪（neutral/interested/annoyed/angry）
2. 提取所有实体（品牌/车系/城市/时间/姓氏/手机尾号/车型/动力类型）
3. 决策推理过程（为什么这样回复）
4. 护栏检查结果（是否触发辱骂/反感/偏离/超范围）

返回JSON：
{"emotion":"...","entities":{...},"reasoning":"...","guardrail_check":"..."}`;
}

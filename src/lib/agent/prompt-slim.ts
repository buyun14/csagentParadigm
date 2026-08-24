import type { MainDialogState, CollectedSlots } from '@/lib/agent/types';
import { knowledgeBase, resolveBrand } from './knowledge-base';
import { buildPolicyPromptBlock, collectionFieldLabel, nextMissingField } from './policy';

// 格式化槽位信息
function formatSlots(slots: CollectedSlots): string {
  return `品牌:${slots.brand || '无'}, 车系:${slots.series || '无'}, 城市:${slots.city || '无'}, 时间:${slots.timing || '无'}, 姓氏:${slots.surname || '无'}`;
}

// 状态目标（精简版）
const stateGoals: Record<MainDialogState, string> = {
  GREETING: '开场问候，询问关注品牌',
  BRAND_INQUIRY: '确认品牌',
  MODEL_INQUIRY: '确认车系',
  CITY_INQUIRY: '确认购车城市',
  TIMING_INQUIRY: '确认购车时间',
  CONTACT_COLLECTION: '收集姓氏（不问手机号）',
  FAREWELL: '告别',
};

/**
 * 构建精简版 System Prompt（快通道用）
 * 口径全文来自 policy.buildPolicyPromptBlock，禁止在此另写一套规则。
 */
export function buildSlimPrompt(
  currentState: MainDialogState,
  slots: CollectedSlots,
  recentHistory: Array<{ role: string; content: string }>,
  summary?: string
): string {
  const kbSection = buildSlimKnowledgeSection(slots);
  const historySection = recentHistory.length > 0
    ? `\n【最近对话】\n${recentHistory.slice(-4).map(m => `${m.role === 'agent' ? '客服' : '客户'}: ${m.content}`).join('\n')}`
    : '';
  const summarySection = summary ? `\n${summary}` : '';
  const missing = nextMissingField(slots);

  return `你是汽车营销中心电话客服。口语化、简短、自然。严禁输出"某先生""某女士"称谓，统一称呼客户为"您"；禁止"您好/女士"脏模板。

【状态】${currentState}（${stateGoals[currentState]}）
【已收集】${formatSlots(slots)}
【本轮只问】${collectionFieldLabel(missing)}
${kbSection}
${buildPolicyPromptBlock(slots)}${summarySection}${historySection}

客户最新消息中的品牌/车系/城市/时间/姓氏必须写入 entities（中文键）；只说了车系时可从知识库反推品牌（如汉→比亚迪）。entities 填知识库标准名。

返回JSON:
{"intent":"意图","next_state":"下一状态","response":"回复","entities":{"品牌":"","车系":"","城市":"","时间":"","姓氏":""}}

【next_state 必须严格是以下之一】GREETING / BRAND_INQUIRY / MODEL_INQUIRY / CITY_INQUIRY / TIMING_INQUIRY / CONTACT_COLLECTION / FAREWELL（未收集到新信息时保持当前状态）。
【intent 参考】greet / agree / disagree / confirm_brand / confirm_model / confirm_city / confirm_time / confirm_surname / out_of_scope / off_track / unclear / abuse / dislike / wait / farewell。`;
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

  return `你是互联网汽车营销中心的电话客服坐席。

说话风格：自然口语化，像真人坐席，回复简短（1-3句），统一称呼"您"，不猜测性别，禁止"先生/女士"与"您好/女士"。

【当前状态】${currentState}（${stateGoals[currentState]}）
【已收集】${formatSlots(slots)}
【本轮只问】${collectionFieldLabel(nextMissingField(slots))}
${kbSection}
${buildPolicyPromptBlock(slots)}${historySection}

返回JSON:
{"emotion":"neutral/interested/annoyed/angry","entities":{...},"reasoning":"决策理由","guardrail_check":"护栏检查结果"}`;
}

function buildSlimKnowledgeSection(slots: CollectedSlots): string {
  if (slots.brand) {
    const brandData = knowledgeBase.brands[resolveBrand(slots.brand) || ''] || knowledgeBase.brands[slots.brand];
    if (brandData) {
      const series = Object.keys(brandData.series).join('、');
      return `\n【${slots.brand}】${series}`;
    }
  }
  const brands = Object.keys(knowledgeBase.brands).join('、');
  return `\n【品牌】${brands}`;
}

function buildFullKnowledgeSection(slots: CollectedSlots): string {
  if (slots.brand) {
    const brandData = knowledgeBase.brands[resolveBrand(slots.brand) || ''] || knowledgeBase.brands[slots.brand];
    if (brandData) {
      const seriesList = Object.keys(brandData.series).join('、');
      return `\n【知识库 - ${slots.brand}】\n${seriesList}`;
    }
  }
  const brandNames = Object.keys(knowledgeBase.brands).join('、');
  return `\n【可用品牌】${brandNames}`;
}

export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.3);
}

export function buildSlowPrompt(
  state: MainDialogState,
  slots: CollectedSlots,
  history: Array<{ role: string; content: string }>,
  fastResponse: string,
  summary?: string
): string {
  const slotsText = formatSlots(slots);
  const kbSection = buildFullKnowledgeSection(slots);
  const historyText = history.slice(-12).map(m => `${m.role === 'agent' ? '客服' : '客户'}: ${m.content}`).join('\n');
  const summarySection = summary ? `\n${summary}` : '';

  return `你是汽车营销中心客服。请深度分析以下对话。

【状态】${state}
【已收集】${slotsText}
【本轮只问】${collectionFieldLabel(nextMissingField(slots))}
${summarySection}
【对话历史】
${historyText}

【快通道回复】${fastResponse}
${kbSection}
${buildPolicyPromptBlock(slots)}

请分析：
1. 客户情绪（neutral/interested/annoyed/angry）
2. 提取实体（品牌/车系/城市/时间/姓氏等；谐音错字填知识库标准名；未提及留空）
3. 决策推理
4. 护栏检查（辱骂/反感/偏离/超范围；通过则 pass）

返回JSON：
{"emotion":"...","entities":{...},"reasoning":"...","guardrail_check":"..."}`;
}

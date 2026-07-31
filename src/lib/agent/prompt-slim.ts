import type { CollectedSlots, MainDialogState, ExceptionState } from './types';

interface SlimPromptParams {
  currentState: MainDialogState;
  exceptionState?: ExceptionState;
  collectedSlots: CollectedSlots;
  recentMessages: Array<{ role: string; content: string }>;
  customerInput: string;
  kbData?: Record<string, unknown> | null;
}

// 状态目标映射
const stateGoals: Record<MainDialogState, string> = {
  GREETING: '问候客户，介绍来意，询问关注品牌',
  BRAND_INQUIRY: '确认客户关注的汽车品牌',
  MODEL_INQUIRY: '确认具体车系/车型',
  CITY_INQUIRY: '确认看车/购车城市',
  TIMING_INQUIRY: '确认购车时间',
  CONTACT_COLLECTION: '收集客户姓氏和手机尾号',
  FAREWELL: '礼貌结束通话',
};

// 格式化槽位信息
function formatSlots(slots: CollectedSlots): string {
  const items = [
    `品牌: ${slots.brand || '未收集'}`,
    `车系: ${slots.series || slots.model || '未收集'}`,
    `城市: ${slots.city || '未收集'}`,
    `时间: ${slots.timing || '未收集'}`,
    `姓氏: ${slots.surname || '未收集'}`,
    `手机尾号: ${slots.phoneTail || '未收集'}`,
  ];
  return items.join(', ');
}

// 格式化知识库数据
function formatKBData(kbData: Record<string, unknown> | null | undefined): string {
  if (!kbData) return '无';
  
  const brands = kbData as Record<string, { series?: Record<string, { type?: string; power?: string; price_range?: string }> }>;
  const lines: string[] = [];
  
  for (const [brandName, brandData] of Object.entries(brands)) {
    lines.push(`【${brandName}】`);
    if (brandData.series) {
      for (const [seriesName, seriesData] of Object.entries(brandData.series)) {
        lines.push(`  - ${seriesName}: ${seriesData.type || ''}/${seriesData.power || ''}, ${seriesData.price_range || ''}`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * 构建精简版 System Prompt（快通道）
 */
export function buildSlimPrompt(params: SlimPromptParams): { systemPrompt: string; userMessage: string } {
  const { currentState, collectedSlots, recentMessages, customerInput, kbData } = params;
  
  const currentGoal = stateGoals[currentState] || '继续对话流程';
  const slotsInfo = formatSlots(collectedSlots);
  const kbInfo = formatKBData(kbData);
  
  // 格式化最近对话
  const historyText = recentMessages
    .map(m => `${m.role === 'customer' ? '客户' : '坐席'}: ${m.content}`)
    .join('\n');

  const systemPrompt = `你是互联网汽车营销中心电话客服。自然口语化，像真人坐席，回复简短。

【当前状态】${currentState}
【目标】${currentGoal}
【已收集】${slotsInfo}

【知识库】
${kbInfo}

【规则】
1. 辱骂/反感→礼貌退出
2. 偏离话题→柔性拉回
3. 问价格/配置→"帮您对接四S店精准报价"
4. 不清晰→礼貌追问
5. 不编造车型信息

【输出格式】返回JSON：
{"intent":"意图","next_state":"下一状态","response":"回复内容"}`;

  const userMessage = historyText
    ? `${historyText}\n\n客户最新说: ${customerInput}`
    : customerInput;

  return { systemPrompt, userMessage };
}

/**
 * 构建完整版 System Prompt（慢通道）
 */
export function buildSlowPrompt(params: SlimPromptParams & { fastResponse: string }): { systemPrompt: string; userMessage: string } {
  const { currentState, collectedSlots, recentMessages, customerInput, kbData, fastResponse } = params;
  
  const currentGoal = stateGoals[currentState] || '继续对话流程';
  const slotsInfo = formatSlots(collectedSlots);
  const kbInfo = formatKBData(kbData);
  
  // 格式化最近对话
  const historyText = recentMessages
    .map(m => `${m.role === 'customer' ? '客户' : '坐席'}: ${m.content}`)
    .join('\n');

  const systemPrompt = `你是汽车营销客服分析助手。分析客户情绪、提取实体、评估对话质量。

【背景】
- 当前状态: ${currentState}
- 目标: ${currentGoal}
- 已收集: ${slotsInfo}
- 坐席回复: ${fastResponse}

【知识库】
${kbInfo}

【任务】
1. 分析客户情绪（neutral/interested/annoyed/angry）
2. 提取所有实体信息
3. 评估坐席回复是否合适
4. 检查是否触发护栏（辱骂/反感/偏离/超范围）

【输出格式】返回JSON：
{"emotion":"情绪","entities":{...},"reasoning":"分析过程","guardrail_check":"pass/fail"}`;

  const userMessage = historyText
    ? `${historyText}\n\n客户最新说: ${customerInput}`
    : customerInput;

  return { systemPrompt, userMessage };
}

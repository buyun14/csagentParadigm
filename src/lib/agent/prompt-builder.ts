import type { MainDialogState, CollectedSlots } from '@/lib/agent/types';
import { knowledgeBase, resolveBrand } from './knowledge-base';

// 状态对应的目标描述
const stateGoals: Record<MainDialogState, string> = {
  GREETING: '完成开场问候，了解客户是否有购车意向，询问关注的品牌/车型',
  BRAND_INQUIRY: '确认客户关注的汽车品牌',
  MODEL_INQUIRY: '确认客户关注的具体车系/车型（可引导客户按类型筛选）',
  CITY_INQUIRY: '确认客户看车购车的城市',
  TIMING_INQUIRY: '确认客户的购车时间',
  CONTACT_COLLECTION: '收集姓氏，确认口头授权',
  FAREWELL: '对话已结束，礼貌告别',
};

// 合法的状态转移
const validTransitions: Record<MainDialogState, MainDialogState[]> = {
  GREETING: ['GREETING', 'BRAND_INQUIRY', 'MODEL_INQUIRY', 'CITY_INQUIRY', 'FAREWELL'],
  BRAND_INQUIRY: ['BRAND_INQUIRY', 'MODEL_INQUIRY', 'FAREWELL'],
  MODEL_INQUIRY: ['MODEL_INQUIRY', 'CITY_INQUIRY', 'BRAND_INQUIRY', 'FAREWELL'],
  CITY_INQUIRY: ['CITY_INQUIRY', 'TIMING_INQUIRY', 'FAREWELL'],
  TIMING_INQUIRY: ['TIMING_INQUIRY', 'CONTACT_COLLECTION', 'FAREWELL'],
  CONTACT_COLLECTION: ['CONTACT_COLLECTION', 'FAREWELL'],
  FAREWELL: ['FAREWELL'],
};

/**
 * 构建 LLM System Prompt
 */
export function buildSystemPrompt(
  currentState: MainDialogState,
  slots: CollectedSlots
): string {
  // 构建知识库数据
  const kbSection = buildKnowledgeSection(slots);

  return `【角色设定】
你是互联网汽车营销中心的电话客服坐席。你的工作是通过电话外呼，了解客户的购车意向，收集品牌、车系、城市、购车时间、姓氏等信息（手机尾号不收集），确认客户口头授权后将客户信息授权给当地四S店提供精准报价。

说话风格要求：
- 自然口语化，像真人坐席，不要有机器人味
- 适当使用语气词（嗯、哈、哎、吧、呀）
- 回复简短，电话场景下不要太长（一般1-3句话）
- 统一称呼客户为"您"，不猜测客户性别，严禁使用"某先生/女士"（即使已知姓氏也不拼接性别称谓）
- 不要使用书面语、列表格式或markdown

【当前对话状态】
- 阶段：${currentState}（${stateGoals[currentState]}）
- 已收集信息：
  - 品牌：${slots.brand || '未收集'}
  - 车系：${slots.series || '未收集'}
  - 城市：${slots.city || '未收集'}
  - 购车时间：${slots.timing || '未收集'}
  - 客户姓氏：${slots.surname || '未收集'}

${kbSection}

【护栏规则】
1. 如果客户辱骂或攻击 → 回复"不好意思打扰了，祝您生活愉快，再见"，设置 next_state 为 FAREWELL
2. 如果客户表达强烈反感（"又是推销""别打了"）→ 回复"理解您的感受，不打扰了，有需要随时联系我们"，设置 next_state 为 FAREWELL
3. 如果客户偏离话题闲聊 → 简短回应后柔性拉回营销流程
4. 如果客户问具体价格/优惠/配置等超范围问题 → "具体价格我帮您对接当地四S店给您精准报价，先帮您确认下基本信息哈"
5. 如果客户输入不清晰 → 礼貌澄清追问
6. 绝对不要编造知识库中没有的车型信息
7. 不要一次性问多个问题，每次只推进一个信息点

【输出格式要求】
你必须严格返回以下 JSON 格式（不要包含任何其他内容，不要用 markdown 代码块包裹）：
{
  "intent": "意图名称（如 provide_brand / provide_model / provide_city / provide_time / provide_surname / ask_price / ask_recommend / filter_vehicle / abuse / dislike / off_topic / unclear / agree / disagree / greet / farewell / wait 等）",
  "entities": {"提取到的实体键值对，如 brand: "蔚来", series: "ES8", city: "重庆" 等"},
  "emotion": "客户情绪（neutral / interested / annoyed / angry）",
  "next_state": "下一个对话状态，必须是以下之一：GREETING / BRAND_INQUIRY / MODEL_INQUIRY / CITY_INQUIRY / TIMING_INQUIRY / CONTACT_COLLECTION / FAREWELL",
  "response": "你的回复内容（口语化、自然、简短）",
  "reasoning": "简要说明你的决策理由（一句话）"
}`;
}

/**
 * 根据当前上下文构建知识库注入部分
 */
function buildKnowledgeSection(slots: CollectedSlots): string {
  if (slots.brand) {
    const brandData = knowledgeBase.brands[resolveBrand(slots.brand) || ''] || knowledgeBase.brands[slots.brand];
    if (brandData) {
      const seriesList = Object.keys(brandData.series).join('、');
      return `【当前品牌知识库 - ${slots.brand}】
${seriesList}`;
    }
  }

  // 没有确定品牌时，只列品牌名（全量车系会撑爆 context）
  const brandOverview = Object.keys(knowledgeBase.brands).join('、');

  return `【可用品牌知识库概览】
${brandOverview}

（当客户确认品牌后，会注入该品牌的详细车系数据）`;
}

/**
 * 校验 LLM 返回的 next_state 是否合法
 */
export function validateNextState(
  currentState: MainDialogState,
  proposedState: string
): MainDialogState {
  const allowed = validTransitions[currentState];
  if (allowed && allowed.includes(proposedState as MainDialogState)) {
    return proposedState as MainDialogState;
  }
  // 不合法则保持当前状态
  return currentState;
}

/**
 * 解析 LLM 返回的 JSON
 */
export function parseLLMResponse(raw: string): {
  success: boolean;
  data?: {
    intent: string;
    entities: Record<string, string>;
    emotion: string;
    next_state: string;
    response: string;
    reasoning: string;
  };
  error?: string;
} {
  try {
    // 尝试清理可能的 markdown 代码块包裹
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);

    // 基本字段校验
    if (typeof parsed.response !== 'string' || typeof parsed.next_state !== 'string') {
      return { success: false, error: '缺少必要字段 response 或 next_state' };
    }

    return {
      success: true,
      data: {
        intent: parsed.intent || 'unknown',
        entities: parsed.entities || {},
        emotion: parsed.emotion || 'neutral',
        next_state: parsed.next_state,
        response: parsed.response,
        reasoning: parsed.reasoning || '',
      },
    };
  } catch {
    return { success: false, error: 'JSON 解析失败' };
  }
}

export { stateGoals, validTransitions };

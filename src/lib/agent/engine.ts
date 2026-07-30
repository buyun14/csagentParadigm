import type {
  AgentState,
  AgentDecision,
  ChatMessage,
  CollectedSlots,
  MainDialogState,
  ExceptionState,
  AgentMode,
  LLMChatResponse,
} from './types';
import { recognizeIntent } from './intent';
import { generateResponse } from './state-machine';
import { knowledgeBase } from './knowledge-base';

// 初始槽位状态
const initialSlots: CollectedSlots = {
  brand: null,
  series: null,
  model: null,
  city: null,
  timing: null,
  surname: null,
  phoneTail: null,
  vehicleType: null,
  powerType: null,
};

// Agent 开场白
const GREETING_MESSAGE = '喂，你好。这边是互联网汽车营销中心的，价格合适的话，您这边考虑过买车吗？给您做一个报价，您参考了解一下哈，您看最近有比较关注哪款车呀？';

/**
 * 创建初始 Agent 状态
 */
export function createInitialState(): AgentState {
  return {
    currentState: 'GREETING',
    exceptionState: 'NONE',
    collectedSlots: { ...initialSlots },
    messages: [
      {
        id: 'msg-0',
        role: 'agent',
        content: GREETING_MESSAGE,
        timestamp: Date.now(),
      },
    ],
    lastDecision: null,
    turnCount: 0,
    isProcessing: false,
    responseSource: 'rule',
    llmLatency: null,
    llmRawResponse: null,
  };
}

/**
 * 调用 LLM API
 */
async function callLLMAgent(
  customerInput: string,
  currentState: AgentState
): Promise<{
  success: boolean;
  data?: LLMChatResponse & { latency: number };
  error?: string;
}> {
  try {
    const recentMessages = currentState.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerInput,
        currentState: currentState.currentState,
        exceptionState: currentState.exceptionState,
        collectedSlots: currentState.collectedSlots,
        recentMessages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    // 检查是否有 error 字段（LLM 调用失败或格式异常）
    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * 从 LLM 返回的 entities 更新槽位
 */
function updateSlotsFromEntities(
  currentSlots: CollectedSlots,
  entities: Record<string, string>
): CollectedSlots {
  const newSlots = { ...currentSlots };
  if (entities.brand) newSlots.brand = entities.brand;
  if (entities.series) newSlots.series = entities.series;
  if (entities.city) newSlots.city = entities.city;
  if (entities.timing) newSlots.timing = entities.timing;
  if (entities.surname) newSlots.surname = entities.surname;
  if (entities.phoneTail) newSlots.phoneTail = entities.phoneTail;
  if (entities.vehicleType) newSlots.vehicleType = entities.vehicleType;
  if (entities.powerType) newSlots.powerType = entities.powerType;
  return newSlots;
}

/**
 * 将 LLM emotion 映射为内部 emotion
 */
function mapEmotion(emotion: string): 'neutral' | 'positive' | 'negative' | 'angry' {
  switch (emotion) {
    case 'interested': return 'positive';
    case 'annoyed': return 'negative';
    case 'angry': return 'angry';
    default: return 'neutral';
  }
}

/**
 * 将 LLM emotion 映射为异常状态
 */
function mapEmotionToException(emotion: string, intent: string): ExceptionState {
  if (intent === 'abuse' || emotion === 'angry') return 'ABUSE';
  if (intent === 'dislike') return 'ABUSE';
  if (intent === 'off_topic') return 'OFF_TRACK';
  if (intent === 'unclear') return 'UNCLEAR';
  if (intent === 'ask_price' || intent === 'out_of_scope') return 'OUT_OF_SCOPE';
  return 'NONE';
}

/**
 * 处理客户输入 - LLM 模式
 */
async function processWithLLM(
  currentState: AgentState,
  customerInput: string
): Promise<{
  newState: AgentState;
  customerMessage: ChatMessage;
  agentMessage: ChatMessage;
  rawResponse: string | null;
  latency: number | null;
}> {
  const customerMessage: ChatMessage = {
    id: `msg-c-${Date.now()}`,
    role: 'customer',
    content: customerInput,
    timestamp: Date.now(),
  };

  const llmResult = await callLLMAgent(customerInput, currentState);

  // LLM 调用失败 → 降级到规则引擎
  if (!llmResult.success || !llmResult.data) {
    const ruleResult = processWithRule(currentState, customerInput);
    return {
      ...ruleResult,
      newState: {
        ...ruleResult.newState,
        responseSource: 'fallback',
        llmLatency: null,
        llmRawResponse: null,
      },
      rawResponse: null,
      latency: null,
    };
  }

  const { data } = llmResult;

  // 更新槽位
  const updatedSlots = updateSlotsFromEntities(currentState.collectedSlots, data.entities);

  // 构建决策路径
  const decision: AgentDecision = {
    perception: {
      intent: data.intent as AgentDecision['perception']['intent'],
      entities: data.entities,
      emotion: mapEmotion(data.emotion),
    },
    memory: {
      currentState: currentState.currentState,
      exceptionState: currentState.exceptionState,
      collectedSlots: { ...currentState.collectedSlots },
    },
    planning: {
      reasoning: data.reasoning || '[LLM] ' + data.intent,
      nextState: data.next_state as MainDialogState,
      action: 'LLM 生成回复',
    },
    output: data.response,
  };

  const agentMessage: ChatMessage = {
    id: `msg-a-${Date.now()}`,
    role: 'agent',
    content: data.response,
    timestamp: Date.now(),
  };

  const newState: AgentState = {
    currentState: data.next_state as MainDialogState,
    exceptionState: mapEmotionToException(data.emotion, data.intent),
    collectedSlots: updatedSlots,
    messages: [...currentState.messages, customerMessage, agentMessage],
    lastDecision: decision,
    turnCount: currentState.turnCount + 1,
    isProcessing: false,
    responseSource: 'llm',
    llmLatency: data.latency,
    llmRawResponse: JSON.stringify(data, null, 2),
  };

  return {
    newState,
    customerMessage,
    agentMessage,
    rawResponse: JSON.stringify(data, null, 2),
    latency: data.latency,
  };
}

/**
 * 处理客户输入 - 规则引擎模式
 */
function processWithRule(
  currentState: AgentState,
  customerInput: string
): { newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage } {
  const customerMessage: ChatMessage = {
    id: `msg-c-${Date.now()}`,
    role: 'customer',
    content: customerInput,
    timestamp: Date.now(),
  };

  // 1. 感知：意图识别 + 实体抽取
  const intentResult = recognizeIntent(customerInput);

  // 2. 构建对话历史
  const dialogHistory = currentState.messages
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  // 3. 规划 + 行动：状态机生成回复
  const response = generateResponse(
    currentState.currentState,
    currentState.exceptionState,
    currentState.collectedSlots,
    intentResult,
    dialogHistory
  );

  // 4. 构建决策路径
  const decision: AgentDecision = {
    perception: {
      intent: intentResult.intent,
      entities: intentResult.entities,
      emotion: intentResult.intent === 'abuse' ? 'angry'
        : intentResult.intent === 'dislike' ? 'negative'
        : intentResult.intent === 'agree' ? 'positive'
        : 'neutral',
    },
    memory: {
      currentState: currentState.currentState,
      exceptionState: currentState.exceptionState,
      collectedSlots: { ...currentState.collectedSlots },
    },
    planning: {
      reasoning: response.reasoning,
      nextState: response.nextState,
      action: response.action,
    },
    output: response.reply,
  };

  const agentMessage: ChatMessage = {
    id: `msg-a-${Date.now()}`,
    role: 'agent',
    content: response.reply,
    timestamp: Date.now(),
  };

  const newState: AgentState = {
    currentState: response.nextState,
    exceptionState: response.nextException,
    collectedSlots: response.updatedSlots,
    messages: [...currentState.messages, customerMessage, agentMessage],
    lastDecision: decision,
    turnCount: currentState.turnCount + 1,
    isProcessing: false,
    responseSource: 'rule',
    llmLatency: null,
    llmRawResponse: null,
  };

  return { newState, customerMessage, agentMessage };
}

/**
 * 处理客户输入（统一入口）
 */
export async function processCustomerInput(
  currentState: AgentState,
  customerInput: string,
  mode: AgentMode = 'rule'
): Promise<{ newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage }> {
  if (mode === 'llm') {
    const result = await processWithLLM(currentState, customerInput);
    return {
      newState: result.newState,
      customerMessage: result.customerMessage,
      agentMessage: result.agentMessage,
    };
  }
  return processWithRule(currentState, customerInput);
}

// 导出知识库供外部使用
export { knowledgeBase };

// 导出状态标签映射
export const stateLabels: Record<MainDialogState, string> = {
  GREETING: '开场问候',
  BRAND_INQUIRY: '确认品牌',
  MODEL_INQUIRY: '确认车型',
  CITY_INQUIRY: '确认城市',
  TIMING_INQUIRY: '确认时间',
  CONTACT_COLLECTION: '收集联系方式',
  FAREWELL: '结束语',
};

export const exceptionLabels: Record<ExceptionState, string> = {
  NONE: '无',
  OFF_TRACK: '偏离话题',
  ABUSE: '辱骂/反感',
  OUT_OF_SCOPE: '超范围问题',
  UNCLEAR: '输入不清',
};

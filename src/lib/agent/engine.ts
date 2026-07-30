'use client';

import type {
  AgentState,
  AgentDecision,
  ChatMessage,
  CollectedSlots,
  MainDialogState,
  ExceptionState,
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
  };
}

/**
 * 处理客户输入，返回新的 Agent 状态
 */
export function processCustomerInput(
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

  // 2. 构建对话历史（最近10轮）
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

  // 4. 构建决策路径（用于调试面板）
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
  };

  return { newState, customerMessage, agentMessage };
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

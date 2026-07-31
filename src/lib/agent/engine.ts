import type {
  AgentState,
  AgentDecision,
  ChatMessage,
  CollectedSlots,
  MainDialogState,
  ExceptionState,
  AgentMode,
  LatencyMetrics,
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

/** 流式回调接口 */
export interface StreamCallbacks {
  /** 收到元数据 */
  onMetadata?: (data: {
    intent: string;
    entities: Record<string, string>;
    emotion: string;
    next_state: string;
    reasoning: string;
    latencyMetrics: LatencyMetrics;
    rawResponse: string;
  }) => void;
  /** 收到文本块 */
  onChunk?: (content: string) => void;
  /** 流式完成 */
  onComplete?: (totalLatency: number) => void;
  /** 发生错误（触发降级） */
  onError?: (error: string) => void;
}

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
    latencyMetrics: null,
    llmRawResponse: null,
    promptLogs: [],
    slowChannelStatus: 'idle',
    slowChannelResult: null,
  };
}

/**
 * 流式调用 LLM API（SSE 消费）
 */
async function streamLLMAgent(
  customerInput: string,
  currentState: AgentState,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const recentMessages = currentState.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('/api/agent/fast', {
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

    if (!response.body) {
      callbacks.onError?.('响应体为空');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 事件
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留未完成的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr) as Record<string, unknown>;

            switch (event.type) {
              case 'metadata':
                callbacks.onMetadata?.({
                  intent: event.intent as string,
                  entities: event.entities as Record<string, string>,
                  emotion: event.emotion as string,
                  next_state: event.next_state as string,
                  reasoning: event.reasoning as string,
                  latencyMetrics: event.latencyMetrics as LatencyMetrics,
                  rawResponse: event.rawResponse as string,
                });
                break;
              case 'chunk':
                callbacks.onChunk?.(event.content as string);
                break;
              case 'done':
                callbacks.onComplete?.((event.latencyMetrics as LatencyMetrics | undefined)?.total ?? 0);
                break;
              case 'error':
                callbacks.onError?.(event.error as string);
                return;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    callbacks.onError?.(message);
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
 * 状态标签映射（用于调试面板）
 */
export const stateLabels: Record<MainDialogState, string> = {
  GREETING: '开场问候',
  BRAND_INQUIRY: '品牌确认',
  MODEL_INQUIRY: '车型确认',
  CITY_INQUIRY: '城市确认',
  TIMING_INQUIRY: '时间确认',
  CONTACT_COLLECTION: '联系方式',
  FAREWELL: '结束告别',
};

export const exceptionLabels: Record<ExceptionState, string> = {
  NONE: '正常',
  OFF_TRACK: '偏离话题',
  ABUSE: '辱骂攻击',
  OUT_OF_SCOPE: '超范围',
  UNCLEAR: '输入不清',
};

/**
 * 处理客户输入 - LLM 流式模式
 * 返回客户消息和初始 agent 消息（流式内容通过回调更新）
 */
export function processWithLLMStreaming(
  currentState: AgentState,
  customerInput: string,
  callbacks: StreamCallbacks
): {
  customerMessage: ChatMessage;
  agentMessageId: string;
  sendTime: number;
} {
  const sendTime = Date.now();
  const customerMessage: ChatMessage = {
    id: `msg-c-${sendTime}`,
    role: 'customer',
    content: customerInput,
    timestamp: sendTime,
  };

  const agentMessageId = `msg-a-${sendTime}`;

  // 异步启动流式调用
  streamLLMAgent(customerInput, currentState, {
    onMetadata: callbacks.onMetadata,
    onChunk: callbacks.onChunk,
    onComplete: callbacks.onComplete,
    onError: () => {
      // LLM 失败 → 降级到规则引擎
      callbacks.onError?.('LLM 调用失败，已降级到规则引擎');
    },
  });

  return { customerMessage, agentMessageId, sendTime };
}

/**
 * 处理客户输入 - 规则引擎模式
 */
function processWithRule(
  currentState: AgentState,
  customerInput: string
): { newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage } {
  const sendTime = Date.now();
  const customerMessage: ChatMessage = {
    id: `msg-c-${sendTime}`,
    role: 'customer',
    content: customerInput,
    timestamp: sendTime,
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

  const ruleStartTime = Date.now();

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

  const ruleLatency = Date.now() - ruleStartTime;

  const agentMessage: ChatMessage = {
    id: `msg-a-${sendTime}`,
    role: 'agent',
    content: response.reply,
    timestamp: Date.now(),
    latencyMs: ruleLatency,
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
    latencyMetrics: {
      promptBuild: 0,
      llmCall: 0,
      parse: 0,
      firstToken: ruleLatency,
      generation: ruleLatency,
      total: ruleLatency,
    },
    llmRawResponse: null,
    promptLogs: currentState.promptLogs || [],
    slowChannelStatus: 'idle',
    slowChannelResult: null,
  };

  return { newState, customerMessage, agentMessage };
}

/**
 * 处理客户输入（统一入口 - 规则引擎模式，非流式）
 */
export function processCustomerInput(
  currentState: AgentState,
  customerInput: string,
  mode: AgentMode
): { newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage } {
  if (mode === 'llm') {
    // LLM 模式不应走这个同步路径，应该用 processWithLLMStreaming
    // 这里作为兜底，降级到规则引擎
    const ruleResult = processWithRule(currentState, customerInput);
    return {
      ...ruleResult,
      newState: {
        ...ruleResult.newState,
        responseSource: 'fallback',
      },
    };
  }
  return processWithRule(currentState, customerInput);
}

/**
 * 根据流式回调构建最终的 AgentState
 */
export function buildFinalStateFromStream(
  currentState: AgentState,
  customerMessage: ChatMessage,
  agentMessageContent: string,
  metadata: {
    intent: string;
    entities: Record<string, string>;
    emotion: string;
    next_state: string;
    reasoning: string;
    latencyMetrics: LatencyMetrics;
    rawResponse: string;
  },
  totalLatency: number
): AgentState {
  const updatedSlots = updateSlotsFromEntities(currentState.collectedSlots, metadata.entities);

  const decision: AgentDecision = {
    perception: {
      intent: metadata.intent as AgentDecision['perception']['intent'],
      entities: metadata.entities,
      emotion: mapEmotion(metadata.emotion),
    },
    memory: {
      currentState: currentState.currentState,
      exceptionState: currentState.exceptionState,
      collectedSlots: { ...currentState.collectedSlots },
    },
    planning: {
      reasoning: metadata.reasoning || '[LLM] ' + metadata.intent,
      nextState: metadata.next_state as MainDialogState,
      action: 'LLM 生成回复',
    },
    output: agentMessageContent,
  };

  // 合并最终的 total latency
  const finalLatencyMetrics: LatencyMetrics = {
    ...metadata.latencyMetrics,
    total: totalLatency || metadata.latencyMetrics.total,
  };

  const agentMessage: ChatMessage = {
    id: `msg-a-${customerMessage.timestamp}`,
    role: 'agent',
    content: agentMessageContent,
    timestamp: Date.now(),
    latencyMs: finalLatencyMetrics.total,
  };

  return {
    currentState: metadata.next_state as MainDialogState,
    exceptionState: mapEmotionToException(metadata.emotion, metadata.intent),
    collectedSlots: updatedSlots,
    messages: [...currentState.messages, customerMessage, agentMessage],
    lastDecision: decision,
    turnCount: currentState.turnCount + 1,
    isProcessing: false,
    responseSource: 'llm',
    latencyMetrics: finalLatencyMetrics,
    llmRawResponse: metadata.rawResponse,
    promptLogs: currentState.promptLogs || [],
    slowChannelStatus: 'idle',
    slowChannelResult: null,
  };
}

/**
 * 当 LLM 流式失败时，降级到规则引擎
 */
export function fallbackToRuleEngine(
  currentState: AgentState,
  customerInput: string
): { newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage } {
  const ruleResult = processWithRule(currentState, customerInput);
  return {
    ...ruleResult,
    newState: {
      ...ruleResult.newState,
      responseSource: 'fallback',
      latencyMetrics: null,
      llmRawResponse: null,
      promptLogs: currentState.promptLogs || [],
      slowChannelStatus: 'idle',
      slowChannelResult: null,
    },
  };
}

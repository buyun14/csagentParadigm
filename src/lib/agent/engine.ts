import type {
  AgentState,
  AgentDecision,
  ChatMessage,
  CollectedSlots,
  MainDialogState,
  ExceptionState,
  AgentMode,
  LatencyMetrics,
  LLMModelConfig,
  DualChannelState,
  ResponseSource,
} from './types';
import { recognizeIntent } from './intent';
import { generateResponse } from './state-machine';
import { checkCache } from './cache';
import { estimateTokens } from './prompt-slim';

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

// 默认模型参数
const DEFAULT_MODEL_CONFIG: LLMModelConfig = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 150,
};

/** 快通道流式回调接口 */
export interface FastStreamCallbacks {
  onMetadata?: (data: { tokenEstimate: number }) => void;
  onFirstToken?: (latency: number) => void;
  onChunk?: (content: string) => void;
  onComplete?: (data: { fullContent: string; latency: number }) => void;
  onError?: (error: string) => void;
}

/** 双通道回调接口 */
export interface DualChannelCallbacks {
  // 快通道回调
  fast: FastStreamCallbacks;
  // 慢通道回调（异步更新）
  slow: {
    onResult?: (data: { emotion: string; entities: Record<string, string>; reasoning: string; guardrail_check: string }) => void;
    onError?: (error: string) => void;
  };
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
    dualChannel: null,
    currentModelConfig: null,
    promptTokenEstimate: null,
  };
}

/**
 * 获取默认模型参数
 */
export function getDefaultModelConfig(): LLMModelConfig {
  return { ...DEFAULT_MODEL_CONFIG };
}

/**
 * 从 localStorage 加载模型参数
 */
export function loadModelConfig(): LLMModelConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_MODEL_CONFIG };
  try {
    const saved = localStorage.getItem('agent_model_config');
    if (saved) {
      return { ...DEFAULT_MODEL_CONFIG, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_MODEL_CONFIG };
}

/**
 * 保存模型参数到 localStorage
 */
export function saveModelConfig(config: LLMModelConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('agent_model_config', JSON.stringify(config));
  } catch {
    // ignore
  }
}

/**
 * 快通道流式调用（SSE）
 */
async function streamFastChannel(
  customerInput: string,
  currentState: AgentState,
  modelConfig: LLMModelConfig,
  callbacks: FastStreamCallbacks
): Promise<void> {
  try {
    const recentHistory = currentState.messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('/api/agent/fast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: customerInput,
        current_state: currentState.currentState,
        collected_slots: currentState.collectedSlots,
        recent_history: recentHistory,
        model_params: modelConfig,
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
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr) as Record<string, unknown>;

            switch (event.type) {
              case 'metadata':
                callbacks.onMetadata?.({ tokenEstimate: event.tokenEstimate as number });
                break;
              case 'first_token':
                callbacks.onFirstToken?.(event.latency as number);
                break;
              case 'chunk':
                callbacks.onChunk?.(event.content as string);
                break;
              case 'done':
                callbacks.onComplete?.({
                  fullContent: event.fullContent as string,
                  latency: event.latency as number,
                });
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
 * 慢通道调用（非流式，异步）
 */
async function callSlowChannel(
  customerInput: string,
  currentState: AgentState,
  modelConfig: LLMModelConfig
): Promise<{ success: boolean; data?: { emotion: string; entities: Record<string, string>; reasoning: string; guardrail_check: string }; error?: string }> {
  try {
    const fullHistory = currentState.messages
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    const response = await fetch('/api/agent/slow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: customerInput,
        current_state: currentState.currentState,
        collected_slots: currentState.collectedSlots,
        full_history: fullHistory,
        model_params: modelConfig,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json() as { success: boolean; data?: { emotion: string; entities: Record<string, string>; reasoning: string; guardrail_check: string }; error?: string };
    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
 * 状态标签映射
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
 * 解析快通道返回的 JSON（提取 intent 和 next_state）
 */
function parseFastChannelResponse(content: string): { intent: string; next_state: string; response: string } | null {
  try {
    let cleaned = content.trim();
    // 提取 JSON 部分（可能混有文本）
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.response === 'string' && typeof parsed.next_state === 'string') {
      return {
        intent: parsed.intent || 'unknown',
        next_state: parsed.next_state,
        response: parsed.response,
      };
    }
  } catch {
    // 尝试从纯文本中提取回复
  }
  // 如果无法解析 JSON，把整个内容当作回复
  if (content.trim().length > 0) {
    return {
      intent: 'unknown',
      next_state: '',
      response: content.trim(),
    };
  }
  return null;
}

/**
 * 处理客户输入 - 双通道模式（快通道流式 + 慢通道异步）
 */
export function processWithDualChannel(
  currentState: AgentState,
  customerInput: string,
  modelConfig: LLMModelConfig,
  callbacks: DualChannelCallbacks
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

  // 启动快通道（流式）
  streamFastChannel(customerInput, currentState, modelConfig, {
    onMetadata: callbacks.fast.onMetadata,
    onFirstToken: callbacks.fast.onFirstToken,
    onChunk: callbacks.fast.onChunk,
    onComplete: callbacks.fast.onComplete,
    onError: () => {
      callbacks.fast.onError?.('快通道调用失败，已降级到规则引擎');
    },
  });

  // 启动慢通道（异步，不阻塞）
  callSlowChannel(customerInput, currentState, modelConfig).then(result => {
    if (result.success && result.data) {
      callbacks.slow.onResult?.(result.data);
    } else {
      callbacks.slow.onError?.(result.error || '慢通道调用失败');
    }
  });

  return { customerMessage, agentMessageId, sendTime };
}

/**
 * 处理客户输入 - 缓存检查
 */
export function checkCacheHit(
  currentState: MainDialogState,
  customerInput: string
): { hit: boolean; response?: string; intent?: string; next_state?: string } {
  const cached = checkCache(currentState, customerInput);
  if (cached) {
    return {
      hit: true,
      response: cached.response,
      intent: cached.intent,
      next_state: cached.next_state || currentState,
    };
  }
  return { hit: false };
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

  const intentResult = recognizeIntent(customerInput);
  const dialogHistory = currentState.messages
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const response = generateResponse(
    currentState.currentState,
    currentState.exceptionState,
    currentState.collectedSlots,
    intentResult,
    dialogHistory
  );

  const ruleStartTime = Date.now();

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
    dualChannel: null,
    currentModelConfig: null,
    promptTokenEstimate: null,
  };

  return { newState, customerMessage, agentMessage };
}

/**
 * 处理客户输入（统一入口）
 */
export function processCustomerInput(
  currentState: AgentState,
  customerInput: string,
  mode: AgentMode
): { newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage } {
  // 规则引擎模式
  if (mode === 'rule') {
    return processWithRule(currentState, customerInput);
  }

  // LLM 单通道模式（降级到规则引擎，因为实际应该用流式）
  if (mode === 'llm') {
    const ruleResult = processWithRule(currentState, customerInput);
    return {
      ...ruleResult,
      newState: {
        ...ruleResult.newState,
        responseSource: 'fallback',
      },
    };
  }

  // 双通道模式（降级到规则引擎，因为实际应该用 processWithDualChannel）
  const ruleResult = processWithRule(currentState, customerInput);
  return {
    ...ruleResult,
    newState: {
      ...ruleResult.newState,
      responseSource: 'fallback',
    },
  };
}

/**
 * 根据快通道结果构建最终的 AgentState
 */
export function buildFinalStateFromFastChannel(
  currentState: AgentState,
  customerMessage: ChatMessage,
  agentMessageContent: string,
  parsedResponse: { intent: string; next_state: string; response: string },
  latencyData: { firstToken: number; total: number; tokenEstimate: number },
  modelConfig: LLMModelConfig
): AgentState {
  const nextState = (parsedResponse.next_state || currentState.currentState) as MainDialogState;

  const decision: AgentDecision = {
    perception: {
      intent: parsedResponse.intent as AgentDecision['perception']['intent'],
      entities: {},
      emotion: 'neutral',
    },
    memory: {
      currentState: currentState.currentState,
      exceptionState: currentState.exceptionState,
      collectedSlots: { ...currentState.collectedSlots },
    },
    planning: {
      reasoning: '[快通道] ' + parsedResponse.intent,
      nextState,
      action: 'LLM 快通道生成',
    },
    output: agentMessageContent,
  };

  const agentMessage: ChatMessage = {
    id: `msg-a-${customerMessage.timestamp}`,
    role: 'agent',
    content: agentMessageContent,
    timestamp: Date.now(),
    latencyMs: latencyData.total,
  };

  return {
    currentState: nextState,
    exceptionState: mapEmotionToException('neutral', parsedResponse.intent),
    collectedSlots: currentState.collectedSlots,
    messages: [...currentState.messages, customerMessage, agentMessage],
    lastDecision: decision,
    turnCount: currentState.turnCount + 1,
    isProcessing: false,
    responseSource: 'fast' as ResponseSource,
    latencyMetrics: {
      promptBuild: 0,
      llmCall: latencyData.total,
      parse: 0,
      firstToken: latencyData.firstToken,
      generation: latencyData.total,
      total: latencyData.total,
    },
    llmRawResponse: agentMessageContent,
    dualChannel: {
      fastStatus: 'done',
      slowStatus: 'pending',
      fastLatency: { firstToken: latencyData.firstToken, total: latencyData.total },
      slowLatency: null,
    },
    currentModelConfig: modelConfig,
    promptTokenEstimate: latencyData.tokenEstimate,
  };
}

/**
 * 用慢通道结果更新 AgentState（异步更新调试面板）
 */
export function updateStateWithSlowChannel(
  currentState: AgentState,
  slowResult: { emotion: string; entities: Record<string, string>; reasoning: string; guardrail_check: string },
  slowLatency: number
): AgentState {
  // 更新槽位（如果慢通道提取到新实体）
  const updatedSlots = updateSlotsFromEntities(currentState.collectedSlots, slowResult.entities);

  // 更新决策路径
  const updatedDecision = currentState.lastDecision
    ? {
        ...currentState.lastDecision,
        perception: {
          ...currentState.lastDecision.perception,
          emotion: mapEmotion(slowResult.emotion),
          entities: { ...currentState.lastDecision.perception.entities, ...slowResult.entities },
        },
        planning: {
          ...currentState.lastDecision.planning,
          reasoning: slowResult.reasoning || currentState.lastDecision.planning.reasoning,
        },
      }
    : null;

  // 更新双通道状态
  const updatedDualChannel: DualChannelState = {
    fastStatus: currentState.dualChannel?.fastStatus || 'done',
    slowStatus: 'done',
    fastLatency: currentState.dualChannel?.fastLatency || null,
    slowLatency,
  };

  return {
    ...currentState,
    collectedSlots: updatedSlots,
    lastDecision: updatedDecision,
    exceptionState: mapEmotionToException(slowResult.emotion, updatedDecision?.perception.intent || ''),
    dualChannel: updatedDualChannel,
  };
}

/**
 * 处理缓存命中的情况
 */
export function processCacheHit(
  currentState: AgentState,
  customerInput: string,
  cacheResult: { response: string; intent: string; next_state: string }
): { newState: AgentState; customerMessage: ChatMessage; agentMessage: ChatMessage } {
  const sendTime = Date.now();
  const customerMessage: ChatMessage = {
    id: `msg-c-${sendTime}`,
    role: 'customer',
    content: customerInput,
    timestamp: sendTime,
  };

  const agentMessage: ChatMessage = {
    id: `msg-a-${sendTime}`,
    role: 'agent',
    content: cacheResult.response,
    timestamp: Date.now(),
    latencyMs: 0,
  };

  const nextState = (cacheResult.next_state || currentState.currentState) as MainDialogState;

  const decision: AgentDecision = {
    perception: {
      intent: cacheResult.intent as AgentDecision['perception']['intent'],
      entities: {},
      emotion: cacheResult.intent === 'abuse' ? 'angry' : 'neutral',
    },
    memory: {
      currentState: currentState.currentState,
      exceptionState: currentState.exceptionState,
      collectedSlots: { ...currentState.collectedSlots },
    },
    planning: {
      reasoning: '[缓存命中] ' + cacheResult.intent,
      nextState,
      action: '缓存直接返回',
    },
    output: cacheResult.response,
  };

  const newState: AgentState = {
    currentState: nextState,
    exceptionState: mapEmotionToException('neutral', cacheResult.intent),
    collectedSlots: currentState.collectedSlots,
    messages: [...currentState.messages, customerMessage, agentMessage],
    lastDecision: decision,
    turnCount: currentState.turnCount + 1,
    isProcessing: false,
    responseSource: 'cache',
    latencyMetrics: {
      promptBuild: 0,
      llmCall: 0,
      parse: 0,
      firstToken: 0,
      generation: 0,
      total: 0,
    },
    llmRawResponse: null,
    dualChannel: null,
    currentModelConfig: null,
    promptTokenEstimate: 0,
  };

  return { newState, customerMessage, agentMessage };
}

/**
 * 当快通道失败时，降级到规则引擎
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
      dualChannel: null,
    },
  };
}

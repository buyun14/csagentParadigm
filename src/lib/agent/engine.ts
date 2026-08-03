import type {
  AgentState,
  AgentDecision,
  ChatMessage,
  CollectedSlots,
  MainDialogState,
  ExceptionState,
  AgentMode,
  LLMModelConfig,
  DualChannelState,
  ResponseSource,
} from './types';
import { recognizeIntent } from './intent';
import { generateResponse } from './state-machine';
import { checkCache } from './cache';
import { buildConversationSummary } from './summary';

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

// 合法的对话状态集合（用于校验 LLM 返回的 next_state）
const VALID_DIALOG_STATES: MainDialogState[] = [
  'GREETING',
  'BRAND_INQUIRY',
  'MODEL_INQUIRY',
  'CITY_INQUIRY',
  'TIMING_INQUIRY',
  'CONTACT_COLLECTION',
  'FAREWELL',
];

/**
 * 规范化 LLM 返回的 next_state，非法值回退到当前状态，
 * 避免状态机跳到不存在的状态导致调试面板显示异常
 */
function normalizeNextState(raw: string | undefined, fallback: MainDialogState): MainDialogState {
  const trimmed = (raw || '').trim();
  if ((VALID_DIALOG_STATES as string[]).includes(trimmed)) {
    return trimmed as MainDialogState;
  }
  return fallback;
}

// 慢通道 LLM 返回的实体键为中文（品牌/车系/…），映射为内部英文键
const ENTITY_KEY_ALIASES: Record<string, keyof CollectedSlots> = {
  品牌: 'brand',
  车系: 'series',
  城市: 'city',
  时间: 'timing',
  姓氏: 'surname',
  手机尾号: 'phoneTail',
  车型: 'model',
  动力类型: 'powerType',
};

/**
 * 将慢通道返回的实体键归一化为内部英文键（兼容中英文混合返回），
 * 保证 updateSlotsFromEntities 能正确回填槽位。
 */
function normalizeEntityKeys(entities: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(entities || {})) {
    const mapped = ENTITY_KEY_ALIASES[key] || key;
    if (value && mapped) normalized[mapped] = value;
  }
  return normalized;
}

// 主流程状态推进顺序（用于校验 LLM 返回的状态迁移）
const STATE_ORDER: Record<MainDialogState, number> = {
  GREETING: 0,
  BRAND_INQUIRY: 1,
  MODEL_INQUIRY: 2,
  CITY_INQUIRY: 3,
  TIMING_INQUIRY: 4,
  CONTACT_COLLECTION: 5,
  FAREWELL: 6,
};

// 各 intent 至少应推进到的状态（防止 LLM 状态跳回/停滞导致流程倒退）
const INTENT_MIN_STATE: Partial<Record<string, MainDialogState>> = {
  confirm_brand: 'MODEL_INQUIRY',
  confirm_model: 'CITY_INQUIRY',
  confirm_city: 'TIMING_INQUIRY',
  confirm_time: 'CONTACT_COLLECTION',
  // confirm_surname 只确认姓氏，联系方式（手机尾号）可能尚未收集，不直接闭环
  confirm_surname: 'CONTACT_COLLECTION',
  abuse: 'FAREWELL',
  dislike: 'FAREWELL',
  farewell: 'FAREWELL',
};

/**
 * 业务状态迁移校验（快通道 LLM 的 next_state 只是参考值）：
 * 1. 姓氏 + 手机尾号均已收集 → 信息闭环，强制 FAREWELL；
 * 2. intent 驱动的推进下限（confirm_* 至少推进到对应下一状态）；
 * 3. 不允许倒退到早于当前状态的位置；
 * 4. FAREWELL 为终态，不可回退（当前已是 FAREWELL 时保持）。
 * 取所有候选序位的最大值，保证流程只进不退。
 */
function enforceStateTransition(
  current: MainDialogState,
  rawNext: MainDialogState,
  intent: string,
  slots: CollectedSlots
): MainDialogState {
  const intentMin = INTENT_MIN_STATE[intent];
  const infoComplete = Boolean(slots.surname && slots.phoneTail);
  const candidates = [
    STATE_ORDER[current],
    STATE_ORDER[rawNext],
    intentMin !== undefined ? STATE_ORDER[intentMin] : -1,
    infoComplete ? STATE_ORDER['FAREWELL'] : -1,
  ];
  const best = Math.max(...candidates);
  return (Object.keys(STATE_ORDER) as MainDialogState[]).find(
    (s) => STATE_ORDER[s] === best
  )!;
}

/** 快通道流式回调接口 */
export interface FastStreamCallbacks {
  onMetadata?: (data: { tokenEstimate: number }) => void;
  onFirstToken?: (latency: number) => void;
  onChunk?: (content: string) => void;
  onComplete?: (data: { fullContent: string; latency: number }) => void;
  onError?: (error: string) => void;
}

/** 慢通道结果 */
export interface SlowChannelResult {
  emotion: string;
  entities: Record<string, string>;
  reasoning: string;
  guardrail_check: string;
  latency?: number;
}

/** 双通道回调接口 */
export interface DualChannelCallbacks {
  // 快通道回调
  fast: FastStreamCallbacks;
  // 慢通道回调（异步更新）
  slow: {
    onResult?: (data: SlowChannelResult) => void;
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
 * @param controller 由调用方创建的外部 AbortController，供 UI 层“停止生成”使用
 */
async function streamFastChannel(
  customerInput: string,
  currentState: AgentState,
  modelConfig: LLMModelConfig,
  callbacks: FastStreamCallbacks,
  controller: AbortController
): Promise<void> {
  try {
    const recentHistory = currentState.messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    // 超阈值时生成早期对话摘要，保证长对话上下文可延续（老系统缺失的“历史上下文”能力）
    const summary = buildConversationSummary(currentState.messages, currentState.collectedSlots).text;

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
        summary,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 检查是否为 SSE 响应（若非 SSE，说明路由/LLM 出错，需触发降级而非静默结束）
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      const errorText = await response.text().catch(() => '');
      callbacks.onError?.(`快通道返回非 SSE 响应: ${errorText.slice(0, 200)}`);
      return;
    }

    if (!response.body) {
      callbacks.onError?.('响应体为空');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawEvent = false;
    // 流式读取 idle 超时：两次数据块之间超过阈值判定为连接挂起，避免读循环永久挂起
    const IDLE_TIMEOUT_MS = 3000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            idleTimer = setTimeout(() => {
              reject(new Error(`流式读取 idle 超时（${IDLE_TIMEOUT_MS}ms 无数据）`));
            }, IDLE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      }

      const { done, value } = chunk;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          sawEvent = true;
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

    // 读完了整个流但没有任何有效 SSE 事件（如空响应），触发降级
    if (!sawEvent) {
      callbacks.onError?.('快通道未返回有效数据');
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
  modelConfig: LLMModelConfig,
  fastResponse: string
): Promise<{ success: boolean; data?: { emotion: string; entities: Record<string, string>; reasoning: string; guardrail_check: string }; latency?: number; error?: string }> {
  try {
    const fullHistory = currentState.messages
      .map((m) => ({ role: m.role, content: m.content }));

    const summary = buildConversationSummary(currentState.messages, currentState.collectedSlots).text;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    const response = await fetch('/api/agent/slow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: customerInput,
        current_state: currentState.currentState,
        collected_slots: currentState.collectedSlots,
        fast_response: fastResponse,
        full_history: fullHistory,
        model_params: modelConfig,
        summary,
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
  if (entities.model) newSlots.model = entities.model;
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
 * 护栏复核评估：解析慢通道 guardrail_check 文本，判定是否需要修正话术/状态。
 * 慢通道从"分析器"升级为"复核纠错器"：检测到辱骂/反感等严重护栏命中时，
 * 即使快通道已回复，也强制改为护栏退出话术并进入 FAREWELL。
 */
function evaluateGuardrail(
  guardrailCheck: string
): { exception: ExceptionState; forceFarewell: boolean } {
  const g = (guardrailCheck || '').toLowerCase();
  if (!g) return { exception: 'NONE', forceFarewell: false };
  if (/辱骂|攻击|abuse/.test(g)) return { exception: 'ABUSE', forceFarewell: true };
  if (/反感|骚扰|别打|dislike/.test(g)) return { exception: 'ABUSE', forceFarewell: true };
  if (/偏离|off.?track/.test(g)) return { exception: 'OFF_TRACK', forceFarewell: false };
  if (/超范围|out.of.scope/.test(g)) return { exception: 'OUT_OF_SCOPE', forceFarewell: false };
  if (/不清|unclear/.test(g)) return { exception: 'UNCLEAR', forceFarewell: false };
  return { exception: 'NONE', forceFarewell: false };
}

/** 护栏退出话术（与 cache.ts ANY:abuse/dislike 保持一致） */
const GUARDRAIL_EXIT_REPLY =
  '不好意思打扰了，祝您生活愉快，再见。';

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
  /** 中止当前快通道流（用于“停止生成”交互） */
  abort: () => void;
} {
  const sendTime = Date.now();
  const customerMessage: ChatMessage = {
    id: `msg-c-${sendTime}`,
    role: 'customer',
    content: customerInput,
    timestamp: sendTime,
  };

  const agentMessageId = `msg-a-${sendTime}`;

  // 外部可中止的 AbortController：快通道流式请求由其控制，UI 层“停止生成”时调用 abort
  const controller = new AbortController();

  // 启动慢通道：等快通道产出回复后再启动，携带快通道回复供护栏复核
  const startSlowChannel = (fastResponse: string) => {
    callSlowChannel(customerInput, currentState, modelConfig, fastResponse).then(result => {
      if (result.success && result.data) {
        callbacks.slow.onResult?.({
          ...result.data,
          latency: result.latency ?? 0,
        });
      } else {
        callbacks.slow.onError?.(result.error || '慢通道调用失败');
      }
    });
  };

  // 启动快通道（流式）
  streamFastChannel(customerInput, currentState, modelConfig, {
    onMetadata: callbacks.fast.onMetadata,
    onFirstToken: callbacks.fast.onFirstToken,
    onChunk: callbacks.fast.onChunk,
    onComplete: (data) => {
      // 快通道完成后再启动慢通道，带上快通道的完整回复
      startSlowChannel(data.fullContent);
      callbacks.fast.onComplete?.(data);
    },
    onError: () => {
      // 快通道失败：慢通道仍独立分析（无快通道回复可参考）
      startSlowChannel('');
      callbacks.fast.onError?.('快通道调用失败，已降级到规则引擎');
    },
  }, controller);

  return { customerMessage, agentMessageId, sendTime, abort: () => controller.abort() };
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
  // 校验 next_state，非法值（空/不存在/拼写错误）回退到当前状态
  const normalizedNext = normalizeNextState(parsedResponse.next_state, currentState.currentState);
  // 业务状态迁移校验：防倒退/防跳回，信息闭环时强制 FAREWELL
  const nextState = enforceStateTransition(
    currentState.currentState,
    normalizedNext,
    parsedResponse.intent,
    currentState.collectedSlots
  );

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
      reasoning: '[快通道] ' + parsedResponse.intent
        + (nextState !== normalizedNext ? `（状态迁移已校正: ${normalizedNext} → ${nextState}）` : ''),
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

  // 用最终 agent 消息替换已有的流式占位消息（若有），否则才追加客户消息+最终消息
  const hasAgentPlaceholder = currentState.messages.some(
    (m) => m.id === agentMessage.id
  );
  const messages = hasAgentPlaceholder
    ? currentState.messages.map((m) => (m.id === agentMessage.id ? agentMessage : m))
    : [...currentState.messages, customerMessage, agentMessage];

  return {
    currentState: nextState,
    exceptionState: mapEmotionToException('neutral', parsedResponse.intent),
    collectedSlots: currentState.collectedSlots,
    messages,
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
  slowResult: SlowChannelResult,
  slowLatency?: number
): AgentState {
  const finalSlowLatency = slowLatency ?? slowResult.latency ?? 0;

  // 归一化慢通道返回的实体键（中文键 → 内部英文键），再回填槽位
  const normalizedEntities = normalizeEntityKeys(slowResult.entities);
  // 更新槽位（如果慢通道提取到新实体）
  const updatedSlots = updateSlotsFromEntities(currentState.collectedSlots, normalizedEntities);

  // 护栏复核联动：慢通道 guardrail_check 命中严重护栏（辱骂/反感）→ 强制 FAREWELL 并修正话术
  const guardrail = evaluateGuardrail(slowResult.guardrail_check);

  // 信息闭环检测：姓氏 + 手机尾号均已收集且对话尚未结束 → 立即进入 FAREWELL，
  // 无需等下一轮用户输入（慢通道回填完成即闭环）
  const infoComplete = Boolean(updatedSlots.surname && updatedSlots.phoneTail);
  let nextCurrentState: MainDialogState =
    infoComplete && currentState.currentState !== 'FAREWELL'
      ? 'FAREWELL'
      : currentState.currentState;
  if (guardrail.forceFarewell && nextCurrentState !== 'FAREWELL') {
    nextCurrentState = 'FAREWELL';
  }

  // 护栏命中时修正话术：把最近一条 agent 消息替换为护栏退出话术（快通道话术作废）
  let messages = currentState.messages;
  if (guardrail.forceFarewell) {
    const lastAgentIndex = [...messages].reverse().findIndex((m) => m.role === 'agent');
    if (lastAgentIndex >= 0) {
      const idx = messages.length - 1 - lastAgentIndex;
      messages = messages.map((m, i) =>
        i === idx ? { ...m, content: GUARDRAIL_EXIT_REPLY } : m
      );
    }
  }

  // 更新决策路径
  const updatedDecision = currentState.lastDecision
    ? {
        ...currentState.lastDecision,
        perception: {
          ...currentState.lastDecision.perception,
          emotion: mapEmotion(slowResult.emotion),
          entities: { ...currentState.lastDecision.perception.entities, ...normalizedEntities },
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
    slowLatency: finalSlowLatency,
  };

  return {
    ...currentState,
    currentState: nextCurrentState,
    collectedSlots: updatedSlots,
    messages,
    lastDecision: updatedDecision,
    exceptionState:
      guardrail.exception !== 'NONE'
        ? guardrail.exception
        : mapEmotionToException(slowResult.emotion, updatedDecision?.perception.intent || ''),
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

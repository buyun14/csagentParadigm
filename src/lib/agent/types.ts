/** Agent 核心类型定义 */

// 对话状态机 - 主流程
export type MainDialogState =
  | 'GREETING'
  | 'BRAND_INQUIRY'
  | 'MODEL_INQUIRY'
  | 'CITY_INQUIRY'
  | 'TIMING_INQUIRY'
  | 'CONTACT_COLLECTION'
  | 'FAREWELL';

// 异常处理状态
export type ExceptionState =
  | 'OFF_TRACK'
  | 'ABUSE'
  | 'OUT_OF_SCOPE'
  | 'UNCLEAR'
  | 'NONE';

// 意图类型
export type IntentType =
  | 'greet'           // 问候
  | 'confirm_brand'   // 确认品牌
  | 'confirm_model'   // 确认车型
  | 'confirm_city'    // 确认城市
  | 'confirm_time'    // 确认时间
  | 'confirm_surname' // 确认姓氏
  | 'ask_vehicle'     // 询问车辆信息
  | 'filter_vehicle'  // 筛选车辆（按动力/类型）
  | 'agree'           // 同意/肯定
  | 'disagree'        // 否定/不同意
  | 'unclear'         // 不清晰
  | 'off_track'       // 偏离话题
  | 'abuse'           // 辱骂
  | 'dislike'         // 反感
  | 'out_of_scope'    // 超范围问题
  | 'farewell'        // 告别
  | 'ask_recommend'   // 请求推荐
  | 'wait'            // 等一下/稍等
  | 'unknown';        // 未知

// 已收集的槽位信息
export interface CollectedSlots {
  brand: string | null;
  series: string | null;
  model: string | null;
  city: string | null;
  timing: string | null;
  surname: string | null;
  phoneTail: string | null;
  vehicleType: string | null; // 轿车/SUV/MPV
  powerType: string | null;   // 纯电/混动/增程
}

// 对话消息
export interface ChatMessage {
  id: string;
  role: 'agent' | 'customer';
  content: string;
  timestamp: number;
  /** 消息发送耗时（ms），agent 消息表示从客户发送到收到回复的延迟 */
  latencyMs?: number;
  /** 是否正在流式接收中 */
  isStreaming?: boolean;
}

// Agent 决策路径（用于调试面板）
export interface AgentDecision {
  perception: {
    intent: IntentType;
    entities: Record<string, string>;
    emotion: 'neutral' | 'positive' | 'negative' | 'angry';
  };
  memory: {
    currentState: MainDialogState;
    exceptionState: ExceptionState;
    collectedSlots: CollectedSlots;
  };
  planning: {
    reasoning: string;
    nextState: MainDialogState;
    action: string;
  };
  output: string;
}

// Agent 运行状态（用于调试面板展示）
export interface AgentState {
  currentState: MainDialogState;
  exceptionState: ExceptionState;
  collectedSlots: CollectedSlots;
  messages: ChatMessage[];
  lastDecision: AgentDecision | null;
  turnCount: number;
  isProcessing: boolean;
  /** 当前回复来源：LLM 或规则引擎 */
  responseSource: 'llm' | 'rule' | 'fallback';
  /** 详细延迟指标 */
  latencyMetrics: LatencyMetrics | null;
  /** LLM 原始返回（用于调试） */
  llmRawResponse: string | null;
}

/** 详细延迟指标（用于性能分析） */
export interface LatencyMetrics {
  /** Prompt 构建耗时（ms） */
  promptBuild: number;
  /** LLM API 调用耗时（ms） */
  llmCall: number;
  /** JSON 解析耗时（ms） */
  parse: number;
  /** 首字延迟：从请求开始到第一个字符发送（ms） */
  firstToken: number;
  /** 生成延迟：LLM 生成完整文本的耗时（ms），等于 llmCall */
  generation: number;
  /** 系统调用总耗时：从请求开始到响应完成（ms） */
  total: number;
}

// Agent 模式
export type AgentMode = 'llm' | 'rule';

// LLM 请求参数
export interface LLMChatRequest {
  customerInput: string;
  currentState: MainDialogState;
  exceptionState: ExceptionState;
  collectedSlots: CollectedSlots;
  recentMessages: Array<{ role: string; content: string }>;
  /** 可选的模型参数覆盖 */
  modelConfig?: LLMModelConfig;
}

/**
 * LLM 模型参数配置（OpenAI 兼容格式）
 * 参考: https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
 * 
 * 注意：不同模型支持的参数可能不同，未支持的参数会被忽略
 */
export interface LLMModelConfig {
  /** 采样温度，控制随机性 (0-2)。值越高输出越随机，值越低输出越确定。建议: 0.7-0.9 用于创意任务，0.1-0.3 用于结构化输出 */
  temperature?: number;
  /** 核采样概率 (0-1)。值越小输出越确定。与 temperature 二选一使用 */
  top_p?: number;
  /** 最大生成 token 数。限制输出长度，避免过长响应 */
  max_tokens?: number;
  /** 存在惩罚 (-2 到 2)。正值鼓励讨论新话题 */
  presence_penalty?: number;
  /** 频率惩罚 (-2 到 2)。正值降低重复用词 */
  frequency_penalty?: number;
  /** 停止序列，遇到这些字符串时停止生成 */
  stop?: string | string[];
  /** 随机种子，用于复现结果 */
  seed?: number;
  /** 是否启用流式输出（当前固定为 true） */
  stream?: boolean;
}

// LLM 返回结构
export interface LLMChatResponse {
  intent: string;
  entities: Record<string, string>;
  emotion: 'neutral' | 'interested' | 'annoyed' | 'angry';
  next_state: string;
  response: string;
  reasoning: string;
}

// 知识库 - 车系信息
export interface SeriesInfo {
  type: string;       // 轿车/SUV/MPV
  power: string;      // 纯电/混动/增程/混动纯电
  priceRange: string; // 价格区间
}

// 知识库 - 品牌信息
export interface BrandInfo {
  series: Record<string, SeriesInfo>;
}

// 知识库
export interface KnowledgeBase {
  brands: Record<string, BrandInfo>;
}

// 知识库查询参数
export interface QueryParams {
  brand?: string;
  type?: string;
  power?: string;
}

// 知识库查询结果
export interface QueryResult {
  found: boolean;
  brand?: string;
  results: Array<{
    name: string;
    type: string;
    power: string;
    priceRange: string;
  }>;
  message?: string;
}

import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildSystemPrompt, validateNextState, parseLLMResponse } from '@/lib/agent/prompt-builder';
import type { MainDialogState, CollectedSlots, LLMChatRequest, LatencyMetrics, LLMModelConfig } from '@/lib/agent/types';

// SSE 辅助函数
function sseEncode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * 解析环境变量中的模型参数
 * 优先级: 请求参数 > 环境变量 > 默认值
 */
function getModelConfig(requestConfig?: LLMModelConfig): LLMModelConfig {
  const envConfig: LLMModelConfig = {
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined,
    top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : undefined,
    max_tokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
    presence_penalty: process.env.LLM_PRESENCE_PENALTY ? parseFloat(process.env.LLM_PRESENCE_PENALTY) : undefined,
    frequency_penalty: process.env.LLM_FREQUENCY_PENALTY ? parseFloat(process.env.LLM_FREQUENCY_PENALTY) : undefined,
    seed: process.env.LLM_SEED ? parseInt(process.env.LLM_SEED, 10) : undefined,
  };

  // 合并配置：请求参数 > 环境变量 > 默认值
  return {
    temperature: requestConfig?.temperature ?? envConfig.temperature ?? 0.7,
    top_p: requestConfig?.top_p ?? envConfig.top_p,
    max_tokens: requestConfig?.max_tokens ?? envConfig.max_tokens,
    presence_penalty: requestConfig?.presence_penalty ?? envConfig.presence_penalty,
    frequency_penalty: requestConfig?.frequency_penalty ?? envConfig.frequency_penalty,
    stop: requestConfig?.stop,
    seed: requestConfig?.seed ?? envConfig.seed,
  };
}

/**
 * 过滤掉 undefined 值，构建 LLM 调用参数
 */
function buildLLMParams(config: LLMModelConfig): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  
  if (config.temperature !== undefined) params.temperature = config.temperature;
  if (config.top_p !== undefined) params.top_p = config.top_p;
  if (config.max_tokens !== undefined) params.max_tokens = config.max_tokens;
  if (config.presence_penalty !== undefined) params.presence_penalty = config.presence_penalty;
  if (config.frequency_penalty !== undefined) params.frequency_penalty = config.frequency_penalty;
  if (config.stop !== undefined) params.stop = config.stop;
  if (config.seed !== undefined) params.seed = config.seed;
  
  return params;
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  const latencyMetrics: Partial<LatencyMetrics> = {};

  try {
    const body: LLMChatRequest = await request.json();
    const {
      customerInput,
      currentState,
      collectedSlots,
      recentMessages,
      modelConfig: requestModelConfig,
    } = body;

    // 合并模型参数配置
    const modelConfig = getModelConfig(requestModelConfig);
    const llmParams = buildLLMParams(modelConfig);

    // 阶段1: 构建 System Prompt
    const promptBuildStart = Date.now();
    const systemPrompt = buildSystemPrompt(
      currentState as MainDialogState,
      collectedSlots as CollectedSlots
    );

    // 构建消息列表
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    const historySlice = recentMessages.slice(-12);
    for (const msg of historySlice) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
    messages.push({ role: 'user', content: customerInput });
    latencyMetrics.promptBuild = Date.now() - promptBuildStart;

    // ===== 调试日志：打印实际发给 LLM 的提示词（变量已替换为真实值）与模型参数 =====
    console.log('[agent-chat] ========== chat 通道请求 ==========');
    console.log('[agent-chat] current_state =', currentState);
    console.log('[agent-chat] collected_slots =', JSON.stringify(collectedSlots));
    console.log('[agent-chat] 用户输入 =', customerInput);
    console.log('[agent-chat] ----- System Prompt（变量已替换为实际值） -----');
    console.log(systemPrompt);
    console.log('[agent-chat] ----- 发送给模型的完整消息列表 -----');
    console.log(JSON.stringify(messages, null, 2));
    console.log('[agent-chat] 模型参数 =', JSON.stringify(llmParams));

    // 阶段2: 调用 LLM
    const llmCallStart = Date.now();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      modelBaseUrl: process.env.LLM_BASE_URL,
    });
    const client = new LLMClient(config, customHeaders);

    const response = await client.invoke(messages, {
      model: process.env.LLM_MODEL,
      ...llmParams,
    });
    latencyMetrics.llmCall = Date.now() - llmCallStart;
    latencyMetrics.generation = latencyMetrics.llmCall;

    // ===== 调试日志：打印 LLM 原始输出 =====
    console.log('[agent-chat] ----- LLM 原始输出 -----');
    console.log(response.content);
    console.log('[agent-chat] ----- chat 输出结束 -----');

    // 阶段3: 解析 LLM 返回
    const parseStart = Date.now();
    const parsed = parseLLMResponse(response.content);
    latencyMetrics.parse = Date.now() - parseStart;

    if (!parsed.success || !parsed.data) {
      // 返回错误 SSE 事件
      latencyMetrics.total = Date.now() - requestStartTime;
      latencyMetrics.firstToken = latencyMetrics.total;
      console.log('[agent-chat] LLM 返回格式异常:', parsed.error, '原始内容:', response.content);
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseEncode({
            type: 'error',
            error: 'LLM 返回格式异常',
            detail: parsed.error,
            raw: response.content,
            latencyMetrics,
          })));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 校验 next_state 合法性
    const validatedNextState = validateNextState(
      currentState as MainDialogState,
      parsed.data.next_state
    );

    // 构建 SSE 流式响应
    const responseText = parsed.data.response;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // 1. 先发送元数据事件
        const firstTokenTime = Date.now() - requestStartTime;
        latencyMetrics.firstToken = firstTokenTime;

        controller.enqueue(encoder.encode(sseEncode({
          type: 'metadata',
          intent: parsed.data!.intent,
          entities: parsed.data!.entities,
          emotion: parsed.data!.emotion,
          next_state: validatedNextState,
          reasoning: parsed.data!.reasoning,
          latencyMetrics: {
            promptBuild: latencyMetrics.promptBuild,
            llmCall: latencyMetrics.llmCall,
            parse: latencyMetrics.parse,
            firstToken: firstTokenTime,
            generation: latencyMetrics.generation,
          },
          rawResponse: JSON.stringify(parsed.data, null, 2),
        })));

        // 2. 流式发送回复文本（模拟打字效果，每块 1-3 个字符）
        const chunkSize = 2; // 每次发送2个字符
        const delay = 25; // 每块间隔25ms

        let index = 0;
        function sendNextChunk() {
          if (index >= responseText.length) {
            // 发送完成事件
            latencyMetrics.total = Date.now() - requestStartTime;
            controller.enqueue(encoder.encode(sseEncode({
              type: 'done',
              latencyMetrics: {
                total: latencyMetrics.total,
              },
            })));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          const end = Math.min(index + chunkSize, responseText.length);
          const chunk = responseText.slice(index, end);
          controller.enqueue(encoder.encode(sseEncode({
            type: 'chunk',
            content: chunk,
          })));
          index = end;

          setTimeout(sendNextChunk, delay);
        }

        sendNextChunk();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    latencyMetrics.total = Date.now() - requestStartTime;
    if (!latencyMetrics.firstToken) {
      latencyMetrics.firstToken = latencyMetrics.total;
    }
    console.log('[agent-chat] LLM 调用失败:', error instanceof Error ? error.message : String(error));

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseEncode({
          type: 'error',
          error: 'LLM 调用失败',
          detail: error instanceof Error ? error.message : String(error),
          latencyMetrics,
        })));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}

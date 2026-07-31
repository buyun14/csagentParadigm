import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildSystemPrompt, validateNextState, parseLLMResponse } from '@/lib/agent/prompt-builder';
import type { MainDialogState, CollectedSlots, LLMChatRequest, LatencyMetrics } from '@/lib/agent/types';

// SSE 辅助函数
function sseEncode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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
    } = body;

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
      temperature: 0.7,
    });
    latencyMetrics.llmCall = Date.now() - llmCallStart;
    latencyMetrics.generation = latencyMetrics.llmCall;

    // 阶段3: 解析 LLM 返回
    const parseStart = Date.now();
    const parsed = parseLLMResponse(response.content);
    latencyMetrics.parse = Date.now() - parseStart;

    if (!parsed.success || !parsed.data) {
      // 返回错误 SSE 事件
      latencyMetrics.total = Date.now() - requestStartTime;
      latencyMetrics.firstToken = latencyMetrics.total;
      
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
    let firstTokenSent = false;

    const stream = new ReadableStream({
      start(controller) {
        // 1. 先发送元数据事件
        const firstTokenTime = Date.now() - requestStartTime;
        latencyMetrics.firstToken = firstTokenTime;
        firstTokenSent = true;

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

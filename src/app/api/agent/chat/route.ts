import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildSystemPrompt, validateNextState, parseLLMResponse } from '@/lib/agent/prompt-builder';
import type { MainDialogState, CollectedSlots, LLMChatRequest } from '@/lib/agent/types';

// SSE 辅助函数
function sseEncode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: LLMChatRequest = await request.json();
    const {
      customerInput,
      currentState,
      collectedSlots,
      recentMessages,
    } = body;

    // 构建 System Prompt
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

    // 调用 LLM
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

    const llmLatency = Date.now() - startTime;

    // 解析 LLM 返回
    const parsed = parseLLMResponse(response.content);

    if (!parsed.success || !parsed.data) {
      // 返回错误 SSE 事件
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseEncode({
            type: 'error',
            error: 'LLM 返回格式异常',
            detail: parsed.error,
            raw: response.content,
            latency: llmLatency,
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
        controller.enqueue(encoder.encode(sseEncode({
          type: 'metadata',
          intent: parsed.data!.intent,
          entities: parsed.data!.entities,
          emotion: parsed.data!.emotion,
          next_state: validatedNextState,
          reasoning: parsed.data!.reasoning,
          llmLatency,
          rawResponse: JSON.stringify(parsed.data, null, 2),
        })));

        // 2. 流式发送回复文本（模拟打字效果，每块 1-3 个字符）
        const chunkSize = 2; // 每次发送2个字符
        const delay = 25; // 每块间隔25ms

        let index = 0;
        function sendNextChunk() {
          if (index >= responseText.length) {
            // 发送完成事件
            controller.enqueue(encoder.encode(sseEncode({
              type: 'done',
              totalLatency: Date.now() - startTime,
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

        // 开始发送文本块
        setTimeout(sendNextChunk, 50);
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
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // 返回错误 SSE 事件
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseEncode({
          type: 'error',
          error: 'LLM 调用失败',
          detail: errorMessage,
          latency,
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

import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import type { MainDialogState, CollectedSlots, LLMModelConfig } from '@/lib/agent/types';
import { buildSlimPrompt, estimateTokens } from '@/lib/agent/prompt-slim';

// 快通道：意图识别 + 状态决策 + 话术生成
// 使用精简 Prompt，流式输出，超时 8 秒

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      message,
      current_state,
      collected_slots,
      recent_history = [],
      model_params = {},
    } = body as {
      message: string;
      current_state: MainDialogState;
      collected_slots: CollectedSlots;
      recent_history?: Array<{ role: string; content: string }>;
      model_params?: LLMModelConfig;
    };

    // 构建精简版 prompt
    const systemPrompt = buildSlimPrompt(current_state, collected_slots, recent_history);
    const tokenEstimate = estimateTokens(systemPrompt);

    // 构建消息列表
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    for (const msg of recent_history.slice(-8)) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
    messages.push({ role: 'user', content: message });

    // 提取转发 headers
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      modelBaseUrl: process.env.LLM_BASE_URL,
    });
    const client = new LLMClient(config, customHeaders);

    // 构建模型参数（过滤 undefined）
    const modelOptions: Record<string, unknown> = {
      model: model_params.model || process.env.LLM_MODEL || 'doubao-seed-2-0-mini-260215',
    };
    if (model_params.temperature !== undefined) modelOptions.temperature = model_params.temperature;
    if (model_params.top_p !== undefined) modelOptions.top_p = model_params.top_p;
    if (model_params.max_tokens !== undefined) modelOptions.max_tokens = model_params.max_tokens;
    if (model_params.presence_penalty !== undefined) modelOptions.presence_penalty = model_params.presence_penalty;
    if (model_params.frequency_penalty !== undefined) modelOptions.frequency_penalty = model_params.frequency_penalty;

    // 调用 LLM（流式）
    const resp = await client.stream(messages, modelOptions);

    // 创建 SSE 流
    const encoder = new TextEncoder();
    let firstTokenTime = 0;
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送 metadata（token 估算）
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'metadata', tokenEstimate, startTime })}\n\n`
          ));

          for await (const chunk of resp) {
            const content = chunk.content || '';
            if (content) {
              if (firstTokenTime === 0) {
                firstTokenTime = Date.now();
                // 发送首字延迟
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'first_token', latency: firstTokenTime - startTime })}\n\n`
                ));
              }
              fullContent += content;
              // 流式发送文本块
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'chunk', content })}\n\n`
              ));
            }
          }

          // 发送完成事件（包含完整内容供前端解析）
          const completeLatency = Date.now() - startTime;
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ 
              type: 'done', 
              fullContent,
              latency: completeLatency,
              firstTokenLatency: firstTokenTime - startTime,
            })}\n\n`
          ));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamError) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: '流式处理失败', detail: String(streamError) })}\n\n`
          ));
          controller.close();
        }
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
    return new Response(
      JSON.stringify({ 
        error: '快通道调用失败', 
        detail: error instanceof Error ? error.message : String(error),
        latency 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

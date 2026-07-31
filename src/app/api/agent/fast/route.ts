import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildSlimPrompt } from '@/lib/agent/prompt-slim';
import { getBrandSeries, knowledgeBase } from '@/lib/agent/knowledge-base';
import type { CollectedSlots, MainDialogState, ExceptionState, LLMModelConfig } from '@/lib/agent/types';

interface FastChannelRequest {
  message: string;
  current_state: MainDialogState;
  exception_state?: ExceptionState;
  collected_slots: CollectedSlots;
  recent_history: Array<{ role: string; content: string }>;
  model_params?: Partial<LLMModelConfig>;
}

// 获取相关品牌数据
function getRelevantKBData(brand: string | null | undefined): Record<string, unknown> | null {
  if (!brand) return null;
  
  const resolvedBrand = Object.keys(knowledgeBase.brands).find(
    b => b.includes(brand) || brand.includes(b)
  );
  
  if (!resolvedBrand) return null;
  
  const series = getBrandSeries(resolvedBrand);
  if (series.length === 0) return null;
  
  return { [resolvedBrand]: { series: series.reduce((acc, s) => ({ ...acc, [s]: {} }), {}) } };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: FastChannelRequest = await request.json();
    const {
      message,
      current_state,
      exception_state = 'NONE',
      collected_slots,
      recent_history,
      model_params = {},
    } = body;

    // 获取相关品牌数据
    const kbData = getRelevantKBData(collected_slots?.brand);

    // 构建精简版 prompt
    const { systemPrompt, userMessage } = buildSlimPrompt({
      currentState: current_state,
      exceptionState: exception_state,
      collectedSlots: collected_slots,
      recentMessages: recent_history.slice(-8), // 最近4轮
      customerInput: message,
      kbData: kbData || undefined,
    });

    const fullPrompt = `${systemPrompt}\n\n用户说: ${userMessage}`;
    const tokenEstimate = Math.ceil(fullPrompt.length / 2);

    // 发送 metadata 事件
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'metadata', tokenEstimate, startTime });

        try {
          // 调用 LLM
          const headers = HeaderUtils.extractForwardHeaders(request.headers);
          const config = new Config({
            apiKey: process.env.LLM_API_KEY,
            baseUrl: process.env.LLM_BASE_URL,
            modelBaseUrl: process.env.LLM_BASE_URL,
          });

          const client = new LLMClient(config, headers);
          const model = process.env.LLM_MODEL || 'gpt-4o-mini';

          // 构建模型参数
          const llmParams: Record<string, unknown> = {
            temperature: model_params.temperature ?? 0.7,
            max_tokens: model_params.max_tokens ?? 150,
            top_p: model_params.top_p ?? 0.9,
          };

          if (model_params.presence_penalty !== undefined) {
            llmParams.presence_penalty = model_params.presence_penalty;
          }
          if (model_params.frequency_penalty !== undefined) {
            llmParams.frequency_penalty = model_params.frequency_penalty;
          }

          const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userMessage },
          ];

          const firstTokenTime = { value: 0 };
          let isFirstToken = true;
          let fullContent = '';

          // 使用流式调用
          const response = await client.stream(messages, {
            model,
            ...llmParams,
          });

          // 处理流式响应
          for await (const chunk of response) {
            const content = chunk.content || '';
            if (content) {
              if (isFirstToken) {
                firstTokenTime.value = Date.now() - startTime;
                send({ type: 'first_token', latency: firstTokenTime.value });
                isFirstToken = false;
              }
              fullContent += content;
              send({ type: 'chunk', content });
            }
          }

          const totalLatency = Date.now() - startTime;
          send({ type: 'done', totalLatency });

          // 打印日志
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            channel: 'fast',
            status: 'success',
            tokenEstimate,
            firstTokenLatency: firstTokenTime.value,
            totalLatency,
            prompt: fullPrompt.slice(0, 500) + '...',
            output: fullContent.slice(0, 200),
          }));

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          send({ type: 'error', message: errorMessage });
          
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            channel: 'fast',
            status: 'error',
            error: errorMessage,
          }));
        }

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

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { error: '快通道调用失败', detail: errorMessage, latency: Date.now() - startTime },
      { status: 200 }
    );
  }
}

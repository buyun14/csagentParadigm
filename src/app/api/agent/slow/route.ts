import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildSlowPrompt } from '@/lib/agent/prompt-slim';
import { getBrandSeries, knowledgeBase } from '@/lib/agent/knowledge-base';
import type { CollectedSlots, MainDialogState, LLMModelConfig } from '@/lib/agent/types';

interface SlowChannelRequest {
  message: string;
  current_state: MainDialogState;
  collected_slots: CollectedSlots;
  fast_response: string;
  full_history: Array<{ role: string; content: string }>;
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
    const body: SlowChannelRequest = await request.json();
    const {
      message,
      current_state,
      collected_slots,
      fast_response,
      full_history,
      model_params = {},
    } = body;

    // 获取相关品牌数据
    const kbData = getRelevantKBData(collected_slots.brand);

    // 构建完整 prompt
    const { systemPrompt, userMessage } = buildSlowPrompt({
      currentState: current_state,
      collectedSlots: collected_slots,
      recentMessages: full_history.slice(-12), // 最近6轮
      customerInput: message,
      fastResponse: fast_response,
      kbData: kbData || undefined,
    });

    const fullPrompt = `${systemPrompt}\n\n用户说: ${userMessage}`;
    const tokenEstimate = Math.ceil(fullPrompt.length / 2);

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
      temperature: model_params.temperature ?? 0.3, // 慢通道用更低温度，更精确
      max_tokens: model_params.max_tokens ?? 300,
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

    const response = await client.invoke(messages, {
      model,
      ...llmParams,
    });

    // 解析非流式响应
    const content = response.content || '{}';
    
    let parsed: {
      emotion?: string;
      entities?: Record<string, string>;
      reasoning?: string;
      guardrail_check?: string;
    };
    
    try {
      // 尝试从返回内容中提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          emotion: 'neutral',
          entities: {},
          reasoning: content,
          guardrail_check: 'pass',
        };
      }
    } catch {
      parsed = {
        emotion: 'neutral',
        entities: {},
        reasoning: content,
        guardrail_check: 'pass',
      };
    }

    const totalLatency = Date.now() - startTime;

    // 打印日志
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      channel: 'slow',
      status: 'success',
      tokenEstimate,
      totalLatency,
      prompt: fullPrompt.slice(0, 500) + '...',
      output: content.slice(0, 200),
    }));

    return Response.json({
      success: true,
      data: {
        emotion: parsed.emotion || 'neutral',
        entities: parsed.entities || {},
        reasoning: parsed.reasoning || '',
        guardrail_check: parsed.guardrail_check || 'pass',
      },
      latency: totalLatency,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      channel: 'slow',
      status: 'error',
      error: errorMessage,
    }));

    return Response.json(
      { success: false, error: '慢通道调用失败', detail: errorMessage, latency: Date.now() - startTime },
      { status: 200 }
    );
  }
}

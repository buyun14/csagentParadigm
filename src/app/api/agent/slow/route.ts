import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import type { MainDialogState, CollectedSlots, LLMModelConfig } from '@/lib/agent/types';
import { buildSlowPrompt } from '@/lib/agent/prompt-slim';

// 慢通道：情绪分析 + 实体深度抽取 + 决策推理
// 异步执行，不阻塞主流程，超时 15 秒

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      message,
      current_state,
      collected_slots,
      fast_response,
      full_history = [],
      model_params = {},
    } = body as {
      message: string;
      current_state: MainDialogState;
      collected_slots: CollectedSlots;
      fast_response: string;
      full_history?: Array<{ role: string; content: string }>;
      model_params?: LLMModelConfig;
    };

    // 构建完整 prompt
    const systemPrompt = buildSlowPrompt(current_state, collected_slots, full_history, fast_response);

    // 构建消息列表
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    for (const msg of full_history.slice(-12)) {
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
      temperature: model_params.temperature ?? 0.3, // 慢通道用更低温度，更准确
    };
    if (model_params.top_p !== undefined) modelOptions.top_p = model_params.top_p;
    if (model_params.max_tokens !== undefined) modelOptions.max_tokens = model_params.max_tokens;

    // ===== 调试日志：打印实际发给 LLM 的提示词（变量已替换为真实值）与模型参数 =====
    console.log('[agent-slow] ========== 慢通道请求 ==========');
    console.log('[agent-slow] current_state =', current_state);
    console.log('[agent-slow] collected_slots =', JSON.stringify(collected_slots));
    console.log('[agent-slow] 用户输入 =', message);
    console.log('[agent-slow] ----- System Prompt（变量已替换为实际值） -----');
    console.log(systemPrompt);
    console.log('[agent-slow] ----- 发送给模型的完整消息列表 -----');
    console.log(JSON.stringify(messages, null, 2));
    console.log('[agent-slow] 模型参数 =', JSON.stringify(modelOptions));

    // 调用 LLM（非流式，等待完整结果）
    const response = await client.invoke(messages, modelOptions);
    const latency = Date.now() - startTime;

    // ===== 调试日志：打印 LLM 原始输出 =====
    console.log('[agent-slow] ----- LLM 原始输出 -----');
    console.log(response.content);
    console.log('[agent-slow] ----- 慢通道输出结束 -----');

    // 解析 JSON 响应
    let parsed: {
      emotion?: string;
      entities?: Record<string, string>;
      reasoning?: string;
      guardrail_check?: string;
    } = {};

    try {
      const content = response.content || '';
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 解析失败，返回空结果
      parsed = { reasoning: '慢通道解析失败' };
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          emotion: parsed.emotion || 'neutral',
          entities: parsed.entities || {},
          reasoning: parsed.reasoning || '',
          guardrail_check: parsed.guardrail_check || '',
        },
        latency,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const latency = Date.now() - startTime;
    console.log('[agent-slow] 慢通道调用异常:', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ 
        success: false,
        error: '慢通道调用失败', 
        detail: error instanceof Error ? error.message : String(error),
        latency 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

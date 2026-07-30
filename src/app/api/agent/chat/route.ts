import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildSystemPrompt, validateNextState, parseLLMResponse } from '@/lib/agent/prompt-builder';
import type { MainDialogState, CollectedSlots, LLMChatRequest } from '@/lib/agent/types';

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

    // 构建消息列表（最近6轮 = 12条消息）
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // 添加历史对话（最近12条）
    const historySlice = recentMessages.slice(-12);
    for (const msg of historySlice) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // 添加当前客户输入
    messages.push({ role: 'user', content: customerInput });

    // 调用 LLM
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const response = await client.invoke(messages, {
      temperature: 0.7,
    });

    const latency = Date.now() - startTime;

    // 解析 LLM 返回
    const parsed = parseLLMResponse(response.content);

    if (!parsed.success || !parsed.data) {
      return NextResponse.json({
        error: 'LLM 返回格式异常',
        detail: parsed.error,
        raw: response.content,
        latency,
      });
    }

    // 校验 next_state 合法性
    const validatedNextState = validateNextState(
      currentState as MainDialogState,
      parsed.data.next_state
    );

    return NextResponse.json({
      ...parsed.data,
      next_state: validatedNextState,
      latency,
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // 返回 200 + error 字段，让前端触发降级逻辑
    return NextResponse.json({
      error: 'LLM 调用失败',
      detail: errorMessage,
      latency,
    });
  }
}

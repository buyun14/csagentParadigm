'use client';

import { useState, useCallback, useRef } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { ChatArea } from '@/components/chat/chat-area';
import { ChatInput } from '@/components/chat/chat-input';
import { DebugPanel } from '@/components/debug/debug-panel';
import {
  createInitialState,
  processCustomerInput,
  processWithLLMStreaming,
  buildFinalStateFromStream,
  fallbackToRuleEngine,
} from '@/lib/agent/engine';
import type { AgentState, AgentMode, ChatMessage } from '@/lib/agent/types';
import { PanelRightClose, PanelRightOpen, Cpu, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  const [agentState, setAgentState] = useState<AgentState>(createInitialState);
  const [showDebug, setShowDebug] = useState(true);
  const [mode, setMode] = useState<AgentMode>('rule');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // 用 ref 存储流式过程中的累积数据
  const streamRef = useRef<{
    content: string;
    metadata: {
      intent: string;
      entities: Record<string, string>;
      emotion: string;
      next_state: string;
      reasoning: string;
      llmLatency: number;
      rawResponse: string;
    } | null;
    customerMessage: ChatMessage | null;
    sendTime: number;
  }>({ content: '', metadata: null, customerMessage: null, sendTime: 0 });

  const handleSend = useCallback(async (message: string) => {
    if (mode === 'rule') {
      // 规则引擎模式：同步处理
      setAgentState((prev) => {
        if (prev.currentState === 'FAREWELL') return prev;
        return { ...prev, isProcessing: true };
      });

      try {
        const currentState = await new Promise<AgentState>((resolve) => {
          setAgentState((prev) => {
            resolve(prev);
            return prev;
          });
        });

        const { newState } = processCustomerInput(currentState, message, mode);
        setAgentState(newState);
      } catch {
        setAgentState((prev) => ({ ...prev, isProcessing: false }));
      }
    } else {
      // LLM 模式：流式处理
      setAgentState((prev) => {
        if (prev.currentState === 'FAREWELL') return prev;
        return { ...prev, isProcessing: true };
      });

      const currentState = await new Promise<AgentState>((resolve) => {
        setAgentState((prev) => {
          resolve(prev);
          return prev;
        });
      });

      // 初始化流式数据
      streamRef.current = { content: '', metadata: null, customerMessage: null, sendTime: Date.now() };

      const { customerMessage, agentMessageId, sendTime } = processWithLLMStreaming(
        currentState,
        message,
        {
          onMetadata: (data) => {
            streamRef.current.metadata = data;
            streamRef.current.customerMessage = customerMessage;
            streamRef.current.sendTime = sendTime;

            // 更新调试面板信息
            setAgentState((prev) => ({
              ...prev,
              responseSource: 'llm',
              llmLatency: data.llmLatency,
              llmRawResponse: data.rawResponse,
            }));
          },
          onChunk: (content) => {
            streamRef.current.content += content;
            const accumulated = streamRef.current.content;

            // 更新消息列表中的 agent 消息内容（流式效果）
            setAgentState((prev) => {
              const messages = prev.messages.map((m) => {
                if (m.id === agentMessageId) {
                  return { ...m, content: accumulated, isStreaming: true };
                }
                return m;
              });
              return { ...prev, messages };
            });
          },
          onComplete: (totalLatency) => {
            const meta = streamRef.current.metadata;
            if (!meta || !streamRef.current.customerMessage) {
              // 没有元数据，降级
              setAgentState((prev) => ({ ...prev, isProcessing: false }));
              setStreamingMessageId(null);
              return;
            }

            const finalState = buildFinalStateFromStream(
              currentState,
              streamRef.current.customerMessage,
              streamRef.current.content,
              meta,
              totalLatency
            );

            setAgentState(finalState);
            setStreamingMessageId(null);
          },
          onError: () => {
            // LLM 失败 → 降级到规则引擎
            const { newState } = fallbackToRuleEngine(currentState, message);
            setAgentState({
              ...newState,
              responseSource: 'fallback',
            });
            setStreamingMessageId(null);
          },
        }
      );

      // 添加客户消息和空的 agent 消息到列表
      const emptyAgentMessage: ChatMessage = {
        id: agentMessageId,
        role: 'agent',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setAgentState((prev) => ({
        ...prev,
        messages: [...prev.messages, customerMessage, emptyAgentMessage],
      }));
      setStreamingMessageId(agentMessageId);
    }
  }, [mode]);

  const handleReset = useCallback(() => {
    setAgentState(createInitialState());
    setStreamingMessageId(null);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'llm' ? 'rule' : 'llm'));
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Bar */}
      <TopBar
        onReset={handleReset}
        turnCount={agentState.turnCount}
        isCallEnded={agentState.currentState === 'FAREWELL'}
      />

      {/* Mode Toggle Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMode}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              mode === 'llm'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
            )}
          >
            <Cpu className="h-3 w-3" />
            LLM 模式
          </button>
          <button
            onClick={toggleMode}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              mode === 'rule'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
            )}
          >
            <Workflow className="h-3 w-3" />
            规则引擎
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            mode === 'llm' ? 'bg-emerald-500' : 'bg-amber-500'
          )} />
          <span>{mode === 'llm' ? 'LLM 驱动中' : '规则引擎驱动中'}</span>
          {agentState.responseSource === 'fallback' && (
            <span className="text-red-500 ml-1">(已降级)</span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-white min-w-0">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-white text-xs font-medium">客</span>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-800">客户来电</div>
                <div className="text-[10px] text-slate-400">
                  {agentState.currentState === 'FAREWELL' ? '通话已结束' : '通话中...'}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDebug(!showDebug)}
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
              title={showDebug ? '隐藏调试面板' : '显示调试面板'}
            >
              {showDebug ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Messages */}
          <ChatArea
            messages={agentState.messages}
            isProcessing={agentState.isProcessing}
            streamingMessageId={streamingMessageId}
          />

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={agentState.currentState === 'FAREWELL' || agentState.isProcessing}
          />
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="w-[360px] border-l border-slate-200 bg-white flex-shrink-0 overflow-hidden">
            <DebugPanel agentState={agentState} mode={mode} />
          </div>
        )}
      </div>
    </div>
  );
}

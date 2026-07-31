'use client';

import { useState, useCallback, useRef } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { ChatArea } from '@/components/chat/chat-area';
import { ChatInput } from '@/components/chat/chat-input';
import { DebugPanel } from '@/components/debug/debug-panel';
import { ModelSettingsPanel } from '@/components/settings/model-settings-panel';
import {
  createInitialState,
  processCustomerInput,
  processWithLLMStreaming,
  buildFinalStateFromStream,
  fallbackToRuleEngine,
} from '@/lib/agent/engine';
import { checkCache } from '@/lib/agent/cache';
import type { AgentState, AgentMode, ChatMessage, LatencyMetrics, PromptLogEntry } from '@/lib/agent/types';
import { PanelRightClose, PanelRightOpen, Cpu, Workflow, Zap, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  const [agentState, setAgentState] = useState<AgentState>(createInitialState);
  const [showDebug, setShowDebug] = useState(true);
  const [mode, setMode] = useState<AgentMode>('dual');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 用 ref 存储流式过程中的累积数据
  const streamRef = useRef<{
    content: string;
    metadata: {
      intent: string;
      entities: Record<string, string>;
      emotion: string;
      next_state: string;
      reasoning: string;
      latencyMetrics: LatencyMetrics;
      rawResponse: string;
      promptLog?: PromptLogEntry;
    } | null;
    customerMessage: ChatMessage | null;
    sendTime: number;
  }>({ content: '', metadata: null, customerMessage: null, sendTime: 0 });

  // 处理面板宽度调整
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(280, Math.min(500, newWidth)));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleSend = useCallback(async (message: string) => {
    // 检查缓存（所有模式都检查）
    const cacheResult = checkCache(agentState.currentState, message);
    if (cacheResult.hit) {
      const customerMessage: ChatMessage = {
        id: `msg-c-${Date.now()}`,
        role: 'customer',
        content: message,
        timestamp: Date.now(),
      };
      const agentMessage: ChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: 'agent',
        content: cacheResult.response!,
        timestamp: Date.now(),
        latencyMs: 0,
      };

      const promptLog: PromptLogEntry = {
        turn_id: `turn-${Date.now()}`,
        timestamp: Date.now(),
        mode: 'cache',
        status: 'cache_hit',
        prompt: {
          system_prompt: '',
          user_message: message,
          metadata: {
            prompt_type: 'slim',
            token_estimate: 0,
            model: 'cache',
            temperature: 0,
          },
        },
        raw_output: cacheResult.response!,
        latency: { first_token_ms: 0, total_ms: 0 },
      };

      setAgentState((prev) => ({
        ...prev,
        messages: [...prev.messages, customerMessage, agentMessage],
        responseSource: 'cache',
        promptLogs: [...prev.promptLogs, promptLog],
      }));
      return;
    }

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
      // LLM 模式（单通道或双通道）：流式处理
      setAgentState((prev) => {
        if (prev.currentState === 'FAREWELL') return prev;
        return { ...prev, isProcessing: true, slowChannelStatus: mode === 'dual' ? 'pending' : 'idle' };
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
              latencyMetrics: data.latencyMetrics,
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

            // 添加 prompt log
            if (meta.promptLog) {
              finalState.promptLogs = [...finalState.promptLogs, meta.promptLog];
            }

            setAgentState(finalState);
            setStreamingMessageId(null);

            // 双通道模式：异步调用慢通道
            if (mode === 'dual') {
              callSlowChannel(currentState, message, streamRef.current.content);
            }
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
  }, [mode, agentState.currentState]);

  // 调用慢通道
  const callSlowChannel = useCallback(async (state: AgentState, userMessage: string, fastResponse: string) => {
    try {
      const response = await fetch('/api/agent/slow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          current_state: state.currentState,
          collected_slots: state.collectedSlots,
          fast_response: fastResponse,
          full_history: state.messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
          model_params: {},
        }),
      });

      if (!response.ok) {
        setAgentState((prev) => ({ ...prev, slowChannelStatus: 'timeout' }));
        return;
      }

      const result = await response.json();
      if (result.success) {
        setAgentState((prev) => ({
          ...prev,
          slowChannelStatus: 'done',
          slowChannelResult: result.data,
        }));
      } else {
        setAgentState((prev) => ({ ...prev, slowChannelStatus: 'timeout' }));
      }
    } catch {
      setAgentState((prev) => ({ ...prev, slowChannelStatus: 'timeout' }));
    }
  }, []);

  const handleReset = useCallback(() => {
    setAgentState(createInitialState());
    setStreamingMessageId(null);
  }, []);

  const setAgentMode = useCallback((newMode: AgentMode) => {
    setMode(newMode);
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
          {/* 双通道模式 */}
          <button
            onClick={() => setAgentMode('dual')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              mode === 'dual'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
            )}
          >
            <Zap className="h-3 w-3" />
            双通道
          </button>
          {/* LLM 模式 */}
          <button
            onClick={() => setAgentMode('llm')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              mode === 'llm'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
            )}
          >
            <Cpu className="h-3 w-3" />
            LLM
          </button>
          {/* 规则引擎 */}
          <button
            onClick={() => setAgentMode('rule')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              mode === 'rule'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
            )}
          >
            <Workflow className="h-3 w-3" />
            规则
          </button>
          {/* 模型设置 */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              showSettings
                ? 'bg-slate-200 text-slate-700 border border-slate-300'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
            )}
          >
            <Settings className="h-3 w-3" />
            设置
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            mode === 'dual' ? 'bg-blue-500' : mode === 'llm' ? 'bg-emerald-500' : 'bg-amber-500'
          )} />
          <span>
            {mode === 'dual' ? '双通道驱动中' : mode === 'llm' ? 'LLM 驱动中' : '规则引擎驱动中'}
          </span>
          {agentState.responseSource === 'fallback' && (
            <span className="text-red-500 ml-1">(已降级)</span>
          )}
          {agentState.responseSource === 'cache' && (
            <span className="text-purple-500 ml-1">(缓存命中)</span>
          )}
        </div>
      </div>

      {/* Model Settings Panel (collapsible) */}
      {showSettings && (
        <div className="border-b border-slate-200 bg-slate-50">
          <ModelSettingsPanel />
        </div>
      )}

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
          <>
            {/* Resize Handle */}
            <div
              className={cn(
                'w-1 cursor-col-resize hover:bg-blue-400 transition-colors flex-shrink-0',
                isResizing ? 'bg-blue-400' : 'bg-slate-200'
              )}
              onMouseDown={handleMouseDown}
            />
            <div 
              className="border-l border-slate-200 bg-white flex-shrink-0 overflow-hidden"
              style={{ width: panelWidth }}
            >
              <DebugPanel agentState={agentState} mode={mode} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

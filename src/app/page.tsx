'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { ChatArea } from '@/components/chat/chat-area';
import { ChatInput } from '@/components/chat/chat-input';
import { DebugPanel } from '@/components/debug/debug-panel';
import { ModelSettingsPanel } from '@/components/settings/model-settings-panel';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  createInitialState,
  processCustomerInput,
  processWithDualChannel,
  buildFinalStateFromFastChannel,
  updateStateWithSlowChannel,
  processCacheHit,
  checkCacheHit,
  fallbackToRuleEngine,
  loadModelConfig,
  saveModelConfig,
} from '@/lib/agent/engine';
import type { SlowChannelResult } from '@/lib/agent/engine';
import type { AgentState, AgentMode, ChatMessage, LLMModelConfig } from '@/lib/agent/types';
import { PanelRightClose, PanelRightOpen, Cpu, Workflow, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  const [agentState, setAgentState] = useState<AgentState>(createInitialState);
  const [showDebug, setShowDebug] = useState(true);
  const [mode, setMode] = useState<AgentMode>('dual');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [modelConfig, setModelConfig] = useState<LLMModelConfig>(() => loadModelConfig());
  const isMobile = useIsMobile();

  // 移动端自动隐藏调试面板，避免挤压聊天区
  useEffect(() => {
    if (isMobile) setShowDebug(false);
  }, [isMobile]);

  // 流式数据 ref
  const streamRef = useRef<{
    content: string;
    firstTokenLatency: number;
    tokenEstimate: number;
    customerMessage: ChatMessage | null;
    sendTime: number;
    agentMessageId: string;
  }>({ content: '', firstTokenLatency: 0, tokenEstimate: 0, customerMessage: null, sendTime: 0, agentMessageId: '' });

  // 慢通道结果缓存：防止慢通道先返回时被快通道 onComplete 整体覆盖
  const slowResultRef = useRef<SlowChannelResult | null>(null);

  // 初始化模型配置
  useEffect(() => {
    const saved = loadModelConfig();
    setModelConfig(saved);
  }, []);

  // 处理面板宽度调整
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      // 上限受视口宽度约束，避免窄窗口下面板挤压聊天区
      setPanelWidth(Math.max(280, Math.min(500, newWidth, window.innerWidth * 0.6)));
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
    // 获取当前状态
    const currentState = await new Promise<AgentState>((resolve) => {
      setAgentState((prev) => {
        if (prev.currentState === 'FAREWELL') {
          resolve(prev);
        }
        resolve(prev);
        return { ...prev, isProcessing: true };
      });
    });

    if (currentState.currentState === 'FAREWELL') return;

    // 规则引擎模式
    if (mode === 'rule') {
      const { newState } = processCustomerInput(currentState, message, mode);
      setAgentState(newState);
      return;
    }

    // 缓存检查（双通道和LLM模式都适用）
    if (mode === 'dual' || mode === 'llm') {
      const cacheResult = checkCacheHit(currentState.currentState, message);
      if (cacheResult.hit && cacheResult.response) {
        const { newState, customerMessage, agentMessage } = processCacheHit(
          currentState,
          message,
          { response: cacheResult.response, intent: cacheResult.intent || 'unknown', next_state: cacheResult.next_state || currentState.currentState }
        );
        setAgentState({
          ...newState,
          messages: [...currentState.messages, customerMessage, agentMessage],
        });
        return;
      }
    }

    // LLM 单通道模式（降级到规则引擎，因为实际应该用双通道）
    if (mode === 'llm') {
      const { newState } = fallbackToRuleEngine(currentState, message);
      setAgentState({ ...newState, responseSource: 'fallback' });
      return;
    }

    // 双通道模式
    if (mode === 'dual') {
      // 初始化流式数据
      streamRef.current = { 
        content: '', 
        firstTokenLatency: 0, 
        tokenEstimate: 0, 
        customerMessage: null, 
        sendTime: Date.now(),
        agentMessageId: `msg-a-${Date.now()}`,
      };
      slowResultRef.current = null;

      const { customerMessage, agentMessageId } = processWithDualChannel(
        currentState,
        message,
        modelConfig,
        {
          fast: {
            onMetadata: (data) => {
              streamRef.current.tokenEstimate = data.tokenEstimate;
            },
            onFirstToken: (latency) => {
              streamRef.current.firstTokenLatency = latency;
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
            onComplete: (data) => {
              const totalLatency = data.latency;
              const fullContent = data.fullContent;

              // 解析快通道返回
              const parsed = parseFastResponse(fullContent, currentState.currentState);
              if (!parsed) {
                // 解析失败，降级
                const { newState } = fallbackToRuleEngine(currentState, message);
                setAgentState({ ...newState, responseSource: 'fallback' });
                setStreamingMessageId(null);
                return;
              }

              streamRef.current.customerMessage = customerMessage;

              // 用函数式更新基于最新 prev 增量构建最终状态，并合并可能已先返回的慢通道结果，
              // 避免慢通道先完成时其槽位/情绪更新被快通道整体覆盖
              setAgentState((prev) => {
                const finalState = buildFinalStateFromFastChannel(
                  prev,
                  customerMessage,
                  parsed.response,
                  parsed,
                  { firstToken: streamRef.current.firstTokenLatency, total: totalLatency, tokenEstimate: streamRef.current.tokenEstimate },
                  modelConfig
                );

                const slow = slowResultRef.current;
                if (slow) {
                  return updateStateWithSlowChannel(finalState, slow, slow.latency ?? 0);
                }
                return finalState;
              });
              setStreamingMessageId(null);
            },
            onError: () => {
              // 快通道失败 → 降级到规则引擎
              const { newState } = fallbackToRuleEngine(currentState, message);
              setAgentState({ ...newState, responseSource: 'fallback' });
              setStreamingMessageId(null);
            },
          },
          slow: {
            onResult: (data) => {
              // 缓存慢通道结果，供快通道 onComplete 合并，避免被整体覆盖
              slowResultRef.current = data;
              // 异步更新调试面板（不阻塞主流程）
              setAgentState((prev) => updateStateWithSlowChannel(prev, data, data.latency ?? 0));
            },
            onError: () => {
              // 慢通道失败不影响主流程
              setAgentState((prev) => ({
                ...prev,
                dualChannel: prev.dualChannel ? { ...prev.dualChannel, slowStatus: 'error' } : null,
              }));
            },
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
  }, [mode, modelConfig]);

  const handleReset = useCallback(() => {
    setAgentState(createInitialState());
    setStreamingMessageId(null);
  }, []);

  const handleModeChange = useCallback((newMode: AgentMode) => {
    setMode(newMode);
  }, []);

  const handleModelConfigChange = useCallback((config: LLMModelConfig) => {
    setModelConfig(config);
    saveModelConfig(config);
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
          <ModeButton 
            active={mode === 'dual'} 
            onClick={() => handleModeChange('dual')}
            icon={<Zap className="h-3 w-3" />}
            label="双通道"
            activeClass="bg-blue-50 text-blue-700 border-blue-200"
          />
          <ModeButton 
            active={mode === 'llm'} 
            onClick={() => handleModeChange('llm')}
            icon={<Cpu className="h-3 w-3" />}
            label="LLM"
            activeClass="bg-emerald-50 text-emerald-700 border-emerald-200"
          />
          <ModeButton 
            active={mode === 'rule'} 
            onClick={() => handleModeChange('rule')}
            icon={<Workflow className="h-3 w-3" />}
            label="规则引擎"
            activeClass="bg-amber-50 text-amber-700 border-amber-200"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            mode === 'dual' && 'bg-blue-500',
            mode === 'llm' && 'bg-emerald-500',
            mode === 'rule' && 'bg-amber-500'
          )} />
          <span>
            {mode === 'dual' ? '双通道驱动中' : mode === 'llm' ? 'LLM 驱动中' : '规则引擎驱动中'}
          </span>
          {agentState.responseSource === 'fallback' && (
            <span className="text-red-500 ml-1">(已降级)</span>
          )}
          {agentState.responseSource === 'cache' && (
            <span className="text-amber-500 ml-1">(缓存命中)</span>
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
              style={{ width: panelWidth, maxWidth: 'min(60vw, 500px)' }}
            >
              <div className="h-full flex flex-col">
                {/* Model Settings */}
                {(mode === 'dual' || mode === 'llm') && (
                  <div className="p-2 border-b border-slate-100">
                    <ModelSettingsPanel 
                      config={modelConfig} 
                      onConfigChange={handleModelConfigChange}
                    />
                  </div>
                )}
                {/* Debug Panel */}
                <div className="flex-1 overflow-hidden">
                  <DebugPanel agentState={agentState} mode={mode} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Mode button component
function ModeButton({ active, onClick, icon, label, activeClass }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
        active
          ? activeClass + ' border'
          : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// 解析快通道返回的 JSON
function parseFastResponse(content: string, currentState: string): { intent: string; next_state: string; response: string } | null {
  try {
    let cleaned = content.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);
    // response 存在即可用；next_state 缺失/非法时回退到当前状态（由 engine 校验兜底）
    if (typeof parsed.response === 'string') {
      return {
        intent: parsed.intent || 'unknown',
        next_state: typeof parsed.next_state === 'string' ? parsed.next_state : currentState,
        response: parsed.response,
      };
    }
  } catch {
    // ignore
  }
  // 如果无法解析 JSON，把整个内容当作回复
  if (content.trim().length > 0) {
    return {
      intent: 'unknown',
      next_state: currentState,
      response: content.trim(),
    };
  }
  return null;
}

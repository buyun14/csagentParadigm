'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/agent/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';
import { Bot, User, Clock } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  isProcessing: boolean;
  /** 当前正在流式接收的消息 ID */
  streamingMessageId?: string | null;
}

export function ChatArea({ messages, isProcessing, streamingMessageId }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    // 定位 Radix ScrollArea 的实际滚动容器
    const viewport = el.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? el.parentElement;
    if (!viewport) return;
    // 仅在用户接近底部时自动跟随，避免流式更新劫持用户翻阅历史消息
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingMessageId]);

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="flex flex-col gap-3 px-4 py-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={msg.id === streamingMessageId}
          />
        ))}
        {isProcessing && !streamingMessageId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <Bot className="h-4 w-4" />
            <span>正在思考...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isAgent = message.role === 'agent';

  return (
    <div
      className={cn(
        'flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200',
        isAgent ? 'flex-row' : 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          isAgent
            ? 'bg-slate-100 text-slate-600'
            : 'bg-blue-500 text-white'
        )}
      >
        {isAgent ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      {/* Message content */}
      <div className={cn('flex flex-col max-w-[75%]', isAgent ? 'items-start' : 'items-end')}>
        <div className={cn('flex items-center gap-1.5 mb-1 px-1', isAgent ? '' : 'flex-row-reverse')}>
          <span className={cn(
            'text-xs',
            isAgent ? 'text-slate-400' : 'text-blue-400'
          )}>
            {isAgent ? '智能坐席' : '客户'}
          </span>
          {/* 延迟显示 */}
          {isAgent && message.latencyMs != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-300 font-mono">
              <Clock className="h-2.5 w-2.5" />
              {message.latencyMs}ms
            </span>
          )}
        </div>
        <div
          className={cn(
            'px-3.5 py-2.5 text-sm leading-relaxed rounded-xl',
            isAgent
              ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
              : 'bg-blue-500 text-white rounded-tr-sm'
          )}
        >
          {message.content}
          {isStreaming && (
            <span className="inline-block w-0.5 h-3.5 bg-blue-500 ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

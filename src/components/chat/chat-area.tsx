'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/agent/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  isProcessing: boolean;
}

export function ChatArea({ messages, isProcessing }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <ScrollArea className="flex-1 px-4 py-3">
      <div className="flex flex-col gap-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isProcessing && (
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

function MessageBubble({ message }: { message: ChatMessage }) {
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
        <span className={cn(
          'text-xs mb-1 px-1',
          isAgent ? 'text-slate-400' : 'text-blue-400'
        )}>
          {isAgent ? '智能坐席' : '客户'}
        </span>
        <div
          className={cn(
            'px-3.5 py-2.5 text-sm leading-relaxed rounded-xl',
            isAgent
              ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
              : 'bg-blue-500 text-white rounded-tr-sm'
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

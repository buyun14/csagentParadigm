'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  /** 是否正在流式生成（显示停止按钮） */
  isStreaming?: boolean;
  /** 停止生成回调 */
  onStop?: () => void;
}

export function ChatInput({ onSend, disabled, isStreaming = false, onStop }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 中文输入法组合输入（拼音/五笔候选）期间按 Enter 是选词，不触发发送
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 px-4 py-3 border-t border-border bg-card"
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入客户消息，按 Enter 发送..."
        aria-label="客户消息输入框"
        disabled={disabled}
        rows={1}
        className={cn(
          'flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm',
          'placeholder:text-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors duration-150'
        )}
      />
      {isStreaming && onStop && (
        <Button
          type="button"
          onClick={onStop}
          size="icon"
          aria-label="停止生成"
          title="停止生成"
          className="h-9 w-9 rounded-lg bg-red-500 hover:bg-red-600 text-white shrink-0"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="submit"
        size="icon"
        disabled={disabled || !input.trim()}
        aria-label="发送消息"
        className="h-9 w-9 rounded-lg bg-blue-500 hover:bg-blue-600 text-white shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}

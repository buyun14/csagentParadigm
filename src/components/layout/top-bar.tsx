'use client';

import { PhoneOff, Clock, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface TopBarProps {
  onReset: () => void;
  turnCount: number;
  isCallEnded: boolean;
}

export function TopBar({ onReset, turnCount, isCallEnded }: TopBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isCallEnded) return;
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isCallEnded]);

  useEffect(() => {
    if (isCallEnded) return;
    setElapsed(0);
  }, [turnCount, isCallEnded]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1f2e] text-white">
      {/* Left: Call info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              isCallEnded ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'
            )}
          />
          <span className="text-sm font-medium">{isCallEnded ? '通话已结束' : '通话中'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-300 text-sm">
          <Hash className="h-3.5 w-3.5" />
          <span>138****9170</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-300 text-sm">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* Center: Title */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-200">汽车营销外呼客服 Agent</span>
        <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs border-0">
          原型演示
        </Badge>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="bg-slate-700/50 text-slate-400 text-xs border-0">
          第 {turnCount} 轮对话
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          aria-label="重置对话"
          className="text-slate-300 hover:text-white hover:bg-slate-700 h-8 text-xs gap-1.5"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          重置对话
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

// 默认模型参数
const DEFAULT_CONFIG = {
  model: 'doubao-seed-2-0-mini-260215',
  temperature: 0.7,
  max_tokens: 150,
  top_p: 0.9,
  stream: true,
  presence_penalty: 0,
  frequency_penalty: 0,
};

// 存储键
const STORAGE_KEY = 'agent_model_config';

// 从 localStorage 加载配置
function loadConfig() {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_CONFIG;
}

// 保存配置到 localStorage
function saveConfig(config: typeof DEFAULT_CONFIG) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function ModelSettingsPanel() {
  const [config, setConfig] = useState(loadConfig);
  const [saved, setSaved] = useState(false);

  // 保存到 localStorage
  useEffect(() => {
    saveConfig(config);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [config]);

  const updateConfig = <K extends keyof typeof DEFAULT_CONFIG>(
    key: K,
    value: typeof DEFAULT_CONFIG[K]
  ) => {
    setConfig((prev: typeof DEFAULT_CONFIG) => ({ ...prev, [key]: value }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-slate-700">模型参数配置</h4>
          {saved && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="h-3 w-3" />
              已保存
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetConfig}
          className="h-6 text-[10px] text-slate-500"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          恢复默认
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Model */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">模型</Label>
          <Input
            value={config.model}
            onChange={(e) => updateConfig('model', e.target.value)}
            className="h-7 text-[11px]"
            placeholder="模型名称"
          />
        </div>

        {/* Temperature */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">
            Temperature: {config.temperature}
          </Label>
          <Slider
            value={[config.temperature]}
            onValueChange={([v]) => updateConfig('temperature', v)}
            min={0}
            max={2}
            step={0.1}
            className="py-1"
          />
        </div>

        {/* Max Tokens */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">Max Tokens</Label>
          <Input
            type="number"
            value={config.max_tokens}
            onChange={(e) => updateConfig('max_tokens', parseInt(e.target.value) || 150)}
            className="h-7 text-[11px]"
            min={50}
            max={2000}
          />
        </div>

        {/* Top P */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">
            Top P: {config.top_p}
          </Label>
          <Slider
            value={[config.top_p]}
            onValueChange={([v]) => updateConfig('top_p', v)}
            min={0}
            max={1}
            step={0.05}
            className="py-1"
          />
        </div>

        {/* Presence Penalty */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">
            Presence Penalty: {config.presence_penalty}
          </Label>
          <Slider
            value={[config.presence_penalty]}
            onValueChange={([v]) => updateConfig('presence_penalty', v)}
            min={-2}
            max={2}
            step={0.1}
            className="py-1"
          />
        </div>

        {/* Frequency Penalty */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">
            Frequency Penalty: {config.frequency_penalty}
          </Label>
          <Slider
            value={[config.frequency_penalty]}
            onValueChange={([v]) => updateConfig('frequency_penalty', v)}
            min={-2}
            max={2}
            step={0.1}
            className="py-1"
          />
        </div>

        {/* Stream */}
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">流式输出</Label>
          <div className="flex items-center h-7">
            <Switch
              checked={config.stream}
              onCheckedChange={(v) => updateConfig('stream', v)}
            />
            <span className={cn(
              'ml-2 text-[10px]',
              config.stream ? 'text-emerald-600' : 'text-slate-400'
            )}>
              {config.stream ? '开启' : '关闭'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 导出获取配置的函数（供其他组件使用）
export function getModelConfig() {
  return loadConfig();
}

'use client';

import { useState, useEffect } from 'react';
import { Settings, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import type { LLMModelConfig } from '@/lib/agent/types';
import { getDefaultModelConfig, saveModelConfig } from '@/lib/agent/engine';
import { cn } from '@/lib/utils';

interface ModelSettingsPanelProps {
  config: LLMModelConfig;
  onConfigChange: (config: LLMModelConfig) => void;
  className?: string;
}

export function ModelSettingsPanel({ config, onConfigChange, className }: ModelSettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localConfig, setLocalConfig] = useState<LLMModelConfig>(config);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleChange = (key: keyof LLMModelConfig, value: number | string | boolean | undefined) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
    saveModelConfig(newConfig);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const handleReset = () => {
    const defaultConfig = getDefaultModelConfig();
    setLocalConfig(defaultConfig);
    onConfigChange(defaultConfig);
    saveModelConfig(defaultConfig);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  return (
    <div className={cn('border border-slate-200 rounded-lg bg-white', className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">模型设置</span>
          {showSaved && (
            <span className="text-xs text-green-600 animate-pulse">已更新</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100">
          {/* Model */}
          <div className="pt-3">
            <label className="block text-xs text-slate-500 mb-1">模型名称</label>
            <input
              type="text"
              value={localConfig.model || ''}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="doubao-seed-2-0-mini-260215"
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Temperature */}
          <SliderInput
            label="Temperature"
            value={localConfig.temperature ?? 0.7}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => handleChange('temperature', v)}
          />

          {/* Top P */}
          <SliderInput
            label="Top P"
            value={localConfig.top_p ?? 0.9}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => handleChange('top_p', v)}
          />

          {/* Max Tokens */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Max Tokens
            </label>
            <input
              type="number"
              value={localConfig.max_tokens ?? 150}
              onChange={(e) => handleChange('max_tokens', parseInt(e.target.value) || undefined)}
              min={50}
              max={4096}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Presence Penalty */}
          <SliderInput
            label="Presence Penalty"
            value={localConfig.presence_penalty ?? 0}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => handleChange('presence_penalty', v)}
          />

          {/* Frequency Penalty */}
          <SliderInput
            label="Frequency Penalty"
            value={localConfig.frequency_penalty ?? 0}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => handleChange('frequency_penalty', v)}
          />

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            恢复默认
          </button>
        </div>
      )}
    </div>
  );
}

// Slider input component
function SliderInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-slate-500">{label}</label>
        <span className="text-xs text-slate-700 font-mono">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );
}

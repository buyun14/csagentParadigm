'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentState, MainDialogState, ExceptionState, CollectedSlots, AgentMode, ResponseSource } from '@/lib/agent/types';
import { stateLabels, exceptionLabels } from '@/lib/agent/engine';
import {
  Brain,
  Eye,
  Database,
  Route,
  Zap,
  Shield,
  MessageSquare,
  Cpu,
  Timer,
  Code,
  ChevronDown,
  ChevronRight,
  Gauge,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// 意图标签
const intentLabels: Record<string, string> = {
  greet: '问候',
  confirm_brand: '确认品牌',
  confirm_model: '确认车型',
  confirm_city: '确认城市',
  confirm_time: '确认时间',
  confirm_surname: '确认姓氏',
  ask_vehicle: '询问车辆',
  filter_vehicle: '筛选车辆',
  agree: '同意/肯定',
  disagree: '否定/不同意',
  unclear: '不清晰',
  off_track: '偏离话题',
  abuse: '辱骂',
  dislike: '反感',
  out_of_scope: '超范围',
  farewell: '告别',
  ask_recommend: '请求推荐',
  wait: '等待',
  unknown: '未知',
  provide_brand: '提供品牌',
  provide_model: '提供车型',
  provide_city: '提供城市',
  provide_time: '提供时间',
  provide_surname: '提供姓氏',
  ask_price: '询问价格',
};

// 情绪标签
const emotionLabels: Record<string, string> = {
  neutral: '平静',
  positive: '积极',
  negative: '消极',
  angry: '愤怒',
  interested: '感兴趣',
  annoyed: '烦躁',
};

// 实体标签
const entityLabels: Record<string, string> = {
  brand: '品牌',
  series: '车系',
  model: '车型',
  city: '城市',
  timing: '时间',
  surname: '姓氏',
  phoneTail: '手机尾号',
  vehicleType: '车身类型',
  powerType: '动力类型',
};

// 回复来源标签和颜色
const sourceLabels: Record<ResponseSource, { label: string; color: string; bgColor: string }> = {
  llm: { label: 'LLM', color: 'text-emerald-600', bgColor: 'bg-emerald-500' },
  fast: { label: '快通道', color: 'text-blue-600', bgColor: 'bg-blue-500' },
  slow: { label: '慢通道', color: 'text-violet-600', bgColor: 'bg-violet-500' },
  cache: { label: '缓存', color: 'text-amber-600', bgColor: 'bg-amber-500' },
  rule: { label: '规则', color: 'text-slate-600', bgColor: 'bg-slate-500' },
  fallback: { label: '降级', color: 'text-red-600', bgColor: 'bg-red-500' },
};

interface DebugPanelProps {
  agentState: AgentState;
  mode: AgentMode;
}

// 状态机流程顺序
const stateFlow: MainDialogState[] = [
  'GREETING',
  'BRAND_INQUIRY',
  'MODEL_INQUIRY',
  'CITY_INQUIRY',
  'TIMING_INQUIRY',
  'CONTACT_COLLECTION',
  'FAREWELL',
];

// 状态 ↔ 收集目标槽位映射。
// LLM 客服可能灵活收集信息（跳着问/一次给多项），因此进度条必须由"槽位是否已收集"驱动，
// 而不是由 currentState 在 stateFlow 中的索引推断——否则会出现"状态已跳到时间但城市未收集也点亮"的假进度。
const stateSlotMap: Partial<Record<MainDialogState, keyof CollectedSlots>> = {
  BRAND_INQUIRY: 'brand',
  MODEL_INQUIRY: 'series',
  CITY_INQUIRY: 'city',
  TIMING_INQUIRY: 'timing',
  CONTACT_COLLECTION: 'surname',
};

// 可折叠Section组件
function Section({ 
  icon, 
  title, 
  children, 
  defaultOpen = true,
  badge 
}: { 
  icon: React.ReactNode; 
  title: string; 
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-slate-700 w-full hover:text-slate-900 transition-colors group"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
        )}
        {icon}
        <span className="text-xs font-medium flex-1 text-left">{title}</span>
        {badge}
      </button>
      {isOpen && (
        <div className="pl-4 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function DebugPanel({ agentState, mode }: DebugPanelProps) {
  const { 
    currentState, 
    exceptionState, 
    collectedSlots, 
    lastDecision, 
    turnCount, 
    responseSource, 
    latencyMetrics, 
    llmRawResponse,
    dualChannel,
    currentModelConfig,
    promptTokenEstimate,
  } = agentState;

  const sourceInfo = sourceLabels[responseSource];
  const isLLMMode = mode === 'llm' || mode === 'dual';

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">Agent 调试</h3>
          </div>
          {/* Source indicator */}
          <div className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', sourceInfo.bgColor)} />
            <span className={cn('text-[10px] font-medium', sourceInfo.color)}>
              {sourceInfo.label}
            </span>
          </div>
        </div>

        {/* Dual Channel Status */}
        {mode === 'dual' && dualChannel && (
          <div className="p-2 rounded-md bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Layers className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-semibold text-blue-700">双通道</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ChannelStatus 
                label="快通道" 
                status={dualChannel.fastStatus}
                latency={dualChannel.fastLatency ? `${dualChannel.fastLatency.firstToken}ms / ${dualChannel.fastLatency.total}ms` : null}
              />
              <ChannelStatus 
                label="慢通道" 
                status={dualChannel.slowStatus}
                latency={dualChannel.slowLatency ? `${dualChannel.slowLatency}ms` : null}
              />
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {isLLMMode && latencyMetrics && (
          <div className="p-2 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Timer className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-semibold text-blue-700">性能指标</span>
              {promptTokenEstimate !== null && promptTokenEstimate > 0 && (
                <span className="text-[9px] text-blue-500 ml-auto">~{promptTokenEstimate} tokens</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              <LatencyItem label="首字" value={latencyMetrics.firstToken} color="emerald" />
              <LatencyItem label="总耗时" value={latencyMetrics.total} color="blue" />
              <LatencyItem label="LLM" value={latencyMetrics.llmCall} color="violet" />
              <LatencyItem label="Prompt" value={latencyMetrics.promptBuild} color="slate" />
              <LatencyItem label="解析" value={latencyMetrics.parse} color="slate" />
              <LatencyItem label="生成" value={latencyMetrics.generation} color="violet" />
            </div>
          </div>
        )}

        {/* Model Config Overview */}
        {isLLMMode && currentModelConfig && (
          <Section 
            icon={<Gauge className="h-3.5 w-3.5" />} 
            title="模型配置"
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-1">
              <InfoRow label="Temperature" value={currentModelConfig.temperature?.toFixed(1) ?? '0.7'} />
              <InfoRow label="Top P" value={currentModelConfig.top_p?.toFixed(1) ?? '0.9'} />
              <InfoRow label="Max Tokens" value={currentModelConfig.max_tokens?.toString() ?? '150'} />
              <InfoRow label="Model" value={currentModelConfig.model || 'default'} />
            </div>
          </Section>
        )}

        {/* State Machine */}
        <Section icon={<Route className="h-3.5 w-3.5" />} title="状态机">
          <div className="space-y-0.5">
            {stateFlow.map((state) => {
              const slotKey = stateSlotMap[state];
              const slotValue = slotKey ? collectedSlots[slotKey] : null;
              // 该状态是否为当前追问阶段（currentState 由 LLM/规则引擎给出，与槽位无关）
              const isActive = state === currentState;
              // 完成判定由"对应槽位是否已收集"驱动（GREETING/FAREWELL 无槽位，用对话进程判定）
              const isDone = slotKey
                ? Boolean(slotValue)
                : state === 'GREETING'
                  ? turnCount > 0
                  : state === 'FAREWELL'
                    ? currentState === 'FAREWELL'
                    : false;
              return (
                <div key={state} className="flex items-center gap-2 py-0.5">
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-300',
                      isDone && 'bg-emerald-500',
                      !isDone && isActive && 'bg-blue-500 ring-2 ring-blue-500/30 scale-125',
                      !isDone && !isActive && 'bg-slate-300'
                    )}
                  />
                  <span
                    className={cn(
                      'text-[11px] transition-colors duration-200',
                      isActive && 'text-blue-600 font-medium',
                      !isActive && isDone && 'text-emerald-600',
                      !isActive && !isDone && 'text-slate-400'
                    )}
                  >
                    {stateLabels[state]}
                  </span>
                  {slotKey && (
                    <span
                      className={cn(
                        'text-[9px] truncate max-w-[72px]',
                        slotValue ? 'text-emerald-500' : 'text-slate-300'
                      )}
                      title={`${stateLabels[state]}: ${slotValue || '未收集'}`}
                    >
                      {slotValue || '-'}
                    </span>
                  )}
                  {isActive && (
                    <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[9px] h-3.5 px-1 ml-auto">
                      当前
                    </Badge>
                  )}
                  {isActive && isDone && (
                    <Badge
                      variant="outline"
                      className="text-amber-500 border-amber-200 text-[9px] h-3.5 px-1 ml-1"
                      title="当前状态对应的信息已收集，但状态机未随之推进（LLM 灵活收集的预期表现）"
                    >
                      状态滞后
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Exception State */}
        {exceptionState !== 'NONE' && (
          <Section 
            icon={<Shield className="h-3.5 w-3.5 text-amber-500" />} 
            title="护栏"
            badge={
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] h-3.5',
                  exceptionState === 'ABUSE' && 'border-red-200 text-red-600 bg-red-50',
                  exceptionState === 'OFF_TRACK' && 'border-amber-200 text-amber-600 bg-amber-50',
                  exceptionState === 'OUT_OF_SCOPE' && 'border-orange-200 text-orange-600 bg-orange-50',
                  exceptionState === 'UNCLEAR' && 'border-slate-200 text-slate-600 bg-slate-50'
                )}
              >
                {exceptionLabels[exceptionState]}
              </Badge>
            }
          >
            <div className="text-[10px] text-slate-500">
              已触发护栏机制
            </div>
          </Section>
        )}

        <Separator />

        {/* Collected Slots */}
        <Section icon={<Database className="h-3.5 w-3.5" />} title="已收集信息">
          <SlotGrid slots={collectedSlots} />
        </Section>

        <Separator />

        {/* Last Decision */}
        {lastDecision && (
          <>
            <Section 
              icon={<Eye className="h-3.5 w-3.5" />} 
              title="感知"
              defaultOpen={true}
              badge={
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-3.5',
                    lastDecision.perception.emotion === 'angry' && 'border-red-200 text-red-600',
                    lastDecision.perception.emotion === 'negative' && 'border-amber-200 text-amber-600',
                    lastDecision.perception.emotion === 'positive' && 'border-emerald-200 text-emerald-600',
                    lastDecision.perception.emotion === 'neutral' && 'border-slate-200 text-slate-500'
                  )}
                >
                  {emotionLabels[lastDecision.perception.emotion] || lastDecision.perception.emotion}
                </Badge>
              }
            >
              <div className="space-y-1.5">
                <InfoRow label="意图" value={intentLabels[lastDecision.perception.intent] || lastDecision.perception.intent} />
                {Object.keys(lastDecision.perception.entities).length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider">实体</span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {Object.entries(lastDecision.perception.entities).map(([key, val]) => (
                        <Badge key={key} variant="secondary" className="text-[9px] h-3.5 px-1 bg-slate-100 text-slate-600">
                          {entityLabels[key] || key}: {val}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            <Section 
              icon={<Zap className="h-3.5 w-3.5" />} 
              title="规划"
              defaultOpen={true}
            >
              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-600 bg-slate-50 rounded p-1.5 leading-relaxed">
                  {lastDecision.planning.reasoning}
                </div>
                <InfoRow label="动作" value={lastDecision.planning.action} />
                <InfoRow label="下一状态" value={stateLabels[lastDecision.planning.nextState]} />
              </div>
            </Section>

            <Section 
              icon={<MessageSquare className="h-3.5 w-3.5" />} 
              title="输出"
              defaultOpen={true}
            >
              <div className="text-[11px] text-slate-600 bg-blue-50 rounded p-1.5 leading-relaxed border border-blue-100">
                {lastDecision.output}
              </div>
            </Section>

            {/* LLM Raw Response */}
            {llmRawResponse && isLLMMode && (
              <Section 
                icon={<Code className="h-3.5 w-3.5" />} 
                title="LLM 原始返回"
                defaultOpen={false}
              >
                <pre className="text-[9px] text-slate-500 bg-slate-50 rounded p-1.5 overflow-x-auto border border-slate-100 leading-relaxed max-h-[150px] overflow-y-auto">
                  {llmRawResponse}
                </pre>
              </Section>
            )}
          </>
        )}

        {/* Stats */}
        <Separator />
        <div className="grid grid-cols-3 gap-1.5">
          <StatCard label="轮次" value={turnCount.toString()} />
          <StatCard label="消息" value={agentState.messages.length.toString()} />
          <StatCard label="首字" value={latencyMetrics ? `${latencyMetrics.firstToken}ms` : '-'} />
        </div>
      </div>
    </ScrollArea>
  );
}

// 通道状态组件
function ChannelStatus({ label, status, latency }: { label: string; status: string; latency: string | null }) {
  const statusColors: Record<string, string> = {
    pending: 'text-amber-500',
    done: 'text-emerald-500',
    timeout: 'text-red-500',
    error: 'text-red-500',
  };
  const statusLabels: Record<string, string> = {
    pending: '等待中',
    done: '完成',
    timeout: '超时',
    error: '错误',
  };

  return (
    <div className="bg-white/50 rounded p-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-500">{label}</span>
        <span className={cn('text-[9px] font-medium', statusColors[status] || 'text-slate-400')}>
          {statusLabels[status] || status}
        </span>
      </div>
      {latency && (
        <div className="text-[9px] text-slate-400 mt-0.5 font-mono">{latency}</div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-[11px] text-slate-700">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded p-1.5 text-center border border-slate-100">
      <div className="text-xs font-bold text-slate-800 font-mono">{value}</div>
      <div className="text-[9px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function LatencyItem({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    violet: 'text-violet-600',
    slate: 'text-slate-500',
  };
  
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-slate-400">{label}</span>
      <span className={cn('text-[10px] font-mono font-medium', colorClasses[color] || 'text-slate-500')}>
        {value}ms
      </span>
    </div>
  );
}

function SlotGrid({ slots }: { slots: CollectedSlots }) {
  // 收集目标仅 5 项：品牌/车系/城市/时间/姓氏（手机尾号不收集，不参与进度计数；
  // 若客户主动报尾号，仍可在"感知-实体"区查看）
  const slotItems = [
    { key: 'brand', label: '品牌', value: slots.brand },
    { key: 'series', label: '车系', value: slots.series },
    { key: 'city', label: '城市', value: slots.city },
    { key: 'timing', label: '时间', value: slots.timing },
    { key: 'surname', label: '姓氏', value: slots.surname },
  ];

  const filledCount = slotItems.filter(item => item.value).length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-400">
          {filledCount}/5 已收集
        </span>
        <div className="flex gap-0.5">
          {slotItems.map((item) => (
            <div
              key={item.key}
              className={cn(
                'w-2 h-2 rounded-sm transition-colors',
                item.value ? 'bg-emerald-500' : 'bg-slate-200'
              )}
              title={`${item.label}: ${item.value || '未收集'}`}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {slotItems.map((item) => (
          <div
            key={item.key}
            className={cn(
              'flex items-center justify-between px-1.5 py-1 rounded text-[10px]',
              item.value
                ? 'bg-emerald-50 border border-emerald-100'
                : 'bg-slate-50 border border-slate-100'
            )}
          >
            <span className={cn(
              'font-medium',
              item.value ? 'text-emerald-600' : 'text-slate-400'
            )}>
              {item.label}
            </span>
            <span className={cn(
              'truncate max-w-[60px]',
              item.value ? 'text-emerald-700' : 'text-slate-300'
            )}>
              {item.value || '-'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

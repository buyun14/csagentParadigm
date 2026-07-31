'use client';

import { cn } from '@/lib/utils';
import type { AgentState, MainDialogState, ExceptionState, CollectedSlots, AgentMode } from '@/lib/agent/types';
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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

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

export function DebugPanel({ agentState, mode }: DebugPanelProps) {
  const { currentState, exceptionState, collectedSlots, lastDecision, turnCount, responseSource, latencyMetrics, llmRawResponse } = agentState;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">Agent 调试面板</h3>
          </div>
          {/* Mode indicator */}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-2 h-2 rounded-full',
              responseSource === 'llm' && 'bg-emerald-500',
              responseSource === 'rule' && 'bg-amber-500',
              responseSource === 'fallback' && 'bg-red-500'
            )} />
            <span className={cn(
              'text-[10px] font-medium',
              responseSource === 'llm' && 'text-emerald-600',
              responseSource === 'rule' && 'text-amber-600',
              responseSource === 'fallback' && 'text-red-600'
            )}>
              {responseSource === 'llm' ? 'LLM' : responseSource === 'rule' ? '规则引擎' : '已降级'}
            </span>
          </div>
        </div>

        {/* LLM Info & Latency Metrics */}
        {mode === 'llm' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 rounded-md bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-slate-400" />
                <span className="text-[10px] text-slate-500">
                  {mode === 'llm' ? 'LLM 模式' : '规则引擎模式'}
                </span>
              </div>
              {responseSource === 'fallback' && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-200 text-red-500">
                  降级
                </Badge>
              )}
            </div>
            {/* Detailed Latency Metrics */}
            {latencyMetrics && (
              <div className="p-2 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <Timer className="h-3 w-3 text-blue-500" />
                  <span className="text-[10px] font-semibold text-blue-700">性能指标</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <LatencyItem label="首字延迟" value={latencyMetrics.firstToken} color="emerald" />
                  <LatencyItem label="系统总耗时" value={latencyMetrics.total} color="blue" />
                  <LatencyItem label="Prompt构建" value={latencyMetrics.promptBuild} color="slate" />
                  <LatencyItem label="LLM调用" value={latencyMetrics.llmCall} color="violet" />
                  <LatencyItem label="JSON解析" value={latencyMetrics.parse} color="slate" />
                  <LatencyItem label="生成耗时" value={latencyMetrics.generation} color="violet" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* State Machine */}
        <Section icon={<Route className="h-3.5 w-3.5" />} title="对话状态机">
          <div className="space-y-1">
            {stateFlow.map((state, index) => {
              const isActive = state === currentState;
              const isPast = stateFlow.indexOf(currentState) > index;
              return (
                <div key={state} className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300',
                      isActive && 'bg-blue-500 ring-2 ring-blue-500/30 scale-125',
                      isPast && 'bg-emerald-500',
                      !isActive && !isPast && 'bg-slate-300'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs transition-colors duration-200',
                      isActive && 'text-blue-600 font-medium',
                      isPast && 'text-emerald-600',
                      !isActive && !isPast && 'text-slate-400'
                    )}
                  >
                    {stateLabels[state]}
                  </span>
                  {isActive && (
                    <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] h-4 px-1.5 ml-auto">
                      当前
                    </Badge>
                  )}
                  {isPast && (
                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] h-4 px-1.5 ml-auto">
                      已完成
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Exception State */}
        {exceptionState !== 'NONE' && (
          <Section icon={<Shield className="h-3.5 w-3.5 text-amber-500" />} title="护栏状态">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  exceptionState === 'ABUSE' && 'border-red-200 text-red-600 bg-red-50',
                  exceptionState === 'OFF_TRACK' && 'border-amber-200 text-amber-600 bg-amber-50',
                  exceptionState === 'OUT_OF_SCOPE' && 'border-orange-200 text-orange-600 bg-orange-50',
                  exceptionState === 'UNCLEAR' && 'border-slate-200 text-slate-600 bg-slate-50'
                )}
              >
                {exceptionLabels[exceptionState]}
              </Badge>
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
            <Section icon={<Eye className="h-3.5 w-3.5" />} title="感知 Perception">
              <div className="space-y-2">
                <InfoRow label="意图" value={intentLabels[lastDecision.perception.intent] || lastDecision.perception.intent} />
                <InfoRow
                  label="情绪"
                  value={
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] h-4',
                        lastDecision.perception.emotion === 'angry' && 'border-red-200 text-red-600',
                        lastDecision.perception.emotion === 'negative' && 'border-amber-200 text-amber-600',
                        lastDecision.perception.emotion === 'positive' && 'border-emerald-200 text-emerald-600',
                        lastDecision.perception.emotion === 'neutral' && 'border-slate-200 text-slate-500'
                      )}
                    >
                      {emotionLabels[lastDecision.perception.emotion]}
                    </Badge>
                  }
                />
                {Object.keys(lastDecision.perception.entities).length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">实体</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(lastDecision.perception.entities).map(([key, val]) => (
                        <Badge key={key} variant="secondary" className="text-[10px] h-4 px-1.5 bg-slate-100 text-slate-600">
                          {entityLabels[key] || key}: {val}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            <Section icon={<Zap className="h-3.5 w-3.5" />} title="规划 Planning">
              <div className="space-y-2">
                <div className="text-xs text-slate-600 bg-slate-50 rounded-md p-2 leading-relaxed">
                  {lastDecision.planning.reasoning}
                </div>
                <InfoRow label="动作" value={lastDecision.planning.action} />
                <InfoRow
                  label="下一状态"
                  value={stateLabels[lastDecision.planning.nextState]}
                />
              </div>
            </Section>

            <Section icon={<MessageSquare className="h-3.5 w-3.5" />} title="输出 Output">
              <div className="text-xs text-slate-600 bg-blue-50 rounded-md p-2 leading-relaxed border border-blue-100">
                {lastDecision.output}
              </div>
            </Section>

            {/* LLM Raw Response */}
            {llmRawResponse && mode === 'llm' && (
              <>
                <Separator />
                <Section icon={<Code className="h-3.5 w-3.5" />} title="LLM 原始返回">
                  <pre className="text-[10px] text-slate-500 bg-slate-50 rounded-md p-2 overflow-x-auto border border-slate-100 leading-relaxed max-h-[200px] overflow-y-auto">
                    {llmRawResponse}
                  </pre>
                </Section>
              </>
            )}
          </>
        )}

        {/* Stats */}
        <Separator />
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="对话轮次" value={turnCount.toString()} />
          <StatCard label="消息总数" value={agentState.messages.length.toString()} />
          <StatCard
            label="首字延迟"
            value={latencyMetrics ? `${latencyMetrics.firstToken}ms` : '-'}
          />
        </div>
      </div>
    </ScrollArea>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-slate-700">
        {icon}
        <span className="text-xs font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-slate-700">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
      <div className="text-sm font-bold text-slate-800 font-mono">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function SlotGrid({ slots }: { slots: CollectedSlots }) {
  const slotItems = [
    { key: 'brand', label: '品牌', value: slots.brand },
    { key: 'series', label: '车系', value: slots.series },
    { key: 'city', label: '城市', value: slots.city },
    { key: 'timing', label: '时间', value: slots.timing },
    { key: 'surname', label: '姓氏', value: slots.surname },
    { key: 'phoneTail', label: '手机尾号', value: slots.phoneTail },
    { key: 'vehicleType', label: '车身类型', value: slots.vehicleType },
    { key: 'powerType', label: '动力类型', value: slots.powerType },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {slotItems.map((item) => (
        <div
          key={item.key}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all duration-200',
            item.value
              ? 'bg-emerald-50 border border-emerald-200'
              : 'bg-slate-50 border border-slate-100'
          )}
        >
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              item.value ? 'bg-emerald-500' : 'bg-slate-300'
            )}
          />
          <span className={cn(
            'text-[10px]',
            item.value ? 'text-emerald-700 font-medium' : 'text-slate-400'
          )}>
            {item.label}
          </span>
          {item.value && (
            <span className="text-[10px] text-emerald-600 ml-auto truncate max-w-[60px]">
              {item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// 意图标签映射
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
};

// 实体标签
const entityLabels: Record<string, string> = {
  brand: '品牌',
  series: '车系',
  city: '城市',
  timing: '时间',
  surname: '姓氏',
  phoneTail: '手机尾号',
  vehicleType: '车身类型',
  powerType: '动力类型',
};

// 延迟指标项组件
function LatencyItem({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, { text: string; bg: string }> = {
    emerald: { text: 'text-emerald-700', bg: 'bg-emerald-100' },
    blue: { text: 'text-blue-700', bg: 'bg-blue-100' },
    violet: { text: 'text-violet-700', bg: 'bg-violet-100' },
    slate: { text: 'text-slate-600', bg: 'bg-slate-100' },
  };
  const cls = colorClasses[color] || colorClasses.slate;
  
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={cn('text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded', cls.text, cls.bg)}>
        {value}ms
      </span>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentState, MainDialogState, ExceptionState, CollectedSlots, AgentMode, PromptLogEntry } from '@/lib/agent/types';
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
  FileText,
  Copy,
  Check,
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
  annoyed: '不耐烦',
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
    promptLogs,
    slowChannelStatus,
    slowChannelResult,
  } = agentState;

  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">Agent 调试</h3>
          </div>
          {/* Mode indicator */}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-2 h-2 rounded-full',
              responseSource === 'llm' && 'bg-emerald-500',
              responseSource === 'rule' && 'bg-amber-500',
              responseSource === 'fallback' && 'bg-red-500',
              responseSource === 'cache' && 'bg-purple-500'
            )} />
            <span className={cn(
              'text-[10px] font-medium',
              responseSource === 'llm' && 'text-emerald-600',
              responseSource === 'rule' && 'text-amber-600',
              responseSource === 'fallback' && 'text-red-600',
              responseSource === 'cache' && 'text-purple-600'
            )}>
              {responseSource === 'llm' ? 'LLM' : responseSource === 'rule' ? '规则' : responseSource === 'cache' ? '缓存' : '降级'}
            </span>
          </div>
        </div>

        {/* Performance Metrics - Always visible, compact */}
        {(mode === 'llm' || mode === 'dual') && latencyMetrics && (
          <div className="p-2 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Timer className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-semibold text-blue-700">性能指标</span>
              {mode === 'dual' && slowChannelStatus && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-[8px] h-3 ml-auto',
                    slowChannelStatus === 'pending' && 'border-blue-200 text-blue-600',
                    slowChannelStatus === 'done' && 'border-emerald-200 text-emerald-600',
                    slowChannelStatus === 'timeout' && 'border-red-200 text-red-600'
                  )}
                >
                  慢通道: {slowChannelStatus === 'pending' ? '分析中' : slowChannelStatus === 'done' ? '完成' : '超时'}
                </Badge>
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

        {/* Slow Channel Result */}
        {mode === 'dual' && slowChannelStatus === 'done' && slowChannelResult && (
          <Section 
            icon={<Eye className="h-3.5 w-3.5 text-violet-500" />} 
            title="慢通道分析"
            defaultOpen={true}
          >
            <div className="space-y-1.5">
              <InfoRow label="情绪" value={emotionLabels[slowChannelResult.emotion] || slowChannelResult.emotion} />
              <div className="text-[10px] text-slate-600 bg-violet-50 rounded p-1.5 leading-relaxed border border-violet-100">
                <span className="text-[9px] text-violet-400 uppercase tracking-wider">推理</span>
                <div className="mt-0.5">{slowChannelResult.reasoning}</div>
              </div>
              {Object.keys(slowChannelResult.entities).length > 0 && (
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider">实体</span>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {Object.entries(slowChannelResult.entities).map(([key, val]) => (
                      <Badge key={key} variant="secondary" className="text-[9px] h-3.5 px-1 bg-violet-100 text-violet-600">
                        {key}: {val}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* State Machine */}
        <Section icon={<Route className="h-3.5 w-3.5" />} title="状态机">
          <div className="space-y-0.5">
            {stateFlow.map((state, index) => {
              const isActive = state === currentState;
              const isPast = stateFlow.indexOf(currentState) > index;
              return (
                <div key={state} className="flex items-center gap-2 py-0.5">
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-300',
                      isActive && 'bg-blue-500 ring-2 ring-blue-500/30 scale-125',
                      isPast && 'bg-emerald-500',
                      !isActive && !isPast && 'bg-slate-300'
                    )}
                  />
                  <span
                    className={cn(
                      'text-[11px] transition-colors duration-200',
                      isActive && 'text-blue-600 font-medium',
                      isPast && 'text-emerald-600',
                      !isActive && !isPast && 'text-slate-400'
                    )}
                  >
                    {stateLabels[state]}
                  </span>
                  {isActive && (
                    <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[9px] h-3.5 px-1 ml-auto">
                      当前
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Exception State - Only show when active */}
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

        {/* Last Decision - Collapsible sections */}
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
                  {emotionLabels[lastDecision.perception.emotion]}
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

            {/* LLM Raw Response - Collapsed by default */}
            {llmRawResponse && (mode === 'llm' || mode === 'dual') && (
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

        {/* Prompt Logs Section */}
        {promptLogs.length > 0 && (
          <>
            <Separator />
            <Section 
              icon={<FileText className="h-3.5 w-3.5" />} 
              title="提示词日志"
              defaultOpen={false}
              badge={
                <Badge variant="secondary" className="text-[9px] h-3.5 bg-slate-100">
                  {promptLogs.length}
                </Badge>
              }
            >
              <PromptLogList 
                logs={promptLogs} 
                selectedIndex={selectedLogIndex}
                onSelect={setSelectedLogIndex}
              />
            </Section>
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

function PromptLogList({ 
  logs, 
  selectedIndex,
  onSelect 
}: { 
  logs: PromptLogEntry[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-2">
      {/* Log list */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {logs.map((log, index) => (
          <button
            key={log.turn_id}
            onClick={() => onSelect(selectedIndex === index ? null : index)}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors',
              selectedIndex === index 
                ? 'bg-blue-50 border border-blue-200' 
                : 'bg-slate-50 border border-slate-100 hover:bg-slate-100'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-slate-500">#{index + 1}</span>
              <div className="flex items-center gap-1">
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-[8px] h-3',
                    log.mode === 'fast' && 'border-blue-200 text-blue-600',
                    log.mode === 'slow' && 'border-violet-200 text-violet-600',
                    log.mode === 'rule_engine' && 'border-amber-200 text-amber-600',
                    log.mode === 'cache' && 'border-purple-200 text-purple-600'
                  )}
                >
                  {log.mode === 'fast' ? '快' : log.mode === 'slow' ? '慢' : log.mode === 'cache' ? '缓存' : '规则'}
                </Badge>
                <span className="text-[9px] text-slate-400">{log.latency.total_ms}ms</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Selected log detail */}
      {selectedIndex !== null && logs[selectedIndex] && (
        <div className="space-y-2 border-t border-slate-200 pt-2">
          {(() => {
            const log = logs[selectedIndex];
            return (
              <>
                {/* System Prompt */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider">System Prompt</span>
                    <button
                      onClick={() => handleCopy(log.prompt.system_prompt, `sys-${selectedIndex}`)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {copiedId === `sys-${selectedIndex}` ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <pre className="text-[9px] text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto border border-slate-100 leading-relaxed max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                    {log.prompt.system_prompt || '(无)'}
                  </pre>
                </div>

                {/* User Message */}
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider">User Message</span>
                  <pre className="text-[9px] text-slate-600 bg-blue-50 rounded p-2 overflow-x-auto border border-blue-100 leading-relaxed">
                    {log.prompt.user_message}
                  </pre>
                </div>

                {/* Raw Output */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider">Raw Output</span>
                    <button
                      onClick={() => handleCopy(log.raw_output, `out-${selectedIndex}`)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {copiedId === `out-${selectedIndex}` ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <pre className="text-[9px] text-slate-600 bg-emerald-50 rounded p-2 overflow-x-auto border border-emerald-100 leading-relaxed max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                    {log.raw_output || '(无)'}
                  </pre>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-1 text-[9px]">
                  <InfoRow label="Model" value={log.prompt.metadata.model} />
                  <InfoRow label="Temp" value={log.prompt.metadata.temperature.toString()} />
                  <InfoRow label="Tokens" value={log.prompt.metadata.token_estimate.toString()} />
                  <InfoRow label="首字" value={`${log.latency.first_token_ms}ms`} />
                </div>
              </>
            );
          })()}
        </div>
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
  const slotItems = [
    { key: 'brand', label: '品牌', value: slots.brand },
    { key: 'series', label: '车系', value: slots.series },
    { key: 'city', label: '城市', value: slots.city },
    { key: 'timing', label: '时间', value: slots.timing },
    { key: 'surname', label: '姓氏', value: slots.surname },
    { key: 'phoneTail', label: '手机尾号', value: slots.phoneTail },
  ];

  const filledCount = slotItems.filter(item => item.value).length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-400">
          {filledCount}/6 已收集
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

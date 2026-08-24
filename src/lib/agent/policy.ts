/**
 * 场景需求口径 — 唯一政策源
 *
 * 使命：外呼线索初筛（收齐五项 → 口头授权交 4S）。
 * 不是导购、不是报价、不是闲聊陪聊。
 *
 * 状态机 / Prompt / 意图入槽 / 软匹配 必须消费本模块，禁止各写一套规则。
 */

import type { CollectedSlots, IntentType, MainDialogState } from './types';
import { getBrandSeries, resolveBrand, resolveBrandFromSeries } from './knowledge-base';

/** 五项采集契约（闭环只看这些） */
export const COLLECTION_FIELDS = ['brand', 'series', 'city', 'timing', 'surname'] as const;
export type CollectionField = (typeof COLLECTION_FIELDS)[number];

/** 被动兼容字段：可回填，不得驱动提问与闭环 */
export const PASSIVE_FIELDS = ['phoneTail', 'vehicleType', 'powerType', 'model'] as const;

export const MISSION =
  '外呼线索初筛：不报精准落地价，尽快收齐品牌/车系/购车城市/购车时间/姓氏并口头授权交4S；不是导购、不是报价、不是闲聊。';

/** 购车时间受控枚举（含犹豫标记） */
export const TIMING_ENUM = [
  '近期',
  '半个月后',
  '本月',
  '下个月',
  '今年',
  '明年',
  '不着急',
  '已看车',
  '看价格',
] as const;
export type TimingValue = (typeof TIMING_ENUM)[number];

const TIMING_ALIASES: Array<{ pattern: RegExp; value: TimingValue }> = [
  { pattern: /半个多?月|两周|十几天/, value: '半个月后' },
  { pattern: /已经看过|已看过|看过车|看过了|已经去看过|已看车/, value: '已看车' },
  { pattern: /看价格|看价钱|价格合适再|等价格|看价格再说/, value: '看价格' },
  { pattern: /下个月|下月/, value: '下个月' },
  { pattern: /这个月|本月/, value: '本月' },
  { pattern: /最近|这几天|这周|本周|快了|马上|尽快|近期/, value: '近期' },
  { pattern: /还早|不着急|慢慢看|先看看/, value: '不着急' },
  { pattern: /明年/, value: '明年' },
  { pattern: /今年/, value: '今年' },
  { pattern: /年底|过年|春节前|年前/, value: '近期' },
];

export function normalizeTiming(raw: string | null | undefined): TimingValue | null {
  if (!raw) return null;
  const t = raw.trim();
  if ((TIMING_ENUM as readonly string[]).includes(t)) return t as TimingValue;
  for (const a of TIMING_ALIASES) {
    if (a.pattern.test(t)) return a.value;
  }
  // 已是短枚举别名（如「下个月」直接来自 intent）
  if (/^\d{1,2}月$/.test(t)) return '近期';
  if (t.length <= 6 && /月|年|周|天|近期|着急|看/.test(t)) {
    // 宽松：短时间短语保留为「近期」以免丢槽，但不接受长闲聊
    return '近期';
  }
  return null;
}

export type ObjectionKind =
  | 'PRICE'
  | 'CONFIG'
  | 'CHANNEL'
  | 'BUSY'
  | 'REJECT'
  | 'ABUSE'
  | 'DISLIKE'
  | 'OFF_TOPIC'
  | null;

export const STALL_LIMIT = 3;

/** 会话政策元数据（挂在 AgentState） */
export interface PolicyMeta {
  /** 软匹配待确认车系（复述确认前不入槽） */
  pendingSeries: string | null;
  pendingBrand: string | null;
  /** 同一缺失项连续未推进轮次 */
  stallCount: number;
  /** 当前追踪的缺失项 */
  stallField: CollectionField | null;
  /** 否定挽留是否已用过一次 */
  rejectRetainUsed: boolean;
}

export const initialPolicyMeta = (): PolicyMeta => ({
  pendingSeries: null,
  pendingBrand: null,
  stallCount: 0,
  stallField: null,
  rejectRetainUsed: false,
});

export function isInfoComplete(slots: CollectedSlots): boolean {
  return Boolean(slots.brand && slots.series && slots.city && slots.timing && slots.surname);
}

/** 下一缺失采集项 */
export function nextMissingField(slots: CollectedSlots): CollectionField | null {
  if (!slots.brand) return 'brand';
  if (!slots.series) return 'series';
  if (!slots.city) return 'city';
  if (!slots.timing) return 'timing';
  if (!slots.surname) return 'surname';
  return null;
}

export function collectionFieldLabel(field: CollectionField | null): string {
  switch (field) {
    case 'brand':
      return '品牌';
    case 'series':
      return '车系';
    case 'city':
      return '购车城市';
    case 'timing':
      return '购车时间';
    case 'surname':
      return '姓氏';
    default:
      return '无（五项已齐，应告别）';
  }
}

/**
 * 由槽位推导应处状态下限（状态不得落后于槽位）
 */
export function stateFromSlots(slots: CollectedSlots): MainDialogState {
  if (isInfoComplete(slots)) return 'FAREWELL';
  if (!slots.brand) return 'BRAND_INQUIRY';
  if (!slots.series) return 'MODEL_INQUIRY';
  if (!slots.city) return 'CITY_INQUIRY';
  if (!slots.timing) return 'TIMING_INQUIRY';
  if (!slots.surname) return 'CONTACT_COLLECTION';
  return 'FAREWELL';
}

const STATE_ORDER: Record<MainDialogState, number> = {
  GREETING: 0,
  BRAND_INQUIRY: 1,
  MODEL_INQUIRY: 2,
  CITY_INQUIRY: 3,
  TIMING_INQUIRY: 4,
  CONTACT_COLLECTION: 5,
  FAREWELL: 6,
};

/** 取状态序位较大者（只进不退）；闭环强制 FAREWELL；已在 FAREWELL 则保持 */
export function advanceState(
  current: MainDialogState,
  slots: CollectedSlots,
  rawNext?: MainDialogState
): MainDialogState {
  if (current === 'FAREWELL' || isInfoComplete(slots)) return 'FAREWELL';
  const fromSlots = stateFromSlots(slots);
  const candidates = [
    STATE_ORDER[current] ?? 0,
    STATE_ORDER[fromSlots] ?? 0,
    rawNext ? STATE_ORDER[rawNext] ?? -1 : -1,
  ];
  const best = Math.max(...candidates);
  return (Object.keys(STATE_ORDER) as MainDialogState[]).find((s) => STATE_ORDER[s] === best)!;
}

/** 唯一合法追问句（每轮只问缺失第一项） */
export function turnQuestion(slots: CollectedSlots, opts?: { listSeries?: boolean }): string {
  const missing = nextMissingField(slots);
  switch (missing) {
    case 'brand':
      return '您看最近有比较关注哪个品牌的车呀？';
    case 'series': {
      if (opts?.listSeries !== false && slots.brand) {
        const series = getBrandSeries(slots.brand).slice(0, 12);
        if (series.length > 0) {
          return `${slots.brand}的话，有${series.join('、')}，您看您想了解哪款车呢？`;
        }
      }
      return '您看想了解哪款车呢？';
    }
    case 'city':
      return '请问您是在哪个城市购车呢？';
    case 'timing':
      return '考虑什么时候购车呀？有大概时间吗？';
    case 'surname':
      return '那稍后将信息授权给当地4S店给您精准报价，请问您贵姓啊？';
    default:
      return '好的，信息已确认，稍后会有专人联系您，祝您购车顺利！';
  }
}

export function resolveObjection(intent: IntentType, text: string): ObjectionKind {
  if (intent === 'abuse') return 'ABUSE';
  if (intent === 'dislike') return 'DISLIKE';
  if (intent === 'wait') return 'BUSY';
  if (intent === 'disagree') return 'REJECT';
  if (intent === 'off_track') return 'OFF_TOPIC';
  if (/加微信|微信号|哪家店|哪家4S|什么店/.test(text)) return 'CHANNEL';
  if (/配置|参数|续航|马力|扭矩|排量|油耗|电耗|颜色|内饰/.test(text)) return 'CONFIG';
  if (/多少钱|什么价|价格|报价|落地价|优惠|折扣|降价|促销|全款|贷款|分期/.test(text)) {
    return 'PRICE';
  }
  if (intent === 'out_of_scope') {
    if (/配置|参数|续航/.test(text)) return 'CONFIG';
    return 'PRICE';
  }
  // 产品向意图坍缩为拉回采集，不当导购
  if (intent === 'ask_recommend' || intent === 'filter_vehicle') return 'OFF_TOPIC';
  return null;
}

export function objectionBridge(kind: ObjectionKind, slots: CollectedSlots): string {
  const q = turnQuestion(slots, { listSeries: kind === 'OFF_TOPIC' || kind === 'PRICE' });
  switch (kind) {
    case 'PRICE':
      return `精准落地价要对接当地4S店按提车时间核算。${q}`;
    case 'CONFIG':
      return `具体配置参数到店由顾问详细介绍更准确。${q}`;
    case 'CHANNEL':
      return `好的，确认信息后会授权当地合作4S店跟进。${q}`;
    case 'BUSY':
      return '好的，您先忙，不着急。';
    case 'REJECT':
      return `没关系的，先了解下价格做个参考也好嘛。${q}`;
    case 'ABUSE':
      return '不好意思打扰了，祝您生活愉快，再见。';
    case 'DISLIKE':
      return '理解您的感受，那就不打扰了，祝您生活愉快！';
    case 'OFF_TOPIC':
      return `嗯嗯，那咱们继续。${q}`;
    default:
      return q;
  }
}

export function stallExitReply(): string {
  return '好的，那先不打扰您了，有需要随时联系我们，再见。';
}

/**
 * 更新 stall：本轮是否推进了当前缺失项。
 * 连续 STALL_LIMIT 轮未推进 → shouldExit
 */
export function updateStall(
  meta: PolicyMeta,
  slotsBefore: CollectedSlots,
  slotsAfter: CollectedSlots,
  advanced: boolean
): { meta: PolicyMeta; shouldExit: boolean } {
  const missingBefore = nextMissingField(slotsBefore);
  const missingAfter = nextMissingField(slotsAfter);
  const progressed =
    advanced ||
    missingBefore !== missingAfter ||
    (missingBefore && slotsBefore[missingBefore] !== slotsAfter[missingBefore]);

  if (progressed || !missingAfter) {
    return {
      meta: { ...meta, stallCount: 0, stallField: missingAfter },
      shouldExit: false,
    };
  }

  const sameField = meta.stallField === missingAfter;
  const stallCount = sameField ? meta.stallCount + 1 : 1;
  return {
    meta: { ...meta, stallCount, stallField: missingAfter },
    shouldExit: stallCount >= STALL_LIMIT,
  };
}

// ——— 实体入槽门禁 ———

export type SeriesMatchMode = 'exact' | 'soft';

export interface SeriesCandidate {
  series: string;
  brand: string | null;
  mode: SeriesMatchMode;
}

export type SeriesGateResult =
  | { action: 'commit'; series: string; brand: string | null }
  | { action: 'pending'; series: string; brand: string | null; confirmReply: string }
  | { action: 'reject'; reason: string; askReply: string };

/**
 * 车系入槽门禁：
 * - exact → 直接 commit
 * - soft → pending 复述确认（不入槽）
 * - 无候选 / 品牌域冲突 → reject
 */
export function gateSeries(
  candidate: SeriesCandidate | null,
  slots: CollectedSlots,
  meta: PolicyMeta
): SeriesGateResult {
  if (!candidate) {
    return {
      action: 'reject',
      reason: '无车系候选',
      askReply: turnQuestion(slots, { listSeries: true }),
    };
  }

  // 品牌已确认时，禁止跨品牌 commit/pending
  if (slots.brand && candidate.brand && candidate.brand !== slots.brand) {
    const resolvedHint = resolveBrand(slots.brand) || slots.brand;
    if (candidate.brand !== resolvedHint) {
      return {
        action: 'reject',
        reason: '跨品牌车系丢弃',
        askReply: turnQuestion(slots, { listSeries: true }),
      };
    }
  }

  if (candidate.mode === 'exact') {
    return { action: 'commit', series: candidate.series, brand: candidate.brand };
  }

  // soft → 复述确认
  return {
    action: 'pending',
    series: candidate.series,
    brand: candidate.brand,
    confirmReply: `是${candidate.series}对吧？`,
  };
}

/** 客户肯定时提交 pending 车系 */
export function commitPendingSeries(
  meta: PolicyMeta,
  slots: CollectedSlots
): { slots: CollectedSlots; meta: PolicyMeta } | null {
  if (!meta.pendingSeries) return null;
  const brand =
    meta.pendingBrand ||
    slots.brand ||
    resolveBrandFromSeries(meta.pendingSeries);
  return {
    slots: {
      ...slots,
      series: meta.pendingSeries,
      brand: brand || slots.brand,
    },
    meta: { ...meta, pendingSeries: null, pendingBrand: null },
  };
}

export function clearPending(meta: PolicyMeta): PolicyMeta {
  return { ...meta, pendingSeries: null, pendingBrand: null };
}

/** 注入 Prompt 的口径正文（快/慢通道共用） */
export function buildPolicyPromptBlock(slots: CollectedSlots): string {
  const missing = nextMissingField(slots);
  return `【使命】${MISSION}
【采集契约】仅品牌、车系、购车城市、购车时间、姓氏。严禁索要手机号；不问动力/配置/精准价。
【本轮只问】${collectionFieldLabel(missing)}
【回合纪律】每轮只问【本轮只问】；已收集字段绝不再问；车系已给出禁止再列全系表。
【异议】价格/配置→一句说明4S核算后立刻问缺失项；可把时间记为看价格；禁止与时间死锁。已看车→时间=已看车并推进。否定挽留仅一次。偏离→一句拉回。
【ASR门禁】语音转写可能同音错字：品牌已确认时只在该品牌车系列表内纠到标准名；软匹配须复述确认后再入槽；禁止跨品牌瞎认（送plus≠秦PLUS）。
【闭环】五项齐备→FAREWELL，禁止再要手机号。`;
}

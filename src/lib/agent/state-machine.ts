/**
 * 规则状态机 — 只消费 policy.ts 口径
 * 每轮：护栏 → pending 确认 → 入槽门禁 → 有限异议 → 只问下一缺失项
 */

import type { MainDialogState, ExceptionState, CollectedSlots } from './types';
import { queryVehicleKB, resolveBrandFromSeries } from './knowledge-base';
import type { IntentResult } from './intent';
import {
  type PolicyMeta,
  initialPolicyMeta,
  turnQuestion,
  nextMissingField,
  advanceState,
  isInfoComplete,
  resolveObjection,
  objectionBridge,
  gateSeries,
  commitPendingSeries,
  clearPending,
  updateStall,
  stallExitReply,
  normalizeTiming,
} from './policy';

export interface AgentResponse {
  reply: string;
  nextState: MainDialogState;
  nextException: ExceptionState;
  updatedSlots: CollectedSlots;
  reasoning: string;
  action: string;
  updatedPolicyMeta: PolicyMeta;
}

function brandListReply(brand: string): string {
  const kbResult = queryVehicleKB({ brand });
  if (kbResult.found && kbResult.results.length > 0) {
    const names = kbResult.results.map((r) => r.name).slice(0, 12);
    return `好的，${brand}有${names.join('、')}，您看您想了解哪款车呢？`;
  }
  return `好的，${brand}。您想了解哪款车呢？`;
}

function farewellReply(slots: CollectedSlots): string {
  const title = slots.surname || '您';
  return slots.series
    ? `${title}您好，稍后报价，早日提爱车，再见。`
    : `${title}您好，稍后会有专人联系您，再见。`;
}

/**
 * 核心：基于政策口径生成回复
 */
export function generateResponse(
  currentState: MainDialogState,
  _exceptionState: ExceptionState,
  slots: CollectedSlots,
  intentResult: IntentResult,
  _dialogHistory: Array<{ role: string; content: string }>,
  policyMeta: PolicyMeta = initialPolicyMeta(),
  customerText = ''
): AgentResponse {
  const { intent, entities, seriesMatchMode } = intentResult;
  let newSlots = { ...slots };
  let meta = { ...policyMeta };
  let reasoning = '';
  let action = '';
  let reply = '';
  let nextException: ExceptionState = 'NONE';
  const slotsBefore = { ...slots };

  const finish = (
    nextState: MainDialogState,
    advanced: boolean
  ): AgentResponse => {
    const finalState = isInfoComplete(newSlots)
      ? 'FAREWELL'
      : advanceState(nextState === 'GREETING' ? 'BRAND_INQUIRY' : nextState, newSlots);
    const stall = updateStall(meta, slotsBefore, newSlots, advanced || finalState === 'FAREWELL');
    meta = stall.meta;
    if (stall.shouldExit && finalState !== 'FAREWELL') {
      return {
        reply: stallExitReply(),
        nextState: 'FAREWELL',
        nextException: 'UNCLEAR',
        updatedSlots: newSlots,
        reasoning: `${reasoning}；同一缺失项连续未推进达上限，软退出`,
        action: 'stall_exit',
        updatedPolicyMeta: meta,
      };
    }
    return {
      reply,
      nextState: finalState,
      nextException,
      updatedSlots: newSlots,
      reasoning,
      action,
      updatedPolicyMeta: meta,
    };
  };

  // === 1. 护栏优先 ===
  if (intent === 'abuse') {
    reasoning = '辱骂护栏';
    action = 'FAREWELL';
    reply = objectionBridge('ABUSE', newSlots);
    nextException = 'ABUSE';
    return finish('FAREWELL', true);
  }
  if (intent === 'dislike') {
    reasoning = '反感护栏';
    action = 'FAREWELL';
    reply = objectionBridge('DISLIKE', newSlots);
    nextException = 'ABUSE';
    return finish('FAREWELL', true);
  }

  // === 2. pending 软匹配确认 ===
  if (meta.pendingSeries) {
    if (intent === 'agree' || intent === 'confirm_model') {
      const committed = commitPendingSeries(meta, newSlots);
      if (committed) {
        newSlots = committed.slots;
        meta = committed.meta;
        reasoning = `软匹配确认车系：${newSlots.series}`;
        action = 'commit_pending_series';
        reply = `${newSlots.series}可以的，${turnQuestion(newSlots, { listSeries: false })}`;
        return finish(advanceState(currentState, newSlots), true);
      }
    }
    if (intent === 'disagree') {
      meta = clearPending(meta);
      reasoning = '客户否定 pending 车系';
      action = 'clear_pending';
      reply = turnQuestion(newSlots, { listSeries: true });
      return finish(advanceState(currentState, newSlots), false);
    }
    // 其它输入：重新提示确认，或若给出新精确车系则走门禁
  }

  // === 3. 实体入槽（经门禁；否定不收集） ===
  if (intent !== 'disagree') {
    if (entities.brand) {
      newSlots.brand = entities.brand;
      // 切换品牌时清空旧车系与 pending
      if (slots.brand && entities.brand !== slots.brand) {
        newSlots.series = null;
        meta = clearPending(meta);
      }
    }

    if (entities.series) {
      const gate = gateSeries(
        {
          series: entities.series,
          brand: entities.brand || resolveBrandFromSeries(entities.series),
          mode: seriesMatchMode || 'exact',
        },
        newSlots,
        meta
      );
      if (gate.action === 'commit') {
        newSlots.series = gate.series;
        if (gate.brand && !newSlots.brand) newSlots.brand = gate.brand;
        meta = clearPending(meta);
      } else if (gate.action === 'pending') {
        // 软匹配：不入槽，只 pending
        delete entities.series;
        meta = {
          ...meta,
          pendingSeries: gate.series,
          pendingBrand: gate.brand,
        };
        reasoning = `软匹配待确认：${gate.series}`;
        action = 'pending_series_confirm';
        reply = gate.confirmReply;
        return finish(advanceState(currentState, newSlots), false);
      } else {
        // reject：不入槽
        delete entities.series;
      }
    }

    if (entities.city) newSlots.city = entities.city;
    if (entities.timing) {
      newSlots.timing = normalizeTiming(entities.timing) || entities.timing;
    }
    if (entities.surname) newSlots.surname = entities.surname;
    // 被动字段可回填，不驱动流程
    if (entities.phoneTail) newSlots.phoneTail = entities.phoneTail;
    if (entities.vehicleType) newSlots.vehicleType = entities.vehicleType;
    if (entities.powerType) newSlots.powerType = entities.powerType;
  }

  // 五项齐备 → 直接告别
  if (isInfoComplete(newSlots)) {
    reasoning = '五项采集齐备，闭环';
    action = 'FAREWELL';
    reply = farewellReply(newSlots);
    return finish('FAREWELL', true);
  }

  // === 4. 有限异议分支 ===
  const objection = resolveObjection(intent, customerText || '');
  if (objection === 'BUSY') {
    reasoning = '客户在忙';
    action = 'wait';
    reply = objectionBridge('BUSY', newSlots);
    return finish(currentState, false);
  }
  if (objection === 'ABUSE' || objection === 'DISLIKE') {
    reply = objectionBridge(objection, newSlots);
    nextException = 'ABUSE';
    return finish('FAREWELL', true);
  }
  if (objection === 'REJECT') {
    if (meta.rejectRetainUsed) {
      reasoning = '否定挽留已用过，退出';
      action = 'reject_exit';
      reply = '好的，那不打扰您了，祝您生活愉快，再见。';
      return finish('FAREWELL', true);
    }
    meta = { ...meta, rejectRetainUsed: true };
    reasoning = '否定挽留一次';
    action = 'reject_retain';
    reply = objectionBridge('REJECT', newSlots);
    return finish(advanceState(currentState, newSlots), false);
  }
  if (objection === 'PRICE' || objection === 'CONFIG' || objection === 'CHANNEL' || objection === 'OFF_TOPIC') {
    // 价格犹豫话术才记 timing=看价格；纯问价不自动填时间
    if (objection === 'PRICE' && !newSlots.timing && /看价格|看价钱|价格合适|等价格|看价格再说/.test(customerText)) {
      newSlots.timing = '看价格';
    }
    reasoning = `异议分支 ${objection}`;
    action = `objection_${objection}`;
    nextException = objection === 'OFF_TOPIC' ? 'OFF_TRACK' : 'OUT_OF_SCOPE';
    reply = objectionBridge(objection, newSlots);
    return finish(advanceState(currentState, newSlots), Boolean(entities.timing || newSlots.timing !== slots.timing));
  }

  // === 5. 正常采集推进 ===
  const missing = nextMissingField(newSlots);

  // 本轮刚确认了某实体
  if (intent === 'confirm_model' && newSlots.series) {
    reasoning = `确认车系 ${newSlots.series}`;
    action = 'ask_next';
    reply = `${newSlots.series}可以的，${turnQuestion(newSlots, { listSeries: false })}`;
    return finish(advanceState(currentState, newSlots), true);
  }
  if (intent === 'confirm_brand' && newSlots.brand && !newSlots.series) {
    reasoning = `确认品牌 ${newSlots.brand}`;
    action = 'list_series';
    reply = brandListReply(newSlots.brand);
    return finish(advanceState(currentState, newSlots), true);
  }
  if (intent === 'confirm_city' && newSlots.city) {
    reasoning = `确认城市 ${newSlots.city}`;
    action = 'ask_next';
    reply = `${newSlots.city}是吧？${turnQuestion(newSlots)}`;
    return finish(advanceState(currentState, newSlots), true);
  }
  if (intent === 'confirm_time' && newSlots.timing) {
    reasoning = `确认购车时间 ${newSlots.timing}`;
    action = 'ask_next';
    reply = turnQuestion(newSlots);
    return finish(advanceState(currentState, newSlots), true);
  }
  if (intent === 'confirm_surname' && newSlots.surname) {
    reasoning = `确认姓氏 ${newSlots.surname}`;
    action = 'farewell';
    reply = farewellReply(newSlots);
    return finish('FAREWELL', true);
  }

  // 肯定但无新实体 → 问缺失项（不回问已收集）
  if (intent === 'agree' || intent === 'greet') {
    reasoning = intent === 'greet' ? '问候后进入采集' : '同意，追问缺失项';
    action = 'ask_missing';
    if (currentState === 'GREETING' && intent === 'greet') {
      reply =
        '价格合适的话，您这边考虑过买车吗？给您做一个报价，您参考了解一下哈，您看最近有比较关注哪款车呀？';
    } else {
      reply = turnQuestion(newSlots, { listSeries: missing === 'series' });
    }
    return finish(advanceState(currentState === 'GREETING' ? 'BRAND_INQUIRY' : currentState, newSlots), false);
  }

  // ask_vehicle：仅在缺车系且有品牌时列一次表，否则拉回缺失项
  if (intent === 'ask_vehicle') {
    reasoning = '询问车系列表';
    action = 'ask_missing';
    reply = turnQuestion(newSlots, { listSeries: true });
    return finish(advanceState(currentState, newSlots), false);
  }

  // 不清晰 / 未知 → 追问缺失项（计 stall）
  reasoning = '无法识别，追问缺失项';
  action = 'clarify';
  nextException = 'UNCLEAR';
  reply =
    missing === 'series' || missing === 'brand'
      ? `不好意思没太听清，${turnQuestion(newSlots, { listSeries: true })}`
      : `不好意思没太听清，${turnQuestion(newSlots)}`;
  return finish(advanceState(currentState, newSlots), false);
}

/** @deprecated 保留给旧测试：等价于 turnQuestion */
export function getCurrentQuestionForTest(state: MainDialogState, slots: CollectedSlots): string {
  void state;
  return turnQuestion(slots);
}

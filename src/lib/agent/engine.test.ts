import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  buildFinalStateFromFastChannel,
  updateStateWithSlowChannel,
  fallbackToRuleEngine,
  checkCacheHit,
  sanitizeAgentReply,
} from './engine';
import type { ChatMessage, LLMModelConfig } from './types';

const modelConfig: LLMModelConfig = { temperature: 0.7, max_tokens: 150 };

function customerMsg(text = '我看蔚来'): ChatMessage {
  return { id: 'msg-c-1', role: 'customer', content: text, timestamp: 1 };
}

function fastPayload(intent: string, next_state: string, response = '好的') {
  return { intent, next_state, response };
}

describe('engine 状态迁移校验', () => {
  it('sanitizeAgentReply 清洗性别称谓（王先生/王女士 → 王您好）', () => {
    expect(sanitizeAgentReply('好的，王先生，稍后联系您')).toBe('好的，王您好，稍后联系您');
    expect(sanitizeAgentReply('李女士，您好')).toBe('李您好，您好');
    expect(sanitizeAgentReply('感谢您的时间，再见')).toBe('感谢您的时间，再见');
    // 边界：正常词不被误伤
    expect(sanitizeAgentReply('这套方案适合女士')).toBe('这套方案适合女士');
    // 句首称谓同样清洗
    expect(sanitizeAgentReply('王先生，稍后联系您')).toBe('王您好，稍后联系您');
    // 口语粘连（无标点）也能命中：好的王先生 / 嗯王先生
    expect(sanitizeAgentReply('好的王先生，稍后联系您')).toBe('好的王您好，稍后联系您');
    expect(sanitizeAgentReply('嗯王先生再见')).toBe('嗯王您好再见');
  });

  it('createInitialState 初始为 GREETING 且含开场白', () => {
    const s = createInitialState();
    expect(s.currentState).toBe('GREETING');
    expect(s.messages[0].role).toBe('agent');
    expect(s.responseSource).toBe('rule');
  });

  it('快通道输出经称谓清洗：王先生 → 王您好', () => {
    const init = createInitialState();
    const r = buildFinalStateFromFastChannel(
      init, customerMsg(), '好的，王先生，顾问稍后联系您', fastPayload('confirm_surname', 'CONTACT_COLLECTION'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    const lastAgent = [...r.messages].reverse().find((m) => m.role === 'agent');
    expect(lastAgent?.content).toBe('好的，王您好，顾问稍后联系您');
    // 原始内容保留在 llmRawResponse 供调试
    expect(r.llmRawResponse).toContain('王先生');
  });

  it('非法 next_state 回退到当前状态', () => {
    const init = createInitialState();
    const r = buildFinalStateFromFastChannel(
      init, customerMsg(), '好的', fastPayload('confirm_brand', 'NOT_A_STATE'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    // confirm_brand 推进下限是 MODEL_INQUIRY，非法值回退后仍被下限抬到 MODEL_INQUIRY
    expect(r.currentState).toBe('MODEL_INQUIRY');
  });

  it('禁止状态倒退：当前 BRAND_INQUIRY，LLM 返回 GREETING → 保持推进下限', () => {
    const init = createInitialState();
    // 先推进到 BRAND_INQUIRY
    const s1 = buildFinalStateFromFastChannel(
      init, customerMsg(), '好的', fastPayload('agree', 'BRAND_INQUIRY'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    expect(s1.currentState).toBe('BRAND_INQUIRY');
    // LLM 尝试回 GREETING（倒退）→ 不允许
    const s2 = buildFinalStateFromFastChannel(
      s1, customerMsg('再看下'), '好的', fastPayload('unknown', 'GREETING'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    expect(s2.currentState).toBe('BRAND_INQUIRY');
  });

  it('确认品牌 intent 至少推进到 MODEL_INQUIRY', () => {
    const init = createInitialState();
    const r = buildFinalStateFromFastChannel(
      init, customerMsg(), '好的', fastPayload('confirm_brand', 'BRAND_INQUIRY'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    // LLM 只给了 BRAND_INQUIRY，但 intent 下限强制到 MODEL_INQUIRY
    expect(r.currentState).toBe('MODEL_INQUIRY');
  });

  it('姓氏已收集（口头授权）→ 强制 FAREWELL', () => {
    // 构造已收集姓氏、未收集手机尾号的状态（手机尾号不再要求）
    const init = createInitialState();
    const withSlots = {
      ...init,
      collectedSlots: {
        brand: '蔚来', series: 'ES8', model: null, city: '北京', timing: '下个月',
        surname: '王', phoneTail: null, vehicleType: null, powerType: null,
      },
      currentState: 'CONTACT_COLLECTION' as const,
    };
    const r = buildFinalStateFromFastChannel(
      withSlots, customerMsg('嗯好'), '好的', fastPayload('agree', 'CONTACT_COLLECTION'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    expect(r.currentState).toBe('FAREWELL');
  });

  it('fallbackToRuleEngine → responseSource=fallback 且流程可用', () => {
    const init = createInitialState();
    const r = fallbackToRuleEngine(init, '我看比亚迪');
    expect(r.newState.responseSource).toBe('fallback');
    expect(r.newState.collectedSlots.brand).toBe('比亚迪');
  });

  it('checkCacheHit：辱骂命中缓存', () => {
    const init = createInitialState();
    const r = checkCacheHit(init.currentState, '你傻逼');
    expect(r.hit).toBe(true);
    expect(r.response).toContain('再见');
  });

  it('checkCacheHit：普通输入不命中', () => {
    const init = createInitialState();
    const r = checkCacheHit(init.currentState, '我想看蔚来 ES8');
    expect(r.hit).toBe(false);
  });
});

describe('updateStateWithSlowChannel 慢通道合并', () => {
  it('中文实体键归一化回填槽位', () => {
    const init = createInitialState();
    const slow = {
      emotion: 'interested',
      entities: { 品牌: '蔚来', 车系: 'ES8', 城市: '北京' },
      reasoning: '客户有意向',
      guardrail_check: 'pass',
    };
    const updated = updateStateWithSlowChannel(init, slow, 300);
    expect(updated.collectedSlots.brand).toBe('蔚来');
    expect(updated.collectedSlots.series).toBe('ES8');
    expect(updated.collectedSlots.city).toBe('北京');
    expect(updated.dualChannel?.slowStatus).toBe('done');
  });

  it('慢通道回填姓氏完成闭环 → 直接 FAREWELL', () => {
    // 姓氏尚未收集（手机尾号不再作为闭环条件），慢通道回填姓氏后闭环
    const init = {
      ...createInitialState(),
      currentState: 'CONTACT_COLLECTION' as const,
      collectedSlots: {
        brand: '蔚来', series: 'ES8', model: null, city: '北京', timing: '下个月',
        surname: null, phoneTail: null, vehicleType: null, powerType: null,
      },
    };
    const slow = {
      emotion: 'neutral',
      entities: { 姓氏: '王' },
      reasoning: '',
      guardrail_check: '',
    };
    const updated = updateStateWithSlowChannel(init, slow, 300);
    expect(updated.collectedSlots.surname).toBe('王');
    expect(updated.currentState).toBe('FAREWELL');
  });

  it('仅回填手机尾号、无姓氏 → 不闭环（保持 CONTACT_COLLECTION）', () => {
    // 手机尾号不再作为闭环条件：只回填尾号但无姓氏时不应进入 FAREWELL
    const init = {
      ...createInitialState(),
      currentState: 'CONTACT_COLLECTION' as const,
      collectedSlots: {
        brand: '蔚来', series: 'ES8', model: null, city: '北京', timing: '下个月',
        surname: null, phoneTail: null, vehicleType: null, powerType: null,
      },
    };
    const slow = {
      emotion: 'neutral',
      entities: { 手机尾号: '5678' },
      reasoning: '',
      guardrail_check: '',
    };
    const updated = updateStateWithSlowChannel(init, slow, 300);
    expect(updated.collectedSlots.phoneTail).toBe('5678');
    expect(updated.currentState).toBe('CONTACT_COLLECTION');
  });

  it('情绪映射 interested → positive', () => {
    const init = createInitialState();
    // 先构建含 lastDecision 的 fast 通道状态，再喂慢通道
    const fastState = buildFinalStateFromFastChannel(
      init, customerMsg(), '好的', fastPayload('confirm_brand', 'MODEL_INQUIRY'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    const slow = {
      emotion: 'interested',
      entities: {},
      reasoning: '',
      guardrail_check: '',
    };
    const updated = updateStateWithSlowChannel(fastState, slow, 300);
    expect(updated.lastDecision?.perception.emotion).toBe('positive');
  });

  it('护栏复核：guardrail_check 命中辱骂 → 强制 FAREWELL + 修正话术', () => {
    const init = createInitialState();
    const fastState = buildFinalStateFromFastChannel(
      init, customerMsg('你傻逼'), '好的，帮您查一下', fastPayload('unknown', 'MODEL_INQUIRY'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    const slow = {
      emotion: 'angry',
      entities: {},
      reasoning: '客户出现辱骂表达',
      guardrail_check: '触发辱骂护栏，建议退出',
    };
    const updated = updateStateWithSlowChannel(fastState, slow, 300);
    expect(updated.currentState).toBe('FAREWELL');
    expect(updated.exceptionState).toBe('ABUSE');
    // 最近一条 agent 消息被替换为护栏退出话术
    const lastAgent = [...updated.messages].reverse().find((m) => m.role === 'agent');
    expect(lastAgent?.content).toContain('再见');
  });

  it('护栏复核：guardrail_check 为 pass 时不改变状态', () => {
    const init = createInitialState();
    const fastState = buildFinalStateFromFastChannel(
      init, customerMsg('我想看蔚来'), '好的', fastPayload('confirm_brand', 'MODEL_INQUIRY'),
      { firstToken: 100, total: 500, tokenEstimate: 200 }, modelConfig
    );
    const slow = {
      emotion: 'interested',
      entities: {},
      reasoning: '',
      guardrail_check: 'pass',
    };
    const updated = updateStateWithSlowChannel(fastState, slow, 300);
    expect(updated.currentState).toBe('MODEL_INQUIRY');
    expect(updated.exceptionState).toBe('NONE');
  });
});

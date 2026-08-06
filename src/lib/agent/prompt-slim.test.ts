import { describe, it, expect } from 'vitest';
import { buildSlimPrompt, buildSlowPrompt, estimateTokens } from './prompt-slim';
import type { CollectedSlots } from './types';

const slots: CollectedSlots = {
  brand: '蔚来', series: 'ES8', model: null, city: '北京', timing: '下个月',
  surname: null, phoneTail: null, vehicleType: null, powerType: null,
};

const history = [
  { role: 'agent' as const, content: '您看想了解哪款车呢？' },
  { role: 'customer' as const, content: 'ES8' },
];

describe('prompt-slim 构建', () => {
  it('buildSlimPrompt 注入状态/槽位/知识库', () => {
    const p = buildSlimPrompt('MODEL_INQUIRY', slots, history);
    expect(p).toContain('MODEL_INQUIRY');
    expect(p).toContain('品牌:蔚来');
    expect(p).toContain('车系:ES8');
    expect(p).toContain('蔚来'); // 知识库按当前品牌注入
    // 提问纪律：最新消息已提信息视为已收集、只问缺失的下一项、不问动力类型
    expect(p).toContain('视为已收集');
    expect(p).toContain('动力类型');
    // 称谓禁令：不猜测性别
    expect(p).toContain('禁止输出"先生"');
    // 车系已给出后不追问版本/变体
    expect(p).toContain('车系已给出后不要追问版本/变体/偏好');
  });

  it('buildSlimPrompt 含老系统字段对齐说明（hit/UNMATCH）', () => {
    const p = buildSlimPrompt('MODEL_INQUIRY', slots, history);
    expect(p).toContain('hit');
    expect(p).toContain('UNMATCH');
    expect(p).toContain('严禁编造');
  });

  it('buildSlimPrompt 注入历史摘要（可选参数）', () => {
    const summary = '【历史摘要】早期 10 条消息已归档。已确认信息：品牌:蔚来、车系:ES8';
    const p = buildSlimPrompt('CITY_INQUIRY', slots, history, summary);
    expect(p).toContain('历史摘要');
    expect(p).toContain('已归档');
  });

  it('buildSlowPrompt 注入摘要与快通道回复', () => {
    const p = buildSlowPrompt('MODEL_INQUIRY', slots, history, '好的，ES8可以的', '【历史摘要】...');
    expect(p).toContain('快通道回复');
    expect(p).toContain('好的，ES8可以的');
    expect(p).toContain('历史摘要');
    // 实体提取字段与老系统采集字段对应
    expect(p).toContain('信息授权确认');
    expect(p).toContain('guardrail_check');
  });

  it('estimateTokens 中文按 1.5 估算', () => {
    const n = estimateTokens('你好，欢迎光临');
    expect(n).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { flowAlignments, getFlowAlignment } from './flow-alignment';
import { legacyMainFlows } from './main-flow';

describe('flow-alignment 15 子流程 ↔ 7 状态映射', () => {
  it('映射覆盖全部 15 个子流程（无遗漏/无 UNMAPPED）', () => {
    expect(flowAlignments.length).toBe(15);
    const unmapped = flowAlignments.filter((a) => a.mapping === 'unknown' || a.state === 'UNMAPPED');
    expect(unmapped).toEqual([]);
  });

  it('子流程名与导入数据完全一致', () => {
    const names = legacyMainFlows.map((f) => f.name);
    expect(flowAlignments.map((a) => a.flowName)).toEqual(names);
  });

  it('主干 exact + merged 覆盖全部 7 个主状态', () => {
    const exact = flowAlignments.filter((a) => a.mapping === 'exact');
    const merged = flowAlignments.filter((a) => a.mapping === 'merged');
    expect(exact.length).toBe(6);
    const stateSet = new Set([...exact, ...merged].map((a) => a.state));
    expect(stateSet).toEqual(new Set([
      'BRAND_INQUIRY', 'CITY_INQUIRY', 'CONTACT_COLLECTION', 'FAREWELL',
      'GREETING', 'MODEL_INQUIRY', 'TIMING_INQUIRY',
    ]));
  });

  it('merged 合并项：姓氏 + 信息授权确认 → CONTACT_COLLECTION', () => {
    const merged = flowAlignments.filter((a) => a.mapping === 'merged');
    expect(merged.length).toBe(2);
    expect(merged.every((a) => a.state === 'CONTACT_COLLECTION')).toBe(true);
  });

  it('voice 项标记语音侧不覆盖', () => {
    const voice = flowAlignments.filter((a) => a.mapping === 'voice');
    expect(voice.length).toBe(2);
    expect(voice.map((a) => a.flowName).sort()).toEqual(['性别采集', '无声挂机']);
  });

  it('getFlowAlignment 按名查询', () => {
    const a = getFlowAlignment('开场白');
    expect(a?.state).toBe('GREETING');
    expect(getFlowAlignment('不存在的流程')).toBeUndefined();
  });
});

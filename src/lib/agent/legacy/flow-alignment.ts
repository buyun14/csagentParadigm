import { legacyMainFlows } from './main-flow';

/**
 * 老系统 15 子流程 ↔ 范式状态机映射
 * 对齐结论：
 * - 主干 7 个子流程与 7 状态一一对应（exact）；
 * - 信息授权确认/询问客户姓氏 合并为 CONTACT_COLLECTION（merged）；
 * - 失败挂机/挽回1/其他问题/二手车 由状态机护栏与旁支话术承接（edge）；
 * - 无声挂机/性别采集 属语音侧或低频，不在文本范式内（voice）。
 */

export type FlowMappingType = 'exact' | 'merged' | 'edge' | 'voice' | 'unknown';

export interface FlowAlignment {
  flowName: string;
  sort: number;
  state: string;
  mapping: FlowMappingType;
  note: string;
}

const FLOW_TO_STATE: Record<string, { state: string; mapping: FlowMappingType; note: string }> = {
  '开场白': { state: 'GREETING', mapping: 'exact', note: '主流程起点，问候 + 探购车意向' },
  '询问关注品牌': { state: 'BRAND_INQUIRY', mapping: 'exact', note: '确认品牌' },
  '询问关注车系': { state: 'MODEL_INQUIRY', mapping: 'exact', note: '确认车系/车型' },
  '预计购车时间': { state: 'TIMING_INQUIRY', mapping: 'exact', note: '确认购车时间；注意老系统顺序为 车系→时间→地区，范式为 车系→城市→时间' },
  '询问所在地区': { state: 'CITY_INQUIRY', mapping: 'exact', note: '确认看车城市' },
  '询问客户姓氏': { state: 'CONTACT_COLLECTION', mapping: 'merged', note: '与信息授权确认合并为一个收集状态' },
  '信息授权确认': { state: 'CONTACT_COLLECTION', mapping: 'merged', note: '确认手机尾号 + 授权，与姓氏收集合并' },
  '成功结束': { state: 'FAREWELL', mapping: 'exact', note: '成功闭环告别' },
  '失败挂机': { state: 'FAREWELL', mapping: 'edge', note: '护栏退出路径（abuse/dislike/off_track 拉不回时）' },
  '挽回1': { state: 'BRAND_INQUIRY', mapping: 'edge', note: 'GREETING disagree 分支的柔性挽留话术' },
  '其他购车相关问题': { state: 'MODEL_INQUIRY', mapping: 'edge', note: '记录需求后回主线（out_of_scope 引导 4S 店承接）' },
  '其他非相关问题': { state: 'FAREWELL', mapping: 'edge', note: '非相关话题 → 失败挂机语义' },
  '二手车': { state: 'OUT_OF_SCOPE', mapping: 'edge', note: 'out_of_scope（二手车/置换）引导对接 4S 店' },
  '无声挂机': { state: 'VOICE', mapping: 'voice', note: '语音侧：无应答超时（USER_NOT_ANSWER），文本范式不覆盖' },
  '性别采集': { state: 'VOICE', mapping: 'voice', note: '语音侧/低频，文本范式不覆盖' },
};

/** 15 子流程 → 状态映射（按 sort 排序） */
export const flowAlignments: FlowAlignment[] = legacyMainFlows.map((f) => {
  const rule = FLOW_TO_STATE[f.name];
  return {
    flowName: f.name,
    sort: f.sort,
    state: rule?.state ?? 'UNMAPPED',
    mapping: rule?.mapping ?? 'unknown',
    note: rule?.note ?? '未映射（需人工确认）',
  };
});

/** 便捷：按流程名查询 */
export function getFlowAlignment(flowName: string): FlowAlignment | undefined {
  return flowAlignments.find((a) => a.flowName === flowName);
}

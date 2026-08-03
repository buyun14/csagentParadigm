/** 老系统数据导入的类型定义（由 scripts/import-legacy.mjs 生成，勿手改） */

/** 主流程：单个子流程 */
export interface LegacyFlow {
  botId: number;
  name: string;
  sort: number;
  uuid: string;
  /** 画布上的节点（含跳转节点） */
  nodes: Array<{
    component: string | null;
    title: string;
    type: string;
    content: string;
    next: string;
    transfer: boolean;
    eavesdrop: boolean;
  }>;
  /** 由 next 字段提取的跳转目标（"指定主流程 / XX" → XX；"挂机" → 挂机） */
  jumpTargets: string[];
  /** 普通话术节点（nodeNew 且有 content） */
  speechNodes: Array<{ title: string; content: string }>;
}

/** 知识库条目（priority 升序） */
export interface LegacyKnowledgeEntry {
  botId: number;
  uuid: string;
  /** 命中优先级，越小越优先 */
  priority: number;
  hangup: number;
  intent: string;
  issue: string;
  type: 'common' | 'business';
  /** 禁用标记（骚扰/骂人/投诉为 true） */
  forbid: boolean;
  mode: string;
  /** 关键词/正则列表（逗号分隔拆分） */
  keywords: string[];
  /** 应答列表（method: hangup/wait/appoint_process/go_back 等） */
  answers: Array<{ content: string; method: string; duration: number | null }>;
}

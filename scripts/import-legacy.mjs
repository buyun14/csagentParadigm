/**
 * import-legacy.mjs —— 老系统流程/知识库数据一次性导入脚本
 *
 * 输入：E:\ProjectCollection\2026_8\相关资料收集\现有系统流程\ 下的 4 个 JSON 数据包
 *   - 汽车客服营销-主流程.json（15 个子流程的画布节点/跳转）
 *   - 知识库-1.json / 知识库-2.json / 知识库-3.json（21 条优先级知识）
 * 输出：src/lib/agent/legacy/ 下的 TypeScript 配置数据（一次性生成，后续可人工维护）
 *   - legacy-types.ts      类型定义
 *   - main-flow.ts         主流程：子流程顺序 + 各流程节点/跳转/话术
 *   - knowledge-entries.ts 21 条知识库（按 priority 升序）
 *
 * 用法：node scripts/import-legacy.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// 老系统数据包位于项目上级目录的 相关资料收集/现有系统流程/
const SRC_DIR = resolve(ROOT, '..', '相关资料收集', '现有系统流程');
const OUT_DIR = resolve(ROOT, 'src', 'lib', 'agent', 'legacy');

mkdirSync(OUT_DIR, { recursive: true });

function readJson(name) {
  return JSON.parse(readFileSync(resolve(SRC_DIR, name), 'utf8'));
}

// ============ 1. 主流程解析 ============
const mainFlow = readJson('汽车客服营销-主流程.json');
const flows = mainFlow.data
  .map((bot) => {
    const cells = bot.canvas?.cells || [];
    const nodes = [];
    for (const cell of cells) {
      const d = cell.data || {};
      nodes.push({
        component: cell.component || null,
        title: d.title || '',
        type: d.type || '',
        content: d.content || '',
        next: d.next || '',
        transfer: d.transfer ?? false,
        eavesdrop: d.eavesdrop ?? false,
      });
    }
    return {
      botId: bot.bot_id,
      name: bot.name,
      sort: bot.sort ?? 0,
      uuid: bot.uuid || '',
      nodes,
    };
  })
  .sort((a, b) => a.sort - b.sort);

// 提取每个流程的跳转目标（next 字段，"指定主流程 / XX" → XX，"挂机" → 挂机）
for (const f of flows) {
  f.jumpTargets = f.nodes
    .filter((n) => n.next)
    .map((n) => (n.next.startsWith('指定主流程 /') ? n.next.slice('指定主流程 /'.length).trim() : n.next));
  f.speechNodes = f.nodes
    .filter((n) => n.component === 'nodeNew' && n.content)
    .map((n) => ({ title: n.title || '普通节点', content: n.content }));
}

// ============ 2. 知识库解析 ============
const kbFiles = ['知识库-1.json', '知识库-2.json', '知识库-3.json'];
const entries = [];
for (const f of kbFiles) {
  const kb = readJson(f);
  for (const item of kb.data) {
    const c = item.config || {};
    const keywords = String(c.keywords || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const answers = (Array.isArray(c.answers) ? c.answers : []).map((a) => ({
      content: a.content || '',
      method: a.method || '',
      duration: a.duration ?? null,
    }));
    entries.push({
      botId: item.bot_id,
      uuid: item.uuid || '',
      priority: item.priority ?? 100,
      hangup: item.hangup ?? 0,
      intent: c.intent || '',
      issue: c.issue || '',
      type: c.type || 'common',
      forbid: c.forbid ?? false,
      mode: c.mode || 'simple',
      keywords,
      answers,
    });
  }
}
entries.sort((a, b) => a.priority - b.priority);

// ============ 3. 生成 TypeScript 文件 ============

const typesTs = `/** 老系统数据导入的类型定义（由 scripts/import-legacy.mjs 生成，勿手改） */

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
`;

const mainFlowTs = `import type { LegacyFlow } from './legacy-types';

/**
 * 老系统主流程数据（由 scripts/import-legacy.mjs 生成，勿手改）
 * 15 个子流程，按 sort 升序：开场白 → 其他购车相关问题 → 其他非相关问题 → 挽回1 →
 * 询问关注品牌 → 询问关注车系 → 预计购车时间 → 询问客户姓氏 → 询问所在地区 →
 * 信息授权确认 → 成功结束 → 失败挂机 → 无声挂机 → 二手车 → 性别采集
 */
export const legacyMainFlows: LegacyFlow[] = ${JSON.stringify(flows, null, 2)};

/** 子流程执行顺序（按 sort） */
export const legacyFlowOrder: string[] = ${JSON.stringify(flows.map((f) => f.name))};
`;

const kbTs = `import type { LegacyKnowledgeEntry } from './legacy-types';

/**
 * 老系统知识库数据（由 scripts/import-legacy.mjs 生成，勿手改）
 * 21 条，按 priority 升序（越小越优先）
 */
export const legacyKnowledgeEntries: LegacyKnowledgeEntry[] = ${JSON.stringify(entries, null, 2)};
`;

writeFileSync(resolve(OUT_DIR, 'legacy-types.ts'), typesTs);
writeFileSync(resolve(OUT_DIR, 'main-flow.ts'), mainFlowTs);
writeFileSync(resolve(OUT_DIR, 'knowledge-entries.ts'), kbTs);

// ============ 4. 摘要输出 ============
console.log(`主流程子流程数: ${flows.length}`);
console.log('子流程顺序:', flows.map((f) => f.name).join(' → '));
console.log('知识库条目数:', entries.length);
console.log('priority 分布:', entries.reduce((acc, e) => ((acc[e.priority] = (acc[e.priority] || 0) + 1), acc), {}));
console.log('输出目录:', OUT_DIR);

# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── docs/                  # 交付文档
│   ├── 对比分析-老系统流程vs范式.md   # 15 子流程↔7 状态机映射、21 条知识库对照、记忆机制差异
│   ├── 移交文档-平台侧最小改动落地建议.md # 平台侧全局变量清单 + 节点模板改造示例 + 验收指标
│   └── 演示用例集.md                  # 可复现演示用例（rule 模式，离线可跑）
├── public/                 # 静态资源
├── scripts/                # 跨平台脚本（.mjs 为主，Windows/macOS/Linux；.sh 保留给 Linux/CI）
│   ├── build.mjs|.sh       # 构建
│   ├── dev.mjs|.sh         # 开发启动
│   ├── prepare.mjs|.sh     # 预处理
│   ├── start.mjs|.sh       # 生产启动
│   ├── validate.mjs|.sh    # 校验（ts-check + lint）
│   ├── import-legacy.mjs   # 老系统流程/知识库数据导入（生成 src/lib/agent/legacy/）
│   ├── import-vehicle-brands.py # 车型库 xlsx → vehicle-brands.generated.ts（Python + openpyxl）
│   └── demo-walkthrough.ts # 演示用例实测脚本（pnpm exec tsx scripts/demo-walkthrough.ts）
├── src/
│   ├── app/
│   │   ├── page.tsx        # 主页：聊天界面 + 三种模式切换 + 双通道编排 + 可调宽调试栏
│   │   ├── layout.tsx      # 根布局（lang=zh-CN）
│   │   ├── globals.css     # Tailwind 4 + shadcn 语义 token（.dark 已定义，业务组件已启用）
│   │   └── api/agent/
│   │       ├── fast/route.ts  # 快通道：SSE 流式（意图+状态决策+话术），精简 prompt + 历史摘要
│   │       ├── slow/route.ts  # 慢通道：非流式 JSON（情绪+实体抽取+护栏复核），完整 prompt + 历史摘要
│   │       └── chat/route.ts  # 旧单通道 SSE 路由（2字符/25ms 节流），保留但前端未使用
│   ├── components/
│   │   ├── ui/             # shadcn/ui 组件库
│   │   ├── chat/           # chat-area.tsx（消息流式渲染）/ chat-input.tsx（输入框 + 停止生成）
│   │   ├── debug/          # debug-panel.tsx（状态机/槽位/决策路径/双通道状态）
│   │   ├── layout/         # top-bar.tsx（通话信息栏）
│   │   └── settings/       # model-settings-panel.tsx（模型参数配置）
│   ├── hooks/use-mobile.ts # 移动端断点判定（<768px）
│   ├── lib/
│   │   ├── utils.ts        # cn()
│   │   └── agent/          # Agent 核心引擎
│   │       ├── types.ts        # 类型定义（状态/消息/槽位/决策/双通道状态）
│   │       ├── knowledge-base.ts # 车辆知识库（266 品牌/1951 车系，仅品牌+车系两级；无类型/动力/价格附加字段——防 LLM 过度询问）
│   │       ├── vehicle-brands.generated.ts # 车型库生成数据（scripts/import-vehicle-brands.py 产出，勿手改）
│   │       ├── asr-corrections.ts # ASR 谐音/热词纠错（20 条规则，来自老系统热词词典）
│   │       ├── intent.ts       # 意图识别 + 实体抽取（先 ASR 归一化，规则引擎降级）
│   │       ├── state-machine.ts # 对话状态机 + 模板话术生成（已确认不回问、否定防误收集）
│   │       ├── summary.ts      # 对话历史摘要 rolling summary（超阈值压缩注入）
│   │       ├── cache.ts        # 固定话术轻量缓存（命中跳过 LLM）
│   │       ├── prompt-builder.ts # 完整版 Prompt 构建（旧，仅 chat 路由用）
│   │       ├── prompt-slim.ts    # 精简 Prompt：buildSlimPrompt / buildSlowPrompt / estimateTokens
│   │       ├── engine.ts        # 主引擎：双通道编排 + 降级 + 状态迁移校验 + 防竞态 + idle 超时 + 护栏复核
│   │       └── legacy/          # 老系统数据导入与能力（import-legacy.mjs 生成 + 手工模块）
│   │           ├── legacy-types.ts      # 导入数据类型
│   │           ├── main-flow.ts         # 15 子流程配置数据（生成）
│   │           ├── knowledge-entries.ts # 21 条知识库配置（生成，按 priority 升序）
│   │           ├── flow-alignment.ts    # 15 子流程 ↔ 7 状态映射表
│   │           ├── matcher.ts           # 优先级匹配器（正则/包含、多答案轮次）
│   │           └── special-tokens.ts    # AI_UNKNOWN/AI_UNKNOWN_END/USER_NOT_ANSWER 计数逻辑
│   └── server.ts           # 自定义服务端入口（next dev，端口 5000）
├── next.config.ts
└── package.json
```

- 项目文件（app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
- 安装依赖：`pnpm add <package>` / 开发依赖 `pnpm add -D <package>`
- 安装所有依赖：`pnpm install` / 移除依赖 `pnpm remove <package>`

## 命令

- `pnpm dev`：开发启动（端口 5000，自动清理占用端口；可用 `DEPLOY_RUN_PORT` 或 `PORT` 覆盖）
- `pnpm build`：Next.js 构建 + tsup 打包 `src/server.ts` 到 `dist/server.js`
- `pnpm start`：生产启动
- `pnpm ts-check`：`tsc -p tsconfig.json` 类型检查
- `pnpm lint` / `pnpm lint:build`：ESLint
- `pnpm lint:style`：stylelint（`src/**/*.css`）
- `pnpm validate`：并行 ts-check + lint:build + lint:style

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### 布局与滚动（踩坑记录，改布局前必读）

- **flex 可滚动容器必须显式 `min-h-0`**（横向则为 `min-w-0`）：否则 `min-height: auto` 会把容器撑到内容高度，`overflow` 滚动永不触发、内容溢出挤压兄弟节点（chat-area.tsx 修复先例）。
- 高度约束用 flex 分配（`flex-1` + `min-h-0`），**不要用 `h-full`/百分比高度链条**（调试栏曾因此错位、右下露白）。
- 根容器用 `h-dvh` 而非 `h-screen`，避免移动端浏览器 UI 遮挡输入区。
- 可折叠/可调节宽度的侧栏：外框直接 `flex flex-col`，内容区 `flex-1 overflow-hidden min-h-0`，子项固定区加 `flex-shrink-0`。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。模型配置等 localStorage 读取必须放在 useEffect 挂载后（page.tsx 先例）。
2. **禁止使用 head 标签**，优先使用 metadata。三方 CSS/字体用 `globals.css` 顶部 `@import` 或 next/font；preload/preconnect 用 ReactDOM 方法。

## UI 设计与组件规范

- 模板默认预装 shadcn/ui（`src/components/ui/`），Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，除非用户指定其他方案。

## Agent 架构说明

汽车营销外呼客服 Agent，三种运行模式（默认 dual 双通道）：

### 运行模式
- **dual（双通道，默认）**：快通道流式出话术 + 慢通道异步出分析，合并到调试面板
- **llm（单通道）**：当前实现直接降级到规则引擎（`responseSource='fallback'`）
- **rule（规则引擎）**：关键词意图 → 模板话术，纯本地

### 双通道流程（`src/lib/agent/engine.ts` + `page.tsx`）
1. 前端 `processWithDualChannel` 启动快通道（`/api/agent/fast`，SSE 流式，精简 prompt `buildSlimPrompt`，fetch 10s abort）；同时插入占位 agent 消息，逐 chunk 更新（打字机效果）。
2. 快通道 `done` 事件 → `buildFinalStateFromFastChannel` 构建最终状态（next_state 经 `normalizeNextState` 非法回退 + `enforceStateTransition` 防倒退/按 intent 设推进下限/姓氏已收集即闭环强制 FAREWELL）。信息收集目标：品牌、车系、城市、看车时间、姓氏（手机尾号不收集，确认客户口头授权即可）。
3. 快通道完成后启动慢通道（`/api/agent/slow`，非流式 JSON：emotion/entities/reasoning/guardrail_check，完整 prompt `buildSlowPrompt`，fetch 16s abort，携带 fast_response 供护栏复核）。
4. 慢通道结果经 `slowResultRef` 缓存、`updateStateWithSlowChannel` 合并（槽位回填、情绪映射、闭环检测），避免被快通道整体覆盖。
5. 降级：快通道失败/超时/非 SSE 响应 → `fallbackToRuleEngine`（`responseSource='fallback'`）；慢通道失败仅标记 `slowStatus='error'`，不影响主流程。
6. 缓存：`cache.ts` 固定话术（greet/farewell/abuse/dislike/wait），命中跳过 LLM，`responseSource='cache'`。

### SSE 事件协议（fast）
`metadata`（tokenEstimate）→ `first_token`（latency）→ `chunk`*（content）→ `done`（fullContent/latency）→ `data: [DONE]`；错误发 `error` 事件。非 `text/event-stream` 响应视为失败触发降级。

### 前端防竞态（page.tsx）
- `generationRef` 代次令牌：重置/新发送递增，进行中回调按代次丢弃，防旧结果覆盖新状态
- `agentStateRef`：回调读取最新状态，避免 setState updater 副作用与陈旧闭包
- `slowResultRef`：慢通道结果合并缓存，重置时清空
- ChatArea 仅在用户接近底部（<80px）时自动滚动，避免流式更新劫持翻阅

### 延迟指标（LatencyMetrics，6 维度）
`promptBuild`（恒 0）、`llmCall`（=total）、`parse`（恒 0）、`firstToken`（首字延迟）、`generation`（=total）、`total`（均来自快通道 done 事件）。调试面板展示双通道状态 `fastStatus/slowStatus/fastLatency/slowLatency` 与 token 估算。

### 后端 API
- 使用 `coze-coding-dev-sdk`（LLMClient/Config/HeaderUtils）调用 LLM
- 环境变量：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（模型参数可被请求体 `model_params` 覆盖）
- 三个路由均带 `[agent-fast]`/`[agent-slow]`/`[agent-chat]` 前缀的完整调试日志（prompt/消息列表/模型参数/原始输出）

## Notes

- 近期主线（git log）：双通道流式 → 防竞态/降级/缓存 → 布局修复（flex `min-h-0`、去百分比高度链条、`h-dvh`）→ 工程化（vitest 单测 117 例）→ 老系统数据导入（legacy/）→ 记忆强化（rolling summary、不回问、护栏复核）。
- 已修复遗留：流式 idle 超时（3s，读循环不再挂起）；"停止生成"交互（AbortController 透出到 UI）；chat-input Enter 检查 `e.nativeEvent.isComposing`；补 aria-label；`<html lang="zh-CN">`；业务组件启用 .dark 语义 token（核心骨架）。
- 已知遗留：流式读取阶段无 idle 超时（读循环挂起）→ 已修复；`<html lang="en">` → 已改 zh-CN；业务组件 .dark → 已启用。
- 新增待办：`USER_NOT_ANSWER`/`AI_UNKNOWN` 的语音信号接入（平台侧，计数逻辑已实现于 `legacy/special-tokens.ts`）；老系统 21 条知识库全量切换进规则引擎（数据已导入 `legacy/knowledge-entries.ts`，当前仍用精简词表）；`<html lang>` 检查；调试面板可补充展示对话摘要与护栏复核结果。

## Agent 架构说明（补充：记忆与老系统对齐）

- 记忆机制：`summary.ts` 超阈值（12 条消息）生成早期对话摘要，经 engine → fast/slow route 注入 prompt（`【历史摘要】…勿重复询问`）；`state-machine.ts` 目标槽位已确认不回问、否定意图不收集实体（防误收集）。快通道 prompt（`buildSlimPrompt`）含提问纪律：按 品牌→车系→城市→看车时间→姓氏 顺序只问缺失的第一项、已收集字段绝不再问、不问动力类型/配置/价格（防止 LLM 过度询问）。
- 护栏复核：慢通道 `guardrail_check` 命中辱骂/反感时，`engine.ts` 强制 FAREWELL 并修正最近 agent 话术为退出话术。
- 老系统对齐：`legacy/` 目录 = 导入数据（15 子流程、21 条知识库）+ 能力模块（flow-alignment 映射表、matcher 优先级匹配器、special-tokens 特殊令牌、asr-corrections 谐音纠错）。映射与对照见 `docs/对比分析-老系统流程vs范式.md`。

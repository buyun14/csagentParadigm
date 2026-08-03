# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 跨平台脚本（.mjs 为主，Windows/macOS/Linux；.sh 保留给 Linux/CI）
│   ├── build.mjs|.sh       # 构建
│   ├── dev.mjs|.sh         # 开发启动
│   ├── prepare.mjs|.sh     # 预处理
│   ├── start.mjs|.sh       # 生产启动
│   └── validate.mjs|.sh    # 校验（ts-check + lint）
├── src/
│   ├── app/
│   │   ├── page.tsx        # 主页：聊天界面 + 三种模式切换 + 双通道编排 + 可调宽调试栏
│   │   ├── layout.tsx      # 根布局
│   │   ├── globals.css     # Tailwind 4 + shadcn 语义 token（.dark 已定义，业务组件未启用）
│   │   └── api/agent/
│   │       ├── fast/route.ts  # 快通道：SSE 流式（意图+状态决策+话术），精简 prompt
│   │       ├── slow/route.ts  # 慢通道：非流式 JSON（情绪+实体抽取+护栏复核），完整 prompt
│   │       └── chat/route.ts  # 旧单通道 SSE 路由（2字符/25ms 节流），保留但前端未使用
│   ├── components/
│   │   ├── ui/             # shadcn/ui 组件库
│   │   ├── chat/           # chat-area.tsx（消息流式渲染）/ chat-input.tsx（输入框）
│   │   ├── debug/          # debug-panel.tsx（状态机/槽位/决策路径/双通道状态）
│   │   ├── layout/         # top-bar.tsx（通话信息栏）
│   │   └── settings/       # model-settings-panel.tsx（模型参数配置）
│   ├── hooks/use-mobile.ts # 移动端断点判定（<768px）
│   ├── lib/
│   │   ├── utils.ts        # cn()
│   │   └── agent/          # Agent 核心引擎
│   │       ├── types.ts        # 类型定义（状态/消息/槽位/决策/双通道状态）
│   │       ├── knowledge-base.ts # 车辆知识库（品牌/车系/动力/车身模糊查询）
│   │       ├── intent.ts       # 意图识别 + 实体抽取（规则引擎降级）
│   │       ├── state-machine.ts # 对话状态机 + 模板话术生成
│   │       ├── cache.ts        # 固定话术轻量缓存（命中跳过 LLM）
│   │       ├── prompt-builder.ts # 完整版 Prompt 构建（旧，仅 chat 路由用）
│   │       ├── prompt-slim.ts    # 精简 Prompt：buildSlimPrompt / buildSlowPrompt / estimateTokens
│   │       └── engine.ts        # 主引擎：双通道编排 + 降级 + 状态迁移校验 + 防竞态
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
2. 快通道 `done` 事件 → `buildFinalStateFromFastChannel` 构建最终状态（next_state 经 `normalizeNextState` 非法回退 + `enforceStateTransition` 防倒退/按 intent 设推进下限/姓氏+手机尾号闭环强制 FAREWELL）。
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

- 近期主线（git log）：双通道流式 → 防竞态/降级/缓存 → 布局修复（flex `min-h-0`、去百分比高度链条、`h-dvh`）。
- 已知遗留：流式读取阶段无 idle 超时（读循环挂起）；无"停止生成"交互；chat-input Enter 未检查 `e.nativeEvent.isComposing`（中文输入法误触）；多处按钮/输入框缺 aria-label；`<html lang="en">` 应为 `zh-CN`；业务组件未启用 `.dark` 语义 token。

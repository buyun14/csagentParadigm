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
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── page.tsx        # 主页 - 汽车营销客服Agent聊天界面
│   │   └── api/agent/chat/route.ts # LLM Agent API 路由
│   ├── components/
│   │   ├── ui/             # Shadcn UI 组件库
│   │   ├── chat/           # 聊天组件
│   │   │   ├── chat-area.tsx   # 聊天消息区域
│   │   │   └── chat-input.tsx  # 聊天输入框
│   │   ├── debug/          # 调试面板
│   │   │   └── debug-panel.tsx # Agent调试面板（状态机/槽位/决策路径/LLM信息）
│   │   └── layout/         # 布局组件
│   │       └── top-bar.tsx     # 顶部状态栏（通话信息）
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   ├── utils.ts        # 通用工具函数 (cn)
│   │   └── agent/          # Agent 核心引擎
│   │       ├── types.ts        # 类型定义（状态/消息/槽位/决策/LLM响应）
│   │       ├── knowledge-base.ts # 车辆知识库（品牌/车系/模糊查询）
│   │       ├── intent.ts       # 意图识别 + 实体抽取（规则引擎降级）
│   │       ├── state-machine.ts # 对话状态机 + 回复生成
│   │       ├── prompt-builder.ts # LLM System Prompt 构建（Harness）
│   │       └── engine.ts       # Agent 主引擎（LLM模式+规则引擎降级）
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## Agent 架构说明

本项目实现了一个汽车营销外呼客服 Agent 原型，支持两种运行模式：

### 双模式架构
- **LLM 模式**：客户输入 → 构建 System Prompt（状态+历史+知识库+护栏）→ LLM 生成决策和回复 → 护栏二次检查 → 输出
- **规则引擎模式**：客户输入 → 关键词匹配意图 → 模板话术 → 输出（降级方案）

### 核心模块 (`src/lib/agent/`)
- **types.ts**：定义所有类型（对话状态、消息、槽位、决策路径、LLM 响应等）
- **knowledge-base.ts**：车辆知识库，支持品牌/车系/动力类型/车身类型的模糊查询
- **intent.ts**：意图识别引擎（规则引擎降级），支持18+种意图类型和实体抽取
- **state-machine.ts**：对话状态机，管理7个主流程状态和4种异常状态，生成回复
- **prompt-builder.ts**：LLM System Prompt 构建器（Harness 核心），分层注入角色/状态/知识/护栏
- **engine.ts**：Agent 主引擎，支持 LLM 模式 + 规则引擎降级，10秒超时自动降级

### 后端 API (`src/app/api/agent/chat/route.ts`)
- 使用 `coze-coding-dev-sdk` 调用 LLM
- 环境变量：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`
- LLM 不可用时返回 200 + error 字段，前端触发降级

### 降级策略
- LLM 调用超时（10秒）或失败 → 自动 fallback 到规则引擎
- LLM 返回格式异常 → 尝试解析，解析失败则用规则引擎
- 调试面板标记当前回复来源（LLM / 规则引擎降级）

UI 组件：
- `src/components/chat/`：聊天界面（消息气泡 + 输入框）
- `src/components/debug/`：调试面板（状态机可视化 + 槽位追踪 + 决策路径 + LLM 信息）
- `src/components/layout/`：顶部状态栏（通话信息 + 模式切换）

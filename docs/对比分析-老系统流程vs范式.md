# 对比分析：老系统流程数据包 ↔ csagentParadigm

> 依据：`相关资料收集/现有系统流程/` 下的 4 个 JSON 数据包（1 主流程 + 3 知识库）与 `csagentParadigm/src/lib/agent/` 实现。
> 数据由 `scripts/import-legacy.mjs` 导入生成 `src/lib/agent/legacy/`，映射结论见 `flow-alignment.ts`（有单测保障）。

---

## 一、老系统是什么

- **形态**：低代码平台工作流，配置驱动（可视化画布 + 优先级知识库）。
- **主流程**：15 个子流程，通过"跳转节点"（`defaultYSquare`，`next="指定主流程 / XX"`）互联。
- **知识库**：21 条按 `priority` 排序的应答规则（`keywords` 正则/关键词 + 多答案 `answers` + `method` 动作）。
- **执行主干**：开场白 → 询问关注品牌 → 询问关注车系 → 预计购车时间 → 询问所在地区 → 信息授权确认 → 询问客户姓氏 → 成功结束。

## 二、范式是什么

- **形态**：代码驱动（Next.js 全栈原型），状态机 + 意图识别 + 槽位 + LLM 双通道编排。
- **7 个主状态**：`GREETING → BRAND_INQUIRY → MODEL_INQUIRY → CITY_INQUIRY → TIMING_INQUIRY → CONTACT_COLLECTION → FAREWELL`，外加 4 个异常态（OFF_TRACK / ABUSE / OUT_OF_SCOPE / UNCLEAR）。

## 三、15 子流程 ↔ 7 状态映射

| 老系统子流程 | 范式状态 | 映射类型 | 说明 |
|---|---|---|---|
| 开场白 | GREETING | exact | 主流程起点 |
| 询问关注品牌 | BRAND_INQUIRY | exact | 确认品牌 |
| 询问关注车系 | MODEL_INQUIRY | exact | 确认车系/车型 |
| 预计购车时间 | TIMING_INQUIRY | exact | ⚠️ 老系统顺序为 车系→时间→地区，范式为 车系→城市→时间 |
| 询问所在地区 | CITY_INQUIRY | exact | 确认看车城市 |
| 询问客户姓氏 | CONTACT_COLLECTION | merged | 与信息授权确认合并 |
| 信息授权确认 | CONTACT_COLLECTION | merged | 确认手机尾号 + 授权 |
| 成功结束 | FAREWELL | exact | 成功闭环告别 |
| 失败挂机 | FAREWELL | edge | 护栏退出路径（abuse/dislike） |
| 挽回1 | BRAND_INQUIRY | edge | GREETING disagree 分支的柔性挽留 |
| 其他购车相关问题 | MODEL_INQUIRY | edge | out_of_scope 引导 4S 店承接 |
| 其他非相关问题 | FAREWELL | edge | 非相关 → 失败挂机语义 |
| 二手车 | OUT_OF_SCOPE | edge | out_of_scope 引导 4S 店 |
| 无声挂机 | VOICE | voice | 语音侧（USER_NOT_ANSWER 计数已实现，信号由平台给） |
| 性别采集 | VOICE | voice | 语音侧/低频，文本范式不覆盖 |

## 四、21 条知识库对照

| 老系统知识（priority） | 范式落地 | 状态 |
|---|---|---|
| 语音助手（5） | cache/意图识别部分覆盖 | ⚠️ 弱对应 |
| 骚扰/骂人/投诉（10，forbid=true） | `abuseWords`/`dislikeWords` + 缓存 `ANY:abuse`/`ANY:dislike` + 慢通道护栏复核 | ✅ 语义对应（词表规模小） |
| 条件不符（15） | `disagree` 分支 | ⚠️ 部分 |
| 客户忙/真的不方便（20） | `waitWords` + 缓存 `ANY:wait` | ⚠️ 不区分"忙"与"稍等" |
| 豪车/同行/调侃客服（20/100） | `out_of_scope` 统一处理 | ⚠️ 坍缩 |
| 无法应答处理 AI_UNKNOWN（100） | `special-tokens.ts`（连续 3 次 → AI_UNKNOWN_END 挂机） | ✅ 完整落地 |
| AI_UNKNOWN_END（100） | `special-tokens.ts` | ✅ 完整落地 |
| 用户不回答 USER_NOT_ANSWER（100） | `special-tokens.ts`（多答案轮次，末轮挂机） | ✅ 完整落地（信号由平台给） |
| 客户要求加微信 appoint_process（100） | 无（仅收尾号进 FAREWELL） | ❌ 未落地 |
| 询问价格/优惠（100，business） | `out_of_scope` 引导 4S 店 | ⚠️ 简化 |
| 怀疑机器人/号码来源/质疑外显/哪家4S（100） | `out_of_scope` 一条话术 | ⚠️ 坍缩 |
| 太远了/不在某地（100） | 无 | ❌ 未落地 |

> 结论：**知识库的"机制"已全部可配置化**（`legacy/matcher.ts` 优先级匹配器支持正则/包含、多答案轮次），老系统 21 条**原始数据已导入**（`legacy/knowledge-entries.ts`），只是规则引擎当前仍主要使用精简词表——接入时可直接切换到全量知识库。

## 五、记忆机制差异（老系统根因 → 范式解法）

| 老系统（低代码平台） | 范式 | 对应能力 |
|---|---|---|
| **无历史上下文变量**：每轮 LLM 裸调用，无法注入"上一轮对话/信息收集清单" | 每轮 prompt 注入 `【状态】+【已收集信息清单】+【最近对话】` | `prompt-slim.ts` |
| 无长对话记忆，只能堆提示词绕路 | 超阈值（12 条消息）自动生成早期对话摘要注入 | `summary.ts` rolling summary |
| 已确认信息会被下一轮推翻/重复追问 | 目标槽位已确认不回问、按 intent 设状态推进下限、禁止倒退、闭环强制 FAREWELL | `state-machine.ts` / `engine.ts` |
| 否定句中提到的品牌会被误收集 | 否定意图（disagree）跳过实体收集 | `state-machine.ts` |
| LLM 输出无复核 | 慢通道异步复核（情绪/实体/护栏），护栏命中强制修正话术与状态 | `engine.ts` evaluateGuardrail |
| ASR 谐音靠提示词堆砌 | 20 条谐音纠错规则在意图识别前归一化 | `asr-corrections.ts` |

## 六、延迟设计（范式 vs 老系统）

| 手段 | 效果 |
|---|---|
| 快通道 SSE 流式（精简 prompt） | 首字延迟可追踪，打字机效果 |
| 慢通道异步（完整 prompt） | 深度分析不阻塞主流程 |
| 缓存固定话术（greet/farewell/abuse/dislike/wait） | 命中 0ms 返回，跳过 LLM |
| 知识库按需注入（只注入当前品牌） | 减小 prompt token |
| 6 维延迟指标 + token 估算 | 验收有量化依据 |
| 快通道失败自动降级规则引擎 | 流程不中断 |

## 七、遗留与边界（如实声明）

1. **语音侧不在职责内**：ASR/TTS/外呼/静音信号源由平台负责；`USER_NOT_ANSWER`/`AI_UNKNOWN` 的计数与动作逻辑已实现（`special-tokens.ts`），信号接入由平台完成。
2. **知识库数据已导入但规则引擎未全量切换**：接入时切换 `matcher.ts` 即可。
3. **city 顺序差异**：老系统为 时间→地区，范式为 城市→时间，需在平台落地时确认业务口径。

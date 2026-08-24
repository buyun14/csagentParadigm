# csagentParadigm → Dify 工作流实现方案

> 目标：把 `csagentParadigm` 参考实现（状态机 + 槽位记忆 + 意图识别 + 护栏 + 双通道）翻译成 Dify Chatflow，供外呼平台接入（ASR 文本进、话术流式出、TTS 播报）。
> 关键洞察：**Dify 的"会话变量"正是老平台缺的"全局变量"**（上一轮对话 / 已收集信息 / 当前节点），本方案即"最小改动落地建议"在 Dify 上的具体实现。
> 日期：2026-08-19

---

## 一、总体设计

### 应用形态

- **应用类型**：Chatflow（对话流），启用会话记忆（Memory）与流式输出（Streaming）。
- **会话粒度**：一通电话 = 一个 `conversation_id`；外呼平台每轮调用 Dify Chat API（`response_mode=streaming`），把 ASR 文本作为 `query` 传入，消费 SSE 流式话术直接送 TTS。
- **模型**：一个"快"模型（与项目一致：`qwen3.6-plus` / `doubao-seed-2-0-mini-260215`），temperature 0.7，max_tokens 150。

### 与项目模块的映射

| csagentParadigm 模块 | Dify 实现 | 说明 |
|---|---|---|
| `intent.ts` 规则层 + `asr-corrections.ts` | **代码节点 A：规则预检**（Python） | ASR 谐音归一化 + 高频固定意图（辱骂/反感/等待/告别/纯问候）命中即返回，跳过 LLM |
| `intent.ts` 语义层 | **问题分类器** | 19 个意图类别，配描述与示例，语义兜底 |
| `state-machine.ts` / `engine.ts` 状态迁移 | **代码节点 B：状态推进 + 槽位合并** | 翻译 `enforceStateTransition`：只进不退、intent 下限、姓氏→FAREWELL |
| `prompt-slim.ts` 快通道 prompt | **LLM 回复节点**（直接输出纯话术文本） | 注入【状态】【已收集】【最近对话】【按需知识库】 |
| 实体抽取（慢通道职责） | **参数提取器** | 品牌/车系/城市/时间/姓氏结构化抽取 |
| `cache.ts` 固定话术 | 代码节点 A 命中分支 + 模板节点 | 辱骂/反感/等待/告别/开场白零 LLM |
| `summary.ts` rolling summary | 会话记忆 + 可选摘要 LLM 节点 | 长对话压缩 |
| `knowledge-base.ts` | 知识检索节点 / 代码节点内置精简表 | 品牌→车系按需注入 |
| 双通道慢通道 | Answer 节点后置分析节点（版本支持时） | 详见"六、双通道的降级适配" |

> Dify 的一个天然优势：**LLM 回复节点直接输出纯文本话术，不需要 JSON 流式提取**（`response-stream.ts` 的问题在 Dify 不存在）——实体由参数提取器单独做，意图由分类器单独做。

---

## 二、会话变量清单（对话变量）

这是整套方案的"记忆载体"，对应老平台缺失的全局变量。

| 变量名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `current_state` | string | `GREETING` | 7 个主状态之一 |
| `exception_state` | string | `NONE` | 异常标签：OFF_TRACK / ABUSE / OUT_OF_SCOPE / UNCLEAR |
| `brand` | string | 空 | 已确认品牌 |
| `series` | string | 空 | 已确认车系 |
| `model` | string | 空 | 具体车型（可选） |
| `city` | string | 空 | 已确认城市 |
| `timing` | string | 空 | 已确认购车时间 |
| `surname` | string | 空 | 客户姓氏（收集到即闭环 → FAREWELL） |
| `phone_tail` | string | 空 | 客户主动报的手机尾号（不主动问） |
| `turn_count` | number | 0 | 轮次计数 |
| `last_exchange` | string | 空 | 上一轮"客服提问 + 客户回复"（可选用） |
| `summary` | string | 空 | 长对话摘要（可选用） |

> 实现建议：**主推独立字符串变量**（各版本兼容性最好）；较新 Dify 版本也支持 Object 类型会话变量，可用一个 `slots` 对象整体读写。槽位读写统一走"变量赋值器"。

---

## 三、工作流节点总览

```mermaid
flowchart TD
    S[开始节点<br/>sys.query = ASR 文本] --> A[代码节点A：ASR归一化 + 规则预检]
    A -->|命中固定话术| C1[条件分支1<br/>precheck_hit=true]
    A -->|未命中| Q[问题分类器<br/>19 类意图]
    Q --> C2[条件分支2<br/>护栏意图?]
    C1 --> T1[模板转换<br/>固定话术]
    C1 --> V1[变量赋值器<br/>更新状态/异常]
    T1 --> R1[直接回复]
    C2 -->|abuse/dislike/farewell/wait| T2[模板转换<br/>退出/等待话术]
    C2 -->|其他意图| C3[条件分支3<br/>按 current_state 分流]
    T2 --> V2[变量赋值器]
    V1 --> R1
    V2 --> R2[直接回复]
    C3 --> KB[知识检索/代码节点<br/>按需注入品牌车系]
    KB --> L[LLM 回复节点<br/>生成纯文本话术]
    L --> P[参数提取器<br/>抽取品牌/车系/城市/时间/姓氏]
    P --> B[代码节点B<br/>状态推进 + 槽位合并 + 校验]
    B --> V3[变量赋值器<br/>写回会话变量]
    V3 --> R3[直接回复<br/>{{LLM.text}} 流式]
    R3 -.版本支持时.-> SL[LLM 慢通道分析<br/>情绪/实体深抽/护栏复核]
    SL --> G[代码节点C<br/>护栏复核修正]
    G --> V4[变量赋值器<br/>强制FAREWELL/修正话术]
    V4 --> H[HTTP 节点<br/>上报指标]
```

---

## 四、节点详细配置

### 1. 开始节点

- 输入：`sys.query`（客户 ASR 文本）；`inputs` 可带 `phone`、`task_id` 等外呼侧字段。
- 开启会话记忆（供 LLM 节点注入最近对话）。

### 2. 代码节点 A：规则预检（Python）

对应 `asr-corrections.ts` + `cache.ts` + `intent.ts` 规则层，零 LLM、零延迟。

```python
# 输入: query (string)
# 输出: normalized_text, precheck_hit, precheck_intent, precheck_response

import re

def main(query: str) -> dict:
    text = query.strip()
    # 1) ASR 谐音归一化（词表从 asr-corrections.ts 翻译，示例）
    corrections = [
        ("未来", "蔚来"), ("蔚莱", "蔚来"), ("小彭", "小鹏"),
        ("一十八", "ES8"), ("毛豆歪", "Model Y"), ("文件", "问界"),
    ]
    for src, dst in corrections:
        text = text.replace(src, dst)

    # 2) 固定意图预检（词表与项目已修复后的 intent.ts 一致，单一来源）
    dislike_words = ["别打了", "不要再打了", "又是推销", "烦死了", "骚扰",
                     "别烦我", "拉黑", "投诉", "举报", "不需要谢谢"]
    abuse_words = ["傻逼", "妈的", "滚", "操", "去死", "神经病", "垃圾",
                   "骗子", "不要脸", "恶心", "智障"]
    wait_words = ["等一下", "稍等", "等会", "现在忙", "在开会", "我想想"]
    farewell_words = ["再见", "拜拜", "挂了", "先这样", "bye"]

    hit = False
    intent = ""
    response = ""

    for w in dislike_words:
        if w in text:
            hit, intent = True, "dislike"
            response = "理解您的感受，那就不打扰了，如果有需要随时联系我们。"
            break
    if not hit:
        for w in abuse_words:
            if w in text:
                hit, intent = True, "abuse"
                response = "不好意思打扰了，祝您生活愉快，再见。"
                break
    if not hit:
        for w in wait_words:
            if w in text:
                hit, intent = True, "wait"
                response = "好的，您先忙，不着急。"
                break
    if not hit:
        for w in farewell_words:
            if w in text:
                hit, intent = True, "farewell"
                response = "好的，稍后会有专人联系您，祝您生活愉快，再见。"
                break

    return {
        "normalized_text": text,
        "precheck_hit": hit,
        "precheck_intent": intent,
        "precheck_response": response,
    }
```

> 完整词表从 `src/lib/agent/intent.ts`（已修复版本）平移；保持"反感先于辱骂、否定优先于超范围"的判断顺序。

### 3. 条件分支 1：规则命中

- `precheck_hit == true` → 模板转换（`precheck_response`）→ 变量赋值器 → 直接回复 → 结束。
- `false` → 进入问题分类器。

### 4. 问题分类器：意图识别（语义层）

输入：`normalized_text`（可拼当前状态："当前处于{{current_state}}，客户说：{{normalized_text}}"）。

类别（19 类，均配 1~3 个示例）：

| 类别 | 描述与示例 |
|---|---|
| greet | 问候：你好 / 喂 / 在吗 |
| agree | 肯定：可以 / 好的 / 嗯 / 是 |
| disagree | 否定/拒绝：不需要 / 不考虑 / 我不是看蔚来 / 不考虑分期（注意"是不是"是疑问不是否定） |
| confirm_brand | 说品牌：我看蔚来 / 比亚迪吧 |
| confirm_model | 说车系/车型：ES8 / 汉 / Model 3 |
| confirm_city | 说城市：我在北京 / 苏州 |
| confirm_time | 说时间：下个月 / 明年 / 年底 |
| confirm_surname | 说姓氏：我姓王 / 姓张 |
| ask_vehicle | 问有哪些车：有什么车 / 哪些车型 |
| filter_vehicle | 按类型/动力筛选：想要SUV / 纯电的 |
| ask_recommend | 求推荐：推荐哪款 / 帮我选 |
| out_of_scope | 超范围：多少钱 / 优惠 / 配置 / 二手车 / 试驾 |
| off_track | 偏离话题：今天天气不错 |
| unclear | 不清晰：啊 / 嗯？ |
| abuse | 辱骂 |
| dislike | 反感：别打了 / 投诉 / 骚扰 |
| wait | 等待：稍等 / 我想想 |
| farewell | 告别：再见 / 拜拜 |
| unknown | 其他 |

> 分类器本质是 LLM 分类，语义能力强；代码节点 A 已把高频固定意图兜住，二者互补。

### 5. 条件分支 2：护栏意图

`intent ∈ {abuse, dislike, farewell, wait}`：

- abuse / dislike → 固定退出话术（模板节点），变量赋值：`exception_state=ABUSE`、`current_state=FAREWELL`。
- wait → 固定"您先忙"，`current_state` 保持不变。
- farewell → 固定结束语，`current_state=FAREWELL`。

### 6. 条件分支 3：按当前状态分流（7 路）

`GREETING` / `BRAND_INQUIRY` / `MODEL_INQUIRY` / `CITY_INQUIRY` / `TIMING_INQUIRY` / `CONTACT_COLLECTION` / `FAREWELL`。

> 折中建议：先用**一个 LLM 回复节点 + 代码节点 B 强校验**（状态只作为 prompt 上下文，推进完全由代码把关），7 路分支留给后续需要"每状态定制话术/知识注入"时再拆。

### 7. 知识注入节点（LLM 前）

- 若 `brand` 非空：检索/返回该品牌车系列表（如"蔚来：ET5、ET7、ES6、ES7、ES8、EC6"）。
- 若 `brand` 为空：返回热门品牌（蔚来/比亚迪/理想/特斯拉/小鹏/问界…），**不要注入全部 266 个品牌**（这是首字延迟的主要优化点）。
- 实现：代码节点内置精简表（50 品牌左右）或 Dify 知识库 + 知识检索节点。

### 8. LLM 回复节点（话术生成）

System Prompt（对应 `buildSlimPrompt`，**输出纯文本话术，不是 JSON**）：

```text
你是汽车营销中心电话客服。口语化、简短、自然。严禁输出"某先生/某女士"称谓，统一称呼客户为"您"。

【状态】{{current_state}}（{{state_goal}}）
【已收集】品牌:{{brand}}、车系:{{series}}、城市:{{city}}、时间:{{timing}}、姓氏:{{surname}}
【知识库】{{kb_series}}
【最近对话】{{会话记忆最后 2 轮}}

【规则】
- 收集目标仅：品牌、车系、城市、看车时间、姓氏。
- 客户最新消息中已提到的字段视为已收集，绝不再问；收集顺序：品牌→车系→城市→看车时间→姓氏，只问第一个缺失项。
- 每轮最多问一个问题；已确认信息不重复确认。
- 否定（不需要/不考虑/不感兴趣）→ 柔性挽留，不要直接退出。
- 辱骂→道歉退出；反感→安抚退出；偏离→拉回；问价格/配置→引导对接4S店；不清晰→追问。
- 不编造车型，不主动问手机尾号/动力类型/配置/价格。
```

User 消息：`{{normalized_text}}`

参数：temperature 0.7、max_tokens 150，开启流式输出。

### 9. 参数提取器（实体抽取）

参数定义（中文描述 + 示例，模型用结构化输出强的型号）：

| 参数 | 类型 | 说明/示例 |
|---|---|---|
| brand | string | 品牌，如"比亚迪"；"汉"无品牌时可为空 |
| series | string | 车系，如"汉"、"ES8" |
| model | string | 车型（可选） |
| city | string | 城市 |
| timing | string | 时间表达（下个月/明年/年底/最近） |
| surname | string | 姓氏（仅"我姓X/X先生"等明确表达） |
| phone_tail | string | 4 位手机尾号（客户主动报时） |

输入可带上当前已收集值作 hint，避免重复抽取。

### 10. 代码节点 B：状态推进 + 槽位合并（核心）

对应 `engine.ts` 的 `updateSlotsFromEntities` + `enforceStateTransition`：

```python
# 输入: current_state, intent, 各实体字段, 现有槽位
# 输出: new_state, exception_state, 各槽位新值, info_complete

STATE_ORDER = {
    "GREETING": 0, "BRAND_INQUIRY": 1, "MODEL_INQUIRY": 2,
    "CITY_INQUIRY": 3, "TIMING_INQUIRY": 4,
    "CONTACT_COLLECTION": 5, "FAREWELL": 6,
}
INTENT_MIN = {
    "confirm_brand": "MODEL_INQUIRY",
    "confirm_model": "CITY_INQUIRY",
    "confirm_city": "TIMING_INQUIRY",
    "confirm_time": "CONTACT_COLLECTION",
    "confirm_surname": "CONTACT_COLLECTION",
    "abuse": "FAREWELL", "dislike": "FAREWELL", "farewell": "FAREWELL",
}
# 车系反推品牌（精简表；全量可用知识库检索替代）
SERIES_TO_BRAND = {"汉": "比亚迪", "ES8": "蔚来", "Model 3": "特斯拉", ...}

def main(current_state, intent, brand, series, model, city, timing, surname,
         phone_tail, old_brand, old_series):
    new = dict(old=old_brand, series=old_series)
    # 否定意图不收集实体
    if intent != "disagree":
        if brand:
            if old_brand and brand != old_brand:
                new["series"] = ""          # 切换品牌 → 清空旧车系
            new["brand"] = brand
        if series:
            new["series"] = series
            if not new.get("brand"):
                new["brand"] = SERIES_TO_BRAND.get(series, "")

    # 状态推进：只进不退 + intent 下限 + 姓氏闭环
    info_complete = bool(new.get("surname") or surname)
    if surname:
        new["surname"] = surname
    best = STATE_ORDER.get(current_state, 0)
    best = max(best, STATE_ORDER.get(intent_min_map.get(intent, ""), -1))
    if info_complete:
        best = max(best, STATE_ORDER["FAREWELL"])
    new_state = next(s for s, o in STATE_ORDER.items() if o == best)
    exception_state = "NONE"
    if intent in ("abuse", "dislike"):
        exception_state = "ABUSE"
    elif intent == "off_track":
        exception_state = "OFF_TRACK"
    elif intent == "out_of_scope":
        exception_state = "OUT_OF_SCOPE"
    elif intent == "unclear":
        exception_state = "UNCLEAR"
    return {**new, "new_state": new_state, "exception_state": exception_state,
            "info_complete": info_complete}
```

### 11. 变量赋值器

把代码节点 B 输出的 `new_state`、各槽位、`turn_count + 1`、`last_exchange`（本轮客服话术 + 客户输入）写回会话变量。

### 12. 直接回复节点

内容引用 LLM 回复节点输出：`{{llm_node.text}}`。流式输出，TTS 直接消费增量。

### 13. 慢通道分析（可选，见第六节）

Answer 后置：LLM 分析节点（`buildSlowPrompt` 同款：情绪/实体深抽/护栏复核）→ 代码节点 C 护栏复核（命中辱骂/反感 → 强制 FAREWELL 并修正最近话术）→ 变量赋值器 → HTTP 上报指标（首字延迟、降级、护栏命中）。

---

## 五、护栏、缓存与降级

| 需求 | 实现 |
|---|---|
| 固定话术缓存 | 代码节点 A 规则预检命中即返回（开场/辱骂/反感/等待/告别） |
| 护栏（辱骂/反感） | 代码节点 A + 问题分类器双保险；命中 → FAREWELL |
| 否定防误收集 | 代码节点 B：`intent == disagree` 不收集实体；意图分类器示例中强化"我不是看蔚来→disagree" |
| 状态只进不退 | 代码节点 B `enforceStateTransition` |
| 信息闭环 | `surname` 收集到 → 强制 FAREWELL |
| LLM 失败 | Dify 节点重试设置 + 外呼平台侧规则引擎兜底（平台已有 NLP 兜底能力） |

---

## 六、双通道的降级适配（如实说明）

项目原版是"快通道流式 + 慢通道异步"。Dify Chatflow 是串行执行，等价适配：

1. **快通道**：LLM 回复节点流式输出话术（直接回复节点），对应首字延迟指标由 Dify API 首个 `answer` chunk 测量。
2. **慢通道**：放在直接回复节点之后的分析节点（情绪/实体深抽/护栏复核，更新会话变量供调试与下一轮参考）。
   - **注意**：Dify 对"直接回复后继续执行"的支持因版本而异——官方文档有"渐进式响应（后台继续处理的同时提供即时确认）"说明，但早期版本存在"Answer 后流程结束"的情况（GitHub issue #8118）。实施前先在小版本上实测：
     - 支持 → 按上图挂后置分析；
     - 不支持 → 慢通道改为独立 Workflow（HTTP 节点调用），或"下一轮开始时携带上一轮分析结果"。
3. **护栏复核**：如果慢通道在回复之后，命中辱骂/反感时只能"下一轮修正"，无法撤回已播报话术；对 TTS 外呼，**强烈建议把护栏判断放到话术之前**（代码节点 A 已兜住高频辱骂/反感词；语义级辱骂靠问题分类器在话术生成前拦截），这样从根上避免"播完才改"。

---

## 七、知识库落地

| 方案 | 做法 | 适用 |
|---|---|---|
| A（推荐起步） | 代码节点内置品牌→车系精简表（50 品牌），LLM 前按需注入 | 演示/冷启动 |
| B | 把 `docs/车型库0602(1).xlsx` 转成品牌-车系文本，导入 Dify 知识库，知识检索节点按品牌检索 | 全量 266 品牌/1951 车系 |
| C | 外呼平台已有车型接口 → HTTP 节点实时查询 | 平台已有数据时 |

原则（与项目一致）：**知识库只提供"品牌有哪些车系"，不注入价格/动力/配置**，防止 LLM 过度询问。

---

## 八、与外呼平台（ASR/TTS）的对接

1. **每轮调用**：
   ```http
   POST /v1/chat-messages
   Authorization: Bearer <Dify API Key>
   {
     "inputs": { "phone": "..." },
     "query": "<ASR 文本>",
     "response_mode": "streaming",
     "conversation_id": "<本通电话的会话ID，首轮为空>",
     "user": "<外呼任务ID>"
   }
   ```
2. **流式消费**：Dify SSE 返回 `message` 事件的 `answer` 增量 → 直接送 TTS 合成队列。首个增量到达时间即"首字延迟"。
3. **会话生命周期**：一通电话固定一个 `conversation_id`；挂机后新建下一通。
4. **语音信号**（静音超时 USER_NOT_ANSWER、AI_UNKNOWN）：由外呼平台注入——可在开始节点用 `inputs.signal` 传入，代码节点 A 处理特殊令牌计数（用会话变量 `ai_unknown_count` / `user_not_answer_count`，逻辑翻译自 `legacy/special-tokens.ts`）。

---

## 九、实施顺序建议

1. **MVP（1 天）**：会话变量 + 代码节点 A（预检）+ 问题分类器 + 1 个 LLM 回复节点 + 参数提取器 + 代码节点 B（状态推进）+ 直接回复。跑通 6 字段闭环（品牌→车系→城市→时间→姓氏→FAREWELL）。
2. **加固（1 天）**：护栏分支、否定防误收集、固定话术缓存、品牌切换清车系、车系反推品牌。
3. **优化（0.5~1 天）**：知识注入（去掉 266 品牌全量注入）、状态分流 7 路定制 prompt、慢通道后置分析（版本允许时）、指标上报。

---

## 十、与项目既有缺陷的对应

在 Dify 侧实现时直接采用已修复版本的行为：

- 否定优先于超范围/问候（"我不是看蔚来"→disagree，"不考虑分期"→disagree）；
- 时间识别覆盖 明年/今年/下个月/年底；
- 缓存词表与意图词表单一来源（代码节点 A 与分类器示例一致）；
- 状态只进不退、姓氏闭环强制 FAREWELL；
- 话术纯文本流式（天然规避"JSON 打字机"问题）。

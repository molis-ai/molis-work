# 对话与执行流式体验（Coding 插件 + 个人助理）

状态：需求已整理，待实施（2026-11-18；需求维护：Antigravity，实现：第 91 批主会话）。已与[全产品界面、空间布局与行为反馈深度打磨](../product-experience-polish/spec.md)合并统筹，排期为路线书[第 91 批（第一段 91A）](../post-anticorruption-roadmap/reference/batches/91.md)（紧邻续批为[第 91B 批](../post-anticorruption-roadmap/reference/batches/91b.md)，[决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）。

- **档位与分类**（[开发流程 §1.1、§1.2](../post-anticorruption-roadmap/reference/development-workflow.md#1-分档分类与决策)）：大需求；体验与效果（流式动画、滚动物理、运行时热路径）、横向能力（Design System 流式与滚动原语、平台插件运行流订阅、Agent Host 事件流）、产品线（个人助理、Coding）。
- **决策标记**：要决策——① 上游 `molis-prologue` 改动是否授权随第 91 批窗口外换一次 `vendor/prologue-sdk`（若不跨窗口换包，上游改动先合入 `molis-prologue` 主线，包随[第 62 批](../post-anticorruption-roadmap/reference/batches/62.md)窗口二换入，`molis-work` 侧照常闭环）；② 若思考折行或紧凑命令尾窗超出组件板 `/__ui/catalog` 既有控件形态，按开发流程第 5 节先出样拍板；③ `CUI-09` 本人看实物走查。其余直接做。
- **相邻的线**：承接 [35-2](../post-anticorruption-roadmap/reference/batches/35.md#batch-35-item-2)（Coding A 期）、[36A](../post-anticorruption-roadmap/reference/batches/36a.md)（底栏第十三版壳层、Coding 逐屏前后半、动效曲线收口）、[37-2](../post-anticorruption-roadmap/reference/batches/37.md#batch-37-item-2)（按事项工作台状态与每事项主对话）及 [58](../post-anticorruption-roadmap/reference/batches/58.md)／[59](../post-anticorruption-roadmap/reference/batches/59.md)（子代理公共交互组件）；产出的横向原语与流式订阅能力供 Alchemist、灵光、创作台生成插件及后续 [43-1](../post-anticorruption-roadmap/reference/batches/43.md#batch-43-item-1)（项目助理团）、[66](../post-anticorruption-roadmap/reference/batches/66.md)（Coding 自检与多代理评审）直接复用。
- **预警触发条件**（开发流程 §6）：① 插件流式路由／运行流合同形状变更影响其他插件消费者；② 页面单资源体积一次增长超过 `10 KB` 或新增页面资源（红线，先问用户）；③ 触碰回环鉴权、插件页隔离或撤权断流等安全不变量。

---

## 1. 目标与边界

本需求解决 **Coding 插件（`plugins/native/coding`）与个人助理（`apps/workbench` + `apps/local-host/src/assistant`）** 在真实 AI 执行过程中的端到端动态对话体验：让流式输出具备水墨生长般的连续动画感，让长会话刷新与回滚丝滑跟手（60/120fps），消除底层传输轮询与主线程阻塞，并在静态版式收折之上补齐关键执行信号、去除过程重复。

### 与第 36A 批（逐屏打磨）的边界分工

- **[第 36A 批](../post-anticorruption-roadmap/reference/batches/36a.md)（[逐屏打磨方案](../screen-polish/spec.md)）负责静态骨架与分区收折**：底栏第十三版（账户条、固定居中输入框、右侧卡叠）、对话栏与右侧信息栏分区、去掉「这一轮没用技能」提示（POLISH-19）、回复各处均渲染 Markdown（POLISH-20）、Coding 准备卡／材料卡与回合结束卡就绪后收成单行（POLISH-24）、Coding 正文列对齐输入框及底排收敛（POLISH-25、28）、全站散落曲线收进令牌（POLISH-33～37）。
- **本需求（第 91 批）在 `35-2 + 36A + 37-2` 落定的新壳层与卡片之上，专职解决动态执行与流式内核**：
  1. **流式动画与状态连续性**：消除网络突发块整句蹦字、新帧掐断旧帧 `.mw-fresh` 动画、首字跳过渐显、内联 Markdown 闭合二次重闪、流式代码块第 19 行反向折叠跳变、工具状态环重建导致旋转归零与文字横跳。
  2. **实时增量传输与热路径性能**：将插件运行实时流提升为平台公共能力；消除个人助理 `500ms`（2Hz）长轮询、每次唤醒双倍 `service.read` + 40 次跨插件对象 RPC 重查与全量重算 30 轮 Markdown；消除 Coding 快照轮询的 `O(N²)` 重复解析与等待子代理期间界面静止；消除 Agent Host 每 delta 双倍 `structuredClone` 与 Prologue SDK 展示帧被主线程同步 `fsyncSync` 阻塞。
  3. **滚动物理与多会话状态稳态**：根治 Coding 在 `detached` 阅读态下 `overflow-anchor: none` 与未测量 `content-visibility: auto` 叠加导致的向上回滚巨幅弹跳；补齐 `molisFollow` 微阻尼追底、底部折叠展开联动、跨对话／事项切换的独立滚动记忆，消除读写交错的强制同步重排。
  4. **执行过程信号精修**：将 `reasoning` 思考流从工具调用列表中分离为独立轻量折行；补齐大文件工具生成期目标预览与长耗时命令实时尾行；对接已合入的[子代理公共交互组件](../subagent-interaction/spec.md)（58／59 批）实时推送进展。

### 硬约束（不可违背）

- **单主人、插件同等待遇与调用链**：模型与运行调用只经 `horizontal/agent-host`；跨模块只走 `packages/contracts` 与 `packages/plugin-sdk` 公开合同；不建第二套会话或运行状态机（[SSOT 矩阵](../../docs/SSOT-MATRIX.md)）；插件运行流走统一平台合同与 `molisWorkRequest` 客户端，不写裸浏览器 `fetch` 或裸 `new EventSource`，不给 Coding 开宿主私路。
- **Prologue 无 UI 与安全底线**：上游 `molis-prologue` 保持纯无 UI 内核与 29 个封闭模块；进度落盘屏障置于 `session/core/run.ts` 内部——仅纯展示增量可超前内存广播，凡持久事件（工具调用／结果、进入 `awaiting-*`／`pending-*`、状态控制、模型切换与终态结算）必须在 `onProgress` 落盘完成后才对外可见，`seal()` 前冲刷齐平，绝不削弱恢复与未知副作用对账。
- **Soft Workbench 视觉与性能纪律**（[`DESIGN.md`](../../DESIGN.md)、[界面工艺规范](../craft-finish/spec.md)、[视觉与 UI 体验](../visual-ui-experience/spec.md)）：严守固定字阶、字重、圆角阶梯与语义色彩变量（琥珀只表示「轮到你」）；仅使用设计系统时长与曲线令牌，`prefers-reduced-motion: reduce`、`[data-craft-still]` 与 `navigator.webdriver` 下动效归零／单帧到位；严禁在大容器锚定 `:has()` 或 `:has()` 后接裸标签；单一滚动主人 `window.molisFollow`，保持全局隐藏滚动条；用户手动展开的 `<details>`（`data-user-toggled`）完成时不自动合上（守 `VUX-13`）；界面文字全部走 `t("<owner>.<place>.<element>", args)`；守住健康门禁与单资源 `+10KB` 体积门禁。

---

## 2. 产品检查

- **从用户的结果倒推**：用户在个人助理底栏输入框或 Coding 输入框输入诉求并回车发送 → `<16ms` 当帧即看到自己的消息上屏与柔和旋转的状态环 → 模型思考、调工具、跑命令与流式回复连续平滑生长，需要细看时可随时向上滚动阅读而不被新字拉回底部 → 中途切换事项／会话、断网重连或重启窗口后，按版本无损接上最新状态且恢复各自的阅读位置。
- **每一步都站得住，不新增打断**：本需求是纯体验与性能升级，不增加任何确认框、模式开关或设置项；既有审批卡、提问卡与 Coding 范围重叠确认（`scope-check`）完全沿用已有授权与回执。
- **AI 与平台边界**：模型提示词、工具权限与上下文策略一字不改，全部放在 [Prologue 手册](../../docs/platform/PROLOGUE-AI.md)既定层；不在 UI 层猜模型意图或掩盖未知副作用。
- **覆盖完整路径**：首次发送（空会话首轮）、历史会话二次重开（`reveal: false` 不重播渐显）、输入法组合态（IME 回车选词不误发）、发送前取消或校验失败回退草稿、超过 20 秒慢响应安静提示、撤权／切账号／删项目即时断流、中英文双语与浅深色均完整覆盖。

---

## 3. 开工前检查

| # | 检查项 | 结论 |
| --- | --- | --- |
| 1 | **事实主人** | 会话与运行事实唯一归 `horizontal/agent-host`（底层由 Prologue Session/Run 拥有）；个人助理工作与轮次归 `apps/local-host/src/assistant`；Coding 会话归 `plugins/native/coding`。SSE 流与前端缓冲只是运行视图的只读增量投影，不落第二份状态库。 |
| 2 | **插件同等待遇** | 插件实时运行流与只读事件流在 `packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime`、`apps/local-host/src/plugin-route-stream.ts`、`packages/ui-host/src/request-client.ts` 与 `horizontal/agent-host` 做成统一平台能力；内置与第三方插件用同一份 Manifest 路由声明、SDK 辅助与 `molisWorkRequest` 客户端，不加任何只认 Coding 的宿主分支或构建期接线。 |
| 3 | **能力注册** | `horizontal/agent-host` 在自有目录登记运行流订阅能力（或扩展现有 `agent.runs.*` 合同），沿用调用上下文可信身份（`pluginFor(context)`）、`scheduling: "concurrent"`、每帧写出前 `assertAuthorityCurrent()` 与 `waits.hold(caller.install_id)` 并发槽位限制。 |
| 4 | **合同** | 处于 M1 之前（合同阶段一，不留兼容期，同批改完消费者）：扩展插件流式路由合同（支持受控 SSE 事件流及 `Last-Event-ID`／`since` 游标）与 `agent-host` 运行增量订阅合同；按轨道规则 1 在本批分支先落合同并跑 `pnpm api:update`、`pnpm actions:update`，最终头请公共合同台（C 轨）合审。 |
| 5 | **放在哪个包** | 流式平滑与滚动原语放 `packages/design-system/src/browser/`；请求流辅助放 `packages/ui-host/` 与 `apps/workbench/src/browser/event-stream.ts`；插件合同与宿主桥接放 `packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime` 与 `apps/local-host/src/plugin-route-stream.ts`；运行增量分发放 `horizontal/agent-host`；助理与 Coding 各自消费，依赖方向严格自上而下。 |
| 6 | **表与存储** | 不涉及（不新增或修改任何 SQLite 表或带版本持久化结构；Markdown 增量缓存与流式缓冲均为纯内存有界结构）。 |
| 7 | **兼容与迁移** | 不涉及（不加任何历史读取兼容分支或数据迁移；保留 `/wait` 作为同版本断流／环境降级回退通道，非旧数据兼容）。 |
| 8 | **安全边界** | 触及本机 HTTP 流式鉴权与插件页隔离：① 浏览器端一律经 `molisWorkRequest(..., { as: "response", signal })` 附带 `x-molis-work-page-session` 同源凭证（禁裸 `fetch` 与无法带头的 `new EventSource`）；② `/api/assistant/works/:id/stream` 沿 `assistant-http.ts` 拒绝 `pluginPageRequest(request)`；③ 插件与助理流在每次推送前核对当前权限，账号切换、撤权、项目删除或插件停用时立即销毁流并释放等待槽；同步更新 `docs/system/SECURITY-INVARIANTS.md` 并补断言「拒绝／断流」本身的测试。 |
| 9 | **调用次数** | 显著下降：一次对话执行从「每 `500ms` 发起 1 次 HTTP + 每次唤醒 2 遍 `service.read` + 最多 40 次跨插件对象 RPC」降为 **1 条长连接 SSE + 文本流期间 0 次跨插件对象 RPC + 仅占用 1 个 `installationWaits` 槽位**（不再消耗每分钟动作调用次数上限）；Coding `awaiting-review` 从每帧重复查询降为按 `runId:updatedAt` 单次查询；后台隐藏页签不轮询。 |
| 10 | **升级与数据** | 已保存的助理对话、Coding 会话、运行账本与设置格式完全不变；升级后历史轮次照常按 `reveal: false` 直接打开，进行中运行按既有恢复链对账。 |
| 11 | **成果与过程项** | 不涉及（思考折行、工具目标预览与命令尾行均为运行过程的实时界面呈现，不写入成果库或新增过程项类型）。 |
| 12 | **页面、外壳与文字** | 插件仍在工作台既有挂载位内渲染，不出整页；跨模块不新增未登记 DOM 事件；所有新增提示词（如 `已思考 N 秒`、慢响应安静提示、流式重连提示）均按主人放入 `locales/<lang>.json` 并用 `t(...)` 读取，过零 AI 基础文案四查，覆盖中英文；颜色与动效只取语义令牌；严控单资源体积（目标零超限，确超 `10 KB` 先问用户）。 |
| 13 | **错误** | 流式通道若需新增错误码，统一用 `defineErrorCodes` 在对应主人模块声明并登记 `tooling/gates/error-owners.json`，不写 `Error` 子类。 |
| 14 | **冲突面** | 跨 C1（`packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime`、`tooling/gates/api/`）、C2（`horizontal/agent-host`、可选 `vendor/prologue-sdk`）、D（`packages/design-system`、`packages/ui-host`、`/__ui/catalog`）、A（`apps/local-host/src/assistant`、`assistant-*.ts`）与 B（`plugins/native/coding`）；在一批一个 PR 内按 `C1/C2 + D → A + B` 子分支先后叠，开工前在 `#1743` 核对同轨独占文件与快照空闲。 |
| 15 | **全局最优** | 见下表五场景比选与 §3.1 平台能力检查。曾比较「只给 Coding 和助理各写一套私有轮询节流」与「下沉 `molisStreamText` v2 + `molisFollow` + 平台运行 SSE 流」：前者改动小但保留 2Hz 延迟、动作频率上限风险与重复代码，后者让 C1/C2/D 多做一层窄口，换来全平台插件、助理及后续 43-1／66 一次受益且调用次数降一个量级，选后者。 |

**第 15 项五场景逐项核对：**

| 场景 | 结论 |
| --- | --- |
| **插件** | Alchemist、灵光、Jelly、创作台生成插件与第三方沙箱插件均可经同一份 Manifest 流式路由声明、`agent-host` 运行流订阅与 `molisWorkRequest` 消费实时增量，无需手写轮询或任何内置特权。 |
| **平台** | 流式帧平滑、恒定状态环、滚动跟随归 `packages/design-system`；请求鉴权与 SSE 帧解析归 `packages/ui-host`／`apps/workbench`；运行增量与权限断流归 `horizontal/agent-host` 与 `apps/local-host/src/plugin-route-stream.ts`。 |
| **助理** | 个人助理在 `36A` 底栏第十三版与 `37-2` 每事项主对话上直接消费单连接 SSE 与增量 Markdown 缓存；无界面后台任务与 CLI／MCP 调用仍走原动作与存储，结果与授权完全一致。 |
| **各类平台能力** | 直接复用统一输入框（10／11／36A）、子代理公共交互组件（58／59）、动作授权与撤权边界；不重造呈现组合、能力包或工作记录写入面。 |
| **后续开发** | 后续 [43-1](../post-anticorruption-roadmap/reference/batches/43.md#batch-43-item-1)（项目助理团多任务并发汇报）、[53-1](../post-anticorruption-roadmap/reference/batches/53.md#batch-53-item-1)（回执交互余项）、[66](../post-anticorruption-roadmap/reference/batches/66.md)（Coding 多代理评审流）直接复用本批流式与滚动底座，新增同类流式视图只需声明路由并调用 `molisStreamText` + `molisFollow`。 |

### 3.1 平台能力检查（开发流程 §4.1）

1. **别的插件会不会也要做？** 会：除 Coding 与个人助理外，Alchemist、灵光、创作台（48／77）及项目助理团（43-1）均有长耗时 Agent 执行与流式反馈场景。
2. **平台里有没有现成的？** 现有 `packages/ui-host/src/request-client.ts` 已有 `molisWorkRequest(..., { as: "response" })` 与 `POST` NDJSON `molisWorkRequest.stream`（对应 `apps/local-host/src/plugin-route-stream.ts`），`apps/workbench/src/browser/event-stream.ts` 已有 `readEventStream`，`horizontal/agent-host/src/run-actions.ts` 已有单次变化的 `agent.runs.wait@1`；但插件路由尚不支持长连接 SSE 事件流，`agent-host` 尚无单槽位持续增量订阅。
3. **是不是「插件之间怎样协作」的问题？** 不是插件互调，而是「插件与平台 `agent-host`／UI 宿主之间怎样推送实时运行进展」的公共底座问题。
4. **第三方插件能不能用同样的方式做到？** 若只在宿主里给个人助理和 Coding 开专用流式分支，第三方与沙箱插件只能退回高频调 `agent.runs.wait@1`（还会撞每分钟调用上限）；补齐平台流式路由与 `agent-host` 运行流窄口后，第三方插件用完全一致的 Manifest 声明与 SDK 即可做到。
5. **助理和 Agent 能不能发现、调用它？** 无界面调用方（助理后台、工作流、MCP）继续调用既有的 `agent.runs.read@1`／`agent.runs.wait@1` 动作；SSE 增量流专供已获准的页面与插件视图实时订阅同一份运行事实。

- **平台能力结论**：**现在收进平台**——将「`agent-host` 单槽位运行增量订阅 + 插件受控 SSE 流式路由 + 浏览器端带会话凭证的 `readEventStream` 消费」作为平台公共能力在 `91-2`（含 C1 合同先行）一次补齐，个人助理（`91-3`）与 Coding（`91-4`）作为首批消费者叠在后面。

---

## 4. 现状根因诊断（代码核实）

1. **传输、流式合同与运行时热路径**：
   - 个人助理 `apps/workbench/src/scripts/client/assistant-follow.ts` 硬编码 `500ms` 轮询间隔；`apps/local-host/src/assistant/assistant-wait.ts` 每次唤醒执行 2 次完整 `service.read`（含 `assistant-work-reads.ts` 最多 40 次跨插件对象 RPC 读取）与 2 次整视图 JSON SHA-256，且服务端 `assistant-view-html.ts`（最近 30 轮对话富文本）无缓存、每 `500ms` 全量重算 Markdown，客户端 `assistant-process.ts` 亦随每次快照重刷过程组。
   - Coding `plugins/native/coding/src/routes-timeline.ts` 与 `rich-html.ts` 每次轮询对流式增长正文从头做 Micromark 解析（`O(N²)`），同时下发冗余的 `text` 与 `html`，且 `coding.live` 快照不含 `subagents` 与 `taskboard_plans`（`horizontal/agent-host/src/run-wait.ts` 未监听子运行推进）；同时 `packages/contracts/src/platform/plugin-manifest.ts` 与 `apps/local-host/src/plugin-route-stream.ts` 目前仅允许 `POST` + `ndjson`（限 10,000 行／1 MiB 且只透传 `{ stage, progress, text_delta }`），插件若高频轮询 `agent.runs.wait@1` 还会消耗每分钟动作调用配额。
   - `horizontal/agent-host/src/adapters/prologue-run-store.ts` 在每个 `text-delta` 执行至少 2 次整棵运行视图 `structuredClone`；`prologue-stream.ts` 未映射 `subagent-started`／`subagent-ended`。
   - 上游 `molis-prologue` 的 `packages/sdk/src/session/core/run.ts` 在分发 `text-delta`／`reasoning-delta` 前同步等待 `run-journal.ts` 全量序列化整本事件账、AES-256-GCM 加密与主线程 `fsyncSync`；模型流解析器（`packages/sdk/src/model/plugin/anthropic-compatible.ts`、`openai-compatible.ts`）将工具参数缓冲至块结束（OpenAI 兼容单工具甚至拖至 `[DONE]`）才发出，大文件写入工具生成期出现 5～25 秒静默空窗；前台长命令无增量尾行输出。
2. **流式动画与状态切换断裂**：
   - `packages/design-system/src/browser/stream-text.ts` 无 `requestAnimationFrame` 速率缓冲，且每次调用入口强制对所有活跃 `.mw-fresh` 片段执行 `finish()`，在快于 `90ms` 的流式帧下提前掐断渐显动画。
   - `assistant-conversation.ts` 与 `plugins/native/coding/src/browser/main/run-turn.ts` 在新回复首个文本块传 `reveal: false`；内联 `**粗体**`、`` `代码` `` 闭合替换父节点时，已读字符被二次施加 `blur(2px)` 渐显。
   - `apps/workbench/src/assistant-text-parts.ts` 与 `apps/workbench/src/scripts/client/assistant-code-grow.ts` 在流式代码块到达第 19 行时突加 `data-folded`（`max-height: 300px`）引发高度反向坍塌，无语言 JSON 围栏闭合时重建 `<figure>`；发送按钮点击后需等待两次串行 HTTP 往返才上屏用户消息。
   - Coding `timeline.ts` 每次更新工具文案重写 `summary.innerHTML` 导致 `.mw-spinner` 旋转归零，`styles.ts` 残留 `animation: none` 配 `background-size: 200%` 死渐变文字；助理 `assistant-process.ts` 在 2 步以上折叠组丢失动态状态环，完成时将 `20px` 状态环硬替换为 `13px` 图标导致 `7px` 文字横跳并打断收束动画。
3. **滚动跳变与同步重排**：
   - Coding `styles.ts` 同时设置 `.coding-turns { overflow-anchor: none }` 与 `[data-run] { content-visibility: auto; contain-intrinsic-size: auto 480px }`，向上回滚经过真实高度远大于 `480px` 的历史轮次时产生巨幅视口下跳。
   - 助理切换对话未按会话／事项保存恢复 `{ scrollTop, followState }`；助理 `render()` 与 Coding `runs.ts` 存在几何读取与 DOM 写入交错及缺少签名守卫的重复重绘。

---

## 5. 分片实施方案与子分支序列

按[开发流程第 8.4 节](../post-anticorruption-roadmap/reference/development-workflow.md#batch-grouping)在 `batch/91`（91A）上按子分支先后叠（全批一个 PR，合同与组件板标本先行；按[决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)，`91-1` 与 `91-4` 并入[全产品界面、空间布局与行为反馈深度打磨](../product-experience-polish/spec.md)的底座与 Coding 剩余微瑕，并追加第 5 个子分支 `91-5` 同步更新后续开发指引与创作台规范）：
1. **`91-2`（C1 + C2 轨，合同先行）**：先落插件流式路由与 `agent-host` 运行流订阅公开合同并更新 API／动作快照，再实现 `agent-host`／宿主流桥接与（获批时的）上游 `molis-prologue` 热路径优化。
2. **`91-1`（D 轨，可与 `91-2` 的 C2 实现并行）**：实现 `packages/design-system` 流式平滑、恒定状态环过渡、`molisFollow` 微阻尼追底，并与 `product-experience-polish` 的微交互脚本、布局与行为反馈底座一并补齐 `/__ui/catalog` 标本（经 D 轨合审）。
3. **`91-3`（A 轨）**：叠在 `91-1 + 91-2` 及 `36A` 壳层、`37-2` 之上，落地个人助理 SSE 增量流、段落级 Markdown 缓存、乐观上屏与滚动记忆。
4. **`91-4`（B 轨）**：叠在 `91-1 + 91-2` 及 `35-2`、`36A-4` 之上，落地 Coding SSE 增量流、200 轮零跳变回滚、独立思考折行、过程信号精修及 Coding 剩余微瑕清零。

### 91-1 · Design System 流式、布局与行为反馈统一底座（CUI 流式部分，D 轨）

1. **`molisStreamText` v2（`packages/design-system/src/browser/stream-text.ts`）**：
   - **保持同步返回签名兼容**：保留 `molisStreamText(container, html, options): StreamTextResult` 同步契约不变，在此基础上提供基于 `requestAnimationFrame` 的自适应释放缓冲（`molisStreamPacer` 或可选 `pace` 模式含同步 `flush()`）：吸收网络突发大包，短队列逐词细腻释放，长队列自动加速追赶（最大视觉延迟 `≤ 120ms`，流结束当帧 `flush()` 收尾）。
   - **在途波浪动画不断裂**：保留正在播放 `90ms` `.mw-fresh` 的在途片段（最多 `LIVE = 6` 个片段呈连续波浪落定），不再在每次调用入口对未播完片段一刀切 `finish()`。
   - **首块渐显与内联闭合零重闪**：按已渲染纯文本长度对齐前缀；新生成回复首块即启用渐显与 `data-streamed`（**本条显式更新并取代 `VUX-14`／`tests/stream-text.e2e.test.ts` 中「首块不挂 `.mw-fresh`」的旧断言**；打开已完成的历史轮次仍传 `reveal: false` 不重播动画）；内联 `**粗体**`、`` `代码` ``、链接闭合导致父节点提升时，已显示过的字符不再二次施加 `blur(2px)` 渐显；流式尾部悬挂控制符平滑过渡。
2. **恒定状态环原位过渡**：
   - 提供并统一使用不销毁状态环 DOM 的原位更新原语：运行中、审批等待、完成、失败与取消均保持同一 `20px` 槽位与节点身份，仅切换 `[data-mw-state]` 与旁侧文案节点，保留 CSS 分段收束动画与连续旋转相位。
3. **`molisFollow` 微阻尼追底与展开联动（`packages/design-system/src/browser/scroll-follow.ts`）**：
   - 单行流式增长逐帧零延迟贴底；单帧高度跃迁 `> 28px` 时在 `following` 态做 `~100ms` 临界阻尼追底；**在 `prefers-reduced-motion: reduce`、`[data-craft-still]` 或 `navigator.webdriver` 下保持单帧立即贴底**（与 `VUX-26` 及 `tests/scroll-follow.e2e.test.ts` 一致）；**任何用户 `wheel`、`touchmove`、向上 `scroll`、键盘翻页或文本选区输入在首个事件当即取消在途阻尼追底并切入 `detached`**（守住 `#2124` 不抢滚轮）；底部 `<details>` 展开期间同步轻推滚动。
4. **组件板标本（`/__ui/catalog`）**：补齐突发流平滑吐字、内联 Markdown 闭合零重闪、状态环连续流转与微阻尼追底交互标本。

### 91-2 · 平台运行流合同、Prologue 与 Agent Host 流式热路径减负（C1 + C2 轨）

1. **平台级运行流订阅与受控插件 SSE 路由（C1 + C2）**：
   - 扩展 `horizontal/agent-host` 运行流订阅接口与插件流式路由合同（`packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime`、`apps/local-host/src/plugin-route-stream.ts`、`packages/ui-host/src/request-client.ts`）：整条订阅连接仅占 1 个 `waits.hold(caller.install_id)` 槽位，支持 `since`／`Last-Event-ID` 断线续接；每帧经 `withPluginInteraction` 净化并在写出前执行 `assertAuthorityCurrent()`；遇 `response.writableNeedDrain` 自动合并背压增量帧；客户端断连（`close`／`AbortSignal`）、账号切换、权限撤回、项目删除或插件停用时立即终止流并释放资源。浏览器侧统一走 `molisWorkRequest(..., { as: "response", signal })` + `readEventStream`（或封装于 `molisWorkRequest` 的同源流方法），严禁裸 `fetch` 或裸 `new EventSource`。
2. **Prologue 展示帧与持久帧屏障解耦（上游 `molis-prologue`）**：
   - 持久性屏障严格置于 `molis-prologue/packages/sdk/src/session/core/run.ts` 内部：**仅纯展示增量**（`text-delta`、`reasoning-delta` 及工具参数／前台命令流式预览）可将内存 `published` 游标推进至 `savedPrefix` 之前立即通知订阅者，底层 `run-journal.ts` 按有界异步批次合并加密落盘；**凡持久事件**（`tool-call`、`tool-result`、`awaiting-*`、`pending-*`、`agent-control`、`model-switched` 与终态事件——含 `loop-model-call.ts` 的 `startEarly` 工具派发与 `loop-state.ts` 的同步等待态切换）一律阻塞 `published` 直至 `onProgress` 将其连同前缀一并落盘完成，`seal()` 在置 `sealed = true` 前冲刷至 `published`。
3. **工具生成期与前台长命令增量可观察性（上游 `molis-prologue` → `horizontal/agent-host`）**：
   - Anthropic 与 OpenAI 兼容流解析器在识别工具调用块起点时即发出轻量开始事件，参数流式拼装期间节流发出有界字节数与 `path`／`file_path`／`command` 前缀预览，修复 OpenAI 兼容单工具调用拖至 `[DONE]` 才发出的延迟；补齐审批通过后的执行态同步与前台长命令节流尾行输出（最新 1～3 行与字节数）。
4. **Agent Host 热路径去重克隆与子代理流映射（`horizontal/agent-host`）**：
   - 消除 `PrologueRunStore.publish` 在每个 `text-delta` 上的双倍全量 `structuredClone(record.view)`；修复 `prologue-stream.ts` 漏处理 `subagent-started`／`subagent-ended`（对接 58／59 批公共子代理组件与 `run-wait.ts`／运行流唤醒）。
   - **换包边界**：若用户批准随第 91 批窗口外换包，按规范更新 `vendor/prologue-sdk/`（含 `.sha256`、`.provenance.json` 与全部金样回放）；若不跨窗口换包，`molis-work` 侧先行接好 `AgentHost` 可选事件映射、UI 呈现与模拟端口验证，上游 `molis-prologue` 改动合入主线并登记随[第 62 批](../post-anticorruption-roadmap/reference/batches/62.md)窗口二换入做真模联调。

### 91-3 · 个人助理 SSE 实时增量流、乐观上屏与对话流精修（A 轨）

基于 `36A` 底栏第十三版（「对话栏 + 右侧信息栏 + 卡叠」）与 `37-2` 按事项主对话基线实施：

1. **单连接受控 SSE 增量流（`apps/local-host/src/assistant` + `assistant-follow.ts`）**：
   - 新增 `/api/assistant/works/:id/stream` SSE 通道（保留 `/wait` 回退），客户端经 `molisWorkRequest(url, { as: "response", signal })` + `readEventStream`（`apps/workbench/src/browser/event-stream.ts`）消费，彻底移除 `500ms` 轮询下限；服务端沿 `assistant-http.ts` 拒绝 `pluginPageRequest(request)`（同步登记 `SECURITY-INVARIANTS.md` 并附拒绝测试），支持 `writableNeedDrain` 背压合并，并在权限失效、账号切换或工作清理时立即关流。
   - 按 `16ms～24ms` 微批推送活跃轮次增量帧（`turn-delta`、`activity-upsert`、`phase`、`usage`），流式文本期间跨插件对象重复 RPC 为 0，仅在发生 `change` 动作完成或轮次收尾时重读关联对象。
2. **段落级增量 Markdown 缓存**：
   - 为服务端 30 轮富文本渲染 `assistant-view-html.ts` 增加有界 LRU 缓存，并对活跃增长回复按已闭合段落／围栏块复用前缀 HTML，每次增量仅重解析尾部活跃块（`O(1)`）。
3. **乐观上屏、代码块零折叠跳变、滚动记忆与微交互精修（含[决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63)）**：
   - 点击或回车发送（在 `packages/design-system/src/composer-rules.ts` 与 `packages/design-system/src/browser/composer.ts` 统一升级为两阶输入法守卫：标准 `event.isComposing || event.keyCode === 229` + **WebKit / Tauri macOS `500ms` 合成后卫**，记录 `compositionend.timeStamp` 拦截尾随无修饰 `Enter` 并在捕获阶段拦截伴随的一次性 `beforeinput` `insertParagraph`/`insertLineBreak`）`<16ms` 当帧在对话栏渲染带 `pending` 态的乐观用户气泡与共享 `20px` 动态状态环指示行；服务端返回后按真实轮次无损接管，若请求被拒或失败则原位撤回乐观气泡并完整恢复输入框草稿、附件与焦点。
   - 修复 `assistant-text-parts.ts` 与 `assistant-code-grow.ts`：移除流式写入中途第 19 行突加 `data-folded` 的反向高度坍塌及无语言 JSON 围栏闭合时的 `<figure>` 重建闪烁，待代码块闭合后再提供折叠入口；超长用户消息（渲染高 `> 300px`）自动收拢（复用共享 `[data-overflow-fade][data-more]` 纵向 `--mw-fd: to bottom` 渐隐，守 `VUX-27` 禁另写独立 `mask-image: linear-gradient(...)`）+ 展开/收起按钮（走 `t()`），并与折叠代码块、步骤详情一并接入 `hidden="until-found"` + `beforematch` 浏览器 `⌘F` 查找自动展开（命中展开同步标 `data-user-toggled` 守 `VUX-13`，旧引擎安全降级）。
   - 为客户端过程视图 `assistant-process.ts` 的 2 步以上折叠组 `<summary>` 补齐恒定 `20px` 实时状态环、步骤计数与**零高 `flex-1` 状态短语稳位座**（防止文案变长变短时右侧耗时/按钮横跳），接入超 20 秒慢响应安静提示；嵌套步骤行以 `:not(:where([data-mw-step] *))` 隔离悬停/聚焦作用域并保持单一焦点环与 `relatedTarget === null` 微任务失焦复核（不引入大容器 `:has()`，守 `has-anchors`）；消息操作条（复制等）改为 `100ms` 独立 `transition-delay` + 慢进快出（进用 `var(--dur-hover)`、出用 `var(--dur-stagger)` `60ms` 零延迟，键盘零延迟、触屏常显，严守 `POLISH-35` `--ease-quint`）；底栏 Dock 浮动区外框 `pointer-events: none` + 子项 `auto`、`data-leaving` 把退场动画与占位判定解耦、`typeableOrCap` 避免切换/重载卡死焦点；附件/材料胶囊补富 Hover 详情卡状态机（`600ms` 首次 / `0ms` 热切 / `200ms` 桥接 / 点击升级 `pinned` `role="dialog"` / `fixed` body portal 与首帧 `isPositioned` 隐藏守卫 / 删除胶囊焦点顺延相邻胶囊）；按对话／事项独立保存恢复 `{ scrollTop, followState }`，为列表与审查区补签名守卫，消除切换双重入场闪烁与强制同步重排。

### 91-4 · Coding SSE 增量流、长会话零跳变回滚与执行过程精修（B 轨）

基于 `35-2` 与 `36A-4`（准备卡／收尾卡单行化、正文列对齐输入框）基线实施：

1. **Coding SSE 增量流（`routes-timeline.ts` + `browser/main/live.ts`）**：
   - 消费 `91-2` 平台插件流式路由与 `agent-host` 运行流能力，将 `followLive` 升级为 `/sessions/:id/runs/:runId/stream` 单连接增量流（保留快照回退），复用段落级前缀 Markdown 缓存并去掉冗余双发字段，实时推送活跃 `subagents` 与 `taskboard_plans` 更新，消除主代理等待子代理期间界面冻结。
2. **200 轮长会话回滚零跳变（`styles.ts` + `runs.ts`）**：
   - 对当前活跃轮与视口邻近轮禁用 `content-visibility: auto`，对滚出视口的历史轮次用 `ResizeObserver` 记录真实测量高度（`--run-h`），并在用户进入 `detached` 阅读态时提供稳定视口锚定，彻底消除向上滑动时的巨幅高度弹跳。
3. **执行过程层次、乐观上屏、渲染卫生与微交互精修（含[决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63)）**：
   - 将 `reasoning` 从 `.coding-activity` 工具行中分离为独立的轻量思考折行（流式预览最新思考句与秒数；进入工具或正文后自动收拢为 `已思考 N 秒 ▸`，但**若用户在流式期间已手动点开 `<details>`（`data-user-toggled`），完成后绝不自动合上**，守 `VUX-13`），不打断连续工具聚合统计；思考折行、折叠工具输出、长命令尾窗与超长用户气泡（`> 300px` 折起，复用共享 `[data-overflow-fade][data-more]` 纵向 `--mw-fd: to bottom` 渐隐守 `VUX-27`）统一接入 `hidden="until-found"` + `beforematch` 自动展开（同步标 `data-user-toggled`）。
   - 在工具行内呈现大文件生成目标预览与长命令紧凑 3 行实时尾窗（未手动展开的预览在命令完成后收起，用户已手动展开的保持打开；若第 91 批未换 `vendor/prologue-sdk`，本批先完成 `AgentHost`／UI 承接与模拟流验证，真模上游预览随第 62 批换包闭环）；嵌套工具组与子代理步骤用 `:not(:where([data-mw-step] *))` 隔离悬停/聚焦并保持单一焦点环；活跃状态短语加零高 `flex-1` 稳位座，轮次操作条采用 `100ms` 独立 `transition-delay` 慢进快出（进 `--dur-hover`、出 `--dur-stagger` `60ms`，`--ease-quint`），引用材料胶囊共用富 Hover 详情卡状态机。
   - 发送 `<16ms` 乐观上屏（共享 `packages/design-system/src/composer-rules.ts` 与 `packages/design-system/src/browser/composer.ts` WebKit/Tauri `500ms` 输入法合成后卫）：若发送前范围重叠确认（`scope-check` 的 `askOverlap`）被用户取消、触发 `coding.material_unreadable` 或动作调用失败，立即撤回 `pending` 轮次并无损恢复输入框正文、引用材料与 `cleared_input_revision`。
   - 清理 `styles.ts` 残留的 `animation: none` 死渐变文字与 `run-facts.ts` 重复的上下文压缩行；将 `renderRuns()` 改为「先读几何 → 后写 DOM」并为 `awaiting-review` 查询加 `runId:updatedAt` 防抖守卫。

---

## 6. 验收标准

1. **CUI-01** 个人助理移除 `500ms` 轮询下限，与 Coding 均经平台受控 SSE 增量流与 `molisWorkRequest` 实时更新（`/wait` 保留回退，零裸浏览器 `fetch`／`new EventSource`）；个人助理流接口拒绝插件页请求并随撤权／切账号立即断流，插件流每帧校验当前权限且单连接只占 1 个等待槽；流式文本增量期间跨插件对象重复读取 RPC 为 0，已闭合 Markdown 段落命中 `O(1)` 增量缓存；断线重连或重开窗口按版本无损接续，不丢字、不重放副作用。
2. **CUI-02** Agent Host 在 `text-delta` 热路径不再执行双倍整视图 `structuredClone`，`subagent-started`／`subagent-ended` 实时进入运行流并唤醒等待方；Prologue 在 `session/core/run.ts` 内实现展示帧与持久帧屏障解耦（纯展示增量不被主线程同步 `fsyncSync` 阻塞，工具派发前、进入等待态前、状态控制与 `seal()` 终态前严格落盘齐平），工具生成期可见名称与目标预览、前台长命令可见实时尾行，恢复与对账回归全部通过（若第 91 批未跨窗口换 `vendor/prologue-sdk`，上游部分在 `molis-prologue` 仓验证，`molis-work` 侧完成适配与模拟流测试，真模换包联调随第 62 批合入验收）。
3. **CUI-03** `molisStreamText` 保持同步 `StreamTextResult` 返回契约并提供自适应平滑释放（最大视觉延迟 `≤ 120ms`），快于 `90ms` 的连续帧不掐断在途 `.mw-fresh` 波浪动画；新生成回复首块即启用渐显与 `data-streamed`（取代 `VUX-14` 首块跳过渐显旧断言，历史重开仍为 `reveal: false` 不重播）；内联粗体、行内代码与链接闭合不让已显示字符二次模糊重闪；流式代码块写入途中不发生第 19 行反向高度折叠或 JSON 围栏重建闪烁；超长用户消息（`> 300px`）自动折叠并复用共享 `[data-overflow-fade][data-more]`（纵向 `--mw-fd: to bottom` 守 `VUX-27`）与展开入口；非输入法组合态下（含 WebKit/Tauri `500ms` 合成后卫，拼音回车选词不误发）点击或回车发送 `<16ms` 乐观上屏，取消范围确认或发送失败时无损恢复草稿与附件。
4. **CUI-04** Coding 与个人助理在工具文案刷新、单步变多步、运行转完成／失败／等待审批时，状态环 DOM 节点保持同一身份与 `20px` 槽位，旋转相位不归零、相邻文字与右侧元数据不因短语长度变化发生横跳（零高 `flex-1` 稳位座）；Coding 无半截死渐变残影；个人助理 2 步以上折叠组运行中显示可见动态状态环与步骤计数，等待模型超 20 秒显示安静时长提示；消息/轮次操作条遵循 `100ms` 独立 `transition-delay` 与慢进快出（进 `--dur-hover`、出 `--dur-stagger` `60ms`，`--ease-quint`），过路鼠标不闪烁、键盘零延迟、触屏常显；嵌套步骤行悬停/聚焦不串色、无双焦点环；底栏 Dock 浮动区空白处不拦截下方点击且退场不阻塞占位判定。
5. **CUI-05** Coding 在 200 轮长会话（含高代码块与展开详情）中从底部快速向上回滚至顶部，视口零高度弹跳；持续 20+ 次/秒流式增量下输入响应 `p95 ≤ 100ms`；`molisFollow` 在常规模式下提供平滑追底，在 `prefers-reduced-motion: reduce`、`[data-craft-still]` 与 `navigator.webdriver` 下单帧到位（守 `VUX-26`），且任何用户滚轮／触控／上滑首个事件即刻中断追底切入 `detached`、绝不被新帧拉回底部；个人助理在主对话、事件对话与不同事项间切换时精确恢复各自 `scrollTop` 与 `following/detached` 状态，无双重入场闪烁。
6. **CUI-06** Coding 的 `reasoning` 思考流独立于工具列表展示，进入工具或正文后未手动展开的预览自动收拢（用户已手动点开的 `<details>` 保持展开，守 `VUX-13`），不打断连续工具调用聚合；折叠思考折行、工具输出、代码块与超长用户消息接入 `hidden="until-found"` + `beforematch`（Chromium 浏览器 `⌘F` 命中即自动展开并打 `data-user-toggled`）；工具生成目标预览与长命令 3 行尾窗按同一展开保护规则工作（上游真模部分在未换包时与 `CUI-02` 同步随第 62 批闭环）；主代理等待子代理期间子任务与计划进度实时刷新；`run-facts` 无重复上下文压缩行，`awaiting-review` 态不随无关帧重复触发审查 RPC；附件/材料胶囊富 Hover 详情卡支持 `600ms`/热切/`200ms` 桥接/点击 `pinned` `role="dialog"` 与删除后邻接焦点顺延。
7. **CUI-07** 组件板 `/__ui/catalog` 具备突发流平滑吐字、内联闭合零重闪、状态环原位流转与微阻尼追底标本；浅深色、标准／紧凑密度、中英文、`1440`／`1024`／`390` 宽度、键盘漫游、触控 `44px` 命中区与 `prefers-reduced-motion` 全部通过既有视觉与无障碍门禁（`visual-order`、`touch-targets`、`text-wrap`、`has-anchors`、`scrollbars-hidden`）。
8. **CUI-08** 页面资源守住单资源预算门禁，安全不变量表与拒绝测试同步，`pnpm build`、`pnpm boundary:check`、`pnpm health:check`、`pnpm test:contracts`、`pnpm test:security` 与共享核心全量回归通过。
9. **CUI-09** `[人工]` 在一次性隔离 Home 中使用真实模型分别完成「个人助理日常多步对话 + 代码块流式输出」与「Coding 跨文件修改 + 长命令检查 + 子代理协作 + 长会话回滚阅读」，确认吐字生长动画顺滑自然、滚动跟手零跳变、界面干净无嘈杂感且关键进展清晰可见（若第 91 批未换 `vendor/prologue-sdk`，依赖上游新事件的工具参数／命令尾窗真模手感在第 62 批换包后补验签收）。

---

## 7. 决策记录

- **2026-11-18（立项与排期，用户定，[路线书决定 54](../post-anticorruption-roadmap/reference/decisions.md#decision-54)）**：单独建立路线书[第 91 批](../post-anticorruption-roadmap/reference/batches/91.md)（按当前最大批号 + 1 编为 `91`），与 `36A`（逐屏静态布局与底栏第十三版）正交分工；实际执行只等 `35-2`、`36A`（壳层、Coding 前后半、动效曲线）与 `37-2`，**不等 38～89**；[第 90 批](../post-anticorruption-roadmap/reference/batches/90.md)仍为包含 91 在内的整条路线最终对账。
- **2026-11-18（平台能力与既有体验条款对齐，设计自查确认）**：① 插件实时运行流不写 Coding 私有通道，在 `91-2` 经 `packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime`、`apps/local-host/src/plugin-route-stream.ts`、`packages/ui-host/src/request-client.ts` 与 `horizontal/agent-host` 做成统一平台能力；② `CUI-03` 显式更新 `VUX-14`「首块跳过 `.mw-fresh`」旧断言以消除首字生硬跳出；③ 严格保留 `VUX-13`（用户手动点开的折叠块完成时不自动合上）与 `VUX-26`／`#2124`（减少动态效果与自动化环境单帧贴底、用户滚轮首帧让权）。
- **2026-11-18（合并全产品体验打磨与开发指引，用户定，[路线书决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）**：本需求与[全产品界面、空间布局与行为反馈深度打磨](../product-experience-polish/spec.md)合并为统一体验专项，第 91 批扩为第一段 `91A`（在 `91-1` 并入微交互、布局与行为反馈底座，在 `91-4` 顺手清零 Coding 剩余微瑕，并新增 `91-5` 后续开发指引与插件创作台规范更新），全产品其余 23 插件、伴随表面与三层自动化防回归门禁排入紧邻的[第 91B 批](../post-anticorruption-roadmap/reference/batches/91b.md)；本需求既有范围与验收编号 `CUI-01～09` 保持不变。
- **待用户拍板项**：① 第 91 批开工时确认是否授权跨窗口换一次 `vendor/prologue-sdk`（不换则随第 62 批窗口二换入）；② 若思考折行或紧凑命令尾窗超出组件板既有控件形态，按开发流程第 5 节先出样确认；③ `CUI-09` 本人实物验收。
- **2026-11-20（两轮红队终校与前置衔接，[路线书决定 58](../post-anticorruption-roadmap/reference/decisions.md#decision-58) ②）**：① 第 91 批前置补上 [第 101 批](../post-anticorruption-roadmap/reference/batches/101.md)（先收口 5 项现役 P0 与生命周期泄漏）；② `91-2` 落实 5 项红队强制护栏——保留 Batch 59 `BUSINESS_SUBAGENT_HOST_TOOLS`（改幂等 `ensurePublishedChildRole`）、OpenAI `maxOutputTokens` 留 `undefined` 仅 Anthropic 按族夹逼、用已有 `ActionService.discoverOne()` 禁盲整轮缓存、`runtime:clock` 保持 `developer` 层、`prompt_cache` 数据库默认保持 `"off"` 仅已验证模板默认 `"best-effort"` 并放宽 `PA-24`、`ending-review` 默认保现状。
- **2026-11-22（对照 `open-claude-ui` 补齐 7 项对话微交互精修，用户定，[路线书决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63) ①）**：在 `91-3` / `91-4` 并入 WebKit/Tauri macOS `500ms` 输入法合成后卫、`hidden="until-found"` + `beforematch` 折叠可查找并联动 `VUX-13`、消息操作条 `100ms` 独立 `transition-delay` + 慢进快出（进 `--dur-hover`、出 `--dur-stagger`，守 `POLISH-35` `--ease-quint`）、嵌套步骤 `:not(:where([data-mw-step] *))` 隔离与单焦点环、超长用户消息 `300px` 折叠（复用 `[data-overflow-fade][data-more]` 纵向渐隐守 `VUX-27`）、状态短语零高稳位座 + 底栏 Dock 布局仲裁，以及附件/材料胶囊富 Hover 详情卡状态机；其余 4 项壳层/列表/引导能力归入 `91B`（`#10` 拆入两段，共对应 10 项审计建议，见 [product-experience-polish](../product-experience-polish/spec.md)）。

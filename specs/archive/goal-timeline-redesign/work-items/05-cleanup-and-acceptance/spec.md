# 05：清理与内部完整验收

状态：accepted（2026-09-10），主 Session 已验收，结果见 [acceptance.md](acceptance.md)。depends_on：04-goal-detail（已验收）。以实际遗留调用和文件明确删除清单，不按名称批量删除。生产执行使用直接 Grok CLI grok-4.6 / xhigh，主负责需求和验收。

## 用户结果

内部使用者能够从一个新意图开始，选择或不选工作规划，登记局部类型，真实上报，阅读当前结果与历史，解决 Concern/作用户决定，显式完成或取消，并在服务重启后接续。已有项目可以保留历史与真实约定进入同一界面。旧 tab、失效协议和重复状态处理不继续维护。

## 清理原则

- 沿 import、插件能力注册、MCP tool catalog、Web 路由、脚本监听器、构建产物和测试确认调用者；删除本次改造后已经没有有效使用者的实现。
- 清理旧五个 tab 组件/样式/脚本、失效 schema/工具、固定角色推进文档、被统一事实服务替代的状态计算、过期测试和独占依赖。删除代码时同步更新公开导出与注册，不新增白名单绕过包边界。
- 历史 Run/Evidence/Review/Decision 是保留对象，不是无用代码。仍承担读取、文件访问、宿主实际运行或其他有效产品职责的模块保持；在交付中写具体调用者和原因，不能笼统说“为兼容保留全部”。
- 04 的临时切换/适配代码若迁移职责已结束就删除；若确有旧项目尚需使用，明确受支持范围和唯一状态 owner，不保留两个可并行决定同一 Goal 的路径。
- 不清理与本次改造无关的用户工作、图片删除、其他产品模块或已有个人数据。无提交、推送、安装、部署和真实用户数据库迁移。

## 最终验收

逐条对照总 spec 的行为和完成等级 4，报告通过、未运行或失败及具体证据。核心场景包括新目标无模板/工程规划、类型版本和模板版本隔离、普通部分结果、相关支持/反证/未知、多项要求、人工决定与授权复用、受阻完成报告、显式收尾、父目标整合、取消、重试/并发正式变更、断线/重启接续、历史读取和网页桌面/窄屏操作。

运行全仓测试及构建/边界检查，以已有真实测试基础设施为主；有依赖缺失而跳过的用例明确列出并给实际替代验证。最终查看 scoped diff，不允许调试开关、示例数据冒充真实数据、死导出、临时文件或未声明的新依赖混入产品。

交付包含可打开的本地生产预览、核心路径说明、必要截图/验证证据、真实未完成项（如有）、清理结果与保留理由。没有发布证据不得说可发布；不能以测试数量或工具调用数证明产品体验完整。

## 已确认需核对的文档入口

`PRODUCT.md` 当前场景与典型流程仍以 Available/Claim/Run/Evidence/Proposal 为默认，声明复合父 Goal 不能直接工作且自动完成；这些与本次已接受事件流程冲突。05 必须按最终生产行为重写相应段落，并保留仍真实存在的树结构/依赖授权边界。根 README.md / README.zh.md、DESIGN.md、docs/SSOT-MATRIX.md 及相关模块说明同步实际职责，不能把本目录原型的完成等级 2 直接当成生产结论。

`skills/goal-advance/SKILL.md` 现在分新 owner 与 legacy_claim_run；04 明确继续转交后，05 应检查是否仍有必要把旧领取协议作为普通继续路径暴露。保留项必须指出未转交历史 Goal 或 Host 管理等实际消费者；不能简单删名字，也不能笼统保留全部。发布配置/安装命令不在本次执行权限内。

全套标准命令为 `pnpm_config_verify_deps_before_run=warn pnpm test`（内部先 build，再单并发 tests/*.test.ts）及 `pnpm_config_verify_deps_before_run=warn pnpm boundary:check`。如先完成独立 build，可直接运行同一 tests/*.test.ts 命令避免重复构建；结果仍需包括实际失败/跳过原因。不改变依赖验证配置使 pnpm 重装依赖。

### 04 执行期间补充的具体文档差异

- `README.md` / `README.zh.md` 的 Goal 阅读、决定、Runtime 演示仍以旧面板和只能执行叶子 Goal 为基准；按最终生产页面更新相应叙述与必要截图，不把旧截图标成新界面。安装、签名、Runtime 接入等未改变行为的说明保持原事实。
- `docs/runtime.md` / `docs/runtime.en.md`、`docs/mcp.md` / `docs/mcp.en.md` 仍把 Available → Claim/Run → Evidence/Review → 自动完成作为普通入口；明确新目标和已转交目标的事件入口、普通报告与完成的区别、可信用户决定入口，以及未转交历史目标实际保留的操作边界。双语说明必须表达相同权限与状态行为。
- 根 `DESIGN.md` 的 Goal Detail 与 Runtime 段落仍要求旧概览/面板切换、复合父目标无终端；以 04 的真实生产布局、当前状态权威来源和容器宽度行为同步，保留无关产品面的设计规则。
- `docs/SSOT-MATRIX.md` 与受影响模块文档应反映 Goals 事件状态、Governance 用户决定、Native Goals 应用组装、Host 可信身份和 Workbench 呈现之间的实际分工；不能留下另一套 UI/Runtime 完成算法的说明。

这些是已定位的文档差异，不代表 04 已通过或清理清单已经冻结。05 开始时仍以最终调用链确定删除和保留范围。

### 04 收尾时定位的清理入口（需按产品调用者验证）

- `apps/workbench/src/goal-document-panels.ts` 已明确只服务剩余 panel/records/quick-record fragment；选中 Goal 正文不再挂载它。`renderCompanionRuntime` 仍在返回值中，但 renderer 当前只解构 quick-record/technical/progress。沿导出和真实消费者删除已无用途的旧伴随 Runtime 与其独占样式；不能因内部函数仍互相引用就认定是有效产品入口。
- `apps/workbench/src/renderer.ts` → `goals-fragment-renderer.ts` → Host fragment routes，以及 `scripts/client/documents-state.ts` → `GOALS_PANELS_CLIENT_FACTORY_SCRIPT` 仍串着旧面板加载器。逐个追踪新页面是否生成触发按钮/链接；真正已断开的旧五 tab 路由、监听器、组装和样式一并清理。需要保留的关系/风险/文件/历史能力须能指出新页面或其他产品入口，不默认全部删除。
- 事件客户端仍有此前修正留下的未使用局部状态（例如 `stateRequest`）；按实际调用删除，不新增替代抽象。

## 05 开始时按调用链冻结的清理清单

沿 import、公开导出、MCP catalog、Web 路由、客户端监听器和有效产品调用者核对。测试引用本身不是产品消费者。不按 Run/Evidence/Review/Decision 文件名删除。不新增白名单或第二套状态算法把旧五 tab 藏起来。

### 迁入新 Goal 正文（总 spec 已命名去向，不是新设计）

旧五 tab 按钮已从选中 Goal 正文消失，但下列能力仍有 HTTP、Inbox 深链或真实用户写入，不能随车辆一起消失。它们进入事件正文已有入口：

| 能力 | 旧车辆 | 新位置 | 状态 owner |
| --- | --- | --- | --- |
| 未转交旧草稿编辑 | completion 面板 `data-open-goal-edit` + `/api/goals/:id/draft` | 仅未转交且 definition_state=draft 的 Goal，在「目标说明」保留既有 `renderDraftEditor` 与修改入口；事件 owner 不显示此旧编辑器 | Goals Draft 命令拒绝事件 owner；事件约定仍仅经 event-agree/configure |
| 关系/风险/影响范围/Goal 级规则写入 | factors 面板 + quick-record | 「目标说明」内既有 factors 工作面（`data-goal-factor-tab` / 表单） | Goals relation/risk/impact/policy HTTP，不变 |
| Inbox/树 `#risk-` `#relation-` 定位 | hash → `setGoalPanel("factors")` 再懒加载 | 打开「目标说明」后 `setGoalFactor`，锚点仍是原 ID | 同上 |
| 旧验收标准与 V3 coverage | completion / records | 「完成要求」列出原 criteria；coverage 进入「目标说明」 | Goals query，只读 |
| Goal 上下文 Artifact 精确版本 | `/api/goals/:id/panels/completion` 懒加载 | 「完成要求」内嵌 Host 已有 `renderGoalArtifactContext` | Artifacts + Ledger |
| Evidence locator 复制 | records「执行与检查」`data-copy-value` | 时间线历史正文的 Evidence 原文 | Evidence 记录，只读展示 |

### 删除（无有效产品触发器）

- 旧五 tab 导航：`data-goal-tab` / `data-goal-panel` 壳、`/api/goals/:id/panels/{completion,progress,factors}`、`/records`、`/quick-record`、`/record-events`。
- `plugins/native/goals/src/document-overview-ui.ts`：零 import。
- `renderCompanionRuntime` 及 Goal 详情侧栏伴随 Runtime。Session 历史仍用 `.companion-runtime` 类名，样式保留；`data-companion-runtime-open` 只属于已删除的 Goal 侧栏按钮。
- `goal-document-panels.ts` 整文件（progress / technical / quick-record / companion 只互相引用）。
- records 懒加载客户端、quick-record 对话框/监听器、`setGoalPanel` 的五 tab 切换与 `loadGoalPanel`。
- 事件客户端未使用的 `stateRequest`。
- renderer 传给事件正文但从未消费的 `companionRuntimeHtml: ""`。

### 必要保留项与调用者

| 保留 | 调用者 | 支持范围 | 唯一状态 owner |
| --- | --- | --- | --- |
| Execution Claim/Run 模块、MCP `select_goal` / `claim_renew` / `run_*` / `evidence_*` / `review_submit` | 未转交 `legacy_claim_run` Goal 的 Runtime Skill；Host 占用与租约 | 仅 `protocol.kind=legacy_claim_run`；转交后新写入拒绝旧完成入口 | Execution + 03 事件状态 owner 门禁 |
| Evidence / Review / Decision 事实与文件/locator 访问 | 时间线历史映射、Inbox 决定、Artifacts 工作台、项目文件打开 | 读取与原 ID 展示；不把映射写成新批准 | 各 Module |
| `GET/POST /api/goals/:id/panels`（无子路径，JSON） | `plugins/native/work/src/terminal/panels.ts` 终端页 | 真实 PTY/Runtime 面板，与 Goal 五 tab 无关 | Work / Runtime Host |
| Skill `legacy_claim_run` 分支 | 未转交历史 Goal；`goal_state.protocol.kind` | 普通继续路径对**新目标和已转交目标**是事件工具；旧协议不是默认 | 同一 `readState` |
| Inbox / Decision Center / Goal Tree / Momentum / 项目工作规则 | 既有入口 | 用户决定、提案、树与项目级 Policy | Governance / Goals graph / project policy |
| `eventDirectoryPresentation` | 目录与树的当前标签 | 事件 owner 用事件状态；未转交用原 fulfillment/action projection | 03 状态服务 vs 旧 lifecycle，按 Goal owner 分支，不并行决定同一 Goal |

### 明确不改

- `desktop/20260902-022934.jpg` 既有删除保持。
- 用户 `~/.molis-work`、凭据、lockfile、依赖安装。
- 安装/签名/Runtime adapter 未改变的事实。
- 根 `DESIGN.md` 与 `.impeccable/design.json`：本项只在验收记录列出真实布局与应删旧规则，由主 Session 最终 documenter 统一更新。
- 不为验收重拍未改视觉面的截图；原六项视觉 finish review 保持 resolved。

### 文档必须改到的生产事实

- 新目标与已转交目标：事件入口（intent → configure/report → 当前状态 → 可信用户决定 → 显式收尾）。普通报告 ≠ 完成。
- 未转交历史 Goal：可读新时间线；使用新版事件写入前需「使用事件记录继续」。仍支持的旧草稿和 Claim/Run 操作仅服务未转交 Goal，此前 Evidence/Review 按原来源可读。
- 父 Goal 可做本目标整合，不再声称复合父目标永远不能工作和会自动完成。
- 用户决定来源只来自 Host Web/管理入口；Runtime 不能自填 user。
- 中英文权限与状态语义一致。不把旧截图或原型说成新生产界面。

### 给最终 DESIGN documenter 的交接

真实生产布局（04 已验收 + 05 迁入的既有能力）：

- 选中 Goal 是 `goal-event-document`：顶部当前判断/已做成/下一步/风险不跟随历史选择；左时间索引、右事件正文；工作规划/目标说明/完成要求在右侧阅读器，有「返回所选事件」。
- 桌面双栏独立滚动；阅读面可用宽度 ≤680px（含目录+Runtime 挤占）为时间线↔事件往返；完整表单验收视口 390×1100。
- 「目标说明」承载目的/范围/有效决定，以及关系、风险、影响范围、Goal 级规则的既有工作面；旧草稿编辑仅用于未转交 Goal，事件 owner 仍用工作规划中的当前约定编辑。
- 「完成要求」承载当前事件要求、未转交 Goal 的原验收标准、关联 Artifact 精确版本。
- Runtime 工作模式仍是 Goal 页「聚焦 / Runtime」；终端绑定与不自动发送不变。父 Goal 可以记录整合事实，不再用 `closed_compound` 作为“无终端”的完成算法。

应删除或改写的旧 DESIGN 规则：

- Goal Detail 五 tab（概览/完成要求/进展与阻塞/关联与约束/完整记录）及 Context/Progress/Relationships/Record 的主 section-deck 导航。
- 首屏 Next Step + `goal-primary-action` 由 Claim/Run action projection 决定。
- Goal 详情侧栏 companion-runtime（Claim 租约/完成标准进度条）。
- “复合父 Goal 始终不直接开工、自动完成后不重新开放终端”作为状态算法；改为：事件 owner 的父 Goal 可整合，终端仍不改绑、不自动发送。
- 快速记录作为 Goal 详情主写入；普通补充改为「补充一条」，承诺/授权变化走事件表单或可信决定。

### 验收命令

```sh
pnpm_config_verify_deps_before_run=warn pnpm test
pnpm_config_verify_deps_before_run=warn pnpm boundary:check
```

若已独立 build，可直接 `node --import tsx --test --test-concurrency=1 tests/*.test.ts`。临时日志使用 `05-` 前缀。不把总 implementation 的 05 标为主验收通过。

### 主复核的 owner 边界（2026-09-10，接入旧草稿前）

主临时公开 API 复现 `/private/tmp/molis-work-grok/05-review-draft-owner.mjs`：`createIntent` 立即建立 event_work owner，同时 Goal.definition_state 仍是 draft；旧 `updateDraftGoal` 允许修改它，结果 `canonicalGoalOutcome=旧草稿表单的新结果` 而 `eventAgreementOutcome=原事件约定`。这说明 definition_state=draft 不是“可以走旧编辑器”的条件。主已暂停writer，保留全部清理并修订边界后续接。

旧草稿 UI 必须同时确认没有事件 owner，服务端正式命令也须拒绝 event owner（不能只藏按钮）。拒绝后 Goal字段、criteria、事件约定和事件事实均不变；旧未转交Draft仍可编辑。事件Goal修改约定继续用已存在的event-agree/configure，不把旧表单静默转换成事件或重新引入旧验收标准 owner。沿现有 owner 查询/命令边界做最小完整修复，不建立第二套owner检测协议。

本项把仍有效能力迁入「目标说明／完成要求」后，必须补这两个实际变化阅读面的桌面/窄屏证据，以及旧草稿仅对legacy可达、事件约定仍走正式入口的真实验证。原六项视觉修正不重开；新增截图只覆盖这次迁入的实际区域，由主在最终验收时检查。

### 长内容阅读的最终布局约束

目标说明/完成要求（含旧Draft）打开时占用既有右侧阅读空间，转交表单不得同时挤占下半列。未转交 Goal 返回所选历史后仍可使用现有显式转交入口；点击补充所需的转交流程不变。以现有 reading.reader / form 互斥状态实现，不改变事件归属或授权。顶部概况保持可见，长内容在 reader-content 滚动；有限高度只作用于确实包含事件正文的 surface，不影响回收站。

### 原目标资料与约定的读取保留

迁入目标说明须保留已绑定资料的原来源链接、状态、原因及已记录的 snapshot_digest，以及既有约束、需要输入和承诺输出。不能仅保留 in_scope/out_of_scope 后移除其余已存事实的 UI。使用已有 context/scope 读取能力或沿当前正文组合的最小实现，不重新引入旧 tab，不建立新的事实字段或摘要计算。事件当前约定仍以事件状态为准，原目标资料不覆盖事件约定。

### Session 主按钮的真实样式保留

Native Work 的 `ui/render.ts`“加载原 Session”仍使用 `.goal-primary-action`，其 `ui/styles.ts` 在桌面/窄屏消费该类。保留此实际按钮需要的通用基础、hover/disabled及主题样式；已删除 Goal 五 tab、导航和 `.goal-now-body` 专属样式不恢复。不能为达到某个类名搜索为零而破坏仍支持的 Session 页面。

### 旧详情上下文组合的最终清理

沿 renderer 实际消费清理 context UI 的退休 panel / record-basics / record-relations / scope 等无入口组合；HumanReview 的 acceptance-summary、旧Draft、子目标与 coverage 的活能力保留。旧单数 `.goal-workspace-panel` / `data-goal-panel` 规则随原详情删除；回收站实际使用的复数 `.goal-workspace-panels` 和 Session 通用布局样式保留。

完成要求中的原验收标准需保留 criterion_id、statement、pass_condition、decision_method、target 和 required_evidence 的读取。可在现有阅读器内展开原标准明细，不另设旧tab，不把原标准明细变成事件 Goal 的第二套完成判断。

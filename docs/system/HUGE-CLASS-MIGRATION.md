# Huge Class 职责迁移图

2026-09-08 全仓复审：原 Coordinator、Store、renderer、server 混合实现均已退出，不能仅用旧 Huge 清单为零证明成功。按事实 owner 与调用链检查当前大文件如下。

| 当前较大单元 | 职责与判定 |
| --- | --- |
| Native Goals ClaimCommands（858 行） | 领取/续租/释放/撤销与原子启动的应用用例；调用 Execution/Goals/Governance 公开端口，不保存业务 SQL，不新增跨 Module Store。用例内聚，保留 |
| Native Goals VerificationCommands（685 行） | Evidence/Review 输入授权、提交及跨 owner reconciliation；事实写入归 Module，保留 |
| Native Goals WorkStateQueries（754 行）/action-projection（892 行） | 从正式事实派生工作状态和下一步动作，不写事实；与 action factory/index 分离，保留 |
| Host GoalProjectApplication（543 行） | 具名 Port 注入和应用装配，Query/Command 转发到 owner；无业务 SQL/状态机。不是原 Coordinator 规则换名，保留 |
| Feed Module index（976 行）、Listener Host index（745 行） | 前者只管理 Feed 自有事实与事务入口，后者只管监听 lease/cursor/接收技术状态；Repository/接收/投递已分责，保留 |
| Gmail Provider（961 行） | Provider 协议与标准化；OAuth、安装、scope、cursor、错误已分到同 Integration，保留 |
| MCP goal-tools（964 行）/Contracts | 公共工具/类型声明，不是跨领域运行类；保留 |
| >1000 行静态文件 | i18n/en（2802）、calm-desktop（1540）、personal-workbench-v3（1511）、momentum styles（1222）：分别是文案表或现有视觉样式，未混入业务。按表/视觉层组织，不为行数机械拆散 |

实际闭环：Entry → Local Host → Native Plugin 用例 → Module public API → Module Repository；Host 只装配同连接事务与技术 Adapter。边界门禁、真实跨入口/重启/权限测试与 [Cutover 验证](../../specs/molis-work-architecture-reorganization/cutover-validation.md) 共同支撑判断。这里不宣称不存在长文件，也不把 CSS 行数当 Huge Class 缺陷。

## 历史迁移阶段（下列数字和待办不表示当前状态）

GW6（2026-09-06）：root Store 当前 777 行；剩余 Goals DDL、15/25/26/30 的 Goals 实现已退出。新文件按职责为 schema 220 行、Risk/Guidance 升级 99 行、revision 回填 124 行、旧覆盖账读写 36 行；没有新增包或巨大类。旧 Store 仍负责跨 owner 启动装配及尚未退出的共享职责，不能标为 retired。具体 caller/行为证据见 [GW6](../../specs/molis-work-architecture-reorganization/gw6-validation.md)，以下数字为历史阶段。

DD2 工程状态（2026-09-06）：原生/历史提案应用与决定 UI/copy/client 已按 owner 迁移，209 项串行回归和 12 项边界反证通过。当前 Coordinator / root renderer / server 为 2,771 / 2,240 / 3,243 行；它们仍未整体退出。真实 caller 与验收见 `specs/molis-work-architecture-reorganization/dd2-caller-audit.md`、`dd2-validation.md`。下文旧阶段记录只保留当时边界；canonical 完成状态以 Molis Work 为准。

DD1 更新（2026-09-06）：Coordinator 的草稿 start/turn/resume 及独占 helper 已删除，当前 8,496 行；Plugin 应用 224 行、Governance clarification owner 123 行，分别负责用例与事实，不把旧大类换名搬迁。root Store 1,235 行，澄清查询和映射已委托 owner。剩余 Goal Tree 决定/关闭会话归 DD2；原 schema 初始化与最终装配仍待 Cutover。包边界 450 sources / 1,249 imports，0 errors；5 个 legacy huge files 仍未清零。

状态：DV4 安装/分发拆分与完整切片 Review 已于 2026-09-06 09:24 UTC 完成，见 [DV4 验收](../../specs/molis-work-architecture-reorganization/dv4-validation.md)。当前边界仍有 4 个 legacy huge files、10 个兼容条目；全仓清零及总目标验收尚未完成。下方 DV4 等待分发验收与行数均为阶段历史。
最新 2026-09-06：GW5 整项工程验收已齐，包含审查补迁的项目工作规则页面/交互/样式/19 条文案。root renderer **3,827**、server **3,353**；边界 448 sources / 1,236 imports，0 errors，串行 Goals/Web/Desktop **175/0/0**。完整范围、caller 与无损证据见 `specs/molis-work-architecture-reorganization/gw5-validation.md`。下方各阶段数字保留为历史；5 个 legacy huge files 仍由最终 Cutover 清零，不因此 retired。
基线日期：2026-09-01  
规则：行数只触发审查，真正的拆分单位是“唯一事实 owner + 一组完整用例 + 独立测试面”。

本文不是要求一次性重写这些文件，而是防止它们被原样搬进新 package。每一行职责只有一个主要迁移 Goal；其他 Goal 如需消费，只能通过该 owner 的 public Contract。

> GW4 实施对账发现 Goals Native Plugin UI/文案未被其 Contract 覆盖，GW5 随后正式接受并完成整项工程验收。下文为分阶段历史；当前结论以顶部及 `gw5-validation.md` 为准，不把 GW5 完成等同整体 Huge Class 退出。

2026-09-05 GW5 追加：Policy/Safety/关系/树/图/正文/概览/上下文/草稿/Planning/状态/关联组合/新建回收、记录基础/只读关联与风险/检查摘要已迁移，根 renderer 当前 3,837 行、server 3,386 行；下表早期数字为历史基线。旧 619 行 root momentum 已按类型/节奏/布局/视图拆开。Workbench 只 mount 对应 contribution，初始/refresh 的 Goal 导航投影也由 Plugin 公开提供。页面/文档 GET matcher 和 Goal 专属客户端已迁入；正文、面板/因素、记录/翻页、导航/标签/草稿/树/态势/生命周期/对话框/关系/Risk facts/Impact/Policy 进一步改成显式 Host factory，请求状态、panel/factor keys、打开标签列表、筛选和图状态退出共享 bootstrap，事件只通过 owner 方法分发。跨 owner 执行/历史组合与完整 cutover 未完成；共享刷新调度保留 Host，旧 renderer 尚未 retired。根 HTTP host 保留权限、数据和响应装配。追加 Goals refresh factory、统一集合模型与完整/精简目录 contribution；16 份完整页面/refresh 比较一致（仅规范化内嵌 catalog 键序），真实刷新/交错/回退通过。扩大组的旧源码位置断言更新后定向通过，保留两轮失败记录；此前 165 项切片回归通过；此前并行 158/160 和重试详情保留在 gw5-progress.md，不代表最终全产品验收。

## 1. 当前超过 1,000 行的源码

2026-09-06 页面切片历史（不是当前状态）：root full/refresh 页面与 read/page/fragment 装配迁入 Workbench，172 项串行回归和 16 份中英输出对比通过。随后 Planning request、项目工作规则也完成，当前见顶部。Execution/Decision/共享 Shell 的逐项剩余 owner 见 `specs/molis-work-architecture-reorganization/gw5-caller-audit.md`。

| 文件 | 行数 | 主要风险 |
| --- | ---: | --- |
| `src/v1/coordinator.ts` | 9,003 | EX4 已移出 execution-validation facade，AR1 只增加 Artifact public API 的纯装配；DV1 将 availability、Draft/Goal Tree/legacy proposal 应用 Contract 归官方 Goals 插件，旧类型变为别名；查询算法、Draft Dialogue、Goal Tree Decision、Ledger 与最终兼容编排仍待退出 |
| `src/web/render.ts` | 6,129 | EX4 已移出 Claim/Run/Evidence/Review renderer；Goals/Artifact/Work/App Shell 等后续 owner 的兼容产品 UI 仍混合 |
| `src/web/server.ts` | 4,353 | Host client、剩余 route、PTY、Session 和安装管理混合；Goal 与 execution-validation route 已通过 Workbench adapter 调用公开应用端口 |
| `apps/workbench/src/i18n/en.ts` | 3,574 | AP3 已把 catalog 与语言 runtime 分开，但现有产品文案仍需随各 Native Plugin UI Goal 就近迁出 |
| `src/mcp/server.ts` | 533 | DV1 已迁协议、目录、具名应用/项目工具转换与展示；连接缓存、Session/Panel 组合归 Local Host；全部 Goal caller 使用公开 Client，Board/import 等声明归官方 Goals Plugin。root 保留 executable dispatch、可信宿主权限检查与实现注入，不含 Store 直访或业务应用对象；DV1 已经 601 项回归与逐项审计完成，整体 Cutover 和用户 E2E 尚未完成 |
| `src/projects/catalog.ts` | 1,796 | AP1 已移出 Project facts/SQL，AP4 已移出 Desktop Panel 规则与 SQL，WK1 已移出 Runtime binding schema/SQL；DV1 将宿主身份、项目 context request/result 改为公开 Contract 别名；剩余文件 staging、路由和兼容应用编排 |
| `src/v1/store.ts` | 1,338 | Goals、Execution、Evidence、Governance 与 Artifact schema/Repository/migration 已迁出；当前只组合各 owner 公开 migration，Ledger 与兼容 snapshot 仍待迁移 |
| 原 `src/web/project-session-workspaces.ts` | 原 1,450，已删除 | WK3 已迁 Work UI contribution，拆分渲染、样式、内容、目录、新建、关联与交接初始化器；Session read model 也已归 Work |
| 原 `src/install/runtime-integration.ts` | 迁移前 1,393，已删除 | DV4 迁到 Local Host installer：公开类型、配置 Adapter、文本格式处理、文件/Skill IO、预览 Planner、确认/回滚 Service 六个文件；调用者切公开 API。完整分发验收仍待 DV4 |
| 原 `src/install/home.ts` | 原 903，已删除 | 源包检查、依赖收集、release staging/切换/回滚、launcher、文件 IO、类型和事务分责，主事务 170 行；build fingerprint 也迁入 Local Host 并补 workspace 输入 |
| 原 `src/install/web-service.ts` | 原 793，已删除 | 平台适配 244、检测 105、进程状态转换 100、操作/恢复 134、预览政策 74、公开类型 87、Manager 100 行；不是跨文件分摊同一个大类 |
| 原 `src/install/uninstall.ts` | 原 486，已删除 | 239 行 Service 管预览确认/分步骤执行，资产文件规则 111 行、公开类型 93 行；catalog 事实检查迁 Projects，根只注入只读连接和原 Demo 删除 lifecycle |
| 原 `src/sessions/registry.ts` | 原 1,324，已删除 | WK1 已拆分事实 owner，WK3 已切换剩余 caller 并删除 re-export；Session、Event、Handoff、Migration、Content、Schema、Context Binding 保持分责 |
| 原 `src/web/pty-client.ts` | 原 1,177，已删除 | WK3 已拆到 Work 的 connection、panels、autofill、screens 与页面装配；Workbench 仅调用公开入口，终端已纳入包类型检查 |
| `packages/design-system/src/styles/calm-desktop.ts` | 1,539 | 有边界的静态视觉层，不含 Store/API/业务状态；行数触发后续组件化审查，不等于跨 owner Huge Class |
| `packages/design-system/src/styles/personal-workbench-v3.ts` | 1,510 | 有边界的静态视觉层，不含 Store/API/业务状态；行数触发后续组件化审查，不等于跨 owner Huge Class |
| `packages/design-system/src/styles/momentum.ts` | 1,221 | 有边界的静态视觉层，不含 Store/API/业务状态；行数触发后续组件化审查，不等于跨 owner Huge Class |

## 2. `src/v1/coordinator.ts`

| 当前职责 | 目标 owner | 唯一迁移 Goal | 迁移完成证据 |
| --- | --- | --- | --- |
| Goal 只读详情、列表、关系和 Goal-owned snapshot | Goals Query API | `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` | **已完成：** Web/CLI/MCP 详情、Policy、Guidance、回收站查询结果兼容，caller 改走 `goalQueries`；跨 owner work/action projection 明确留给 EX4 |
| Goal Contract、Graph、Policy、Risk、Guidance 写入 | Goals Module | `goal-reorg-gw1` | **已完成：** Command/Repository/Event 独立，公开 API 与 116 项 V1 回归通过；旧转发由 GW4 删除 |
| accept、revalidate、complete、trash/restore、旧数据版本 | Goals Module | `goal-reorg-gw2` | **已完成：** Lifecycle 按职责拆分，migration 可回滚，旧 Store migration 已删除；旧转发由 GW4 删除 |
| planning method、图分析、change impact、拆分校验 | Goals Planning | `goal-reorg-gw3` | **已完成：** Planning Engine、方法资产、图与拆分校验已迁入 Goals，Proposal/Decision 仍归 Governance；旧转发由 GW4 删除 |
| Goals Web/CLI/MCP 写入总入口 | Apps thin adapters | `goal-reorg-gw4` | **已完成：** 所有写/Lifecycle/Planning caller 经 `GoalsApplicationApi`，Coordinator Facade 职责和零 caller Planning re-export 已删除 |
| Artifact identity、version、scope、content/provenance 与 Repository | Artifacts Module | `goal-reorg-ar1` | **已完成：** 正式事实、Contract、Repository 和 migration 31 由 Module 拥有；Coordinator 只组合并暴露 `ArtifactsApplicationApi`，没有 Artifact SQL 或业务规则 |
| 跨对象 relation/provenance；Goal 资源 Impact 声明与占用规则 | Context Ledger / Goals / Execution / Governance，按事实分工 | `goal-reorg-ar2` | **已完成本切片：** Feed、Session、Handoff、Runtime 绑定与可解析输入来源迁 Ledger；Impact 冲突规则迁 Execution，声明 CRUD/schema/历史迁移和 Proposal 写入切 Goals；事实/假设、Contract/native 提案来源规则与旧提案展示迁 Governance；基线适用性和 caller 审计已验收，不代表整套 Coordinator 已清零 |
| Claim、Run、lease、release、attempt 与恢复 | Execution Module | `goal-reorg-ex1` | **已完成：** Contract、schema/migration、Repository、状态机和兼容 caller 已迁；直接 public module 与 V1 回归覆盖续租、崩溃恢复、幂等及并发 |
| Evidence、Correction、criterion coverage、自动验证门禁 | Evidence & Verification | `goal-reorg-ex2` | **已完成：** Contract、schema/migration、Repository、locator、Correction 与 coverage gate 已迁；Coordinator 只保留授权和跨 owner reconciliation |
| Review obligation、Review、Proposal、Decision、确认来源 | Governance & Collaboration | `goal-reorg-ex3` | **已完成：** Contract、schema/migration、Repository、状态机和原子物化已迁；Coordinator 只经公开 API 传入已授权上下文 |
| 执行、证据、治理到下一步动作与入口编排 | Goals Native Plugin + App adapters | `goal-reorg-ex4` | **已完成：** Web/CLI/MCP 共用 `ExecutionValidationApplicationApi`；旧 projection 与 Coordinator facade 删除；跨入口、权限、恢复测试通过 |

`MolisWorkCoordinator` 在迁移期只允许承载尚未拆出的跨 owner 应用编排。EX4 已删除 Claim/Run/Evidence/Review 与 action/work projection 的公开 facade，并把原 2,000 行组合类拆成 78/874/406/695 行职责文件。AR1 新增的 18 行只负责构造 Artifact Module 和暴露公开端口，不包含事实或判断。剩余 Draft Dialogue、Goal Tree Decision、Ledger 与最终兼容入口由后续 Goal 继续清理；不得把它们重新塞回 execution-validation 或 Artifacts。

## 3. `src/v1/store.ts` 与 `src/v1/types.ts`

| 当前表/类型组 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| Goal、criteria、policy、risk、guidance | Goals | `goal-reorg-gw1`（Command/Repository 已迁） |
| Goal 生命周期、revision、归档/回收与 migration | Goals | `goal-reorg-gw2`（已迁；旧 Store 只编排公开 migration） |
| planning method、graph analysis 类型 | Goals Planning | `goal-reorg-gw3` |
| artifact identity、version、scope、content/provenance | Artifacts | `goal-reorg-ar1`（已迁；旧 Store 只组合公开 schema/migration，旧 types 从未拥有正式 Artifact 类型） |
| 跨模块 relation/provenance 引用；资源 Impact 声明 | Context Ledger 保存对象关系；Goals 保存资源声明 | `goal-reorg-ar2` |
| claim、run、lease、attempt | Execution | `goal-reorg-ex1`（已迁；旧 Store 只编排公开 migration / snapshot Query） |
| evidence、correction、criterion coverage | Evidence & Verification | `goal-reorg-ex2`（已迁；旧 Store 只编排公开 migration / snapshot Query） |
| review obligation/review、candidate、proposal/decision | Governance & Collaboration | `goal-reorg-ex3`（已迁；旧 Store 只编排公开 schema/migration/snapshot） |
| clarification session/turn、Goal Tree Proposal/Decision 入口编排 | Goals Plugin 应用 / Governance 事实 | 已确认 DD1/DD2；DD1 三入口已迁，DD2 的决定与关闭会话仍待迁（不属于 EX4） |
| action projection/read model 类型 | 执行验收 Query | `goal-reorg-ex4`（已迁） |
| root public barrel 与旧 Store facade | Contracts / compatibility | `goal-reorg-f3` |

拆分后每个 owner 管自己的 schema、migration 和 Repository。`packages/storage` 提供 SQLite 技术端口，但不拥有表的业务含义；禁止把原 Store 换名后继续跨 Module 查询。

## 4. `src/web/render.ts`、`visual-foundation.ts`、`i18n.ts`

| 当前职责 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| Workbench Shell、导航、布局、UI Slot、Contribution 装载 | Workbench / UI Host | `goal-reorg-ap3` |
| token、基础组件、图标、可访问性、通用视觉规则 | Design System | `goal-reorg-ap3` |
| Goal 列表、详情、关系与只读投影 UI | Goals Native Plugin | `goal-reorg-gw5`（Query API 已由 Goals Query Goal 完成） |
| Goal 修改、Planning、Risk/Policy 编辑 UI | Goals Native Plugin | `goal-reorg-gw5` |
| Claim/Run、Evidence、Review、Decision 与动作投影 UI | Goals Native Plugin 的执行验收组合 | `goal-reorg-ex4` |
| Feed、Source、Signal、Attention 页面与写入 | Feed Native Plugin | `goal-reorg-fd4` |
| Artifact/结果/文件浏览与嵌入 | Artifacts Native Plugin | `goal-reorg-ar3` 验收收口：引用分类/展示、项目文件打开编排、版本列表/详情/导出、Goal 关联版本查询均在 Plugin；Workbench 挂载 contribution，root 只组合 HTTP 与 Goal 上下文槽位。Evidence 判定和私人 Work 不迁入 Artifact |
| Session、Terminal、resume、handoff UI | Work Native Plugin | `goal-reorg-wk3` |
| Project/Settings/Plugin Manager/Onboarding、Desktop 兼容 UI | App Shell | `goal-reorg-ap4` |
| i18n registry、加载机制、fallback 与共享术语 | Workbench i18n platform | `goal-reorg-ap3` |
| Goals 产品文案 | Goals Native Plugin catalog | `goal-reorg-gw5` |
| Feed 产品文案 | Feed Native Plugin catalog | `goal-reorg-fd4` |
| Artifact 产品文案 | Artifacts Native Plugin catalog | `goal-reorg-ar3` |
| Work/Session 产品文案 | Work Native Plugin catalog | `goal-reorg-wk3` |
| Desktop/Settings/Onboarding 产品文案 | Desktop/App Shell catalog | `goal-reorg-ap4` |

`render.ts` 不按页面机械切成多个同样依赖全局 view 的 renderer。每个 Native Plugin 用公开 Query 形成自己的 read model；Workbench 只保留 Shell 和 Contribution 宿主。

AP3 已完成平台 Shell、Slot、Design System 和 browser assets；EX4 又把 Claim、Run、Evidence、Review renderer 迁入 `apps/workbench/src/execution-validation-ui.ts`。`src/web/render.ts` 当前为 6,129 行，仍包含 Goals/Artifact/Work/App Shell 的其他产品页面，不能由 EX4 越权吸收。当前 EN catalog 继续随各产品 UI owner 就近拆出。

因此 Huge renderer 按职责而不是按文件名退出：Shell/平台资产和 execution-validation UI 已迁，剩余 6,129 行继续按上表唯一 owner 迁移；旧 renderer 尚未整体 retired。

## 5. `src/web/server.ts`

| 当前职责 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| 本地进程装配、single writer、Host Client 与本地授权边界 | Local Host | `goal-reorg-ap2`（已迁初始化与 writer owner；业务 route 继续由各 owner 迁出） |
| Workbench asset/transport/route composition | Workbench App | `goal-reorg-ap3` |
| Project 创建、Catalog、membership、`board_id` 迁移 route | Projects | `goal-reorg-ap1` |
| Feed/Source/Connector route 与 promotion | Feed Native Plugin adapters | `goal-reorg-fd4` |
| Goal Query route | Goals Query adapter | `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` |
| Goal Command/Planning route | Goals Command adapter | `goal-reorg-gw4` |
| Claim/Run/Evidence/Review/Decision route | 执行验收 adapters | `goal-reorg-ex4` |
| Session、resume、handoff route | Work Native Plugin | `goal-reorg-wk3` |
| PTY/runtime process、stream、resource lifecycle | Runtime Host | `goal-reorg-wk2` 已迁 server Host；WK3 已迁 Work browser client |
| Onboarding、settings、installation diagnostics、Desktop bridge | Desktop/App Shell | `goal-reorg-ap4` |

新 route 只把 HTTP 输入翻成 Host Capability 调用。任何 route 直接持有 Module Store 或复制业务判断，都算迁移失败。

## 6. 其他 Huge File

| 文件与职责 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| `src/mcp/server.ts`：MCP transport、tool schema、audience、项目上下文 | `apps/mcp` | `goal-reorg-dv1` |
| `src/mcp/server.ts`：对旧内部方法/Skill 的假设 | Runtime 集成 | `goal-reorg-dv2` |
| 原 `src/projects/catalog.ts`：Project identity、Catalog、membership、database migration | Projects | `goal-reorg-ap1`（已迁；旧入口只调用公开 Projects API） |
| 原 `src/projects/catalog.ts`：Runtime context/session binding | Private Work Context | `goal-reorg-wk1`（已迁；Catalog 只调用公开 Repository） |
| 原 `src/projects/catalog.ts`：Desktop panel、Capsule lifecycle | Desktop Shell | `goal-reorg-ap4`（已迁；旧 Catalog 方法只转发） |
| 原 `src/projects/catalog.ts`：personal planning method storage | Goals Planning | `goal-reorg-gw3`（已迁；调用公开 Goals Planning API） |
| `src/web/project-session-workspaces.ts`：Project membership read model | Projects | `goal-reorg-ap1` |
| `src/web/project-session-workspaces.ts`：Session/workspace UI composition | Work Native Plugin | `goal-reorg-wk3` 已迁入 `ui/` 的 render/styles 与独立 browser initializers，Workbench 通过 UI Host 挂载；旧文件及 allowlist 已删除 |
| 原 `src/install/runtime-integration.ts`：Runtime 接入预览、写入、回滚、诊断 | Local Host installer，旧 caller 已迁 | `goal-reorg-dv4`（其余安装与 release 仍进行中） |
| 原 `src/sessions/registry.ts`：Session、内容引用、关联、恢复、迁移 | Private Work Context | `goal-reorg-wk1`（已迁；旧路径只剩 8 行兼容 re-export） |
| `src/feed/store.ts`：Source 配置与 Signal 事实 | Sources / Signals | `goal-reorg-fd1`（已迁；旧 Source 方法仅兼容转发） |
| `src/feed/store.ts`：Feed Item、InboxEntry/Attention 处置 | Feed / Attention | `goal-reorg-fd2`（已迁；旧方法仅兼容转发） |
| 原 `src/web/pty-client.ts`：终端 UI 和 stream 呈现 | Work Native Plugin | `goal-reorg-wk3` 已迁 `terminal/client.ts`、`screens.ts`、`autofill.ts`；旧入口删除 |
| 原 `src/web/pty-client.ts`：浏览器端 PTY transport/reconnect | Work Native Plugin UI（消费 Runtime Host stream） | `goal-reorg-wk3` 已迁 `terminal/connection.ts`、`panels.ts`；WK2 负责 server process host |
| 原 `src/feed/connectors/gmail.ts`：Gmail protocol、scope、history cursor、错误归一与字段标准化 | Gmail Integration Plugin 的 `provider.ts`、`scope.ts`、`history-cursor.ts`、`errors.ts` | `goal-reorg-fd3`（已迁；单文件均低于 1,000 行） |
| 原 `src/feed/connectors/gmail.ts`：通用连接/监听技术状态 | Connector/Listener Host Contract | `goal-reorg-fd1`（已迁） |
| 原 `src/v1/goal-decomposition-validation.ts`：coverage、graph、proposal validation | Goals Planning | `goal-reorg-gw3`、`goal-reorg-gw4`（实现已迁，零 caller re-export 已删除） |
| 原 `src/v1/action-projection.ts`：跨执行/证据/治理状态的下一步 read model | Goals Native Plugin | `goal-reorg-ex4`（已删除旧文件；新 projection 901 行，index/factory 分离） |
| 原 `src/web/capsule.ts`：Desktop Capsule CSS/client/HTML presentation | Desktop Shell | `goal-reorg-ap4`（已迁入 `apps/desktop/src/capsule-shell.ts`） |
| `src/web/capsule.ts`：Goal/Run/Session 状态 read model 与 Host 注入 | 对应事实 Query + Web compatibility adapter | `goal-reorg-ex4`、`goal-reorg-wk3`；最终 Cutover 删除兼容 adapter |
| 原 `desktop/src-tauri/src/main.rs`：窗口/Capsule、PTY、本地 Web service、Runtime env | Desktop Tauri adapter | `goal-reorg-ap4`（已按职责拆分并迁入 `apps/desktop/adapters/tauri/src/`） |

## 7. 大型测试文件

测试不是业务 owner，随被验证的行为迁移；共享 helper 才能进入 `packages/test-kit`。

| 文件 | 行数 | 目标测试面 |
| --- | ---: | --- |
| `tests/v1.test.ts` | 12,844 | Goals Query/GW1–GW4、AR1–AR2、EX1–EX4 的 characterization 与 compatibility tests |
| `tests/web.test.ts` | 8,588 | AP2–AP4 与各 Native Plugin UI/route 的兼容和端到端测试 |
| `tests/mcp.test.ts` | 3,817 | DV1/DV2 的 MCP contract、audience 和 Host Client 测试 |
| `tests/desktop-tui.test.ts` | 1,888 | WK3/AP4 的 Desktop、TUI、Capsule 与 Runtime 入口测试 |
| `tests/project-catalog.test.ts` | 1,192 | AP1、WK1 的 Project/Context binding/migration 测试 |

测试拆分时优先按用户行为和 public Contract 分文件，不按旧类的方法名一一复制。

## 7.1 已退出 Huge Class 清单

| 文件 | 当前行数 | 已退出职责 | 剩余退出条件 |
| --- | ---: | --- | --- |
| `src/feed/store.ts` | 744 | FD1 的 Source/Signal/Listener 与 FD2 的 Feed/Attention 表、Repository、状态机和 migration | FD4 清 Web facade；最终 Cutover 删除旧组合入口 |
| `src/feed/connectors/github.ts` | 27 | FD3 已把 GitHub Provider 搬到官方 Plugin；旧文件只注入本地 credential/fixture policy | AP2/DV3 统一安装与 credential Host 后删除兼容入口 |
| `src/feed/connectors/gmail.ts` | 45 | FD3 已把 Gmail Provider 和 Signal Adapter 搬到官方 Plugin；旧文件只注入 Secret/OAuth port | AP2/DV3 统一安装与 credential Host 后删除兼容入口 |
| `src/web/render.ts` | 6,129 | FD4/AP3 已移出 Feed、Shell 与平台资产；EX4 已移出 Claim/Run/Evidence/Review renderer | GW5/AR3/WK3/AP4 按剩余产品 UI owner 继续拆分；最终 Cutover 删除兼容 renderer |
| `src/web/visual-foundation.ts` | 15 | AP3 已把 7,979 行主题、browser bootstrap 和视觉样式迁入 Design System；旧文件只 re-export public entrypoint | 最终 Cutover 删除兼容 import |
| `src/web/i18n.ts` | 140 | AP3 已把 3,710 行聚合文件拆成语言 runtime 与 Workbench EN compatibility catalog | GW5/AR3/WK3/AP4 按产品 owner 迁 catalog；最终 Cutover 删除旧 import |
| `src/web/server.ts` | 4,353 | EX4 execution-validation route 已走 Workbench adapter；无对应业务规则 | GW5/AR3/WK2/WK3/AP4 继续迁剩余 route composition |
| `src/v1/coordinator.ts` | 9,770 | EX4 已删除 16 个 execution-validation facade/query 方法；AR1 正式 Artifact 事实不在此处，仅保留 18 行 public Module 装配 | AR2、Candidate `candidate-d7629ad3-8882-40b2-91cf-a75f9ce5c68a` 与最终 Cutover 继续拆剩余组合 |
| `src/v1/action-projection.ts` | 已删除 | EX4 已迁入 Goals Native Plugin，并拆成 projection/index/factory | 无 |
| `src/v1/goal-decomposition-validation.ts` | 已删除 | GW3 已把 1,126 行拆分覆盖与校验逻辑按职责迁入 Goals Planning；GW4 在旧 import 清零后删除 re-export | 无 |
| `src/v1/types.ts` | 589 | Goal、Execution、Evidence、Governance public types 已切到对应 Contract；AR1 的 Artifact 类型直接存在独立 Contract，没有进入旧聚合文件 | AR2 迁移 Ledger 类型；最终 Cutover 删除旧聚合入口 |
| `src/projects/catalog.ts` | 2,104 | AP1 已移出 Project identity、Event、workspace membership、删除记录、schema 与 migration；AP4 已移出 Desktop Panel 规则和 SQL，旧方法只调用公开 Desktop service | AP2 迁文件 provisioning/composition，WK1 迁 Runtime binding；最终 Cutover 删除零 caller 兼容方法 |
| `src/web/capsule.ts` | 496 | AP4 已把 548 行 Capsule presentation 迁入 Desktop App，旧文件只做状态 read model 和翻译/主题兼容注入 | EX4/WK3 迁跨 owner read model；最终 Cutover 删除 Web adapter |
| `desktop/src-tauri/src/main.rs` | 已删除 | AP4 已把原 1,473 行按窗口/Capsule、PTY、本地 Web service、Runtime env 拆成 812/327/327/36 行并迁到 Desktop adapter | DV4 只继续发布配置、签名、公证与安装验收 |

## 8. 每个职责的退出检查

- 新 owner 的 Contract、实现、Repository、Event 与错误语义可独立验证。
- 所有入口 caller 已切到 public API，没有 deep import 或跨 Store 访问。
- 旧实现中这块逻辑已删除，或只剩记录了 caller、截止点和删除 Goal 的薄转发。
- 迁移前后主要 Query、Command、Event、错误和持久化结果一致。
- 数据 migration、对账和回滚路径有证据。
- 对应 package README、Module/Service 文档和迁移矩阵已同步。

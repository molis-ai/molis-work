# 公共类型与协议

## Run 记忆展开合同（实施中，未验证）

依 [Memory spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)，`AgentMemoryTools.list` 改为无正文展开回执，保留纠正所需 memory_id/version。Agent Action 调用控制与 Host 私有 `ActionCallContext` 携带仅供同 Run 的展开窄口，不可从业务输入建立，不序列化或暴露给插件回调。`memory.list@5` / `memory.recall@3` 用明确输出 union 区分既有非 Run 查询与运行中 Agent 的无正文展开；按当前开发阶段同步所有消费者，不增加兼容层。SDK 类型只留 AgentHost Adapter 边界，contracts 只提供本仓 DTO。具体字段已按核对合同接入；快照由统筹统一生成，尚未验证。

最小输出变化：共享 `mode: "run-expansion"` DTO，仅含 receipt_id/outcome/可选错误码、queued/omitted memory_id/version、tokens/basis/remaining_tokens；list@5 和 recall@3 分别将它与原响应组成 union，原管理分支不加必填字段。list 工具直接返回此 DTO。输入不增加任何授权字段，Host 仅为已校验的现有 Memory 读取意图建立 explicit 用途；任意 runtime Action 不凭身份自动获得。当前 role/install/read/场景和原冻结权限仍要重新求交。

## Memory 管理分页合同

`memory.list@4` 保留合法可见正式项及 personal/project 数；pending 与 auto_this_week 为 number|null。null 明确表示该调用未查询管理计数：非本人调用不读取候选或旁账统计，本人管理仍返回实际数值。不以零替代未知，也不为计数提升非本人权限。助理工具与工作轨迹只消费 items，现设置页使用独立 page/candidates/changes。

Agent Memory 的候选 get 绑定固定 scope/owner/candidate_id 与可选取消信号，沿现 SDK get 返回已授权 canonical 候选或真实缺失的 undefined；拒权与存储错误不变成空结果。仅内部形成查询可据明确 MEMORY_SCOPE_DENIED 排除不可见项，本人管理完整性检查不放宽。

`services/memory` 提供 `memory.page@2` 与 `MemoryPageRequest/Response/MemoryManagementItem`。管理请求没有 owner；响应中的 canonical owner 支持固定选集，新增必填输出字段因此升为 v2。六种管理类别不扩大写入/形成四类。响应的真实状态与 expired 分开，classification 缺失为 null，total 和物理成本用 exact/unknown 明示。`services/agent-host` 的 page DTO 复用 SDK 管理查询语义，只有 Adapter 翻译 scope、字段和成本；不建立另一个分页主人。

`memory.prefs.read@3` / `memory.prefs.write@3` 使用九字段 `MemoryPrefs`，新增必填 `class_restrictions`。每行的可信 consumer/current_scene 与可选 scene/kind/lifecycle 选择条件只收紧原权限；read 与 form 独立。合同提供 `isMemoryClassRestrictions` 严格拒绝未知字段/值和重复 selector（不按对象字段顺序区分）；同一选择条件即使决策不同也不能重复。`isCompleteMemoryPrefs` 只接受完整当前设置，旧数据转换由离线采用入口负责。输入省略数组保持原值，显式数组完整替换；重复 selector 的拒绝由 MemoryService 写入口再次执行，JSON Schema 不伪称可以表达该语义。验证入口为 `tests/memory-class-restrictions.test.ts`。


让 Module、Host、Plugin 和 App 通过一致的输入输出协作。这里提供真实的公共类型、schema 和解析规则，而不是功能实现。

包名：`@molis-ai/molis-work-contracts`。工作区内部包，通过仓库构建和 Host 装配使用。


Home 插件的 `PluginDatabaseDeclaration` / `PluginDatabase` 从 `platform/plugin` 导出，`PluginStartContext.provider_id` 区分公共提供方与安装身份；`services.artifacts` 可缺省，Home 没有项目成果服务。`BoundActionClient.invoke` 支持仅限可信 Host 的控制参数，保留父子取消和 beforeEffect 授权链，页面来源通过 `page_context` 单独传递。详见 [作者合同](../../docs/platform/PLUGIN-DEVELOPMENT.md#个人-home-runtime-与插件-sqlite)。

`platform/app-host` 的 `HostPluginCaller.project_id` 为 `string | null`：项目执行器给真实项目，Home 执行器给 `null`，插件、安装、操作者与生命周期仍由 Host 绑定。消费方必须先拒绝不适用的 scope；Agent 项目入口拒绝 Home caller，不能从输入补项目。

`platform/plugin` 的 `PluginActionClient` 在 BoundActionClient 上提供 `invokeQuery`。`ActionCallContext.query_only` 是 Host 设置的收窄标记，绑定的新 caller 与父 control 取逻辑或，任何一方为 true 都保留；不能从业务输入建立授权。Kernel 按当前登记的 operation 和 permissions 检查实际派发，发现之后替换定义也不能绕过。

同一 `platform/plugin` 子路径的 `PluginOwnerFilesReader/Writer/Client/Declaration` 表达可信 Home 主人的私有文件树。`services.ownerFiles` 可缺省；独立读取需当前动作读权限，`write(run)` 只接同步回调并在退出后撤销 writer。目录、初始化权限和实例来自可信启动条目，不从 Manifest 或业务参数取得。

## 一次典型调用

调用方按领域子路径导入，例如 @molis-ai/molis-work-contracts/modules/goals 或 /platform/plugin。Plugin Manifest 的类型在此定义；解析（`parsePluginManifest`）和动作、Agent、方法的声明检查（`inspectActionDeclarations` 等，内核注册时也用）会运行代码，由 `@molis-ai/molis-work-plugin-sdk` 持有，SDK、内核、运行时和命令行共用同一份；具体命令执行交给对应 owner。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/modules/goals.ts](src/modules/goals.ts) | 目标 Command/Query 契约 |
| [src/platform/plugin.ts](src/platform/plugin.ts) | Plugin 运行协议（启动上下文、定义、Runtime）；`platform/plugin` 子路径的入口 |
| [src/platform/plugin-manifest.ts](src/platform/plugin-manifest.ts) | Plugin Manifest 与各项声明 |
| [src/platform/plugin-host-services.ts](src/platform/plugin-host-services.ts) | 插件拿到的平台服务（`PluginHostServices`） |
| [src/platform/plugin-routes.ts](src/platform/plugin-routes.ts) | 插件路由的请求、回应与执行控制 |
| [src/platform/app-host.ts](src/platform/app-host.ts) | Host Client 与 capability 契约 |
| [package.json](package.json) | 完整公共 exports |

可对照现有调用方 [apps/local-host/src/local-host.ts](../../apps/local-host/src/local-host.ts) 阅读装配方式。

## 接入与边界

当前有 63 个公共子路径（外加根入口；以 `package.json` 的 `exports` 为准），其中部分表达未来能力；存在类型不代表已有服务。无数据库或网络依赖，根导出也不是所有业务类型的大集合。

工作区依赖：无。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-contracts typecheck
pnpm --filter @molis-ai/molis-work-contracts build
```

已有行为示例与回归：[plugin-authoring.test.ts](../../tests/plugin-authoring.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：Module、Service、Platform 的公开合同子路径：类型、schema 与负载解析规则（Manifest 的解析与版本比较、动作、Agent、方法的声明检查、逐行文本比较、动作的两个绑定函数 `bindPluginActionRoute` 与 `bindOwnerPluginAction` 都在 plugin-sdk，不在这里；比较结果与行的类型 `TextDiff`、`TextDiffRow` 等留在这里）。
- 不负责：业务实现、数据库、网络客户端、App 或插件实现。
- 公开入口：`@molis-ai/molis-work-contracts`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/package`。
- 依赖：不依赖任何工作区包，也不依赖 App、业务实现、数据库或网络客户端（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 2 节）；所有包都依赖它。
- 不变量：
  - 不依赖任何其他工作区包；按显式子路径导出，不做根 barrel。
  - 结果合同读写都只认现行取值：存量数据由维护改成现行形状，schema 里不留历史取值。
  - 动作的 `effect` 按 id 推断会误判时用 `withActionEffect` 显式声明（比如 `delete_preview` 只存确认凭证）。
  - 错误只有一个模型：`ActionError`（`src/platform/action-errors.ts`）带码、消息和可选的 kind 与 details。码是 `<主人>.<原因>`，平台自己的码在 `ACTION_ERROR_KINDS` 一码一行（只给 kind，不带 HTTP 数字；状态由插件 SDK 的 `actionHttpStatus` 按 kind 给），主人的码用 `defineErrorCodes` 声明；新增一个平台码要同时加一行，`tests/action-error-model.test.ts` 查着。公开出口：`ACTION_ERROR_CODE`、`ACTION_ERROR_KINDS`、`ACTION_ERROR_KIND_NAMES`、`ActionErrorKind`、`ActionErrorOptions`、`defineErrorCodes`（返回类型 `ErrorCodeRaisers`）、`isActionErrorKind`、`platformErrorKind`；后两个函数是给插件 SDK 读 kind 用的，插件作者通常只用 `defineErrorCodes` 与 SDK 的 `actionHttpStatus` 一类。
  - `ActionAvailability` 的拒绝分支可带 `kind`；Kernel 的动作与 typed 派发、SDK owner 绑定保留主人的分类，未给 kind 的取现行共同规则。此字段不改变动作 schema 或版本。
  - 改合同同时更新生产方、消费方、Skill 与手册，不留只有一边认识的字段。
  - `ActionCallContext.assert_authority_current` 只来自可信宿主和原 dispatcher，必须同步；可选目标与必要权限由当前消费场景/启用声明给出。`bindActionClient` 的 control 尾检只保留真实父调用自己的来源/权限/生命周期，子动作的目标和消费权限仍由绑定 caller 核对；同 caller 的 `retainActionAuthority` 保留来源和目标。`PluginExecutionControl` 不抹除父尾检。无目标尾检仍核原配置权限，不能授予目标权限或复活已结束的调用，不从业务 input、MCP `_meta` 或 run state 读取。
- 改动后必跑：`node scripts/run-tests.mjs tests/action-schema-compiler.test.ts tests/action-plugin-audience.test.ts tests/plugin-manifest-v2.test.ts tests/plugin-declaration-rules.test.ts tests/action-read-compatibility.test.ts tests/runtime-provider-identity.test.ts tests/plugin-capability-availability.test.ts tests/action-error-model.test.ts tests/plugin-model-service.test.ts tests/action-availability-kind.test.ts`
- 授权尾检与消费者改动另跑：`node scripts/run-tests.mjs tests/mcp-effect-authority.test.ts tests/mcp-scene-effect-authority.test.ts tests/action-authority-tail.test.ts tests/plugin-owner-effect-fence.test.ts tests/action-before-effect.test.ts tests/functions-scene-configuration.test.ts tests/functions-effect-boundaries.test.ts`。
- 相关手册：[docs/platform/CONTRACTS-AND-OPERATIONS.md](../../docs/platform/CONTRACTS-AND-OPERATIONS.md)、[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)、[docs/system/PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/system/PACKAGE-BOUNDARIES.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `contract-only`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/package`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`retainBackgroundAuthority(additionalPermissions?)` 只增加已有权限的持续检查，不改变动作引用或扩大授权。传入数组被复制，额外权限必须属于原调用者；未提供独立可信入口授权时仍受原取消边界。绑定客户端分别保留父动作与子动作权限，不能彼此替代。回归见 `tests/action-background-authority.test.ts` 与 `tests/security-invariants-alchemist-resumption.test.ts`。

`PluginModelClient` 的 `images` 只收字节与可选名称，在首次等待前复制；`execution` 保留同次真实推理回执，注入文字替身不伪造。成功结果与可记账失败的 `validateResult()` 必须在原 `beforeEffect()` 之后、同步提交之前调用；它绑定原动作及模型配置，不能跨动作持有。`choices()` 只返回现行模型名称和能力，不给地址或凭据。

`services/memory` 的正式 `MemoryFormalKind` 含六类，自动形成、工具写入与插件默认许可沿原四类 `MemoryKind`。`memory.change@3` 的 `reclassify` 需要所见版本、明确 kind 和 scenes/lifecycle；可与原正文、适用情境同次修改，期限省略/null/时间分别保留/移除/设置。`memory.history@2` 仅输出原 canonical snapshot 的分类、期限及完整性事实，不暴露内部 snapshot，也不表示当前授权恢复必定成功。正式条目输出同步升 `memory.recall@2`、`memory.list@3`、`memory.write@3`、`memory.candidates.accept@3`，输入形成类别仍四类；已有六类管理页和 v2 记忆包信封保持原版本。验证入口为 `tests/memory-classification-edit-http.test.ts`、`tests/memory-actions.test.ts` 与 `tests/memory-mcp.test.ts`。

固定分类选集批量管理沿现 memory.batch.preview/apply：本人明确选择最多 100 条 scope/owner/id/version，Host 校验并以无正文 marker 保留原选集和子操作；执行复用 Service.change 完整清理与回执，不另跑 SDK 批量写。管理分页公开 owner 不代表授权。取消/unknown 停后续，incomplete 显示逐项结果并重试原预览；完成项不覆盖后继编辑。页面只保留原预览身份，Host 重开继续原操作。相关真实 SDK/SQLite、Action、分页和页面测试待统筹构建槽验证；未跑不算通过。合同见 specs/prologue-memory-strategy/spec.md 的固定分类选集短合同。

`AgentMemoryPreviewMutation` 的 `purge` 与 SDK 实际遗忘命令一致；`remove` 仍只是墓碑命令，两者不替换授权。

`ActionCallContext.runtime_memory` 只由 Host 绑定原 Run 的插件、场景与分类限制，和 `runtime_session_id` 一起传递；不接受业务输入，不授予 Action 权限，不持久化第二份策略。


### 明确续期（2026-10-24，实现中）

`memory.change@4` 增加本人 renew 决定，输入为原 memory_id、所见 expected_version 和 UTC ISO expires_at；仅改期限，拒绝附带其他变更。AgentMemoryCapability 增加 renew 窄口，保留原 mutation/执行控制合同。历史/变更沿 edited，不新增历史 schema；SDK 包及公开 API/Action 快照由统筹统一更新。

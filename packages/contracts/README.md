# 公共类型与协议

`SyncReplicaAdapter.hasProjectChanges(projectId)` 是 owner 对指定项目未结算内容的只读判断，覆盖待提交变化、冻结上传及保留冲突（包括等待依赖）；删除后的键仍须可判定归属，其他项目不能误计。缺少此端口或归属不可知必须报告不支持/不可用，不能返回 false 冒充已同步；它不确认上传，也不授权回收。SQLite owner 通过可信 `belongsToProject(key,projectId)` 投影现有日志键的业务归属，共同 Storage 不猜键、不跨 owner 查表，查询不受上传启用筛选影响。当前 Aggregate、Pages、Images、Workflows 及已有项目分区已兑现；分区映射由可信组合根显式提供，不从输入猜测，失效分区拒绝观察。Todo 已按当前/删除后归属及未确认保留内容判断；Work 已按 work.project 关系及未确认保留内容判断，交接目标不作为归属；Home 文档和未启用分区的完整被动读取尚待接线，项目云端生命周期仍未因此启用。

让 Module、Host、Plugin 和 App 通过一致的输入输出协作。这里提供真实的公共类型、schema 和解析规则，而不是功能实现。

包名：`@molis-ai/molis-work-contracts`。工作区内部包，通过仓库构建和 Host 装配使用。


Home 插件的 `PluginDatabaseDeclaration` / `PluginDatabase` 从 `platform/plugin` 导出，`PluginStartContext.provider_id` 区分公共提供方与安装身份；`services.artifacts` 可缺省，Home 没有项目成果服务。`BoundActionClient.invoke` 支持仅限可信 Host 的控制参数，保留父子取消和 beforeEffect 授权链，页面来源通过 `page_context` 单独传递。详见 [作者合同](../../docs/platform/PLUGIN-DEVELOPMENT.md#个人-home-runtime-与插件-sqlite)。

`platform/app-host` 的 `HostPluginCaller.project_id` 为 `string | null`：项目执行器给真实项目，Home 执行器给 `null`，插件、安装、操作者与生命周期仍由 Host 绑定。消费方必须先拒绝不适用的 scope；Agent 项目入口拒绝 Home caller，不能从输入补项目。

`platform/plugin` 的 `PluginActionClient` 在 BoundActionClient 上提供 `invokeQuery`。`ActionCallContext.query_only` 是 Host 设置的收窄标记，绑定的新 caller 与父 control 取逻辑或，任何一方为 true 都保留；不能从业务输入建立授权。Kernel 按当前登记的 operation 和 permissions 检查实际派发，发现之后替换定义也不能绕过。

`ActionCallContext.stage_scene_metadata` 只由已认证 Host 的实际舞台读取入口给出，绑定该入口、安装世代、项目与声明的场景版本。它保存本人已接受的精确动作引用，只供该 owner 的实际绑定读取元数据，不授予执行或转授权限；Runtime 从插件的处理器、可用性与场景回调视图中删除它。仅匹配的舞台 `ActionSceneUsage` 可带 `function_title`，普通 usages 的字段不变。读取返回的是当次快照，等待中的撤权、替换和绑定变化会拒绝；返回后的变化由后续读取与真实执行重新校验。

同一 `platform/plugin` 子路径的 `PluginOwnerFilesReader/Writer/Client/Declaration` 表达可信 Home 主人的私有文件树。`services.ownerFiles` 可缺省；独立读取需当前动作读权限，`write(run)` 只接同步回调并在退出后撤销 writer。目录和顶层条目是插件自己 Manifest 的 `owner_files`（PG-102），初始化钩子和实例来自可信启动条目，不从业务参数取得。

## 一次典型调用

调用方按领域子路径导入，例如 @molis-ai/molis-work-contracts/modules/artifacts 或 /platform/plugin。Plugin Manifest 的类型在此定义；解析（`parsePluginManifest`）和动作、Agent、方法的声明检查（`inspectActionDeclarations` 等，内核注册时也用）会运行代码，由 `@molis-ai/molis-work-plugin-sdk` 持有，SDK、内核、运行时和命令行共用同一份；具体命令执行交给对应 owner。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/modules/artifacts.ts](src/modules/artifacts.ts) | 成果的记录与引用契约 |
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

插件同步集合/快照合同从 `/platform/plugin` 导出；spaceId 级配置格式从 `/modules/sync-replication` 导出。校验不负责授权、持久化或传输，详见[同步接入规范](../../skills/molis-plugin-dev/sync.md)。

同步声明解析与依赖展开实现在 plugin-sdk；空间策略解析实现在 sync-replication。这里不定义同步 Error 子类，失败统一使用各 owner 声明的 ActionError。

`SyncRoundSummary` 是现行格式 1 的只读轮次提示，包含策略、容量和每个所选 namespace 的普通变更 head；不是接收回执，不授予推进游标或确认上传的权力。Worker 与协调器同步更新，缺失或错误格式拒绝，不提供旧接口兜底。

`SpaceSyncProgress` 是本机对已选集合的只读汇总；`complete` 限于上次成功检查，不能代替服务端 head、接收回执或离线期间的远端事实。未选择集合的本机队列不混入，未配置不显示完成。

`ProjectReplicaDefinition.beforeClear` 在目标事务内、删除任何 owner 行之前校验刚读取的本机事实，替换与墓碑都须经过；不授予执行权限。`ProjectReplicaTable.journalColumns` 可把 UPDATE 日志限定在已声明的内容列，INSERT/DELETE 仍保留。owner 的 `restore` 只能消费同事务捕获一次的本机状态，不能从网络恢复运行绑定。

- 负责：Module、Service、Platform 的公开合同子路径：类型、schema 与负载解析规则（Manifest 的解析与版本比较、动作、Agent、方法的声明检查、逐行文本比较、动作的两个绑定函数 `bindPluginActionRoute` 与 `bindOwnerPluginAction` 都在 plugin-sdk，不在这里；比较结果与行的类型 `TextDiff`、`TextDiffRow` 等留在这里）。动作输入的类型工具也在这里：`platform/action-input.ts`，经 `platform/actions` 转出，有 `InferActionInput`、`FlatUnion`、`bindActionHandler`、`inputSchemaFor`。
- 不负责：业务实现、数据库、网络客户端、App 或插件实现。
- 公开入口：`@molis-ai/molis-work-contracts`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/package`。
- 依赖：不依赖任何工作区包，也不依赖 App、业务实现、数据库或网络客户端（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 2 节）；所有包都依赖它。
- 不变量：
  - `PluginConsentRecord` 的 `project_reach` 保存同一行的、排序去重的 `approved_capability_ids`；其它 kind 必须为 null。安装同意不能生成项目同意，项目授权只接受本人从项目设置的确认。
  - 不依赖任何其他工作区包；按显式子路径导出，不做根 barrel。
  - 结果合同读写都只认现行取值：存量数据由维护改成现行形状，schema 里不留历史取值。
  - 动作的 `effect` 按 id 推断会误判时用 `withActionEffect` 显式声明（比如 `delete_preview` 只存确认凭证）。
  - 错误只有一个模型：`ActionError`（`src/platform/action-errors.ts`）带码、消息和可选的 kind 与 details。码是 `<主人>.<原因>`，平台自己的码在 `ACTION_ERROR_KINDS` 一码一行（只给 kind，不带 HTTP 数字；状态由插件 SDK 的 `actionHttpStatus` 按 kind 给），主人的码用 `defineErrorCodes` 声明；新增一个平台码要同时加一行，`tests/action-error-model.test.ts` 查着。公开出口：`ACTION_ERROR_CODE`、`ACTION_ERROR_KINDS`、`ACTION_ERROR_KIND_NAMES`、`ActionErrorKind`、`ActionErrorOptions`、`defineErrorCodes`（返回类型 `ErrorCodeRaisers`）、`isActionErrorKind`、`platformErrorKind`；后两个函数是给插件 SDK 读 kind 用的，插件作者通常只用 `defineErrorCodes` 与 SDK 的 `actionHttpStatus` 一类。
  - `ActionAvailability` 的拒绝分支可带 `kind`；Kernel 的动作与 typed 派发、SDK owner 绑定保留主人的分类，未给 kind 的取现行共同规则。此字段不改变动作 schema 或版本。
  - 改合同同时更新生产方、消费方、Skill 与手册，不留只有一边认识的字段。
  - 动作输入的类型工具只有类型和两个小函数，不加第三方依赖：外部作者只装 contracts 和 plugin-sdk（`specs/action-input-contracts/spec.md` §4.1）。
  - 公开合同的动作（`services/*`、`modules/*` 和共享帮手）要留手写接口，schema 包 `inputSchemaFor`；包内部的动作要从 schema 推。现在还没有定义包上（N22-02、N22-03 才包），不要假设接口和 schema 已由编译器钉住。两种写法的取舍和过不了的名单在 §4.4。`inputSchemaFor` 没有关掉的参数，过不了就改接口或 schema，或者带理由进名单。
  - 导出的 schema 常量和帮手的类型在 API 快照里，加 `as const` 或改 `const` 泛型都要 `pnpm api:update`，排 api 队列（§4.5）。
  - Projects 的 `renameProject` 第四参为必填的原始名称观察值；Host HTTP、Workbench 表单和进程内调用同步更新。缺失或过期值按 `catalog.project_name_conflict` 拒绝，不提供旧签名别名或用新读取替换旧观察。
  - 项目目录的七个动作（`projectDirectoryActions`）和最近资料的两个动作（`materialRecentActions`）现在只声明，还没有提供方登记，调用得到 `actions.missing`。`ProjectDirectories.source_links` 只有 id 没有路径；目录的 `state` 只有 `ok`、`missing`；撤权按调用方的授权算，不是目录的状态；`projects.directory_revoked` 回答冻结轮次用到已经移除的目录。`MaterialOrigin` 的 `unmapped` 只用于 `source: "directory"`，这时不带 `directory`。规则见 [公共来源与呈现合同](../../specs/shared-sources-and-surfaces/spec.md)。
  - `services/skills` 的 Skill 目录四个动作（`skillCatalogActions`，提供方 `system.skills`）与导入两个动作（`skillImportActions`）现在只声明，还没有提供方登记，调用得到 `actions.missing`。范围、操作者、调用方的安装从调用上下文来，输入 schema 都不收；`skills.body.read@1` 一次收 1～`SKILL_BODY_READ_MAX_REFS` 个 `SkillRef`，逐项回答正文或 `SkillReadRefusal`，不换成别的版本；目录项不带正文。规则见 [技能包合同稿](../../specs/skill-packs/contract-design.md) 第 6～8 节。

  - 插件的合同（动作、记录、错误码）归插件自己：写在插件包的 `src/contract.ts`、由包的 `./contract` 子路径公开（Shelf 在 `modules/shelf` 的 `./contract`），不放进 contracts，contracts 也不留转发；`tests/plugin-contract-ownership.test.ts` 钉住。`./modules/*` 里留下的是平台的事实（成果库、项目、Characters、情境、系统能力 `functions`、模型提供方、工作区服务等）和仍待迁出的 `alchemist`。跨插件的使用方不 import 提供方的合同，在 Manifest 里按动作 id 消费，源码里自备只写发问所需（id、版本、权限、输入形状）的视图经 `services.actions.invoke` 调，执行时宿主按提供方的定义校验输入、输出与权限。
  - `ActionCallContext.assert_authority_current` 只来自可信宿主和原 dispatcher，必须同步；可选目标与必要权限由当前消费场景/启用声明给出。`bindActionClient` 的 control 尾检只保留真实父调用自己的来源/权限/生命周期，子动作的目标和消费权限仍由绑定 caller 核对；同 caller 的 `retainActionAuthority` 保留来源和目标。`PluginExecutionControl` 不抹除父尾检。无目标尾检仍核原配置权限，不能授予目标权限或复活已结束的调用，不从业务 input、MCP `_meta` 或 run state 读取。
  - 文字引用（`platform/ui-text.ts`，经 `platform/ui` 转出）分两个形状：声明位置的 `TextRef` 没有 `owner`，写了就被 `TEXT_REF_SCHEMA` 拒绝；`OwnedTextRef` 是平台从可信目录绑好主人之后的。`OWNED_TEXT_REF_SCHEMA` 由前者加 `owner` 得来，不复制属性；数字上限只写在 `TEXT_REF_LIMITS`。`SandboxSchema` 写不出联合，字段组合不归 schema 管。改动后跑 `node scripts/run-tests.mjs tests/ui-text-ref-contract.test.ts`。
  - 外观与语言文件的类型（`platform/ui-files.ts`）和展示快照（`platform/ui-environment.ts`）只有类型和现行格式常量；解析和每一条拒绝在插件 SDK 的 `/ui`。每种文件的版本数字只写在 `UI_FORMAT_VERSIONS`，接口的 `format_version` 从它取；快照只有身份和问题，不带令牌值和译文。文字工具（`t`、`say`、`format`）的类型在 `ui-text.ts`，实现同样在 SDK。改动后跑 `node scripts/run-tests.mjs tests/ui-text-files-contract.test.ts`。
- 改了公开导出：`pnpm build` 后跑 `pnpm api:update`，提交 `tooling/gates/api/`；改了动作的形状或声明：跑 `pnpm actions:update`，提交 `tooling/gates/actions/`（两份快照与源码不同，CI 失败；PR 里写对调用方的影响，见 [CONTRACT-CHANGES](../../docs/system/CONTRACT-CHANGES.md)）。
- 改动后必跑：`node scripts/run-tests.mjs tests/action-input-types.test.ts tests/action-schema-compiler.test.ts tests/action-plugin-audience.test.ts tests/plugin-manifest-v2.test.ts tests/plugin-declaration-rules.test.ts tests/action-read-compatibility.test.ts tests/runtime-provider-identity.test.ts tests/plugin-capability-availability.test.ts tests/action-error-model.test.ts tests/plugin-model-service.test.ts tests/action-availability-kind.test.ts tests/action-project-materials.test.ts tests/skill-catalog-actions.test.ts`
- 授权尾检与消费者改动另跑：`node scripts/run-tests.mjs tests/mcp-effect-authority.test.ts tests/mcp-scene-effect-authority.test.ts tests/action-authority-tail.test.ts tests/plugin-owner-effect-fence.test.ts tests/action-before-effect.test.ts tests/functions-scene-configuration.test.ts tests/functions-effect-boundaries.test.ts`。
- 相关手册：[docs/platform/CONTRACTS-AND-OPERATIONS.md](../../docs/platform/CONTRACTS-AND-OPERATIONS.md)、[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)、[docs/system/PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/system/PACKAGE-BOUNDARIES.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`SyncReplicaAdapter.locate(key)` 是 owner 声明的本机导航，可用于冲突与恢复内容定位；不能返回来自远端载荷的授权或设备路径，前端只接受同源导航。缺少端口表示没有可用位置，不授权平台猜测业务键。
`retainBackgroundAuthority(additionalPermissions?)` 只增加已有权限的持续检查，不改变动作引用或扩大授权。传入数组被复制，额外权限必须属于原调用者；未提供独立可信入口授权时仍受原取消边界。绑定客户端分别保留父动作与子动作权限，不能彼此替代。回归见 `tests/action-background-authority.test.ts` 与 `tests/security-invariants-alchemist-resumption.test.ts`。

`PluginModelClient` 的 `images` 只收字节与可选名称，在首次等待前复制；`execution` 保留同次真实推理回执，注入文字替身不伪造。成功结果与可记账失败的 `validateResult()` 必须在原 `beforeEffect()` 之后、同步提交之前调用；它绑定原动作及模型配置，不能跨动作持有。`choices()` 只返回现行模型名称和能力，不给地址或凭据。

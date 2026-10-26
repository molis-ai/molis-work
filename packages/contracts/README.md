# 公共类型与协议

让 Module、Host、Plugin 和 App 通过一致的输入输出协作。这里提供真实的公共类型、schema 和解析规则，而不是功能实现。

包名：`@molis-ai/molis-work-contracts`。工作区内部包，通过仓库构建和 Host 装配使用。


Home 插件的 `PluginDatabaseDeclaration` / `PluginDatabase` 从 `platform/plugin` 导出，`PluginStartContext.provider_id` 区分公共提供方与安装身份；`services.artifacts` 可缺省，Home 没有项目成果服务。`BoundActionClient.invoke` 支持仅限可信 Host 的控制参数，保留父子取消和 beforeEffect 授权链，页面来源通过 `page_context` 单独传递。详见 [作者合同](../../docs/platform/PLUGIN-DEVELOPMENT.md#个人-home-runtime-与插件-sqlite)。

`platform/app-host` 的 `HostPluginCaller.project_id` 为 `string | null`：项目执行器给真实项目，Home 执行器给 `null`，插件、安装、操作者与生命周期仍由 Host 绑定。消费方必须先拒绝不适用的 scope；Agent 项目入口拒绝 Home caller，不能从输入补项目。

`platform/plugin` 的 `PluginActionClient` 在 BoundActionClient 上提供 `invokeQuery`。`ActionCallContext.query_only` 是 Host 设置的收窄标记，绑定的新 caller 与父 control 取逻辑或，任何一方为 true 都保留；不能从业务输入建立授权。Kernel 按当前登记的 operation 和 permissions 检查实际派发，发现之后替换定义也不能绕过。

同一 `platform/plugin` 子路径的 `PluginOwnerFilesReader/Writer/Client/Declaration` 表达可信 Home 主人的私有文件树。`services.ownerFiles` 可缺省；独立读取需当前动作读权限，`write(run)` 只接同步回调并在退出后撤销 writer。目录和顶层条目是插件自己 Manifest 的 `owner_files`（PG-102），初始化钩子和实例来自可信启动条目，不从业务参数取得。

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

- Status: `production`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/package`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`retainBackgroundAuthority(additionalPermissions?)` 只增加已有权限的持续检查，不改变动作引用或扩大授权。传入数组被复制，额外权限必须属于原调用者；未提供独立可信入口授权时仍受原取消边界。绑定客户端分别保留父动作与子动作权限，不能彼此替代。回归见 `tests/action-background-authority.test.ts` 与 `tests/security-invariants-alchemist-resumption.test.ts`。

`PluginModelClient` 的 `images` 只收字节与可选名称，在首次等待前复制；`execution` 保留同次真实推理回执，注入文字替身不伪造。成功结果与可记账失败的 `validateResult()` 必须在原 `beforeEffect()` 之后、同步提交之前调用；它绑定原动作及模型配置，不能跨动作持有。`choices()` 只返回现行模型名称和能力，不给地址或凭据。

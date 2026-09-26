# 本地 Plugin 开发

写一个插件时，先按 [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md) 走完整路径：对象与时刻 → Manifest → UI/客户端 → HTTP → 现场动作 → 判断场景 → MCP → Artifact / 事件 / ports → 按 kind 接到 Host 或 CLI。本文件是命令、MCP 登记、动作录取和打包的手册，不替代那份顺序。Host 装配见 Skill 的 `host.md`，SDK/CLI 见 `authoring.md`，接入见 `integrations.md`。

Native 新工作面除 catalog / Workbench pack 外，还需 `ui-composition.ts` → `renderer.ts` → `goals-page-renderer.ts` 的实际 mount 和页面调用；否则侧栏可见但正文为空。

平台合同变了（Manifest 字段、MCP、behaviors / function_scenes、事件、Slot、plugin-stage、kind 语义），同一任务内更新该 Skill 与本页，不要只改代码。

## 安装 Skill

正文在 `skills/molis-plugin-dev/`（`SKILL.md` 加 `elements.md` / `ui.md` / `host.md` / `authoring.md` / `integrations.md` / `examples.md`），随 npm 包和 `molis-work install` 的 Home release 一起发布。它**不会**在「设置 → AI 与执行工具」里自动挂到 Codex / Claude；那条链路只接 Runtime 工作协议 `goal-advance`。

安装到自己的 Agent 后才能在别的仓库里用。把 `<release>` 换成 `~/.molis-work/config/installation.json` 的 `release_path`：

```bash
ln -snf "$HOME/.molis-work/<release>/skills/molis-plugin-dev" "$HOME/.cursor/skills/molis-plugin-dev"
```

Codex / Claude Code / OpenCode 把目标目录改成各自的 `skills/molis-plugin-dev`。npm 包路径是 `node_modules/@molis-ai/molis-work/skills/molis-plugin-dev`。本仓库里 `.cursor/skills/molis-plugin-dev` 已指向这份正文。

## 创建和运行

这条路径用于开发者运行自己信任的源码，完成第一次真实的插件结果；不是官方市场安装，也不是不可信代码沙箱。当前样例是 polling Integration Plugin。它每次运行产生一个个人 Artifact 版本、读回该版本、保存私人计数，并返回 UI HTML。

先构建仓库和 Plugin SDK、Contracts、Plugin Runtime、Plugin CLI、Local Host。根目录的 `pnpm build` 包含这些构建。当前工作区的 pnpm 依赖自动检查曾要求重建 node_modules，尚未执行该重建；本轮验证使用现有 TypeScript 构建产物，标准干净安装/发布链由 DV4 继续验收。

SDK 的 0.0.0 是本地开发版本，不假设 npm 已有发行物。以下命令在仓库根目录运行，把作者项目和安装数据放在新临时目录：

```bash
plugin_dev_dir="$(mktemp -d)"
node dist/cli/main.js plugin create "$plugin_dev_dir/sample" io.molis.work.example.notes local-developer local-development-binding
pnpm --dir packages/contracts pack --pack-destination "$plugin_dev_dir"
pnpm --dir packages/plugin-sdk pack --pack-destination "$plugin_dev_dir"
npm --prefix "$plugin_dev_dir/sample" install --offline --ignore-scripts --no-audit --no-fund "$plugin_dev_dir/molis-ai-molis-work-contracts-0.0.0.tgz" "$plugin_dev_dir/molis-ai-molis-work-plugin-sdk-0.0.0.tgz"
node dist/cli/main.js plugin validate "$plugin_dev_dir/sample/manifest.json"
node dist/cli/main.js plugin dev "$plugin_dev_dir/sample" "$plugin_dev_dir/state" storage:private,artifact:write,artifact:read,ui:register --allow-unsigned-development
```

`dev` 会真实安装、启动、检查连接、poll 一次、渲染已注册 UI，最后卸载运行实例并撤销 UI/授权上下文。输出 JSON 包含健康状态、poll 结果、各个 Artifact 版本、渲染 HTML 和最终安装记录；退出码 0 表示该次健康检查与 poll 成功。它不打开浏览器，也不把 HTML 渲染成功称为用户交互已验收。

再次运行同一条 dev 命令，新进程会从开发数据库恢复私人计数并生成下一版本；已产生的 Artifact 保留。空 grant 字符串 `""` 会触发缺权限拒绝。缺少显式源码执行选项不会执行插件。版本不兼容在加载入口前拒绝。开发代码可以访问进程和文件系统，Host grant 只限制提供给插件的 API，不能阻止任意 JS 自行执行其他操作。

状态目录只能是新目录、空目录或已有 `.molis-work-plugin-development.json` 标记的开发目录。普通非空目录不会被用作数据库；这条命令不选择或改动用户项目 catalog。同一状态目录用于串行调试，不是多进程运行服务；强制杀进程后的安装状态恢复、后台托管与发行物安装不是本命令承诺。不要把正式项目或 Team Server 目录作为开发状态目录。

## 作者 API 与公共测试入口

作者从 `@molis-ai/molis-work-plugin-sdk` 导入 `definePlugin` / `definePollingIntegrationPlugin` 及公开类型，在 `start(context)` 中使用 `context.services`：

- `storage`：字符串 get/set/delete，仅自身安装数据，须声明并授予 storage:private。支持的 Host 还提供可选 `compareAndSet(key, expected, value)`，原子地按旧值更新；null 表示仅在 key 不存在时创建。冲突返回 false 且不写入。需要此能力的插件须检查方法是否存在，不能用 get/set 模拟；它不是跨 key 事务或团队同步。
- `artifacts`：同步 publish 个人内容、按 id + version read；Host 按安装实例自动注册到共同动作 Kernel，绑定项目、用户、生产者并检查实时 grant。通过 Artifact type/schema 互通，不要求指定哪个插件生产；这类私有 SDK 动作不导出成普通 MCP 工具。
- `ui`：注册 Manifest 声明的自身 contribution，由 UI Host 检查挂载格式，停止后撤销。

这些是公开 Contract，不向作者开放 Store、SQL 或其他模块内部路径。缺权限、停用的旧上下文和未声明的类型/界面贡献都会被实际 owner 拒绝。本样例不请求网络、不自动 Team 分享；分享仍是用户明确选择的业务操作。

嵌入式测试使用 `@molis-ai/molis-work-app-local-host` 的公共 `runPluginDevelopment(input, options)`：输入是已授权的源码目录、项目/用户、grants；options 注入真实 Artifact owner、UiHost、Plugin Runtime repository、私有存储工厂，以及 `actions: { registry, client, project_id }`。registry/client 必须来自同一 Host：分别使用 `host.actionRegistry(reference)` 和 `host.syncActionClient(reference)`；项目已打开后才可同步调用。独立测试可显式共享一个 ActionService，不在生产创建临时注册表兜底。它与应用命令使用同一安装/运行/卸载实现，返回 `PluginDevelopmentResult`，不要求导入仓库测试文件。数据库装配属于应用 Host，不属于 SDK 或 CLI。CLI 的 `PluginCliHost.runDevelopment` 是具名的注入接口，不是任意方法总线。

## 当前项目设置

跨模块读取当前项目目标目录、创建意图或补充便笺可引用 Goals 的 `goalsActions.list/create/note`。公共动作输入只有业务字段，board 与 actor 由可信调用上下文绑定；不要把内部 typed Capability 的 actor 字段复制进动作 JSON。权限分别为 `goals:read` / `goals:write`，写入重试保留原 idempotency key。Actor 的审计分类及兼容适配器保留的 `audit_actor_id` 属于可信上下文，不是业务参数，不改变客户端授权，也不授予决策权限。三项旧 MCP 名称同样依赖对应动作授权；其他 Goals 事件能力仍按其现有接口和审批合同使用，迁移状态见 Goals 包 README。

已由当前项目 Runtime 注册的插件，HTTP 路由从 Manifest `routes` 与运行中的 `contribution.routes` 派生，挂在 `/projects/<project>/api/plugins/<plugin_id>/...`。不需要追加 Host 的插件 ID 正则名单；后续注册也不会移除先前插件的路由。路由适配器使用 `bindPluginActionRoute` 调用同一动作服务，输入和权限检查不会因 HTTP 入口而绕过。Web 写入仍须通过原控制令牌、origin 和一次性请求键检查，停用后不得靠请求或 restart 自动重新启用。

原 `/restart`、`/release-quarantine`、`/upgrade` 是 Host 生命周期入口，插件业务路径需避开它们。内置插件继续遵守项目启用与关联插件规则；其他插件遵守当前项目的 Runtime 注册、授权及生命周期。新路由返回值不会按 Coding 的 report、runs 等字段擅自补充页面 HTML。此机制负责已注册实例的分发，发行物安装与启动仍走 Runtime 的原接入合同。

插件跨页读取项目设置使用具名能力，不读取设置页 DOM 或其他插件私有存储。Contract 中 `projectSettingsCapabilities.workspaces` 与 `browsingWorkspace` 分别声明到 Manifest `capabilities.consumes`，再以 `invoke(capability, [])` 读取。只返回当前项目；没有项目编号、通配授权或任意 key。关联目录与浏览选择在「项目设置 → 工作目录」维护，Files/Git 不再依赖 Workspace 输出；Coding 会话执行目录独立选择。

完整字段、迁移、示例与设置归属：[当前项目设置](PROJECT-SETTINGS.md)。`settings` 槽只负责呈现，`storage:private` 仍是插件私有状态；Goals 项目说明保持独立协议。

## 插件版本升级

插件发布新版本时，递增 Manifest `version`。`upgrade_compatibility` 只接受精确的 SemVer 来源版本；较高目标版本的来源必须早于目标版本，每个来源版本只能列在以下一项：

```json
{
  "upgrade_compatibility": {
    "compatible_from_versions": ["1.2.0"],
    "migratable_from_versions": ["1.1.0"]
  }
}
```

`compatible_from_versions` 表示新实现能直接使用该版本的私人数据和既有 grant。为同一版本修正文档时，也可精确声明兼容当前已安装版本；这只允许插件继续运行，不改变已保存的 Manifest 指纹，也不会产生市场升级候选。重新打开项目可以用已声明兼容的新实现恢复旧安装，但不会改写已安装版本；市场会列出更高版本的升级候选，只有用户点「升级」才提交新版本。

Runtime 管理的首方 Native 工厂会保存为单文件发行物，写入当前项目已有 SQLite 的 `plugin_runtime_release_artifacts` 表，身份由插件 ID、发布者签名、版本和 Manifest 指纹确定。Host 重启时，不兼容的新版候选不会顶替旧实现；Runtime 会加载已安装版本的发行物，或加载一份明确兼容该已安装版本的留存实现。兼容实现恢复时安装记录仍保持原版本。首次安装、明确兼容的新版实现首次运行，以及用户点击「升级」前都会归档对应代码；保存的是可执行代码，不属于 `storage:private`，也不会创建独立代码目录。

`migratable_from_versions` 表示发布者允许从列出的旧版本手动升级，但不能据此直接启动新实现。目标 `PluginDefinition` 必须实现 `validateUpgrade({ from, context })`：在切换前只读检查 `storage:private` 数据能否被目标实现处理。校验上下文只提供只读的 `get` 和必要身份，不暴露其他 Host 服务。Host 不执行数据迁移；预检通过后，目标版本按现有格式直接使用这些数据。需要转换格式的插件目前不受此协议支持。验证失败时旧安装记录、grant 与私有数据保持原样。

无论升级方式，目标 Manifest 都必须保留旧安装的全部 grant 声明及必需权限；升级不会重新授权、改变签名身份或创建新私人库。常规启动不会把新 Manifest 写成已安装版本；未声明支持的来源版本可在市场显示为不可升级，不会在项目启动时被静默替换。显式升级目标必须高于当前版本。当前升级入口作用于当前项目的 Runtime 安装。

Native 作者必须让实现代码变化对应到新的 Manifest 版本或 Manifest 指纹；相同的版本和指纹表示同一发行物。不要把未声明兼容关系的新版代码依赖于启动时替换旧安装。当前发行物保留用于 Runtime 管理的首方 Native 插件，包括 Coding 面板插件和 Plugin Builder 本体；仍由 Host 构建期组合的其他插件不会自动获得这条版本化恢复能力。Native Plugin 与 Host 在同一进程运行，版本归档不构成 JavaScript 沙箱。

Plugin Builder 将每次发布保存为独立版本记录。发布新版只产生候选，不会启动新版本；作者需要明确选择直接兼容，或要求升级时校验数据。库页会显示 Runtime 实际安装版本和最新发布，用户选择「升级」后才调用同一套 Runtime 校验与回滚流程。Host 重启后按安装记录恢复对应的 Builder 发布版本；不要用 Builder 的最新发布覆盖尚未确认升级的版本。

## 统一动作与消费场景

新能力使用 `actions` 与 `action_scenes`，由 Kernel/Plugin Runtime 注册执行。SDK `defineAction` 提供定义与 handler 配对；场景必须兑现 `bindings`、`bind`、`consume`。用 `event_schema`/`prepare` 分离触发事件、函数输入和私有对象快照；可选 `failed` 负责明确的失败消费，同样接受绑定、权限、生命周期和对象检查。`required_scene` 让 Host 依据实际绑定计算触发入口状态。

Host 的动作客户端和场景客户端共享项目运行时与执行队列。兼容场景通过输入输出及语义合同发现，使用位置从原业务配置读取；新增插件不改中央能力或场景 ID 名单。插件有业务权限不代表外部 MCP 客户端有同样权限。细节与示例见 [SDK](../../packages/plugin-sdk/README.md#动作与判断消费场景)、[Inbox 场景](../../plugins/native/inbox/src/scenes.ts)、[实际自动触发验证](../../tests/inbox-automatic-scenes.test.ts)。

系统规则编辑器通过场景 owner 的 `targets` / `bind` 自动显示真实配置位置。场景声明 `configuration_permissions`，配置保存携带准确提供方和原 revision；原 owner 原子拒绝过期修改。目录查询不创建规则，停用保留原引用。具体接口和权限边界见 SDK。

无需再手写一份 MCP 管理工具。Host 会从上述合同生成查看位置、启用、停用三项动作，沿用场景的版本、提供方和生命周期，进入现有能力目录及对外授权设置。只有消费场景、没有自定义动作的插件也适用。配置权限与运行权限独立；缺少模型或执行权限时，有配置权的用户仍能停用原绑定。外部客户端须获具体管理动作的授权，不能借其他动作的同名权限执行。

当前范围：Home、Inbox、Feed 的绑定与真实触发已进入共同场景；工作流交接保留原调用者。Agent 旧行为目录、其他存量消费者和完整系统管理体验仍在迁移。以下 `mcp_exports` 仅用于维护已有兼容入口，不作为新增能力再建目录或名单的理由。

## 对外 MCP

Molis Work 对外只有一个 MCP 进程：`molis-work-mcp`。插件不要自己开 MCP 端口，也不要新开 MCP 包。新能力使用上文 SDK 的动作合同。下面仅说明存量 `mcp_exports` 的维护；动作的逐客户端、逐项目授权已接入「能力 → 对外接入」，选项从同一注册表发现，不需前端白名单。旧插件与判断工具名称也受相同动作授权约束，该页「旧版工具（全局开关）」只控制这些兼容名称是否启用。

`agent.mcp` 是反过来的：插件里的 Agent 能不能去调外面的 MCP。不要拿它当对外贡献开关。

### 作者要做的

1. 存量兼容名的 Manifest schema 2 `mcp_exports` 保留 `tool_id`（插件内唯一，`[a-z0-9][a-z0-9_-]*`）、`description`、`input_schema`（`type: "object"`）、`effect`（`read` 或 `write`）。可选 `audience`（省略 = `runtime`）、`scope`（省略 = 当前绑定项目必须启用本插件）。还须用非空 `required_actions` 列出 `{ capability_id, version, provider_id? }`；provider 省略指本插件。所有引用的动作已授权且可用，旧工具才进入调用目录。
2. 不要写 `enabled`、不要写对外正式名、不要在 `input_schema` 里放 `board_id` / `database_path` / `web_base_url` / `actor_id` / `actor_kind` / `runtime_actor_id` / `submitted_session_id`。身份由 Host 注入。`mcp_exports` 会自动进行为总表，`behavior_id` 就是公开工具名，`subject_kinds` 是 `mcp_invoke`；不要再为同一个工具写一条 `behaviors`。
3. 公开名由 Host 盖：`molis_work_v1_<短名>_<tool_id>`。短名是项目插件 id，不是在 Manifest 里拼出来的。
4. Handler 只认 `{ tool_id, arguments }`。未在 Manifest 登记的 `tool_id` 即使代码里有实现也到不了。
5. 兼容名称默认关。开关不授予动作权限，客户端另须取得每项所需动作授权；现有与新连接的下次发现和调用都读取当前状态。旧复合工具须覆盖全部参数分支，例如 Pages 翻译并新建、Jelly 自动读取版本后的写入。需要更窄的权限时直接调用对应公共动作。不要把开关做进插件自己的 `settings-page`。
6. 个人、不绑项目也能用的方法标 `scope: "home"`。项目能力保持默认 `scope: "project"`。个人插件但内容按当前项目分区的（Pages / Forms / Dataset / PPT）不要标 home；Host 从绑定连接注入 `project_id`，schema 里不要出现它。未绑项目时这些方法不进 list/call。

存量插件示例：[`plugins/native/form/src/mcp.ts`](../../plugins/native/form/src/mcp.ts)（个人插件、项目分区）。Functions 已移除插件身份，原三个公开名称由 [系统别名适配](../../apps/local-host/src/mcp-functions-tools.ts) 转到同一动作服务；不能再作为新插件模板。类型从 `@molis-ai/molis-work-plugin-sdk` 再导出。

### 两种兑现方式

**存量 Native（Pages / Forms / Dataset / PPT / Cognia / Jelly）**：[`apps/local-host/src/mcp-native-plugins.ts`](../../apps/local-host/src/mcp-native-plugins.ts) 仅保留历史名称的参数/结果适配处理器。它们调用同一授权 ActionClient，正式 stdio 转发到常驻 Host；不打开另一套业务 Store，不由 Manifest 计算并授予权限。新插件无需加入此表，没有历史 adapter 也不会阻止其公共动作注册。

**运行时托管 app 插件**：`start()` 返回 `contribution.mcp`，`tool_id` 必须和 Manifest 一一对应。Plugin Runtime 启动时会校验，缺一条或多一条都是启动失败。生产 `tools/call` 还没有把这类插件接到 Runtime；在 Host 接上之前，不要给 Coding 等产品插件填 `mcp_exports`。

### 不要做的

- 新开 MCP 进程、MCP 包，或在 `apps/mcp` 的 tool-catalog 里写死插件工具。
- 在 `LocalMcpServer.callTool` 里按公开名写 `if`。
- 复用 `agent.mcp`。
- 把 MCP 开关和「AI 与执行工具」做成一页。

Host 侧改哪里、调用链怎么走，见 [CLI 与开发 · 对外 MCP](../cli-and-development.md#对外-mcp)。协议与 Runtime Skill 仍以 [MCP 接入](../mcp.md) 为准。

## 事件去向的动作名单

Functions「用在哪」里，首页 / Inbox / Feed 是事件去向：判断本身不改数据，也不在现场长出新按钮。默认建议人点击已有处置。Feed 来源规则另有用户显式配置的 `admission: "inbox"`：Feed 用例消费判断后加入 Inbox（失败或不确定进入待复核），不改变 Functions 的只判断职责，也不授权其他自动动作。旧规则默认 `suggest`。Agent 去向才放「能调、但不长在这张卡片上」的动作（含 MCP 写工具）。

Inbox → Pages 通过 Host 组合各插件公开能力，输入快照与幂等收据归 Pages，Attention 仍归 Inbox 对应 Module。Workbench 助手复用这些 HTTP 动作；未新增对外 MCP 或 Native 事件总线。标签对象恢复与调用约定见 [Host 接线](../../skills/molis-plugin-dev/host.md#信息整理的-host-组合)。

**判断可推荐的动作，必须是该对象上真实可执行的处置。** 推荐不是执行授权；用户执行建议时仍要准备实际参数并核对当前对象和权限。

首页从插件的 subject offers 声明派生推荐选项。动作身份包含原查询、版本、提供方及 offer_id，插件返回真实事项对应的输入；不能用同名字符串把两个插件的处置混为一谈。未声明为规则选项的按钮仍可手动操作，不因此自动进入判断结果。

新增判断消费者应声明 `action_scenes`，说明触发时机、实际输入、接受的结果和消费效果，并兑现原数据的读取与写入。系统从合同检查兼容性；不能靠加入 `function_scenes` 或 Host 白名单获得一个看似可用的用途。仅有场景名称、没有业务触发和消费，不能宣称接入完成。

例如 Feed 捕捉读取原消息，只有规则明确配置自动入箱时才消费相应结果；Home 返回推荐，执行仍由原 offers 处理器完成。导航、来源设置和账号管理是否出现在某个场景，应由实际对象和消费合同决定，不把插件所有能力都加入一个统一选项池。

接入步骤与当前迁移边界见 [SDK](../../packages/plugin-sdk/README.md#动作与判断消费场景)、[Host 接线](../../skills/molis-plugin-dev/host.md#接到统一判断场景)及[迁移清单](../../specs/action-architecture/migration.md)。旧 Agent 行为目录尚待清理，新增消费者不再扩充旧池。

## 打包与签名

`molis-work plugin pack <source> <bundle.json>` 只包含 package.json 的显式 files 以及 package.json/manifest.json，拒绝目录跳转和符号链接；不执行安装脚本、不自动收集依赖。样例运行依赖同版本的公开 SDK 分发包，bundle 本身不是独立安装器。JSON bundle 上限 64 MiB，输出文件不覆盖已有文件。

对真正要签名的包，先用 `molis-work plugin identity <public.pem>` 取得 Ed25519 公钥绑定身份，作为 create 的 binding-signature；再 pack。`sign <bundle.json> <private.pem> <signed.json>` 必须显式指定私钥文件，身份须与 Manifest 一致。`verify <signed.json> <trusted-public.pem>` 使用调用者信任的公钥校验全部包内文件与 Manifest；没有签名、内容被改、发布者不符都会失败。也可用 Runtime 的 `PluginPackageSigner` 对接发布环境，避免把密钥暴露给应用。

签名只证明内容和发布者身份，不代表官方审核；验证 bundle 不授权执行另一份源码目录。示例中的 local-development-binding 不具备密码学签名含义。本轮测试只使用新生成的临时密钥，没有接触用户密钥或发布 registry。

## 可复现验证

构建后运行 `node --import tsx --test tests/plugin-sample.e2e.test.ts tests/plugin-package.test.ts`。前者从干净目录实际调用 CLI、安装本地 SDK tarball、运行两个独立进程并核对结果/历史版本/权限/目录边界；后者验证签名与篡改拒绝。其他 Host/Runtime 定向测试覆盖崩溃恢复、卸载失败撤权和不同签名数据隔离。整体前后端用户 E2E 仍在所有重组开发完成后单独执行。

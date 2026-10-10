# 本地 Plugin 开发

写一个插件时，先按 [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md) 走完整路径：对象与时刻 → Manifest → UI/客户端 → HTTP → 现场动作 → 判断场景 → MCP → Artifact / 事件 / ports → 按 kind 接到 Host 或 CLI。本文件是命令、MCP 登记、动作录取和打包的手册，不替代那份顺序。Host 装配见 Skill 的 `host.md`，SDK/CLI 见 `authoring.md`，接入见 `integrations.md`。

新的内置插件按仓库 `AGENTS.md` 只走 Plugin Runtime：在 `apps/local-host/src/project-plugins.ts` 加监督器条目，不再手接 `ui-composition.ts` → `renderer.ts` → `goals-page-renderer.ts`，也不再新增构建期（旧路径）条目或 `<插件>-native-plugin-http.ts`。Runtime 装配仍有两处接线：一是 `apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 里要有它的目录条目（Manifest、`summary`、`workbench` 次序与客户端资源），并把它的 id 加进 `tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED`（门禁要求每个 Runtime 装配的 id 都有目录条目）；二是主区由 Host 经 `plugin_stages` 渲染（`plugin_panels` 这条接缝存在，但现在没有生产代码填它）——Coding 以及 Files、Git、Diff、Text Stats 的舞台在 `apps/local-host/src/coding-surface.ts` 渲染，`web-goals-read.ts` 把它们填进页面视图，运行时安装的插件的舞台与插件栏条目来自 `installedPluginStages`。

平台合同变了（Manifest 字段、actions / action_scenes、MCP、事件、Slot、plugin-stage、kind 语义），同一任务内更新该 Skill 与本页，不要只改代码。

内置插件的共同目录是 `apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG`：每个条目绑定包导出的 Manifest、目录信息、Agent 正文及可选 `workbench` 资源。其中仍走构建期装配的旧路径插件，名单冻结为 `tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED`、只许减少；Runtime 装配的插件在同一目录里也有条目，目录会随之增长。目录、Workbench UI 注册/样式/客户端从同一条目派生；`workbench.order` 只控制原静态资源顺序，不覆盖导航声明。能力直接注册公共 actions。业务实现、真实 I/O 端口装配与权限仍由原 owner 负责，声明和可发现都不等于已授权。

## 安装 Skill

正文在 `skills/molis-plugin-dev/`（`SKILL.md` 加 `elements.md` / `ui.md` / `host.md` / `authoring.md` / `integrations.md` / `examples.md`），随 npm 包和 `molis-work install` 的 Home release 一起发布。它**不会**在「设置 → AI 与执行工具」里自动挂到 Codex / Claude；那条链路只接 Runtime 工作协议 `goal-advance`。

安装到自己的 Agent 后才能在别的仓库里用。把 `<release>` 换成 `~/.molis-work/config/installation.json` 的 `release_path`：

```bash
ln -snf "$HOME/.molis-work/<release>/skills/molis-plugin-dev" "$HOME/.cursor/skills/molis-plugin-dev"
```

Codex / Claude Code / OpenCode 把目标目录改成各自的 `skills/molis-plugin-dev`。npm 包路径是 `node_modules/@molis-ai/molis-work/skills/molis-plugin-dev`。本仓库里 `.cursor/skills/molis-plugin-dev` 已指向这份正文。

## 一套标准：官方插件与生成插件

`skills/molis-plugin-dev` 是做插件的唯一标准：官方插件（人或编码 Agent 手写）按它写，插件创作台生成插件时，主线设计与代码 Agent 在运行时经 Prologue 挂载它（设计阶段挂 `process.md`、`generated-design.md`、`generated-ai.md`、`ui.md` 的质量线与 `capabilities.md`；代码阶段挂 `generated-code.md`、`generated-ai.md` 与 `capabilities.md`；版本取正文摘要，写进每次运行的 promptVersion）。

- 交付流程与每步做完的标准：`process.md`（按模型能力伸缩：能出图就给效果图，能读图就加截图走查）。
- 质量线（所有插件）：`ui.md#质量线所有插件`——只用 UI 目录组件、三态、一处主操作、token 配色、不重复插件名大标题。视觉统一按 [DESIGN.md](../../DESIGN.md) 的 Soft Workbench：插件画在同一张连续白色工作面里，不画自己的外框卡片、不带身份色；石墨主操作、铜色焦点与链接、字重 400/500/600；全局入口在底栏（Dock 与插件切换器），`navigator` Slot id 保留，没有全局侧栏。
- 生成界面：首次生成先运行体验设计，输入所选方案与组件能力，输出可重组的部件草图和代表性使用场景；主线 detail 将它们落成绑定与验收后才冻结。`generated-experience.md` 管任务动线、信息层级与体验标准；`generated-ui.md` 管冻结合同后的整页呈现。UI 与评审收到宿主的交互词表：Sheet/Dialog 的 title 是入口及面板名称，submitLabel 是内部提交；行内动作先选中所点记录再执行；成功反馈会清除（包括减少动效模式）。有全文阅读路径的组合目录使用两行摘要，完整正文不裁切。界面纯修订不改变绑定或后端。
- 能力：`capabilities.md`——统一动作服务是唯一目录；动作写清 `effect`（read / write / irreversible），带 `agent` 受众的可逆动作自动对生成插件开放，`plugin: false` 可退出。名字像删除、其实可撤销的动作用 `withActionEffect(definition, "write")` 明写效果，`withActionEffect` 从 `@molis-ai/molis-work-plugin-sdk` 导入（导入写法放在本页而不放进 `capabilities.md`：创作台挂载那一章，改动要先按 [STUDIO-SKILL-REPLAY](STUDIO-SKILL-REPLAY.md) 用真实模型跑 `smoke`；生成代码也只能导入 `@molis/plugin-sdk`，用不到它）。

生成插件从能力到安装：
- 能力板是项目的统一动作目录。目录第二次询问时带上动作需要的权限，只列真能调用的；插件没在本项目启用的显示"未启用"。
- 选定方案后，方案里每个能力的合法候选由系统算出：同一提供方、读写类别相同、与这项功能同样贴近。有多个时由 Jev 选定，说明书按选定能力的真实输入输出来写。
- 用到未启用的插件时，构建停在决定卡片：启用后接着构建；不启用，就把"不要用它"交回主线设计修订。
- 试用与验收时，别处的写入与读取都由替身按输出 schema 代答：列表里有一条文字为「示例」的记录。
- 安装授权分"它自己的数据 / 会读取 / 会替你改动"列出；不可撤销的动作不开放。
- 安装后，生成插件的每项功能登记为统一目录里的动作：提供方是 `plugin:<插件 id>`，能力 id 是 `generated.<构建号前 8 位>.<功能 id>`，受众为用户、agent、workflow、MCP 和插件。停用或卸载时撤回，升级时换成新版本的。调用在插件自己的沙箱里运行，身份是插件本身。
- 公开操作的事实来源是已发布 `SandboxContract.operations`，安装 Host 派生注册；合成 Runtime Manifest 负责执行容器身份，不重复保存操作表。不要修改同版本 Manifest 指纹或替换旧 provider 来实现形式上的统一。发现与调用准备会按当前依赖目录刷新 `execution.cost`，包含生成插件之间的传递依赖；本地操作为 none，声明的收费依赖为 metered，网络、缺失或循环依赖无法确认费用时为 unknown。费用变化不扩大授权，只替换相关动作的注册；普通查询目录不撤销在途执行。
- 同一安装 owner 复用每个已发布版本的唯一执行定义，升级后回滚使用原定义；不能为绕过冲突而放宽 Runtime 的同版本校验。版本切换先核对批准覆盖发布所需权限，沙箱只持有该发布所需集合；卸载清理定义，重新安装创建新实例（可以是别的已发布版本：保留了数据的，目标版本须声明兼容被卸载的版本，否则要人确认放弃旧数据后全新安装；停用的安装可以升级或回滚，版本换了仍停用，重启后也一样）。
- 生成插件命名提示词按可信项目/安装上下文选择当前发布声明，再应用 Home/owner/prompt 用户覆盖；创作台实时试运行使用构建声明的正文。未知 id 在当前版本中拒绝，不能借其他项目或已安装版补全。设置页聚合多安装登记，优先展示启用安装中的最新 prompt 默认；各次执行仍保留自己的默认版本。停用/升级/卸载只更新该安装登记，用户修改在重装后继续有效。
- 生成式动作声明 `concurrent`，由各自沙箱的有界队列串行执行；不能占住项目动作队列再反向调用平台能力。Host 通过独立的 `execution` 参数把原调用的 signal/beforeEffect 传到 route、Runner、Broker 和服务适配器。它不是 JSON 字段或 actor 名称授权；页面仍只调用声明的组件绑定。存储 CAS、嵌套 Action、DNS/密钥解析后的网络派出均须复查。排队取消不影响别人的执行，执行中取消终止该通道；结果可能已产生的调用不自动重试。任务自己的持久授权由任务 owner 重建，不能保存当前回调供下次运行。
- 安装后的每次 operation 使用当前依赖目录的版本与执行声明，按该操作的实际依赖计算通道和超时。query 在运行时也不能调用 metered 或写入能力，避免依赖升级后页面刷新产生收费/写入。等待中提供方、版本、可用性或策略改变，原调用停止提交，新调用重新读取；不要求重启安装来刷新策略。未知费用仍是 unknown。
- Host 服务或嵌套 Action 超时后，外部结果可能未知。可信 Host 将 unknown 保留到沙箱调用、安装 HTTP、公开 Action（`actions.outcome_unknown`）及 Schedule 恢复记录；插件 catch 错误或返回替代值不能清除该状态，也不能继续写入。worker 不能伪造这个标记；用户下一次明确调用使用独立状态，旧操作不自动重放。
- 到点提醒（`reminders.*`）由 Schedule 在公共目录提供，按项目和安装实例隔离；到点将文字放入收件箱，不运行插件代码，也不依赖打开创作台。定时执行（`schedules.*`）同样由 Schedule 保存计划和每次执行记录，实际 operation 由当前安装的沙箱执行，结果可进收件箱。Host 在项目恢复和发现时登记执行入口，关闭 Studio 不影响安装运行；登记本身不清空队列或补跑，真正派出必须取得新的 Scheduler lease。
- `schedules.add` 的插件/安装身份来自调用上下文，每个安装世代最多 20 个未完成计划；daily/weekly 保持固定 24 小时/7 天。尚未派出的 pending 可以等待执行入口，running 中断后的未知结果停止后续排期，不能当普通失败自动重放。输入、计划、结果与 Inbox 的事务规则属于 Schedule；Scheduler 只管排期和 lease，插件仍拥有实际业务实现。
- 旧创作台提醒与定时执行不再导入 Schedule（用户已定旧数据不留兼容路径）。重装插件后，旧安装留下的提醒由管理者在提醒详情核对内容和当前安装，用 `schedule.reminders.recover` 明确交给当前安装并恢复原排期；定时执行里的未知结果，先通过 `schedule.tasks.list` 或页面核对，再用 `schedule.operations.recover` 明确恢复、重试或跳过。Action 拒绝过期的任务/历史 revision 与安装世代/版本，声明 `plugin: false`，新插件不能借此继承旧任务。重试可能重复外部副作用，决定及原说明保留；确认只调整计划，不在管理请求中运行插件代码。
- `installed-plugin-host.ts` 复用原发布版本、批准记录、Manifest 指纹和 Action id，恢复已安装插件不初始化创作 Workflow。正常 Host 关闭使用 Runtime.stop 的 `preserve_enabled`，保留 startable 的 installed 状态；显式停用留下 disabled，重启不自动启用。批准或发布记录缺失会报告恢复失败，不能改用 release.permissions 自动补权；缺少批准记录时可卸载并保留数据，再重新确认安装。
- 通用提醒的提供方是 Host 装配的 `schedule.reminders`，不要求启用可选的 Schedule 对话页面；调用仍检查真实安装身份与原能力授权。不要把可发现误当成已授权。
- 联网（`networkDomains`）：只能 https、访问批准的确切域名、公网地址；安装前只读，写入用替身。本机代理用 fake-IP 模式时，域名会解析到 198.18.0.0/15；按用户决定，这一段放行（插件只能按批准的域名访问，不能直接写地址）。
- 和模型的连接中断（fetch failed、terminated 等）时，主线设计与代码 Agent 都会自动重问两次，不计入修复轮数；已经写下的文件保留。
- 设计答卷里的常见笔误由宿主整理并在构建记录里写明：方案草图里各页重复的组件名按页改名；类型提示里带空格（`string(YYYY-MM-DD HH:mm)`）照常识别；读记录列表却写了 `{{字段}}` 的文字块，改为显示刚执行的命令结果。命令输入里的幂等键、请求号从表单去掉，由代码生成；同页刚得到的一句文字结果，预填到下一张表单对应的文字字段。写在列表 `actions` 里的按钮移到页面上和列表并列；例子里只写了字段名或类型名的期望值（`"loggedAt": "loggedAt"`），只检查字段存在。模型长时间连不上时，重问三次后构建停下并说明原因，不占修复轮数。完整设计里的组件名仍须唯一，由主线设计修正。

改这些章节会直接改变插件创作台的行为：改完用 `tests/agent-built-plugins-agent.test.ts`（挂载）与一次真实生成验证。

## 创建和运行

这条路径用于开发者运行自己信任的源码，完成第一次真实的插件结果；不是官方市场安装，也不是不可信代码沙箱。当前样例是 polling Integration Plugin。它每次运行产生一个个人 Artifact 版本、读回该版本、保存私人计数，并返回 UI HTML。

先构建仓库：根目录的 `pnpm build` 包含 Plugin SDK、Contracts、Plugin Runtime、Plugin CLI 与 Local Host；安装与构建命令见仓库根的 `AGENTS.md`。

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

嵌入式测试使用 `@molis-ai/molis-work-app-local-host` 的公共 `runPluginDevelopment(input, options)`：输入是已授权的源码目录、项目、grants（`PluginDevelopmentInput` 没有操作者字段）；options 注入操作者 `actor_id`（嵌入的调用方自己传：这个函数既不固定它，也不读 `input` 里的身份）、真实 Artifact owner、UiHost、Plugin Runtime repository、私有存储工厂，以及 `actions: { registry, client, project_id }`。registry/client 必须来自同一 Host：分别使用 `host.actionRegistry(reference)` 和 `host.syncActionClient(reference)`；项目已打开后才可同步调用。独立测试可显式共享一个 ActionService，不在生产创建临时注册表兜底。它与应用命令使用同一安装/运行/卸载实现，返回 `PluginDevelopmentResult`，不要求导入仓库测试文件。数据库装配属于应用 Host，不属于 SDK 或 CLI。CLI 的 `PluginCliHost.runDevelopment` 是具名的注入接口，不是任意方法总线。命令行的开发入口（`runLocalPluginDevelopment`）走的是另一扇门，Host 能力 `pluginDevelopmentCapability`：它声明 `host_only`（插件在 consumes 里列出也会被拒绝），操作者由 Host 固定为 `local-plugin-developer`，参数里带 `actor_id`、`actor_kind` 或 `audit_actor_id` 被拒绝（`actions.input_invalid`），项目必须是客户端打开的那个。

## 当前项目设置

跨模块读取当前项目目标目录、创建意图或补充便笺可引用 Goals 的 `goalsActions.list/create/note`。公共动作输入只有业务字段，项目与 actor 由可信调用上下文绑定；不要把内部 typed Capability 的 actor 字段复制进动作 JSON。权限分别为 `goals:read` / `goals:write`，写入重试保留原 idempotency key。Goals 的写入声明 `authorship: "session"`，审计作者由宿主写进 `caller.audit_actor_id`，它属于可信上下文，不是业务参数，不改变客户端授权，也不授予决策权限；外部客户端只看到被授予的动作工具。其他 Goals 事件能力仍按其现有接口和审批合同使用，见 Goals 包 README。

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

`compatible_from_versions` 表示新实现能直接使用该版本的私人数据和既有 grant。为同一版本修正文档时，也可精确声明兼容当前已安装版本；这只允许插件继续运行，不改变已保存的 Manifest 指纹，也不会产生市场升级候选。重新打开项目可以用已声明兼容的新实现恢复旧安装，但不会改写已安装版本；市场会列出更高版本的升级候选，只有用户点「升级」才提交新版本。内置插件是例外（随 Host 发布，监督器条目标 `bundled`）：启动时安装记录改成这个构建的清单，版本更高、更低或同版本摘要不同都一样，保留 `install_id` 与私有数据，也不进市场候选，所以不写 `upgrade_compatibility`（[发布策略](../releases/POLICY.md)第 7 节）；本节其余关于启动不改写安装记录、市场确认升级和发行物恢复的说明，都针对不带 `bundled` 的插件。

Runtime 管理的首方 Native 工厂会保存为单文件发行物，写入当前项目已有 SQLite 的 `plugin_runtime_release_artifacts` 表，身份由插件 ID、发布者签名、版本和 Manifest 指纹确定。内置插件（`bundled`）启动时跟随当前构建，不从这张表恢复旧版：当前构建的发行物照旧写入，但恢复只对不带 `bundled` 的条目生效，此外只有 Schedule 提醒读这张表，按安装记录的版本与摘要取插件显示名。不带 `bundled` 的条目在 Host 重启时，不兼容的新版候选不会顶替旧实现；Runtime 会加载已安装版本的发行物，或加载一份明确兼容该已安装版本的留存实现。兼容实现恢复时安装记录仍保持原版本。首次安装、明确兼容的新版实现首次运行，以及用户点击「升级」前都会归档对应代码；保存的是可执行代码，不属于 `storage:private`，也不会创建独立代码目录。

`install_id` 是稳定的数据命名空间，重装可沿用保留的数据；持久任务还必须绑定 Runtime 的 `installation_generation`。后者在确认重装时更新，重启、停用/启用和版本升级保持不变。Host 直接读安装记录的 `installation_generation`，不从任务输入接受安装世代。Schedule 提醒与定时操作都按此规则隔离：世代不符的记录保留，不自动投递或执行，等重装后确认归属。

`migratable_from_versions` 表示发布者允许从列出的旧版本手动升级，但不能据此直接启动新实现。目标 `PluginDefinition` 必须实现 `validateUpgrade({ from, context })`：在切换前只读检查 `storage:private` 数据能否被目标实现处理。校验上下文只提供只读的 `get` 和必要身份，不暴露其他 Host 服务。Host 不执行数据迁移；预检通过后，目标版本按现有格式直接使用这些数据。需要转换格式的插件目前不受此协议支持。验证失败时旧安装记录、grant 与私有数据保持原样。

无论升级方式，目标 Manifest 都必须保留旧安装的全部 grant 声明及必需权限；升级不会重新授权、改变签名身份或创建新私人库。常规启动不会把新 Manifest 写成已安装版本；未声明支持的来源版本可在市场显示为不可升级，不会在项目启动时被静默替换。显式升级目标必须高于当前版本。当前升级入口作用于当前项目的 Runtime 安装。

Native 作者必须让实现代码变化对应到新的 Manifest 版本或 Manifest 指纹；相同的版本和指纹表示同一发行物。不要把未声明兼容关系的新版代码依赖于启动时替换旧安装。发行物表现在只为 Runtime 管理的、不带 `bundled` 的 Native 插件恢复旧版；Coding 面板等内置插件启动时跟随当前构建，不靠它恢复。仍由 Host 构建期组合的其他插件没有安装记录，也不会获得这条版本化恢复能力。Native Plugin 与 Host 在同一进程运行，版本归档不构成 JavaScript 沙箱。

Plugin Builder 将每次发布保存为独立版本记录。发布新版只产生候选，不会启动新版本；作者需要明确选择直接兼容，或要求升级时校验数据。库页会显示 Runtime 实际安装版本和最新发布，用户选择「升级」后才调用同一套 Runtime 校验与回滚流程。Host 重启后按安装记录恢复对应的 Builder 发布版本；不要用 Builder 的最新发布覆盖尚未确认升级的版本。

## 统一动作与消费场景

动作可在 `action.result_view` 声明用户可读结果：固定 `summary`、指向原返回值的 `title_pointer` / `text_pointer`（JSON Pointer），以及 `link: { label, href_template }`。链接模板只允许站内路径，支持 `{project_id}` 和 `{/输出字段}` 标量替换，值由平台编码；不执行模板代码，也不修改输入输出合同。工作流保存当次摘要到原步骤历史，默认折叠技术详情；旧记录和未声明的动作仍可查看原结果。长正文显示有界节选并明确提示，不能把摘要当完整业务返回值。提供方负责目标页的通用对象深链处理，不在 Host 或工作流按插件 ID 添加分支。示例见 [Plugin SDK README](../../packages/plugin-sdk/README.md)。

新能力使用 `actions` 与 `action_scenes`，由 Kernel/Plugin Runtime 注册执行。SDK `defineAction` 提供定义与 handler 配对；场景必须兑现 `bindings`、`bind`、`consume`。用 `event_schema`/`prepare` 分离触发事件、函数输入和私有对象快照；可选 `failed` 负责明确的失败消费，同样接受绑定、权限、生命周期和对象检查。`required_scene` 让 Host 依据实际绑定计算触发入口状态。

Host 的动作客户端和场景客户端共享项目运行时与执行队列。兼容场景通过输入输出及语义合同发现，使用位置从原业务配置读取；新增插件不改中央能力或场景 ID 名单。插件有业务权限不代表外部 MCP 客户端有同样权限。细节与示例见 [SDK](../../packages/plugin-sdk/README.md#动作与判断消费场景)、[Inbox 场景](../../plugins/native/inbox/src/scenes.ts)、[实际自动触发验证](../../tests/inbox-automatic-scenes.test.ts)。

系统规则编辑器通过场景 owner 的 `targets` / `bind` 自动显示真实配置位置。场景声明 `configuration_permissions`，配置保存携带准确提供方和原 revision；原 owner 原子拒绝过期修改。目录查询不创建规则，停用保留原引用。具体接口和权限边界见 SDK。

无需再手写一份 MCP 管理工具。Host 会从上述合同生成查看位置、启用、停用三项动作，沿用场景的版本、提供方和生命周期，进入现有能力目录及对外授权设置。只有消费场景、没有自定义动作的插件也适用。配置权限与运行权限独立；缺少模型或执行权限时，有配置权的用户仍能停用原绑定。外部客户端须获具体管理动作的授权，不能借其他动作的同名权限执行。

当前范围：Home、Inbox、Feed 的绑定与真实触发已进入共同场景；工作流交接保留原调用者并按交付键幂等。规则编辑器与 Agent 的可选能力都从动作目录派生；Manifest 不再有 `behaviors`、`function_scenes`、`judgment_subjects` 或 `mcp_exports`，对外只有按客户端授权的动作工具。

## 连续工作：对象上下文、版本前提与助理

同一件工作会在底栏助理、插件页面和用户手动操作之间交替进行。插件的对象、版本和删除状态由插件自己拥有；工作与对象的关系由助理写进 Context Ledger；运行与确认归 Agent Host。插件不另存“助理做过什么”，也不复制正文。完整约定、样例与验证见 [molis-plugin-dev · continuity.md](../../skills/molis-plugin-dev/continuity.md)，要点：

- 每种展示的对象提供 `defineSubjectContextAction("<plugin>.subject.read", "<kind>", …)`，返回当前正文、所有者版本 `revision`、关联 Goal、会话与 `open: { surface, id }`；不存在时抛 `<plugin>.not_found`。个人范围的对象传第五个参数 `"home"`。
- 修改类动作只声明一种 `subject_kinds`，用 `result_subject` 指出输出里的对象标识与新版本；修改已有对象接受 `expected_version`（或 `expected_revision`）。助理修改已有对象必须带读取时的版本，否则在确认前被拒。
- 插件根元素维护 `data-assistant-context`（当前对象、版本、未保存状态与草稿、起步建议）；这只是屏幕说明，发送时才成为材料，不写记录、不授权。
- 监听 `molis:assistant-effect` 并在没有未保存修改时重读；用户在页面上改变了助理可能展示的对象时发 `molis:assistant-surface-changed`。
- 页面缓存的设置在本页没有未保存改动时采用已保存值，避免把别处的修改写回。
- 要给助理发信息，发 `molis:assistant-message` 并写明用途：`background`（只作上下文）、`change`（对象变了）、`suggest`（由用户决定是否发送）、`delegate`（用户刚在页面上要求交给助理，只有真实用户操作才立即开始）、`reply`（把结果交回某项工作）。不要自称“用户已同意”。
- 可以撤回的修改声明 `undo`：`{ capability_id, version, input: { 字段: "输出路径" } }`，指向同一提供方的撤销命令，以及它的输入在本次输出里的位置；需要数组时写 `["路径"]`。这样的修改在用户明确要求时由助理直接执行、事后可撤销，用户也可以把它设成每次确认。删除、对外发送这类撤不回的修改不要声明。样例：灵光“记下灵光”用“丢弃灵光” `{ ids: ["spark.id"] }` 撤回。
- 用户可以在插件里设提醒（今天只有 Todo 的提醒时间在用）时，提供到期提醒查询：`defineDueRemindersAction("<插件>.reminders.window", [对象种类], "到期提醒", [读取权限])`（Home 范围、只读）。输入 `{ from, to }`，只返回 `from ≤ 到期时间 < to` 的提醒，每条带稳定的 `reminder_id`（改了时间就换新的）、`due_at`、`title`、`subject`、`project_id`（个人为 null）、`open`。插件不需要计时器：Host 每分钟来问一次，每条只提醒用户一次，并按用户的提醒规则处理。只返回用户自己要求的提醒，新条目、未读数、逾期清单都不算；用户已在插件里处理过的提醒不要返回。辅助函数 `assertDueReminderWindow`、`withinDueReminderWindow` 和类型随 `defineDueRemindersAction` 一起从插件 SDK 导出。
- 会启动后台任务的命令（研究、生成等）声明 `background_job`：`{ status: { capability_id, version }, id: "run.jobId", input: "id", state: "status", done: [...], failed: [...] }`——输出里任务标识的位置、同一提供方的状态查询、它接收标识的字段、状态的位置和结束状态。助理（或用户点的建议按钮）启动后，Host 经 Prologue 队列按状态查询跟进到结束，结束时提醒用户、按钮显示结果，并在下一轮告诉助理；不必自己推送。样例：炼金术士的“启动炼化”“启动研究”。
- 修改已有对象的动作，输入里用 `<种类>_id`（或 `subject_id`、`id`）写对象标识：助理的建议按钮据此在用户手动改过该对象后自动失效。
- 设置“助理”里的“插件接入诊断”会列出你的插件为助理提供了什么、缺什么（对象读取、结果关联、能力说明），按那里的提示补齐即可。
- Native 插件新增路由或动作要递增 Manifest `version`，否则已安装项目仍按旧清单运行。

Pages 与 Coding 是完整样例；需求与验收见 `specs/archive/system-assistant/spec.md` 第 10.4 节与 AC46—AC51。

## 系统搜索

插件的内容经共同动作目录进入系统搜索（`search.query`，工作台 ⌘K、助理、工作流与 MCP 共用），插件不写索引、不调用搜索服务：

- 可搜索的每种对象提供对象读取器（`defineSubjectContextAction`，不存在时抛 `<plugin>.not_found`）；
- 声明一个搜索来源 `defineSearchEntriesAction(id, [{ kind, title, surface }], title, permissions, scope?, audiences?)`，用 `bindSearchEntriesHandler` 返回当前全部条目：`subject`、`revision`（内容一变就变）、`title`、`summary`、`updated_at`、`content`（`context` 正文经读取器进索引，`summary` 只索引标题与摘要）、`open: { surface, id }`；
- 来源的受众不能比你原有的读取更宽：原来只给本机界面看的内容（例如剪贴板历史）单独声明一个来源，受众限为 `["user"]`，助理、工作流与 MCP 客户端就搜不到它。

系统负责首次建立、按集合版本与条目版本增量更新、删除清理、失败保留与重试、停用/卸载清理、按调用者授权过滤和打开前核对。清单里声明的来源经 `inspectActionDeclarations` 校验规范合同。细则与判例见 [搜索接入](../../skills/molis-plugin-dev/search.md)，需求见 `specs/archive/system-search/spec.md`。

## 放在哪里：位置、关联与完成提示

对象存在个人空间还是某个项目、和哪项工作有关、谁能读取、做完后从哪里找回，由系统放置服务统一说明。插件要做的是：为展示的对象提供 `*.subject.read`（带 `open`）；能移动、复制的对象声明放置协议（`defineObjectMoveAction` / `defineObjectCopyAction`，只对本人）；能接收内容的做成工作流内容站；页面写 `data-assistant-context` 并留 `data-placement-slot`；新建、导入、导出、存固定版本后发 `molis:placement-result`。不要在插件里自己记“用于哪个项目”“复制自哪里”，也不要把内部动作写成交付。细则见 [放在哪里](../../skills/molis-plugin-dev/placement.md)，需求见 `specs/archive/work-placement/spec.md`。

## 调用模型：登记的指令

插件发给模型的要求（指令 Prompt）和 Agent 的角色 Prompt 一样，由 Host 统一登记，用户在设置“Prompt 与 Character”里能看到、修改、恢复默认，也能看到最近一次用的是默认版还是自己的版本。

- 在插件的 `src/prompts.ts` 用 `defineInstructionPrompt`（`@molis-ai/molis-work-contracts/platform/model-prompts`）声明，写明 `title`、`purpose`、`used_by`，从包入口导出 `<插件>_INSTRUCTIONS`。
- 调用时传 `instructed(指令, 数据)`：指令只写要求，用户材料、本次参数放在数据里（数据不会被当成指令）。模型端口类型写 `InstructedPrompt` 或 `ModelPromptInput`，不收裸字符串。
- Host 适配器经 `resolveModelPrompt` 取有效正文；内置插件在 `builtin-instructions.ts` 登记。改指令正文要升 `version`，用户已改过的会显示“默认已更新”，不会被静默覆盖。
- 门禁 `tests/prompt-registration.test.ts`：没登记的指令、收裸字符串的端口、绕开登记直接调模型的 Host 模块都会失败；确需过渡的写进清单并写明原因。
- 插件创作台生成的插件同样如此：要求在操作代码里 `export const prompts = [{ id, title, purpose, body }]` 声明，`model.generate` 传 `{ prompt: id, input }`；安装时登记、卸载时撤下（用户的修改保留）。检查 G4 会拒绝未声明的 id 和仍传 `instructions` 的调用。
- 设置“Prompt 与 Character”底部的“开发者诊断”列出每个来源登记了什么、哪些没有生效及原因，以及仍未登记的模型调用。

## 给其他 Agent 的方法（`methods`）

插件可以把本领域的做事方法（Skill）提供给助理和 Character 在业务工作里使用，例如 Pages 的“会议纪要整理”。

- 在 Manifest 的 `methods` 声明：`skill_id`、`version`、`name`、`summary`（何时适用），以及 `tools`。`tools` 只能是业务工具，即 `METHOD_TOOLS`：能力网关（find/read/change-capability、suggest-action），加上 ask-user、update-todo 等不碰目录的工具。校验不通过，Manifest 就无效。
- 正文放在包里（例如 `src/methods.ts` 导出 `AgentSkillDefinition[]`），标识、版本与 Manifest 一致；内置插件在目录条目里带上 `methods`。Host 启动时把方法登记进 Agent 定义，只按标识与版本给出正文；声明了但没有正文的方法不登记，开发者诊断里会说明。
- 与 `agent.skills` 的区别：`agent.skills` 是插件自己的 Agent 用的方法；`methods` 给别的 Agent 用。
- 助理会在“可用的方法”里看到它（只列名称和适用说明），合适时读取正文照做；用户也可以用“/”直接选定。方法只对采用它的那一轮有效。插件停用后，方法就不再列出。
- 正文写步骤和边界，不要写死对象标识；需要改数据的步骤照常经 change-capability，由用户确认。

## 对外 MCP

Molis Work 对外只有一个 MCP 进程：`molis-work-mcp`。插件的 MCP 能力就是它在 Manifest 里声明的 `actions`：每个动作在共同目录里登记一次，对外就是动作工具 `molis_work_v1_action_<动作>__v<版本>`，由用户在「能力 → 对外接入」按客户端与范围逐项授权。插件不另外登记 MCP 工具、不开自己的 MCP 端口，也不新开 MCP 包；没有按名称的开关。

`agent.mcp` 是反过来的：插件里的 Agent 能不能去调外面的 MCP。不要拿它当对外贡献开关。

### 作者要做的

1. 把要对外的能力写成动作（见上文 SDK 的动作合同）：输入只含业务字段，`project_id`、数据库路径、Web 地址和操作者身份都由 Host 从调用上下文注入。
2. 个人、不绑项目也能用的动作用 `scope: "home"`；项目能力用 `scope: "project"`。
3. 动作声明里的 `audiences` 决定谁能发现它；包含 `mcp` 才会出现在 MCP 授权列表里。声明和可发现都不等于已授权。

### 不要做的

- 新开 MCP 进程、MCP 包，或在 `apps/mcp` 的工具目录里写死插件工具。
- 在 `LocalMcpServer.callTool` 里按名称写 `if`。
- 复用 `agent.mcp`。

Host 侧改哪里、调用链怎么走，见 [CLI 与开发 · 对外 MCP](../cli-and-development.md#对外-mcp)。协议与 Runtime Skill 仍以 [MCP 接入](../mcp.md) 为准。

## 事件去向的动作名单

Runtime 插件的持久事件总线与这里的判断场景不同。订阅声明和权限属于安装实例；处理器使用 `delivery.signal/beforeEffect()`，等待后写入前复查，不保存发布者的临时调用上下文。游标绑定安装世代，旧发布 client 停止后失效；重装不重放旧工作，处理中断的未知结果隔离而不自动重试。事件处理与外部副作用不能凭游标宣称 exactly-once。具体协议见 [插件平台](PLUGIN-PLATFORM.md) 与 [事件 Skill](../../skills/molis-plugin-dev/elements.md#插件事件总线不是判断场景)。

Functions「用在哪」里，首页 / Inbox / Feed 是事件去向：判断本身不改数据，也不在现场长出新按钮。默认建议人点击已有处置。Feed 来源规则另有用户显式配置的 `admission: "inbox"`：Feed 用例消费判断后加入 Inbox（失败或不确定进入待复核），不改变 Functions 的只判断职责，也不授权其他自动动作。旧规则默认 `suggest`。Agent 去向才放「能调、但不长在这张卡片上」的动作（含 MCP 写工具）。

Inbox → Pages 通过 Host 组合各插件公开能力，输入快照与幂等收据归 Pages，Attention 仍归 Inbox 对应 Module。Workbench 助手复用这些 HTTP 动作；未新增对外 MCP 或 Native 事件总线。标签对象恢复与调用约定见 [Host 接线](../../skills/molis-plugin-dev/host.md#信息整理的-host-组合)。

**判断可推荐的动作，必须是该对象上真实可执行的处置。** 推荐不是执行授权；用户执行建议时仍要准备实际参数并核对当前对象和权限。

首页从插件的 subject offers 声明派生推荐选项。动作身份包含原查询、版本、提供方及 offer_id，插件返回真实事项对应的输入；不能用同名字符串把两个插件的处置混为一谈。未声明为规则选项的按钮仍可手动操作，不因此自动进入判断结果。

新增判断消费者应声明 `action_scenes`，说明触发时机、实际输入、接受的结果和消费效果，并兑现原数据的读取与写入。系统从合同检查兼容性；不能靠 Host 白名单获得一个看似可用的用途。仅有场景名称、没有业务触发和消费，不能宣称接入完成。

例如 Feed 捕捉读取原消息，只有规则明确配置自动入箱时才消费相应结果；Home 返回推荐，执行仍由原 offers 处理器完成。导航、来源设置和账号管理是否出现在某个场景，应由实际对象和消费合同决定，不把插件所有能力都加入一个统一选项池。

接入步骤与当前迁移边界见 [SDK](../../packages/plugin-sdk/README.md#动作与判断消费场景)、[Host 接线](../../skills/molis-plugin-dev/host.md#接到统一判断场景)及[迁移清单](../../specs/action-architecture/migration.md)。旧 Agent 行为目录尚待清理，新增消费者不再扩充旧池。

## 打包与签名

`molis-work plugin pack <source> <bundle.json>` 只包含 package.json 的显式 files 以及 package.json/manifest.json，拒绝目录跳转和符号链接；不执行安装脚本、不自动收集依赖。样例运行依赖同版本的公开 SDK 分发包，bundle 本身不是独立安装器。JSON bundle 上限 64 MiB，输出文件不覆盖已有文件。

对真正要签名的包，先用 `molis-work plugin identity <public.pem>` 取得 Ed25519 公钥绑定身份，作为 create 的 binding-signature；再 pack。`sign <bundle.json> <private.pem> <signed.json>` 必须显式指定私钥文件，身份须与 Manifest 一致。`verify <signed.json> <trusted-public.pem>` 使用调用者信任的公钥校验全部包内文件与 Manifest；没有签名、内容被改、发布者不符都会失败。也可用 Runtime 的 `PluginPackageSigner` 对接发布环境，避免把密钥暴露给应用。

签名只证明内容和发布者身份，不代表官方审核；验证 bundle 不授权执行另一份源码目录。示例中的 local-development-binding 不具备密码学签名含义。本轮测试只使用新生成的临时密钥，没有接触用户密钥或发布 registry。

用户把这样的包装进自己的 Home 目前没有路径：没有 `install` 命令，没有保存「信任哪个发布者」的地方，包也不会在沙箱里运行。方案（安装命令、签名信任、沙箱边界、市场入口）见 [第三方插件：安装方案](../system/THIRD-PARTY-PLUGINS.md)，尚未实现。

## 可复现验证

构建后运行 `node --import tsx --test tests/plugin-sample.e2e.test.ts tests/plugin-package.test.ts`。前者从干净目录实际调用 CLI、安装本地 SDK tarball、运行两个独立进程并核对结果/历史版本/权限/目录边界；后者验证签名与篡改拒绝。其他 Host/Runtime 定向测试覆盖崩溃恢复、卸载失败撤权和不同签名数据隔离。整体前后端用户 E2E 仍在所有重组开发完成后单独执行。

## 异步动作与原调用授权

等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后调用 dispatcher 提供的 `caller.beforeEffect()`，再按原对象或配置版本提交。发起嵌套动作/场景时用 `retainActionAuthority(caller, originReference, caller.beforeEffect)` 保留外层执行检查；仅复查权限字符串不能识别同名提供方已被替换。来源同步另持有按数据库、项目和来源隔离的活动租约。失去授权时保留此前的未确认记录用于恢复，不补写失败记录或伪造成功。

提供方在 `action.execution` 声明执行事实：`timeout_ms` 是处理器开始执行后的等待上限，`cost` 为 `none` / `metered` / `unknown`，`max_calls_per_minute` 是同一 actor、项目、安装实例滚动一分钟内的接受次数。未声明费用保持 unknown；未声明时限/频率不自动加限。Kernel 对声明的时限与频率统一执行，切换用户、Agent、Workflow、MCP 或插件入口不能重置同一身份的预算。限额是当前注册实例的本机保护，不是跨进程计费账本；重启或重新注册会重置计数。

例如调用收费文字模型的能力声明 `execution: { timeout_ms: 120000, cost: "metered", max_calls_per_minute: 20 }`。声明不代替 `scheduling: "concurrent"`、权限或模型服务自己的预算。超时停止本机等待并中止传给处理器的 signal，外部副作用可能已经发生，不自动重试；每次异步等待后仍须调用 `beforeEffect()` 才能提交。同步阻塞代码无法靠 JavaScript 定时器抢占。Agent 可以使用更严格的入口时限；生成插件的 sandbox 依据共同目录选择时限和慢操作通道，费用未知不能显示成免费。老生成物只转换历史输入输出，模型和提醒执行仍走当前 ActionService。

记录要算在某个 Runtime 会话名下的写入动作声明 `authorship: "session"`（Goals 的写入都是）：经 MCP 调用时宿主要求客户端给出稳定会话，否则拒绝，并把 `runtime:<客户端>:<会话>` 作为审计作者传进 `caller.audit_actor_id`。没有声明的动作，客户端有会话时同样带上，没有也照常执行。

生成式公开动作的费用是可能收费的声明，不是实际用量或预算。其沙箱 operation 时限从排队头开始，lane 频率按安装计数；公共 Action 时限从处理器开始、频率按调用者与安装计数。两者含义不同，不能直接复制沙箱限额到公共动作。实际依赖仍逐次受提供方的授权、时限和频率约束。

## 单次 AI 能力与 Host 取消

Coding 草稿、Cognia 知识生成等工具为空的调用使用 Home 共享推理入口；插件拥有提示词和领域校验，Host 拥有模型/凭据绑定。需要结构结果、执行引用、进度或 typed usage 时使用 `hostTextGeneration`，标准接线见 [Prologue AI 手册](PROLOGUE-AI.md) 与 [开发 Skill](../../skills/molis-prologue-ai/SKILL.md)。

Host Capability 可选调用参数 `signal` 由 Plugin SDK 传递给 Host invocation；取消只收紧本次操作，不授予任何身份/权限。`before_effect` 与原调用持续授权检查仍保留，不能用成功收到模型文字代替提交前检查。

Artifact 输入通知刷新当前投影，不是一次性业务命令。`onUpstreamReady(inputs, context)` 接到完整固定版本；异步读取后、更新投影前调用 `context.beforeEffect()`，并把 `context.signal` 传给可取消操作。Host 从领域已提交 journal 发现失效/归档并重新计算已有输入图；不可用版本不再投递，旧实例和旧输入的晚结果拒绝提交。新实例重新读取当前输入，不能把重启通知当成再次执行外部操作的授权。

Coding `run-updated` 与 Git `operation-updated` 是 v1 刷新提示：前者来自后台 Run 的停止/待核对状态，后者来自 Prologue 已核对的 Effect/dispatch 回执。失败和 unknown 保留原语义，不宣称文件修改成功。恢复历史不产生新执行通知；Files/Git 订阅后只让 Host 视图 revision 失效，页面重新读取原接口。提示丢失靠首次进入、重新连接时读当前事实恢复，不能据此自动重跑模型或 Git；可靠业务提交仍须其 owner 的事务/持久协议。

公共材料提取遵守 `contracts/services/materials`：Host 负责 UTF-8/HTML、PDF worker、原生 OCR 与音视频进程；插件持有原件身份和业务引用。检查覆盖信息与容量截断，传递取消，在等待后复查执行权限。Jelly 和 onboarding 已共用提取口，媒体模型下载仍需显式选择；生成摘要继续走 Prologue。

Shelf 的 PDF 预览与文字提取、OCR 同样走此端口。语言选项属于提取请求，逐行置信度来自 `pages[].lines`，不以页平均值代替；“待确认”、来源标题和不完整提示由业务组织。多选逐项处理。标准输入仍限 25 MiB，Shelf 由可信 Host 明确采用 32 MiB，不改变其他上传端限额。原调用撤权、取消或输入 hash 改变后不写成果或失败成果。

显式网页读取用同一合同的 `MaterialWebsiteReader`：Host 限制 HTTP(S)、跳转、总时限与解压后字节数，复用 HTML 提取；传递 signal / beforeDispatch，业务提交前仍需 beforeEffect 和来源版本检查。Shelf 只组织网页材料、链接与失败提示，Artifacts 只组织导入文档，不得互相导入解析实现。普通抓取失败可以按产品约定保留链接，取消或撤权不能退化成“成功保存链接”。

HTML 与 PDF/文档解析复用 Host 的可终止 worker 生命周期；不能只给网络阶段设定时器，却让畸形 HTML 在主线程无限解析。Artifacts 的异步 readHtml 保留原 HTML 与既有正文限额，解析后复核 beforeSave 和 signal；不要套用网页的部分正文策略。

Pages 的 prepareImport 是 Host 注入端口：公共 MaterialDocumentReader 负责 UTF 编码、ZIP/DOCX 和容量限制，插件的 preparePagesImport 只将公共正文转换为编辑器文档。预览和提交共用装配，解析等待后复核权限与取消，再沿原事务提交；批次损坏不能导致部分写入。

Builder 的截图评审把 presentation、design、host、unverified 问题分开：只有截图/目标有效、呈现属性受支持的意见进入有限自动修订，其余显示为未自动修改。合同示例的本地空存储规则同时检查 output 与 includes/outputIncludes/expect，矛盾在设计阶段返回，不交给代码 Agent 制造假记录。

工作台客户端首次打开时从原注册目录加载，UI 依赖由其 `clientAssets` 声明。Host 先保留原 surface 根、准备依赖，再调用 client factory；同一页面已打开的实例继续留存，隐藏只暂停其 UI 读取。客户端所需能力从注入的 Host 取，不依赖组合脚本的私有变量。设置与公共层叠沿现有 shell 提供。资源失败按钮只重载 UI，不能作为重新发出模型或副作用请求的依据。

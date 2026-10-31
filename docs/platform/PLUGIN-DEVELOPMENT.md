# 本地 Plugin 开发

写一个插件时，先按 [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md) 走完整路径：对象与时刻 → Manifest → UI/客户端 → HTTP → 现场动作 → 判断场景 → MCP → Artifact / 事件 / ports → 按 kind 接到 Host 或 CLI。本文件是命令、MCP 登记、动作录取和打包的手册，不替代那份顺序。Host 装配见 Skill 的 `host.md`，SDK/CLI 见 `authoring.md`，接入见 `integrations.md`。

新的内置插件按仓库 `AGENTS.md` 只走 Plugin Runtime：项目级的在插件自己 `src/registration.ts` 的 `registration` 上声明 `project_runtime: { create, package_name, factory_export }`，由每个项目的监督器按登记装配（`apps/local-host/src/project-plugins.ts` 不为新插件改），Home 级的（个人数据跨项目一致、没有项目也能用）Manifest 写 `runtime: { scope: "home" }`、在同一份 `registration` 上给出 `runtime: { create, package_name, factory_export, … }`，由宿主的 Home 监督器装配（写法见 `skills/molis-plugin-dev/host.md`）；不再手接 `ui-composition.ts` → `renderer.ts` → `shell-page-renderer.ts`，也不再新增构建期（旧路径）条目或 `<插件>-native-plugin-http.ts`。Runtime 装配仍有两处接线：一是目录里要有它的条目：写在插件包的 `src/registration.ts`（导出 `registration: PluginRegistration`，Manifest、`summary`、`workbench` 次序与客户端资源都在里面；`package.json` 声明 `exports["./registration"]` 与 `"molis-work": { "registration": "./registration" }`），运行 `node scripts/generate-plugin-registry.mjs` 生成 `apps/workbench/src/builtin-plugins.ts`（不手改，`pnpm health:check` 跑它的 `--check`），它在登记表里的那一条是自己 `package.json` 的 `molis-work` 块，两个应用与根 `package.json` 里对它的依赖也由生成器写，再跑 `pnpm install`（PG-069，包外不手改一个文件）（`tests/builtin-plugin-assembly-gate.test.ts` 从生成的登记读 Runtime 装配的 id，不用改）；二是主区由 Host 经 `plugin_stages` 渲染（`plugin_panels` 这条接缝存在，但现在没有生产代码填它）——Coding 以及 Files、Git、Diff、Text Stats 的舞台在 `apps/local-host/src/coding-surface.ts` 渲染，`web-goals-read.ts` 把它们填进页面视图，运行时安装的插件的舞台与插件栏条目来自 `installedPluginStages`。

平台合同变了（Manifest 字段、actions / action_scenes、MCP、事件、Slot、plugin-stage、kind 语义），同一任务内更新该 Skill 与本页，不要只改代码。

内置插件的共同目录是 `apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG`，由 `node scripts/generate-plugin-registry.mjs` 从各包的 `src/registration.ts` 生成，不手改；同一批登记另生成宿主那份 `apps/local-host/src/plugin-registry.generated.ts`，平台事实（启动名单、个人插件、连带、项目显示哪些插件）只在 `apps/local-host/src/plugin-registry.ts` 由它派生，工作台读宿主写在页面上的 `shown_plugins` 与目录标记，不另算（W5-02 B1）。宿主加载时自检（`plugin-registry.ts` 的 `catalogProblems`）：重复的 id 与位置、悬空的 `companions` / `clientUses` 都让它起不来。每个条目绑定包导出的 Manifest、目录信息、Agent 正文及可选 `workbench` 资源。其中仍走构建期装配的旧路径插件，名单冻结为 `tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED`、只许减少；Runtime 装配的插件在同一目录里也有条目，目录会随之增长。目录、Workbench UI 注册/样式/客户端从同一份 `registration` 派生；`workbench.order` 只控制原静态资源顺序，不覆盖导航声明。能力直接注册公共 actions。业务实现、真实 I/O 端口装配与权限仍由原 owner 负责，声明和可发现都不等于已授权。

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

## 成果类型声明

写进成果库的类型要在 Manifest 的 `artifacts.produces` 声明，并满足下面几条（`specs/archive/artifact-positioning` A1、A4b、A7；`AGENTS.md`「成果库只收人要留存、引用的固定版本」）。规则在 `packages/plugin-sdk/src/artifact-declarations.ts`，由 `parsePluginManifest` 在解析时检查，所以 `definePlugin`、命令行 `validate` 与 `create`、Runtime 的安装与升级、本地开发加载走的是同一份；不满足时一次报出全部问题（`plugin.declaration_invalid`，Runtime 安装包成 `plugin.manifest_invalid`）。以前只有内置插件被一个测试（`tests/artifact-type-gate.test.ts`）守着，别的 Manifest 可以产出没人读得了的一版。

- **显示名**：每个产出类型有非空的 `title`，成果库用它给人看。
- **预览**：每个产出类型有 `preview`，指向本 Manifest 里用 `defineArtifactPreviewAction` 定义的预览查询，并用 `bindArtifactPreview` 绑定处理器（Runtime 要求 Manifest 声明的动作都有处理器）。
- **固定与比较**：对象可以当场固定成新一版的类型写 `pin`，指向 `defineArtifactPinAction` 定义的命令，且只对一种对象（`subject_kinds` 恰好一个）；写了 `pin` 就必须同时写 `compare`（`defineArtifactCompareAction` 的查询），成果库才能告诉人「原文已改」。
- **继续**：能从一版新建自己的工作对象的插件写 `continue`（`defineArtifactContinueAction` 的命令）；产出的类型和只读的类型（`artifacts.consumes`）上都可以写。
- **都在本插件里**：这些引用只认本 Manifest 的 `actions`，同时核对种类与 `operation`（预览、比较是查询，固定、继续是命令）；指向别的插件的动作、不存在的动作、种类不对的动作都被拒绝。
- **v1 不能产出成果类型**：v1 Manifest 不能声明动作，也就没有预览，所以要进成果库就用 `schema_version: 2`。只在插件之间交换数据、不需要人留存的，声明成 `process_items`（过程项），不进成果库，也就不要名称和预览。

跨插件的规则（一种类型一个 owner、一种对象至多一个固定者、哪些类型可以没有「继续」）仍只对内置插件，由 `tests/artifact-type-gate.test.ts` 守。2026-10-18 改：插件不分官方与第三方、待遇一样，这条「只对内置」的做法要在防腐线里改成对所有插件一致，见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-18 各行；改完之前仍按此。校验的测试在 `tests/action-artifact-references.test.ts`。

## 作者 API 与公共测试入口

作者从 `@molis-ai/molis-work-plugin-sdk` 导入 `definePlugin` / `definePollingIntegrationPlugin` 及公开类型，在 `start(context)` 中使用 `context.services`：

- `storage`：字符串 get/set/delete，仅自身安装数据，须声明并授予 storage:private。支持的 Host 还提供可选 `compareAndSet(key, expected, value)`，原子地按旧值更新；null 表示仅在 key 不存在时创建。冲突返回 false 且不写入。需要此能力的插件须检查方法是否存在，不能用 get/set 模拟；它不是跨 key 事务或团队同步。
- `artifacts`：同步 publish 个人内容、按 id + version read；Host 按安装实例自动注册到共同动作 Kernel，绑定项目、用户、生产者并检查实时 grant。通过 Artifact type/schema 互通，不要求指定哪个插件生产；这类私有 SDK 动作不导出成普通 MCP 工具。
- `ui`：注册 Manifest 声明的自身 contribution，由 UI Host 检查挂载格式，停止后撤销。`invalidate()` 让自己已打开的页面重新读取（页面用 `scope.watchRevision` 看着），只要 Manifest 声明了 `ui.views`，不要权限；停用以后再调被拒（PG-061，见 [UI-PLATFORM](UI-PLATFORM.md#原生客户端生命周期)）。

这些是公开 Contract，不向作者开放 Store、SQL 或其他模块内部路径。缺权限、停用的旧上下文和未声明的类型/界面贡献都会被实际 owner 拒绝。本样例不请求网络、不自动 Team 分享；分享仍是用户明确选择的业务操作。

嵌入式测试使用 `@molis-ai/molis-work-app-local-host` 的公共 `runPluginDevelopment(input, options)`：输入是已授权的源码目录、项目、grants（`PluginDevelopmentInput` 没有操作者字段）；options 注入操作者 `actor_id`（嵌入的调用方自己传：这个函数既不固定它，也不读 `input` 里的身份）、真实 Artifact owner、UiHost、Plugin Runtime repository、私有存储工厂，以及 `actions: { registry, client, project_id }`。registry/client 必须来自同一 Host：分别使用 `host.actionRegistry(reference)` 和 `host.syncActionClient(reference)`；项目已打开后才可同步调用。独立测试可显式共享一个 ActionService，不在生产创建临时注册表兜底。它与应用命令使用同一安装/运行/卸载实现，返回 `PluginDevelopmentResult`，不要求导入仓库测试文件。数据库装配属于应用 Host，不属于 SDK 或 CLI。CLI 的 `PluginCliHost.runDevelopment` 是具名的注入接口，不是任意方法总线。命令行的开发入口（`runLocalPluginDevelopment`）复用 Host 函数 `developInPrivateHost`，在本次私有 Host 打开的 reference 中运行。操作者固定为 `local-plugin-developer`，输入中的 `actor_id`、`actor_kind` 或 `audit_actor_id` 在加载代码前拒绝；项目必须匹配 reference。旧开发 typed ID 已删除，插件的 consumes 声明、身份参数或复制的描述符均不能恢复入口。开发状态仍必须带当前 marker，普通非空目录拒绝，只有本次创建的 Host 由本次调用关闭。

## 项目后台调度与投递

项目 Runtime 插件可按 Manifest 权限使用以下公共服务；不存在 Schedule 专用装配口。身份和项目来自当前激活，插件不能指定安装、actor 或数据库连接。所有服务都随停用、撤权、取消与原调用结束失效，查询动作不能转为写入。

| 服务 | 声明与输入 | 行为 |
| --- | --- | --- |
| `services.scheduler` | `schedule:read` / `schedule:write`；`background.wakeups` 声明本插件的动作引用与理由 | 只读写自己所属的闹钟；`join(transaction, writer)` 加入当前项目库事务。唤醒经公开动作网关，动作须向 plugin 开放。旧安装绑定只能明确恢复，不能自动接管。 |
| `services.installations` | `plugins:read` | 只返回当前项目的安装 id、世代、版本、名字、发布者和状态；不返回授权、签名或路径。`list()` 排除已卸载记录，`get(id)` 保留其最小状态，供业务主人收尾。 |
| `services.projects` | `projects:exist`（没声明，服务不存在；声明了没拿到授权，调用被拒） | `exist(ids)` 只回答你传进来的项目 id 现在还在不在：`{id: boolean}`，每个传入的 id 一条（重复的算一条），不列项目、不返回名字或状态，也不返回你没问的 id。一次至多 200 个、每个至多 200 个字符。宿主读不到项目目录时报错，不会说成「已删除」；授权被撤回后调用被拒（`actions.forbidden`），实例停用后调用没有回答。Home 实例和项目实例都能用；沙箱用 `sdk.projects.exist(ids)`，操作声明 `effects.projects: ["exist"]`。应用包清单只从已校验合同派生这一项可选权限，仍逐项比对完整清单形状，不接受任意新增权限；效果批准与 Runtime 当前 grant 同时满足才回答。用途：你自己存了项目 id 做出处，要知道出处还在不在（Shelf 据此在副本上标「项目已删除」，BL-680，S-96）。 |
| `services.agents.run` | `agent:run` 与已声明的 role；任务、标题、可选工作区 id、时限 | 复用本 Home 的 Prologue，等待一轮完成并返回正文与运行引用。等待人工交互、超时或失去权限时取消本次运行。须在对应 concurrent command 或保留 job 内使用。 |
| `services.notifications` | `notifications:write`；通知键、标题、摘要、正文与可选目标插件 id | `deliver(transaction, input)` 把通知作为平台自己的队列行与业务记录同笔提交；提交后由平台交给项目里 Manifest 声明了 `notifications.receive` 的插件（现在是 Feed，收进「插件发送的通知」来源并按规则判断，D6-2），没有这样的插件时通知留在队列里、有了再交。提交后在原调用中等待 `receipt.settle()`（等的是这次交付）；重复键是同一条通知（回执的 `notification_id` 相同、`created` 为 false），回滚的回执不能触发交付。插件想**接收**通知：Manifest 写 `notifications: { receive: { capability_id, version } }`，指向自己的一个只给 `workflow` 受众的 command，动作里认调用者是 `PLUGIN_NOTIFICATION_DELIVERY_ACTOR`，别的调用一律拒绝。 |
| `services.scenes` | `scenes:use`；Manifest 要有自己的 `action_scenes` | 自己声明的消费场景：`usages`、`discoverScenes`、`targets`、`bind`、`runScene`，方法名同内核的场景客户端，只是不传调用者。只在本插件正在执行的动作里用，调用者是这个动作的原调用者；别人的场景、没声明的场景或版本以 `plugin.scene_not_declared` 拒绝。`bind`、`runScene` 不能出自查询动作，`runScene` 要等判断结果，只能出自 `scheduling: "concurrent"` 的动作。内核对函数与场景兼容、受众、权限的检查一条不放宽。 |
| `services.judgments` | `judgments:read` / `judgments:write`；Manifest 要有自己的 `action_scenes` | 自己声明的消费场景的判断账（Home 的 Functions 库）。`latest(sceneId)` 返回当前项目里**本安装自己记的**、每个对象最新的一条（任何调用里可读；别的插件声明同一场景号也读不到，行随本安装的数据走，卸载不保留数据或丢弃保留的数据时删掉）；`record(input)` 记一条判断，函数键由平台从 `input.function` 推出，对象必须属于当前项目、种类在场景的 `subject_kinds` 里，别人的场景以 `plugin.scene_not_declared` 拒绝。写的条件与 `services.attention` 一致：声明了 `judgments:write` 的并行动作，或自己场景的可写回调（场景的 `permissions` 声明了它，回调先等过 `caller.beforeEffect()`）；取消、撤权、停用之后不写。**判断账不在插件的项目事务里**：`record` 自己提交，先记判断、再写项目库，项目库失败时那一行仍在。采用判断前核对 `scene_provenance` 只挡得住对象已不在、内容变了的行；对象仍在、内容没变时，回滚之后这一行照样被采用，所以不要把 `latest()` 当作自己的行已经落下的证据，以自己的项目库为准。 |
| `services.attention` | `attention:read` / `attention:write`；写还要在 Manifest 的 `attention.subjects` 里声明自己的对象种类（`feed_item`、`goal_decision`、`source_fault`） | 项目的 Inbox 条目。`attention.inbox`（`subjects` 的子集）声明哪些种类的条目也是人的 Inbox，平台按声明让它们出现在 Inbox 里（只对声明者自己的条目，不声明就只经本服务读）。读 `list/get/findActiveForSubject/findForSubject/events`；写 `join(transaction, writer)` 加入当前项目库事务，`create`、`deleteSubject` 只能用声明过的种类，`setStatus` 任何持有 `attention:write` 的插件可用。写的动作自己的 `permissions` 要声明 `attention:write`；场景回调（`bind`、`consume`、`failed`）也可以写，条件是场景定义的 `permissions` 声明了 `attention:write`，并且回调里先等过它拿到的 `caller.beforeEffect()`（`bindings`、`prepare` 等只读回调不能写）；项目、行为人由调用给出。 |
| `services.contextLedger` | `context-ledger:read` / `context-ledger:write` | 项目的关联边。读 `get/list/history`；写 `join(transaction, writer)` 的 `put`、`remove`，范围永远是本项目，行为人是调用者。写的动作自己的 `permissions` 要声明 `context-ledger:write`。 |
| `services.actions.dependencies` | `actions:invoke` | `discover/check/invoke` 以本安装自己的 grants 和 plugin 受众访问当前项目的动态依赖；不能借用人的权限或 workflow 受众。固定提供方、版本和输入合同后再保存引用。 |

项目库事务句柄只在原回调中有效，不能伪造、跨库或跨安装复用；调度的写回调必须同步完成。业务写、闹钟和通知全部回滚时，不中断此前仍有效的执行；成功提交的暂停、替换和删除才取消旧执行。唤醒运行时占用原 lease，完成后才提交到期点；崩溃后由业务的 pending/running/unknown 状态决定恢复，不能把不确定的外部效果自动再做一遍。

Schedule 是这些服务的生产消费者，工厂见 `plugins/native/schedule/src/plugin.ts`。自己的动态功能可在动作声明中设置 `local_id`，供调度消费方在同一提供方下解析；实际调用仍固定完整 capability/version/provider。原 `schedule.register` typed 入口已移除，作者直接使用公共 scheduler 或 Schedule 的 `reminders.add/cancel`、`schedules.add/cancel` 动作。安装版沙箱的现有生成 API 仍通过能力桥消费公开动作；本节不是向生成 API 增加一套同步事务接口。

工程验证见 `tests/security-invariants-plugin-scheduler.test.ts`、`tests/security-invariants-plugin-agents.test.ts`、`tests/security-invariants-plugin-installations.test.ts`、`tests/security-invariants-plugin-projects.test.ts`、`tests/security-invariants-plugin-notifications.test.ts`、`tests/security-invariants-plugin-dependencies.test.ts`；真实驻留行为见 `tests/schedule-resident-runtime.test.ts`。

## 个人 Home Runtime 与插件 SQLite

数据属于个人 Home、切换项目不分开的新内置插件，Manifest 写 `runtime: { scope: "home" }`，在自己的 `registration` 里给出 `runtime: { create, package_name, factory_export, keys? }`（运行范围是 Manifest 的，Home 实例的代码来自登记，两者同时有；装上的插件写 `runtime` 安装时被拒，`plugin.home_scope_unavailable`；唯一的例外是来自已固定发布者的签名沙箱包，见下一段）。`personal: true` 只是可见性，不会把现存 Form、Todo 等迁到 Runtime。当前 Issues、Todo 和 Cognia 使用 Home Runtime，迁移顺序见 `docs/system/RUNTIME-MIGRATION.md`。

**装进 Home 的签名沙箱包**（BL-628，S-80、S-84）：沙箱包的清单写 `runtime: { scope: "home" }`，预览会返回 `runtime_scope: "home"`，确认后装进 Home：一个实例，所有项目共用，代码仍在沙箱里跑，权限仍是人在预览里批准的那些，发布者仍要被本人固定。它的批准、密钥和提示词登记放在 Home 里（不属于任何项目），它的调用没有项目（项目范围的动作够不到），库是 Home 库（S-91）、文件是主人文件（S-64）。它在每个项目里都能用，项目可以把它隐藏；停用、卸载（保留或不保留数据）走和项目里的签名包同一套生命周期。声明了 `always_on`、端口、事件、成果或过程项的包不能装进 Home；同一个 `plugin_id` 的范围不能更换。没有写 `runtime` 的包只能装进项目，写了的只能装进 Home。

一个本机 Local Host 持有一个 `HomePluginHost`，并发动作、场景和 HTTP 共用启动 Promise。安装、授予、发行物和私有 KV 在 `{home}/plugin-runtime/plugin-runtime.db` v2，复用 PluginRuntime、Supervisor 和 Action Registry；不同版本或不完整结构拒绝并保留，不补表、不清空。MCP 子进程经已有本机 gateway 调同一个 Host，不打开插件库。Home 与项目共用提供方规则：只有可信启动条目给 `trust: HOST_BUILD_TRUST` 的定义对象使用插件 ID，其余使用安装 ID；provider 定位和 `install_id` / `installation_generation` 授权不能相互替代。

Home 插件的数据按项目放时，Manifest 的 `databases.home` 写 `partition: "project"`（合同 `HomePluginDatabaseDeclaration`），库与分区由宿主从 Manifest 生成（`apps/local-host/src/home-stores.ts`），登记上不写库：每个项目一个库，在 `{home}/<库名>/projects/<项目>/`，宿主按调用所在的项目给出，不在项目里的调用答 `actions.project_required`；闲置关闭、停用关闭与删项目都归平台，删项目时整份删掉，确认框写「{插件名} 在这个项目里的数据」（PG-024）。见 [specs/plugin-project-partition](../../specs/plugin-project-partition/spec.md)。

Host 绑定 `context.actor_id` 为 Home 所有人；实际动作 caller 保留页面、助理、MCP 的入口和身份。业务输入不得接收 owner、actor、install、provider 或数据库路径。Home 实例不提供项目 `artifacts`、端口、事件或假项目：`services.artifacts` 现在可缺省，项目消费者须明确要求该服务。

Home 的 `services.storage` 复用安装隔离 KV 与原子 `compareAndSet`；升级校验只给 `get`，候选启动失败恢复原 KV。`services.model` 和指令登记使用项目执行器同一入口与限制；只在自己的 concurrent 动作中调用，停用、取消、撤权或动作结束后的结果不交付。数据库、模型、动作和 KV 句柄随实例与安装世代失效，停止钩子开始时也不能继续写。普通关闭保留启用意图，用户停用跨重启保留，重装不继承旧授权。

Home 动作/场景可以声明 Home 或项目 scope。项目作用域必须经真实项目的动作/场景客户端；缺项目拒绝。`/api/plugins/<id>/…` 与真实 `/projects/<id>` 前缀后的同一路由访问同一个 Home 实例：不带前缀时调用不在任何项目里；带前缀时宿主先核对项目存在、并且显示这个插件，再把项目放进它自己发出的调用控制，插件的动作在 `caller.project_id` 里看到它，每次写之前再核对一次，请求结束后这份控制作废（`docs/system/SECURITY-INVARIANTS.md` S-31）。项目不能从 body/query 或插件自己造的控制里来。API 归实际 Runtime 注册，目录只供现有页面；共用 `plugin-route-operations.ts` 的重启/解除隔离/升级/视图版本与分发，保留当前网页授权、断开取消、`beforeEffect`、client_reported 页面上下文；读体上限是路由声明的 `max_body_bytes`，没声明时 12 MiB。项目 Files/wiring/Coding 钩子仍只属于项目。

Home 库初始化失败由它自身的页面/API 明确报告，Goals 页面与其他项目动作仍可用；普通 ready 保持失败，不自动重试。受保护的 POST retry 才重试，并发 retry 共用一次启动；清理失败或关闭不能再开第二实例。`pluginFixtures.home` 与 `.project` 沿用 definition 或 `{ definition, database?, files? }` 夹具形状，不是 bundled、不接受沙箱或内置同名伪造，实际两份启动名单不能重复插件身份。

插件需要自己的文件（二进制、目录树）时，在 Manifest 里声明 `owner_files`（见下一节「Home 主人的私有文件树」），得到 `context.services.ownerFiles`；旧的启动条目 `files` 与 `context.services.files` 已删（PG-102/104，P2b）。单文件字节上限、文件名规则由插件自己管（Images 的上限在它的 provider 里）。


Manifest 的 `databases.home`（`PluginDatabaseDeclaration`，PG-022；项目库见 `databases.project`）描述库名、当前基线和读写权限，插件拥有 schema 与 SQL；Host 选择路径、打开连接并提供 `context.services.database`。当前只给宿主启动名单上的 Native 插件（库要登记在 Home 的存储登记里；名单之外的插件还没有 Home 库，声明了就拒绝启动）；它是安装生命周期服务，不是 JavaScript 沙箱，也不向外部动作暴露 SQL。沙箱包在 Home Runtime 里声明 `databases.home`，用 `sdk.homeDatabase`（`get`、`all`、`transaction`，操作合同写 `effects.homeDatabase: ["read" | "write"]`，与 `projectDatabase` 同一套检查，S-91）；语句在宿主杀得掉的子进程里跑，宿主不留连接；项目里运行的沙箱包不能声明。每个库独占 `{home}/<store_name>/<store_name>.db`，schema 基线不符时拒绝并保留原库，不自动迁移。

项目里宿主自己运行的内置插件也可以有 Home 里的库，用的是同一个 `services.database`，不是第二份服务（W3-06 D）：在 Manifest 写 `databases.home`，启动名单的条目上不再有 `database`。名单上的定义对象拿登记里的库；不在名单上、由宿主自己运行的插件（开发中的、装进来的）也可以在 Manifest 声明 `databases.home`，库经账本给：库首次打开时在 `plugin-libraries/` 记下插件 ID、发布者（取自安装记录）、库名、版本和表的哈希，之后换了发布者、版本、表或库名都拒绝启动；库名不能是宿主已有的存储、安装器的目录、别的插件的库或 Home 里已有的目录；按项目分开的库只有名单上的插件能有。首次的发布者是安装时 Manifest 的自报，安装时不校验签名是 PG-001 的缺口，账本只保证装上后不可换发布者。沙箱定义、没有 Home 的平台（`home: null`）也拿不到。库名必须在 Home 存储登记中归该插件所有，并与登记的库基线一致；Manifest 声明 `storage:private` 和库的读写权限，同一份名单不能重复占用库。名单有错整份不启动、不建库。所有项目的实例指向同一个库文件，数据由插件自己按项目分区；库随实例启动打开、停止关闭。Dataset、Form、灵光、Pages、PPT、Workflows 是当前生产里的这类插件。

- `database.get/all` 用 SQLite 只读连接，接受参数化查询；没有跨库、路径和连接管理入口。
- `database.transaction(caller.beforeEffect, tx => …)` 先等待当前动作授权，再复查安装和 grant，随后执行短同步事务；异步回调拒绝并回滚。事务对象离开回调后失效。
- 更新和删除由业务 SQL 带版本条件；取消、撤权、停用或旧实例不可提交；出错不自动重试。
- `BoundActionClient.invoke` 的第三个控制参数仅限 Host 内部传递取消、`beforeEffect` 和带来源的 `page_context`；不会进入业务 JSON。父调用和子调用的取消信号都保留。 Home 消费宿主动作的 `HostPluginCaller` 同样来自执行器，项目为 `null`，插件、安装和操作者仍为真实值；项目和 Agent 入口拒绝这份身份，业务参数不能给它补项目。
- 浏览器同源 Referrer 与助理页面快照当前标为 `client_reported`，不代表屏幕内容已经核实；缺页面时为空，不从用户正文推断。

公共页面 `/plugins/<短名>` 在没有项目时也能打开；项目工作台挂同一运行实例的 contribution。宿主渲染 Home 视图时，`view.render({ contribution_id, surface, model })` 的 `model` 和工作台给内置舞台的一样，形状是 `{ primitives: { escape, text } }`：`escape(value: unknown): string` 把 `String(value)` 做 HTML 转义，`text` 是当前页面语言的翻译函数（`apps/local-host/src/web-locale.ts` 的 `L`）。这个形状现在只是 `apps/local-host/src/home-plugin-http.ts` 里 `homeViewModel()` 的返回值，合同里的 `UiRenderRequest<TModel>` 把 `model` 留成泛型，还没有命名的合同类型；补一个公开类型（归 ② 平台）之前，不要依赖多出来的字段，也不要假定它一直只有这两项。Manifest 路由在 `/api/plugins/<plugin_id>/` 转调公共动作，经过统一 Host / Origin / token 检查。插件页面的启用与停用是显式操作；停用跨重启保留，正常 Host 退出只释放运行实例并保留启用意图。 已声明的 Home 条目卸载后，其 API 以 `actions.missing` 和 404 拒绝；读取、重试与启用入口不重建安装，也不借项目前缀落到另一个实例。外部 MCP 仍须逐客户端逐动作授权，安装插件不等于授权外部客户端。

Home 插件可声明 `ui.views.slot: "side"`，对应 contribution 的 `workbench.side` surface。Host 用 `/plugins/<短名>?side=<view_id>` 渲染正在运行的 contribution，拒绝未声明的视图；客户端收到 `side: true`。首页及项目右上角的 Home 工具由目录声明派生，在既有侧栏打开该文档，保留主页面。侧栏按需加载，收起及切换标签不销毁文档；插件自行决定初次展示什么内容，位置和宽度仍归 Host。Home 侧栏不要求创建或授权一个假项目。

新增包、SDK 类型、公开 API 与动作快照、Home 库归属及 purge 清单须同步维护。资源按插件自己的客户端包加载；新增资源需要独立预算审阅，不能抬高既有资源上限。实现与验收见 [Issue V0](../../specs/issue-home-v0/spec.md)。

## 项目库里插件自己的表

插件在项目库（`projects/<id>/molis-work.db`）里要有自己的表，就在 Manifest 写 `databases.project`（`PluginDatabaseDeclaration`：`store_name`、`version`、`schema`、`read_permission`、`write_permission`），不进宿主的项目库基线，宿主不点名插件（`specs/plugin-project-database`，PG-020）。

- `parsePluginManifest` 检查形状：只有这五个字段，`store_name` 合 Home 库同一条名字规则，`version` 是正整数，两个权限都在这份 Manifest 的 `permissions` 里；自己的表两项都写 `storage:private`。
- `schema` 只能由 `CREATE TABLE` 和 `CREATE [UNIQUE] INDEX` 组成，名字不带库名；外键只指自己的表或 `project_root(project_id)`（项目本身，一库一行）；不用 `AUTOINCREMENT`。平台先切句检查，再在空的内存库里试建，不合的连内存库都不执行。
- 平台第一次为这个插件打开项目库时建表，在账本 `plugin_project_databases` 记下插件、发布者签名、库名、版本和表名；之后每次打开核对。库里已有同名对象、库名归了别的插件、发布者不同、版本不同、表被改过，都拒绝，库原样不动；被拒的插件只停它自己，项目与别的插件照常。
- 版本不就地升级：改表就升 `version`，在 `docs/releases/CHECKLIST.md` §3 改那一行，并按 `docs/releases/POLICY.md` 第 5 节写一次性维护。

宿主开库时为 `BUILTIN_PLUGIN_CATALOG` 里声明了它的条目建表、核对（Coding、Feed、Goals、Schedule；Goals 的 31 张表含 `boards` 与治理的 4 张）；经 Plugin Runtime 启动的插件（含装进项目的与沙箱插件）启动时由平台用同一个打开函数建表或核对，被拒就不启动。Home 级插件没有项目库。

- 运行时读写：`context.services.project_database`（`PluginDatabase`，与 Home 库的 `services.database` 同一个接口、同一份客户端），只给经 Plugin Runtime 启动、声明了 `databases.project` 的插件。读 `get`、`all` 只认 `SELECT`、`WITH`，走只读连接；写只在 `transaction(caller.beforeEffect, tx => …)` 里，回调同步，`tx.run` 一次一句，只认 `INSERT`、`UPDATE`、`DELETE`，走宿主自己的连接（同一个文件只用一份 SQLite 库）。
- 项目日志：`services.project_database.journal` 是项目事件日志和幂等记录的端口（`events`、`idempotency_records` 属于 `packages/storage`，语句读写不了）。要在 Manifest 声明并获授 `journal:project`。读 `eventCursor`、`readEventsDescending` 在数据库对象上，只读到、数到本插件自己写的事件；写 `appendEvent`、`getIdempotency`、`putIdempotency` 只在 `transaction` 的 `tx.journal` 上，和 `tx.run` 同一个 SQLite 事务。每次调用再问授权、原调用者和事务是否仍在（S-63）；一行的行为人只能是调用者的 `actor_id` 或 `audit_actor_id`，动作外只能是宿主给的行为人；项目号由库给，`appendEvent` 里多带的 `projectId` 无效。事件的 `type`、`objectType` 和幂等的 `operation` 写本插件自己的裸名：平台存成「插件号、一个冒号、名字」（插件号里不会有冒号，所以一个插件号是另一个的点分段前缀时也互不相干），读回来再去掉，所以插件读不到别的主人的事件、数不到它们的游标，两个主人用同一个操作名也撞不上；要别的主人的事件，调那个主人的动作。沙箱里的插件暂时没有它。
- 逐句检查（`pluginStatementGuard`）：关键字过后，平台用 `EXPLAIN` 带着参数读这一句的步骤。名单外的步骤（建、删、改表与索引，`PRAGMA`，`VACUUM`，事务控制）、不是本插件表与索引的根页（`project_root` 只许读）、`temp` 或附加的库、读里的写步、两个 JSON 函数之外的虚表，都以 `plugin.project_database.statement_refused` 拒绝，语句一步也不运行。步骤名单按 SQLite 3.51.3 写成，宿主的 SQLite 换了版本就全拒，直到重新核对。
- 沙箱插件：操作的 effects 写 `projectDatabase: ["read"]` 或 `["read", "write"]`（查询不能声明写），人批准后经 `sdk.projectDatabase.get`、`all`、`transaction` 跨通道读写，宿主一侧是同一份客户端与检查。通道上参数只许 null、有限数、字符串，BLOB 与超出 2^53 的整数不传回；一个事务 1 到 64 句，在宿主一侧整个提交或整个不写；宿主的拒绝码原样交给插件。创作台生成的 Manifest 写不出 `databases.project`，创作台防腐收尾后删除（BL-377）。宿主一侧的语句跑在子进程的 SQL Worker 里（S-59），子进程主线程独立处理截止时间、总 RSS 和宿主断线，即使宿主同步写在等待锁也会按时杀整个子进程：一句读超过 5 秒、一句写超过 2 秒、一个事务超过 3 秒是 `plugin.project_database.statement_timeout`，语句让进程用掉超过 256 MB 内存是 `plugin.project_database.statement_memory`，进程被杀，未提交的事务不留，下一句照常跑；若正在提交时被中断则返回结果未知；`get` 和 `all` 都至多回 512 KiB，`all` 另有 1000 行上限（再多是 `sandbox.database_result_too_large`，用 `LIMIT`/`OFFSET` 翻页），递归查询（CTE 读自己）一律被拒（`plugin.project_database.statement_refused`）。

## Runtime 流式路由

Manifest 路由可声明 `stream: "ndjson"`，只支持 POST。`bindPluginActionRoute` 将真实动作的 `caller.on_progress` 接到 HTTP：每行是 `{ type: "progress", stage, progress, text_delta? }`，随后只有一个 `{ type: "result", result }` 或 `{ type: "error", status, code, error, call_id?, details? }`。末行由 Host 写，进度里的其他字段丢弃，插件不能伪造结果或诊断编号。HTTP 已经开始后状态保持 200，调用失败看错误末行；请求体超限则在开流前按普通 JSON 返回 413。未声明 stream 的路由继续返回 JSON。

`BoundActionClient.invoke` 第四个参数是传输回调 `{ on_progress }`，不属于业务输入。第三个 `request.execution` 必须原样传下去：Host 用这一个对象确认 Home 路由来自哪个项目，展开或另造对象不继承这个证明。直接路由通过可选的 `request.emit` 发进度；等待模型或外部服务的动作仍声明 `scheduling: "concurrent"`。

普通路由可返回现有 `PluginRouteResponse.bytes` 与 `filename`，Host 按原始字节下载；强制附件、octet-stream、nosniff、sandbox、no-store，插件不能通过 `mime` 或 `headers` 改成页面执行。

SDK 导出的 `PLUGIN_ROUTE_STREAM_LIMITS` 固定进度上限：单行 65,536 UTF-8 字节（含换行），至多 10,000 行，合计 1,048,576 字节；任一超限取消调用，并以 `actions.output_invalid` 错误末行结束。显式 `max_body_bytes` 最大 45,000,000 字节，项目默认 256,000、Home 默认 12 MiB 不变。客户端断连或实例停用、撤权后，Host 结束等待并释放观察器；已经开始的外部操作由插件用取消信号清理。处理器晚到时，仍须在写入前执行 `beforeEffect()`，不得写成功、失败或其他业务记录。

## 已受理的后台执行

宿主自己运行的 Home/项目插件可在本安装的活跃并发 command 里 `await services.background.start(async control => …, { signal? })`。动作必须声明 `background_job`，否则拒绝；升级预检没有该服务；沙箱包不收回调，用 `sdk.background.start(operation, input)` 起自己某条命令的一次运行，它在同一个包的第二个沙箱进程里一次一个地跑，结果不回给包（S-67；生成的插件要等创作台一侧接线，BL-377）；启动钩子、直接路由、过期处理器和其他安装也不能借它开始工作。返回句柄的 `result` 是结果 Promise，`cancel()` 只取消这次执行；插件自己保存任务、幂等键、状态与恢复决定，平台不重试、不在重启后重放。

后台回调保留原动作的身份、项目、权限和精确注册，并用新控制调用既有模型与数据服务。每次写入都要先 `await control.beforeEffect()`，提交前同步检查 `control.assert_authority_current?.()`；不能继续使用已返回处理器的 caller。原 HTTP/MCP 正常结束或断开后，已受理工作可继续；原 MCP 授权撤销、插件停用/升级、Host 关闭或显式取消会终止本机等待，迟到的成功与失败都不得写业务记录。没有入口提供独立后台授权的调用仍服从原 signal；不能借它逃离 Agent 的取消。项目路径上的 Home 路由仍在原项目里，提交时重查项目存在且显示该插件。

执行仍在本进程；非配合式外部调用可能继续运行，插件须把控制的 signal 交给它。200 ms 周期复查使用已有 `createExecutionLifetime`，结束即释放；模型和文件服务在等待后另行核权。后台不再向已结束的路由发进度，不能递归接受后台执行；自己的结果结束后，旧控制和迟到模型回调也失效。验收见 `tests/security-invariants-plugin-background.test.ts` 与 `tests/runtime-plugin-http-discovery.test.ts`。

## 随激活存活的后台作业

有些工作要比受理它的那次调用活得长，又不该带着那次调用的授权：一轮 Agent 已经开始，要有人跟到它结束、记下真实结果；插件激活时要接上上次没跟完的事。这类工作用 `services.background.keep(job, async control => …)`，返回 `{ done, cancel() }`。作业属于插件的这次激活，用安装自己的授权跑；单次调用取消或撤权不停它，插件停止、停用、卸载、升级、崩溃或隔离，库里的安装记录撤了作业要的授权或换了世代，作业所在的项目关闭或删除，Home 关闭，它都停。验收与条文见 `docs/system/SECURITY-INVARIANTS.md` 的 S-52。

- **先在 Manifest 声明**：`background: { jobs: [{ job_id, reason, permissions }] }`。`job_id` 是小写字母开头的名字，`reason` 写这个作业在后台做什么，`permissions` 是它的写入要的权限，必须是 Manifest `permissions` 里声明过的。`keep()` 只认声明过的 `job_id`。
- **只能在三处登记**：
  - 本插件的命令里，在这次调用通过最后一次授权检查之后：它自己的 `await caller.beforeEffect()` 返回过，或经平台服务写过一次、调过一个返回了的命令。还没通过、检查被拒的调用登记，`plugin.background_job_unchecked`；查询里登记，`plugin.background_job_origin`。登记时平台再同步核一次这次调用：检查之后被取消或撤权的调用登记被拒，错误就是那次取消或撤权。所以提交之后同步调 `keep()`，中间不要再 `await` 别的东西。
  - 激活的 `start()` 返回之前（接上没跟完的事）。`start()` 返回以后、在那里设的定时器里再登记，`plugin.background_job_origin`。
  - 同一激活的另一个还在跑的作业里（跟随者发现一轮在等，就起唤醒的作业）。作业已经停了（被取消、所在项目关闭或删除）再登记，被拒；项目关闭或删除之前就开始、还在进行的调用，之后也不能在那个项目里登记。
- **作业的项目**从登记它的调用来，作业里起的作业继承它；Home 实例在 `start()` 里登记的作业没有项目，所以 Home 插件要为某个项目起作业，得等那个项目里有一次通过了检查的调用。项目不从输入或存储读。
- **作业以安装的身份做事**：`control` 只有 `job`、`signal`、`beforeEffect()`、`assert_authority_current()` 和 `project_id`，没有原调用者、受众和页面。作业里调动作，一律以安装的身份、按 `plugin` 受众、在作业自己的操作编号里发：调不到只给 `user`、`mcp` 等受众的动作，调用记录里也不出现原调用者；拿请求的路由 control 去调会被拒。
- **每次写之前** `await control.beforeEffect()`：作业还在、激活还活着、安装记录仍是同一份并授予作业声明的权限。每个激活共用一个 200 ms 定时器把同样的检查跑一遍，不过就中止那个作业的 `signal`，正在等的工作要把 `signal` 交给它等的东西。作业停了以后，经平台服务的写（存储、库、文件、事件、动作调用）都被拒，插件忘了问 `beforeEffect()` 也一样；插件进程里的内存状态平台不管。
- **原调用被取消、撤权后作业还写**，只在用户 10-12 定的窄例外里成立（`specs/repository-anti-corruption/spec.md` §12.10）：作业只把已经受理的那件事跟到底、记下它的真实结果和回执，不发起新的业务请求、不继续交接、不以记回执为名派发下一步。通过检查之后提交本身失败了（比如 Run 没开成），作业找不到要跟的东西，就什么都不写地结束。平台能强制的是身份和受众；「只跟那件事」是插件的义务。
- 平台不保存作业、不重试、不在重启后重放；要恢复，插件把要跟的东西记在自己的存储里，下次激活在 `start()` 里登记。`cancel()` 由插件自己调（比如更新的一轮接手了会话）。沙箱插件没有 `services.background`。

首页要把各项目里还在跑的工作列在一处时，插件把读这些工作的查询标上 `action.home_aggregate: true`，并写明 `output_type`：只能是项目范围、`kind: "query"`、只读（`effect` 不写或 `read`）、不调用模型、不计费的查询，别的写法 Manifest 检查就拒（`isHomeAggregateQuery` 是同一条规则）。首页按 `output_type` 找，只在打开的项目里逐个调、用那个项目里安装的授权；插件停用或没授权的项目不调，没打开的项目不为它打开。调用带 `query_only`，查询里再调命令或计费查询会被拒。各项目的答案分开返回，首页按 `plugin_id` 去打开。声明本身不给任何授权。验收见 `tests/security-invariants-home-aggregate.test.ts`（S-49）。

首页标题栏的「后台任务」列表就是这样来的，不需要宿主为某个插件写分支：插件用 SDK（`@molis-ai/molis-work-plugin-sdk`）的 `defineHomeBackgroundTasksAction(能力 id, 标题, 权限)` 声明查询，回答 `{ source: { surface }, tasks: [{ id, title, state, updated_at, waiting, standing, commands }] }`（`surface` 是工作台上打开这个任务的位置，`id` 是在那里打开的项目；`standing` 是几句话，句子可以带 `{n}` 和数字，页面按词典翻译；`commands` 是任务留着的后台命令，`stop_path` 是插件自己的停止路由、相对插件）。宿主的 `apps/local-host/src/home-background-tasks.ts` 对每个已打开的项目问一遍，检查后摊平，按提供方插件和项目拼出停止地址；页面只按行里的字段画。例子是 Coding 的 `plugins/native/coding/src/home-background.ts`，验收见 `tests/coding-background-tasks.test.ts`。

## 当前项目设置

跨模块读取当前项目目标目录、创建意图或补充便笺可引用 Goals 的 `goalsActions.list/create/note`。公共动作输入只有业务字段，项目与 actor 由可信调用上下文绑定；不要把内部 typed Capability 的 actor 字段复制进动作 JSON。权限分别为 `goals:read` / `goals:write`，写入重试保留原 idempotency key。Goals 的写入声明 `authorship: "session"`，审计作者由宿主写进 `caller.audit_actor_id`，它属于可信上下文，不是业务参数，不改变客户端授权，也不授予决策权限；外部客户端只看到被授予的动作工具。其他 Goals 事件能力仍按其现有接口和审批合同使用，见 Goals 包 README。

已由当前项目 Runtime 注册的插件，HTTP 路由从 Manifest `routes` 与运行中的 `contribution.routes` 派生，挂在 `/projects/<project>/api/plugins/<plugin_id>/...`。不需要追加 Host 的插件 ID 正则名单；后续注册也不会移除先前插件的路由。路由适配器使用 SDK 的 `bindPluginActionRoute` 调用同一动作服务，输入和权限检查不会因 HTTP 入口而绕过；动作失败时路由按错误的 kind 答，响应体是 `{ error, code, details? }`（见「错误：码、kind 与状态」）。Web 写入仍须通过原控制令牌、origin 和一次性请求键检查，停用后不得靠请求或 restart 自动重新启用。

原 `/restart`、`/release-quarantine`、`/upgrade` 是 Host 生命周期入口，插件业务路径需避开它们。内置插件继续遵守项目启用与关联插件规则；其他插件遵守当前项目的 Runtime 注册、授权及生命周期。新路由返回值不会按 Coding 的 report、runs 等字段擅自补充页面 HTML。此机制负责已注册实例的分发，发行物安装与启动仍走 Runtime 的原接入合同。

插件调别的动作只经 `context.services.actions.invoke`，被调的动作要列在清单的 `capabilities.consumes` 里，宿主的和别的插件的都可以（用户 2026-10-14 定；规则见 `skills/molis-plugin-dev/elements.md` 与 `docs/system/SECURITY-INVARIANTS.md` S-15）。另有一条路：声明 Manifest 权限 `actions:delegate` 的插件，在自己正在运行的动作里可用 `context.services.actions.directory`（`discover()`、`invoke(reference, input)`，以及只核不调的 `check(reference, input)`），以原调用者的身份、工作流受众，调目录里向工作流开放的任何动作，不用事先列进 `consumes`；它只受原调用者的权限约束，不收窄到插件自己的授权（用户 2026-10-20 定），调用记录里带 `delegated_by`；原调用者是 `plugin` 受众、动作之外、撤权和取消都拒绝，写法见 `skills/molis-plugin-dev/host.md` 的「动作目录委托」与 `docs/system/SECURITY-INVARIANTS.md` S-43。插件跨页读取项目设置使用具名能力，不读取设置页 DOM 或其他插件私有存储。Contract 中 `projectSettingsCapabilities.workspaces` 与 `browsingWorkspace` 分别声明到 Manifest `capabilities.consumes`，再以 `invoke(capability, [])` 读取。只返回当前项目；没有项目编号、通配授权或任意 key。关联目录与浏览选择在「项目设置 → 工作目录」维护，Files/Git 不再依赖 Workspace 输出；Coding 会话执行目录独立选择。

完整字段、迁移、示例与设置归属：[当前项目设置](PROJECT-SETTINGS.md)。`settings` 槽只负责呈现，`storage:private` 仍是插件私有状态；Goals 项目说明保持独立协议。

### 全局插件设置的数据

`settings` view 可用 `settings_data: { action }` 声明本 Manifest 自己的只读、面向 `user`、只有一个版本的查询；宿主在个人 Home 按原本地所有者权限调用，结果交给同步 `SettingsPageModel.data`。项目与打开设置的项目仍在固定 `context` 中。需要 Agent 运行时列表的页另声明 `settings_runtimes: true`，结果在 `context.runtimes`；不声明就不查询并给未请求的空集合，查询失败沿原 ActionError/HTTP 错误链呈现，不伪装空列表。这个可选字段只许 `settings` 槽使用且只能为 `true`，不依赖有无 `settings_data`，不增加动作、权限、超时或重试政策。当前只有 Coding 消费列表并显式声明；Shelf 不依赖列表。

当前全局设置的贡献发现与这两项声明只对内置目录兑现；已安装 Runtime 插件仍会经过 SDK 声明校验，但尚未接上动态设置贡献与数据准备。细则见 [插件界面 Skill](../../skills/molis-plugin-dev/ui.md)。

### 舞台的数据

打开舞台的那个 view（`stage` view，没有就是第一个 `navigator` view）可用 `stage_data: { action }` 声明本 Manifest 自己的只读、面向 `user`、只有一个版本的查询，规则与 `settings_data` 相同。宿主按页面上的这个人、只带这个动作自己的权限调用，结果交给舞台的 `StagePageModel.data`；整页与原地重画（`GET /api/stage/<project_plugin_id>`）走同一条路。插件不在或被拒时没有 `data`，其他失败照常报错。当前只对内置目录兑现（T-133）。

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

`compatible_from_versions` 表示新实现能直接使用该版本的私人数据和既有 grant。为同一版本修正文档时，也可精确声明兼容当前已安装版本；这只允许插件继续运行，不改变已保存的 Manifest 指纹，也不会产生市场升级候选。重新打开项目可以用已声明兼容的新实现恢复旧安装，但不会改写已安装版本；市场会列出更高版本的升级候选，只有用户点「升级」才提交新版本。内置插件是例外（随 Host 发布，监督器条目给 `trust: HOST_BUILD_TRUST`）：启动时安装记录改成这个构建的清单，版本更高、更低或同版本摘要不同都一样，保留 `install_id` 与私有数据，也不进市场候选，所以不写 `upgrade_compatibility`（[发布策略](../releases/POLICY.md)第 7 节）；本节其余关于启动不改写安装记录、市场确认升级和发行物恢复的说明，都针对不是 `host` 信任的插件。

Runtime 管理的首方 Native 工厂会保存为单文件发行物，写入当前项目已有 SQLite 的 `plugin_runtime_release_artifacts` 表，身份由插件 ID、发布者签名、版本和 Manifest 指纹确定。内置插件（`host` 信任）启动时跟随当前构建，不从这张表恢复旧版：当前构建的发行物照旧写入，但恢复只对不是 `host` 信任的条目生效，此外只有 Schedule 提醒读这张表，按安装记录的版本与摘要取插件显示名。不是 `host` 信任的条目在 Host 重启时，不兼容的新版候选不会顶替旧实现；Runtime 会加载已安装版本的发行物，或加载一份明确兼容该已安装版本的留存实现。兼容实现恢复时安装记录仍保持原版本。首次安装、明确兼容的新版实现首次运行，以及用户点击「升级」前都会归档对应代码；保存的是可执行代码，不属于 `storage:private`，也不会创建独立代码目录。

`install_id` 是稳定的数据命名空间，重装可沿用保留的数据；持久任务还必须绑定 Runtime 的 `installation_generation`。后者在确认重装时更新，重启、停用/启用和版本升级保持不变。Host 直接读安装记录的 `installation_generation`，不从任务输入接受安装世代。Schedule 提醒与定时操作都按此规则隔离：世代不符的记录保留，不自动投递或执行，等重装后确认归属。

`migratable_from_versions` 表示发布者允许从列出的旧版本手动升级，但不能据此直接启动新实现。目标 `PluginDefinition` 必须实现 `validateUpgrade({ from, context })`：在切换前只读检查 `storage:private` 数据能否被目标实现处理。校验上下文只提供只读的 `get` 和必要身份，不暴露其他 Host 服务。Host 不执行数据迁移；预检通过后，目标版本按现有格式直接使用这些数据。需要转换格式的插件目前不受此协议支持。验证失败时旧安装记录、grant 与私有数据保持原样。

无论升级方式，目标 Manifest 都必须保留旧安装的全部 grant 声明及必需权限；升级不会重新授权、改变签名身份或创建新私人库。常规启动不会把新 Manifest 写成已安装版本；未声明支持的来源版本可在市场显示为不可升级，不会在项目启动时被静默替换。显式升级目标必须高于当前版本。当前升级入口作用于当前项目的 Runtime 安装。

Native 作者必须让实现代码变化对应到新的 Manifest 版本或 Manifest 指纹；相同的版本和指纹表示同一发行物。不要把未声明兼容关系的新版代码依赖于启动时替换旧安装。发行物表现在只为 Runtime 管理的、不是 `host` 信任的 Native 插件恢复旧版；Coding 面板等内置插件启动时跟随当前构建，不靠它恢复。仍由 Host 构建期组合的其他插件没有安装记录，也不会获得这条版本化恢复能力。Native Plugin 与 Host 在同一进程运行，版本归档不构成 JavaScript 沙箱。

Plugin Builder 将每次发布保存为独立版本记录。发布新版只产生候选，不会启动新版本；作者需要明确选择直接兼容，或要求升级时校验数据。库页会显示 Runtime 实际安装版本和最新发布，用户选择「升级」后才调用同一套 Runtime 校验与回滚流程。Host 重启后按安装记录恢复对应的 Builder 发布版本；不要用 Builder 的最新发布覆盖尚未确认升级的版本。

## 统一动作与消费场景

动作可在 `action.result_view` 声明用户可读结果：固定 `summary`、指向原返回值的 `title_pointer` / `text_pointer`（JSON Pointer），以及 `link: { label, href_template }`。链接模板只允许站内路径，支持 `{project_id}` 和 `{/输出字段}` 标量替换，值由平台编码；不执行模板代码，也不修改输入输出合同。工作流保存当次摘要到原步骤历史，默认折叠技术详情；旧记录和未声明的动作仍可查看原结果。长正文显示有界节选并明确提示，不能把摘要当完整业务返回值。提供方负责目标页的通用对象深链处理，不在 Host 或工作流按插件 ID 添加分支。示例见 [Plugin SDK README](../../packages/plugin-sdk/README.md)。

新能力使用 `actions` 与 `action_scenes`，由 Kernel/Plugin Runtime 注册执行。SDK `defineAction` 提供定义与 handler 配对；场景必须兑现 `bindings`、`bind`、`consume`。用 `event_schema`/`prepare` 分离触发事件、函数输入和私有对象快照；可选 `failed` 负责明确的失败消费，同样接受绑定、权限、生命周期和对象检查。`required_scene` 让 Host 依据实际绑定计算触发入口状态。

`bind`、`consume`、`failed` 接收真实 `ActionSceneExecutionContext`。异步等待后、写入前调用 `await caller.beforeEffect()`，再原子核对 owner 的对象版本；它重新检查原调用者、取消、场景与判断注册及权限，回调返回或抛错后不能继续写入。`bindings`、`targets`、`prepare`、`availability`、`configuration_availability` 是只读回调，允许普通查询及查看原授权目录里的判断/写动作元数据，拒绝直接写入、嵌套写动作和付费查询；宿主从已注册目标读取操作与费用，不接受插件自报的替代值。场景经 `services.actions` 发起嵌套调用时仍保留原场景控制。场景不是动作，不取得模型、后台执行或动作专属查询委托的资格。

Host 的动作客户端和场景客户端共享项目运行时与执行队列。兼容场景通过输入输出及语义合同发现，使用位置从原业务配置读取；新增插件不改中央能力或场景 ID 名单。插件有业务权限不代表外部 MCP 客户端有同样权限。细节与示例见 [SDK](../../packages/plugin-sdk/README.md#动作与判断消费场景)、[Inbox 场景](../../plugins/native/inbox/src/scenes.ts)、[实际自动触发验证](../../tests/inbox-automatic-scenes.test.ts)。

系统规则编辑器通过场景 owner 的 `targets` / `bind` 自动显示真实配置位置。场景声明 `configuration_permissions`，配置保存携带准确提供方和原 revision；原 owner 原子拒绝过期修改。目录查询不创建规则，停用保留原引用。具体接口和权限边界见 SDK。

无需再手写一份 MCP 管理工具。Host 会从上述合同生成查看位置、启用、停用三项动作，沿用场景的版本、提供方和生命周期，进入现有能力目录及对外授权设置。只有消费场景、没有自定义动作的插件也适用。配置权限与运行权限独立；缺少模型或执行权限时，有配置权的用户仍能停用原绑定。外部客户端须获具体管理动作的授权，不能借其他动作的同名权限执行。

当前范围：Home、Inbox、Feed 的绑定与真实触发已进入共同场景；工作流交接保留原调用者并按交付键幂等。规则编辑器与 Agent 的可选能力都从动作目录派生；Manifest 不再有 `behaviors`、`function_scenes`、`judgment_subjects` 或 `mcp_exports`，对外只有按客户端授权的动作工具。

## 错误：码、kind 与状态

一个错误是一个码、一句消息，可选一个 kind 和 details，用 `ActionError` 抛出（从 SDK 导出）。

- **码**是 `<主人>.<原因>`，主人的名字开头：Todo 的是 `todo.not_found`、`todo.conflict`。`actions.` 是平台自己的，插件不能用来声明自己的码；一个码只属于一个主人，不借别人的开头。码是小写单词用点连起来，需要成组时主人后面再接一段（`goals.event.version_conflict`）。
- **kind** 说这是哪一种失败，状态只由它推出：`invalid` 400、`forbidden` 403、`not_found` 404、`conflict` 409、`too_large` 413、`rate_limited` 429、`cancelled` 499、`internal` 500、`upstream` 502、`unavailable` 503、`timeout` 504。插件不写状态表，路由里也不要为某个码特判状态。
- **声明**：插件用 `defineErrorCodes(prefix, { 原因: kind })` 把自己的码一次声明好，之后抛 `notesErrors.not_found("找不到这条笔记")`；需要带给调用者的数据放第二个参数 `details`，这是主人数据唯一的位置。声明时检查前缀写法合规且不是 `actions`、原因是单词、kind 是已知的，也不允许重新声明平台已有的码；哪个包可以用哪个主人名，由错误码主人表 `tooling/gates/error-owners.json` 核对：`plugins/native/<目录>/` 下的文件，主人名就是目录名（连字符变下划线，Todo 的是 `todo`），不用登记；插件的 Host 文件和模块（`apps/local-host/src/<插件>-*`、`modules/<插件>/`）在表里写明。`pnpm health:check` 数出不以所在文件主人名开头的码、不是小写点连接写法的码、`extends …Error` 的类、由错误的码或类型选出的 HTTP 状态，四项都只许减少，新文件从 0 开始（`tooling/gates/README.md`「错误模型」）。
- **平台的码**（`actions.missing`、`actions.plugin_disabled`、`actions.scope_mismatch` 等）在合同的 `ACTION_ERROR_KINDS` 里一码一行，已经有 kind，直接 `new ActionError("actions.missing", "…")`。
- **抛 `ActionError`，不要自己造 Error 子类**：Host 里还有按 `instanceof ActionError` 认错误的入口（MCP 的错误文本、首页的动作回答、放置面板里「原对象已删除」与「暂时读不到」的区分等；它们还没有换成按形状读，SDK 的函数已经是按形状读的），只有 `ActionError` 才被当作带码的失败。Todo 原来的 `TodoError` 不是 `ActionError`，所以它的动作失败在这些入口里被当作未知失败，换成 `todoErrors` 后才各自回答成它本来的样子（Todo 读对象的那条路径本来就抛 `ActionError`，放置面板读到「原对象已删除」与首页准备对话的回答没有变）。
- **没有 kind 的错误**：带我们格式的码（`<主人>.<原因>`）但没人给 kind，按调用者的错误处理，400；没有码、码不是我们的格式（例如系统错误码 `ENOENT`），或根本不是 Error，按内部失败处理，500，响应体的码是 `actions.execution_failed`。调用者写错了才会遇到的情形要先给它一个自己的码（kind `invalid`），别靠 500。动作的可用性对象（`{ available: false, code, reason, kind? }`）也可由主人给 kind；内核的动作与 typed 派发、SDK 的 owner 绑定在抛 `ActionError` 时保留它。Pages、PPT、Dataset、Form 的「当前环境不能发出成果」带 `conflict`，回答 409，原稿保留。没有 kind 的对象仍按主人码的默认 invalid（400）或平台表（例如 `actions.connection_required` 503）处理。
- **响应体**统一是 `{ error, code, details? }`；`error` 是消息。**按 kind 答的入口**：Host 的 Native 插件 HTTP 分发器（`dispatchNativePluginJsonHttp`），不传 `mapError` 时让错误抛出来即可（Todo 是样例，Pages、PPT、Dataset、Form、Lingguang、Workflows、Shelf、Jelly、Cognia、Functions 同样）；要自己写 HTML、图片字节、跳转或头部的入口（Feed、Inbox、Schedule、Images），它们在 `try` 里用 `readNativePluginJsonBody` 读请求体，出错写 SDK 的 `actionErrorResponse(error)`；SDK 的 `bindPluginActionRoute`，Runtime 插件的路由用它兑现动作：动作抛出的错误按它自己的 kind 答，没有我们的码的错误答 500 `actions.execution_failed`，路由自己的请求映射函数拒绝了请求答 400 `actions.input_invalid`（带着映射函数的那句话）；不经它、自己写 `handle` 的路由，处理器抛出的带码错误由 Plugin Runtime 的路由派发按 kind 答（BL-404，不用自己写 catch），没有码的交给 Host 答通用句子，不带原消息；还有 Plugin Runtime 路由器自己的拒绝，用的是动作层已有的码和句子：没有路由要的权限 403 `actions.forbidden`，本项目没有启用该插件 403 `actions.plugin_disabled`（页面外层对「这个项目没有启用这个插件」答的也是它），插件未运行 503 `actions.plugin_unavailable`，声明了路由却没有处理器 500 `actions.execution_failed`。Host 自己的几个入口同样按 kind 答（成果入口还在这一个地方把消息翻成当前语言，`/api/project-references/`，设置页的项目插件开关），Host 对 Host、Origin、控制令牌检查的拒绝统一是 `host.request_refused`（403，不说哪一项没过）；读不出请求体也是同样的错误：`actions.input_invalid`（400）、`actions.input_too_large`（413）；仍带 `mapError` 的入口，读不出请求体时也由它回答（多数答 400，Agent 定义入口答 500、不带码，助理入口答 500、码 `assistant.failed`）。
- **页面和调用方按 `code` 判断**（例如 `todo.conflict` 提示重新读取），不按 HTTP 状态；`actionErrorFromResponse(status, body)` 把响应还原成同样的错误。读错误一律按形状（有 `code` 和 `message`），不用 `instanceof`：Runtime 包和创作台页面里可能有另一份 `ActionError`。

## 连续工作：对象上下文、版本前提与助理

同一件工作会在底栏助理、插件页面和用户手动操作之间交替进行。插件的对象、版本和删除状态由插件自己拥有；工作与对象的关系由助理写进 Context Ledger；运行与确认归 Agent Host。插件不另存“助理做过什么”，也不复制正文。完整约定、样例与验证见 [molis-plugin-dev · continuity.md](../../skills/molis-plugin-dev/continuity.md)，要点：

- 每种展示的对象提供 `defineSubjectContextAction("<plugin>.subject.read", "<kind>", …)`，返回当前正文、所有者版本 `revision`、关联 Goal、会话与 `open: { surface, id }`；不存在时抛 `<plugin>.not_found`。个人范围的对象传第五个参数 `"home"`。
- 修改类动作只声明一种 `subject_kinds`，用 `result_subject` 指出输出里的对象标识与新版本，例如 `{ id: "document.id", revision: "document.version" }`；必须写成对象，两个位置都要在本动作的 `output_schema` 里写出来，写成字符串等别的形状、写错位置、或没有输出合同，注册时就被拒绝（规则见后面“指向别的动作”一条）。修改已有对象接受 `expected_version`（或 `expected_revision`）。助理修改已有对象必须带读取时的版本，否则在确认前被拒。
- 没写 `result_subject` 时，助理按下面的明文规则认结果对象，只对“恰好涉及一种对象”的修改动作生效（涉及多种对象或不涉及对象的动作，以及查询和导航，不记结果对象）：输出本身是带字符串 `id` 的对象，就用它；否则输出的顶层字段里恰好有一个带字符串 `id` 的对象，就用那一个（有两个或没有，则这一步没有结果对象）；版本取该对象的 `version`，没有就取 `revision`（数字或非空字符串）；输出里认不出，就看输入：输入本身带字符串 `id`，就用它，没有版本。这是兜底，平台不检查它猜得对不对；会写东西的动作最好显式写 `result_subject`。
- 插件根元素维护 `data-assistant-context`（当前对象、版本、未保存状态与草稿、起步建议）；这只是屏幕说明，发送时才成为材料，不写记录、不授权。
- 监听 `molis:assistant-effect` 并在没有未保存修改时重读；用户在页面上改变了助理可能展示的对象时发 `molis:assistant-surface-changed`。
- 页面缓存的设置在本页没有未保存改动时采用已保存值，避免把别处的修改写回。
- 要给助理发信息，发 `molis:assistant-message` 并写明用途：`background`（只作上下文）、`change`（对象变了）、`suggest`（由用户决定是否发送）、`delegate`（用户刚在页面上要求交给助理，只有真实用户操作才立即开始）、`reply`（把结果交回某项工作）。不要自称“用户已同意”。
- 动作声明里指向别的动作的地方（`undo`、`background_job.status`、片段与事项推荐的选项目标），目标必须在**同一次注册**里：同一份 Manifest 的 `actions`，或同一次 `registerProvider` 的 `definitions`；文档里说“同一提供方”，指的就是这个。注册先后不定，所以不按提供方编号跨注册去找：一个提供方拆成几次注册、又互相引用，会被拒绝，报“不在同一提供方的声明里”（Goals 按范围分两次注册，引用也都在各自的范围里，所以没有这个问题）。要用别的提供方的动作，写 `required_actions`，使用时按调用者核对。`definePlugin`、命令行 `validate`、Runtime 安装与升级、宿主注册动作时都检查（SDK 的 `inspectActionCrossReferences`）；声明本身不完整的由形状检查另外报告，不重复报。谁能用目标（受众、权限、效果）不在注册时查，使用时按调用者核对。
- 可以撤回的修改声明 `undo`：`{ capability_id, version, input: { 字段: "输出路径" } }`，指向同一次注册里的撤销命令，以及它的输入在本次输出里的位置；需要数组时写 `["路径"]`。注册时检查：撤销命令存在、是命令、与本动作同一范围；`input` 里的每个字段都是撤销命令输入 schema 的属性，它必填的输入都要填上；每个输出路径都在本动作的 `output_schema` 里写出来了（沿属性、`anyOf`/`oneOf`/`allOf` 分支和本 schema 内的 `$ref` 找；只写 `type: "object"` 的开放对象找不到，要先把字段写出来；没有 `output_schema` 就没有位置可指）。这样的修改在用户明确要求时由助理直接执行、事后可撤销，用户也可以把它设成每次确认。删除、对外发送这类撤不回的修改不要声明。样例：灵光“记下灵光”用“丢弃灵光” `{ ids: ["spark.id"] }` 撤回。
- 用户可以在插件里设提醒（今天只有 Todo 的提醒时间在用）时，提供到期提醒查询：`defineDueRemindersAction("<插件>.reminders.window", [对象种类], "到期提醒", [读取权限])`（Home 范围、只读）。输入 `{ from, to }`，只返回 `from ≤ 到期时间 < to` 的提醒，每条带稳定的 `reminder_id`（改了时间就换新的）、`due_at`、`title`、`subject`、`project_id`（个人为 null）、`open`。插件不需要计时器：Host 每分钟来问一次，每条只提醒用户一次，并按用户的提醒规则处理。只返回用户自己要求的提醒，新条目、未读数、逾期清单都不算；用户已在插件里处理过的提醒不要返回。辅助函数 `assertDueReminderWindow`、`withinDueReminderWindow` 和类型随 `defineDueRemindersAction` 一起从插件 SDK 导出。
- 会启动后台任务的命令（研究、生成等）声明 `background_job`：`{ status: { capability_id, version }, id: "run.jobId", input: "id", state: "status", done: [...], failed: [...] }`——输出里任务标识的位置、同一次注册里的状态查询、它接收标识的字段、状态的位置和结束状态。注册时检查：状态查询存在、是查询、与本动作同一范围；`id` 在本动作的 `output_schema` 里，`input` 在状态查询的输入 schema 里，`state` 在状态查询的输出 schema 里。片段与事项推荐的选项同样要指向同一次注册里、同一范围的动作，事项推荐的目标还要支持选项对应的事项种类（目标没写事项种类则不限）。助理（或用户点的建议按钮）启动后，Host 经 Prologue 队列按状态查询跟进到结束，结束时提醒用户、按钮显示结果，并在下一轮告诉助理；不必自己推送。样例：炼金术士的“启动炼化”“启动研究”。
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

## 选区与去处：用户手上有一样东西时

用户选中一段字、拿起右栏的一条材料或看着一个对象时，工作台在它旁边给出几个下一步，名单从目录里读，没有按插件名的分支。插件声明一次：

- 对象读取器与页面的 `data-assistant-context`（见上节）：选中文字就有通用的下一步；
- 选区动作 `defineFragmentOffersAction` / 对象动作 `defineSubjectOffersAction`，选项可用 `places`（`main`、`side`、`assistant`）收窄出现的位置；
- 创建入口 `intake`：写在你的创建 command 的 `action` 上，名称、动词、说明、一到三条示例、接收选中文字的顶层字段 `material_field`；撤销沿用该动作的 `undo`，不写第二份；`effect: "proposes"` 只提交提案；
- 追加 `attach`：写在往已有对象里添加的 command 上，`item_kind` 只能是你自己有读取器的种类，`positions` 取 `cursor`、`selection`、`end`（落在光标或选区的写入入参必须有 `expected_version`）；
- 侧栏视图的 `objects`：这一格里能拿起的对象种类，每个都要有读取器。

这些声明在登记与 Manifest 解析时由插件开发包检查（`plugin-context-declarations` 用例写明每条报错原文）；不可撤回的动作不能声明为去处。仅本人可见的对象（个人范围）内容不进判断。写法、字段表与判例见 [选区与去处](../../skills/molis-plugin-dev/contextual.md)。

## 放在哪里：位置、关联与完成提示

对象存在个人空间还是某个项目、和哪项工作有关、谁能读取、做完后从哪里找回，由系统放置服务统一说明。插件要做的是：为展示的对象提供 `*.subject.read`（带 `open`）；能移动、复制的对象声明放置协议（`defineObjectMoveAction` / `defineObjectCopyAction`，只对本人）；能接收内容的做成工作流内容站；页面写 `data-assistant-context` 并留 `data-placement-slot`；新建、导入、导出、存固定版本后发 `molis:placement-result`。不要在插件里自己记“用于哪个项目”“复制自哪里”，也不要把内部动作写成交付。细则见 [放在哪里](../../skills/molis-plugin-dev/placement.md)，需求见 `specs/archive/work-placement/spec.md`。

## 调用模型：登记的指令

插件发给模型的要求（指令 Prompt）和 Agent 的角色 Prompt 一样，由 Host 统一登记，用户在设置“Prompt 与 Character”里能看到、修改、恢复默认，也能看到最近一次用的是默认版还是自己的版本。

- 在插件的 `src/prompts.ts` 用 `defineInstructionPrompt`（`@molis-ai/molis-work-contracts/platform/model-prompts`）声明，写明 `title`、`purpose`、`used_by`，从包入口导出 `<插件>_INSTRUCTIONS`。
- 调用时传 `instructed(指令, 数据)`：指令只写要求，用户材料、本次参数放在数据里（数据不会被当成指令）。模型端口类型写 `InstructedPrompt` 或 `ModelPromptInput`，不收裸字符串。
- Host 适配器经 `resolveModelPrompt` 取有效正文；插件不分内置还是安装的，都把指令放在自己定义的 `instructions`（`PluginDefinition.instructions`），运行时由 Host 登记，调用只能发送定义里带的指令（PG-051）。`builtin-instructions.ts` 的 `BUILTIN_INSTRUCTIONS` 只列平台自己的：Host 的 `system:*` 题面、插件创作台（平台能力，PG-051 Q2）与仍由 Host 承载的炼金术士。改指令正文要升 `version`，用户已改过的会显示“默认已更新”，不会被静默覆盖。
- Runtime 插件调模型用 `context.services.model`（沙箱执行的包不直接拿它，经 broker 的 `sdk.model` 用同一份：合同里声明 `effects.model`，请求只写自己登记的指令 id 和这次的数据，不带提示词文字，PG-017 P1、S-66；生成的插件还没有接上这条路，见 `specs/repository-anti-corruption/slices/pg017-sandbox-services.md` §4），不写宿主绑定文件：Manifest 声明 `model:invoke`（只列模型、问能不能用、不发请求的插件声明只读的 `model:read`，它只开 `choices()` 与 `availability()`）；`complete()` 只在插件自己的、声明了 `model:invoke` 且 `scheduling: "concurrent"` 的动作处理器里能调；传 `instructed(自己的指令, 数据)`，发送用户改过的版本；发出前、返回后宿主各问一次这次调用的 `beforeEffect()`，动作返回之后再调是 `actions.expired`。没有目录条目的插件在 `PluginDefinition.instructions` 里声明自己的指令（SDK 导出 `defineInstructionPrompt`、`instructed`）；有目录条目的内置插件仍在条目上声明；目录已经为某个主人登记了角色或方法而没有指令（Schedule、助理、Issues）的，也算有条目，`PluginDefinition.instructions` 对它启动失败。一个主人的定义只在一处。交给模型的材料（用户的文件、网页，含 `services.materials` 读到的）放在数据里，用 contracts 的 `fencedMaterials(材料, "MATERIALS_" + randomUUID())` 围起来：「不可信」声明写在代码里，用户怎么改指令它都在，指令里不再写这句（`@molis-ai/molis-work-contracts/platform/model-prompts`）。限额、错误码和不做的事见 [Prologue AI 手册第 4 节](PROLOGUE-AI.md)。
- 模型请求可带 `selection: { provider_id, model_id }`，可用性用 `services.model.availability(selection)`；明确选择失败不改用默认模型。仅指定已有目录项，地址、凭据和供应商配置仍由 Host 管理。
- `services.model.choices()` 只返回当前可用模型的名称与能力，不解密或联网。原图输入用 `images: [{ bytes, label? }]`，首次等待前复制，最多 50 张、单张 32 MiB、合计 128 MiB，不收路径或 URL；Host 临时副本和 SDK intake 各自清理。成功结果带真实 `execution` 回执和同步 `validateResult()`，失败及 JSON 解码失败在已有推理事实时也保留回执；未知用量保持未知。写业务前先 `await caller.beforeEffect()`，随后立即 `result.validateResult()` 再同步提交；失败记账用相同检查，不能借另一动作或新模型绑定提交旧结果。细节与示例见 Prologue AI 手册第 4 节。
- 门禁 `tests/prompt-registration.test.ts`：没登记的指令、收裸字符串的端口、绕开登记直接调模型的 Host 模块都会失败；确需过渡的写进清单并写明原因。
- 插件创作台生成的插件同样如此：要求在操作代码里 `export const prompts = [{ id, title, purpose, body }]` 声明，`model.generate` 传 `{ prompt: id, input }`；安装时登记、卸载时撤下（用户的修改保留）。检查 G4 会拒绝未声明的 id 和仍传 `instructions` 的调用。
- 设置“Prompt 与 Character”底部的“开发者诊断”列出每个来源登记了什么、哪些没有生效及原因，以及仍未登记的模型调用。

## 给其他 Agent 的方法（`methods`）

插件可以把本领域的做事方法（Skill）提供给助理和 Character 在业务工作里使用，例如 Pages 的“会议纪要整理”。

- 在 Manifest 的 `methods` 声明：`skill_id`、`version`、`name`、`summary`（何时适用），以及 `tools`。`tools` 只能是业务工具，即 `SKILL_TOOLS`：能力网关（find/read/change-capability、suggest-action），加上 ask-user、update-todo 等不碰目录的工具。校验不通过，Manifest 就无效。
- 正文放在包里（例如 `src/skills.ts` 导出 `AgentSkillDefinition[]`），标识、版本与 Manifest 一致；插件不分内置还是安装的，都把正文放在 `PluginDefinition.methods`，插件启动时登记，停用、卸载时收回，升级后登记新版本的（决定 #18，W4-02；`apps/local-host/src/plugin-instructions.ts` 的 `registerPluginAgentDefinitions`，用例 `tests/plugin-methods-runtime.test.ts`）。停用后，这个安装最近一次登记的角色、Prompt 与指令按「未运行」留在设置里（Host 重启后从 Home 的 `agent-declarations` 库恢复），让本人先看、先改；方法不再给别的 Agent；卸载才删（PG-051 Q1 b）。只按标识与版本给出正文；声明了但没有正文的方法不登记，开发者诊断里会说明。主人是平台自己登记的（助理、插件创作台、炼金术士）时，定义会被拒绝启动（一个主人的定义只在一处）；沙箱执行的生成插件不登记方法。
- 与 `agent.skills` 的区别：`agent.skills` 是插件自己的 Agent 用的方法；`methods` 给别的 Agent 用。
- 助理会在“可用的方法”里看到它（只列名称和适用说明），合适时读取正文照做；用户也可以用“/”直接选定。方法只对采用它的那一轮有效。插件停用后，方法就不再列出。
- 正文写步骤和边界，不要写死对象标识；需要改数据的步骤照常经 change-capability，由用户确认。

项目外部 MCP 配置由同一 Home 的 Prologue owner 保存；来源插件仅说明来历，关闭添加页或停用该入口不撤销连接。共同动作保留项目范围，按实际消费者权限调用，派出前复核原工作区与配置版本。持久认证只引用 Home Connector owner，不持久使用 SDK 进程内的凭据引用。连接启停独立于凭据，所有消费方尊重启用状态。

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

## 沙箱包格式与安装

上面 `pack` 打的是在 Host 进程之外自己运行的插件源码包。另一种包在 Home 里跑在**沙箱**里：代码是一个入口文件，界面由 Host 按声明画，不带任何页面脚本。它是公开格式，任何作者都可以做：创作台发布只是其中一个作者，Host 读它的代码里没有创作台的任何实现。类型在 `@molis-ai/molis-work-contracts/platform/plugin`（`SANDBOX_PACKAGE_FILES`、`SandboxPackageInterface`、`SandboxPackagePrompt`），沙箱合同的类型在 `platform/plugin-sandbox`。

包就是一个 `PluginPackageBundle`（`payload` + `signature` + `publisher_key`，签名方式同上），`payload.files` 恰好是下面五个文件，缺一个或多一个都不是这个格式：

| 文件 | 内容 |
| --- | --- |
| `manifest.json` | 与 `payload.manifest` 逐字段相同的清单 |
| `plugin.mjs` | 沙箱里运行的入口代码，不超过 8 MiB |
| `contract.json` | `SandboxPluginContract`：插件有哪些操作（读 `query`、写 `command`）、每个操作的输入输出 schema 和要的权限；`pluginId` 与清单的 `plugin_id` 相同；输入输出的对象 schema 都写 `properties`、`required` 和 `additionalProperties: false` |
| `interface.json` | `{ parts, nodes, presentation?, acceptance? }`：界面零件（`parts`，1–100 个）、每个零件选用的组件（`nodes`）、可选的整体呈现与验收步骤；零件读写的操作必须是合同里有的 |
| `prompts.json` | 数组（可为空，至多 64 项），每项 `{ id, title, purpose, body }`，`id` 为小写字母数字与连字符，`body` 不超过 8000 字 |

沙箱插件的清单只有一种形状：类型是应用（`kind: "app"`），入口 `./plugin.mjs`，权限只有 `storage:private`，一条 `POST /call` 路由，一个 `stage` 视图；作者能定的只有 `plugin_id`、`version`、`name`、`publisher`、`upgrade_compatibility`、`runtime`（只能写 `{ scope: "home" }`，见下）和 stage 视图的 `icon`（取值限平台图标集，即 SDK `/ui` 的 `PLUGIN_ICON_NAMES`；不写就画 `package`，写了集合外的名字，签名和预览都以 `plugin.declaration_invalid` 拒绝）。所以沙箱包不能声明常开、默认连线、默认输入组或本机目录，Host 也就没有这些东西要在安装时请人同意。

**集成包**（BL-530）：给 Feed 当来源的外部集成也是沙箱包，`payload.files` 只有 `manifest.json`、`contract.json`、`plugin.mjs` 三个文件，没有界面和提示词。清单是 Integration Plugin 的：`kind: "integration"`，入口 `./plugin.mjs`，权限只有 `storage:private`，运行范围写 `runtime: { scope: "home" }`（集成的来源是 Home 的，与 BL-628 的 Home 包同一条），没有路由和视图，作者另外写自己的一个连接服务和它的一个集成（`connection_services`、`integrations` 各一项，现在只收 `kind: "source"`）。平台请求表（`CONNECTOR_REQUEST_SERVICES`）里有的服务不写 `origins`，没有的必须写：一到八个正好是 `https://主机[:端口]` 的公开域名，带账号的请求只能发到这些来源（S-95）。合同只有平台定的操作，`kind`、输入输出 schema 和权限与 contracts 的 `SANDBOX_INTEGRATION_CONTRACT` 一字不差：`integration.health`、`integration.poll`，可选 `integration.account`；`errors` 和 `examples` 是作者的。拉取时插件经 `sdk.connections.request("source", …)` 用来源的账号，只能 GET 或 HEAD，这次调用结束就不能再用；游标是插件自己的文字，Feed 存着、下次原样交回。装的时候走与别的签名包同一条预览、确认：预览列出包写的来源，并拿包的插件 ID、服务 ID、集成 ID 对 Home 的集成登记查一遍，撞了内置或已装的就拒（`plugin.integration_declaration_conflict`，点名撞的 id 和占着它的插件），确认时再查一次。装上后代码在 Home 的沙箱实例里跑，它运行时登记才有它的来源；停用、卸载、发布者被撤销时它的 id 放掉，用它的 Feed 来源拉取得 `plugin.integration_unavailable`，人的连接记录和 Feed 来源都留着，再启用就接着拉。集成包不出动作、不进个人插件名单。设置页的服务卡片、粘贴凭据的新建连接读这个 Home 的集成登记，所以包声明的服务有它的卡片、能新建连接，卸载后卡片随之消失（人建好的连接记录留着）。

安装管理当前合同为 `plugins.install.preview@3`、`plugins.installed.list@2`：范围/来源与当前权限是各自输出的一部分，固定旧版本的引用须重新选择。两者只给本人，没有 MCP 工具；确认安装仍为 `plugins.install.confirm@1`。

**安装**：`molis-work plugin install <signed-package.json> <project-id> [--pin-as <发布者名称>] [--confirm]`，交给这个 Home 的常驻 Host 去做（没有常驻 Host 就停下，不在命令自己的进程里装）。不带 `--confirm` 只预览：Host 验证签名，按上面的格式读一遍，再说明装上它意味着什么（发布者、有没有被固定过、要的权限）；加 `--confirm` 才装。发布者还没被固定时，`--confirm` 要同时给 `--pin-as` 名称，这是本人对这个公钥的信任，之后这个发布者的包不必再取名；固定可以撤销，已撤销的发布者的包在预览就被拒。界面里是同样的两个动作（`plugins.install.preview`、`plugins.install.confirm`），只接受本人的操作，Agent、MCP、工作流和插件都调不了。

**拒绝**：包没有签名、内容被改、公钥不是清单里写的发布者，分别以 `plugin.signature_invalid`、`plugin.signer_mismatch` 拒绝；签名通过但不是上面的格式，以 `plugin.declaration_invalid` 拒绝，且发生在写入任何记录之前（固定的发布者、保存的包、安装记录都没有）。装好的包放在 Home 的 `plugin-packages/` 下，每次启动都重新验证签名和入口代码，被改过就不运行。从签名包装进来的插件：升级就是装它的更高版本的包（同一个发布者、清单的 `upgrade_compatibility.compatible_from_versions` 含当前版本，预览与确认照旧，数据保留）；停用、启用、卸载在项目设置的「插件」页，或经 `plugins.installed.{disable,enable,uninstall}@1`（只给本人）；回滚不支持，先卸载、再装旧的包。

## 可复现验证

构建后运行 `node --import tsx --test tests/plugin-sample.e2e.test.ts tests/plugin-package.test.ts`。前者从干净目录实际调用 CLI、安装本地 SDK tarball、运行两个独立进程并核对结果/历史版本/权限/目录边界；后者验证签名与篡改拒绝。其他 Host/Runtime 定向测试覆盖崩溃恢复、卸载失败撤权和不同签名数据隔离。整体前后端用户 E2E 仍在所有重组开发完成后单独执行。

## 异步动作与原调用授权

等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后调用 dispatcher 提供的 `caller.beforeEffect()`，再按原对象或配置版本提交。发起嵌套动作/场景时用 `retainActionAuthority(caller, originReference, caller.beforeEffect)` 保留外层执行检查（原动作就是正在执行的这个时不写 `provider_id`）；仅复查权限字符串不能识别同名提供方已被替换。来源同步另持有按数据库、项目和来源隔离的活动租约。失去授权时保留此前的未确认记录用于恢复，不补写失败记录或伪造成功。

提供方在 `action.execution` 声明执行事实：`timeout_ms` 是处理器开始执行后的等待上限，`cost` 为 `none` / `metered` / `unknown`，`max_calls_per_minute` 是同一 actor、项目、安装实例滚动一分钟内的接受次数。未声明费用保持 unknown；未声明时限/频率不自动加限。Kernel 对声明的时限与频率统一执行，切换用户、Agent、Workflow、MCP 或插件入口不能重置同一身份的预算。限额是当前注册实例的本机保护，不是跨进程计费账本；重启或重新注册会重置计数。

例如调用收费文字模型的能力声明 `execution: { timeout_ms: 120000, cost: "metered", max_calls_per_minute: 20 }`。声明不代替 `scheduling: "concurrent"`、权限或模型服务自己的预算。超时停止本机等待并中止传给处理器的 signal，外部副作用可能已经发生，不自动重试；每次异步等待后仍须调用 `beforeEffect()` 才能提交。同步阻塞代码无法靠 JavaScript 定时器抢占。Agent 可以使用更严格的入口时限；生成插件的 sandbox 依据共同目录选择时限和慢操作通道，费用未知不能显示成免费。老生成物只转换历史输入输出，模型和提醒执行仍走当前 ActionService。

记录要算在某个 Runtime 会话名下的写入动作声明 `authorship: "session"`（Goals 的写入都是）：经 MCP 调用时宿主要求客户端给出稳定会话，否则拒绝（动作服务在派发处检查，经包装动作发起的嵌套调用同样被拒），并把 `runtime:<客户端>:<会话>` 作为审计作者传进 `caller.audit_actor_id`。没有声明的动作，客户端有会话时同样带上，没有也照常执行。

生成式公开动作的费用是可能收费的声明，不是实际用量或预算。其沙箱 operation 时限从排队头开始，lane 频率按安装计数；公共 Action 时限从处理器开始、频率按调用者与安装计数。两者含义不同，不能直接复制沙箱限额到公共动作。实际依赖仍逐次受提供方的授权、时限和频率约束。

## 单次 AI 能力与 Host 取消

Coding 草稿、Cognia 知识生成等工具为空的调用使用 Home 共享推理入口；插件拥有提示词和领域校验，Host 拥有模型/凭据绑定。需要结构结果、执行引用、进度或 typed usage 时使用 `hostTextGeneration`，标准接线见 [Prologue AI 手册](PROLOGUE-AI.md) 与 [开发 Skill](../../skills/molis-prologue-ai/SKILL.md)。

Host Capability 可选调用参数 `signal` 由 Plugin SDK 传递给 Host invocation；取消只收紧本次操作，不授予任何身份/权限。`before_effect` 与原调用持续授权检查仍保留，不能用成功收到模型文字代替提交前检查。

Artifact 输入通知刷新当前投影，不是一次性业务命令。`onUpstreamReady(inputs, context)` 接到完整固定版本；异步读取后、更新投影前调用 `context.beforeEffect()`，并把 `context.signal` 传给可取消操作。Host 从领域已提交 journal 发现失效/归档并重新计算已有输入图；不可用版本不再投递，旧实例和旧输入的晚结果拒绝提交。新实例重新读取当前输入，不能把重启通知当成再次执行外部操作的授权。

Coding `run-updated` 与 Git `operation-updated` 是 v1 刷新提示：前者来自后台 Run 的停止/待核对状态，后者来自 Prologue 已核对的 Effect/dispatch 回执。失败和 unknown 保留原语义，不宣称文件修改成功。恢复历史不产生新执行通知；Files/Git 订阅后只让 Host 视图 revision 失效，页面重新读取原接口。提示丢失靠首次进入、重新连接时读当前事实恢复，不能据此自动重跑模型或 Git；可靠业务提交仍须其 owner 的事务/持久协议。

Runtime 插件用 `context.services.materials` 读取材料：Manifest 声明 `materials:read` 才有 `extract({ file_name, bytes }, options)` 与按上传文件批量读文档的 `readDocuments([{ file_name, data_base64 }], options)`（文本、Markdown、HTML、CSV、Word 等文档文件，返回名字、格式、内容、覆盖情况和警告，格式或体积不合格直接以 `material.*` 码拒绝），另声明 `materials:fetch` 才有 `readSource(url, options)`（只许公网地址）。`readSource(url, { allowedDomains })` 可以把整次读取限在最多 20 个精确的小写域名内：首个请求、每次重定向、来源的接口与媒体请求都只许这些主机，别的主机在查找和连接之前就以 `material.source.domain_not_allowed` 拒绝，列表不合格以 `plugin.materials_domains_invalid` 拒绝；不给就是所有公网主机。同在 `materials:read` 下还有 `imageTextAvailable()`，只回答本机能不能识别图片文字。声明 `materials:fetch_local` 才有 `readLocalPage(url)`，读本机 HTTP 页面：地址只是 `127.0.0.1`、`[::1]`、`localhost`，不带账号密码，宿主自己的端口不在内，重定向每一跳再查；没声明或没授权，本机地址仍然读不了。声明 `materials:original` 才有 `claimOriginal(recordKey)`、`readOriginal(recordKey, { maxBytes })`、`releaseOriginal(recordKey)`：用户导入文件时，宿主入口把那个文件的路径交给这一次路由请求，插件在导入的动作里用自己的记录键 `claimOriginal` 把它登记下来（插件拿不到路径，也给不出路径；不是宿主入口交来的导入调用一律 `plugin.materials_original_not_offered`），之后 `readOriginal` 只读这份登记，读之前宿主重新解析真实路径，与登记值不同（文件被换成符号链接、移走、变成目录）就拒，上限 32 MiB，不列目录、不写。登记按插件、安装和记录键存，同一个安装重装后仍在。升级预检没有这项服务；沙箱执行的包经 broker 的 `sdk.materials` 用同一份（操作的 `effects.materials` 写 `read`、`fetch`、`fetch_local`、`original`，`fetch` 读的网页主机还要写进该操作的 `networkDomains` 并由人批准，读取只会到这些主机，PG-017 P2、S-93）；调用必须位于自己安装、声明对应权限的并发动作。上传解析用 SDK `decodeMaterialUpload`（安全文件名、支持格式、规范 Base64、非空且最多 25 MiB），不再复制检查。公共材料提取遵守 `contracts/services/materials`：Host 负责 UTF-8/HTML、PDF worker、原生 OCR 与音视频进程；插件持有原件身份和业务引用。检查覆盖信息与容量截断，传递取消，在等待后复查执行权限。灵光和 onboarding 已共用提取口，媒体模型下载只有可信 user 调用且 `allowModelDownload: true` 才生效；agent、mcp、workflow、plugin 的 true 被忽略并按缺模型规则拒绝；生成摘要继续走 Prologue。

Shelf 的 PDF 预览与文字提取、OCR 同样走此端口。语言选项属于提取请求，逐行置信度来自 `pages[].lines`，不以页平均值代替；“待确认”、来源标题和不完整提示由业务组织。多选逐项处理。标准输入仍限 25 MiB，Shelf 由可信 Host 明确采用 32 MiB，不改变其他上传端限额。原调用撤权、取消或输入 hash 改变后不写成果或失败成果。

显式网页读取用同一合同的 `MaterialWebsiteReader`：Host 限制 HTTP(S)、跳转、总时限与解压后字节数，复用 HTML 提取；传递 signal / beforeDispatch，业务提交前仍需 beforeEffect 和来源版本检查。Shelf 只组织网页材料、链接与失败提示，Artifacts 只组织导入文档，不得互相导入解析实现。普通抓取失败可以按产品约定保留链接，取消或撤权不能退化成“成功保存链接”。

HTML 与 PDF/文档解析复用 Host 的可终止 worker 生命周期；不能只给网络阶段设定时器，却让畸形 HTML 在主线程无限解析。Artifacts 的异步 readHtml 保留原 HTML 与既有正文限额，解析后复核 beforeSave 和 signal；不要套用网页的部分正文策略。

Pages 的 prepareImport 是 Host 注入端口：公共 MaterialDocumentReader 负责 UTF 编码、ZIP/DOCX 和容量限制，插件的 preparePagesImport 只将公共正文转换为编辑器文档。预览和提交共用装配，解析等待后复核权限与取消，再沿原事务提交；批次损坏不能导致部分写入。

Builder 的截图评审把 presentation、design、host、unverified 问题分开：只有截图/目标有效、呈现属性受支持的意见进入有限自动修订，其余显示为未自动修改。合同示例的本地空存储规则同时检查 output 与 includes/outputIncludes/expect，矛盾在设计阶段返回，不交给代码 Agent 制造假记录。

工作台客户端首次打开时从原注册目录加载，UI 依赖由其 `clientAssets` 声明。Host 先保留原 surface 根、准备依赖，再调用 client factory；同一页面已打开的实例继续留存，隐藏只暂停其 UI 读取。客户端所需能力从注入的 Host 取，不依赖组合脚本的私有变量。设置与公共层叠沿现有 shell 提供。资源失败按钮只重载 UI，不能作为重新发出模型或副作用请求的依据。

### 跟随主区对象的侧栏与原线程助理回复

侧栏视图在现有 `ui.views` 声明 `slot: "side", context_binding: "focused-object"`。工作台依据当前焦点 pane 的对象上下文显示该入口，通过 `molis:side-context` 投递带递增 `context_epoch` 的对象标识、版本和未保存标记。侧栏启动发 `molis:side-ready`；已隐藏的面板不会因切换文档自动打开，用户选中的普通工具也不会被抢走。上下文只是展示定位，所有对象读写仍由提供方检查项目和权限。消息只接受已挂载的同源 frame；旧 epoch 的编辑请求被拒绝。

提供方用两条用户专属、项目范围动作声明 `action.thread_source: { role: "context" | "reply", subject_kind }`。同一提供方和对象种类只能有一个可用的读取入口与回复入口。context 查询接收 `subject_id, thread_id, message_id`，返回 `AssistantThreadContext`（文档与线程快照、截断标记、原用户消息）。reply 命令只接收 `subject_id, thread_id`，内容、作者和运行标识从可信的 `ActionCallContext.assistant_reply` 读取，业务输入不得提供这些身份。

宿主的 `assistant.threads.start/status/retry/stop` 统一管理执行与投递，使用同一个 Home 的 Prologue。普通评论不调用它；只有用户明确请求助理回复才发 start。保存评论与调用模型分别幂等，重试已完成的运行只重投递；正文仍由原插件独占管理。Pages 是第一项实现，动作与侧栏协议不要求助理导入 Pages。

评论上下文读取动作可接受用户明确提供的 `draft: { text, revision }`（公开类型 `AssistantThreadDraft`）：owner 先核对它的基准版本与当前对象权限，再返回带「未保存草稿」标识的上下文。它不授予写正文的权限，也不替换保存后的对象；未声明支持的 owner 不接收该可选输入。

Integration 的 `health()` 可返回非敏感的 `account: { login, account_id? }`。该字段只能来自本次已认证的服务身份响应；优先携带稳定账号 id，不从显示标签或 message 文案推断。Host 连接检查将它与当前配置修订关联，跨入口恢复等待据此防止自动换用另一账号；没有身份查询能力的服务保持账号未知。

连接的业务使用位置由消费方通过 `defineConnectorUsagesAction` 报告（contracts 的 `services/connector-host`）。输入是连接 id，输出是 owner 当前保存的使用位置、启用状态和已有业务动作引用及非敏感对象参数。共同目录按 `molis.connector-usages.input.v1` / `output.v1` 发现查询，由 `connectors.usages.read` 以原调用者权限汇总；没有宿主插件白名单和第二份绑定库。Feed 只返回当前项目来源，Images 返回原生图配置，Functions 返回使用当前绑定账号的已发布规则；模型配置不伪称所有文本动作都固定使用该账号。查询不调用业务操作，展示的操作仍按当前目录权限、作用域与可用性决定是否可用。


## 用本人的服务账号发请求（`services.connections`）

插件要以用户本人的身份读写某个服务（例如读 GitHub 通知），不自己存令牌，也不让人把令牌填进插件：Manifest 声明权限 `connections:use`，并在 `connections.slots` 里列出连接槽：

```json
"connections": { "slots": [{ "slot_id": "github", "service_id": "github", "reason": "读取本人的 GitHub 通知" }] }
```

`service_id` 只能是平台登记了的服务（`CONNECTOR_REQUEST_SERVICES`：GitHub、Gmail，目录里发到固定地址的服务，如 Google Calendar、Microsoft Graph 系、Notion、Slack、Discord、GitLab、Figma、Linear、ClickUp、monday.com；一项可以有几个来源，如 Cloudflare 的 API 与控制台；还有按租户分地址的 Salesforce、Jira、Confluence，地址是人连接时的那个租户站点，绑定后用 `describe(slot_id)` 读 `origin`；先用应用凭据换令牌的飞书、Lark、企业微信不在里面）；没有权限的槽、未登记的服务、多写的字段、重复的槽，解析 Manifest 时就拒（`plugin.declaration_invalid`）。槽绑哪个账号由人选（`connectors.plugin_slot.bind@1`，只对 `user` 开放，只认这里装着的、Manifest 里声明了这个按安装绑定的槽与服务；人在「服务连接 › 插件用的账号」里选）；没绑时请求照发，不带凭据。

一条记录一个账号（例如每个订阅来源各用一个账号）时，槽写 `"binding": "per_record"`：人在某个项目里为插件的一条记录选账号（`connectors.plugin_slot.bind@2`，只对 `user`，项目取调用上下文），插件发请求时写 `record_key`（至多 128 个字符，不含 `/`、`:` 和控制字符），只在本项目的调用里有效；`describe(slot_id, record_key)` 读有没有绑、账号显示名和状态，看不到是哪条连接；插件删记录时用 `release(slot_id, record_key)` 解除，之后这条记录的请求不带凭据。插件不能绑账号。不写 `binding` 就是按安装（`installation`）：一个安装一个账号，各项目共用。绑了 OAuth 账号的请求得到 401 时，宿主刷新一次令牌、把同一个请求重发一次；第二次还是 401 就原样交回，插件看到的只有 `status`，看不到令牌。

在本插件自己声明了 `connections:use` 的并发动作（`scheduling: "concurrent"`）里调：

```ts
const response = await context.services.connections!.request("github", { url: "https://api.github.com/notifications" });
// { status, headers, body, authenticated }
await caller.beforeEffect(); // 写业务记录之前
```

- 地址必须是该服务的固定来源；别的地址（没绑账号也一样）都是 `connector.plugin_requests.origin_refused`。按租户分地址的服务只能发到所绑账号连接时的那个站点（`describe` 给的 `origin`），没绑账号时不发；Jira、Confluence 的 OAuth 账号也照写站点地址，宿主转到 Atlassian 网关。
- 不能自己写 `Authorization`、`Cookie`、`Proxy-Authorization`、`PRIVATE-TOKEN`、`X-Figma-Token`、`Host` 与连接类的头，不带账号密码与片段；GET/HEAD 不带内容，内容不超过 256 KB；只读动作只能发 GET/HEAD。
- 绑了账号时宿主按该服务要的写法加凭据（多数是 `Bearer`；Discord 令牌 `Bot`、GitLab 令牌 `PRIVATE-TOKEN`、Figma 令牌 `X-Figma-Token`、Linear/ClickUp/monday.com 令牌不带前缀、Jira/Confluence 令牌 `Basic`），插件看不到凭据，`authenticated` 说这次带没带；绑的账号断开或不能用时拒绝（`connector.plugin_requests.connection_unavailable`），不改成匿名发。
- 不跟随跳转（3xx 原样交回，`location` 在头里）；返回的头只留内容类型、缓存、`link`、`x-ratelimit-*` 等固定的一组；15 秒超时，1 MB 上限；令牌过期的 401 原样交回。
- 只能在本实例自己的动作或保留的后台作业里用；`start`、路由、场景回调、别的安装的调用都拒（`plugin.connections_call_required`）。授权每次都重查，取消、撤权、停用后不发也不交回。
- 沙箱插件经 broker 用同一份客户端（`sdk.connections.request`、`describe`、`release`）：操作要在 `effects.connections` 里写出用的槽，人批准后才能用；查询操作只能发 GET/HEAD、不能 `release`；宿主的客户端再按上面各条查一遍（`docs/system/SECURITY-INVARIANTS.md` S-60）。

规则与拒绝测试见 `docs/system/SECURITY-INVARIANTS.md` S-57。

## 读人授权的本机目录（`services.directory`）

插件要读人指定的本机目录（不是项目工作目录），在 Manifest 声明 `directory:read` 权限，安装确认里照常列出。目录只能由人经宿主的系统选择器给出：插件页面向 `POST /api/host/directory-grants`（项目页走 `/projects/<id>/api/host/directory-grants`）发 `{ plugin_id }`，选中后拿到 `grant_id`，再交给自己的动作，动作里用 `context.services.directory.read({ grant_id, path, kind })` 按相对路径读（`kind` 是 `directory`、`text` 或 `bytes`，各有上限；链接、`..` 和目录之外的路径拒）。

授权一直有效，直到人在平台设置「本机目录」（`/settings/directories`）撤回；插件升级照用，卸载或删项目时撤掉（用户 2026-10-25 定，PG-049）。Agent、工作流、MCP 和插件自己的后台任务调到你的动作时也能读，但每一次读都记进那一页并通知本人，所以只在需要时读。目录被移走或换掉时读到 `changed`，请人重新选。插件自己的设置里可以放一个跳转：`/settings/directories?plugin=<你的 plugin_id>`。规则与拒绝测试见 `docs/system/SECURITY-INVARIANTS.md` S-83。

## Home 主人的私有文件树

插件在自己的 Manifest 里声明 `owner_files: { store_name, entries, read_permission, write_permission }`（PG-102，和 `databases.home` 一样写在 Manifest、不写在宿主条目上；读写权限和 `storage:private` 都要在 Manifest 的 permissions 里）。根目录沿唯一 HomeStoreRegistry 验证 owner；同一根可以同时放这个插件自己 Manifest 声明的库（`databases.home`，如 Images 的 `images/images.db` 与 `images/assets/`），但条目不能叫库文件（`<库名>.db*`）或分区目录 `projects`，别的插件的库、第二份 owner_files 不行；完整声明校验在受管开库之前完成。声明绑定宿主启动名单上的实际 definition 并深复制冻结：声明了文件却不在名单上的定义（装在名单之外的）启动被拒，码 `plugin.declaration_invalid`；项目插件声明文件被拒，双实例插件在项目里的那一半与 Home 那一半共用 Manifest、不拿服务；沙箱、升级预检不能获得服务。Shelf 用它。

`services.ownerFiles.stat/read/list(relative)` 在本安装正在执行的真实动作里需要动作和原调用者的读权限。`write(run)` 需要 command 和原写权限，等待原 `beforeEffect()` 后才给同步 writer；每个原语继续复核原调用、安装与取消，退出或 Promise 回调后 writer 永久失效。Writer 内读取沿写权限，不借新动作延长旧句柄。动作之外（`start`、`start` 里设的定时器、路由）没有原调用者可问，凭这个安装当前的授权决定：`storage:private` 加文件权限都在现行授权里才读写（与其他服务在动作之外的规则一致，`assertPluginActionCurrent`）；停用、卸载、撤权、停止之后不能写（停止后的调用静默失效，BL-411），别的实例的动作里、场景里一律拒绝。初始文件（Shelf 的示例）由插件在自己的 `start` 里写，不再有宿主启动钩子。新建文件和目录只有 Host 的用户可读写（0o600/0o700），`setAccess` 的只读是 0o400/0o500、读写是 0o600/0o700，不留组和其他人的权限位（V-30）。

路径是已声明顶层下的严格相对路径，可包含 Unicode；软硬链接、特殊节点和不安全子树均拒绝。create/copy 独占，replace 要已有文件；replaceFileAtomic 使用同目录独占临时文件，rename 前失败保留原字节并清本次临时文件。removeTree 先预检且不删除声明目录顶层。读写无额外32MiB限制，仍受运行环境字节上限约束。没有多文件事务、掉电持久或同 OS 用户并发替换父目录防护的承诺；同步成功后又抛错不会回滚此前合法写入。

## Home 消费者的模型配置、生图与项目清理

插件在自己的 Manifest 里声明 `model_configuration` 与 `image_generation`（PG-102，和 `databases.home`、`owner_files` 一样写在 Manifest、不写在宿主条目上；`storage:private`、`model:invoke` 和声明里的权限都要在 Manifest 的 permissions 里），分别得到 `services.model.configuration` 与 `services.imageGeneration`。服务只给宿主启动名单上的那个 definition 对象：声明了却不在名单上的定义（装在名单之外的）启动被拒，码 `plugin.declaration_invalid`；项目插件声明它们被拒，双实例插件在项目里的那一半与 Home 那一半共用 Manifest、不拿服务；沙箱和升级预检没有这些服务。配置声明固定 preference 文件、custom provider 和 read/save 动作；selection 只读取当前消费者的精确选择，read/save 只在对应设置动作中工作。配置可在模型不可用时修复，真实调用仍要求 model:invoke、并发动作及 beforeEffect，不将显式失效选择回退到别的模型。

生图服务提供 connections/inspect/bind/unbind/generate，命名空间与权限来自 Manifest 的声明；只读发现不解密或 pin 目标。连接、凭据及派出归 Host/Connector/agent-host，插件保留任务调度、业务记录与字节验证。generate 返回当次结果和不透明 revision；调用方在后续文件/任务提交前按这一 revision 再检查，不能读取新 revision 来替代旧结果的版本。模型/连接/安装授权变化后，成功与失败业务记录均不写入。

删项目时插件不被通知，也不跑自己的代码：平台在同一轮里先停掉它经 `services.background` 在这个项目里受理的执行和登记的作业（control 的 signal 中止，结果与失败都不交付），再删它的这个项目的数据，中间不 await。

插件在 Home 库里按 `project_id` 一类的列记项目的行时，在 Manifest 的 `databases.home` 写 `project_rows`（合同 `PluginProjectRowsDeclaration`）：确认框里的 `label`、可选的先后 `order`，和要删的表 `tables`。每张表写 `table` 与记项目的 `column`；子表只记父表的键时写 `parent`（写在它后面、自己不带 `parent` 的一张表）和父表的键 `key`（默认 `id`），删的是父表里属于这个项目的那些键对应的行。行里记着插件自己文件的名字时写 `files`：每项是 `tables` 里一张不带 `parent` 的表、存名字的列（JSON 数组，元素是文件名；元素是对象时用 `key` 指出名字所在的字段）和 `owner_files` 里声明的一个目录（`directory`）。平台在同一个事务里先读出名字、再删行，提交后从那个目录删掉这些文件：只删名字是一段普通文件名、在那个目录里的普通文件，链接、文件夹、特殊节点、有多个硬链接的文件和带 `/`、`..` 的名字都不碰。平台照声明拼 `DELETE` 语句，只对这个插件自己的库、用宿主自己的连接、在一个写事务里删；实例正在写时等它（`busy_timeout`），等不到这一步留 pending，下次重试；库还不存在就不建。声明只能点这个库的 schema 建的表和列：SDK 查形状（小写标识符、不带库名），平台按建好的 schema 查列，不对就启动前拒绝，码 `plugin.declaration_invalid`。不能和 `partition: "project"` 同写（按项目分库的整份删）。不是内置的插件，确认框里的标签照原文显示在插件名后面，不翻译。沙箱插件暂不能声明，写了启动被拒（BL-619）。按项目分库的插件，平台关掉这个项目的库再删掉它。项目只是关闭时，项目实例随项目停；Home 实例在这个项目里的作业也停，它受理的有限执行照旧带着原调用的授权。不经 `services.background`、自己在内存里另起的工作删项目时没有人去停，所以等模型或外部服务的工作要经它受理或登记。停用、卸载后没有运行实例时，平台照同一份声明删；插件不提供清除代码，目录条目上也没有 `project_data`（PG-024）。

非流式路由的 bytes 默认作为附件。PluginRouteResponse 可显式给 disposition 为 inline 或 attachment；Host 只保留 image/png、image/jpeg、image/webp，其他 MIME 强制 octet-stream 附件。nosniff、sandbox、no-store 始终由 Host 设置，插件不能覆盖。HTTP 项目来自已核对存在且显示该插件的路径，query/body 不授予身份。

### 打包的插件客户端公共类型

Todo 与 Form 的浏览器工厂使用 `@molis-ai/molis-work-contracts/platform/ui` 的 `UiPluginClientHost`，宿主构造同一类型，插件用 `Pick` 取实际消费的字段。`UiClientTranslate`、`UiClientScope` 与 `UiRequest` 形状由合同提供；全局 `molisWorkRequest` 仅在 Plugin SDK 公共入口声明，浏览器文件以类型导入纳入；作用域请求在卸载时取消，迟到结果被拒绝。宿主从 Manifest 提供展示身份 `pluginId`，`pluginRoute(path)` 拼当前项目与插件路径，`route(path)` 保留平台路径语义；这些展示字段不授予权限，父框架仍用可信安装与页面授权。源码中的 DOM 类型作为泛型参数，contracts 不依赖 DOM 或私有实现。现有问卷卡通过 `UiPageInteraction` 返回读取、报错、聚焦和销毁操作。

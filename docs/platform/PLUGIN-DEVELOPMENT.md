# 本地 Plugin 开发

写一个插件时，先按 [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md) 走完整路径：对象与时刻 → Manifest → UI/客户端 → HTTP → 现场动作 → 判断场景 → MCP → Artifact / 事件 / ports → 按 kind 接到 Host 或 CLI。本文件是命令、MCP 登记、动作录取和打包的手册，不替代那份顺序。Host 装配见 Skill 的 `host.md`，SDK/CLI 见 `authoring.md`，接入见 `integrations.md`。

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
- `artifacts`：publish 个人内容、按 id + version read；由 Host 绑定项目、用户、生产者。通过 Artifact type/schema 互通，不要求指定哪个插件生产。
- `ui`：注册 Manifest 声明的自身 contribution，由 UI Host 检查挂载格式，停止后撤销。

这些是公开 Contract，不向作者开放 Store、SQL 或其他模块内部路径。缺权限、停用的旧上下文和未声明的类型/界面贡献都会被实际 owner 拒绝。本样例不请求网络、不自动 Team 分享；分享仍是用户明确选择的业务操作。

嵌入式测试使用 `@molis-ai/molis-work-app-local-host` 的公共 `runPluginDevelopment(input, options)`：输入是已授权的源码目录、项目/用户、grants；options 注入真实 Artifact owner、UiHost、Plugin Runtime repository 和私有存储工厂。它与应用命令使用同一安装/运行/卸载实现，返回 `PluginDevelopmentResult`，不要求导入仓库测试文件。数据库装配属于应用 Host，不属于 SDK 或 CLI。CLI 的 `PluginCliHost.runDevelopment` 是具名的注入接口，不是任意方法总线。

## 对外 MCP

Molis Work 对外只有一个 MCP 进程：`molis-work-mcp`。插件不要自己开 MCP 端口，也不要新开 MCP 包。你登记「我能贡献哪些方法」；人在用户设置 → MCP 决定打开哪些；Host 合成一份目录、盖正式名、注入身份后再调你。

`agent.mcp` 是反过来的：插件里的 Agent 能不能去调外面的 MCP。不要拿它当对外贡献开关。

### 作者要做的

1. Manifest schema 2 写 `mcp_exports`。每条只要：`tool_id`（插件内唯一，`[a-z0-9][a-z0-9-]*`）、`description`、`input_schema`（`type: "object"`）、`effect`（`read` 或 `write`）。可选 `audience`（省略 = `runtime`）、`scope`（省略 = 当前绑定项目必须启用本插件）。
2. 不要写 `enabled`、不要写对外正式名、不要在 `input_schema` 里放 `board_id` / `database_path` / `web_base_url` / `actor_id` / `actor_kind` / `runtime_actor_id` / `submitted_session_id`。身份由 Host 注入。`mcp_exports` 会自动进行为总表，`behavior_id` 就是公开工具名，`subject_kinds` 是 `mcp_invoke`；不要再为同一个工具写一条 `behaviors`。
3. 公开名由 Host 盖：`molis_work_v1_<短名>_<tool_id>`。短名是项目插件 id（Functions 是 `functions`），不是你在 Manifest 里拼出来的。
4. Handler 只认 `{ tool_id, arguments }`。未在 Manifest 登记的 `tool_id` 即使代码里有实现也到不了。
5. 新贡献默认关。人在设置里打开后，**之后新开的** MCP 连接才看得到；已打开的连接不会热刷新。不要把开关做进插件自己的 `settings-page`。
6. 个人、不绑项目也能用的方法标 `scope: "home"`（Functions 三项就是这样）。项目能力保持默认 `scope: "project"`。个人插件但内容按当前项目分区的（Pages / Forms / Dataset / PPT）不要标 home；Host 从绑定连接注入 `project_id`，schema 里不要出现它。未绑项目时这些方法不进 list/call。

对照：[`plugins/native/functions/src/mcp.ts`](../../plugins/native/functions/src/mcp.ts)（`scope: home`）和 [`plugins/native/form/src/mcp.ts`](../../plugins/native/form/src/mcp.ts)（个人插件、项目分区）。类型从 `@molis-ai/molis-work-plugin-sdk` 再导出。

### 两种兑现方式

**Native（现在的 Functions / Pages / Forms / Dataset / PPT）**：构建期装配。除了 Manifest 和按 `tool_id` 的 handler，还要在 [`apps/local-host/src/mcp-native-plugins.ts`](../../apps/local-host/src/mcp-native-plugins.ts) 加一条：来源从 Manifest 读，`createAdapter` 接到插件包，`default_enabled` 默认 `false`（只有从旧静态目录迁过来的 Functions 三项是 `true`）。

**运行时托管 app 插件**：`start()` 返回 `contribution.mcp`，`tool_id` 必须和 Manifest 一一对应。Plugin Runtime 启动时会校验，缺一条或多一条都是启动失败。生产 `tools/call` 还没有把这类插件接到 Runtime；在 Host 接上之前，不要给 Coding 等产品插件填 `mcp_exports`。

### 不要做的

- 新开 MCP 进程、MCP 包，或在 `apps/mcp` 的 tool-catalog 里写死插件工具。
- 在 `LocalMcpServer.callTool` 里按公开名写 `if`。
- 复用 `agent.mcp`。
- 把 MCP 开关和「AI 与执行工具」做成一页。

Host 侧改哪里、调用链怎么走，见 [CLI 与开发 · 对外 MCP](../cli-and-development.md#对外-mcp)。协议与 Runtime Skill 仍以 [MCP 接入](../mcp.md) 为准。

## 事件去向的动作名单

Functions「用在哪」里，首页 / Inbox / Feed 是事件去向：判断只许建议人去点哪颗已有按钮，不许自己改数据，也不许在现场长出新按钮。Agent 去向才放「能调、但不长在这张卡片上」的动作（含 MCP 写工具）。

**判断能选的动作，是人正盯着这个对象时、已经能点的下一步处置。不是插件所有能改数据的事。**

一个动作要出现在某个事件去向，四问都要过：

1. **现在盯着的就是这个对象吗？** 看的是这封邮件，不是这个来源的设置页。
2. **这颗按钮现在就在这个画面上，点了真会发生吗？** 没接线的写最多进 Agent，不进首页 / Inbox / Feed。
3. **它是「这件事接下来怎么处理」里的选项吗？** 进 Inbox、存起来、变成 Goal、忽略、做完了——是。打开看看、说一句、重新打开、标已读——通常不是，那些常驻或留给别的时刻。
4. **AI 选中它，只是建议人去点，不会自己写吗？** 自己执行的写放到 Agent。

四问都过：写入该去向的 `function_scenes` 行为池，并在 Manifest `behaviors` 声明（公开名 `{插件短名}.{behavior_id}`，与系统已有 id 撞号时沿用系统项）。  
1、2 过、3 不过：画面上留着，不给判断挑。  
只有插件能写、这画面没有这颗按钮：最多给 Agent。  
没有「对象到来 / 点开这件事、从几颗处置里挑一个」这种时刻：不要新开「用在哪」一行。

现有事件去向：

| 去向 | 何时 | 进池的处置 | 不进池 |
| --- | --- | --- | --- |
| `home.dock` | 点开首页事件 | 接着做、做完了、忽略、重新授权、问问怎么回事、打开 | 说一句（永远在）；MCP |
| `inbox.next` | Inbox 新事项 | 做完了、忽略 | 查看原消息、重新打开 |
| `feed.capture` | Feed 消息到来 / 详情处置 | 加入 Inbox、保存为资料、升格为 Goal、忽略；`feed.open` 只用于映射「留在 Feed」，不画成 footer 按钮 | 打开原文、标已读、恢复、来源设置 / token / 计划 |
| `agent.mcp` | 给 Agent 调 | 行为总表（含 MCP） | 不画进首页 / Inbox / Feed 卡底 |

### 判例

- **Feed 详情四条去向**进 `feed.capture`。详情已经能点，且互为「这条消息接下来去哪」。
- **打开原文、查看来源**不进池。人已经在看这条消息；那是导航，不是处置。
- **说一句**不进首页池。规定永远在，判断不能把它藏掉。
- **Inbox 重新打开、Feed 恢复**不进池。那是历史条目上的反向动作，不是新事项到来时的下一步。
- **来源立刻拉取、改计划、存 token、重新授权出现在来源页时**不进 `feed.capture`。对象是来源，不是这条消息。`feed.reauth` 只因为首页事件卡上已经有这颗按钮，才进 `home.dock`。
- **Pages / Forms / Dataset / PPT 的 create、update、promote** 走 MCP，进 Agent。它们的工作台是编辑工具，不是「一条外来消息该去哪」。
- **GitHub `whoami`、Connectors 连接/断开**在设置页，进 Agent 或设置，不进 Feed / Inbox。
- **Goals 采用/退回方案、灵光丢掉/分发**是对象上的处置，但今天没有 Functions 事件场景（判断何时跑、建议如何亮按钮都未接线）。先不要新开去向行；要进 Functions 时另写场景和接线，不塞进 Feed / Inbox。
- **标已读、目录筛选、保存演示配置**不是下一步处置。

插件作者改 Manifest 时：先给现场接好点击路径，再声明 `behaviors`，最后才把 id 放进某个 `function_scenes` 的池。只声明能写、现场没有按钮，函数页会建议一颗点不了的动作。现场池的合同入口是 `packages/contracts` 的 `sceneBehaviorIds` / `defaultFeedCaptureBehaviorIds`；Host 合成总表见 `apps/local-host` 的 `behavior-catalog.ts`。新去向不会从 Manifest 自动出现在 Functions「用在哪」，完整接线见 Skill [host.md · 接到 Functions](../../skills/molis-plugin-dev/host.md)。需求书：[事件去向的动作范围](../../specs/archive/function-scene-action-scope/spec.md)。整插件怎么排顺序、MCP/事件/UI 怎么一起考量： [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md)。

## 打包与签名

`molis-work plugin pack <source> <bundle.json>` 只包含 package.json 的显式 files 以及 package.json/manifest.json，拒绝目录跳转和符号链接；不执行安装脚本、不自动收集依赖。样例运行依赖同版本的公开 SDK 分发包，bundle 本身不是独立安装器。JSON bundle 上限 64 MiB，输出文件不覆盖已有文件。

对真正要签名的包，先用 `molis-work plugin identity <public.pem>` 取得 Ed25519 公钥绑定身份，作为 create 的 binding-signature；再 pack。`sign <bundle.json> <private.pem> <signed.json>` 必须显式指定私钥文件，身份须与 Manifest 一致。`verify <signed.json> <trusted-public.pem>` 使用调用者信任的公钥校验全部包内文件与 Manifest；没有签名、内容被改、发布者不符都会失败。也可用 Runtime 的 `PluginPackageSigner` 对接发布环境，避免把密钥暴露给应用。

签名只证明内容和发布者身份，不代表官方审核；验证 bundle 不授权执行另一份源码目录。示例中的 local-development-binding 不具备密码学签名含义。本轮测试只使用新生成的临时密钥，没有接触用户密钥或发布 registry。

## 可复现验证

构建后运行 `node --import tsx --test tests/plugin-sample.e2e.test.ts tests/plugin-package.test.ts`。前者从干净目录实际调用 CLI、安装本地 SDK tarball、运行两个独立进程并核对结果/历史版本/权限/目录边界；后者验证签名与篡改拒绝。其他 Host/Runtime 定向测试覆盖崩溃恢复、卸载失败撤权和不同签名数据隔离。整体前后端用户 E2E 仍在所有重组开发完成后单独执行。

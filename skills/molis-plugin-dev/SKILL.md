---
name: molis-plugin-dev
description: Designs and implements complete Molis Work plugins—Manifest, plugin-stage or island/stage UI, HTTP, browser client, Host wiring, behaviors, function scenes, MCP, events, artifacts, ports, upgrades, agent, SDK/CLI, and integrations. Use when creating or changing a plugin, native/app/integration plugin, connector, MCP exports, behaviors, function_scenes, plugin-stage, catalog, plugin upgrade compatibility, or plugin platform contracts.
---

# Molis Work 插件怎么写

先想清楚人盯着什么、那一时刻能做什么，再声明 Manifest，再按 kind 接到产品或 Runtime。不要从 MCP、事件或判断函数起笔。

命令原文、MCP 登记细则、动作四问判例、打包签名：仓库 `docs/platform/PLUGIN-DEVELOPMENT.md`。合同变了，同一任务更新本目录和那份手册。

## 读哪份

| 要做的 | 读 |
| --- | --- |
| 字段词典 | [elements.md](elements.md) |
| 画面、槽、客户端 | [ui.md](ui.md) |
| 接到本仓库产品 | [host.md](host.md) |
| SDK / CLI / 存储 / 测试 | [authoring.md](authoring.md) |
| 外部世界、OAuth、secret | [integrations.md](integrations.md) |
| 抄哪个现有插件 | [examples.md](examples.md) |

本仓库开发时 `.cursor/skills/molis-plugin-dev` 已指向这里。装到别的 Agent：见文末「安装」。

## 先问这四句

1. **人在看什么对象？** 一条消息、一份文档、一个来源、一个 Goal。不是「整个系统」。
2. **什么时刻？** 点开插件、一条新进来、点开一行、Agent 要动手。
3. **点下去发生什么？** 改状态、打开、写出 Artifact、调外部。事实归 Module，不要插件第二张业务表。私人库（本机文档）可以。
4. **还要给谁用？** 只给人点 → UI + HTTP + 客户端。也要给 Agent → 再加 MCP。要消费判断 → 声明 `action_scenes` 并兑现触发、绑定与消费；建议按钮仍需真实点击实现。要通知别的插件 → 事件。要拉外部世界 → integration。

答不出就停在方案，不要先铺 Manifest 空字段。行为或 UI 有变先写 `specs/{slug}/spec.md`。

## 选 kind 和家族

| kind | 何时 | 现在 |
| --- | --- | --- |
| `native` | 一等产品入口，**构建期**装配 | Feed、Inbox、Goals、Pages、Functions、灵光… |
| `app` | Plugin Runtime **真的** `start()`，兑现 views/routes/mcp/behaviors | Coding、Files、Git、Diff、Text stats |
| `integration` | 外部世界 → Connector / Signal | GitHub、Gmail、RSS、YouTube、Catalog、Web Query |

没跑在 Runtime 里就不要标 `app`。插件不 import 另一个插件的 implementation。

抄最近的同类，不要混抄：

| 人盯着的 | 家族 | 对照 |
| --- | --- | --- |
| 外来消息的下一步 | 舞台列表+详情 | Feed、Inbox |
| 正在编的文档/表/问卷 | 本机创作 | Pages、Forms、Dataset、PPT |
| 判断该亮哪颗按钮 | 写判断 | Functions |
| 还没想清楚的一条 | 岛 | 灵光（`island`） |
| 到点跑任务 | 定时 | Schedule（native + agent） |
| 工作区文件/对比 | 端口图 | Text stats（最小）、Diff、Files、Git |
| Agent 写代码 | Runtime app | Coding |
| GitHub 通知 | 接入 | GitHub；有 OAuth 再看 Gmail |

## 按这个顺序写

不要跳。用不到的块省略，不要预埋。

1. 对象与时刻（上面四问）。
2. Manifest 身份：`schema_version`（产品插件用 2）、`host_api_version`、`plugin_id`、`name`、`version`、`kind`、`publisher`、`entrypoints`、`permissions`（每条带 reason）、`requires`（每条同时写入 `capabilities.consumes`）。权限只写真会用的。
3. 个人还是项目：本机创作/函数/置物架/灵光在 catalog 标 `personal`；Goals/Feed/Inbox 按项目启用。
4. UI 槽 + contribution。槽只有 `navigator` | `stage` | `settings` | `island`。列表详情用 `renderPluginStageShell`。视觉、客户端：[ui.md](ui.md)。
5. HTTP：第三方走 Manifest `routes`，Host 挂 `/api/plugins/<plugin_id>/`。一等 Native 由 Host 注入短名路径（`/api/feed/`、`/api/pages/`），插件包自管 route table。未声明/未接线的路径到不了插件。
6. 浏览器客户端：Pages 族在插件包 `CLIENT_FACTORY_SCRIPT`，Workbench pack 注入。Feed/Inbox 的点击在 `apps/workbench/src/scripts/client/navigation-*.ts`。只出静态 HTML 不够。
7. 注册 `actions` 和实际处理器，让 UI、编排和授权 MCP 共用同一实现。旧页面的 `behaviors` 只保留已能点的处置，不替代执行合同。
8. 消费判断：注册 `action_scenes`，按 [host.md](host.md#接到统一判断场景) 兑现真实绑定、上下文准备和结果消费。兼容场景来自合同，使用位置来自真实配置；新增场景不再修改 Host 白名单。Functions 业务归系统模块，旧独立编辑器仍在迁移。
9. 对外调用：新注册动作按 `audiences` 和真实授权进入共同 MCP 目录，不另写业务处理器或工具总表。旧 `mcp_exports` 只用于存量兼容入口。schema 不接收可信身份；声明 mcp 入口不授予权限。外部客户端授权管理仍在迁移。
10. Artifacts：可保存、同步、按类型消费的内容。判断记录不是 Artifact。新类型先写合同，再 `produces`。
11. 插件事件总线：只给 **Runtime 托管的 app**（Coding 族）。Native 今天没有这条总线。id 放合同，发布用 `services.events.publish`，接收写 `onEvent`。不要和 Functions「事件去向」、Integration 的 Signal 混在一起。
12. ports：只在已有真实 Artifact 类型可连时声明。可选口用 `optional: true`。Diff 用 `input_groups`。上游到齐走 `onUpstreamReady`。缺绑定不挡启动。产品里还没有连线页。细则 [elements.md](elements.md)。
13. `agent`：Agent 驱动才加。Schedule 是 native 带 agent；Coding 是 app 带 agent。提示词正文还要进 catalog，见 [host.md](host.md)。`agent.mcp` 不是对外贡献开关。
14. Integration：外部协议 → Signal / Feed。账号设置挂 `workbench.settings`；来源任务留在 Feed。
15. 接到运行处：本仓库产品走 [host.md](host.md)；仓库外样例走 [authoring.md](authoring.md)。**Manifest 写完不等于能看见。**
16. 发布新版本时递增 `version`，再按数据格式声明精确的 `upgrade_compatibility` 来源版本。直接兼容与可迁移来源不同；不要为未验证的旧版本声明兼容。细则见 [elements.md · 版本升级](elements.md#版本升级)。

## 要素怎么选（别全要）

| 人要的 | 用 | 不要用 |
| --- | --- | --- |
| 侧栏一级入口 | `ui.views` slot `navigator` + plugin-stage | 第二栏 dashboard、自绘壳 |
| 不占侧栏的工具面 | slot `stage` | 硬塞进导航 |
| 项目卡片上方的岛 | slot `island` | 当成普通插件条 |
| 当前项目关联目录 / 浏览目录 | `projectSettingsCapabilities`，Manifest 按项 consumes | 读其他插件 storage、Workspace ports、传 project_id |
| 本机偏好 | `settings-page` → `workbench.settings` | 把 Feed 账号做成全局设置 |
| 点按钮改数据 | HTTP + 已有 Module API 或私人库 | 抢 Module 的业务表 |
| 判断亮哪颗按钮 | 真实场景 → action_scenes → 绑定与消费 | 只声明标签，或再加 Host 去向白名单 |
| Agent 做同一件事 | 共同 actions 目录和授权调用 | 重复 handler / 写死 tool-catalog |
| 给别的插件打招呼 | 仅 app：`events` + `onEvent` | 给 Native 抄 `events:` 块；把正文塞进事件 |
| 留下可打开的结果 | `artifacts.produces` | 用 Artifact 当页面 RPC |
| 消费别人产出的类型 | `ports.inputs`（Text stats） | 指定生产者插件 |
| 拉外部世界 | integration + Signals/Feed | 在 native 里写死 provider |

## 接到哪里（写完声明立刻看）

- **一等 Native**：workspace 包 + catalog + Workbench pack + Host HTTP（+ 可选 MCP / Functions / i18n）。清单：[host.md](host.md)。
- **一等 app**（Coding 族）：`createXPlugin` + Host `start()`（`coding-surface.ts` 一类），`start()` 必须兑现 Manifest 每一条 view/route/mcp/behavior。
- **integration**：`definePollingIntegrationPlugin` + Connector Host；OAuth/secret 见 [integrations.md](integrations.md)。
- **第三方 / 本地样例**：`molis-work plugin create` → `validate` → `dev` → `pack`。今天脚手架是 integration 样例，不是产品侧栏插件。

## 禁止

- import 另一个插件的 implementation 或 Module Store。
- 在 `LocalMcpServer.callTool` 按公开名写 `if`，或在 `apps/mcp` tool-catalog 写死插件工具。
- 把 Feed 账号、Inbox 列表做成全局设置页。
- 仅声明 `action_scenes` 而没有绑定、触发和消费处理器，或继续扩充旧 Functions 去向白名单。
- 给 Native 插件抄 `events:` 块指望投递。今天只有 Coding 族的 `createPluginPlatform` 在跑总线。
- 为未发生的失败预埋兼容层；为「以后可能有」声明空 ports / 空 MCP。
- 用低等级证据宣称可发布。改了可见 UI：浏览器把主路径点一遍。

## 改平台时更新本 Skill

下列任一变了，同一任务更新本目录与 `docs/platform/PLUGIN-DEVELOPMENT.md`，并补判例或反例：

- Manifest 字段、kind 语义、permissions、视图槽
- MCP 对外协议、`agent.mcp`、闸门/scope
- behaviors / function_scenes / 动作录取
- 当前项目设置的具名读取能力与按项授权
- 插件 Manifest 升级兼容声明、升级预检或市场升级入口
- 插件事件、ports、Artifact 交换
- UI Slot、plugin-stage 壳、Design System 硬规则、客户端装配
- native / app / integration 的 Host 接线位置（含 Functions 去向表、`createPluginPlatform`）
- Plugin CLI / SDK `start` 兑现规则

只改实现、合同没变：不必改 Skill。合同变了只改代码：任务没完。

## 安装

本目录随 npm 包和 `molis-work install` 发布，**不会**随 Runtime 接入自动挂到 Codex / Claude。`goal-advance` 才是推进 Goal 的协议。

```bash
ln -snf "$HOME/.molis-work/<release>/skills/molis-plugin-dev" "$HOME/.cursor/skills/molis-plugin-dev"
```

`<release>` 来自 `~/.molis-work/config/installation.json` 的 `release_path`。npm 包在 `node_modules/@molis-ai/molis-work/skills/molis-plugin-dev`。

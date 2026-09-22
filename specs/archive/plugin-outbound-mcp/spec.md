# 插件对外 MCP：登记、人开闸、Host 合成目录

完成等级：**3 功能可用**。不宣称可发布。不做 Molis Assistant 产品。

## 背景目标

后续 Molis Assistant 要调插件能力。对外仍只有一扇门：`molis-work-mcp`。插件登记自己能贡献的方法；人在全局设置决定打开哪些；Host 合成一份目录并盖身份。插件不自己开 MCP 进程。

## 当前行为与问题证据

- 目录写死在 `apps/mcp/src/tool-catalog.ts`：`V1_TOOLS + EVENT_TOOLS + CONTEXT_TOOLS + FUNCTIONS_TOOLS`。
- Functions 的 list/describe/invoke 是 Host 特例：schema 在 `apps/mcp/src/functions-tools.ts`，handler 在 `apps/local-host/src/mcp-functions-tools.ts`。`plugins/native/functions/src/manifest.ts` 只有身份和 UI，没有对外工具登记。
- `agent.mcp` 是布尔值，方向是「插件里的 Agent 能不能去调外部 MCP」，不是对外贡献。没有任何产品 Manifest 填写它。
- 全局设置：外观 / AI 与执行工具 / 规划方法 / 诊断。AI 与执行工具只接入 Runtime，不管对外方法开关。
- Runtime 工具参数不能填 `board_id` / actor；身份由 Host 注入。Functions 三项挂在 Runtime context 面，不要求已绑项目。

## 范围

1. Manifest 新字段 `mcp_exports`：本地 `tool_id`、说明、输入 schema、读或写。不登记开关，不登记正式对外名。不复用 `agent.mcp`。
2. Host 盖名：`molis_work_v1_<plugin>_<tool>`。`<plugin>` 用项目插件短名（Functions → `functions`），以保持现有 `molis_work_v1_functions_list` 等名字。
3. `tools/list` 与 `tools/call` 同一闸门：全局开关、audience、身份注入、项目启用 ∩ grant。关了的方法 list 无、点名 call 拒。
4. 用户设置新开「MCP」页，按插件（平台一组、各插件一组）勾方法。偏好写 `{home}/config/mcp-tools.json`。Host/Workbench 拥有该页，不进 Functions/Shelf 的 `settings-page`。
5. 默认：现有平台工具默认开，可关。Functions 三项迁过来后仍默认开。之后新的插件贡献默认关。
6. 第一刀把 Functions 三项从静态目录迁到 `mcp_exports` + 插件 handler。Goals / 事件 / context 仍留在 `apps/mcp`。
7. 连接在 `initialize` 时冻结启用集合；不发 `tools/list_changed`。改开关只影响之后的新连接。`initialize` 若宿主已有稳定 Session 且该 Session 已绑定项目，先恢复连接再冻结，这样重连后项目作用域贡献能进 list；未绑仍不进。
8. 随后把已有、可独立调用的 native 个人插件挂上同一套登记：Pages / Forms / Dataset / PPT。默认关。数据按绑定 `project_id` 分区；`project_id` 由 Host 从连接注入，不进 schema。

## 非目标

- Molis Assistant 产品、把 Goals 改成插件贡献。
- Coding / Files / Git / Diff / Workspace / Text-stats：生产 `tools/call` 尚未接到 Plugin Runtime，不要填 `mcp_exports`。
- Feed / Inbox / Schedule / Shelf / Work / Artifacts：没有与 Functions 同级的本机 store 入口，本切片不包一层 Host 服务当 MCP。
- 改 `agent.mcp` 语义；把 MCP 开关和「AI 与执行工具」做成一页。
- 新开 `modules/mcp`、`horizontal/mcp`、每插件一个 MCP 包或进程。
- 宣称可发布；更新受保护 `main`；提交除非另说。

## 使用场景

1. Functions Manifest 登记 `list` / `describe` / `invoke`。默认开。Runtime `tools/list` 仍能看到这三个名字，调用仍走现有判断库，不另起进程。
2. 用户在设置 → MCP 关掉 `functions_invoke`。已打开的 MCP 连接清单不变；新开连接后 list 没有它，点名 call 返回权限拒绝，不是 handler 内部错误。
3. 未在 Manifest 登记的 `tool_id` 即使 handler 里有实现，也到不了。
4. 项目作用域插件未在当前绑定项目启用时，其贡献对该连接不可用。Functions 是个人插件且 `scope=home`，不要求绑项目。Pages / Forms / Dataset / PPT 也是个人插件，但 `scope=project`：不要求出现在项目启用名单，必须已绑项目，内容按该项目分区。
5. Goals / 事件 / context 工具仍在；关掉某一平台方法后新连接看不见。`agent.mcp` 行为不变。
6. 设置 → MCP 打开 `form_list` 后，新连接且已绑项目时能列出当前项目问卷；另一个绑定项目看不到这份记录。

## 方案与关键决策

### 登记形状

`mcp_exports` 是 schema 2 块。每条：

| 字段 | 含义 |
|---|---|
| `tool_id` | 插件内唯一，`[a-z0-9][a-z0-9-]*` |
| `description` | 给模型看的说明 |
| `input_schema` | JSON Schema object（`type: "object"`） |
| `effect` | `read` 或 `write` |
| `audience` | 省略 = `runtime`；可 `management` / `all` |
| `scope` | 省略 = `project`；Functions 用 `home` |

禁止出现 enabled、对外正式名、`board_id` / actor 一类身份字段。`input_schema.properties` 若含身份字段，解析失败。

`PluginAppContribution.mcp`：与 routes 相同，按 `tool_id` 兑现 handler。未走 Plugin Runtime 的 native 插件由 Host 的 native 适配表按 `plugin_id` 找到 adapter，再传入 `{ tool_id, arguments }`；adapter 不得按对外公开名分发。

### 调用链

```
molis-work-mcp
  → apps/desktop/launchers/mcp/server.ts
  → LocalMcpServer.handleMessage
      initialize：已绑定 Session 先恢复连接，再 assembleMcpCatalog，冻结本连接目录
      tools/list：冻结后的 catalog.tools
      tools/call：assertMcpToolAllowed（list 与 call 同闸）
        source=plugin → mcp-native-plugins 按 plugin_id 分发，handler 只认 tool_id
        source=platform 且是连接工具 → apps/mcp runtime-context handlers
        其余平台工具 → Host 注入身份 → apps/mcp dispatchMcpProjectTool
```

后续 native 插件要对外贡献：Manifest `mcp_exports` + 插件包按 `tool_id` 的 handler + 在 `apps/local-host/src/mcp-native-plugins.ts` 加一条登记（来源从 Manifest 读，`default_enabled` 默认 `false`）。不要改 `apps/mcp` 的 tool-catalog，不要在 `LocalMcpServer.callTool` 里点名公开工具名。

运行时托管 app 插件：`start()` 返回 `contribution.mcp`，与 Manifest 一一对应；Plugin Runtime 启动时校验。生产 `tools/call` 尚未把这类插件接到 Runtime，在 Host 接上之前不要给 Coding 等产品插件填 `mcp_exports`。

### 合成与闸门（顺序）

1. 平台工具（`apps/mcp` 现有 Goals/事件/context schema）+ 各插件 `mcp_exports`。
2. 观众：runtime 连接只保留 runtime/`all`；management 看全部。
3. 全局开关：无 override 用默认（平台 + Functions 三名默认开；其它插件贡献默认关）。
4. 启用：`scope=home` 通过，不要求绑项目。`scope=project` 必须已绑项目；其中个人插件视为已启用，其余需当前绑定项目的 `enabled_plugins`。未绑项目时项目作用域贡献不进 list/call。Host 把绑定 `project_id` 交给个人 store 类 handler，不出现在工具 schema。
5. grant：登记了 `permissions` 的，实际 grant 必须覆盖；Functions 权限为空，只受开关和启用约束。
6. Host 去掉身份字段后对外；call 时注入项目/身份，再分发。写入仍走该工具现有审核路径。Functions invoke 的 `needs_review` 仍是业务结果，不进 Goal 审核队列。

点名完全不存在的方法：`mcp.tool_unknown`。当前连接本可以看见但已关、未启用或未授权：`mcp.tool_disabled`。Runtime 点名仅管理入口的平台工具（如 `event_decide`）：`mcp.authority_denied`，不当成 unknown。Host 拒绝，不进插件。

### 设置存储

`{home}/config/mcp-tools.json`：

```json
{ "version": 1, "overrides": { "molis_work_v1_functions_invoke": false } }
```

只存与默认不同的项。缺文件 = 全默认。不进项目库、不进插件 private store。

### 设置页

用户设置「工具」分组、AI 与执行工具下方增加「MCP」。按「平台」和各有贡献的插件分组，每方法一个开关。`isHostGlobalSettingsSection` 含 `mcp`。`/settings/mcp` 由 catalog Web 渲染，API 读写 overrides。

## 输入输出与依赖

输入：Manifest `mcp_exports`、Home overrides、audience、绑定项目与 `enabled_plugins`、grant。

输出：过滤后的 `tools/list`、经身份注入的 `tools/call`、设置页与 JSON 偏好。

依赖：现有 `molis-work-mcp` 协议、Functions 服务、Workbench 用户设置壳、Plugin Manifest 解析与 contribution 兑现。

## 文件 / 模块边界

允许：

- `specs/archive/plugin-outbound-mcp/`
- `packages/contracts`：`platform/plugin-mcp.ts`，Manifest / contribution 接线，解析
- `packages/plugin-runtime`：校验 `mcp` contribution 兑现
- `packages/plugin-sdk`：再导出类型
- `apps/mcp`：平台工具 schema/适配；catalog 改为接收已过滤目录；删除静态 `FUNCTIONS_TOOLS`
- `apps/local-host`：合成、开关存储、冻结、native 适配表、分发、设置 HTTP
- `apps/workbench`：MCP 设置页与导航
- `plugins/native/functions`：`mcp_exports` + 按 `tool_id` 的 handler
- `plugins/native/{form,dataset,ppt}`：`mcp_exports` + 按 `tool_id` 的 handler；Host native 表各一条，`default_enabled: false`
- 对应测试、`docs/mcp.md`、开发手册（`docs/cli-and-development.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`docs/platform/PLUGIN-PLATFORM.md`）、相关包 README、SSOT `apps/mcp` 一行

禁止：改 `agent.mcp`、把开关写入 Functions 设置 UI、新建 MCP 包、给 Coding 等 app 插件填 `mcp_exports`、把 Goals 迁出 `apps/mcp`。

## 验收标准

1. Functions Manifest 能通过解析地登记三个对外工具；`apps/mcp` 静态目录不再 import/写死 `FUNCTIONS_TOOLS`。
2. 设置 → MCP 能打开/关闭某一方法；关则**新连接** list 无、call 拒；开则 Runtime audience 下可见（仍受 audience/授权约束）。已 initialize 的连接不因改开关变化。
3. 调用不经插件自有 MCP 进程；`board_id`/actor 仍由 Host 注入，工具参数 schema 不能出现身份字段。
4. 未登记的 `tool_id` 到不了 handler。未在项目启用的项目作用域插件，其贡献在该项目绑定下不可用。
5. 现有 Goals/事件/context 工具默认仍可用；Runtime 点名 `event_decide` 仍是 `mcp.authority_denied`，不是 unknown。`agent.mcp` 行为不变。
6. 定向测试：登记校验、合成目录、开关过滤、拒绝点名、Functions 迁入后 list/describe/invoke、设置页属于 Host 全局设置且不在插件 settings-page 列表。Host 按 `plugin_id`/`tool_id` 分发，不在 `callTool` 里点名 Functions 公开名。
7. Pages / Forms / Dataset / PPT Manifest 登记与 HTTP 对等的 `tool_id`；默认关；打开后需绑项目才进 list/call；同一 home 下项目 A 的记录不出现在项目 B。
8. 已绑定稳定 Session 的**新连接**在 `initialize` 时恢复该绑定后再冻结目录，已开的项目作用域贡献直接进 list；未绑仍不进。同一连接改开关仍不热刷新。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-plugin-runtime --filter @molis-ai/molis-work-plugin-sdk --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-plugin-form --filter @molis-ai/molis-work-plugin-dataset --filter @molis-ai/molis-work-plugin-ppt --filter @molis-ai/molis-work-app-mcp --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host build
node --import tsx --test --test-concurrency=1 tests/plugin-manifest-v2.test.ts tests/plugin-outbound-mcp.test.ts tests/functions-plugin.test.ts tests/plugin-global-settings.test.ts tests/mcp.test.ts tests/creative-tools-plugins.test.ts tests/pages-plugin.test.ts
```

设置页用本地 Web 打开 `/settings/mcp` 看分组和开关。

## 假设与开放问题

- 本切片不通知 MCP `tools/list_changed`；Assistant 换开关需重连。
- 平台工具的设置分组文案：连接 / Goals / 事件。不另开产品名。
- Coding 等 app 插件仍不登记 `mcp_exports`，直到生产 `tools/call` 接到 Plugin Runtime。

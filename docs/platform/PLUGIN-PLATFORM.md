# Plugin Platform

## 1. 三个组成部分

- `packages/kernel`：Capability 注册、选择、权限判定和生命周期骨架。
- `packages/plugin-runtime`：Plugin 身份、Manifest、签名、安装、grant、隔离、升级/回滚与 Local/Server entrypoint 生命周期。
- `packages/plugin-sdk`：Plugin 作者可使用的稳定 Contract、UI Extension API、测试 fixture 和开发工具接线。

## 2. 身份与安装

- 官方可安装生态由官方发布并审核；第三方源码由用户自行构建和安装。
- 本地 Plugin 默认个人安装、个人数据、不同步；用户在 Plugin 内明确选择 Team Project 后，才通过 Goal/Artifact 共享。
- Team Plugin 由 Team 决定在 Server 上安装和授权；它不能远程安装用户本地 Plugin 或取得个人权限。
- Plugin 身份由发布者签名绑定。签名变化视为新 Plugin，旧 grant、Store 和 Provider Binding 不继承。

## 3. 能力与内容交换

- Module 和 Horizontal Service 对外暴露强类型 Capability。
- Plugin Manifest 声明需要的 Capability、grant、produces/consumes 的 Artifact Type 与 UI Contribution。
- Plugin 不声明对另一个 Plugin implementation 的依赖。
- 可保存、同步、重放的内容只通过 Goal/Artifact；即时查询/操作直接调用官方 Capability。
- Artifact consumer 由 `artifact_type_id + schema_version` 匹配，不限制生产者 Plugin。

**v2 把「依赖」这件事说清楚了**（[需求书](../../specs/plugin-platform-v2/spec.md)）。依赖只表达契约，
不表达实现，一共三种，都可被任意满足者提供：

| 种类 | 声明在 | 谁满足 | 不满足时 |
| --- | --- | --- | --- |
| 能力 | `requires[].capability_id@version` | Kernel 注册表里任意 provider | 必需项不满足则不激活，给具名诊断 |
| 端口输入 | `ports.inputs[]` 的 Artifact 类型 | 任意产出该类型的输出端口，由用户连线绑定 | 输入未齐：可激活但不投递，状态 `missing` |
| 事件订阅 | `events.subscribes[].from_plugin_ids` | 明确点名的来源插件 | 来源未安装：静默不匹配，不算故障 |

事件订阅必须点名来源、不许通配符：这是**路由限制**而不是实现依赖，目的是不让第三方插件默默接收别人的事件。

Manifest 内部的一致性由解析器保证，而不是留到运行时才炸：声明输出端口必须同时声明 `artifact:write`
且把端口类型列进 `artifacts.produces`；输入端口同理对应 `artifact:read` 与 `artifacts.consumes`。

## 4. v2 的四条运行机制

- **事件流**：类型校验、命名空间归属、按 (订阅者, 来源) 串行、generation 门控、懒激活、撤权。
  事件**落项目库**，因此重启能从游标续投，不重不丢。正文上限 16 KiB——事件是协调通道，不是内容通道。
- **输入图**：端口连线、输入组、固定 Artifact 版本投递、失效先撤权再通知、跨作用域一致性检查。
  连线和端口当前版本都落库，重启后恢复。
- **声明式装配**：导航位置、命令、HTTP 路由全部由 Manifest 推导；路由统一挂在
  `/api/plugins/<plugin_id>/` 下，未声明的路径到不了插件。对外 MCP 同样由 Manifest
  `mcp_exports` 登记本地 `tool_id`，Host 盖名并合成唯一 `molis-work-mcp` 目录；插件不自己开 MCP 进程。`agent.mcp` 是插件内 Agent 调外部 MCP，不是对外贡献。作者步骤见 [Plugin 开发 · 对外 MCP](PLUGIN-DEVELOPMENT.md#对外-mcp)。
- **隔离与重启**：一个插件启动失败只影响自己；显式 `stop` 不消耗崩溃恢复额度；
  启动后必须**兑现** Manifest 声明的视图与路由，否则判为启动失败并撤权。

装配顺序是真约束：事件总线与输入图需要生命周期，生命周期需要 Plugin Runtime，Runtime 需要 executor。
`apps/local-host` 的 `createPluginPlatform` 拥有这个顺序，并用 executor 的 `attach` 接缝收口；
调用方不需要重新发现它。

### 固定成果作为端口输出

`outputs.publish` 为端口生成新 Artifact 版本；`outputs.select({ port, reference, expected_reference })` 则将已有固定成果的精确引用设为端口当前值，不复制正文或改写历史。选择只接受当前项目、当前用户可读、当前插件及相同发布者签名生产的可用版本，类型与 schema 必须符合输出声明；仍需原 `artifact:read` / `artifact:write` grant。

`expected_reference` 比较预览时的原输出，避免旧确认覆盖其他选择；当前已经是目标引用时重试直接返回。连线层持久保存当前引用，沿原输入图投递给声明兼容类型的消费者。生成新版本始终读取端口原 Artifact 身份的最新版本，选择另一成果或旧版本不会回退生成序号。它不替代消费插件的界面、处理流程或业务验收，也不赋予消费者执行权限。

## 5. Native 与 Integration Plugin

Native Plugin 是一级产品入口，组合 Module API 和 UI；它不吸收 Module implementation。Goals、Artifacts 是官方保护的一等 Plugin。本机偏好用 `settings-page` 挂到 `workbench.settings`，由全局设置目录列出；Feed/Inbox 里的来源和账号仍是插件内容功能，不进全局设置。Functions 事件去向只收录该对象画面上已接线的下一步处置，录取标准与判例见 [Plugin 开发 · 事件去向的动作名单](PLUGIN-DEVELOPMENT.md#事件去向的动作名单)。完整写插件（含 Host 装配、CLI、接入）： [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md)。

Integration Plugin 把 Provider 的 Manifest、Local/Server entry、设置 UI、Connector/Listener/Signal/Action Adapter 放在一起。Host 只看 Contract 和 Receipt，不包含 GitHub/Gmail 等 provider 条件分支。

## 6. 安全边界

Plugin 只能在 Manifest 上限和用户实际 grant 的交集内调用；Secret 通过引用交给安全 Adapter；UI 与本地 entrypoint 通过 Host 提供的隔离通道通信。卸载停止代码和 binding，但历史 Goal/Artifact/Signal 引用仍可安全显示。

## 7. 当前实现边界

v2 已在 Coding 及 Files、Diff、Git、Text Stats 的正式宿主装配中运行，
复用 `createPluginPlatform` 的生命周期、Artifact、连线、事件及能力合同；真实 SQLite 重启路径有工程验证。
其他仍标为 `native` 的插件继续由构建期组合装配，不能据 Coding 的接通宣称所有内置插件已迁移。
每个插件的具体产品完成度以自身需求书和正式运行证据为准。

Runtime 以稳定 `install_id` 关联安装记录和私有数据。启动只恢复已安装版本，不会因 Host 提供了较新 Manifest 就改写版本或授权。Manifest 可用 `upgrade_compatibility.compatible_from_versions` 声明新实现可直接兼容的精确来源版本，或用 `migratable_from_versions` 声明仅可经用户手动升级的数据来源；可迁移升级要求插件提供只能读 `storage:private.get` 的 `validateUpgrade` 预检。Host 不做数据迁移；预检通过后目标实现必须直接使用原数据。项目插件市场展示当前项目的候选版本与新旧版本，用户触发升级后 Runtime 校验来源声明、权限保留和数据预检，再切换版本。更高版本升级仍需提高版本号；同版本 Manifest 变更仅在声明兼容当前精确版本时允许继续运行，安装记录指纹保持不变，也不会产生市场候选。

Runtime 管理的首方 Native 插件会把其工厂实现打成单文件模块，保存在该项目现有 SQLite 的 `plugin_runtime_release_artifacts` 表中，以插件 ID、发布者签名、版本和 Manifest 指纹绑定。Host 重启后若当前候选不兼容已安装版本，就从该表恢复精确旧版，或恢复明确声明兼容该安装版本的已留存实现；兼容候选可以直接运行，但安装记录不变。首次安装、首次运行兼容实现和用户手动升级前都会保存对应发行物。项目关闭、Host 启动和发布新版本都不会升级安装记录；用户手动升级才调用 Runtime 的预检、切换和回滚路径。发行物不进入插件私有数据，也不另建目录。Plugin Builder 本体也保留 Native 实现；Builder 创建的每个不可变插件发布仍随 Builder 私有数据保存，Host 重启时按 Runtime 安装记录恢复对应发布；发布新版只登记候选，库页手动升级才调用相同的 Runtime 路径。作者约定见 [插件版本升级](PLUGIN-DEVELOPMENT.md#插件版本升级)。

## 8. FD3 历史实现边界

当前参考链路是：Host 安装官方 Manifest → 用户/官方安装流程授予 Manifest 范围内的 grant → Runtime 启动 Plugin → Plugin 返回 Connector Driver 和 Signal Adapter → Listener Host 可靠投递 → Signals Module 保存正式 Signal。

- 安装身份使用 `plugin_id + publisher signature`；记录和引用始终保留 `plugin_id + version`。签名变化产生新安装身份，不继承旧 grant。
- 同一 `plugin_id + version + signature` 的 Manifest 内容不能静默变化；代码变化必须由 Plugin 自己递增 version。
- Runtime 不理解 GitHub/Gmail payload，也不拥有 Source、Signal、Feed 或 Attention 数据。
- Plugin crash 会撤销当前 contribution，可在上限内恢复；uninstall 撤销代码 contribution，但不删除已经形成的 Signal。
- 项目 Runtime SQLite 保留 Runtime 管理的首方 Native 发行物，支持 Host 重启后恢复当前安装实现；其他仍由构建期组合装配的 Native 插件不因此获得版本恢复。已有安装若从未保存过精确发行物，Host 只能在当前候选明确兼容该安装版本时安全接续并归档当前实现；不兼容且没有历史发行物时会保留安装记录并报告不可恢复，不会执行候选代码。Plugin 仍是可信 Host 进程内代码，不提供任意 JavaScript 的独立进程或沙箱隔离；Server entrypoint 仍是后续实现。

当前项目目录通过按项声明的 [项目设置能力](PROJECT-SETTINGS.md) 读取；Workspace 已退出产品导航和运行图。设置槽、项目说明和私有存储保持各自边界。

兼容启动时，`PluginStartContext.version` 表示 Runtime 实际选中的实现版本，供 UI、Artifact 和私有存储客户端验证身份。`install_id` 与 grants 仍来自原安装；安装记录的版本和 Manifest 指纹只在显式升级时改变。崩溃恢复遵循同样规则，停止或崩溃仍撤销该次执行上下文。

首方工作区插件可通过受控制令牌保护的 `POST /api/plugins/:pluginId/restart` 显式重试。达到恢复上限的插件继续隔离，普通重试和页面重开不解除。用户明确选择解除隔离时，Host 通过 `POST /api/plugins/:pluginId/release-quarantine` 发起一次受控恢复；启动成功才解除并重置恢复预算，失败仍隔离。两种操作均不改变安装版本、身份或 grants。

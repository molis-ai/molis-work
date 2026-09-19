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
  `/api/plugins/<plugin_id>/` 下，未声明的路径到不了插件。
- **隔离与重启**：一个插件启动失败只影响自己；显式 `stop` 不消耗崩溃恢复额度；
  启动后必须**兑现** Manifest 声明的视图与路由，否则判为启动失败并撤权。

装配顺序是真约束：事件总线与输入图需要生命周期，生命周期需要 Plugin Runtime，Runtime 需要 executor。
`apps/local-host` 的 `createPluginPlatform` 拥有这个顺序，并用 executor 的 `attach` 接缝收口；
调用方不需要重新发现它。

## 5. Native 与 Integration Plugin

Native Plugin 是一级产品入口，组合 Module API 和 UI；它不吸收 Module implementation。Goals、Artifacts 是官方保护的一等 Plugin。本机偏好用 `settings-page` 挂到 `workbench.settings`，由全局设置目录列出；Feed/Inbox 里的来源和账号仍是插件内容功能，不进全局设置。

Integration Plugin 把 Provider 的 Manifest、Local/Server entry、设置 UI、Connector/Listener/Signal/Action Adapter 放在一起。Host 只看 Contract 和 Receipt，不包含 GitHub/Gmail 等 provider 条件分支。

## 6. 安全边界

Plugin 只能在 Manifest 上限和用户实际 grant 的交集内调用；Secret 通过引用交给安全 Adapter；UI 与本地 entrypoint 通过 Host 提供的隔离通道通信。卸载停止代码和 binding，但历史 Goal/Artifact/Signal 引用仍可安全显示。

## 7. 当前实现边界

v2 的机制已实现并有定向测试，但**尚未在运行中的产品里组装**：`createPluginPlatform` 存在且经过
真实 SQLite 的重启验证，生产装配根还没有调用它。六个内置插件已各自拥有 v2 Manifest 并驱动导航，
但 `kind` 仍是 `native`——它们由构建期组合装配，没有跑在 Plugin Runtime 的隔离与生命周期里。
把它们改成运行时托管，前提是先把各自依赖的 Module 能力注册进 Kernel Capability Registry；
这条链路由 Coding 插件作为第一个完整运行时托管的 app 插件打通。

在那之前，把它们标成 `app` 会让 Manifest 说谎。

## 8. FD3 历史实现边界

当前参考链路是：Host 安装官方 Manifest → 用户/官方安装流程授予 Manifest 范围内的 grant → Runtime 启动 Plugin → Plugin 返回 Connector Driver 和 Signal Adapter → Listener Host 可靠投递 → Signals Module 保存正式 Signal。

- 安装身份使用 `plugin_id + publisher signature`；记录和引用始终保留 `plugin_id + version`。签名变化产生新安装身份，不继承旧 grant。
- 同一 `plugin_id + version + signature` 的 Manifest 内容不能静默变化；代码变化必须由 Plugin 自己递增 version。
- Runtime 不理解 GitHub/Gmail payload，也不拥有 Source、Signal、Feed 或 Attention 数据。
- Plugin crash 会撤销当前 contribution，可在上限内恢复；uninstall 撤销代码 contribution，但不删除已经形成的 Signal。
- 现阶段 Runtime repository/executor 是可替换的本地参考实现。持久安装目录、独立进程/沙箱、升级回滚 UI 和 Server entrypoint 仍是后续实现，不能从 FD3 的 in-process 测试推断为已上线。

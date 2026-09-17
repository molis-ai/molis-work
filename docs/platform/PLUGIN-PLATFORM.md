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

## 4. Native 与 Integration Plugin

Native Plugin 是一级产品入口，组合 Module API 和 UI；它不吸收 Module implementation。Goals、Artifacts 是官方保护的一等 Plugin。本机偏好用 `settings-page` 挂到 `workbench.settings`，由全局设置目录列出；Feed/Inbox 里的来源和账号仍是插件内容功能，不进全局设置。

Integration Plugin 把 Provider 的 Manifest、Local/Server entry、设置 UI、Connector/Listener/Signal/Action Adapter 放在一起。Host 只看 Contract 和 Receipt，不包含 GitHub/Gmail 等 provider 条件分支。

## 5. 安全边界

Plugin 只能在 Manifest 上限和用户实际 grant 的交集内调用；Secret 通过引用交给安全 Adapter；UI 与本地 entrypoint 通过 Host 提供的隔离通道通信。卸载停止代码和 binding，但历史 Goal/Artifact/Signal 引用仍可安全显示。

## 6. FD3 当前实现边界

当前参考链路是：Host 安装官方 Manifest → 用户/官方安装流程授予 Manifest 范围内的 grant → Runtime 启动 Plugin → Plugin 返回 Connector Driver 和 Signal Adapter → Listener Host 可靠投递 → Signals Module 保存正式 Signal。

- 安装身份使用 `plugin_id + publisher signature`；记录和引用始终保留 `plugin_id + version`。签名变化产生新安装身份，不继承旧 grant。
- 同一 `plugin_id + version + signature` 的 Manifest 内容不能静默变化；代码变化必须由 Plugin 自己递增 version。
- Runtime 不理解 GitHub/Gmail payload，也不拥有 Source、Signal、Feed 或 Attention 数据。
- Plugin crash 会撤销当前 contribution，可在上限内恢复；uninstall 撤销代码 contribution，但不删除已经形成的 Signal。
- 现阶段 Runtime repository/executor 是可替换的本地参考实现。持久安装目录、独立进程/沙箱、升级回滚 UI 和 Server entrypoint 仍是后续实现，不能从 FD3 的 in-process 测试推断为已上线。

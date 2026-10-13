# Platform

Molis Work 是本地优先的插件基座加多个插件。Platform 就是这个基座：一个 Home 的宿主、统一动作目录与授权、Plugin Runtime、工作台外壳和共享的 Prologue AI 运行时。它提供所有 Module、Service、Plugin 和 App 共用的机制，但不拥有 Goal、Artifact、Feed、Action、Session 等业务事实——内容和事实属于各插件，每项事实只有一个 owner（见 [SSOT](../SSOT-MATRIX.md)）。

- [Plugin Platform](PLUGIN-PLATFORM.md)：Kernel、Plugin Runtime、SDK、签名、授权和 Provider Binding。
- [Plugin 开发](PLUGIN-DEVELOPMENT.md)：完整写插件见官方 Skill [`skills/molis-plugin-dev/`](../../skills/molis-plugin-dev/SKILL.md)（含 Host 装配、CLI、接入）；本手册管本地源码运行、MCP 贡献、动作录取、打包签名。改平台合同时两处一起更新。
- [Storage and Exchange](STORAGE-AND-EXCHANGE.md)：本地存储、可靠交换、同步分工和 Server 边界。
- [UI Platform](UI-PLATFORM.md)：Workbench、UI Host、Design System、Slot 与嵌入。
- [Desktop App 与 Tauri](DESKTOP.md)：macOS 外壳、面板、Capsule、Native Adapter 与发布边界。
- [Contracts and Operations](CONTRACTS-AND-OPERATIONS.md)：Contracts、Observability、Test Kit 与边界门禁。
- [Molis Work 会联网去哪里](NETWORK.md)（[English](NETWORK.en.md)）：Molis Work 自己发起的出站网络逐类登记：去哪里、发出去什么、有什么限制；新增出站请求先改这一页，设置页的「服务连接」里放着链接。
- [创作台 Skill 回放与冒烟](STUDIO-SKILL-REPLAY.md)：改创作台挂载的 Skill、提示词或设计校验后怎样验证（`pnpm studio:replay`）。

Foundation package 的完整逐包 Contract 见架构 Spec 第 19 节；当前 package 清单与状态见 [`docs/SSOT-MATRIX.md`](../SSOT-MATRIX.md)。

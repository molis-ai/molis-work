# Platform

Platform 提供所有 Module、Service、Plugin 和 App 共用的机制，但不拥有 Goal、Artifact、Feed、Action、Session 等业务事实。

- [Plugin Platform](PLUGIN-PLATFORM.md)：Kernel、Plugin Runtime、SDK、签名、授权和 Provider Binding。
- [Plugin 开发](PLUGIN-DEVELOPMENT.md)：本地源码运行、打包签名、对外 MCP 贡献。
- [Storage and Exchange](STORAGE-AND-EXCHANGE.md)：本地存储、可靠交换、同步分工和 Server 边界。
- [UI Platform](UI-PLATFORM.md)：Workbench、UI Host、Design System、Slot 与嵌入。
- [Desktop App 与 Tauri](DESKTOP.md)：macOS 外壳、面板、Capsule、Native Adapter 与发布边界。
- [Contracts and Operations](CONTRACTS-AND-OPERATIONS.md)：Contracts、Observability、Test Kit 与边界门禁。

Foundation package 的完整逐包 Contract 见架构 Spec 第 19 节；当前 package 清单与状态见 [`docs/SSOT-MATRIX.md`](../SSOT-MATRIX.md)。

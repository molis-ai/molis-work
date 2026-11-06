# 架构重组基线：应用、入口与工具合同

状态：架构重组时的设计与合同记录（2026-09，含正文注明的后续补充），2026-11-03 从需求书分出，保留原章节编号。这里的“已确认”“未实现”、目录与接口示例属于当时基线，不是当前包/API 清单；实际层次、成熟度和依赖以[SSOT](../../docs/SSOT-MATRIX.md)与[现行架构](../../docs/system/ARCHITECTURE.md)为准。原 §20.12/§20.14 两个模块及其他已删除机制的说明见[总需求书开头](spec.md)。

[总需求书与验收](spec.md) · [§19 基础包](contracts-foundation.md) · [§20 模块](contracts-modules.md) · [§21 服务](contracts-services.md) · [§22 插件](contracts-plugins.md) · [§23 应用与工具](contracts-apps.md)

## 23. Apps、Adapters 与 Tooling Contract

### 23.1 Tooling 保持精简（已确认）

`tooling/` 不是把所有开发辅助能力再次包装一遍的容器。第一阶段只保留一个可复用开发工具和一个迁移脚本目录：

```text
tooling/
├── plugin-cli/
└── migrations/
```

- `plugin-cli` 是正式工具 package，负责 Plugin 创建、Manifest / Contract 校验、开发调试、打包和签名流程；具体签名密钥仍由安全 Adapter / 发布环境管理。
- `migrations` 保存本次架构重组与数据迁移的一次性脚本，默认不是 workspace package，也不承诺稳定公共 API。
- Contract 校验规则归 `packages/contracts` 所有，由其测试或 CLI 入口执行，不建立重复的 `contract-checker` package。
- 通用测试 Harness 归 `packages/test-kit`，领域 fixture 和业务断言继续留在对应 Module / Plugin。
- Release 属于仓库脚本与 CI workflow，不为了目录对称建立 `release` package。
- 只有某项工具形成独立使用者、版本、发布物和生命周期后，才从现有 owner 中拆为新 package。

### 23.2 一个 Local Host，多个本地入口（已确认）

`apps/local-host` 是本地业务能力的唯一 composition root；Desktop、Workbench、CLI 与 MCP 是不同交互入口，不各自启动和维护一套 Module、Service、Plugin Runtime 或 Storage 组合。

```text
apps/local-host
├── Modules
├── Horizontal Services
├── Plugin Runtime
├── Storage / Exchange
└── Platform Adapters

apps/desktop   ─┐
apps/workbench ─┼─→ Local Host Capability API
apps/cli       ─┤
apps/mcp       ─┘
```

**边界：**

- Local Host 负责依赖装配、Module / Service lifecycle、Provider Binding、本地 Plugin entrypoint、Storage 与 Exchange 接入。
- Workbench 负责产品 UI 和 UI Contribution 装载，不初始化业务 Store，也不直接导入 Module implementation。
- Desktop 负责窗口、进程生命周期、安装更新、系统权限和 Native Bridge，不复制业务规则。
- CLI 与 MCP 把各自输入翻译成相同的强类型 Capability 调用；命令名或 Tool schema 可以不同，业务判断不能不同。
- Server 是另一套独立 composition root，只装配 Exchange、Team 控制面与 Team Plugin Host，不复用 Local Host 来运行完整本地业务系统。

**部署自由度：**

- package 边界不要求第一阶段立即采用独立 daemon；Local Host 可以先与 Desktop 同进程、由 Desktop 启动为子进程，或在测试中以内存方式启动。
- 入口与 Host 之间只依赖稳定 Client Contract；未来改变进程边界时，调用者不需要重写业务逻辑。
- 只有一个入口负责启动目标 Local Host 实例，其他入口通过发现和连接机制复用它，避免同一 User / Project 出现多个无协调 writer。

**迁移与验收：**

- 先把 `src/cli/`、`src/mcp/`、`src/web/` 中重复的业务初始化识别并迁回 Local Host composition；入口保留解析、展示和协议适配。
- 使用同一 Host test fixture 分别驱动 CLI、MCP 与 Workbench Client，验证相同 Command 产生相同事实变化和错误结果。
- 进程通信、Host discovery 与 single-writer 细节延后到对应迁移 Work Item 决定，不阻塞当前包重组。

**AP2 当前实现事实：** `packages/contracts/platform/app-host`、`packages/kernel` 与 `apps/local-host` 已提供 typed Client、Capability registry 和按 Project storage key 复用的 embedded Runtime。旧 `Store + Coordinator` 构造只保留在 `src/local-host/composition.ts` 的迁移 adapter；Web、CLI、MCP 不再自行构造，Web Feed scheduler 也复用同一 Store。多入口、幂等、身份冲突、单次打开、统一关闭和重启恢复由 `tests/local-host.test.ts` 固定。独立 daemon、IPC 与跨进程自动发现仍是部署演进，不在 AP2 冒充完成。完整 caller 清单、边界审计和 500/500 全量回归见 [`ap2-validation.md`](ap2-validation.md)。

### 23.3 Adapter 就近放置，不设顶层包（已确认）

Adapter 是把稳定 Port 翻译成具体技术调用的代码角色，不是业务能力、可安装 Plugin 或必须独立发布的 package。目标 Monorepo 取消顶层 `adapters/`；实现默认跟随它服务的 owner 放置。

```text
packages/storage/adapters/
└── sqlite-filesystem

horizontal/runtime-host/adapters/
├── terminal-pty
└── codex-app-server

apps/desktop/adapters/
└── tauri

plugins/official-integrations/<provider>/
└── provider adapters
```

- Module / Host 依赖抽象 Port，不直接散落 `better-sqlite3`、`node-pty`、Tauri command 或 Codex protocol 调用。
- Storage Adapter 负责 SQLite、Filesystem 和本地 Blob 等技术实现，不拥有 Module Schema 的业务含义。
- Runtime Adapter 负责启动、恢复、中断、流式传输和资源清理，不拥有 Run、Session 或 Goal 状态。
- Desktop Adapter 负责 Keychain、Notification、Updater 和系统桥接，不拥有权限策略或业务行为。
- HTTP / WebSocket 等传输先留在实际消费者内部；多个真实 owner 形成共同版本和替换压力后才抽取。
- Provider-specific Adapter 仍跟随 Integration Plugin，不移入平台实现。
- Adapter 只有形成独立发布物、依赖生命周期或多个真实消费者时才升格为 package。

### 23.4 示例 Plugin 不进入生产包树（已确认）

- `plugins/` 只包含官方 Native Plugin 与官方 Integration Plugin，不保留没有真实实现来源的 `plugins/examples` package。
- `plugin-sdk/testing` 可以携带最小合规测试 fixture，但它不是安装生态条目。
- 面向开发者的完整样例在 SDK 真正实现时再创建为 `examples/plugin-sample`，默认不加入生产 workspace 和发布链。
- 第三方开源 Plugin 保持在各自源码仓库，由用户自行构建和安装；Molis Work 主仓库不为了展示生态而复制维护。

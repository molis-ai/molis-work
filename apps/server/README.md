# 本地 Server 启动器

Status: `partial`  
Contract: `@molis-ai/molis-work-contracts/platform/app-host`  
Migration: `goal-reorg-f2`

本包组合公共 `@molis-ai/molis-work-server`、群聊 UI 与已有本机 Action Gateway。模型/Agent 不在此启动。资产恢复使用原 Catalog、LocalHost 公开项目数据库及 Artifacts API，管理动作授权使用原受保护的 Host endpoint。

完整启动、首次授权、HTTPS 手机入口、资产恢复及验证说明见 [Server README](../../server/README.md)。

`@molis-ai/molis-work-app-desktop` 依赖仅用于现有 `withMolisWorkProjectCatalog` adapter：它为唯一 Catalog 注入真实 DesktopPanel schema/repository，调用不启动桌面窗口或原生桥。恢复不复制 Catalog、不另建成果存储，不初始化完整 Action provider。core 不依赖本包或 desktop，因此现有 local-host → core 的嵌入关系不会成环。

本地显式恢复生成独立的目标项目标识，`continuity/<source-project-id>.json` 保存来源映射与目标摘要。原成果 ID/version/content digest/producer 由原 Artifacts owner 校验，缺插件或来源凭据保留提示。目标历史与完成验收不被伪造为已迁移。

## 开发要求

- 负责：无桌面窗口的独立服务启动器、原 Host 动作桥与本地成果恢复适配。
- 不负责：第二个模型运行时、Goal 或 Artifact 事实、桌面窗口启动。
- 公开入口：`@molis-ai/molis-work-app-server`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：`@molis-ai/molis-work-app-desktop`、`@molis-ai/molis-work-app-local-host`、`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-im-ui`、`@molis-ai/molis-work-plugin-runtime`、`@molis-ai/molis-work-server`、`@molis-ai/molis-work-storage`。方向：apps → 组合根 → 公开合同（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 恢复不复制 Catalog、不另建成果存储，也不初始化完整的动作提供方。
  - 对 `@molis-ai/molis-work-app-desktop` 的依赖只用于 `withMolisWorkProjectCatalog` 适配，不启动窗口或原生桥。
  - `server` 核心不依赖本包或 desktop，保持 local-host → core 的嵌入不成环。
  - 成果的 ID、版本、内容摘要与生产者由 Artifacts owner 校验，缺插件或来源凭据时保留提示。
- 改动后必跑：`node scripts/run-tests.mjs tests/cross-device-continuity.test.ts tests/cross-device-gateway.test.ts`
- 相关手册：[docs/platform/STORAGE-AND-EXCHANGE.md](../../docs/platform/STORAGE-AND-EXCHANGE.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

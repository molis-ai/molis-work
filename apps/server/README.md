# 本地 Server 启动器

Status: `partial`  
Contract: `@molis-ai/molis-work-contracts/platform/app-host`  
Migration: `goal-reorg-f2`

本包组合公共 `@molis-ai/molis-work-server`、群聊 UI 与已有本机 Action Gateway。模型/Agent 不在此启动。资产恢复使用原 Catalog、LocalHost 公开项目数据库及 Artifacts API，管理动作授权使用原受保护的 Host endpoint。

完整启动、首次授权、HTTPS 手机入口、资产恢复及验证说明见 [Server README](../../server/README.md)。

`@molis-ai/molis-work-app-desktop` 依赖仅用于现有 `withMolisWorkProjectCatalog` adapter：它为唯一 Catalog 注入真实 DesktopPanel schema/repository，调用不启动桌面窗口或原生桥。恢复不复制 Catalog、不另建成果存储，不初始化完整 Action provider。core 不依赖本包或 desktop，因此现有 local-host → core 的嵌入关系不会成环。

本地显式恢复生成独立的目标项目标识，`continuity/<source-project-id>.json` 保存来源映射与目标摘要。原成果 ID/version/content digest/producer 由原 Artifacts owner 校验，缺插件或来源凭据保留提示。目标历史与完成验收不被伪造为已迁移。

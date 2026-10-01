# Cutover 后空包与旧目录清理

> 归档（2026-10-01，合入后梳理）：判定为**已实现**。空包已删。没有剩余事项。

## 目标与证据
用户要求清理旧代码和空包。当前 main 已完成 Cutover，但 10 个 workspace 仍只有 13 行 packageDescriptor，没有功能实现、生产引用或其他 manifest 依赖；workspace 门禁仍硬编码 48 包。
完成等级：清理后的构建、边界与发布装配保持可用；不改产品行为或数据库。

## 范围与决定
删除 apps/server、packages/exchange、packages/observability、modules/identity-team-access、modules/sync-replication、modules/actions、modules/automation、horizontal/scheduler、plugins/native/actions、plugins/native/automation 的占位目录（含生成输出）。同步 workspace inventory、锁文件与当前架构文档；未来设计保留为 absent，不伪装实现。
保留 packages/contracts 中已公开的类型/Schema；它有真实 API 消费者，不是空包。保留 src 的三个启动器及 SDK 出口和兼容类型/Store，保留被实际调用的 legacy 提案/数据兼容逻辑。不清除历史验证记录，不删除现用安装、真实数据、凭据或整个 node_modules。
旧目录仅在没有文件时删除；发现生成残留需确认其 owner，再清除可再生旧根 dist。全仓清理不扩展为重构功能。

## 边界与验收
修改上述十包、scripts/workspace-packages.mjs、pnpm-workspace.yaml、pnpm-lock.yaml、当前 SSOT/迁移/边界文档及本 spec。移除固定包数断言，保留逐包文件、依赖、导出与未知包检查。
- 十包无生产消费者，删除后 workspace/boundary 零错误。
- pnpm 锁文件与实际 inventory 一致。
- 完整构建和现有边界测试通过；根公开 SDK/CLI/MCP/Web 入口定向测试通过。
- 当前文档区分 38 个实际包与未来设计，历史验收不改写。
验证：pnpm install --lockfile-only --offline --ignore-scripts；pnpm build；pnpm boundary:check；pnpm boundary:test；相关公共入口测试。
无产品行为变更，不新增镜像实现的测试。此前 commit/push main 授权沿用，清理验证后提交推送。

## 验收结果（2026-09-08）
- 通过：十个占位包及其生成目录、40 个受版本管理文件已删除；旧 src/planning、src/evidence 空目录与 src/feed 的 Finder 元数据/空目录已清理。根 src 保留六个公开入口/SDK 文件。
- 通过：pnpm 离线锁文件更新、冻结锁文件安装；完整 38 包构建与根发布启动器构建成功，旧根 dist 由标准 clean/build 重建。
- 通过：workspace/boundary 检查 38 包、709 源文件、91 依赖边、30 个真实公共 Contract subpath，零错误；现有九项边界测试全部通过。
- 通过：CLI 协议、MCP/Host 一致性、Web Home 共八项测试，以及根公共 API/CLI 出口一项测试通过；无失败或跳过。git diff --check 通过。
- 未运行：新的 npm/App 安装验收和全产品 E2E；此次仅移除无消费者的占位边界，不改变运行行为。既有发布资产及真实 Home 未改动。

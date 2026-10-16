# 空间同步协调

空间级策略、增量传输、重试和状态。插件通过公共条目适配器提供格式与落库；不认识 Pages 的表结构。

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/sync-replication`
- Migration Goals: `goal-reorg-f2`.

## 开发要求

- 负责：个人空间同步配置缓存、协议协调、进度、冲突入口。
- 不负责：身份签发、插件正文解释、跨 owner SQL、团队授权。
- 公开入口：`@molis-ai/molis-work-module-sync-replication`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`。
- 不变量：
  - 每次网络等待后、落地前复核账号租约；只由可信 Host 注入空间和 endpoint。
  - 只同步策略里精确身份/集合/版本，不因发现新插件自动勾选。
  - 只按顺序拉取回执推进游标；上传成功不跳过别人的并发事件。
- 改动后必跑：`node scripts/run-tests.mjs tests/personal-sync.test.ts tests/plugin-sync-foundation.test.ts`。
- 相关手册：[同步规范](../../skills/molis-plugin-dev/sync.md)。

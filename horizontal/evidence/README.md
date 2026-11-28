# 证据账本

Home 里共用的证据正文池（按 SHA-256 内容寻址）记着谁在引用哪段正文。正文本身仍由 `packages/storage` 的 evidence-content 存；这里只记引用，并且只有平台能回收没人引用的正文。

## 开发要求

- 负责：保存 `evidence/evidence.db` 的引用账本，键是（正文引用, 分区, 安装, 持有键）；提供持有、释放、按持有者/安装/分区整体释放，以及带 `evidence:collect` 的平台回收入口。
- 不负责：正文的读写与去重（`packages/storage` evidence-content）；插件自己的对象（持有键由插件给，分区与安装由宿主从可信上下文盖章）。
- 公开入口：`@molis-ai/molis-work-service-evidence` 的 `openEvidenceLedger`、`EvidenceLedger`、`EVIDENCE_HOME_STORE`、`EVIDENCE_COLLECT_PERMISSION`。
- 依赖：`@molis-ai/molis-work-contracts` 提供持有记录类型与回收权限，`@molis-ai/molis-work-storage` 管理库。
- 不变量：
  - 只有带 `evidence:collect` 的调用能回收（S-98）；不论谁触发，回收只删账本里任何分区、任何安装都不再持有的候选正文，别处还持有的一律留下。释放持有与回收在同一个写事务里完成。
  - 插件经宿主的 `services.evidence`（`apps/local-host/src/plugin-evidence-service.ts`）用它：只给分区实例，只在本插件自己正在执行、声明了 `evidence:collect` 的动作里能收回或释放。第 109 批 Feed 的持有迁进来（原 Home 库 `feed-content` 退役，不迁行，由启动对账重新登记），此后 Feed 不再自己回收。
  - 只收本存储的正文引用（`molis-work-evidence/sha256/<hash>`），一次至多 5000 条；格式不对、超量或持有键不合规以 `actions.input_invalid` 拒绝，什么都不改。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/partition-platform-services.test.ts`。
- 相关手册：[统一工作分区 §5](../../specs/unified-partition-plugins/spec.md#5-存储)。

# 证据账本

Home 里共用的证据正文池（按 SHA-256 内容寻址）记着谁在引用哪段正文。正文本身仍由 `packages/storage` 的 evidence-content 存；这里只记引用，并且只有平台能回收没人引用的正文。

## 开发要求

- 负责：保存 `evidence/evidence.db` 的引用账本，键是（正文引用, 分区, 安装, 持有键）；提供持有、释放、按持有者/安装/分区整体释放，以及带 `evidence:collect` 的平台回收入口。
- 不负责：正文的读写与去重（`packages/storage` evidence-content）；插件自己的对象（持有键由插件给，分区与安装由宿主从可信上下文盖章）。
- 公开入口：`@molis-ai/molis-work-service-evidence` 的 `openEvidenceLedger`、`EvidenceLedger`、`EVIDENCE_HOME_STORE`、`EVIDENCE_COLLECT_PERMISSION`。
- 依赖：`@molis-ai/molis-work-contracts` 提供持有记录类型与回收权限，`@molis-ai/molis-work-storage` 管理库。
- 不变量：
  - 只有带 `evidence:collect` 的调用能回收（S-98 改写），插件不论声明什么都拿不到；回收只删账本里没人持有的候选正文。
  - 第 106 批只加账本、不接任何实际回收路径：Feed 的 `feed_content_holds` 仍由 Feed 自己回收，第 109 批把 Feed 迁来时一并接上（V1 先加、后迁、再删），在那之前接回收会误删 Feed 正在引用的正文。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/partition-platform-services.test.ts`。
- 相关手册：[统一工作分区 §5](../../specs/unified-partition-plugins/spec.md#5-存储)。

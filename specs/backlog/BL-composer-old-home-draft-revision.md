# BL-composer-old-home-draft-revision

分组：3. 助理、记忆与动态交互 / 统一输入

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-composer-old-home-draft-revision | 旧 Home 里已存的助理工作没有 `draft_revision`：助理库第 1 版把工作存在 `assistant_works` 的 `body` JSON 里，`draft_revision` 是第 10 批新加的字段，`0.1.0` 金样即如此（`tests/fixtures/golden-homes/0.1.0/stores/assistant/assistant.db.sql`）。用户 2026-11-08 定「版本号不升、其他照常、不用考虑迁移」，所以没有升级段也没有读取兜底：在旧 Home 里编辑这些工作的草稿时，`apps/local-host/src/assistant/assistant-store.ts` 的 `current.draft_revision + 1` 会从 `undefined` 得到 `NaN`，随 `body` 写回时成 `null`；随后 `assistant-service.ts` 要求发送带上的草稿版本是正整数、`assistant-questions.ts` 的清理按相等比对，于是本次发送的草稿结算一直失配。M1 之前没有装到开发机之外的版本、没有真实 Home 迁移，风险为 0。要做的：等有真实 Home 升级或 M1 要求时，按当时的升级与读取兼容规则处理（可能是一段读取兜底或升级段），先请示用户 | [第 10 批](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-progress) 合后审计（2026-11-09）；用户 2026-11-08 定不升版本 | 已知缺口 | 用户明确决定不升版本、不考虑迁移；第 10 批据此撤回 1→2 升级段与读取兼容，按「没有旧用户」处理，不为存量多开一条例外 | 无（M1 或真实 Home 升级前再定） | 低 | C1（助理库合同）／A 统一输入 |

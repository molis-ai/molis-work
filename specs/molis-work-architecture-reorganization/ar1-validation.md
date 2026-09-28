# AR1 Artifact Core、版本与 Repository 验收记录

日期：2026-09-02  
Goal：`goal-reorg-ar1`  
完成等级：内部完整（Artifact Core 架构切片；无用户界面增删）

## 1. 这次真正完成了什么

- `packages/contracts/modules/artifacts` 建立正式 Artifact Contract；`modules/artifacts` 成为 Artifact identity、精确版本、scope、content、provenance 与 lifecycle 的唯一事实 owner。
- Artifact 以精确 `artifact_id + version` 引用。版本由生产 Plugin 明确提供并严格递增；平台不再增加 mutable/immutable 分类，也不维护 canonical head。
- `artifacts` 保存 lineage identity，`artifact_versions` 保存各版本 envelope；migration 31 可在新库和旧库上幂等创建。
- Inline JSON 规范化后保存并校验摘要；大内容只保存 Storage 已验证的 reference、摘要和大小。自定义 payload 保持 opaque，缺少 consumer 不妨碍保存、交换和重放。
- 同一 lineage 固定 owner、producer Plugin ID 与 binding signature；Plugin package version 可以递增。签名变化不能接管旧 lineage。
- 本地版本默认 personal；注册 `team_project` 版本必须携带明确的 Team 分享授权。
- `src/v1/store.ts` 只组合 Module 公开 schema/migration，`src/v1/coordinator.ts` 只构造 Module 并暴露 `ArtifactsApplicationApi`，没有 Artifact SQL、Repository 或重复业务规则。

## 2. 现有数据与功能为何无损

迁移前没有正式 Artifact 表、Artifact Repository 或 Artifact public type。现有相似字段分别属于不同 owner：

- Execution 的 `Run.output_refs` 是执行输出引用字符串。
- Evidence 的 locator 是证据位置与预检状态。
- Feed 和 Session 的 `content_ref` 指向各自内容存储。

这些字符串没有统一 Artifact identity、version、type/schema、owner、producer binding 或 scope，无法无损推断成 Artifact。因此 AR1 不猜测回填、不双写、不改变旧读取路径。现有结果浏览、下载、嵌入和明确转换由 AR3 在真实 UI/caller 迁移时完成。

这意味着 AR1 新增正式 Core，但没有抢走原模块的数据，也没有改变用户当前看到的结果页面。513 项全量回归继续验证现有 Web、Desktop、CLI、MCP、安装升级、迁移、权限和恢复行为。

## 3. 版本、权限与错误边界

- 同一 `artifact_id + version` 的完全相同 envelope 重放返回原记录；不同内容、metadata、scope 或 provenance 不能覆盖。
- 新版本必须大于 lineage 中已存在的最大版本；允许 Plugin package version 更新，但 binding signature 和 Plugin ID 必须一致。
- 非 owner 不能注册、标记不可用或归档版本；Team scope 没有显式授权时拒绝写入。
- Inline 内容的声明摘要和 reference 的 Storage observed digest 不一致时，事务回滚且不留下 identity 空壳。
- 缺少兼容 consumer 返回 `consumer_missing` 可消费性状态，但精确版本仍能读取；内容不可用和归档按版本记录，不改变内容身份。
- 对外错误使用稳定 Artifact code，不泄露 SQL 或 Plugin payload 内部细节。

## 4. 包边界与 Huge Class 退出

| 位置 | AR1 后职责 |
| --- | --- |
| `packages/contracts/src/modules/artifacts.ts` | 唯一 public types 与 Query/Command API |
| `modules/artifacts/src/` | 内容规范化、Repository、migration、service 与 public Module entrypoint |
| `plugins/native/artifacts` | 仍为受保护的官方 Plugin Contract；AR3 前不拥有 Store、业务规则或假 UI |
| `src/v1/store.ts` | 只调用公开 Artifact schema/migration；没有 Artifact 表 SQL |
| `src/v1/coordinator.ts` | 只增加 18 行纯 composition；没有 Artifact 判断或 Repository |
| `src/v1/types.ts` | 没有新增 Artifact 类型；调用方直接使用独立 Contract |
| `src/evidence/` | 保持删除；Artifact 没有继承 Evidence locator helper |

Boundary gate 会拒绝 deep import、Plugin implementation 依赖、根 Store/Coordinator 直接 Artifact SQL、Native Plugin 提前吸收 Core，以及单个新 owner 文件超过 500 行。

## 5. 验证证据

| 检查 | 结果 |
| --- | --- |
| Artifact 定向测试 | 2 / 2 通过：精确版本、opaque payload、权限、binding、摘要、consumer、不可用/归档与 migration |
| 旧 V1 migration 30 兼容测试 | 1 / 1 通过 |
| `CI=true pnpm workspace:verify` | 48 packages、181 source files、352 imports、61 dependency edges、30 Contract subpaths、14 allowlist entries、10 legacy huge files、0 errors；全部 package typecheck/build 通过 |
| 全量 `CI=true pnpm test` | 513 / 513 通过，0 失败；包含 root build、Web/Desktop、CLI/MCP、安装升级、迁移、权限、并发与恢复回归 |
| `git diff --check` | 通过 |

Web/PTY 回归需要绑定本机临时端口，因此全量测试在允许本地端口的执行环境运行。

根据 2026-09-02 确认的总顺序，真实用户行为的完整前后端端到端验证在全部架构开发完成后统一执行；它不会被本次 513 项自动化回归替代。AR1 本身没有新增用户入口，AR3 才负责 Artifact Native Plugin UI 与旧结果 caller。

## 6. 验收条件对照

- `ar1-boundary`：通过。Contract、Module 和受保护 Native Plugin Contract 均使用 public entrypoint；Module 不依赖生产/消费 Plugin；根层只有 composition；边界门禁 0 错误。
- `ar1-legacy-exit`：通过。正式 Artifact 类型、schema、Repository、版本/权限/content 规则只存在于新 owner；Coordinator、共享 Store、Evidence helper 均无第二套实现。旧字符串引用没有被错误吸收。
- `ar1-result`：通过。创建、严格版本递增、精确读取、owner/Team 权限、opaque payload round-trip、producer binding、hash、缺失 consumer、不可用/归档和迁移测试全部通过。

## 7. 后续边界与发现

- AR2 消费 Artifact reference 建立 Context Ledger / Materialization，不把 Artifact 内容复制进关系表。
- AR3 建立 Artifacts Native Plugin 的浏览、嵌入、下载和明确旧结果转换；只有到那时 Plugin package 才能从 `contract-only` 升级。
- Server/Team 的 opaque envelope 同步、传输 ACK/Cursor 和轻量存储继续归 Sync/Replication 与 Exchange，不进入 Artifact Core。
- 对账发现 Draft Dialogue / Goal Tree Decision 的入口迁移不属于 EX4 且缺少正式 Goal，已提交非阻塞 Candidate `candidate-d7629ad3-8882-40b2-91cf-a75f9ce5c68a`，等待用户决定是否纳入总迁移树。

# 仓库复查后的修复与交接

2026-09-26。用户授权：核对其他任务，已有任务处理的交付给它们；无人处理的由本任务修复。目标是完成明确缺陷的修复与定向验证，不把文件行数或架构建议自动扩大成全仓重构。

## 归属

- F1–F4（插件可信身份、Action 副作用前授权、预算映射、Workflow 幂等）：`01a0d468-fe5c-7410-8ae8-63a608d76f6d` 已确认接手，尚未关闭。
- F5（Connector Host 直接操作业务数据库）：`01a0db94-6a0f-71b3-b621-83ee75f9c47a` 已接手并完成 owner 迁移；本任务已只读复核源码和回归日志，原边界缺陷关闭，Connector 最终体验 QA 仍由该任务负责。
- F7（AI 入口经 Prologue）：`01a0dbaa-54dd-7b60-be5a-fc07ce030e8d` 已确认，共享核心仍归动作任务。
- 浏览器导航/关闭 fixture 与体验验收：`01a0db91-34e5-77c3-8db7-8c59c067b55b` 已确认，独占 `tests/fixtures/goal-browser.ts`。
- Shelf 职责：`01a0db93-9e38-7fd3-985e-5917f5eda72d` 已核对；技术执行已在 website/ocr/job-runner，当前缺陷不要求拆 Store。repository/job workspace 留为出现实际改动需求时的包内候选。

完整审查证据在 `/Users/yijunwang/.codex/visualizations/2026/09/26/01a0db8f-26a6-7951-9e90-62990912666e/repository-review.md`。报告保持历史事实，不以交接替代修复验收。

## 本任务独占范围

1. 修正 `scripts/check-package-boundaries.mjs` 过期 Goal 规则：允许现有 Host typed capability 薄适配，但验证其委托统一 Goal Action；不要求已迁移 MCP 继续调用旧 snapshot。保留 CLI 的实际 snapshot 路径与禁止越过 Host 的约束，不能删除真实数据库越界检查。新增回归应能拒绝恢复直接领域调用的变异。
2. 修复 `tests/goals-storage-migration.test.ts` 中历史 dump 与当前 Demo Board ID 混用；保留历史 SQL 和所有迁移、回滚、重开断言，不改生产迁移语义。
3. 补 Dataset README 元数据，更新 SSOT 与包边界文档中已失效的包数量、根 src 状态。Repository 公开面等未收口项如实记录，不能修改规则掩盖现状。
4. 发布清理：源码 `vendor/prologue-sdk` 中所有历史、当前及新版本压缩包均保留；Home/npm 发布不重复携带这些源码归档，实际 SDK 继续由已有 runtime dependency 装配。保留来源说明/patch及其他 vendor 资产，复制与内容指纹采用同一选择函数。无需更改依赖版本或锁文件。

允许修改上述门禁及相关定向测试、迁移测试、两份文档与 Dataset README、`apps/local-host/src/installer/{release-assets,package-release-files}.ts` 及必要发布回归。CI 增加对应 Goal 边界、真实迁移与发布资产选择回归，使修好的测试持续执行；不恢复整套尚未修复的 legacy suite，也不改变已有必需门禁。本任务不改共享 AgentHost/Action 核心、不清理他人的改动、不提交全量工作树。

## 验证

- `node --test tests/goals-query-boundaries.test.mjs`：合法适配通过，直接领域调用/缺少 Action 转发失败。
- `node scripts/check-package-boundaries.mjs`：旧的 Goal 与 README 误报消除，F5 等其他真实违规继续显式报错。
- `node scripts/run-tests.mjs tests/goals-storage-migration.test.ts`：真实迁移回滚与重开测试全部通过。
- 发布定向测试：Home 与 npm 选择不含 Prologue tgz、保留 vendor 元数据与真正 SDK 文件；原始归档不删除；归档变化不触发无效 release，已发布运行时代码变化仍触发更新。
- 在独立审查快照验证需要构建的部分，避免清空并行任务的 dist；验证结果明确标注所用基线与未完成的其他 owner 工作。


## 本任务交付结果

- 已修旧 Goal 门禁，合法 typed adapter 委托统一 Action，恢复直接领域调用、错误 Action 或丢失返回值会被回归拦截；Dataset 清单元数据补齐。
- 历史迁移使用固定旧 Board ID；生产迁移实现与历史 dump 均未改动。
- SSOT 改引用实际包清单，包边界文档说明旧 src 已退出及 Repository 尚待收口的真实状态。
- Home/npm 复制与指纹共用 Prologue 来源资产选择；所有源码 tgz 保留，产物只带所需运行时包和来源材料。其他 vendor 资产不受影响。
- CI 加入对应 Goal 边界、迁移和发布选择回归；没有执行远端 CI，也没有安装/发布用户应用。

验证使用审查时独立快照加本任务文件，未清空并行任务的 dist。Local Host TypeScript 编译通过；5 项边界测试、9 项真实迁移测试、1 项发布选择/指纹测试、2 项真实 Home 安装与 npm pack 回归全部通过。原审查快照 boundary:check 从 8 项降至 F5 两项真实 App 数据库越界，没有放宽该规则。当前共享工作树另有新增包/依赖接线的在途错误，已交 Builder 与群聊任务串行协调。

原始日志位于 `/Users/yijunwang/.codex/visualizations/2026/09/26/01a0db8f-26a6-7951-9e90-62990912666e/followup-evidence/`，包括 build、migration、packaging、snapshot-boundaries 与当时共享工作树的 boundaries。F1–F5/F7 及浏览器问题的交接不是已修复声明；由相应 owner 完成后按其实际 diff 和证据复核。

## F5 后续复核

2026-09-26：只读核对当前源码，ConnectorConnectionStore 与 ConnectorProtocolStore 的 schema/SQL 已归 horizontal/connector-host；App 只负责打开 Home 数据库、注入 secret/lifecycle port 与 HTTP 装配。Projects 提供 listProjectDatabasePaths，Sources 提供 inspectAccountSourceCredentials 与 refreshSourceConnectionState，Images 提供 inspectImageCredentialReferences，ModelProviderStore 提供其 owner 内的凭据引用读取。web-connector-connections 已无直接业务 SQL；来源状态变更走 Sources.commands.save，保留状态转换检查和事件写入。

检查 owner 原始日志 `/tmp/connector-regression-fourth.log`（30 通过）、`/tmp/connector-cli-mcp-third.log`（9 通过）及较新的 `/tmp/connector-final-tests.log`（60 通过，无失败/取消）。最新组包含真实 SQLite 的来源账号切换、旧历史/计划保留、断开与重新连接回归。本任务未机械重跑共享构建或测试，未改 Connector 业务文件。`/tmp/connector-boundaries.log` 已无 F5 数据库越界，只剩 plugin-sandbox maturity/README 与 local-host workspace 依赖声明三项在途错误，归其他 owner。当前未发现 Connector 范围内阻断点；这一结论关闭原 F5 结构缺陷，不代表真实第三方账号或最终体验 QA 已通过。

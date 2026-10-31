# T145 R1/R2/D1 增量复核（负责人：二审线 5 · Codex）

结论：**R1、R2 已关闭；D1 的语义与存储方案已落实，剩一项直接关联的动作合同/写集遗漏须补。** 未发现这三项引入新的授权语义矛盾。不重开整份方案审查；T141/T143/共享锁继续 WAIT，当前不据此实施。

本轮只核 `/private/tmp/t145-ready-plan/PLAN.md` 修订版与 `accepted-section8.patch`，对照原 REVIEW 的 R1/R2/D1 和根明确采用决定。代码证据仍固定原审查头 `b0567bf545a74b858e4fdeddd5e66432b1065b21`，不把后来 main 的变化当作本线复核范围。

| 项 | 增量核对 | 结论 |
| --- | --- | --- |
| R1 | PLAN §2.1 明确 CHECK(kind)、集合列、完整 baseline/独立 fixture 同步且库版本保持 1；旧形状拒绝、字节不变，缺库只读/删除不建库；迁移、转换、补列、回填和升版本绕行均禁止。§7 与 patch 同步。 | 关闭。数据库版本 1 与公共动作版本升级分属不同合同，没有冲突。 |
| R2 | PLAN §3 补真实项目 view 的 `web-request.ts` → `renderHomePluginStages` → 已有 stage prefix → 项目包 frame matcher → `routeProject` → `packageDocument`/page authority/call；§5 列入准确写点及待确认锁；§6 从真实项目工作台导航进入并验证初始/刷新/重开，排除特制 URL 替代。Home null、管理路由限制与 Agent 原链保留；patch 同步。 | 关闭。 |
| D1 | 同条 project_reach 记录保存 `approved_capability_ids`；全部 operation 的 effects.capabilities 中 capability id 并集、去重排序，明确不是 operation.id、不按目录/scope 过滤；Host 取 verified contract，用户不能提交集合。当前集合为历史批准子集才沿用，新增 Home-only id 也重问；UI 口径一致。 | 核心语义关闭。 |
| D1 owner/持久化 | project_reach 必填数组（可空），其它 kind 必填 null；Memory/SQLite/Home facade 同步，输入和输出数组复制；manifest_digest 保持同意时 Manifest 摘要原义；重新确认事务撤旧写新，consent_id 尾检；当前包、安装 effects、目录/权限/世代检查保留。 | 无新矛盾；复制数组是历史事实不可外改的必要实现要求，不是第二 SSOT。 |
| D1 依赖及验收 | 已从默认方案和写集移除 loadByManifestDigest 与 sandbox-package-store 改动，取消历史包留存/查询依赖；T141 只提供实际同安装升级、当前包与恢复。RAC-2649 按历史批准集合、任意新增 id、取消/确认/重启一致验证，旧包缺失不再作授权条件。 | 关闭；当前包验签不因旧包不再使用而放宽。 |

## 唯一仍须补的直接合同项

**把 `apps/local-host/src/plugin-install-actions.ts` 加入精确候选写集与共享合同锁，明确两份 installed-list 输出也要升级。**

PLAN §4 已笼统要求“所有输出 schema 同步”，但 §5 的精确写集仍只列 `installed-plugin-consent-actions.ts`，没有这一实际输出 owner。原审查头中：

- `plugin-install-actions.ts:33–44` 定义另一份 `consentRow`，`additionalProperties:false`，被 `installedView.consents` 引用。
- 同文件 `87–96` 的 `plugins.home.installed.list@2` 与 `plugins.installed.list@3` 都输出 installedView。
- `plugin-install-service.ts:241–246` 的两份 list 经过 `installedPluginViews` 使用同一 ledger；`PluginInstalledView.consents` 本身就是 `PluginConsentRecord[]`（contracts/plugin-trust.ts:107）。因此即使非 project_reach 记录新增的是 null，也已改变这两份动作的输出形状。

只更新 `plugins.consents.list/revoke` 会遗漏这两份 schema；正常安装列表中只要有同意行，新字段就与旧 additionalProperties:false 冲突。需将这两份动作及其实际调用方/快照一并纳入 D1 合同更新。按最终采用基底的动作版本顺延，不在本审查冻结未来版本号；这不是要求更改安装确认的输入权限或重做安装流程。

根可在采用计划时补此准确路径、两份动作名称和对应调用方同步要求，作者同步 PLAN 即可。**不需要因此重审全部 R1/R2/D1、重新问产品决定或重开工程设计。** accepted §8 patch 的“公共合同形状变化升动作版本并同步调用方”已覆盖原则，无须为每个实现文件继续膨胀 accepted 文本。

## 证据与边界

- 本轮为文件/固定头源码只读核对；没有 build、test、browser、CI/Full、变异或真实 Home 实操，也未应用 accepted patch。
- 曾查询一个不存在的 schema 文件名，git 明确报不存在；随后核到 baseline 实际就在 `home-plugin-store.ts:9–12`，版本为 1。不存在文件未作为证据或新增写点。
- 主检出 `08c9933d57e153d1d59bf2811f203056d4358992`、clean；本轮读到本地 origin/main 已为 `a1117b3bada22b064a5df2e88f21d1a5ee6aab4f`。本线未 fetch/更新 refs；PLAN 中 b0567 的起止说明是作者前次快照，不是本轮远端最新证明，实施派单仍按已有要求刷新采用基底与锁。
- 唯一写入本 `REVIEW-INCREMENT.md`，不改 PLAN、仓库、coordination 或 GitHub。不宣称实现、工程验证、full=true 门槛或用户验收通过。
- T377 最终资源增量仍保留优先队列；待根送准确 H 后，只核资源与同步小差集，五文件行为二审结论不重开。

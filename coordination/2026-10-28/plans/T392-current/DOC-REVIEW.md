# T-392 共享文档独立窄审

**最终结论：两组文档必修已落实，本窄审范围无剩余必须修改项；公开合同、Home 数据路径／snapshot owner、动作及权限身份未见误改。** 本结论仅覆盖文档语义与旧活引用，不替代源码二审、doc-citations 门禁、作者动态或独立验证。

最终增量回读：`/tmp/t392-evidence/root-shared-docs-final.patch` 与当前工作树所列 20 份文档的 scoped diff 完全相同，基于同一 HEAD `b88f7115c8f609079592402330f4bbaa219ae9c7`，仍为未提交文档候选。RUNTIME-MIGRATION、privileges、feed-inbox-runtime-plugins 三份历史正文已与 HEAD 完全相同；migration.md 的 1625 行仅第 78、110 行顶层当前入口表改变，156、214、1321 行的历史路径已恢复。spec.md:565 已用 `judgment-rules/`；BL-900 两处业务模块名已更新，公开 `packages/contracts/src/modules/functions.ts` 保留。两份历史审计只更新本地链接 target，原标签／日期／证据保留。最终 20 份文档的 HTTP(S) URL 序列与 HEAD 均相同，固定 SHA 远端链接未改。本次只读核这些增量，未新增测试、构建或扩大历史重写；没有核根另交二审 1 的 doc-citations 源码／测试改动。

以下保留首审输入与已关闭问题，作为修正依据。

输入为 `/tmp/t392-evidence/shared-docs-candidate.patch`、`shared-historical-link-targets.patch`、`path-mapping.json`，并回读 `/private/tmp/t392-dev` 当前实际 22 份文档 dirty diff（HEAD `b88f7115c8f609079592402330f4bbaa219ae9c7`）。根补充的 README Host 链接、SSOT 正文、GLOSSARY R-A4 实施状态已在实际 diff 中。没有构建、测试、浏览器或门禁运行；没有写产品、共账或 GitHub。本线只写本报告，作者／验证／二审保持原归属。

## 首审问题（最终回读均已关闭）

### 1. 恢复历史证据中的当时路径，当前路径另注

候选含少量对历史正文的机械路径替换，不能把它们当作当前活引用。尤其：

- `specs/repository-anti-corruption/privileges.md:144`：PG-010 的历史位置被改成 `modules/judgment-rules/src/builtin.ts:35-62`。这不是本次 37 条路径图中的迁移项：`builtin.ts` 早在 FI-2 删除，新的 judgment-rules 目录从未有过该文件。该表开头明确扫描基准 main `2e5bc0a7d`、行号以扫描时为准。应保留原 `modules/functions/src/builtin.ts`。同表 PG-010 的当时 Host 位置及 #1283／#1307 完成记录、PG-034（199 行）的扫描位置、PG-045（470 行）的 #799 复查正文，也宜保留当时路径；需要当前入口时另加带 T-392 日期的路径说明。
- `docs/system/RUNTIME-MIGRATION.md:128,132`：这段在 4.2 的原迁移后果分析里，前文已说明这些后果对现行候选不再发生。132 行说某文件第 16 行用 `io.molis.work.inbox` 算键，是过去接线事实；替成 `judgment-rules-host.ts` 会把旧行为错误安到新路径上。恢复这两处历史路径，另注当前路径即可，不重新审判旧迁移结论。
- `specs/action-architecture/migration.md:156,214,1321`：分别处于 2026-09-25 系统判断证据、同日插件退役证据、2026-09-26 的后续缺口记录。现在正文被改成 11 月才采用的目录，且保留原日期／原运行证据，时间关系失真。恢复这些历史正文的旧路径；顶层当前入口表（78、110 行）的新路径可以保留。
- `specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md:48` 是历史设计的「现在在哪」调查表；开头明确父稿与历史设计保留，后文实现已改变 Inbox 绑定 owner。这次只改其中判断模块路径会使旧设计看似现行。建议撤回该处正文替换，必要时在开头统一注明 T-392 路径变更。

不要求重写这些历史行为／owner 结论。最小修法是撤回上述历史正文的本次替换，再用一条清晰的现行路径说明连接到新入口。没有发现固定 SHA 的远端链接被改：对实际 22 份 dirty 文档逐文件比较 HEAD 与当前的 HTTP(S) URL 序列，全部相同。

### 2. 补齐两处现行旧活引用

- `specs/action-architecture/spec.md:565`：同一句已经把业务模块改成 `modules/judgment-rules`，Workbench 所属目录仍写 `functions/`。此处是现行职责规范，改为 `judgment-rules/`，或明确这是旧目录并紧接当前路径。
- `specs/BACKLOG.md:313`（BL-900）：两处把当前业务实现叫作 `modules/functions`（`filterSuggestedBehaviorIds` 的服务消费方、动作输出 schema 的业务模块）。都应指向 `modules/judgment-rules`；同一行的 `packages/contracts/src/modules/functions.ts` 是保留的公开合同，不能改。

## 已核可保留

- 模块 README 的私有包入口改为 `@molis-ai/molis-work-module-judgment-rules`，保留公开合同 `@molis-ai/molis-work-contracts/modules/functions`；包名与目录职责没有混为公开合同迁移。
- `docs/system/HOME-DATA.md:68`、`docs/releases/CHECKLIST.md:41` 只更新实现位置，仍为 `functions/functions.db`、版本 1。GLOSSARY R-A4 明确快照 owner `modules/functions` 不变；窄范围回读 `home-stores.ts:39` 与 `store-schema.ts`，分别仍为该 owner 和 `path: "functions"`，没有将物理实现目录当作持久身份改名。
- CALL-CHAINS 的实现路径更新保留 `/api/functions/settings`、连接库的插件位 `functions`／槽 `typesafe`，未改变动作身份、权限或连接归属。`functions.*`、`system.functions`、`functions:manage`／`functions:invoke` 与 MCP 名称没有被替换为 judgment-rules。
- README Host 相对链接和 SSOT 第 133 行正文已由根补齐；GLOSSARY R-A4 的旧名列是原名记录，Home owner 是合同，不算残余旧活引用。其“已做”只能表示实现迁名，不外推 CI、独立验证、采用或产品验收。
- `shared-historical-link-targets.patch` 只改两份历史审计的本地 Markdown 链接目标，保留原调查标签、日期、结论与证据计数。可保留；不要求把历史代码标签也扫成新名。
- 包清单 §5.1 是由现行代码生成且被门禁核对的事实表，本次路径及 1969→1963 的量测行更新有其现行表职责，不按固定历史正文要求撤回。

## 其余旧名的边界

扫描现行目录后，未见本报告两处之外需要在本窄审范围补改的明确旧活实现引用。其余命中主要是 GLOSSARY 的旧名／snapshot owner、Home 的 `functions/` 数据路径，或带日期、固定 SHA、原审计／已完成切片的历史正文。例如 `HUGE-CLASS-MIGRATION.md` 的 `4d59cd4d` 快照、roadmap 的 `d81b12cb` 基线、AI 入口清点 `11878059`／`06a64c98c`、v0.3.0 发布记录，以及已完成 FI／W5／W6 切片与 repository-cleanup 清点。不要为检索零命中机械扫改这些内容。`specs/repository-anti-corruption/spec.md` 的原审计分组／缺陷证据中的旧路径也同理，与当前 §5.1 事实表分开处理。

本报告没有复跑二审 1 的源码和 doc-citations 检查，也没有把作者既有日志署成本线执行。以上文档调整落实后，可由根按最终 scoped diff 收口；不需要因此新增一轮构建或测试。

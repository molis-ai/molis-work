# 2026-11-10：D0039、D0244 / D0242 验收闭环

状态：最新 main 基准的定向验收通过；本轮仅补回归测试与验收记录，没有产品代码补丁。新增测试尚未合入。

## 批准与基准

用户在前两类低风险 PR 合入后批准「先做前两组：已有修复的安全与生命周期验收，原方案内遗漏直接补齐，新机制另行评估」。本轮仅覆盖 D0039 和 D0244 / D0242；不扩展到 D0033、记忆清空或 CI 策略。报告来源与历史状态见 [当日分类](2026-11-10.md)。附件没有建议／建议归位字段；已有专项 spec 保存此前批准方案。

已 fetch 的基准 `c7873a0f2fcb98743aa7f1ed8fb3d6f307a19c22`，包含 #2004、#2005、#2006、#2007。隔离工作树执行，不接触真实 Home。检查在途 PR 未发现对本轮两组机制的重叠修复。

## 固定评估表

| 问题 | 引入PR | 问题描述 | 修复方式 | 建议修复方案 |
| --- | --- | --- | --- | --- |
| D0039 · 高 | 历史引入 #963；修复 #1971 已合入 | 报告担心取消句柄已结束而真实作业仍执行，项目库提前关闭／删除。当前 Runtime 在每个 pending 创建时登记真实 Promise，按项目等待；现有跨项目测试同时放行双方，隔离等待证据不够强 | 无需修复 | 本附件建议／归位未提供；沿已批 Runtime 管真实作业、Host 编排关闭／删除的方案。补强项目 A 关闭时 B 仍悬挂的断言，核对 Home、项目插件、安装插件、声明清理和分区入口；不改变取消与无界等待语义 |
| D0244 · 高；D0242 · 中 | 原裸索引行为 #839；修复 #1974 已合入 | 当前 Search 提供带来源授权的目录，Knowledge 在派发与提交前检查。已有返回中撤权测试；缺少真实 Host 中预存索引后先停用，再触发自动／手动整理的零 HTTP 请求验收 | 无需修复 | 本附件建议／归位未提供；沿既有 Search 授权和索引、Knowledge 整理、Host 公开端口方案补场景。保留已有准备期撤权、返回成功／失败拒写及重新注册世代隔离测试；不复制授权机制 |

## 调用链核查

- D0039：`activation-jobs.ts` 的 settling 在 pending 创建即登记；`background-service.ts` 先 stopProject 再 drainProject。Home 的 `HomePluginExecutor.stopProjectJobs` 经 `HomePluginHost` 接入 `project-host.ts` 的关闭；项目与安装插件分别在 `project-plugins.ts`、`installed-plugin-host.ts` 调同一 platform 的 stopProjectJobs。
- 项目回收和永久删除都经 `ProjectDeletionService`；回收先拒忙并持有执行预约，永久删除在目录删除前 await releaseProject；Web 的 releaseProject await closeProject。数据清理由 `plugin-project-cleanup.ts` 按声明 owner 执行；分区先 block 再 await 真正收尾，随后关库删文件。停止／卸载后的 owner 清理由既有 Home 清理测试验证。
- 插件停用和整个 Home 关闭会撤销权限并使迟到写被拒；既有合同不承诺强制终止插件任意 JavaScript。这里不把项目关闭的等待合同擅自扩展成所有 stop 都无限等待。
- D0244：Host 的 `createKnowledgeHost` 经 `SearchService.indexedCatalog` 取得目录并携带 assertCurrent；自动 settle 先 catchUp，失败不 kick。显式整理和自动整理使用同一个 KnowledgeOrganizer。模型 writer 使用现有 hostTextGeneration 的 beforeDispatch，返回后重新取目录、检查版本和原来源授权，再写成功或失败。

## 验证

整体构建通过。16 个定向文件共 189 个测试全部通过（串行、独立临时 Home，经机器槽，2.0 分钟）。

| 问题编号／待解决点 | 改动与所在提交 | 验证方式与结果 | 剩余问题／关闭结论 |
| --- | --- | --- | --- |
| D0039-01/02/04：句柄取消后真实 work 未退出，关闭／清理不提前返回 | 产品已在 #1971；本轮不改产品实现 | activation-jobs 19/19，包含 Home 关闭、项目插件关闭、删除 hook、撤权、停用、后继拒绝 | 基准上通过 |
| D0039-03：库的同轮拒绝与延迟删除 | 复用现有实现 | partition-deletion 5/5，实际 WAL/文件仍在、读请求拒绝、放行收尾后文件消失 | 基准上通过 |
| D0039-05：不等其它项目 | 本轮强化原测试，目标项目单独放行，另一项目仍悬挂 | 关闭在另一项目未放行时完成，另一项未被取消且随后成功写入 | 新断言通过，尚未合入 |
| D0039 各入口、声明清理、停止／卸载后数据清理 | 静态核对公开调用链，未新增入口或机制 | deletion-service 20/20（含回收预约／拒忙、永久删除顺序），hooks 11/11，declarations 3/3，home-cleanup 5/5，executor 3/3，background 24/24，composition 4/4 | 基准上通过；没有把强制终止任意插件代码当成合同 |
| D0244-01/06：准备期撤权和迟到成功／失败 | 复用现有原授权检查 | knowledge-cards 22/22，含真实派发前检查和成功／失败均不记账 | 基准上通过 |
| D0244-02/03：停用、同步失败、无 reader、跨项目和重新登记 | 复用 Search 公共索引目录 | system-search 30/30；Home／project 世代检查都拒绝旧快照 | 基准上通过 |
| D0244-04/05：真实组合链与 SDK HTTP 返回期间停用再启用 | 复用既有场景，保留原拒绝断言 | knowledge security 9/9，lifecycle 5/5；旧结果拒写、新整理恢复 | 基准上通过 |
| D0244-07 / D0242：已索引来源先停用，自动／显式整理零请求 | 本轮扩展同一真实 Host 来源夹具 | 两入口各覆盖 2.3 秒观察窗口，实际模型 HTTP 次数均零；重新启用后真实 HTTP 和卡片提交成功 | 新断言通过，尚未合入；同一 S-41 文件已有安全门禁收录，无需重复新增门禁 |
| 知识读取、Host 搜索接线回归 | 无产品改动 | system-search-host 1/1、knowledge-service 15/15、knowledge-reads 13/13 | 基准上通过 |

D0039 与 D0244 的原报告「部分修复」在本基准没有复现为产品缺陷；D0242 所称完全缺少拒绝测试与现状不符，本轮补充真实入口证据。关闭的是上述报告问题及已列验收范围，不代表所有插件任意行为已验证。未跑商业模型、真实 Home、所有插件组合，也未运行新的全量；仅改两份既有测试与文档，无共享核心产品改动。

门禁：整体构建、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`git diff --check` 均通过。未改页面资源、产品源码或公开合同，不涉及页面体积与 API 快照更新。

# DD2 验收证据

2026-09-06。Goal `goal-reorg-dd2`，Contract revision 1。

## 结果与完成等级

提案与决定这一迁移切片已实现并完成内部功能回归：提交、读取、预检、确认、拒绝、修订通过公开应用端口工作；原生与历史 UI 由真实 Contribution 提供。不是仅有目录或接口占位，也不代表全产品发布验收。

实际修正了一项已复现的旧问题：同批确认父 Goal 收口与新子项关系时，原顺序在关系尚未落地前检查收口，误拒合法提案。现在预检和正式决定共用依赖顺序；失败仍整份回滚，不跳过 coverage 或用户确认。

## 验收条件

| criterion_id | 结论 | 证据 |
| --- | --- | --- |
| goal-reorg-dd2-boundary | 通过 | `dd2-caller-audit.md`；公开 owner / Host caller 检查 0 errors；故障注入边界测试 12 项 |
| goal-reorg-dd2-exit | 通过 | native 四入口、全部历史提交/决定及独占 helper 已退出 Coordinator；提案 UI/copy/client、分组和最近结果实际改绑；开发说明同步 |
| goal-reorg-dd2-result | 通过 | 以下 209 项串行回归含真实浏览器、CLI/MCP/Runtime、数据库重开与持久化/副作用断言 |

## 最终串行回归

命令：

```sh
node --import tsx --test --test-concurrency=1 tests/v1.test.ts tests/planning-engine.test.ts tests/proposal-entry-chain.test.ts tests/proposal-lifecycle-closeout.test.ts tests/draft-proposal-supersession.test.ts tests/draft-dialogue-application.test.ts tests/i18n.test.ts tests/web.test.ts tests/goals-proposal.e2e.test.ts tests/goals-draft.e2e.test.ts tests/goals-relation.e2e.test.ts tests/goals-safety.e2e.test.ts
```

日志：`/private/tmp/dd2-acceptance-regression.log`。**209 tests / 209 passed / 0 failed / 0 skipped，38.70 秒，进程 exit 0**。

| 路径 | 实际检查 |
| --- | --- |
| native 提案 / Planning | 提交前字段校验；不写正式事实；有来源的版本与 baseline；逐项决定、整份决定、冲突、环与已接受 Goal 的限制 |
| 可信确认 | 无明确确认、错误用户身份、错误来源、旧 action/baseline 不得越权写入；原错误类型与恢复提示保持 |
| 原子与恢复 | 物化后注入失败，Goal/Relation/Policy/Risk/Proposal/Claim/Run/事件共同回滚；同 key 重试、重放和数据库重开不重复写入 |
| CLI / MCP / Runtime | 真实 App/Host 调用从 Draft 到提案、check、明确用户决定；历史 Candidate 拒绝、重放和 Host 重启；Draft Runtime 争用、到期、分页及恢复 |
| Web 原生 / 历史 API | native 整份确认、冲突预检、Candidate 晋升、风险修订、历史 Contract 确认、Candidate 与 Rewire 独立决定，以及中英文 full/refresh 页面 |
| Chrome 原生决定 | 从 Inbox 目录打开真实表单；空理由定位输入框；断网不改目标树且保留理由；恢复重试只创建一次；退回不创建；刷新不重复 |
| Chrome 风险修订 | 老版本风险措施文本保留；漏选定位；失败保留 radio 和原禁用状态；保存产生 pending 修订，正式 Goal/Risk 不变；再次明确采用才写入 |
| Chrome 历史决定 | 批准 Candidate 创建一条 Goal，但 Rewire 仍单独 pending；拒绝 Rewire 不删除 Goal、不新增关系；刷新恢复正确 |
| 共享表单回归 | Draft 编辑、关系增加/移除、Risk/Impact 维护和错误恢复继续走真实浏览器，覆盖迁出的公共输入校验与错误文案使用者 |

Plugin / Workbench 构建、root TypeScript 检查、`git diff --check` 和 package boundaries 均通过。其后只整理顶层声明间空行及文档，不改行为，不为凑次数重跑已终止的无变化测试。

## 失败记录与纠正

新浏览器用例最初直接点击隐藏详情，随后误用了旧 Decision Center 展开入口。按当前 Workbench 调用链确认实际入口是 Inbox 的 `data-feed-entry-id="decision:..."` 后改为真实目录点击；没有更改产品显示逻辑。随后用例把整份 Proposal 状态写成 `applied`；既有契约是 Proposal `approved`、Item `applied`，修正断言并同时检查逐项结果。最终三条浏览器链均通过。

历史风险场景只在隔离测试数据库重建旧版本的 payload，不放宽当前提案验证。失败日志与各切片证据保留在 `dd2-progress.md` 所列位置；不把测试失败描述为已修复的产品问题。

## 边界与未包含项

本次没有迁移 schema、改用户数据、操作现用 4173、安装 App、修改 Runtime / 模型配置或公开发布。测试使用临时数据库、临时端口及独立 Chrome profile。

DD1 / DD2 完成不自动完成开放父 Goal；父项仍需按原完整 Contract 收口。DV4 GUI 首启仍需暂停现用服务的明确授权。全产品最终用户行为 E2E、总清理、再次 E2E 及最初分包/huge class/调用链/开发规范总审查继续保留，不由这 209 项代替。

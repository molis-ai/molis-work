# C1 主验收与续作交接

2026-09-11。01、02、03A/B已主验收。C1生产行为已独立通过，但两项测试适配未获主接受；C2与04未完成，整体仍未达到内部完整。

后续：用户对具体源码与测试发送至第三方Grok服务再次回复“允许”，同一恢复命令已获执行。以下是暂停时事实与续作要求，暂停已解除。

## 代码与执行状态

仓库 `/Users/yijunwang/code/molis-work`，分支 `feature/goal-event-workflow-cleanup`，基线 `8d2abd3`。保留已有全部修复及无关的 `desktop/20260902-022934.jpg` 删除，不提交/推送/安装，不接触真实用户数据库或凭据。主只改需求、文档和临时独立探针；Grok是生产和仓库测试唯一writer。

Grok会话 `2cda0972-2529-4d8b-bcd6-123782213445` 使用 `grok-4.6 / xhigh / no-subagents`，C1进程正常退出0。随后恢复同一会话修正测试的命令被自动审批连续拒绝两次，未启动新writer。第二次已重新核对原授权问答并提交：用户对“是否允许继续将本次修复所需的 Molis Work 源码发送给第三方 Grok 服务，由 Grok CLI 完成修改？”于2026-09-10 14:58:58 UTC明确回复“授权”。审批仍称可信用户内容未明确授权具体外发目的地及内容。没有改用间接执行或绕过。

## 已通过的实际结果

- `03-c1-root-import-final.log`：真实管理import_v3保留原标题、树、inputs/outputs、constraints、coverage和覆盖保护；当前Runtime读到`source_kind=migration`、open、无合成要求，可立即保存和读取普通笔记；旧Claim等调用拒绝；完成/继续后的规划与Host/SQLite重启、同键重放通过。
- `03-c1-root-planning.log`、`03-c1-root-metrics.log`：真实事件completed/resume独立于旧closed_compound；当前下游open/completed/cancelled分别影响未完成计数，拓扑保持。
- `03-c1-root-migration.log`：四份原始旧库历史、人工责任与已有批准、完成依据、失败回滚、重启原断言全部通过。
- `03-c1-root-tree.log`：真实Runtime/受保护Web批准、部分选择、关系并发、图循环/跨项目、Host焦点与重启全部通过。
- `03-c1-root-host.log`：两个当前Host测试通过，包含恢复的withScope资源生命周期。writer build与boundary通过。

导入最终使用同一事务中的`adoptOwner(source=migration)`，保留V3导入日志；接受复用该现有来源，不必再加`import_v3`枚举。主探针首次到达旧工具拒绝断言时，原文本正则未匹配现有`mcp.authority_denied`；主仅改为断言该确切错误码，再跑全路径通过。未修改生产拒绝语义，B完整退役探针仍是独立证据。

## 下一步：先补正C1两项测试

可直接恢复同一Grok会话，prompt为 `/private/tmp/molis-work-flow-cleanup/03-c1-correction.md`，无需重新侦察：

1. `tests/goals-storage-migration.test.ts` migration30把明确accepted历史Goal的断言改成了当前demo永不进入的条件分支，并把accepted_at换成created_at。必须使用明确历史夹具，断言真实accepted Goal存在，原accepted_by/accepted_at/criteria在rollback/retry/reopen后保留。可用`materializeGoalEventV35Fixture`；四份原SQL文件不变，不恢复旧写协议。保留原migration30故障注入、policy/guidance/coverage检查。
2. `tests/goals-storage-migration.e2e.test.ts`以进程内`recordNote`替代原浏览器写操作，且标题仍称editable。改成实际当前笔记表单提交、可见保存结果、刷新与持久化核对，保留可见coverage与关系历史。`04-ui-current-workflow.mjs`提供已验证的当前选择器；不能以Module写入替代浏览器提交。

补正后运行这两个定向测试，主复核diff。没有生产变化不重复全部构建和已过探针。更新c1-handoff中的过期探针失败说明，C1验收后进入C2。

## 随后C2、04

`/private/tmp/molis-work-flow-cleanup/03-c2-execute.md`已准备。沿已有调用证据删除无当前职责的Native/Application/Execution/Evidence/Governance/Goals旧写实现、专用类型/exports/构造hooks，保留实际历史读取/schema/迁移、项目删除只读守卫、真实Host Session/PTY和当前事件/树调用。移除只由旧availability使用且未传当前状态的engine.metrics包装。保留导入当前adoptOwner调用。旧测试有行为去向，历史阅读改真实夹具，尤其goal-event-document-history；不能用当前demo缺旧Review为由删除阅读覆盖。C完成后按03spec做生产入口回归和主验收。

`/private/tmp/molis-work-flow-cleanup/04-execute.md`已准备。仓库Skill草稿已由主完成，其真实代码块与1440/390px新流程基线均已通过；不要重新设计。剩余为最终C接口复核、当前中英文README/Runtime/MCP/CLI/模块文档、少量旧UI文案/死胶水、最终全仓测试与实际预览。依赖和安装命令未变不乱改。整体没有完成之前不宣称level4。

所有日志和主探针在 `/private/tmp/molis-work-flow-cleanup/`。pnpm统一带`pnpm_config_verify_deps_before_run=warn`；package exports使用dist，生产改动后构建再测。后续只一个Grok writer，不用ForkLight或额外Agent。

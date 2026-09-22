# B暂停交接

2026-09-10。B主要公共入口已退役，尚未主验收；C与04未开始。01/02验收仍有效，A的日常事件核心已验证，普通保留工具的身份校验补正如下。当前没有Grok writer运行，无提交/推送/安装/发布或真实数据库修改。

## 暂停与恢复材料

用户此前已明确指定Grok CLI/Grok4.6/xhigh执行，并在被告知第三方源码外发后于12:00:54 UTC回复“允许”。本次恢复同一会话时自动审批再次拒绝；主附上该问题与回答原文重试，仍被拒绝，理由是它无法从可信用户内容确认本仓库源码发送给第三方Grok服务的授权。两次有目的尝试未解，未绕过。

原Grok会话 `d89fc572-966c-4ff8-923b-46f105ba117c`；待执行收尾prompt为 `/private/tmp/molis-work-flow-cleanup/03-b-finish.md`，里面已包含实际失败、最小修正与验证命令。恢复必须用同一会话，保留已有范围，不重开全面扫描。B通过后才执行已准备的 `03-c-execute.md`，然后04。主继续负责需求、裁决、独立探针与验收，Grok仍是生产/测试writer。

## 已落地

- Runtime与管理旧工具discovery/dispatch、Host旧注册、CLI旧operation和旧HTTP POST已退役；删除14个旧专属handler/input文件。管理snapshot、项目选择、当前Goal指针、当前事件/树/指导/规划/回收站入口保留。
- Capsule入口改取事件目录；demo已部分改成事件报告/笔记/收尾，但创建循环尚未改完，因此不能使用当前demo作成功证据。
- Session提取中间误写的对象类型判断已由writer修正，主加强真实Runtime“系统生成Goal ID后立即更新Session焦点及一条活动”断言，最终通过。
- 删除文件由writer的git rm暂存；其它改动多为未暂存。没有commit。用户原有 `desktop/20260902-022934.jpg` 删除保持不动。

## 必须先修的B问题

1. **回收站身份遗漏**：`v1PayloadTool`把actor放进payload；A仅移除/校验顶层，Host注入顶层actor后，trash handler仍取嵌套actor。真实Runtime提交 `payload.actor_id='forged-user'`没有被拒绝。按03spec决定，把trash/restore/trash_list改成有限顶层输入，Runtime拒绝旧payload，Hostactor必须用于持久化审计；管理同一顶层显式actor。保留各操作user_confirmed用途，不放宽树/约定批准。
2. **实际演示seed失败**：`demo-seed.ts`仍用旧createGoal循环，在RELEASE笔记触发 `event_state.not_owner`。所有demo Goal改走真实createIntent；类型、真实要求/绑定、报告与明确收尾配齐。不得靠放宽ownership/requirement/closure通过。
3. **边界检查失配**：`scripts/check-package-boundaries.mjs:684`仍读已删除 `apps/cli/src/goal-commands.ts`，报ENOENT。将真实所有权检查改到当前接口/移除边界；不恢复无职责handler，不全局忽略缺文件。
4. **新测试读错返回值且存在无效断言**：`goal-command-wire.test.ts`读added.guidance，实际结果是added.entry。改为真实持久化query/内容/归属/审计actor断言，删除 `?? 1`常量兜底和typeofgraph断言。`host-entry-consistency`的trash改最终顶层请求，仍验证真实排队竞争及返回状态一致，补Hostactor。

## 暂停时主独立证据

日志统一在 `/private/tmp/molis-work-flow-cleanup/`：

| 检查 | 结果 |
| --- | --- |
| 最新 `pnpm_config_verify_deps_before_run=warn pnpm build` | 通过，03-b-paused-root-build.log |
| 完整真实Runtime discovery/dispatch/事件闭环与Session新建焦点 | 通过，03-b-paused-root-runtime.log |
| 真实Host registry/invoke、CLI unknown、HTTP404与无副作用 | 通过，03-b-paused-root-retirement.log |
| 树提案/受保护决定/选择原子性/循环/跨项目/Host焦点/重启 | 通过，03-b-paused-root-tree.log；最初sandbox listen EPERM后以本机端口授权重跑通过 |
| 已提交主报告、次级Registry失败、原键补齐一条活动 | 通过，03-b-paused-root-session.log |
| HTTP非法progress整批拒绝、completed/cancelled继续/重试/重启 | 通过，03-b-paused-root-web.log |
| git diff --check HEAD | 通过 |
| boundary | 失败，上述已删CLI文件ENOENT，03-b-paused-root-boundary.log |
| 实际demo seed | 失败，event_state.not_owner，03-b-paused-root-demo.log |
| 5个入口/Host/capsule测试文件 | 17测试，16通过/1失败/0skip，03-b-paused-root-entry-tests.log；上述added.guidance错误 |
| Runtime回收站旧payload身份 | 失败，Missing expected rejection，03-b-auxiliary-before.log |

本地pnpm11会因环境的virtual store选项差异尝试自动install；本次未允许purge/install。使用已有的进程级 `pnpm_config_verify_deps_before_run=warn` 完成构建，未修改依赖/配置/锁文件。包exports指dist；Grok修源码后先构建再跑主探针，不与主并发构建。

主新增 `03-auxiliary-identity-acceptance.mjs` 已按真实指导返回entry、query.entries和 `goal.restored_from_trash`审计名修正测试输入；首次失败仍是嵌套actor未拒绝。writer不能修改主探针。原A/B/tree与四份v35迁移断言保留。

C独立反例和决策已追加03spec：V3导入owner为null；旧closed_compound字段会让已明确继续的open事件Goal从规划候选中消失。探针分别为 `03-import-planning-acceptance.mjs`、`03-planning-only-acceptance.mjs`；C按当前创建/转换与事件状态修复，保留真实历史/图关系。C不能只删公开白名单，要删除无职责Module实现/类型/构造hooks。04负责仓库Skill、中英文文档、最终全仓与实际桌面/390pxUI；不安装全局Skill。

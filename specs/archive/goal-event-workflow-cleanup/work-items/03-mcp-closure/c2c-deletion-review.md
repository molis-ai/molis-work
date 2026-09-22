# C2c 剩余 7 个退役文件删除确认

2026-09-11。当前修改已移除这些文件的生产消费者；本次只请求删除下列源码文件，不涉及数据库、用户内容或其他目录。

| 文件 | 已退出当前流程的职责 |
| --- | --- |
| `plugins/native/goals/src/goal-state-presentation.ts` | 旧 Draft/Contract/Run 状态推导 |
| `plugins/native/goals/src/parent-completion.ts` | 旧父 Goal 自动完成判断 |
| `plugins/native/goals/src/goal-replacement-query.ts` | 未被生产调用的旧替换查询 |
| `plugins/native/goals/src/impact-client.ts` | 返回空结果的旧影响声明提交客户端 |
| `plugins/native/goals/src/safety-client.ts` | 旧风险提交及选择器客户端 |
| `apps/workbench/src/goals-legacy-proposal-ui.ts` | 已移除消费者的旧提案 UI 适配 |
| `modules/goals/src/impact-commands.ts` | 只剩查询转发的旧命令类，读取已由实际查询职责承担 |

主 Session 已核对 `apps/modules/plugins/packages/scripts` 中的文件引用：仅有上述旧状态文件内部引用旧父完成文件，以及边界脚本中的另一历史路径字符串；没有当前生产入口引用这 7 个文件。它们均为 Git 已跟踪文件，合计 220 行。当前树提案、事件文档、创建表单、历史读取与真实 Session 接力由剩余实现承担，仍需通过本批构建及行为验收。

Grok 自动审批拒绝执行删除命令，原因为：`Hard-wait: rm of non-scratch repo source files is irreversible deletion of non-scratch data and must wait`。该次删除没有执行。不得通过另一工具、语言、清空或改名绕过拒绝；其他允许的修改及验证继续。

具体动作：允许 Grok CLI 删除表中这 7 个未使用的退役源码文件，然后继续构建及验收。

用户已明确回复“允许删除这 7 个文件”。此授权仅覆盖表中 7 个路径；此前被拒绝的删除可在本次明确授权下由 Grok CLI 执行，无需再次确认。

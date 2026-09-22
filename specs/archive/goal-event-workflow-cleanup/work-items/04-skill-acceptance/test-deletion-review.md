# 三份退役浏览器测试的删除确认

状态：用户随后对源码／测试／交接内容外发和下列三个文件删除的具体合并问题明确回复“允许”，两项均已授权。唯一Grok writer已执行这三个确切文件的删除，主通过实际git状态核对；以下原拒绝只作为过程记录，不再重复索取许可。

| 文件 | 原测试验证的行为 | 本轮处理依据 |
| --- | --- | --- |
| `tests/goals-draft.e2e.test.ts` | 编辑旧Draft的criteria、closed_leaf等字段，通过`/api/goals/RELEASE/draft`保存并保持未接受状态 | 旧Draft写协议和HTTP已退役；当前约定/要求表单及错误恢复已有独立和仓库测试 |
| `tests/goals-safety.e2e.test.ts` | 通过旧Risk创建表单与`/api/goals/V1/risks`新增Risk | 旧Risk写服务已退役；真实历史Risk阅读仍保留并有回归 |
| `tests/goals-project-policy.e2e.test.ts` | 编辑旧Policy的reviewer数量、lease和capabilities，通过`/api/policy-bindings`写入 | 角色/租约工作门禁已退役；当前项目Guidance和历史Policy读取仍保留并有回归 |

主已读取三个文件完整测试，均为上述独占旧写流程，不含当前Goal创建、约定修改、报告或继续流程。删除范围只有这三个测试文件，不删除历史fixture、实际用户数据或生产文件；退役映射写入03c-handoff.md。Git仍保留原版本。

自动审批原文：`Hard-wait: rm of non-scratch project test files is irreversible deletion of repo data, even if the work item mentions retiring those tests`。未改用另一工具、语言、改名或清空文件绕过。

结果：本表三个确切删除已授权且执行；相关当前行为和历史阅读仍按各自验收清单验证。

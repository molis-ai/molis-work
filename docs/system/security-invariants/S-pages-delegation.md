# S-pages-delegation

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-pages-delegation | Pages 修改内容的委托不覆盖移动、关联、发布或删除；非空 Goal 和省略发布目标不能进入对象自动范围。发布事务拒绝明确 Goal、原 intent 与既有成果目标不一致，不写新 intent、不替换原快照。名称批量读取只含当前项目元数据，拒绝无权限、跨项目调用与超限；已删除／他项目对象不泄露标题或正文。此处证明声明、匹配与业务 owner 拒绝，运行时消费仍由 agent-host 接线。 | `plugins/native/pages/src/delegation.ts`；`plugins/native/pages/src/presentation.ts`；`plugins/native/pages/src/store.ts` | `tests/security-invariants-pages-delegation.test.ts`「APR-07/08: Pages declares real effects」「APR-08: delegation names use strict text references」「APR-08: Pages presentation reads names once」「APR-07/08: publication refuses a different explicit or retained Goal」「APR-07/08: actual Pages writes still reject wrong targets」 | — |

Pages 间接发布、历史恢复与 Goals 两项外层固定动作明确拒绝可复用自动委托。`confirmation-only` 不能降为未声明或完整参数授权；SDK 提取的拒绝与 Pages 原人工路径保持可用由同文件「APR-07/08: indirect publication and historical restoration require confirmation」证明，实际授权入口仍待运行时接线。

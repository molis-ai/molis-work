# 项目自动化建议

根据 Projects 已授权的目录和宿主提供的原能力目录生成建议。建议正文只保留在一次返回和有界保存引用中。偏好属于本服务，报告文稿属于 Pages。

## 开发要求

- 负责：固定路径和预算的只读扫描（含按服务声明的 `project_hints` 对上根目录文件、依赖与 Git 远端主机）、配置去重、建议排序、每人每项目的偏好和保存引用，以及助理主动建议的记录（`config/automation-offers.json`：说过哪些、最近一张卡列了哪些、可撤销的开启、本人的总开关）。
- 不负责：Projects 的目录授权、插件安装与设置、连接凭据、Pages 的文稿和版本；放卡、开启与撤销由宿主（`apps/local-host/src/automation-proactive.ts`、`automation-adoption.ts`）经助理与原主人的动作完成。
- 公开入口：宿主使用 `@molis-ai/molis-work-service-automation-recommender` 的扫描和偏好服务。调用方使用 `@molis-ai/molis-work-contracts/services/automation-recommender` 的动作合同。
- 依赖：`@molis-ai/molis-work-contracts` 的动作与工作区读取合同、`@molis-ai/molis-work-plugin-sdk` 的数据校验、`@molis-ai/molis-work-storage` 的文件条件提交。
- 不变量：
  - 扫描只读授权目录，保持偏好与业务数据原样，工作区内容始终作为数据处理。
  - 报告引用绑定用户、项目和项目创建身份。用户明确保存才写入，重复保存沿用原 Pages 请求号。
  - 偏好按原 revision 条件提交。
  - 证据只留对上的线索（文件名、依赖名、远端主机），不留文件内容；扫描不为找线索新建连接目录。
  - 建议记录按读到的原文条件提交；开启只认该项目最近一张卡列出的建议。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/security-invariants-automation-recommender.test.ts tests/security-invariants-automation-adoption.test.ts tests/automation-adoption.test.ts tests/automation-recommendations.e2e.test.ts`，按仓库规则使用机器槽位。
- 相关手册：[项目自动化建议](../../docs/horizontal/automation-recommender.md)。

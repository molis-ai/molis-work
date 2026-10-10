# Issue

在个人 Home 记录、查看、编辑和删除自己的问题。项目切换不改变数据；无需项目也能打开 `/plugins/issues`。页面、Work 助理与外部 MCP 调用同一组 `issues.*` 动作。外部 MCP 仍需在能力设置逐客户端授权。

包名：`@molis-ai/molis-work-plugin-issues`。本地开发中的内置 Runtime 插件，不代表已经发布或完成用户验收。

## 归属与接入

- 插件 ID `io.molis.work.issues`，Home provider 同名，安装 ID 另行保存。
- 业务 SQL、数据校验、动作、方法与页面归本包；数据库打开、安装、授权、执行和关闭归 Host。
- 数据为 `{home}/issues/issues.db` 的 `issues` 表，当前基线 1；错版拒绝，不自动迁移。
- 原始描述不 trim、不改写；标题与类型必需，补充信息单独保存并标明来源。
- update/delete 要求读取时的 `expected_version`。beforeEffect 后同步事务提交；冲突不覆盖，结果未知不自动重试。
- Home Runtime 不提供项目成果、事件和端口，不得虚构项目满足服务。
- 无团队共享、状态流转、被动采集、截图或旧 Casebook 数据导入。

## 开发与验收

先从根目录 `pnpm install --frozen-lockfile && pnpm build`，再运行 `node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-assistant.test.ts tests/issue-page.e2e.test.ts`。公开 API 仅从本包入口导入。共享合同的改动同时维护 Plugin SDK、手册、Skill 与合同快照。

需求、验收编号与证据维护在 [Issue V0 规格](../../../specs/issue-home-v0/spec.md)。真实界面、助理确认卡与授权 MCP 的实操另行记录；测试通过不代替用户体验认可。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：个人问题的 schema、业务查询与原子写入，页面和五个动作。
- 不负责：安装、数据库连接、授权、模型、项目或团队流程。
- 公开入口：`@molis-ai/molis-work-plugin-issues`；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。
- 不变量：
  - 一个 Home 一份个人数据；没有项目也可用。
  - 原话不改写，类型不默认；可信元数据不从业务输入读取。
  - 提交前复查授权，更新和删除要求版本，冲突不覆盖。
- 改动后必跑：`node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-assistant.test.ts tests/issue-page.e2e.test.ts`
- 相关手册：[插件开发](../../../skills/molis-plugin-dev/SKILL.md)、[Home 数据归属](../../../docs/system/HOME-DATA.md)、[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

# 判断函数与一次判断

拥有草稿、不可变已发布函数、样本和判断记录。系统能力服务通过动作合同调用本模块；编辑器位于 Workbench 的 `src/functions`，没有独立 Functions 插件包。

包名：`@molis-ai/molis-work-module-functions`。

公开入口是 [src/index.ts](src/index.ts)。Host 注入 TypeSafe provider 与当前目录校验，已删除无生产调用者的 judge/行为白名单执行分支。

`actions.ts` 定义已发布规则的查询与执行，`authoring-actions.ts` 定义管理动作。草稿管理要求 `functions:manage`，试跑同时要求 `functions:invoke`；HTTP 和内部客户端共用同一 provider 注册、参数校验及原有业务实现。

旧 MCP list/describe/invoke 名称只映射同一系统动作。查询遵守公共能力及逐客户端撤权；执行必须在“能力 → 对外接入”授予该客户端 `functions.invoke` 动作，旧名称开关不会单独授予执行权限。正式 stdio 入口的新旧名称均由常驻 Host 执行；客户端授权、后端连接和版本状态一致。模型返回后，动作通过内部 `before_result` 回调复查原权限，取消或撤权后不保存判断历史、不返回成功结果。规则身份、版本与原历史保持。Agent 的 Choice/Noul 可保存可选 `action_map`，每个输出键对应 `{ capability_id, version, provider_id }`。调用返回 `recommended_actions`，不填充业务参数、不执行目标动作。未映射项只返回原判断数据；Score 暂只返回评分。发布及模型调用前后验证准确能力和当前授权，已发布能力通过 `required_actions` 声明依赖。推荐随原判断历史保存，数据库仅新增字段。旧字符串结果不推断成能力身份。

```bash
pnpm --filter @molis-ai/molis-work-module-functions typecheck
pnpm --filter @molis-ai/molis-work-module-functions build
node --import tsx --test --test-concurrency=1 tests/functions-system-capability.test.ts
```

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/modules/functions`
- Migration: `goal-reorg-f2`
- SSOT: `specs/archive/functions-system-capability/spec.md`；事件去向动作范围 `specs/archive/function-scene-action-scope/spec.md`

## 开发要求

- 负责：判断规则的草稿、不可变的已发布版本、样本与判断记录。
- 不负责：TypeSafe HTTP、插件界面、场景执行。
- 公开入口：`@molis-ai/molis-work-module-functions`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/functions`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 已发布版本不可变，只能删除草稿。
  - 执行要在“能力 → 对外接入”授予该客户端 `functions.invoke`；旧名称开关不单独授权。
  - 模型返回后经 `before_result` 复查权限；取消或撤权后不保存判断历史、不返回成功。
  - 编辑器在 Workbench 的 `src/functions`，没有独立的 Functions 插件包。
- 改动后必跑：`node scripts/run-tests.mjs tests/functions-authoring-actions.test.ts tests/functions-system-capability.test.ts tests/functions-mcp-aliases.test.ts tests/functions-draft-retention.test.ts`
- 相关手册：[specs/archive/functions-independent-authoring/spec.md](../../specs/archive/functions-independent-authoring/spec.md)、[skills/molis-prologue-ai/SKILL.md](../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

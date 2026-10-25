# 判断函数与一次判断

拥有草稿、不可变已发布函数、样本和判断记录。系统能力服务通过动作合同调用本模块；编辑器位于 Workbench 的 `src/functions`，没有独立 Functions 插件包。

包名：`@molis-ai/molis-work-module-functions`。

公开入口是 [src/index.ts](src/index.ts)。Host 注入 TypeSafe provider 与当前目录校验，已删除无生产调用者的 judge/行为白名单执行分支。

`createFunctionsService({ home, credential, … })` 自己按 `home` 打开判断库，`close()` 关库；包入口不导出库类（`FunctionsStore`、`openFunctionsStore`）。本包自己没有任何规则：场景（Manifest 的 `action_scenes`，宿主自己的场景同理）用 `default_rule` 声明自己的规则，宿主在场景登记时调 `seedDeclaredRules(rules, sceneMap)` 写入，装上的插件与内置插件一样；同一个 `function_key` 已在库里就原样保留，先声明的赢，用户改过的不被覆盖。规则的选项目标（`sceneMap`）由组装根在规则第一次写入时给，已写下的规则不再询问；Host 对「推荐其他插件事项动作」的场景（`recommendation_source: "subject-offers"`）的答案是按内置插件目录里的事项动作声明算出来的，不点插件 id（PG-010；装上的插件的事项动作还不参与目标映射，见 BL-531）。包内部按职责分文件：`store.ts`（库类）、`store-schema.ts`（表与 Home 库登记）、`declared-rules.ts`（按声明播规则）、`record-rules.ts`（校验与规整）、`record-rows.ts`（行与记录互转）、`judgments.ts`（判断记录与场景绑定）。

`actions.ts` 定义已发布规则的查询与执行，`authoring-actions.ts` 定义管理动作。草稿管理要求 `functions:manage`，试跑同时要求 `functions:invoke`；HTTP 和内部客户端共用同一 provider 注册、参数校验及原有业务实现。

判断规则的提供方 id 由 `actions.ts` 的 `FUNCTIONS_PROVIDER_ID` 持有，经本包入口导出；Host 的权限表与登记、引用使用同一常量，权限从上述动作声明读取。

Functions 只经动作工具对外：查询遵守公共能力及逐客户端撤权；执行必须在“能力 → 对外接入”授予该客户端 `functions.invoke` 动作；正式 stdio 入口由常驻 Host 执行，客户端授权、后端连接和版本状态一致。模型返回后，动作通过内部 `before_result` 回调复查原权限，取消或撤权后不保存判断历史、不返回成功结果。规则身份、版本与原历史保持。Agent 的 Choice/Noul 可保存可选 `action_map`，每个输出键对应 `{ capability_id, version, provider_id }`。调用返回 `recommended_actions`，不填充业务参数、不执行目标动作。未映射项只返回原判断数据；Score 暂只返回评分。发布及模型调用前后验证准确能力和当前授权，已发布能力通过 `required_actions` 声明依赖。推荐随原判断历史保存，数据库仅新增字段。旧字符串结果不推断成能力身份。

```bash
pnpm --filter @molis-ai/molis-work-module-functions typecheck
pnpm --filter @molis-ai/molis-work-module-functions build
node scripts/run-tests.mjs tests/functions-system-capability.test.ts
```

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/modules/functions`
- Migration: `goal-reorg-f2`
- SSOT: `specs/archive/functions-system-capability/spec.md`；事件去向动作范围 `specs/archive/function-scene-action-scope/spec.md`

## 开发要求

- 负责：判断规则的草稿、不可变的已发布版本、样本与判断记录。
- 不负责：TypeSafe HTTP、插件界面、场景执行。
- 公开入口：`@molis-ai/molis-work-module-functions`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/functions`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store，自己的库也不出包入口（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 已发布配置与版本不可变，只能删除草稿；样本、试跑及判断记录仍独立管理。
  - TypeSafe 原生 Choice 回答在转换边界核对本次声明的 criteria；非空的非法选项拒绝，不保存试跑或成功判断，不取得发布资格。null 保持 needs_review。
  - 执行要在“能力 → 对外接入”授予该客户端 `functions.invoke`。
  - 模型返回后经 `before_result` 复查权限；取消或撤权后不保存判断历史、不返回成功。
  - 编辑器在 Workbench 的 `src/functions`，没有独立的 Functions 插件包。
  - 项目被删除时由宿主按 `functionsProjectData`（`src/project-data.ts`：确认框里的标签与 `purgeFunctionsProject`；Functions 不是插件，宿主自己列它）调用清掉这个项目的场景绑定与判断记录；规则本身是本人的，保留；只读库文件，库不存在时不创建，重复运行没有副作用。
- 改动后必跑：`node scripts/run-tests.mjs tests/functions-authoring-actions.test.ts tests/functions-system-capability.test.ts tests/functions-draft-retention.test.ts tests/project-deletion-owners.test.ts tests/functions-plugin.test.ts tests/functions-choice-validation.test.ts`
- 相关手册：[specs/archive/functions-independent-authoring/spec.md](../../specs/archive/functions-independent-authoring/spec.md)、[skills/molis-prologue-ai/SKILL.md](../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

`functions.connection.usages` 通过 Host 端口读取当前 TypeSafe 连接 id，列出已发布规则及其原动作；不用环境变量或测试凭据覆盖时才归到该账号。未发布草稿不返回，读取不会执行判断或暴露凭据。连接状态由原 credential availability 与派出检查决定。

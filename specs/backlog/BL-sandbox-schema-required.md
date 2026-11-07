# BL-sandbox-schema-required

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-sandbox-schema-required | `SandboxSchema.required` 在类型上是可选（`packages/contracts/src/platform/plugin-sandbox.ts`，`required?: string[]`），运行时检查 `assertSchema`（`packages/plugin-sandbox/src/schema.ts`）却对 `type: 'object'` 要求必填：缺 `required` 抛 `sandbox.invalid_schema`（「Object required must name unique declared properties」），而且 `properties` 和 `additionalProperties: false` 也必填。手写 schema 的人照类型写会过 `tsc`、过不了安装。要做的二选一：类型改成对象分支必填（用按 `type` 区分的联合），或检查改成缺省当空数组；选哪个要看生成插件和现有手写 schema 的写法，改合同要走 `CONTRACT-CHANGES.md` | 第 14 批 A 段交办，读 `schema.ts` 与合同类型核对 | 已知缺口 | 没有人报过实际踩到；改类型会动公开合同快照（`tooling/gates/api/contracts/platform/plugin-sandbox.txt`） | 无 | 低 | C1／沙箱与授权（执行会话待分配） |

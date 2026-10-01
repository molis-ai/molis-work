# Work Item：动作投影与迁移

## depends_on

无。后续生命周期、Web 和 Skill 工作都依赖本项导出的类型和 projection API。

## 允许修改

`src/v1/types.ts`、`src/v1/store.ts`、新增的 `src/v1/action-*.ts`、`tests/v1.test.ts` 和 migration fixture。

## 输出

纯派生动作投影、稳定 token、Contract revision schema/revision 1 回填、动作索引和定向测试。不得批量重写现有业务状态。

## 验收与验证

- 新库和旧库迁移两次结果相同。
- 单 snapshot 批量投影，无逐 Goal SQL。
- 多 Review action 不丢失，主动作稳定。
- `pnpm typecheck` 与 `tests/v1.test.ts` 通过。

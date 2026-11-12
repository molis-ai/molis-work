# BL-uninstall-pending-column

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-uninstall-pending-column | 卸载待清理（BL-915）借放在 `uninstalled` 记录的 `last_error_code` 上（`packages/plugin-runtime/src/install-rules.ts` 的 `UNINSTALL_PENDING`），错误码一列兼作状态，四处按它判断（Runtime 两处、`installed-plugin-lifecycle.ts`、`plugin-installed-view.ts`）。下次安装库改结构时单列成状态或独立字段，升版本带升级段 | [第 27 批收尾检查](../post-anticorruption-roadmap/reference/batches/27.md#收尾检查) 第 3 问 | 明确后续做 | 为它单独改库结构不值，随下一次安装库的结构变更 | 安装库的下一次结构变更 | 低 | C 轨／Plugin Runtime（执行会话待分配） |

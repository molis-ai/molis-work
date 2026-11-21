# BL-shell-goals-leftovers

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-shell-goals-leftovers | 工作台外壳里还点名 Goals 的几处（H4 搬完页面客户端后剩下的）：① `apps/workbench/src/scripts/client/placement.ts` 的「挂到 Goal、加为 Goal 输入」是放置服务替 Goals 开的专门入口，应改成插件声明的挂载目标；② `apps/workbench/src/artifacts/goal-input-client.ts`（经 `plugin-workbench.ts` 装进页面）把成果交给 Goal 作输入，应归 Goals 或通用的「交给插件作输入」；③ `assistant-materials.ts` 的 `TAB_KINDS.goals` 与 `assistant-side-kit.ts` 的 `/goal/` 图标规则按插件名写，应从插件登记的对象类型读；④ `shell-page-renderer.ts` 的 `createWorkbenchGoalsPageRenderer` 函数名（巨型单元门禁按函数名记账）与目录栏的 `id="goal-tree-pane"`；⑤ `immersive-shell.ts` 的 `data-immersive-goal-tools` 一组按钮没有任何代码读取，连同 `immersive-navigation.ts` 的两条样式可删。各处计数由 `tests/goals-workbench-registration.test.ts` 的 PCL-02 钉住，只许变少 | [页面客户端生命周期](../page-client-lifecycle/spec.md) 第 3 节「不在本次」 2026-11-21 | 明确后续做 | H4 的 PR 只搬页面状态；这几处各自牵涉放置服务、成果交接、助理材料或巨型单元门禁的记账，混在一起改评审面太大 | 无 | 中 | 待分配 |

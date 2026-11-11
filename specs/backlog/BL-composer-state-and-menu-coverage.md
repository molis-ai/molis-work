# BL-composer-state-and-menu-coverage

分组：3. 助理、记忆与动态交互 / 统一输入

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-composer-state-and-menu-coverage | 定样 [§10.1](../unified-input-voice/spec.md) 有两处与已实现的组件覆盖不一致：①状态列了六种（发送中、运行中、失败、待确认、被丢弃、离线），组件只建模五种 `data-state`（`sending`、`running`、`failed`、`unknown`、`disabled`，见 `packages/design-system/src/composer-styles.ts`），「被丢弃」与「离线」没有样子、文案与动作；②`+` 菜单定样要求按「附件、资料、插件提供」分组，实作是「文件与图片、注册来源（按插件分组）、命令」三组（`packages/design-system/src/composer-parts.ts` 的 `renderComposerAddMenu`），没有独立的「资料」组，项目资料与选区只能从来源或 `/` 命令里找。要做的：按真实使用决定补「被丢弃」「离线」两种状态的样子与文案，以及是否恢复独立「资料」组；补时组件、页面样式、语言文件与浏览器用例一起改 | [第 10 批](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-progress) 合后审计（2026-11-09）；[统一输入体验 §10.1](../unified-input-voice/spec.md) | 已知缺口 | 第 10 批按现有界面能落的部分建模：这两项还没有真实消费者（离线与丢弃都还没有目标产生，资料已能从来源与 `/` 找到），本人验收时再定是否补；现在补会多两套没人用的状态与一个空分组 | 无（第 11 批 K4／K5 接入时一起看） | 低 | A 统一输入／第 11 批 |

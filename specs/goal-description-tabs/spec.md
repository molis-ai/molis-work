# 目标与要求标签页

## 背景目标

「目标与要求」详情把定义正文、历史覆盖和「关联与约束」叠在同一长页里，扫读和切换都要先滚过无关内容。收成平级标签，一次只看一块。

## 当前行为与问题证据

打开「目标与要求」后，同一读者里五个标签：基础信息、Goal 关系、风险、影响范围、工作规则。历史 Contract 覆盖仍挂在基础信息底部，读定义时会被历史覆盖打断，查覆盖又要先滚过定义。

## 范围

- 该详情内六个标签：基础信息、历史覆盖、Goal 关系、风险、影响范围、工作规则。
- 默认「基础信息」。风险 / 关系等深链仍打开对应标签。
- 短标签（名称 + 数量），贴在详情顶部；去掉「关联与约束」分组标题和导语。
- 「历史覆盖」承接原来的历史 Contract 覆盖；绑定资料、历史需求覆盖、子 Goal 进度仍留在基础信息。
- 不恢复 Goal 顶层五标签（概览 / 完成要求 / 进展与阻塞 / 关联与约束 / 完整记录）。
- 不改关系、风险、影响、规则、覆盖的数据语义和写入入口。

## 非目标

- 不改「记录模板」「完成要求」读者，也不把它们并进这些标签。
- 不重做因素表单或快速记录。

## 使用场景

1. 从 Goal 信息打开「目标与要求」，先看到基础信息。
2. 切到历史覆盖，只看保留的父子 Contract 覆盖事实。
3. 切到风险或关系，只看那一块，不必先滚过定义。
4. 点风险 / 关系深链，直接打开对应标签。

## 方案与关键决策

- 六个标签都在现有 `目标与要求` 读者里，不是 Goal 主导航。
- 「基础信息」承接定义字段、有效决定、范围，以及绑定资料 / 子 Goal 进度。
- 「历史覆盖」单独承接 `renderContractCoverage`；无记录时仍显示标签和空状态。
- 沿用现有 `data-goal-factor-tab` 切换、键盘左右键和 hash 恢复；默认 `basics`。

## 文件 / 模块边界

- `plugins/native/goals/src/factors-ui.ts`、`event-document-ui.ts`、`panels-client.ts`、`context-coverage-ui.ts`
- 工作台组装与样式：`apps/workbench/src/renderer.ts`、design-system / event-document styles
- `DESIGN.md` 同步信息架构

## 验收标准

- 详情顶部可见六个标签；一次只显示一个面板。
- 无深链时默认基础信息，且能读到要得到什么 / 范围等原字段；基础信息不再出现「历史 Contract 覆盖」标题。
- 「历史覆盖」能读到原来的覆盖卡片或明确空状态。
- `#risk-*`、`#relation-*` 仍打开描述读者并选中对应标签。
- 键盘左右键、Home/End 可在六个标签间移动。
- Goal 顶层导航仍不是旧的五个主标签。

## 验证命令

- `tsx --test tests/goals-status-ui.test.ts tests/goals-document-ui.test.ts tests/goals-context-ui.test.ts tests/visual-foundation.test.ts`
- 相关 e2e：`tests/goals-records.e2e.test.ts`、`tests/goals-relation.e2e.test.ts`
- 浏览器：打开 Goal → 目标与要求，切换六个标签，并用风险深链核对。

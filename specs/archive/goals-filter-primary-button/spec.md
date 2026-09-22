# Goals 筛选钮用 Coss 主按钮

状态：已实现，外观已被 `specs/archive/goals-directory-outline-buttons/spec.md` 改写为白底灰边。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写 `specs/archive/goals-create-primary-button/spec.md` 里「筛选仍是安静工具钮」。新建横条合同不变。

## 背景目标

「新建 Goal」已经是 Coss 主按钮（浅色黑底白字、8px 圆角）。右边筛选还是 27px 透明漏斗，和主按钮不是一套。

目标：筛选触发钮同一套主按钮外观。完成等级 **3：功能可用**。

## 当前行为与问题证据

- `data-tree-filter-trigger` 用 `.tree-tool`：透明底、`--muted` 图标、5px 角。
- 沉浸式还把 `.tree-tool > span` 藏掉，只剩漏斗。

## 范围与非目标

做：

- 筛选触发钮挂 `button-primary`，不再用 `.tree-tool`。
- 浅色：`--action` 底、`--action-ink` 漏斗、`--radius-control` 圆角、高度 `--control-h`（28px）。
- 仍是图标钮（正方形，文案「状态」继续隐藏），`data-tree-filter-trigger` 和面板行为不变。
- 打开或已选状态时保持主按钮，不要退回灰底工具钮。

不做：不改筛选面板内容、不改其它插件的 `.tree-tool`、不把筛选做成全宽横条。

## 使用场景

1. Goals 工具行：左边黑底「新建 Goal」，右边同样黑底圆角的漏斗。
2. 点漏斗仍弹出「按状态筛选」。
3. 深色反相，与新建钮一致。

## 方案

纳入已有 `.button-primary` 选择器；另写正方形 padding 覆盖，避免被 `control-pad-x` 拉宽。

## 文件 / 模块边界

允许：`plugins/native/goals/src/tree-ui.ts`；`packages/design-system/src/styles/coss-controls.ts`；Workbench 目录样式同位；`tests/goals-tree-ui.test.ts`、`tests/coss-control-language.test.ts`、`tests/immersive-directory.e2e.test.ts`。

## 验收标准

1. 浅色 `[data-tree-filter-trigger]` 背景与「新建 Goal」同为近黑，图标白，圆角 8px，高度 28px。
2. 点开筛选面板的合同不变。
3. 其它插件目录图标工具钮不改成主按钮。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/coss-control-language.test.ts tests/immersive-directory.e2e.test.ts
```

## 假设与开放问题

- 「一样的风格」= 同一套 Coss 主按钮填充/圆角/字色，筛选保持图标正方形，不当第二条全宽横条。

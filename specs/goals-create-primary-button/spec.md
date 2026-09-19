# Goals「新建 Goal」用 Coss 主按钮

状态：已实现，外观已被 `specs/goals-directory-outline-buttons/spec.md` 改写为白底灰边。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次目录主操作外观的唯一需求书。结构仍走 `specs/goals-directory-collection-folds/spec.md`（横条 + 右筛选）；控件手感走 `specs/coss-control-language/spec.md` 的主按钮合同。

## 背景目标

「新建 Goal」现在是浅灰底、墨色字、6px 角的安静横条，在目录里几乎不像按钮。用户要求改成 Coss UI 主按钮：浅色模式黑底白字，圆润边。

## 当前行为与问题证据

- `.tree-create` 在 `immersive-navigation.ts`：`background: var(--nav-hover); color: var(--ink); border-radius: 6px`。
- 加号是 `--muted`，比文案更淡。
- 产品里已有 `.button-primary`：`--action` 填充、`--action-ink` 字、`--radius-control`（8px）。浅色 `--action` 近黑，深色反相。

## 范围与非目标

做：Goals 目录 `data-open-create` 这条用 Coss 主按钮（class `button-primary` + 共享 `--action` 层）。加号跟文字同色。筛选漏斗外观见 `specs/goals-filter-primary-button/spec.md`。

不做：不改创建面板、不改其它插件目录、不引入 Coss React 组件、不改圆角全局 token。

## 使用场景

1. 浅色打开 Goals：横条是近黑底白字「新建 Goal」，圆角与其它主按钮一致；右边漏斗还在。
2. 深色：这条反成浅底深字。
3. 点它仍打开新建 Goal 面板。

## 方案

把 `.tree-create` 纳入已有 `.button-primary` 合同，不另画一套。

## 文件边界

允许：`plugins/native/goals/src/tree-ui.ts`、`packages/design-system/src/styles/coss-controls.ts`、`apps/workbench/src/styles/immersive-navigation.ts`、`base.ts` 同位规则；`tests/goals-tree-ui.test.ts`、`tests/coss-control-language.test.ts`、目录 e2e 一条颜色断言。

## 验收

1. 浅色：`[data-open-create]` 计算背景为 `--action`（近黑），文字与加号为 `--action-ink`（白），圆角 `--radius-control`。
2. 筛选仍在右侧；外观合同见 `specs/goals-filter-primary-button/spec.md`。
3. 点击仍打开创建面板。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/coss-control-language.test.ts tests/immersive-directory.e2e.test.ts
```

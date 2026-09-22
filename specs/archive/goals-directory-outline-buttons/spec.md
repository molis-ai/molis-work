# Goals 新建/筛选改回白底灰边

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写 `specs/archive/goals-create-primary-button/spec.md` 与 `specs/archive/goals-filter-primary-button/spec.md`：不再用 Coss 主按钮黑底白字。

## 背景目标

「新建 Goal」和右边漏斗现在是浅色黑底白字。用户要求改回白底灰边，两颗仍同一套。

## 范围与非目标

做：

- 浅色：`--paper` 白底、`--line` 灰边、`--ink` 字/图标、`--radius-control` 8px、高度 28px。
- 新建仍是横条，筛选仍是同高方形图标钮。
- 从 `.button-primary` 主按钮合同里拿掉这两颗。

不做：不改创建面板、筛选面板内容、其它插件目录按钮。

## 验收标准

1. 浅色 `[data-open-create]` 与 `[data-tree-filter-trigger]` 背景为白，文字/图标为墨色，边框可见灰线，圆角 8px。
2. 筛选仍 28×28，点开面板合同不变。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/coss-control-language.test.ts tests/immersive-directory.e2e.test.ts
```

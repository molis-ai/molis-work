# 分栏时标签留在各栏

## 背景目标

分屏后，焦点栏的工作区标签被抬到窗口 titlebar，横跨左右两栏。非焦点栏已经把标签收在自己栏头上。结果是一条看起来像全局的标签栏，实际只属于左栏。

目标：分栏时每一栏自己管自己的标签，像 VS Code 编辑器组。单栏仍把标签放在 titlebar。完成等级 3：功能可用。

## 当前行为与问题证据

- `tab-workspace.ts` 在非 embedded 时，只要是焦点栏就把 `renderStrip` 写到 `[data-titlebar-tabs]`，并把栏内 `[data-tab-strip]` 藏起来。
- 非焦点栏走栏内 strip。所以右栏正确、左栏（焦点）错误地铺满标题栏。
- 实屏：titlebar 显示 Feed / Sessions / bash，右栏自己显示「画布」和 Goal 标签。

## 范围与非目标

做：

- 多于一栏时，所有栏（含焦点栏）都在栏内 strip 渲染标签；titlebar 的工作区标签隐藏并清空。
- 回到单栏后，标签再回到 titlebar。
- 分栏时 titlebar 仍保留搜索等窗口控件。
- 更新依赖 titlebar 分屏按钮的测试。

不做：

- 不改单栏 titlebar 标签。
- 不改 iframe 嵌套栏、插件内容、拖拽拆栏规则。
- 不把搜索搬出 titlebar。

## 使用场景

1. 单栏打开 Feed：标签仍在 titlebar。
2. 向右分屏：左右栏各自一条标签；titlebar 不再出现 Feed / Sessions / bash；左栏标签右缘不超过右栏左缘。
3. 关掉多余栏回到单栏：标签回到 titlebar。

## 方案

`useTitlebar` 增加 `state.panes.length < 2`。分栏时 `titlebarStrip.hidden = true` 并清空。栏内 strip 的 44px 高度已由 `syncSplitSizes` 计算，焦点栏 iframe 会跟着下移。

## 文件边界

允许改：`apps/workbench/src/scripts/client/tab-workspace.ts`、相关 e2e、本 spec、`specs/workbench-tab-workspace/spec.md` 里标签位置那一行。

## 验收

1. 单栏：`[data-titlebar-tabs]` 有当前标签；栏内 strip 隐藏。
2. 两栏：titlebar 标签隐藏；每个 `[data-tab-pane] [data-tab-strip]` 可见且有标签；焦点栏 strip 不进入邻栏。
3. 关回一栏：标签回到 titlebar。
4. 分屏、拖动、刷新后的栏内容仍可用。

## 验证

```bash
export PATH="/opt/homebrew/bin:/Users/didi/code/goalboard/node_modules/.bin:/Users/didi/.npm/_npx/e6e0ed1aca658cae/node_modules/.bin:$PATH"
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/workbench-pane-feed.e2e.test.ts \
  tests/dense-workspace.e2e.test.ts \
  tests/product-interaction.e2e.test.ts
```

## 验收结果

- 通过：工作台 TypeScript 构建。
- 通过：上述 10 项定向 e2e。
- 通过：示例项目向右分屏后 titlebar 标签隐藏，左右栏各自一条标签，左栏 strip 右缘不超过右栏左缘。

# 全局搜索输入贴在面板上

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

⌘K 浮层已经是一张 `--paper` 升起面。输入仍是系统 `type=search` 凹槽，颜色和圆角跟面板不是一套，右侧 `⌘K` 被裁切。一骏圈了这行，说样式违和。

## 当前行为与问题证据

`.global-search-field input` 写了 `border: 0; background: transparent`，但没有 `appearance: none`。Chrome 继续画 searchfield 内框。`kbd` 是 flex 兄弟，被 `dialog { overflow: hidden }` 切掉半截。

## 范围与非目标

做：去掉原生凹槽；输入、放大镜、⌘K 排在面板顶上一行，下面仍是发丝分割线。聚焦只留 caret，不再套焦点环。检索、快捷键、跳转不变。

不做：不改成 `mw-input-group`（又会套一层框）；不改结果列表与 Glide 高亮。

## 使用场景

1. 打开搜索：顶栏是放大镜 + 字，贴着面板，没有第二口井；⌘K 完整落在面板内。
2. 输入 Goal 标题仍能跳转。

## 方案

`appearance: none` 并清掉 webkit search 装饰。顶栏 flex：图标、input、kbd。input 透明。

## 文件边界

允许改：`apps/workbench/src/immersive-shell.ts`、`apps/workbench/src/styles/immersive-navigation.ts`、`packages/design-system/src/styles/quiet-paper.ts`、`calm-desktop.ts`、`momentum.ts`、`specs/global-plugin-search/spec.md`；`tests/chrome-inner-scroll.test.ts`、`tests/goals-tree.e2e.test.ts`。

## 验收标准

1. 计算 `appearance` 为 `none`，input 背景透明。
2. `kbd` 右缘在 dialog 内（≥8px 边距）。
3. 打开后输入框仍聚焦；搜 Goal 标题仍能打开该 Goal。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/goals-tree.e2e.test.ts
```

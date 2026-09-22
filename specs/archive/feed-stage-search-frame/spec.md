# Feed 舞台搜索只留一层框

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

Feed 顶栏搜索是 `label.feed-stage-search` 包一层 `input[type=search]`。组本身有描边，主题层又给几乎所有 input 画边和底，看起来套了两层框。一骏点中该字段说「太丑了，两层边框了」。

## 当前行为与问题证据

`body.immersive-workbench .feed-stage-search` 有 `border: 1px solid var(--line)`。内部 input 写了 `border: 0; background: transparent`，但 `calm-desktop` / `quiet-paper` 的

`input:not([type="checkbox"])…:not(.global-search-query)`

带 8 个 `:not()`，特异度 0,8,1，压过本地 0,2,2。于是 input 仍是 `border: 1px` + 纸面底 + 圆角，叠在 label 框里。Chrome 的 searchfield 外观再加一层原生凹槽。

同族先例：`specs/archive/plugin-market-search-frame/spec.md`、`specs/archive/global-search-field-flush/spec.md`。

## 范围与非目标

做：搜索只由 `.feed-stage-search` 画一层框。input 透明、无边、`appearance: none`。主题全局 input 规则排除 `[data-feed-search]`。检索行为不变。

不做：不改筛选、列表、插件舞台布局；不改成 `mw-input-group`。

## 使用场景

打开 Feed：顶栏是放大镜 +「搜索 Item」，只有一圈描边，没有套娃内框。

## 方案

1. 三套主题选择器加上 `:not([data-feed-search])`，与 `.global-search-query` 同一逃逸口。
2. 本地 input 补 `appearance: none`、清 webkit search 装饰，聚焦只留 caret，框仍在 label 上。

## 文件边界

允许改：`apps/workbench/src/styles/immersive-directory.ts`、`packages/design-system/src/styles/{calm-desktop,quiet-paper,momentum}.ts`、`specs/archive/feed-stage-search-frame/spec.md`、`tests/chrome-inner-scroll.test.ts`。

## 验收标准

1. 搜索 label 计算边框 1px；内部 input 边框为 0、背景透明、`appearance` 为 `none`。
2. 组与 input 不再各画一圈可见描边。
3. 输入关键字仍过滤 Item。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts
```

当前工作台打开 Feed，看搜索只有一层框。

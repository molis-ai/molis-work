# 插件市场搜索只留一层框

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

市场搜索是 `mw-input-group` 包一层 `mw-input`。组本身有描边和纸面底，页面又给 input 加了 `border` / `background` / 绝对定位图标，看起来套了两层框。一骏点中该字段说「有两层框」。

## 当前行为与问题证据

`label.plugin-market-search.mw-input-group` 有 `--control-input` 边；`body.immersive-workbench .plugin-market-search input` 再用 `border: 1px solid var(--line)` 和 `background: var(--nav-bg)`。图标 `position: absolute` 叠在内框上。

## 范围与非目标

做：搜索只由 `mw-input-group` 画一层框。input 透明、无边。图标走组内 flex，不再绝对定位。字段仍整行、可搜。

不做：不改搜索过滤、项目选择、列表、插件栏。

## 使用场景

打开插件市场：搜索是一条带放大镜的输入，只有一圈描边。

## 方案

删掉市场搜索对 input 的边框、底色、内边距和图标绝对定位。组 `min-height: 40px` 保持整行体量。聚焦用组上已有的 `focus-within`。

## 文件边界

允许改：`apps/workbench/src/styles/immersive-navigation.ts`、`specs/archive/plugin-market-catalog/spec.md`；`tests/chrome-inner-scroll.test.ts`、`tests/plugin-market-catalog.test.ts`。

## 验收标准

1. 搜索 label 计算边框 1px；内部 input 边框为 0。
2. 组与 input 不再各画一圈可见描边。
3. 输入「Artifacts」仍只剩 Artifacts 行。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/plugin-market-catalog.test.ts
```

4174 打开插件市场，看搜索只有一层框。

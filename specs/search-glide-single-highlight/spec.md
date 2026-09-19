# 全局搜索选中高亮只留一层

状态：完成。完成等级 **3：功能可用**。不改用户库、不提交、不发布。

## 背景目标

⌘K 搜索结果的选中高亮看起来叠了两层：分组标题「Goals」附近和当前行各有一块灰底。

## 当前行为与问题证据

Glide Select 用 `.global-search-body::before` 画一块 `--nav-active` 药丸，同时：

1. `> * { position: relative }` 让 `.global-search-group` 变成 `offsetParent`，`--hit-y: offsetTop` 少算了列表内边距和分组偏移，药丸偏上，顶进分组标题。
2. 药丸圆角 6px，行是 8px；选中行在 hover 时仍铺 `--nav-hover`。两块灰底叠在一起。

用户圈的是第一组 Goals 标题加第一条结果。

## 范围与非目标

做：药丸按选中行的 `getBoundingClientRect` 贴齐；选中行（含 hover）不再自铺底；非选中 hover 仍是浅一档。

不做：不改搜索数据、快捷键、打开/关闭语义；不撤掉 Glide Select。

## 使用场景

1. 打开搜索，默认第一条选中：只有一行药丸，不盖住「Goals」。
2. 鼠标停在选中行：仍是那一块，不变深两层。
3. 鼠标停在别的行：那一行浅底，键盘选中仍是药丸。
4. 方向键换行：药丸跟过去。

## 方案

测量改成与分段滑块同一套（相对列表的 `getBoundingClientRect` + `scrollTop`）。只给 `.global-search-hit` 提层，不给分组 `position: relative`。选中含 hover 的行背景透明；药丸圆角与行一致（8px）。

## 文件边界

允许：`packages/design-system/src/styles/micro-interactions.ts`、`tests/visual-foundation.test.ts`、`DESIGN.md` 一句。

## 验收标准

1. 样式不再对 `[data-search-glide] > *` 设 `position: relative`。
2. `[data-search-glide]` 下 `[aria-selected="true"]` 与 `:hover` 叠在一起时 `background: transparent`。
3. 测量脚本给药丸设 `--hit-x/--hit-y/--hit-w/--hit-h`，来自选中行相对列表的盒子，而不是 `offsetTop`。
4. 宽屏打开搜索，药丸与选中行的 top/left/height 差 ≤ 1px；药丸不进入分组 `h3`。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/visual-foundation.test.ts
```

## 验收对照

| # | 标准 | 结果 | 证据 |
|---|------|------|------|
| 1 | 不再给分组 `position: relative` | 通过 | 样式只给 `.global-search-hit` 提层 |
| 2 | 选中行含 hover 背景透明 | 通过 | 实测 `hitBg rgba(0,0,0,0)` |
| 3 | 药丸用选中行相对列表的盒子 | 通过 | `--hit-x/y/w/h` 来自 `getBoundingClientRect` |
| 4 | 药丸与选中行差 ≤ 1px，不进分组标题 | 通过 | dx/dy/dw/dh = 0；`pillTop` 等于 `h3.bottom` |

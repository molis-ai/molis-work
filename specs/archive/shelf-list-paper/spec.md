# Shelf 列表底色对齐其它插件舞台

完成等级：**3 功能可用**。不改数据、不提交、不发布。

## 背景目标

未展开预览时，Shelf 全宽列表应和 Functions / Forms 一样是工作台纸面白。现在这块是 DropAgent 侧栏色，整页发冷、和其他插件对不上。

## 当前行为与问题证据

2026-09-21 一骏圈出 `.shelf-side-scroll`：浅冷色底，和旁边 Functions 的 `--paper` 白底一眼能分出来。

- `.plugin-stage-list` 默认 `background: var(--paper)`。
- Shelf 覆盖成 `var(--da-side)` → `var(--content-side)`（浅色 `#F5F5F4`），铺满全宽列表。
- `.shelf-side-scroll` 自己透明，透出来的就是这块。

## 范围与非目标

做：舞台上的材料列表（全宽和展开后的左栏）底色改成 `--paper`。

不做：不改预览阅读面 `--da-panel`、纸面按钮、五色图标、轮盘、行标题合同；不把 Shelf 重涂成 Coss 强调色。

## 方案

列表是舞台，不是第二栏侧栏。`[data-shelf="directory"]` 和 `[data-shelf-stage-shell] .plugin-stage-list` 用 `--paper`。预览工作区仍 `--da-panel`。

## 文件边界

允许：`specs/archive/shelf-list-paper/`；`plugins/native/shelf/src/styles.ts`；`tests/shelf-plugin.test.ts`。

## 验收

1. 舞台列表 CSS 含 `background: var(--paper)`，不再给 `.plugin-stage-list[data-shelf="directory"]` 铺 `--da-side`。
2. `--da-side: var(--content-side)` 别名仍在，给预览以外的 DropAgent 零件用。
3. 4184 打开 Shelf 全宽列表，底色与 Functions 同为纸面白。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts
```

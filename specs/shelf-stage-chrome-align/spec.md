# Shelf 列表顶栏：搜索与操作钮对齐

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

Shelf 未展开详情时，顶栏搜索、「添加」、「更多」应同一高度、同一顶底边。一骏 2026-09-20 选中 `.shelf-stage-chrome`：搜索框比旁边两颗按钮高，三者不齐。

## 当前行为与问题证据

`[data-shelf] .shelf-search` 仍带着目录时代的 `margin: 12px 0 6px`。`.plugin-stage-chrome .shelf-search { margin: 0 }` 选择器更弱，盖不住。实测 computed margin 就是 `12px 0 6px`，chrome 被撑到 48px，30px 的 `.shelf-side-op` 在这条里垂直居中，搜索框视觉上偏高、偏大。

## 范围与非目标

做：三个控件同为 30px 高、搜索框无额外上下边距、顶底对齐。搜索 / + / … 活在目录栏顶，展开预览后跟着左栏走、不藏。

不做：不把默认列表收成 213px、不改 DropAgent 阅读面、不加 Coss 搜索、不改按钮语义。

## 方案

搜索、「添加」、「更多」活在目录栏 `.shelf-stage-chrome` 里。默认列表全宽时它们在栏顶；点文件展开后跟着 213px 左栏走。控件同为 30px 高、无搜索框自己的上下边距、顶底对齐。

## 文件边界

允许：`plugins/native/shelf/src/styles.ts`、`tests/shelf-plugin.test.ts`、本 spec。

## 验收标准

1. `.shelf-stage-chrome` 里 `.shelf-search` 与 `.shelf-side-op` 高度都是 30px，上下 margin 为 0。
2. 搜索框与两颗按钮顶边差 ≤ 1px。
3. 样式不再出现 `[data-shelf] .shelf-search` 带 `margin: 12px 0 6px`。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-plugin-shelf build
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts
```

4174 打开 Shelf 列表，看搜索 / + / … 顶底齐平。

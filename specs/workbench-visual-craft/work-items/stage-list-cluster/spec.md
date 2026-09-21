# 舞台列表与首页事件信息紧凝

状态：已实现（列对齐已纠偏）。完成等级 **3：功能可用**。不换身份、不改用户库、不提交、不宣称可发布。

`depends_on`: [工作台视觉与动线打磨](../../spec.md)；列轨合同见 [plugin-list-row-align](../../../plugin-list-row-align/spec.md)。

## 背景目标

宽舞台上 Forms / Functions / Dataset 列表把去向和说明摊成过宽的 `fr` 栏；首页事件把来源芯片甩到 880px 列尾。

## 纠偏

2026-09-21：曾把类型/事实/说明/状态改成每行 `max-content` 抱团。Functions 截图里 Choice / Score / Noul 不再同列。错误。

保留：选中行 `--plugin-tint` 10%、平面状态字、首页 40rem、对话岛 `aria-expanded` 滑块。
改成：舞台行回到跨行对齐的五栏；类型/去向/状态用固定 rem，标题和说明用 `fr`；格子里的字靠列起点，不跟标题长短左右晃。
忽略：按行把元数据抱成一团。

## 范围与非目标

做：

1. 带 `.plugin-stage-kind` 的舞台行：`minmax(12rem, 1.2fr) 4.75rem 7.5rem minmax(10rem, 1fr) 4.5rem`。
2. 舞台选中行用 `--plugin-tint` ≈10% 洗底。
3. `.feed-entry-status` 视觉走平面状态，类型芯片保留。
4. 首页阅读列约 40rem。
5. 对话岛认 `aria-expanded="true"`。

不做：不换字体/圆角/行高，不改 Feed 关闭行，不改 Goal 画布，不接通 Assistant。

## 使用场景

打开 Functions：标题左齐，Choice / Score / Noul 同一列，Inbox/Agent 同一列，草稿/v1 最右。Forms 与同一套栏轨。

## 方案与关键决策

栏位对齐靠每行同一套 rem/`fr` 轨。去向从 `0.9fr` 收成 `7.5rem`，避免空格子，但不改成 `max-content`。

## 验收标准

1. 桌面未展开舞台上，带类型芯片的行含 `4.75rem` / `7.5rem` / `4.5rem` 固定轨；同一列表里类型芯片左边缘跨行相同。
2. 选中 `feed-stage-entry` 背景含 `--plugin-tint` 10%。
3. `.feed-entry-status` 背景透明。
4. `.home-hero` 与 `.home-tl` 上限 40rem。
5. 分段脚本对 `.assistant-island-card` 认 `aria-expanded="true"`。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/visual-foundation.test.ts
```

浏览器：Functions 列表核对 Choice/Score/Noul 同列。

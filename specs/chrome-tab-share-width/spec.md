# 工作区标签贴内容、超出均分

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

对照切片 titlebar（`div.tabs`）：标签跟内容走，密度高于固定 172px 胶囊。标签合计超出条宽时，按 Chrome 把未钉住的标签平分剩余宽度，而不是撑出横滑或被裁切。

## 当前行为与问题证据

- `.tab-item` 固定 `172px`（窄屏 `144px`），两张短标题也各占一截宽胶囊。
- 桌面 `[data-titlebar-tabs] .tab-scroll { width: max-content }` 且未设 `min-width: 0`，条按内容长，不能按 titlebar 收缩。
- `tests/workbench-pane-feed.e2e.test.ts` 还断言所有标签同宽，锁死了固定等宽。

## 范围与非目标

做：

- 未钉住标签默认 `max-content`，上限 `172px`，高度仍 26px（触控 44px）。
- 条内合计超出可见宽时，未钉住标签（含重排空位）平分剩余宽，下限桌面 `72px`、窄屏/触控 `96px`；仍溢出才横滑。
- 钉住标签仍是图标宽。分组标签、加号、分屏、桌面 spacer 拖动区不参与平分。
- 条上间距收到 2px，左右 padding / 图标与标题间距贴切片。

不做：不改开标签、分组、钉住、分屏、重排落点规则；不做溢出菜单。

## 使用场景

1. 只有「项目首页」和「画布」：两张都比 172 窄，右侧空给加号/分屏（桌面空档仍可拖窗）。
2. 打开到超出 titlebar：未钉住标签同宽，最后一张右缘不超过滚动区，加号仍在条右。
3. 钉住两张再开一堆普通标签：钉住保持图标宽，普通标签平分剩下的。

## 方案与关键决策

- 预估宽度用标题 `scrollWidth` + 图标/关闭/padding，不靠先清 CSS 变量再量，避免 ResizeObserver 来回抢。
- 条可分给标签的宽 = `.tab-strip` 宽 − 加号/分屏 − spacer 的 min-width − 条间距；未分组标签是 flex 项，不算进 reserved。折叠组里的标签不参与平分。
- `tabShareWidth` 在 hug 合计超出这块剩余时均分；均分时给 `.tab-scroll` 锁上 allotted 宽，避免 `max-content` 跟着标签变窄、窗口拉大时不再长回来。
- 桌面 titlebar 的 `.tab-scroll` 保持 `width: max-content`，补 `min-width: 0` 才能在 flex 里被压到 titlebar。
- 窄屏/触控关闭钮 44px，均分下限用 96px，否则 72px 装不下图标和关闭。

## 输入输出与依赖

输入：条的可见宽、各未钉住标签的内容宽。输出：`--tab-share-width` 或清除。无持久化。

## 文件 / 模块边界

允许改：`tab-strip-share.ts`、`scripts/client/tab-workspace.ts`、`styles/tab-workspace.ts`、`styles/immersive-navigation.ts`、`DESIGN.md` / surface 相关句、`linear-workbench-density` 里「等宽固定」一句、相关测试、本 spec。

## 验收标准

1. 两张短标题标签各自宽度 `< 172`，且可以不相等。
2. 多到超出条宽时，未钉住标签宽度差 `< 2px`，且都 `< 172`；最后一张右缘 ≤ `.tab-scroll` 右缘 + 1。
3. 加号仍在分屏左边，分屏距 titlebar 右缘规则不退。
4. factory 含 `tabShareWidth`；reduced-motion 不参与宽度。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
  node --import tsx --test --test-concurrency=1 \
    tests/tab-strip-share.test.ts \
    tests/tab-reorder.test.ts \
    tests/chrome-tab-share-width.e2e.test.ts
```

## 验收结果

- 通过：`pnpm --filter @molis-ai/molis-work-app-workbench build`；`tests/tab-strip-share.test.ts`、`tests/tab-reorder.test.ts`、`tests/chrome-tab-share-width.e2e.test.ts`。
- 复查修复：未分组标签不再计入 reserved；均分按条宽减加号/分屏/spacer min 计算并锁 `.tab-scroll` 宽；折叠组不参与平分；窄屏/触控下限 96px。
- 1440：短标题宽度 `< 140`；480：未钉住标签同宽且收在 `.tab-scroll` 内。

## 假设与开放问题

- 平分到下限仍放不下时保留现有横滑，不做 Chrome 那种溢出列表。

# 规划方法详情：标签跟说明放一起

## 背景目标
方法详情标题区里，「适合哪些工作」标签被甩到标题行右侧，像一块独立浮层。把它收回说明文字旁边，和一句话介绍读成同一组。

## 当前行为与问题
- HTML 里 `.planning-detail-tags` 是 `.planning-detail-header-main` 的兄弟。
- 项目设置舞台把 `.planning-detail-header` 做成 `flex; justify-content: space-between`，标签被推到 760px 栏的右上角。
- 说明段落在左，标签在右，阅读顺序和图上的邻近关系对不上。

## 范围与非目标
范围：方法详情标题的 HTML 分组，以及规划样式 / 设置舞台对 header 的 flex 覆盖。
非目标：不改 `applies_to` 数据、编辑表单、方法卡片上的标签、保存或采用语义。

## 使用场景
打开工作规划里某套方法详情时，标题下先看到一句话说明，适用标签紧挨着这段话；右侧仍是「创建我的版本 / 编辑」按钮。

## 方案与关键决策
- 说明 `<p>` 和标签放进同一个 `.planning-detail-lede`，放在标题列里、操作按钮对面。
- `.planning-detail-header` 不再和「标题 + 操作」共用左右分栏；标题对按钮仍由 `.planning-detail-header-main` 负责。
- 标签容器用已有文案「适合哪些工作」做 `aria-label`。

## 输入输出与依赖
输入：现有 `summary` 与 `applies_to`。
输出：标题区 DOM 顺序改为 说明 → 标签 → 操作按钮。
依赖：`planning-method-ui.ts`、`planning-styles.ts`、`PROJECT_SETTINGS_PAGE_STYLES`。

## 文件 / 模块边界
允许：goals 规划详情 HTML/CSS、设置舞台里规划 header 选择器、对应单测。
禁止：改规划方法写入、采用组合、卡片列表。

## 验收标准
1. 有 `applies_to` 时，标签在 `.planning-detail-lede` 里，紧跟说明段落，且仍在 `.planning-detail-header-main` 内。
2. 设置舞台下标签不再作为 header 的第二列贴在内容区右侧。
3. 没有适用标签时，说明段落仍正常显示。
4. 窄屏下说明和标签与按钮一起折到标题下方，不回到左右分栏。

## 验证命令
- `pnpm --filter @molis-ai/molis-work-plugin-goals build && pnpm --filter @molis-ai/molis-work-app-workbench build`
- `node --import tsx --test --test-concurrency=1 tests/goals-planning-ui.test.ts`
- 浏览器：工作规划方法详情桌面与 390 宽；对照标题、说明、标签、按钮。

## 假设与开放问题
独立 `/settings/planning` 页也会吃到同一 HTML；设置舞台去掉 header 分栏后，两边都应是说明和标签一组。

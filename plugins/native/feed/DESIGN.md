---
name: Molis Work Feed
description: 沿用共享 Soft Workbench 视觉系统的来源工作台
colors:
  paper-light: "#ffffff"
  paper-dark: "#161718"
  navigation-light: "#f3f4f5"
  navigation-dark: "#0f1011"
  ink-light: "#222326"
  ink-dark: "#f7f8f8"
  muted-light: "#6b6f76"
  muted-dark: "#8a8f98"
  divider-light: "#e2e4e7"
  divider-dark: "#23252a"
  input-border-light: "#d0d6e0"
  input-border-dark: "#2e3036"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Inter Variable, Noto Sans SC, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  column-title:
    fontSize: "22px"
    fontWeight: 600
  card-title:
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.55
  reader-title:
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.4
  reader-lead:
    fontSize: "16px"
    lineHeight: 1.9
  reader-body:
    fontSize: "15px"
    lineHeight: 1.9
  metadata:
    fontSize: "11px"
rounded:
  scope: "8px"
  card: "10px"
  menu: "12px"
  input: "8px"
spacing:
  tight: "4px"
  control-gap: "8px"
  card-gap: "4px"
  column-gutter: "18px"
  reader-column: "700px"
components:
  article-column:
    width: "clamp(300px, 30%, 360px)"
    background: "--surface-soft"
  source-menu:
    rounded: "{rounded.menu}"
    row-height: "48px"
  article-card:
    rounded: "{rounded.card}"
    padding: "13px 14px 14px"
  reader-bar:
    height: "56px"
  reader-page:
    maxWidth: "{spacing.reader-column}"
---

# Design System: Molis Work Feed

## Overview

**Creative North Star: "读的地方"**

Feed 继承产品的 Soft Workbench（见根目录 DESIGN.md），并按已认可的原型做成「文章列 + 阅读页」：左侧一列文章卡片，右侧一张安静的阅读页。本文件的色值是历史记录，现行色值以 `palette.ts` 为准。

这是已实现表面的局部设计记录（2026-09-24），不替代[根设计系统](../../../DESIGN.md)。表面任务策略、所有权及验证边界见[来源工作台记录](../../../.impeccable/surfaces/feed-source-workbench.md)。

**Key Characteristics:**

- 左列回答「现在在看什么」：一个来源菜单、搜索与筛选、全部 · 未读 · 已保存，然后是一条时间线。
- 右侧是阅读页：标题、署名、导语、正文，页尾写清去向和能做的事。
- 来源的设置与捕捉规则在阅读侧原位打开，不另起弹窗。

## Colors

前置 token 摘录自[共享 Linear shell](../../../packages/design-system/src/palette.ts)。运行时以共享 CSS 变量为准；Feed 不定义第二套主题。

### Primary

主操作继承共享按钮的 `--action` / `--action-ink`；当前页签使用 `--ink` 下划线。不要给 Feed 另设品牌强调色。

### Neutral

`--paper` 承载消息、阅读及表单；`--nav-bg` 承载来源栏和匹配方式分组。`--ink` 用于标题与选中项，`--ink-soft` 用于表单说明层级，`--muted` 用于摘要、时间与数量。`--line` 分隔连续内容，`--line-strong` 勾勒输入框。前置 token 的 light / dark 分别对应这两种主题。

来源悬停和选中继承 `--nav-hover` / `--nav-active` 的主题混色。需要处理的连接、操作错误使用 `--tone-attention`；预览命中使用 `--tone-done`，同时保留文字结果，颜色不单独承担含义。

## Typography

字体继承共享 `--font`（系统无衬线优先，Inter Variable 与 Noto Sans SC 只作离线后备）。字重按共享角色：标题 600、条目标题与控件 500、正文 400；不在 Feed 另造字重。

来源标题、阅读标题、消息标题与辅助文案的角色值见前置 token。来源栏标题为（18px），表单标题为（17px），小节标题为（14px）；摘要行高为（1.6），多行输入为（1.65）。来源名称及摘要在列表中可截断，阅读正文完整展开，规则说明允许任意位置换行。数量使用等宽数字，便于纵向扫描。

## Layout

桌面是两列网格：文章列 `clamp(300px, 30%, 360px)`（`--surface-soft`，右侧一条细线）与阅读侧 `minmax(0, 1fr)`。文章列自上而下：Feed 标题（22px / 600，右侧「立即拉取」只在选中单个来源时出现、「添加来源」常在）；来源菜单（44px 的一行，写明当前是全部消息还是某个来源及其状态、账号）；选中单个来源时出现「消息 · 来源设置 · 捕捉规则」三个页签；搜索框（36px，筛选与排序菜单在框内右侧）；「全部 · 未读 · 已保存」三段切换；一条按时间排列的卡片列表（卡片 4px 间距）；列脚写条数。

阅读侧空闲时居中写「选一条消息开始读」，不自动打开第一条（打开即记为已读）。打开后顶部是 56px 的阅读条（关闭、来源），页面滚动后才出现下边线；下面是最宽 700px 的阅读页。添加来源、来源设置与捕捉规则占据阅读侧，表单主体最宽 700px，底部动作区保持可见。

窄屏依据 **Feed 容器宽度不大于 820px** 切换（不按整个窗口判断）：一次只显示一侧——文章列，或它打开的阅读页 / 设置；阅读条的关闭换成返回箭头。窗口不大于 760px 时来源菜单、页签、三段切换与阅读动作的点击目标加高到手机尺寸。

## Elevation & Depth

内容面主要靠背景差异与一像素边界划分。Feed 没有新增卡片阴影或专属动画。窄屏来源导航使用覆盖层级（z-index 40）；样式引用共享 `--shadow-lg`，Feed 本地不定义其值。按钮、输入的交互质感与减少动态效果行为沿用共享设计系统。

## Shapes

来源选中块、消息行、表单输入及匹配方式分组的圆角见前置 token。来源类型选择是带底部分隔线的连续行，不包成独立卡片。消息与已有规则也使用细线分组。共享按钮的圆角、边框、危险操作与禁用态由共享控件负责。

## Components

### 来源菜单与页签

来源菜单是一个 disclosure：摘要行写当前范围；展开后列出「全部消息」和每个来源（图标、名称、状态或账号、数量），状态用图标加文字（已连接 ✓ / 未连接 ⚠），不只靠颜色。选中后菜单收起。菜单在外部点击、选中与 Esc 时关闭，与底栏菜单同一套规则。具体来源才显示来源设置、捕捉规则页签与「立即拉取」。

### 文章卡片与阅读

卡片：来源图标与名称、时间；标题（最多两行，未读时前面一个铜色小点，已读标题退一级墨色）；一行摘要；离开 Feed 的条目在底部写去向（已保存为资料的去向用完成色）。已读 / 未读文字仍保留给读屏。时间线默认最新在前，筛选菜单里的来源、类型、时间、状态与排序全部保留；「已保存」对应 saved 去向。

阅读页：kicker（Feed 为铜色，其后是来源、读状态与去向）、标题 28px / 600、署名行（作者、时间、查看来源、打开原文）、导语（摘要，16px，下方一条细线）、正文 15px / 1.9、标签与附带资料，最后是页尾：左边写「当前去向」，右边是加入 Inbox、保存为资料、升格为 Goal、忽略。加载失败显示文字和重试入口；空来源、筛选为空、未读读完、没有已保存各有自己的说法，并给出「查看全部」或「添加来源」。

### 来源设置与添加

添加来源、资料、内容范围、拉取计划及运行记录都在右侧原位呈现。设置取消恢复已保存字段，切换来源保留尚未提交的表单值；来源资料与拉取计划有独立保存动作。连接下拉只选择已有账号，授权管理链接进入 Connectors。只读身份字段有不同底色。

### 捕捉规则

已有规则与新增编辑器共享连续内容面。默认关键词，可切换自然语言或复用已发布 Functions；处理方式默认仅建议，可选自动入 Inbox。预览逐条显示标题及匹配、不匹配或待复核，结果区使用 `aria-live="polite"`，操作反馈使用 `role="status"`。运行中编辑器使用 `aria-busy` 与 `inert` 防止重复交互，失败保留输入。

自然语言草稿、试跑与发布归 Functions；Feed 只保存引用。自然语言内容修改后需重新预览才能保存启用。预览不会执行 Feed evaluate，也不创建捕捉 Artifact 或 Inbox 条目；它仍会调用 AI、保存 Functions 草稿及试跑记录。启用后处理新消息和更新；“处理已有消息”是单独展开并执行的动作，界面明确提示可能写入 Inbox。

### 可达性

表单使用原生标签和控件；图标按钮有名称，匹配方式以 `aria-pressed` 表达选择，隐藏内容从布局和交互中移除。Feed 控件的键盘焦点继承共享细描边 `--focus-stroke` 与 `--focus-stroke-inset`（当前为 1px 实线及 -1px 内偏移）。这些是实现事实，不代表已完成屏幕阅读器、全部键盘路径或完整 WCAG 审计。

## Do's and Don'ts

### Do:

- **Do** 保留「左文章列、右阅读页」的关系；窄屏一次显示一侧。
- **Do** 复用共享主题和控件，在相邻表单中保持相同的保存、取消和反馈语义。
- **Do** 把预览结果与正式执行的后果写清楚，将实际验证范围记在表面记录中。

### Don't:

- **Don't** 把来源重新做成常驻的第三列，或按来源把时间线切成折叠组。

- **Don't** 把来源设置或规则编辑重新移回大模态弹窗。
- **Don't** 把账号授权或 AI 判断定义复制到 Feed 数据层。
- **Don't** 将隔离 Host、示例消息和 fake provider 的验证描述为真实第三方账号验收。

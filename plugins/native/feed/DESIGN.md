---
name: Molis Work Feed
description: 沿用共享 Linear × coss.ui 视觉系统的来源工作台
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
    fontFamily: "Inter Variable, Inter, Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  source-title:
    fontSize: "20px"
    fontWeight: 400
  reader-title:
    fontSize: "23px"
    fontWeight: 400
    lineHeight: 1.45
  message-title:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  secondary:
    fontSize: "12px"
  metadata:
    fontSize: "11px"
rounded:
  source: "8px"
  input: "6px"
  message: "6px"
  mode-group: "7px"
  mode-button: "5px"
spacing:
  tight: "4px"
  control-gap: "8px"
  row-gap: "12px"
  section: "16px"
  composer: "24px"
  desktop-gutter: "28px"
components:
  source-rail:
    width: "236px"
    padding: "16px 10px"
  source-row:
    rounded: "{rounded.source}"
    padding: "10px 9px"
  source-header:
    padding: "24px 28px 0"
  message-row:
    rounded: "{rounded.message}"
    padding: "14px 10px"
  input:
    rounded: "{rounded.input}"
    padding: "9px 11px"
---

# Design System: Molis Work Feed

## Overview

**Creative North Star: "来源工作台"**

Feed 继承产品已确认的 Linear × coss.ui 中性色、连续内容面、细分隔线和共享控件。来源身份稳定留在左侧，消息、阅读、设置和捕捉规则占用同一个右侧工作面。视觉层级由空间、文字尺寸、选中底色和页签下划线表达。

这是已实现表面的局部设计记录（2026-09-24），不替代[根设计系统](../../../DESIGN.md)。表面任务策略、所有权及验证边界见[来源工作台记录](../../../.impeccable/surfaces/feed-source-workbench.md)。

**Key Characteristics:**

- 来源上下文持续可见，右侧围绕当前来源操作。
- 平面列表与原位表单，主要操作使用共享按钮。
- 轻量字重、可扫描的消息摘要、独立的阅读空间。

## Colors

前置 token 摘录自[共享 Linear shell](../../../packages/design-system/src/palette.ts)。运行时以共享 CSS 变量为准；Feed 不定义第二套主题。

### Primary

主操作继承共享按钮的 `--action` / `--action-ink`；当前页签使用 `--ink` 下划线。不要给 Feed 另设品牌强调色。

### Neutral

`--paper` 承载消息、阅读及表单；`--nav-bg` 承载来源栏和匹配方式分组。`--ink` 用于标题与选中项，`--ink-soft` 用于表单说明层级，`--muted` 用于摘要、时间与数量。`--line` 分隔连续内容，`--line-strong` 勾勒输入框。前置 token 的 light / dark 分别对应这两种主题。

来源悬停和选中继承 `--nav-hover` / `--nav-active` 的主题混色。需要处理的连接、操作错误使用 `--tone-attention`；预览命中使用 `--tone-done`，同时保留文字结果，颜色不单独承担含义。

## Typography

字体继承共享 `--font`，中英文由 Inter Variable 与 Noto Sans SC 及系统回退组合。共享字体层统一常规字重；不在 Feed 用粗体制造新的层级。

来源标题、阅读标题、消息标题与辅助文案的角色值见前置 token。来源栏标题为（18px），表单标题为（17px），小节标题为（14px）；摘要行高为（1.6），多行输入为（1.65）。来源名称及摘要在列表中可截断，阅读正文完整展开，规则说明允许任意位置换行。数量使用等宽数字，便于纵向扫描。

## Layout

桌面是左侧固定来源栏、右侧弹性内容的网格：`236px minmax(0, 1fr)`。右侧分为来源标题与页签、工具栏、列表；进入阅读或配置时，工作面占据工具栏以下区域。打开消息后隐藏列表和搜索，保留来源栏及来源标题；不会再增加第三个并排面板。

消息行最小高度（78px），列宽为弹性正文、（108px）元信息、（78px）尾部区域。搜索高（32px）、最大宽（280px）。表单主体最大宽（700px），居中放在右工作面；主体单独滚动，底部动作区保持可见。阅读内边距为（24px 32px 40px），正文最大宽（76ch）。

窄屏依据 **Feed 容器宽度不大于（700px）** 切换，不能只按整个窗口判断：来源栏隐藏为可展开导航，展开宽度为 `min(260px, 85%)`；右侧各区域跨满网格，来源选择后收起导航。消息行改为弹性正文与（62px）尾列，隐藏时间，列表左右留白缩到（8px）。阅读内边距改为（20px 18px），表单主体改为（12px 18px 24px）。

窄屏规则行按文案在上、启停与删除动作在下排列，按钮自适应宽度，避免挤压规则名称。窗口宽度不大于（760px）时页签和匹配模式按钮最小高度（44px）；容器窄屏规则动作也为（44px）。来源导航行最小高度从（58px）增至（60px）。移动来源开关当前为（32px）方形，不能把本实现表述为全部控件均达到 44px。

## Elevation & Depth

内容面主要靠背景差异与一像素边界划分。Feed 没有新增卡片阴影或专属动画。窄屏来源导航使用覆盖层级（z-index 40）；样式引用共享 `--shadow-lg`，Feed 本地不定义其值。按钮、输入的交互质感与减少动态效果行为沿用共享设计系统。

## Shapes

来源选中块、消息行、表单输入及匹配方式分组的圆角见前置 token。来源类型选择是带底部分隔线的连续行，不包成独立卡片。消息与已有规则也使用细线分组。共享按钮的圆角、边框、危险操作与禁用态由共享控件负责。

## Components

### 来源导航与页签

来源行显示图标、名称、状态或账号、数量；选中项有底色与 `aria-current`。全部消息只显示消息页签，具体来源才显示来源设置、捕捉规则及拉取动作。页签使用原生按钮与当前页标记，来源开关带可访问名称及 `aria-expanded`。

### 消息与阅读

保留搜索、筛选和排序；阅读替换右侧列表，返回恢复当前来源及列表上下文。消息操作继续使用已有入箱、保存资料、升格 Goal、开始处理与忽略路径。加载失败显示文字和重试入口；空来源与筛选无结果使用不同提示。

### 来源设置与添加

添加来源、资料、内容范围、拉取计划及运行记录都在右侧原位呈现。设置取消恢复已保存字段，切换来源保留尚未提交的表单值；来源资料与拉取计划有独立保存动作。连接下拉只选择已有账号，授权管理链接进入 Connectors。只读身份字段有不同底色。

### 捕捉规则

已有规则与新增编辑器共享连续内容面。默认关键词，可切换自然语言或复用已发布 Functions；处理方式默认仅建议，可选自动入 Inbox。预览逐条显示标题及匹配、不匹配或待复核，结果区使用 `aria-live="polite"`，操作反馈使用 `role="status"`。运行中编辑器使用 `aria-busy` 与 `inert` 防止重复交互，失败保留输入。

自然语言草稿、试跑与发布归 Functions；Feed 只保存引用。自然语言内容修改后需重新预览才能保存启用。预览不会执行 Feed evaluate，也不创建捕捉 Artifact 或 Inbox 条目；它仍会调用 AI、保存 Functions 草稿及试跑记录。启用后处理新消息和更新；“处理已有消息”是单独展开并执行的动作，界面明确提示可能写入 Inbox。

### 可达性

表单使用原生标签和控件；图标按钮有名称，匹配方式以 `aria-pressed` 表达选择，隐藏内容从布局和交互中移除。Feed 控件的键盘焦点继承共享细描边 `--focus-stroke` 与 `--focus-stroke-inset`（当前为 1px 实线及 -1px 内偏移）。这些是实现事实，不代表已完成屏幕阅读器、全部键盘路径或完整 WCAG 审计。

## Do's and Don'ts

### Do:

- **Do** 保留左来源、右工作面的稳定关系；窄屏通过切换与导航展开处理空间。
- **Do** 复用共享主题和控件，在相邻表单中保持相同的保存、取消和反馈语义。
- **Do** 把预览结果与正式执行的后果写清楚，将实际验证范围记在表面记录中。

### Don't:

- **Don't** 把来源设置或规则编辑重新移回大模态弹窗。
- **Don't** 把账号授权或 AI 判断定义复制到 Feed 数据层。
- **Don't** 将隔离 Host、示例消息和 fake provider 的验证描述为真实第三方账号验收。

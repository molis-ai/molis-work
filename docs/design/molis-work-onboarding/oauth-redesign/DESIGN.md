---
name: Molis Work Context Onboarding
description: 在既有中性色工作台中，以连续来源清单带入工作上下文。
colors:
  page: "#f3f4f5"
  paper: "#fff"
  wash: "#f8f9fa"
  ink: "#222326"
  muted: "#676c75"
  line: "#e2e4e7"
  action: "#222326"
  on-action: "#fff"
  accent: "#5e6ad2"
  ready: "#477461"
  error: "#aa444b"
  dark-page: "#0f1011"
  dark-paper: "#161718"
  dark-wash: "#1c1c1f"
  dark-ink: "#f7f8f8"
  dark-muted: "#8a8f98"
  dark-line: "#23252a"
  dark-action: "#f7f8f8"
  dark-on-action: "#222326"
  dark-accent: "#8b93f1"
  dark-ready: "#6bc49a"
  dark-error: "#ee858c"
typography:
  display:
    fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif'
    fontSize: "38px"
    fontWeight: 550
    lineHeight: 1.45
    letterSpacing: "-.03em"
  title:
    fontSize: "18px"
    fontWeight: 550
    letterSpacing: "-.4px"
  body:
    fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  control:
    fontSize: "13px"
    fontWeight: 500
  label:
    fontSize: "12px"
    fontWeight: 400
rounded:
  field: "6px"
  control: "7px"
  surface: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  content: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    width: "100%"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  source-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "21px 25px"
  citation:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.accent}"
    rounded: "3px"
    padding: "0 4px"
  source-reference:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "14px 0"
    width: "100%"
---

# Design System: Molis Work Context Onboarding

## Overview

**Creative North Star: "安静的中性色工作台"**

本记录描述已实现的来源清单、读入状态和项目建议页面。沿用 Molis Work 的 Linear × coss.ui 视觉世界：中性色承载阅读与操作，细线区分内容，少量靛蓝提示来源、引用和进度。说明、材料与动作清楚分层，视觉密度随任务阶段变化。

这是局部切片记录，不替代[根设计系统](../../../../DESIGN.md)。代码依据为 [样式](../../../../apps/workbench/src/styles/context-onboarding.ts)、[客户端](../../../../apps/workbench/src/scripts/context-onboarding.ts)和 [renderer](../../../../apps/workbench/src/context-onboarding-renderer.ts)；范围依据为[本轮约定](review/contract.md)。双栏清单是本次首屏表达，不能据此规定整个产品的页面结构。图稿中的账号、目录和模型结果不成为组件默认内容；`review-*` 截图采用固定模型响应，只能证明相应排版和交互，不证明真实模型质量或真实账号授权已验收。

**Key Characteristics:**

- 浅深主题共享相同内容层级与中性色操作语法。
- 来源在一个连续面上排列，选择、范围、状态与动作保持关联。
- Inter 与 Noto Sans SC 构成单一无衬线层级，图标使用既有 Lucide 语汇。
- 状态使用文字说明，能力未就绪时直接显示原因。
- 窄屏按阅读顺序收为单列，建议页采用动作贴近视口底部。

## Colors

冷灰纸面、近黑文字与克制的靛蓝组成基本色调；对应浅深色值以 frontmatter 为准，生产值由本切片的 `--cx-*` 自定义属性提供。

### Primary

- **Action / On Action：**主按钮和当前步骤采用反差中性色，浅色为深底浅字，深色反转。
- **Accent：**用于来源图标、引用标记、读取进度和极淡的已选行底色。来源提供商保留自己的图形标识。
- **Ready / Error：**分别支持“可读取”和失败信息，始终配有文字。

### Neutral

- **Page / Paper / Wash：**依次承载外层工作场、主要内容面和范围编辑区域；深色仍保留这三个层次。
- **Ink / Muted：**区分工作内容与范围、数量、版本、说明等次级信息。
- **Line：**用于连续清单的行边界、字段轮廓和来源列表分隔。

**The State Has Words Rule.** 颜色只能强化状态，来源是否已选、是否可读以及为何不可读必须有文字表达。

## Typography

**Display Font / Body Font：**自托管 Inter 与 Noto Sans SC，浏览器系统无衬线作末级回退。正文和控件保持同一字体体系；不另造品牌字体。

标题通过字号、适度字重和留白建立层级。清单与读取页共用 display；建议页主标题为（31px），主标题字距均为（-.03em）。面板标题使用 title；来源名称为（14px / 520），正文使用 body，说明和字段标签使用 label。摘要阅读行高放宽至（1.95），标题输入为（21px / 500）。

中等宽度的介绍标题降至（32px）；窄屏依次为（29px、27px），建议页标题在最窄档为（27px）。最窄档字段字体为（16px）。状态与辅助标记的更小字号是本切片局部层级，不替换根系统的共享控件规范。

**The Direct Heading Rule.** 主标题直接陈述当前任务；前面不增加装饰眉题。

## Layout

本切片首屏使用说明列与连续清单列：容器上限（1240px），桌面左右内边距（42px），说明列（300px），列间距（76px）。顶部独立放置产品名、主题切换和返回动作。清单头、来源行与汇总页脚共用一个轮廓；范围展开在所属行下方，不跳离清单。

在（1100px）以下，说明列收至（260px）、列距（36px）。在（780px）以下，说明与清单按阅读顺序叠放，步骤横排，介绍中的强制换行取消。在（480px）以下，左右边距为（16px），来源行允许换行，范围区取消桌面的左侧缩进。名称、路径与正文都允许在所属区域内折行。

建议页容器上限（980px），文档与来源栏以（28px）分隔，来源栏宽（240px）；窄屏将来源移到正文后，采用动作成为底部 sticky 区域。此布局服务于当前页面，不是全产品的固定模板。

## Elevation & Depth

深度主要由纸面、范围底色和细分隔线产生。清单容器有接近不可见的柔和阴影；它不是独立卡片堆叠。原文对话框通过遮罩区分前后，正文在其高度上限内滚动。阴影、遮罩及动态的精确实现留在 sidecar。

**The Continuous Surface Rule.** 同一来源清单共享外轮廓，内部用分隔线表达条目，不给每一行添加浮起的卡片阴影。

## Shapes

主要容器与对话框使用 surface 圆角，按钮和范围编辑底面使用 control 圆角，字段使用 field 圆角。边界以单像素线为主。步骤编号保持圆形，来源状态是普通文字，未形成胶囊标签系统。小型 Lucide 图标使用空心描边、圆端点；Gmail 使用提供商标识。

## Components

### Buttons

主动作是反差中性色实体按钮；次动作使用纸面与细边框，quiet 动作用透明底与次级文字。常规按钮最小高度（40px），紧凑按钮为（36px）；最窄档来源行按钮增至（40px）。主按钮 hover 降低亮度，次按钮 hover 使用 Wash，quiet 保持透明。禁用状态降低不透明度并改变指针，不用加载动画替代状态文案。

### Inputs / Fields

文本、摘要和范围字段共用纸面、细边框与 field 圆角，最小高度（42px）。摘要编辑允许垂直扩展。字段始终配有可读标签，长路径与正文折行。当前局部代码使用 Accent 外描边作为键盘焦点；这与根系统的中性色焦点规范不同，记录为现状差异，不确立为后续共享规则。当前账号和时间范围是原生 select，文件入口是原生 file input；这也不替代根共享控件标准。

### Continuous source list

条目依次表达选择、图标、名称与范围、真实状态、行内操作。已选行只叠加极淡 Accent 底色，复选框仍是选择的明确证据；全选支持部分选中状态。点击范围动作后在本行展开范围编辑区域。页脚分别报告已选与可读取数量，主动作名称随准备状态变化。

账号接入未配置时，清单直接显示不可连接及原因；只有具备真实配置时才呈现可执行连接入口。浏览器内容当前是粘贴正文，聊天记录当前是文本导入。组件示例不应把这些入口画成已经完成的自动抓取或实时聊天连接。

### Progress and reading receipts

三步说明是进度提示，不是可跳转导航。当前步骤使用 Action 填充，其余保持线框。读取结果沿用连续行，每项同时显示名称、正文保存结果或错误、等待或完成文字。进度条通过 transform 变化，减少动态效果偏好关闭动画和过渡。

### Project document and citations

建议以可编辑名称、可编辑摘要和来源列表组成。引用在正文中保持小型内联按钮，使用 Accent 文字与 Wash 底面；来源列表同时显示版本与名称。点击引用打开原文对话框，关闭后回到触发位置。示例摘要只能标为示例，不能转成固定产品文案。

### Feedback and recovery

失败反馈就地出现并解释下一步，文字保持可读折行。读取失败保留材料，页面提供继续、调整范围或带入已有资料的入口；没有文字模型时明确说明可先导入资料。授权等待仍显示原清单及继续途径，不能以“已连接”替代尚未完成的授权状态。

## Do's and Don'ts

### Do:

- **Do** 沿用浅深中性色层次，让工作内容与下一步动作先被读到。
- **Do** 将选择、范围和真实能力状态保留在同一来源行内。
- **Do** 保持窄屏阅读顺序、可见焦点、文本折行与减少动态效果支持。
- **Do** 明确区分示例模型响应、已完成的工程接线和真实账号或模型验收。

### Don't:

- **Don't** 为主标题添加装饰眉题，或用营销插画替代来源和状态。
- **Don't** 把本次双栏构图、局部焦点颜色或原生字段做法提升为根系统规则。
- **Don't** 用图标、可勾选或固定账号样例暗示来源已经可读取。
- **Don't** 把截图中的固定模型响应当作真实模型质量或账号授权的证明。

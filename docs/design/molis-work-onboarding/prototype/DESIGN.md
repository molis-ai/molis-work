---
name: Molis Work Onboarding Prototype
description: 单张来源清单进入整理总结，再将摘要与材料带入项目的 Molis Coss 高保真原型。
colors:
  page: "#f3f4f5"
  paper: "#fff"
  wash: "#f8f9fa"
  ink: "#222326"
  soft: "#454951"
  muted: "#6b6f76"
  line: "#e2e4e7"
  strong: "#c9cdd3"
  action: "#222326"
  on-action: "#fff"
  accent: "#5e6ad2"
  accent-wash: "#eef0fb"
  green: "#2d7a5a"
  green-wash: "#eef6f1"
  amber: "#8a5c18"
  amber-wash: "#faf3e7"
  plum: "#85699c"
  red: "#b03d45"
  red-wash: "#fcf0f0"
  dark-page: "#0f1011"
  dark-paper: "#18191b"
  dark-wash: "#202124"
  dark-ink: "#f0f1f3"
  dark-soft: "#c4c8cd"
  dark-muted: "#a0a5ae"
  dark-line: "#2d3035"
  dark-strong: "#4d515a"
  dark-action: "#f0f1f3"
  dark-on-action: "#151618"
  dark-accent: "#a4abff"
  dark-accent-wash: "#292c42"
  dark-green: "#89d3af"
  dark-green-wash: "#22372c"
  dark-amber: "#e1ba79"
  dark-amber-wash: "#382e20"
  dark-plum: "#c2a7da"
  dark-red: "#f59aa1"
  dark-red-wash: "#3c252a"
typography:
  headline:
    fontFamily: 'Inter, "Noto Sans SC", "PingFang SC", sans-serif'
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.42
    letterSpacing: "-.035em"
  title:
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: 'Inter, "Noto Sans SC", "PingFang SC", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "-.012em"
  label:
    fontSize: "12px"
    fontWeight: 400
  metadata:
    fontSize: "11px"
    fontWeight: 400
rounded:
  check: "4px"
  field: "7px"
  button: "8px"
  proposal: "10px"
  surface: "12px"
spacing:
  small: "8px"
  row: "12px"
  compact: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "40px"
  button-quiet:
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  navigation-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  citation:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.muted}"
    rounded: "{rounded.check}"
    padding: "0 5px"
    height: "19px"
  project-proposal:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.proposal}"
  source-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "20px 23px"
---

# Design System: Molis Work Onboarding Prototype

## Overview

**Creative North Star: "Operate"**

沿用 [Molis Coss 规范](../../../../DESIGN.md) 的纸面、中性灰、细分隔线和克制状态色。这里记录 2026-09-24 已实现的隔离原型；没有获批视觉样稿，是既有视觉体系的代码延伸。标题比生产工作台舒展，正文和控件仍以清晰阅读、短反馈为主。

**Key Characteristics:**

- 一张可全选的来源清单；选定范围、读取回执、可查原文的总结前后连贯。
- 总结以正文和引用为主体；采用后保留摘要、材料与下一步。
- 浅深主题共用结构；窄屏保留主操作、新建与项目切换。

事实来源：[需求](../../../../specs/molis-work-onboarding-prototype/spec.md)、[方向契约](index.html)、[样式](style.css)、[交互](app.js)。根 PRODUCT.md 仅提供品牌和可访问性背景；本文件不更新其产品定位。浅深配色、字号和焦点等局部差异按原型实际代码记录，不反向修改根规范。

当前完成等级为可交互原型：全部来源、连接、模型和项目都是演示；规则生成总结，localStorage 保存本浏览器状态，未接真实读取、模型或项目数据库。详见 [模拟边界](README.md) 与 [验证记录](review/verification.md)。独立审阅最终 `ship` 仅确认窄屏项目切换修复，不能作为生产发布或用户验收结论。

## Colors

### Primary

石墨色 `action` 承担开始、采用与保存等主动作；深色主题改用近白色。同一动作层级不增加第二套彩色实心按钮。靛紫 `accent` 用于进行中、引用悬停、焦点、文本光标和少量来源图标。

### Secondary

绿色表示可读取或成功，琥珀表示未纳入内容及提示，红色表示连接失败；状态始终带文字或图标。梅紫和琥珀也用于区分来源种类。`*-wash` 用于轻底色；选中来源将 `accent-wash` 以 25% 混入 `paper`，不铺满鲜艳色块。

### Neutral

`page` 是外围画布，`paper` 是清单与正文表面，`wash` 承担范围调整、侧栏和次级区域。`ink` / `soft` / `muted` 对应主要内容、正文辅助层和元信息；`line` / `strong` 区分分隔线与控件边缘。前缀 `dark-` 对应深色模式同名变量，主题按钮切换并保存选择。

## Typography

沿用仓库自托管 Inter Variable 与 Noto Sans SC Regular，回退 PingFang SC / sans-serif；Inter 开启 `cv01`、`ss03`、`calt`。标题使用 500 字重，正文 400。原型没有独立展示字体或等宽视觉层。

首页标题采用 frontmatter 的 headline；总结标题为 31px，项目正文标题为 29px。来源标题 14px，面板标题 17px，正文 13–14px；范围、来源数量等 11–12px。阅读段落使用 1.8–2 行高，数字引用保持小而紧凑。窄屏首页/总结标题降为 26px，项目标题为 25px；模态输入采用 16px。

## Layout

桌面首屏最大宽度 1112px，左右各 26px 内边距，说明列 320px、工作列最多 640px、列距 100px。顶栏提供品牌、演示标记、主题及重置；清单的五行来源、全选、模型说明和开始按钮组成一个连续面板。

总结最大宽度 1060px，正文与 234px 说明栏并排、间隔 40px。项目使用 224px 侧栏与连续正文面；正文最大宽度 820px。引用、项目创建和切换使用紧凑 dialog，最大宽度 530px、距离窄屏两边至少 16px。

- ≤1100px：缩小说明列及列距；项目正文减少内边距。
- ≤780px：首屏单列、流程横排；总结说明栏隐藏，采用操作条贴住视口底部。
- ≤520px：外侧留白 16px，来源操作区 sticky；普通按钮高 44px。项目侧栏隐藏，由概览/资料/目标行与新建按钮接替。顶部项目名始终可打开项目列表，显示当前项目及材料数，选择后返回相应项目。

以上是本次表面的响应式规则，不是全产品布局约束。

## Elevation & Depth

默认表面平整，通过背景层次与细线分区。清单、建议和项目正文不使用装饰阴影；dialog 才使用柔和投影与遮罩，具体值保存在 [sidecar](.impeccable/design.json)。Toast 以反色短暂反馈，不遮挡核心内容。

## Shapes

大面板与 dialog 使用 surface 圆角，建议容器使用 proposal 圆角；按钮、字段与复选框逐级收紧。引用是小型方角编号，不是胶囊标签。Lucide 线性图标通常为 18px、线宽 1.65，来源图标更大；品牌图形是复用的 boxes 图标，未建立新 Logo。

## Components

- **来源清单：** 每行包含复选框、来源图标、名称、可读取/需连接状态与默认范围；末端箭头行内展开范围。全选支持半选并保留已调整范围；零选择禁用开始。
- **读取回执：** 选中来源依次显示等待、读取中、成功、失败或跳过；就绪来源先处理。缺少连接的来源使用同面板提示，提供连接、模拟失败、重试和跳过；有结果后可先看已整理内容。
- **项目建议：** 标题旁复选框控制采用，铅笔可改名；正文事实紧跟编号引用，随后是建议下一步和材料入口。采用后进入带内容的项目，建议不会自动成为正式目标。
- **引用与资料：** 编号和材料行打开原文 dialog，显示路径、日期、快照与演示说明；关闭恢复打开者焦点。
- **按钮与输入：** 主按钮反色，次按钮纸底细边，弱按钮使用 muted。悬停改变底色或亮度，按下下移 1px；禁用透明度 .4。键盘焦点为 2px accent 外框、偏移 3px。改名为行内输入，摘要使用可保存/取消的 textarea。
- **后续项目：** 新建 dialog 提供从材料开始或空白开始；前者复用清单。空白项目「带入材料」将采用内容补到当前项目。桌面侧栏和窄屏顶部项目名都能返回已存项目。

交互过渡以 150–180ms 背景/位移反馈为主；进度条用 650ms transform，读取图标缓慢旋转。减少动态效果偏好会停用动画与过渡；切换页面不重复入场动画。

字体复用 `packages/design-system/fonts/`，Lucide 复用已安装库，Gmail/飞书标识复用 `apps/workbench/src/assets/connector-icons/`；映射见 [server.mjs](server.mjs)。没有随页面交付的栅格装饰资产。以下是 CUA 实际浏览器原始输出，仅为审阅证据，没有后期加工：[桌面清单](review/sources-selected-desktop.png)、[窄屏清单](review/sources-mobile.png)、[深色清单](review/sources-desktop-dark.png)、[总结](review/summary-desktop.png)、[窄屏项目](review/workspace-mobile.png)、[深色项目切换](review/project-switch-mobile-dark.png)。捕获尺寸说明见验证记录。

## Do's and Don'ts

### Do:

- **Do** 保留来源范围、读取状态、引用和未纳入提示，让总结依据可见。
- **Do** 用同一清单承接首次使用、后续新建和向当前项目补材料。
- **Do** 在浅深与窄屏状态保留开始、采用、新建和项目切换入口。

### Don't:

- **Don't** 用模拟连接或规则总结宣称真实授权、读取或模型能力已经实现。
- **Don't** 将未读取来源加入总结，或把建议自动变成正式目标。
- **Don't** 把本次较舒展的首屏构图、局部 tokens 或 dialog 模式写成全产品的新规范。

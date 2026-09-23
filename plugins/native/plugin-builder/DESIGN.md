---
name: Molis 插件创作工作台
description: 通过连续对话与可见装配，把想法变成可试用的本地数据工具。
colors:
  ground: "#f3f3f1"
  panel: "#f9f9f8"
  canvas: "#ffffff"
  ink: "#232831"
  muted: "#737985"
  line: "#e9e9ed"
  ui-blue: "#397bfa"
  function-green: "#269672"
  primary: "#272c32"
  primary-hover: "#414852"
  add-action: "#272b2e"
  field-line: "#dedfe3"
  selected-part: "#edf3ff"
  filter: "#f3f3f4"
  filter-selected: "#282c2f"
  tag-text: "#797f8b"
  error: "#a34632"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
    fontSize: "13px"
    lineHeight: 1.65
  conversation:
    fontSize: "13px"
    lineHeight: 1.85
  brand:
    fontSize: "22px"
    fontWeight: 650
    letterSpacing: "-0.035em"
  sidebar-title:
    fontSize: "18px"
    fontWeight: 620
    letterSpacing: "-0.025em"
  headline:
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  subtitle:
    fontSize: "14px"
    lineHeight: 1.6
  card-title:
    fontSize: "16px"
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  control:
    fontSize: "12px"
  caption:
    fontSize: "10px"
rounded:
  tag: "5px"
  field: "6px"
  card: "7px"
  add-action: "8px"
  segment: "9px"
  artboard: "12px"
  shelf: "14px"
  composer: "15px"
spacing:
  small: "8px"
  control: "12px"
  column: "16px"
  section: "20px"
  drawer: "25px"
  canvas-gutter: "30px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    typography: "{typography.control}"
    rounded: "{rounded.card}"
    padding: "6px 13px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.card}"
    padding: "6px 13px"
  button-icon:
    rounded: "{rounded.field}"
    padding: "6px"
    width: "32px"
    height: "32px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
  mode-switch:
    rounded: "{rounded.segment}"
    padding: "3px"
  filter:
    backgroundColor: "{colors.filter}"
    typography: "{typography.control}"
    rounded: "{rounded.card}"
    padding: "0 13px"
  tag:
    backgroundColor: "{colors.filter}"
    textColor: "{colors.tag-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.tag}"
    padding: "2px 6px"
  record-card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.card}"
  ui-pointer:
    textColor: "{colors.ui-blue}"
    width: "23px"
    height: "29px"
---

# Design System: Molis 插件创作工作台

## Overview

**Creative North Star: "可见的插件装配台"**

连续对话解释正在做什么，白色作品画布展示实际结果。暖灰地面、轻边界与紧凑工具保持安静，内容图片和作品标题承担视觉重心；蓝、绿角色提示把界面装配与功能接通对应到具体控件。

本文件只约束 `plugins/native/plugin-builder`，不覆盖宿主或其他插件。保留现有 Molis Work 的直接中文、真实状态、键盘操作和本地数据边界，不新增全局品牌承诺。此处为既有 Operate 表面的设计记录；表面目标与范围仍以工作项约定为准。

**Key Characteristics:**

- 连续对话与单一作品画布并排，输入固定在对话底部。
- 图文卡片展示真实记录；布局变化沿用相同字段与行为绑定。
- 控件以墨色为主，装配与接通用具名角色及局部状态表达。
- 示例、实时构建、预览记录和正式插件数据始终可区分。

依据：[已批准视觉](../../../specs/plugin-builder/ui/design/approved-comp.png)、[视觉基准](../../../specs/plugin-builder/ui/design/视觉基准.md)、[迁入约束](../../../specs/plugin-builder/work-items/prologue-runtime/visual-direction.md)、[当前任务与验证边界](../../../specs/plugin-builder/work-items/prologue-runtime/spec.md)。实际值来自 [styles.ts](src/styles.ts)，交互来自 [ui.ts](src/ui.ts)、[client.ts](src/client.ts)、[record-client.ts](src/record-client.ts) 与 [visuals.ts](src/visuals.ts)。本记录以最终实现为准，不把参考稿尺寸当作已实现值。

## Colors

暖灰工作区托起白色作品；近白侧栏与细灰线保留连续感。`ground`、`panel`、`canvas` 是不同表面，不能全部映射到宿主同一个 paper token。

- `ink` 是正文；`muted` 用于解释和辅助信息，错误用 `error` 并附文字。
- `primary` 用于确认与保存，`add-action` 用于作品内新增；筛选选中使用 `filter-selected`。
- `ui-blue` 用于 UI Agent、候选选择、焦点与零件选择；`function-green` 用于功能角色与对应连接状态。绿色指针可在连接阶段出现，是否完成由状态文字与保存控件标记表达。
- `selected-part` 是零件池浅蓝底，卡片标签使用浅灰 `filter`，不把所有操作染成蓝色。

## Typography

沿用系统无衬线栈，无外部品牌字体。正文以 13px 为基准；作品标题 29px / 600，侧栏标题 18px / 620，卡片标题 16px / 550。对话行高 1.85，卡片摘要 13px / 1.65；辅助标签与来源为 10px。表格数字使用 tabular-nums。

字级响应容器与视口：作品标题在容器 ≤800px 为 26px、≤640px 为 24px，在视口 ≤740px 为 23px。卡片标题在容器 ≤800px 为 14px，≤380px 单列时恢复 16px；单列摘要恢复 13px。保持内容层级，不把作品标题降成工具栏标签。

## Layout

- 桌面 shell：56px 顶栏；左侧 `clamp(320px,26%,430px)`，右侧占剩余宽度。对话独立滚动，底部输入保持可见。工作区工具栏最小 74px，构建/试用居中，发布在右侧。
- 画布：外侧横向 30px；内部 padding 为 `42px clamp(32px,6.2vw,98px) 98px clamp(32px,5.2vw,82px)`，底部留出零件池空间。作品内部是查询容器，响应其实际可用宽度。
- 图文卡片：三列 `1.18fr 1fr 1.04fr`，行距 17px、列距 16px；首卡跨两行，第二行中列是第四张卡，右列为虚线新增入口。普通卡片布局三等列。当前封面宽高比普通 2:1、示例建筑 1.49:1、示例湖景 2.5:1；这些特殊裁切来自显式示例类型。
- 作品头部包含标题、摘要及新增；搜索、标签筛选、排序为同一控制带。集合有 cards / list / table 三种呈现，检查器可选择全部三种；快捷切换在卡片与列表间切换。表格内部横向滚动。
- 视口 ≤1100px：侧栏 290px，画布外侧 20px，内部 `30px 30px 90px`。视口 ≤740px：单主面板；对话成为 `min(360px,95%)` 覆盖侧栏，可返回画布；画布外侧 10px、内部 `25px 18px 90px`。工具栏保留两行高度，功能指针隐藏。
- 作品容器 ≤640px：两列卡片，取消跨行，搜索与筛选换行；≤380px：单列，建筑封面 1.7:1。独立插件作品最大宽 1250px，保留相同内容组件。

## Elevation & Depth

内容卡片使用细边框，浮动工具使用轻阴影。画布阴影 `0 8px 24px #1e24330b`，零件池 `0 8px 27px #2a304316`；检查器 `0 8px 38px #27344c20`，设置面板 `0 10px 48px #20263024`。右侧录入抽屉使用 `-10px 0 45px #00000014`，遮罩 `#14141738` 和 2px 背景模糊。完整阴影及动效值存于局部 sidecar 扩展。

## Shapes

画布 12px、零件池 14px、输入容器 15px；记录卡与普通按钮 7px，字段 6px，标签 5px。发送键是 38px 圆形。细分隔线组织密集信息，虚线只用于新增位或短暂装配占位。

组件选择轮廓为 1px 蓝线，外扩真实目标 5px，四角 7px 小方点。装配入场不改变目标几何位置，避免选择轮廓与卡片漂移。

## Components

- **操作与输入。** 墨色确认按钮、白色次按钮、透明图标按钮与文本弱操作各有层级。普通按钮最小高 35px，作品新增高 40px；禁用态透明度 .42。焦点使用 2px 蓝线、3px offset。图标为内联 SVG / 现有 icon symbols，不能依赖图标字体。输入容器最小高 54px，工作区与模型设置收在可展开面板。
- **候选与主线。** 三个缩略页面保留列表、表格、图文卡片各自结构；候选选中有蓝框与圆勾、`aria-pressed`。确认后的候选仍可见。依据与主线可展开，角色的当前动作继续同一条对话。
- **卡片与查询。** 标题、摘要、标签、来源/日期与记录操作由明确字段绑定生成。封面仅来自记录 URL 或已标明的内置样例；没有封面就不生成图片。卡片勾选在悬停、焦点或选中时出现，窄屏常显。卡片切换不能清空记录或另建行为事实。
- **零件池与检查器。** 六个带文字的零件入口悬浮在画布底部，当前集合或输入与蓝框同步。检查器编辑标签、同区域次序和集合布局；普通输入、链接、按钮操作不能顺带触发检查。构建/试用用分段控件，试用隐藏装配层与零件池。
- **可见装配。** 新节点先保留真实布局空间，标 `aria-busy` 与 `inert`，以虚线和“正在放置”提示。UI 指针在 650ms 内移动到 DOM 目标，再解除占位，使用 320ms opacity .7→1、blur .6px→0 入场。蓝框按真实矩形更新；滚动/尺寸变化重算，目标移出可见范围后隐藏。连接反馈来自实际 behavior 状态，包含 .9s 局部绿光；不能作为虚构模型完成事件。
- **减少动态效果。** `prefers-reduced-motion: reduce` 下跳过放置等待，节点立即可用；CSS 关闭动画、过渡与平滑滚动。保留步骤、角色名称和连接状态。
- **录入与发布。** 新增/编辑打开右侧原生 modal dialog，宽 `min(420px,100vw)`、高 100dvh，字段区独立滚动，底部固定保存/取消。保存未接通时明确报错并保留输入；保存成功才关闭。预览记录与正式实例隔离；只有 ready 且没有活动运行才显示发布，回放中禁用发布，发布后由独立插件入口使用正式数据。

## Do's and Don'ts

### Do:

- **Do** 保留暖灰地面、近白对话与纯白画布的三个独立层次。
- **Do** 从真实节点、修订和行为状态派生装配位置与反馈。
- **Do** 明确显示“示例回放 / 不调用模型”，并标明生成的示例封面与示例来源。
- **Do** 在窄屏保留可返回的对话、可操作的作品和单列可读卡片。
- **Do** 将真实模型质量、工程验证、视觉复核与用户本人验收分别记录。

### Don'ts:

- **Don't** 将批准图当整页背景，或给用户无封面记录随机配示例图片。
- **Don't** 把录入表单默认摊在作品顶部，或把工作区/模型设置挤成底部大表单。
- **Don't** 将固定回放冒充实时 Prologue 构建，或将接通状态当作已保存记录的证明。
- **Don't** 将本轮受控本地数据工具宣称为任意代码插件生成与远程分发平台。
- **Don't** 将这份设计记录或局部复核视为新的用户批准；真实模型与本人验收边界以任务记录为准。

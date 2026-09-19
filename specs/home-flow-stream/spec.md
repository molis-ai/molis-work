# 首页：日期栏 + 当天事件 + 适时详情

状态：生产落地。完成等级 **3（功能可用）**。切片 `.impeccable/review/flow-home/index.html` 仍是视觉对照，权威行为以本文件与 `renderProjectHome` 为准。

## 背景目标

坐下先选一天，再读这一天接到的事。点开一件才腾出第三栏看正文和动作。首页是工作台三栏：日期 → 当天 → 这件事。

「按这个改，能力复原」：视觉跟已验收切片走；动作接上现有 Inbox / Feed / Sessions，不再停在月历 + 禁用输入。

## 当前行为与问题

生产首页仍是日期大字 + 装饰月历 + 快捷方式 + 永久 disabled 的 Agent 输入。切片已验收三栏与卡底 dock，但数据是假的。真实注意力在 Inbox，授权在 Feed 来源，对话在 Session，首页碰不到。

## 范围与非目标

做：

- 生产 `renderProjectHome` 换成三栏：左日期卡、中当天 Hero + 时间轴、点事件才出第三栏。
- 事件来自真实 Inbox（含来源故障）、仍需授权的 Feed 来源、当天有活动的 Session。按到达日分组；过期未处理的钉在今天。
- 卡底 dock：左边接着做 / 做完了（失败件是重新授权 / 问问怎么回事），右边说一句。按钮并排，不折行。
- 接着做打开原对象（Feed Item / 来源 / Goal / Session）。做完了走 Inbox `done`。重新授权打开 Feed 该来源。说一句打开相关 Session，没有就打开 Sessions。
- 快捷方式留在当天栏底部，契约不变（项目隔离、校验、外链）。

不做：

- 不接真实日历同步、不在首页造一套 Agent 聊天后端。
- 不把所有 Feed Item 铺进时间轴（有 Inbox 的只出现一次）。
- 不改插件轨、顶栏、Goals 画布。
- 不宣称可发布（安装升级路径、全量 i18n 回归另验）。

## 使用场景

- 打开首页：两栏。左纵向日期卡，今天默认选中。中栏 Hero + 当天事件。
- 点一条：第三栏出现，正文在卡里，卡底 dock。关详情（× / Esc / 换一天）回到两栏。
- GitHub / Gmail 仍需授权：今天能看见，点重新授权进 Feed 来源。
- 做完了：这条离开未处理，列表、点阵、统计一起更新。
- 说一句：对着这件事打开 Session（或 Sessions 插件），不假装首页能聊。
- 390：日期卡横排；点事件后详情盖住中栏。
- 快捷方式仍可添加、打开、编辑。

## 方案与关键决策（v8）

**三栏，第三栏适时出现。** 默认日期栏 + 当天栏。点事件才插入详情栏。

**第一栏是日期卡片，不是月历。** 今天前后各三天。点阵：一个事件一个点，个人灰、组织蓝，超过四个收成短横。今天星期后带蓝点。

**第二栏是一张纸。** Hero（今天太阳 / 别的日子日历）+ 大日期 + 一句根据当天件数生成的总结 + 统计。下面时间轴。宽屏内容封到 880px。

**事件列表是时间轴。** 时间、节点、标题、来源 chip。今天插「此刻」线。个人实心点，组织空心环。组织：GitHub / Gmail / 来源故障；其余算个人。

**第三栏是这件事。** 来源 + 时间 + 收起；正文和「来自 / 状态 / 挂在」。卡底 dock 一行：左动作、右说一句。弹层从 dock 向上升起。

**数据。** 页面 bootstrap JSON 不再带 Feed。客户端拉 `GET /api/feed`（Inbox + Feed Item + 来源）和 `GET /api/sessions`。有 Inbox 的 Feed Item 不重复出现。未处理且不在这一周的条目钉在今天。需要授权的来源钉在今天。

**动效。** 换天 Hero 上浮、事件错峰；详情从右滑入。`prefers-reduced-motion` 关掉过渡。

## 输入输出与依赖

输入：`GET /api/feed`、`GET /api/sessions`、当前时钟。
输出：生产首页 DOM / 样式 / 客户端。
依赖：Inbox status API、Feed 来源打开、tabWorkspace.openItem / openPlugin、既有快捷方式。

## 文件与模块边界

- `apps/workbench/src/home-flow.ts`：按日聚合（供测试与客户端共用语义）
- `apps/workbench/src/project-home.ts`、`styles/project-home.ts`、`scripts/client/project-home.ts`
- `apps/workbench/src/scripts/client/initialization.ts`：注入 openItem / openPlugin / 打开来源
- `apps/workbench/src/i18n/en.ts`
- `tests/home-flow.test.ts`、`tests/project-home-start.e2e.test.ts` 及相关断言
- 切片与本 spec 可继续对照，不再禁止改生产

## 验收标准

1. 默认两栏：日期卡 + 当天 Hero/列表。没有月历格子，没有禁用 Agent 输入条。
2. 点日期，中栏换成该日总结和按时间排序的事件；个人/组织在节点上可分辨。
3. 点事件出现第三栏：卡底 dock 一行（左动作、右说一句）；关详情后第三栏消失。
4. 今天有「此刻」线；空的一天说清楚没事。
5. 示例项目在事件所在日能看到 Inbox / 授权 / Session；做完了后未处理列表少一条；重新授权打开 Feed 来源；接着做打开原对象。
6. 快捷方式仍按项目持久化，添加/打开/编辑可用。
7. 浅色 / 深色、桌面 / 390 成立。390 日期卡横向，详情盖中栏。
8. 控件是 `mw-*`。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/home-flow.test.ts tests/project-home-start.e2e.test.ts tests/desktop-tui.test.ts tests/chrome-inner-scroll.test.ts tests/visual-foundation.test.ts tests/i18n.test.ts
```

本地打开示例项目首页，点一条 Inbox、做完了、点授权失败件。

## 假设与开放问题

- 说一句不在首页落 AI 回复；Session 才是对话能力。
- Hero 总结按件数模板生成，不调用模型。
- 开放：Shelf / Artifacts 是否按到达日进时间轴，下一刀再定。

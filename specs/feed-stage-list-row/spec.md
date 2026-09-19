# Feed 主区列表对齐 Goal 舞台列表

状态：已实现。完成等级目标 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件覆盖 `specs/feed-stage-directory/spec.md` 里「任务与条目 44px 两行」的视觉行语法，以及 `specs/linear-workbench-density/spec.md` 里「Feed 关闭行 40px、来源叠在标题上」的行高。IA 不变：左边来源任务，右边按来源任务分组，点开在同一行下展开详情。分组见 `specs/feed-stage-source-groups/spec.md`。

## 背景与问题

Feed 主区 `.feed-stage-tree` 当前是 40px 两行：来源/日期/蓝点「未读」在上，标题在下，左侧带框图标，右侧 chevron，行间 hairline。Goal 舞台列表是 28px 单行：标题 | 元数据列 | 平面状态标记，hover `--nav-hover`，无行间线。扫流水时标题变成次要信息，和 Goal 列表不在同一套语法里。

## 范围与非目标

### 范围

- Feed 主区条目行改成 Goal 列表那种单行：左侧无框图标 + 标题，来源、时间、状态各占一列。
- 关闭行桌面 28px；窄屏/触控最小 44px。
- 未读/已读用 `mw-status--plain`（未读 attention，已读 quiet）。处置不是「仅 Feed」时，状态列显示处置标签，优先于已读。
- 去掉 boxed 图标、蓝点药丸、chevron、关闭态 hairline/卡片。
- 点开仍在 `.feed-stage-item-detail` 展开，不切页；行本身保持单行高度。

### 非目标

- 不把 Goal 的进度条、关系列、集合折叠搬过来。
- 不改来源任务目录、筛选、忽略、Inbox/升 Goal、拖到 Frame。
- 不重做 Inbox 列表。

## 方案

行 DOM：

```
button.feed-stage-entry
  .feed-stage-leading > .feed-entry-provider + strong
  .feed-entry-source
  time
  .mw-status.mw-status--plain.feed-entry-status
```

列：`minmax(12rem, 1fr) minmax(7rem, 12rem) 6.25rem 5.5rem`。760px 及以下只留标题和状态，最小高度 44px。

## 验收

1. 桌面关闭行高度 28px；标题 13px / ≤500；标题列宽于图标槽，不被挤成一两字。
2. 行上能看到来源、时间和平面状态标记；没有 chevron、没有 5px 未读圆点、没有带框 provider。
3. 点开一条：同一树下展开详情，地址栏不出现第二页；再点收起，列表行仍是单行。
4. `aria-expanded` 与展开状态一致；已读乐观更新仍改 `data-feed-entry-read` 和「已读」文案。
5. 空态、筛选、窄屏 760 仍可用。

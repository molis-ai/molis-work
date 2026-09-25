# Feed 来源工作台

- Mode: **Operate**
- 状态：built；2026-09-24 按当前实现记录。
- 需求：[spec](../../specs/feed-source-workbench/spec.md)。目标为内部完整，完成等级须由主任务实际验收证据裁决。
- 局部视觉系统：[Feed DESIGN.md](../../plugins/native/feed/DESIGN.md)；沿用全局 Linear × coss.ui 中性色与共享控件。

## 用户任务与已选方向

用户从左侧选择 GitHub、Gmail、RSS 等来源，在同一个右侧工作面读消息、调范围与拉取计划、写捕捉规则。已确认方向是来源在左、消息在右；消息、来源设置、捕捉规则原位切换。添加来源也进入右工作面。无需先离开 Feed 创建 Functions 才能写自然语言规则。

该布局承接产品的来源、Feed、Inbox 分工：来源负责接入和拉取，Feed 保存完整消息事实，Inbox 表达需要介入的事项。Feed 操作保留保存资料、升格 Goal、开始处理、忽略与入箱路径。

## 已实现的路径与状态

| 路径 | 界面行为与边界 |
| --- | --- |
| 选来源 | 全部消息汇总各来源；具体来源显示自己的消息和状态，并开放设置、规则页签及立即拉取。切换来源关闭阅读、返回消息，窄屏同时收起来源导航。 |
| 阅读 | 右栏列表切换为正文，左栏和当前来源标题保留。返回恢复来源和列表上下文；搜索、筛选、排序仍归原列表。加载和错误有明确占位及重试入口。 |
| 编辑来源 | 名称、地址或账号、范围与说明、拉取计划、运行记录原位显示。资料和计划各自保存；取消重置未保存设置，计划另有撤销修改。切换来源暂存未提交字段，后台刷新会恢复被改动的字段。此表单保留不等于跨浏览器重启的持久草稿。 |
| 选账号 | Feed 从连接接口加载可用账号；Connectors 负责授权。切换连接的契约是新建独立来源、暂停旧来源、保留历史并继承计划和规则。相同连接重授权保留游标。隔离 Host 中 A→B 的 UI 切换、旧来源暂停、新来源选中和规则继承已实操通过；外部服务真实拉取仍待 Connector 任务组合验收。 |
| 写关键词 | 默认模式；按完整关键词检查标题、摘要、标签和正文。预览调用生产匹配路径，不另写前端匹配逻辑。 |
| 写自然语言 | 原位填写关注条件，经 Functions 公共 API 建立或更新草稿，用近期消息试跑，再发布并创建 Feed 引用。规则名称或描述改变会使旧预览失效。 |
| 复用规则 | 选择已发布 Functions，调用公开 invoke 得到判断；已有规则可启停、删除。AI 定义与版本继续由 Functions 管理。 |
| 预览与启用 | 预览只显示匹配、不匹配、待复核；没有样本、缺 AI 凭据、调用失败均保留输入并显示原因。启用后的正式处理针对新消息和更新。默认仅建议，自动入 Inbox 须选择相应处理方式。 |
| 处理历史 | 已有规则下的独立折叠区域明确说明对最近 20 条消息运行当前规则，可能写入 Inbox；不会在预览或保存规则时自动执行。 |

规则草稿以项目路径和来源 ID 为键保存在内存及 `sessionStorage`，支持当前浏览器会话内恢复；Functions 草稿和版本由后端持久化。自然语言保存前校验当前内容已有对应预览，发布检查仍由 Functions 负责。预览可能保存 Functions 草稿、试跑记录并发生 AI 调用；“无入箱副作用”不能扩写成“完全不写数据”或“不会产生调用成本”。

## 空间与窄屏

桌面来源栏固定（236px），右侧弹性铺开；配置宽度上限（700px），阅读上限（76ch）。表单正文独立滚动，页头和底部动作留在工作面。具体尺寸及主题 token 以局部 DESIGN.md 和源代码为准。

Feed 容器宽不大于（700px）时，来源栏变成覆盖导航，右侧占满空间；不把来源、列表、正文挤成三栏。消息时间列隐藏，规则操作换到说明下方，长规则名允许换行。窗口宽不大于（760px）时，页签和匹配方式按钮至少（44px）高。已知移动来源开关仍为（32px），现有尺寸记录不等于全量触控可达性通过。

## 所有权与实现入口

| 所有者 | 当前职责与入口 |
| --- | --- |
| Feed 插件 | [ui.ts](../../plugins/native/feed/src/ui.ts) 负责来源、消息、设置和规则的标记；[styles.ts](../../plugins/native/feed/src/styles.ts) 负责该表面的布局与局部样式。Feed 持有消息、捕捉规则及 Functions 引用。 |
| Workbench 客户端 | [navigation-feed.ts](../../apps/workbench/src/scripts/client/navigation-feed.ts) 负责来源选择、工作面切换、连接列表和刷新恢复；[feed-rule-authoring.ts](../../apps/workbench/src/scripts/client/feed-rule-authoring.ts) 编排规则草稿、预览和保存；[events-primary.ts](../../apps/workbench/src/scripts/client/events-primary.ts) 承接保存、取消及已有动作。 |
| Sources / Connectors | Sources 持有来源配置、计划、游标与运行记录；Connectors 持有账号授权与连接状态。Feed 选择连接 ID，不复制凭据。 |
| Functions | 持有 AI 判断定义、草稿、发布版本、试跑与执行契约；Feed 不建立第二套判断引擎。 |
| 共享设计系统 | [palette.ts](../../packages/design-system/src/palette.ts)、[typeface.ts](../../packages/design-system/src/typeface.ts) 及共享控件负责主题、字体和交互质感；此任务不替换根 DESIGN.md 或其 sidecar。 |

## 可达性与验证记录

当前标记具备原生按钮和字段标签、来源与页签当前状态、匹配模式按压状态、加载状态、预览 live region、状态反馈及共享可见焦点。窄屏布局与规则动作排列经过截图复核。没有据此宣称完整屏幕阅读器测试、全键盘路径实操或 WCAG 合规。

本轮设计证据：

- [桌面消息](../review/feed/desktop.png)
- [桌面规则](../review/feed/desktop-rules.png)
- [窄屏规则](../review/feed/mobile.png)
- [窄屏规则表单](../review/feed/mobile-form.png)
- [窄屏预览与保存动作](../review/feed/mobile-actions.png)

主任务交接确认：设计 reviewer 的唯一布局 finding 已修复，收尾改动限定在视觉修复。以上截图记录该次表面结果，不作为真实外部账号运行证明。

主任务已报告隔离 Local Host 与 fake provider 下的功能路径通过，包括真实本地存储和可控 AI 接线；该证据覆盖受控环境。真实第三方账户在这次 Feed 工作台中的“选连接 → 配范围/计划 → 拉取 → 写规则”组合验收尚未完成，Connector 集成主任务仍在进行中。工程检查、受控实操、真实账号实操与一骏本人验收应分别记录，不能合并为已可发布。

补充证据：[深色桌面](../review/feed/desktop-dark.png)。最终工程与实操状态见唯一需求书验证记录。

最新交接：Feed43项及标签工作区29项通过；连接层负责人已接手断开状态投影和3项旧Connector UI回归更新。完整状态以spec最终交接为准。

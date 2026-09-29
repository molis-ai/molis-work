# Soft Workbench 迁移清单

来源：`apps/workbench/src/plugin-catalog.ts` 的 `BUILTIN_PLUGIN_CATALOG`（25 个内置插件）、各插件 `src/manifest.ts` 的 `ui.views`、`plugins/official-integrations/*`、`apps/local-host/src/web-routing.ts` 的页面路由、`apps/workbench/src/settings-directory.ts` 的设置分区、`packages/design-system/src/plugin-components.ts` 的生成插件组件。

第二轮（2026-09-28，用户要求首页 / 目标 / 信息流按原型版式做到位并扩展到所有插件）：共用 plugin-stage 的插件与 Sessions 的列表页统一为「标题 + 居中一栏 + 石墨新建 + 44px 行」，打开条目后列表成为浅色侧栏；证据文件名与第一轮相同的截图已按新构建重拍。

状态：`已验证`＝在真实页面（隔离 Home + 演示数据，当前源码构建）操作并截图；`已适配`＝样式经共享 token / 原语 / 终层落地，并由测试或组合截图覆盖，但没有单独为它截图；`未验证`＝本机条件不具备，写明原因。

证据列是 `.impeccable/review/soft-workbench-rollout/` 下的截图文件名（不带扩展名，文件为 `.jpg`）。前缀：无前缀＝1440×1000 浅色中文标准密度；`dark-` 深色；`w1422-` 1422×800；`p390-` 390×844；`compact-` 紧凑密度；`en-` 英文；`long-` 长文本压力（在页面里临时替换标题文字，只用于看截断，不是产品数据）。

「视觉精修」列（第三轮，图标 · 配色 · 动效 · 视觉）：`已精修`＝本轮逐页核对并改到规范；写了改动的是本页特有的修复，其余是共享阶梯与 token 带来的变化。`refine-*` 是精修前后对比图（上排精修前、下排精修后；1440 浅色 / 1440 深色 / 390）。自查清单与发现—修复记录见 `visual-refinement-checklist.md`。

## 全局界面

| 模块 | 页面/视图 | 现有能力与关键状态 | 适配位置 | 状态 | 证据 | 剩余问题 | 视觉精修 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 设计基础 | token、字体、终层 | 浅/深/跟随系统、标准/紧凑、中/英 | palette.ts、typeface.ts、craft-finish.ts | 已验证 | catalog、dark-catalog、compact-goals-list、en-home | — | 已精修：间距、字号、时长、曲线、阴影、遮罩全部收到固定阶梯；浏览器默认色接 token · refine-catalog-icons、refine-catalog-motion |
| 底栏 | Dock 菜单、常驻插件、+N 溢出 | 插件市场、插件创作、常驻多选、拖拽排序 | immersive-shell.ts、craft-finish.ts | 已验证 | bar-dock-menu、home、catalog-bar | 拖拽排序只经测试覆盖，未截图 | 已精修：Dock 图标 20px / 描边 1.6、插件图标唯一 |
| 底栏 | 插件切换 + Assistant 输入 | 插件列表（全部入口）、草稿、发送、⌘K、分屏窗格 | immersive-shell.ts、craft-finish.ts | 已验证 | bar-picker、p390-bar-picker、en-bar-picker、dark-bar-picker | — | 已精修：选择器改安静的幽灵控件；≤1100 先压缩、≤860 只留一个 |
| 底栏 | Assistant 面板 | 流式、等待、停止、失败、重试 | personal-assistant-ui.ts | 已验证 | bar-assistant | 未连接模型时只见未连接态；流式回复未在截图中出现 | 已精修：浮层无描边、`--lift-3` |
| 底栏 | Shelf / 灵光 / 项目讨论 / 项目圆钮菜单 | 项目切换、项目设置、群聊私聊、能力、设置、账号 | immersive-shell.ts、craft-finish.ts | 已验证 | shelf、lingguang-resident、chat、bar-project-menu、p390-bar-project-menu | — | 已精修：菜单无描边（修掉盖过终层的旧描边规则） |
| 标题栏 | 前进后退、工作区标签、分屏、后台任务 | 拖动排序、分屏、关闭、桌面拖动区 | immersive-shell.ts、tab-workspace.ts | 已适配 | home、goals-doc | 分屏与标签拖动靠既有 e2e 覆盖；原生窗口拖动区未在本机原生包中验证 | 已精修：标签过渡 130ms、嵌入页淡入 |
| 全局搜索 | ⌘K 对话框 | 搜索已载入内容、切换工具、键盘选择 | craft-finish.ts | 已验证 | search | — | 已精修：进出 250ms、退出不拦输入、遮罩 `--scrim` |
| 项目目录 | `/` 选择项目 | 搜索、新建、演示数据、空态 | project-index 样式、craft-finish.ts | 已验证 | project-index | — | 已精修：标题 30px、卡片类型 12px、没有项目时的空状态补纸张插图 · refine-project-index |
| 项目首页 | 今天的工作标题、横向日期条、正在推进、当天事件（原地展开详情与说一句）、随手记、回到手边的内容 | 空日期、事件打开、打开来源、建议动作、说一句、快捷方式增删改、读取失败重试 | project-home.ts、scripts/client/project-home.ts、styles/project-home.ts | 已验证 | home、home-event-open、home-talk、home-otherday、dark-home、w1422-home、w1024-home、p390-home、p390-home-scrolled、en-home、en-dark-home、en-p390-home | 第二轮按原型重做了版式（用户指出与设计稿不同）；随手记只存在当前浏览器，界面上写明；正在推进取当前项目进行中的 Goal，没有时不显示 | 已精修：元信息 11→12px、快捷行分隔线与列对齐、加载与失败（重试）、到达只在首次 · refine-home |
| 插件市场 | 市场 | 搜索、添加到项目、升级、打开、重试 | immersive-navigation.ts、craft-finish.ts | 已验证 | market、dark-market、p390-market、en-market | — | 已精修：插件图标唯一且与 Manifest 一致；页头补说明句、标题 24px；淡色底评估后不采用 · refine-market、refine-tint-market |
| 全局设置 | 界面与语言、模型设置、AI 与执行工具、诊断 + 插件设置 | 主题/密度/语言/终端主题、模型提供方、Runtime 计划、诊断 | settings-*.ts、interaction-texture.ts | 已验证 | settings-appearance、settings-models、settings-runtimes、settings-diagnostics、dark-settings-appearance、compact-settings-appearance、p390-settings-appearance、en-settings-appearance | — | 已精修：导航分组 12px、四处加载改共享加载行 · refine-settings |
| 项目设置 | 常规、工作目录、项目说明 + 插件设置 | 改名、删除、目录、规则 | project-settings-*.ts | 已验证 | project-settings | — | 已精修：随共享阶梯 · refine-project-settings |
| 连接器设置 | 连接列表、授权、方法目录 | OAuth、API key、失败、过期、重连 | settings-connectors.ts | 已适配 | settings-models | 真实 OAuth 成功与过期态需要测试账号，未验证 | 已精修：品牌块改 `--brand-tile-*` token |
| 能力服务 | `/capabilities` | 列表、筛选、详情 | capabilities.ts | 已验证 | capabilities | — | 已精修：空状态标题 15px · refine-capabilities |
| Functions / MCP 访问 | 设置内 | 编写、调用、查询 | functions/、mcp-access.ts | 已适配 | — | 共享原语覆盖；未单独截图 | 已精修：分类色中性化 |
| 人工复核 | human review、agent review | 决策、证据 | human-review-renderer.ts | 已适配 | — | 演示数据里没有待复核项，未单独截图 | 已精修：取消用 `status-cancelled`，裸图标收进纸张标记 |
| 群聊 | im-ui iframe | 群聊、私聊、Thread | packages/im-ui/src/styles.ts | 已验证 | chat、dark-chat | — | 已精修：遮罩 `--scrim`；iframe 内部是嵌入内容，只改外框 |
| 桌面胶囊 | 菜单栏胶囊 | 快速记录、状态 | apps/desktop/src/capsule-shell.ts | 未验证 | 测试 capsule.test.ts | 原生 macOS 包本机未构建；只验证了 HTML 与样式 | 已适配：铜色 token 跟随（测试覆盖），未在原生包里看 |
| Onboarding | 首次：语言 → 外观 → 来源 → 确认 → 整理 → 开始 | 来源选择、授权、预览、整理采用、空白开始、连接模型、恢复 | context-onboarding*.ts | 已验证 | onboarding-1-language … onboarding-12-landed、onboarding-390-*、onboarding-1422-sources、onboarding-dark-sources、onboarding-reduced-sources、onboarding-en-* | Gmail OAuth 只验证了未配置态 | 已精修：`--ob-*` 由壳 token 派生，两种主题都跟随 |
| Onboarding | 新项目（老用户，不走语言/外观） | 同上，跳过前置步骤 | 同上 | 已验证 | onboarding-new-project、w1422-onboarding-new-project、p390-onboarding-new-project、en-onboarding-new-project | — | 已精修：`--ob-*` 由壳 token 派生，两种主题都跟随 |
| Onboarding | 更新说明 | 继续、查看设置 | onboarding-renderer.ts | 已验证 | onboarding-update、dark-onboarding-update | — | 已精修：`--ob-*` 由壳 token 派生，两种主题都跟随 |
| 组件板 | `/__ui/catalog`、`/__ui/catalog/bar` | 真实组件、组合、真实底栏 | primitives/catalog.ts、primitive-catalog.ts | 已验证 | catalog、catalog-choice、catalog-compose、catalog-bar、dark-catalog、en-catalog | — | 已精修：新增「图标清单」（插件、状态、尺寸、空 / 加载 / 失败）与 12 个可点的动效标本 · refine-catalog-icons、refine-catalog-motion |

## 内置插件

| 插件 | 页面/视图 | 现有能力与关键状态 | 适配位置 | 状态 | 证据 | 剩余问题 | 视觉精修 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Goals | 列表、筛选、画布、看板、文档（概览 / 终端）、新建、规划、规则 | 新建、筛选、视图切换、概览与终端切换（按 Goal 记住）、记录进展、决策、归档恢复 | plugins/native/goals、goal-canvas.ts、goals-page-renderer.ts、immersive-navigation.ts | 已验证 | goals-list、goals-filter、goals-canvas、goals-board、goals-doc、goals-terminal、goals-create、goals-planning、goals-rules、g-form-1440、g-form-1024x400、dark-goals-doc、p390-goals-doc、en-goals-doc、w1024x400-goals-doc | 终端内容由 Runtime 决定 | 已精修：状态图标固定、文档小节与时间线标题 13px、画布空状态补纸张插图、加载改共享加载行 · refine-goals-list、refine-goals-doc |
| Sessions（work） | 列表页（标题、居中一栏）、打开后侧栏、新会话 | 新会话、恢复、关联、筛选 | plugins/native/work、craft-finish.ts | 已验证 | sessions、sessions-open、sessions-add、compact-sessions | 终端内容由 Runtime 决定 | 已精修 · refine-sessions |
| Inbox | 列表页（待处理 / 历史分节）、详情、撰写 | 处理、转交、整理到 Pages | plugins/native/inbox、craft-finish.ts | 已验证 | inbox、inbox-row、inbox-compose、dark-inbox | — | 已精修：撰写对话框去描边 · refine-inbox |
| Feed | 文章列（来源菜单、搜索与筛选、全部 / 未读 / 已保存、时间线）、阅读页、添加来源、来源设置与捕捉规则 | 添加来源、立即拉取、未读 / 已读、保存、加入 Inbox、升格 Goal、忽略、筛选排序、失败重试 | plugins/native/feed（ui.ts、styles.ts）、navigation-feed.ts | 已验证 | feed-list、feed-item、feed-menu、feed-source、feed-saved-empty、feed-add、feed-settings、dark-feed-item、p390-feed-list、p390-feed-item、w800-feed-list、en-feed-list、en-feed-item | — | 已精修：阅读标题 24px、元信息 12px、来源菜单去描边 · refine-feed |
| Schedule | 任务、新建 | 到点运行、唤醒 | plugins/native/schedule | 已验证 | schedule、schedule-new | — | 已精修：空状态计时器收进纸张标记 · refine-schedule |
| Workflows | 流程目录、新建 | 串联插件、交接 | plugins/native/workflows | 已验证 | workflows、workflows-new | — | 已精修：类型标签中性化、加载改共享加载行 · refine-workflows |
| Pages | 文档目录、新建 | 块编辑、查找、表格、代码 | plugins/native/pages | 已验证 | pages、pages-new | — | 已精修：列表读取失败在原位可重试 · refine-pages |
| Forms | 列表页、编辑器（居中一栏） | 编辑、预览、结果、发布 | plugins/native/form、craft-finish.ts | 已验证 | form、form-new、form-open、p390-form | — | 已精修：空状态新建降为次按钮、列表读取失败可重试（实测 503 → 重试恢复） · refine-form、refine-error-form、refine-error-form-retry |
| Dataset | 列表页、编辑器（居中一栏） | 编辑、导入 CSV、版本 | plugins/native/dataset、craft-finish.ts | 已验证 | dataset、dataset-new、dataset-open | — | 已精修：同 Forms · refine-dataset |
| PPT | 大纲、新建 | 预览、导出 | plugins/native/ppt | 已验证 | ppt、ppt-new | 演示文稿自身的配色是用户数据，不随界面改 | 已精修：图标改 `presentation`、空状态次按钮、读取失败可重试 · refine-ppt |
| Artifacts | 成果浏览、打开 | 导入、引用 | plugins/native/artifacts | 已验证 | artifacts、artifacts-open | — | 已精修 · refine-artifacts |
| 图片 | 生成、新建 | 凭据引用 | plugins/native/images | 已验证 | images、images-new | 未配置服务时只见配置态 | 已精修 · refine-images |
| Jelly | 日程、笔记 | 灵感、导入 | plugins/native/jelly | 已验证 | jelly、jelly-notes | — | 已精修：分类色是用户数据，保留 · refine-jelly |
| Cognia | 知识、添加 | 来源 | plugins/native/cognia | 已验证 | cognia、cognia-add | — | 已精修：空状态补纸张插图、标题 15px；手机页头不再压住列表；加载改共享加载行 · refine-cognia |
| Shelf | 置物架（列表页标题与居中一栏）、阅读、设置 | 放入、处理副本 | plugins/native/shelf、craft-finish.ts | 已验证 | shelf | 结构保留 DropAgent，颜色改为共享 token | 已精修：手机页头不再压住列表、菜单去描边 · refine-shelf |
| 灵光 | 列表页、写作页（居中一栏）、常驻入口 | 记下、留下、丢掉 | plugins/native/lingguang | 已验证 | lingguang、lingguang-open、lingguang-resident | — | 已精修：空状态次按钮、读取失败可重试 · refine-lingguang |
| Coding | 会话、任务板 | 执行、审查、提交草稿 | plugins/native/coding | 已验证 | coding、coding-taskboard | 需要真实 Runtime 的执行态未截图 | 已精修：头像色、受阻空态收进纸张标记 · refine-coding |
| Files / Git / Diff / Text Stats | 被 Coding 等嵌入 | 预览、变更、对比、统计 | 对应插件 styles.ts | 已适配 | coding | 嵌入视图随共享 token 变化，未单独截图 | 已适配：随共享 token 与阶梯，无单独截图 |
| Characters | 角色管理、新建 | 发布版本 | plugins/native/characters | 已验证 | characters、characters-new | 身份色改为中性（测试已按规范更新） | 已精修：状态小字 12px、内置角色读取失败可重试 · refine-characters |
| 实验 | 模型对比、新建 | | plugins/native/experiments | 已验证 | experiments、experiments-new | — | 已精修：图标改 `flask`、读取失败可重试 · refine-experiments |
| 炼金术士 | 方向、新建 | 卡片、研究、决策 | plugins/native/alchemist | 已验证 | alchemist、alchemist-new | — | 已精修：空集合改纸张插图、加载改共享加载行 · refine-alchemist |
| 插件创作 | 创作台 | Agent 构建、验证 | plugins/native/plugin-builder | 已验证 | plugin-builder | 315 处写死颜色改为 token，逐条复核过误判 | 已精修 · refine-plugin-builder |

## 官方集成

| 集成 | 界面 | 状态 | 证据 | 剩余问题 | 视觉精修 |
| --- | --- | --- | --- | --- | --- |
| catalog | 连接方法目录（设置内） | 已适配 | settings-models | — | 随共享 token（界面在设置与 Feed 里，见对应行） |
| github | 连接与 Feed 来源 | 已验证 | feed-add、feed-list | 真实授权成功态未验证 | 随共享 token（界面在设置与 Feed 里，见对应行） |
| gmail | OAuth、来源、Onboarding 来源 | 已验证（未配置态） | onboarding-4-selected | 需要 Google 测试账号才能验证授权成功 | 随共享 token（界面在设置与 Feed 里，见对应行） |
| rss | 来源添加 | 已验证 | feed-add | — | 随共享 token（界面在设置与 Feed 里，见对应行） |
| web-query | 无独立 UI（服务端查询） | 不适用 | — | — | 不适用 |
| youtube | 来源添加 | 已适配 | feed-add | — | 随共享 token（界面在设置与 Feed 里，见对应行） |

## 生成插件

| 对象 | 界面 | 状态 | 证据 | 剩余问题 | 视觉精修 |
| --- | --- | --- | --- | --- | --- |
| 共享渲染器 | plugin-components.ts / plugin-component-client.ts | 已验证 | generated-plugin、dark-generated-plugin、p390-generated-plugin | 用真实渲染器 + 内存数据渲染一个代表性插件（页框、卡片、表单、条目列表、行尾操作）；演示 Home 里没有已安装的生成插件 | 共享渲染器随原语精修（间距、字号、时长、浮层） |
| 已安装生成插件 | 底栏「更多」中的运行时插件 | 已适配 | generated-plugin | 与上同一套样式（settings.css + 组件样式 + 创作台样式）；未在 Home 中安装一个真实生成插件 | 共享渲染器随原语精修（间距、字号、时长、浮层） |
| 生成链路 | skills/molis-plugin-dev、Plugin Builder 提示词 | 已适配 | 测试 plugin-builder-* | ui.md 质量线与侧栏措辞已改；设计/代码提示词不涉及视觉，挂载大小在上限内 | 共享渲染器随原语精修（间距、字号、时长、浮层） |

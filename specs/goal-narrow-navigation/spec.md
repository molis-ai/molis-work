# 窄屏目标导航与展示

## 目标与完成等级

修复缩窄窗口后「目标」已选中却被 Goal 详情遮挡的问题，并补齐同一工作台内目录、目标列表、聚焦、运行、推进态势的往返。完成等级：内部完整。保留现有 Calm Desktop 视觉、事件阅读器和桌面布局。

用户要求：缩窄时点击「目标」应看到 Goal 列表；同时优化相关动线与展示。

## 当前证据

- 2026-09-11，真实预览 `/goals/INTERFACES`，视口约 721 × 936。`data-mobile-view="tree"`、目标 tab 已选中，`.tree-pane` 实际高度 0，`.document-pane` 仍为 `display:flex`、高度 844，两者位于 y=92。截图确认详情完全覆盖列表。
- `plugins/native/goals/src/event-document-styles.ts` 首条 `.document-pane:has(...)` 的 `display:flex` 优先级高于 Workbench 的窄屏隐藏规则。内容插件抢占了外层工作台显示控制。
- `documents-state.ts` 恢复状态时只要窄屏且有选中 Goal，就强制恢复为 document，忽略用户保存的列表或运行视图。
- `events-secondary.ts` 点击 tree 仅改 mobileView，没有从 root 切回对应目录；`setDesktopDirectory` 和 `setMobileView` 各自改 tab 状态，存在指示与展示不同步。
- `setWorkspaceMode` 在窄屏总切到 document/tui；graph 实际是 workspace 的兄弟内容，需明确其与列表、聚焦的关系，避免多块内容挤入同一单列。
- 首版真实浏览器验收：390/721px 列表可见、详情隐藏，1440px 并列正常；目录/运行刷新/同 Goal/输入往返通过。态势页仍将「聚焦」标为当前项，且 aria-controls 指向隐藏正文；新增焦点恢复在 390→721px 调整时把项目选择器 summary 的焦点移到「目标」。这两处按当前合同一起收尾。
- 同轮补查桌面态势→390px：resize 把 mobileView 改为 tree，但 workspaceMode/navigatorView 仍为 graph，`.goal-list-view` 因此仍是 display:none、高度 0。缩窄时应继续展示当前态势，再由目标入口显式返回列表；不能混用 graph 状态和 tree 容器。

## 范围与非目标

范围：现有 Goal 工作台的窄屏页面选择、可见性、状态恢复、同一 Goal 返回聚焦、目录进入 Goals，以及共享入口对 Feed/来源的影响；目标导航在桌面与窄屏之间切换时的连续性。

不改业务协议、Goal 数据、事件写入、Runtime 执行或绑定规则，不启动用户终端；不改主题设计、不新增导航体系；不安装正式环境、不提交、不推送；不删除测试或退役其他代码。既有无关截图删除保持原状。

## 场景与行为合同

1. 窄屏点击「目标」显示可搜索、滚动、选择的目标列表。详情与终端不得占位、覆盖或接收焦点。
2. 从列表点击新 Goal，成功加载后进入对应聚焦；再次点击已经选中的 Goal 也进入聚焦。请求失败保持可用的列表/原选择及错误提示，允许重试。
3. 从聚焦或运行回目标，保留选择、搜索、展开状态和列表滚动；返回聚焦保留当前文档内容与未提交输入。运行只是显示已有面板，导航不创建终端、不重绑已有终端、不发送内容。
4. 点击目录显示根目录；从根目录点击 Goals 显示 Goal 列表；从根目录再次点击顶部「目标」也返回 Goal 列表。Feed/来源的动态列表/详情标签和对应内容保持一致。
5. 任一时刻移动端导航只有一个当前项；键盘能够操作主要切换，焦点不能留在隐藏区域。主要移动切换触区至少 44px；沿用现有导航视觉，不增加重复按钮。
6. 重新载入、真实数据刷新保留用户最后选择的列表/聚焦/运行视图；直接打开具体 Goal URL 默认进入该 Goal 聚焦。浏览器前进后退仍对应正确 Goal。跨 760px 断点不会出现空白、重叠、错误 tab 或跳回无关模块。
7. 推进态势可进入并返回列表；从态势打开 Goal 到其聚焦。态势属于「目标」区域，顶部目标为当前项且关联实际可见的态势面板；再次点目标回列表，点聚焦到当前 Goal 详情，不增加新的顶部 tab。目标列表入口始终能找回列表；聚焦语义始终对应当前 Goal 详情。
8. 390px、约 721px 与 1440px 下，主要内容有可用高度、无横向逃逸；窄屏不同 pane 互斥，桌面原目录与正文并列正常。浅色/深色沿用既有样式。

## 实施选择与边界

外层工作台负责哪个 pane 可见；Goal 事件样式只负责自己可见后的布局。优先修改造成冲突的规则与已有状态函数，避免堆叠新的 `!important` 或平行状态系统。

沿用 `mobileView`、`workspaceMode`、`desktopDirectory` 与现有 sessionStorage；整理它们的更新顺序，消除强制覆盖已保存用户选择。必要的小型共享函数留在现有 Workbench client 装配中，不新建通用导航框架。

允许修改：
- `apps/workbench/src/goals-page-renderer.ts`
- `apps/workbench/src/scripts/client/{bootstrap,editing-graph,events-secondary,initialization,navigation-feed,documents-state,refresh-decisions}.ts`
- `apps/workbench/src/styles/responsive.ts`
- `plugins/native/goals/src/{event-document-styles,navigation-client,momentum-client}.ts`（仅相关导航与布局）
- `packages/design-system/src/styles/{momentum,personal-workbench-v3,navigation-ownership}.ts`（仅相关响应式规则）
- 必需的中英文映射；`tests/goals-narrow-navigation.e2e.test.ts` 及直接受影响的既有导航测试。

不允许改 SQLite、业务模块、CLI/MCP、依赖、锁文件、用户配置、其他项目。若发现需要扩大边界，先反馈并修订本 spec。

## 验收与验证

- 构建/类型：受影响包 build/typecheck；必要时根构建，确保真实 Host 使用最新产物。
- 测试：实际生产 renderer/client/styles 加隔离浏览器，验证页面可见矩形与当前 tab、交互后状态、刷新、重试、真实持久化无业务副作用；不能仅断言 data 属性或 CSS 字符串。
- 定向回归：现有 Goal 导航、推进态势、Workbench UI 相关测试；不重跑无关全仓。
- 人工视觉：同一轮检查 390/721/1440px 与主要往返；需要修正时集中修改后至多一轮确认。

示例命令：

```sh
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-narrow-navigation.e2e.test.ts tests/goals-navigation.e2e.test.ts tests/goals-momentum.e2e.test.ts tests/workbench-ui-platform.test.ts
```

## 执行与假设

延续本会话分工：Grok CLI / Grok 4.6 / xhigh 是唯一源码和仓库测试 writer；Codex 负责需求、检查与验收，不使用 ForkLight 或子 Agent。

当前运行的是隔离演示项目，允许用于本轮验证。预览替换前确认 PID/入口，不操作用户正式数据库。外观适配对象是同一 Web 工作台在浏览器和 macOS WebView 中的窄窗口，不是重建原生移动 App。

## 最终验收（2026-09-11）

完成等级：本次窄窗口导航范围达到内部完整。Grok 4.6 / xhigh 完成源码与测试；Codex 审阅 scoped diff 并完成真实预览验收。未提交、推送或安装正式环境。

| 场景合同 | 结果 | 证据 |
| --- | --- | --- |
| 1. 目标列表可见，其他 pane 不覆盖或接收焦点 | 通过 | 最终浏览器 390px：tree 高 752px，document/graph 为 display:none、高 0、inert；真实截图列表可见 |
| 2. 新 Goal、同 Goal、加载失败重试 | 通过 | 最终 narrow/navigation e2e；首轮手动新 Goal、同 Goal 与浏览器返回 |
| 3. 列表/聚焦/运行往返保留上下文，导航不执行工作 | 通过 | 首轮手动确认搜索和未提交输入保留；最终 e2e 对照 Goal、关系、run 持久化状态，无导航业务副作用 |
| 4. 目录与当前模块列表对应 | 通过 | 最终 e2e 的根目录→目标、根目录→Feed→根目录→Feed；既有 Sources/Feed 回归通过 |
| 5. 单一当前项、键盘、44px 与焦点 | 通过 | 最终 e2e 键盘切换；真实 390px 四个入口均高 44px，选中标记 bottom:0；390→721px 保留项目菜单 summary 焦点 |
| 6. 刷新、历史与断点连续性 | 通过 | 最终 e2e 列表/运行 reload、真实 recordNote 触发内容更新仍留在列表、既有导航历史；手动宽窄转换 |
| 7. 态势、目标、聚焦互相可达 | 通过 | 最终浏览器 721px 态势选中目标且 aria-controls 指向 graph；聚焦返回正文；1440→390px 态势高 752px，点击目标后真实列表可见且 graph 隐藏 |
| 8. 390/721/1440px 内容高度与桌面并列 | 通过 | 最终浏览器 390px 无横向溢出；721px 内容高 844px；1440px tree 宽 346px，document 宽 1086px，并列且均解除 inert |

构建：Goals 插件首轮 build 通过（此后未修改插件）；最终 design-system / workbench build 均 exit 0。首轮 10 项定向测试通过；最终 narrow/navigation/momentum 6 项通过，0 失败、0 跳过，约 20.4 秒。日志：`/private/tmp/molis-work-narrow-nav/{focused-tests,final-tests,final-design-system-build,final-workbench-build}.log`。

未运行：原生 macOS App 重打包、真机 Safari、全仓测试与发布验证；不属于本次 Web 窄窗口修复范围。Sessions 未单独手动走查，共享模块目录逻辑已审阅。本轮仅修正响应式布局与导航，不修改主题 token。

预览已加载最终产物：`http://127.0.0.1:62811/goals/INTERFACES`。验收后恢复默认窗口尺寸，清空临时搜索，停留在完整目标列表。

# Shell：已确认原型接入真实工作台

depends_on: 无。执行方式：串行，主执行方 writer。

输入：总 spec、`docs/design/immersive-workbench/` 及最新 aligned-titlebar 截图；真实 Goals momentum/event-document、Workbench 导航、Work PTY。

产出：两层目录和横向纯文字插件栏、32px 顶栏、独立插件 stage、固定 Goal 框、主区对话/终端插槽和右侧信息/时间线，现有功能可达。

允许修改：`apps/workbench/src/` 中当前页面装配/客户端/样式/i18n；`plugins/native/goals/src/` 的树、momentum、event-document 呈现；Work 的 terminal UI 必要组合；相关 UI 测试。不能改 Goal 事件业务规则、真实项目或 Runtime 协议。共享 Design System 只在明确必要时修改，默认样式限定工作台。

实现：保留现有 data selectors 与事件入口，移除过时工作面嵌套；固定框内配合稳定 PTY 节点，切换不销毁进程。Goal 标题进入展开框，应用顶栏显示插件。手机目录为抽屉，背景 inert，选择 item 后关闭；独立右栏按内容区宽度覆盖。Feed/来源/归档/设置保留有效入口。

验收：真实数据的根目录→Goals→展开→关闭；横条切 Sessions/Feed 并返回；用户已确认视觉结构；原生拖动/快捷键；时间线、编辑及终端节点仍工作。对话标签禁用，默认终端。项目入口为独立首页（真实项目名称、导览和插件入口），根层有回首页入口；Goal 深链正常，刷新/后退恢复工作。

验证：受影响包 typecheck/build；调整 `tests/goal-canvas-workspace.e2e.test.ts` 与相关导航/事件回归匹配新合同，不为通过删除仍有效断言。最终视觉统一在 verification 完成。

handoff：记录变更文件、保留 selectors、conversation 插槽与模式同步入口、已有通过检查及剩余问题到总 progress。

交付状态（2026-09-12）：本项已完成；验收证据和已声明的原生 App 未运行边界见 ../../progress.md。对话接入按用户要求延期，不是未完成的必需项。

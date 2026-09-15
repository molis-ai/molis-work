# Molis Work Runtime 与响应式工作台

## 完成等级

本 Goal 达到 **功能可用的 UI 重组（Level 3）**：真实 Molis Work 在宽屏、标准宽度和窄屏形成清晰的三种工作台布局，现有 Runtime/TUI 行为、Goal 绑定、终端会话和 Web/Desktop 功能结果保持不变。

## 背景与目标

Molis Work 既要作为桌面主工作站，也要与 Codex、Claude Code 等 Harness 并排使用。宽屏适合同时查看 Goal Tree、Goal Focus 和 Runtime；标准宽度继续强塞三栏会压缩正文；窄屏则需要明确的单视图切换。目标是让三种宽度各自使用合适的信息组织，而不是等比例缩小同一个布局。

## 范围

- 宽屏同时呈现 Goal Tree、Goal Focus 与 Goal-bound Runtime，并保留两条可调分隔线。
- 标准宽度默认呈现 Goal Tree 与 Goal Focus，Runtime 收进右侧可展开 Dock；用户展开后以覆盖式面板使用终端，不挤压正文。
- 760px 以下使用“目标 / 当前 / 运行”三视图切换，每次只显示一个主要区域。
- 保留 Runtime 的添加、展开、收起、复制、填入、推进、恢复会话、宽度记忆和当前 Goal 归属。
- Light、Dark 与跟随系统在三种布局中保持相同层级。

## 非目标

- 不修改 PTY、WebSocket、终端启动、Runtime 探测或会话恢复协议。
- 不新增 API、数据字段、状态、权限或 Runtime 类型。
- 不在本 Goal 中制作最终 README 截图。
- 不改变 Goal Tree、Goal Focus 或 Goal Graph 的业务规则。

## 方案

保留现有 `.workspace.is-desktop-tui`、`is-tui-collapsed`、`data-mobile-view` 和 TUI 事件链。宽屏继续使用三列 Grid；761–1180px 改为双列 Grid，展开的 Runtime 作为右侧浮层，默认折叠时显示竖向 Dock；760px 以下继续使用现有移动视图切换。默认折叠只在用户没有保存过偏好时应用，用户主动选择继续优先。

## 验收标准

1. 大于 1180px 时三栏同时可用，Tree 和 Runtime 宽度仍可调。
2. 761–1180px 时默认是双栏加 Runtime Dock，展开 Runtime 不会把 Goal Focus 压到不可读宽度。
3. 760px 以下可在目标、当前和运行之间切换，三个区域均无横向溢出或不可达操作。
4. Web 与 Desktop 呈现使用同一数据和动作，Runtime/TUI 行为、Goal 归属与终端会话未改变。
5. Light、Dark、中文和英文在关键宽度下均可用。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/visual-foundation.test.ts tests/desktop-tui.test.ts tests/web.test.ts tests/i18n.test.ts`
- 真实页面检查 1477×919、1000×900、700×900 三种视口，并验证 Runtime Dock 展开/收起及移动视图切换。

# Molis Work Harness 同屏伴随窗口高保真实现

## 完成等级

本 Goal 达到 **内部可用的桌面 UI 切片（Level 4）**：真实 Codex/Harness 桌面端与窄宽 Molis Work Desktop 可并排使用；Molis Work 在不改变任何业务行为的情况下，把当前 Goal、下一步、阻塞和 Runtime 绑定进度收敛到一个伴随视图。

## 背景与目标

宽屏三栏适合把 Molis Work 当主工作站，但与 Codex 或其他 Harness 同屏时，继续压缩三栏会造成信息拥挤。目标是让桌面窄窗成为一块持续可见的 Goal 伴随面板：执行仍发生在 Harness，Molis Work 负责让用户随时看清当前事实和进度，不需要切换窗口或重新解释上下文。

## 范围

- Desktop 在 760px 及以下进入伴随模式，使用 Goals / Focus / Runtime 三个清晰入口。
- Desktop 与 Web 采用不同的外壳：项目切换、语言、主题和设置等全局入口留在原生窗口 TitleBar，内容区不重复这些控制。
- 深链到具体 Goal 或从宽窗进入伴随模式时，优先显示 Focus。
- Focus 首屏突出当前 Goal、下一步、阻塞与 Bound to Goal 进度；绑定信息只读取现有 Claim、Run、Evidence 和完成标准。
- 窄窗不横向滚动，不裁切关键操作；宽屏 Desktop 三栏与 Web 页面保持现状。
- 真实 Codex/Harness 与 Molis Work `.app` 并排截图，其他项目与隐私信息必须打码或避开。

## 非目标

- 不修改 Claim、Run、Runtime/TUI、Goal 生命周期、关系、状态机、权限或跨 Runtime 契约。
- 不伪造 Runtime 步数、百分比、日志或 Artifact。
- 不把 Codex/Harness 页面做成 Molis Work 内的假界面。
- 本 Goal 不修改 README 推广文案。

## 关键决策

窄窗不是缩小版三栏，而是一种 Desktop 专用伴随信息架构；TitleBar 承担全局导航，Goals / Focus / Runtime 承担当前工作切换。Bound to Goal 卡片使用真实 Claim/Run 状态，进度条只表达已通过完成标准占比，并同时显示已有 Evidence 数量；没有数据时明确显示“尚未绑定”，不推断 Harness 内部进度。详细上下文仍保留在宽屏、Web 与原有页面中。

## 验收标准

1. 真实 Molis Work `.app` 在约 440–520px 宽度下显示 Goals / Focus / Runtime，具体 Goal 默认进入 Focus。
2. Focus 首屏无需横向滚动即可看到当前 Goal、下一步、阻塞和 Bound to Goal 真实进度。
3. Bound 卡片中的 Runtime、Run、Evidence、完成标准来自现有 Molis Work 数据，不出现虚构步数。
4. Goals、Focus、Runtime 切换可用，宽屏桌面三栏与 Web 页面不回归。
5. 真实 Codex/Harness 与 Molis Work 并排截图能看出两个独立桌面窗口，且其他项目与隐私信息已处理。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/desktop-tui.test.ts tests/visual-foundation.test.ts tests/web.test.ts tests/i18n.test.ts`
- `pnpm test`
- 在 460×900 Desktop viewport 检查默认 Focus、零横向溢出、关键信息可见与三视图切换。
- 完整重启真实 `.app`，缩窄并与真实 Harness 桌面窗口并排截图。

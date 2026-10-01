# Dependency Decision Layout

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。renderRewireDecision 已不存在。没有剩余事项。

## 背景与目标

当前真实 Rewire 同时包含三条 Dependency Proposal、较长的方向说明和证据引用。用户在桌面页面看到提案正文被压成接近单字宽，中英文逐字符竖排，无法审阅并确认依赖。

目标是恢复依赖决策区的文档式阅读顺序：每条依赖先读方向，再读原因、方向依据、拒绝影响和证据，最后执行确认或拒绝。

## 当前行为和问题证据

- 用户截图：`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/codex-clipboard-5d550a9e-98e4-487a-8adc-38cc4b4edcc2.png`。
- `renderRewireDecision()` 在顶层 `.rewire-decision` 内嵌套 `.dependency-proposal` article。
- CSS 使用 `.decision-list article { display: flex; }`，误命中所有嵌套 article，使 `.dependency-proposal` 的 header、方向、说明和证据被横向排列。
- 长证据引用继承通用单行省略样式，不适合需要审阅完整依据的 Dependency Proposal。

## 范围与非目标

范围：

- 将 Decision List 的横向布局严格限制在顶层 Decision article。
- 保证嵌套 Dependency Proposal 保持纵向文档结构。
- 让长证据引用在提案内完整换行，并保持复制交互。
- 覆盖宽桌面、窄桌面和移动端布局回归。

非目标：

- 不修改 Dependency Proposal、Rewire 或用户权限语义。
- 不重新设计整个 Goal 文档或 Goal Tree。
- 不自动确认当前 pending Rewire。

## 用户场景

用户打开包含多条依赖调整的 Goal，在“需要你的决定”中逐条阅读依赖方向、理由和证据，并在不横向滚动、不出现逐字符竖排的情况下确认或拒绝 Rewire。

## 方案与关键决策

1. 把 `.decision-list article` 和对应首子元素规则改为直接子选择器，只控制顶层 Decision。
2. 给 Dependency Proposal 容器明确 `width: 100%` 与 `min-width: 0`，防止嵌套内容反向撑破父级。
3. 证据区使用“标签 + 可换行引用”的两列阅读结构；移动端改为一列。
4. 移动端 Decision 堆叠规则同样只作用于顶层 article。

## 输入、输出与依赖

- 输入：现有 `BoardSnapshot.rewires[].proposal.relations` 和长 `evidence_refs`。
- 输出：结构不变的 HTML 与修正后的 CSS；所有决策 API 和数据保持不变。
- 依赖：现有 Goal Workbench 设计语言、760px 移动断点和 Web 回归测试。

## 文件或模块边界

- `src/web/render.ts`：HTML/CSS 布局修复。
- `tests/web.test.ts`：选择器作用域与依赖提案结构回归。
- 不修改 `src/v1/`、MCP、CLI 或数据库。

## 验收标准

1. 顶层 Rewire Decision 可以横向放置正文与操作，但嵌套 `.dependency-proposal` 不会被设为 flex row。
2. 三条长 Dependency Proposal 在桌面页面均按方向 → 说明 → 证据的纵向顺序展示，不出现逐字符竖排。
3. 长证据引用在可用宽度内换行，不制造页面级横向溢出；复制按钮仍可用。
4. 760px 及以下顶层 Decision 和依赖内容均为单列，DOM/阅读顺序不变。
5. Web 定向测试、类型检查和机械 UI 检测通过；真实页面完成桌面与窄屏截图验证。

## 验证命令或测试

```bash
pnpm exec tsx --test tests/web.test.ts
pnpm typecheck
pnpm typecheck
node --import tsx --test tests/web.test.ts
```

## 假设与开放问题

- 假设截图来自当前真实 `rewire-d1386664-e52b-4c97-ba8d-3da2661403e4`，其数据本身有效。
- 当前没有需要用户决定的视觉方向；这是对既定文档式信息架构的回归修复。

# 设置页窄态布局修复

> 归档（2026-10-01，合入后梳理）：判定为**已实现**。窄态设置导航已落地。没有剩余事项。

## 背景与目标

设置页在 760px 及以下会把主布局切成顶部横向导航与单列正文，但导航中仍保留了只为桌面目录准备的项目切换区、设置标题和账户尾栏。它们与横向导航同时参与排版，导致截图中的错位、过高导航区和阅读起点下沉。

本次达到 **Level 3：功能可用**。目标是在不改变设置内容、路由和宽态结构的前提下，让全局设置、项目设置和规划设置的窄态只保留一条可横向滚动的设置导航，正文紧接其后并保持可读。

## 范围

- 修正 760px 及以下所有复用 `settings-navigation` 的页面。
- 窄态隐藏桌面专用的项目区、目录标题和账户尾栏。
- 让真实设置链接直接参与横向导航布局，保留当前项、键盘与横向滚动能力。
- 收紧窄态导航的垂直占用；在 520px 及以下把密度选项改为单列，避免说明文字被挤成窄竖排。
- 增加样式回归测试，并在至少 646px 与 390px 宽度检查界面。

## 非目标

- 不改变设置的信息架构、文案、路由或持久化行为。
- 不重做桌面宽态目录、项目切换器或设置卡片视觉。
- 不把设置导航改成新的抽屉、底栏或独立移动端实现。

## 方案与边界

- 在共享设置样式的 `max-width: 760px` 分支统一处理桌面专用结构，在共享视觉样式的最终窄态覆盖中恢复紧凑导航高度；删除仅作用于项目说明页的重复覆盖。
- `src/web/render.ts` 的设置 DOM 与行为保持不变，只调整同文件中的设置响应式样式；`src/web/visual-foundation.ts` 负责其后加载的视觉覆盖。
- `tests/visual-foundation.test.ts` 与 `tests/web.test.ts` 共同断言桌面专用区域退出窄态布局、导航高度与密度断点。

## 验收标准

1. 760px 及以下不再显示 `.settings-desktop-project`、`.settings-desktop-heading` 和设置导航账户尾栏。
2. 窄态只显示一条横向设置导航，当前页面仍清晰可辨，正文不被额外桌面结构向下推移。
3. 761px 以上的设置目录与项目控件行为不变。
4. 646px 与 390px 下无横向页面溢出，设置正文与选项可阅读、可操作。
5. 新增的窄态视觉基础测试与相关 Web 设置测试通过。

## 验证

- `node --import tsx --test --test-name-pattern="narrow settings keep one compact readable navigation layer" tests/visual-foundation.test.ts`
- `node --import tsx --test --test-name-pattern="Web settings use shared Runtime" tests/web.test.ts`
- `pnpm typecheck`
- `pnpm build`
- 本地页面 `/settings/appearance?desktop=1` 的 646px、390px 截图与溢出检查

## 假设与开放问题

- 用户截图对应约 646 CSS px 的窄态 Desktop/Web 共享页面。
- 本次没有需要用户决定的开放问题；若真实浏览器检查暴露正文卡片在更窄尺寸仍溢出，再在本 spec 内补充最小适配。

## 验收结果

| 验收项 | 结果与证据 |
| --- | --- |
| 桌面专用结构退出窄态布局 | 通过。646px 实测三项计算样式均为 `display: none`。 |
| 单层紧凑导航与正文阅读顺序 | 通过。646px / 390px 导航高度均约 56.8px，正文紧接导航。 |
| 宽态不受影响 | 通过。所有新增外壳规则只位于 `max-width: 760px` / `520px` 条件内。 |
| 646px / 390px 无页面横向溢出 | 通过。两档 `documentElement.scrollWidth - innerWidth` 均为 0；390px 密度选项为 350px 单列。 |
| 自动验证 | 通过。定向 Web 设置测试、定向视觉基础测试、TypeScript 检查、构建与 scoped `git diff --check` 均通过。 |

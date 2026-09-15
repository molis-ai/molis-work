# Molis Work 视觉基础与桌面工作台切片

## 完成等级

本轮达到 **可交互高保真切片（Level 2）**：真实 Molis Work 页面使用新的视觉基础，可在宽屏桌面工作站和 Harness 同屏窄窗口中体验。它不是整套 UI 改造完成，也不代表 Goal Navigator、Goal Detail、Goal Graph、截图和 README 子 Goal 已交付。

## 背景与目标

现有界面已经具备 Goal Tree、Goal Detail、Decision Center 和 Goal-bound Runtime/TUI，但视觉层级、主题和不同窗口宽度下的工作台气质不统一。首个切片建立一套可复用的 Light、Dark、Follow System 视觉基础，并让三栏桌面工作站和窄屏伴随窗口看起来属于同一个产品。

用户已确认的构图基准：

- `.impeccable/mocks/molis-work-desktop-workstation-a.png`：桌面三栏主工作站。
- `.impeccable/mocks/molis-work-harness-companion-b.png`：与 Codex/Harness 并排使用的窄窗口。
- `.impeccable/mocks/molis-work-graph-workstation-c.png`：只为后续 Goal Graph 子 Goal 提供视觉语法，本轮不实现 Graph。

## 范围

- 建立独立的视觉 Token 与核心工作台样式层。
- 支持 Light、Dark、Follow System，记住本机选择并响应系统主题变化。
- 统一字体、图标尺寸、颜色、间距、分隔线、焦点和组件状态。
- 优化桌面宽屏的 Goal Tree / Goal Detail / Runtime 三栏骨架。
- 优化窄屏的 Goals / Focus / Runtime 单栏切换，使其适合放在 Harness 旁边。
- 保留现有 HTML 语义、数据、字段、表单、状态和所有操作入口。

## 非目标

- 不实现 Goal Graph。
- 不重写 Goal Navigator 的关系模型或 Goal Detail 的领域内容。
- 不新增、删除或改变 Goal、Relation、Runtime/TUI、权限、状态机或 API 行为。
- 不制作最终 README 截图和推广文案。
- 不覆盖工作区内与本 Goal 无关的未提交修改。

## 方案与边界

新增 `src/web/visual-foundation.ts`，集中提供主题启动脚本、主题交互脚本和可复用样式。`src/web/render.ts` 只接入该层、渲染主题选择控件并更新首屏设计合同，避免在现有大型样式字符串中进行机械重写。`src/web/icons.ts` 仅补齐主题选择所需的同一套 Lucide 图标。

主题只影响呈现：偏好写入 `localStorage`，`system` 模式使用 `prefers-color-scheme`，不会进入 Molis Work 数据库或项目状态。Dark 主题单独定义核心表面和文本，不使用简单滤镜反色。

## 验收标准

1. 用户可以选择 Light、Dark、Follow System；刷新后保持选择，System 会随系统主题变化。
2. 宽屏 Goal 页面保留 Goal Tree、Goal Detail、Runtime/TUI 三栏，视觉层级与已确认的桌面构图一致。
3. 760px 以下仍可在 Goals、Focus、Runtime 间切换，核心内容和操作均可访问。
4. 核心文本、边界、焦点和语义状态在 Light 与 Dark 下清晰可读，状态不只依赖颜色。
5. 现有 Molis Work 功能、数据、API、状态与 Runtime/TUI 行为不变。
6. 定向测试、类型检查和宽窄屏可视检查通过；用户已有未提交修改未被覆盖。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts tests/i18n.test.ts tests/desktop-tui.test.ts`
- 真实本地页面的 Light/Dark 宽屏截图与 Harness 宽度截图。
- 主题切换、刷新保持、键盘焦点与窄屏三视图手动检查。

## 风险

- 当前 `src/web/render.ts` 有大量未提交改动：只做小范围接入，不重排或覆盖既有实现。
- 现有样式包含硬编码浅色值：首个切片覆盖核心工作台，视觉检查发现的漏色在同一轮集中修复。
- 设计稿中的 Codex 页面是构图参考；最终推广截图必须使用真实 Codex 页面并处理隐私信息。


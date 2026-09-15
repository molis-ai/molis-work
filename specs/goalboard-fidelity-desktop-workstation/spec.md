# Molis Work 桌面三栏工作台高保真实现

## 完成等级

本 Goal 达到 **内部可用的桌面 UI 切片（Level 4）**：真实 Molis Work Desktop 使用原生窗口与 TitleBar，呈现 Navigator、Goal Focus、Goal-bound Runtime 三栏工作台；所有内容来自真实项目，现有 Goal 与终端行为保持不变。

## 背景与目标

当前 Desktop 只是把 Web 工作台放进窗口，顶部重复占用空间，三栏也缺少清晰的桌面层级。目标是还原已确认的高保真方向：让 Desktop 成为一眼可识别的独立工作站，并让选中 Goal 贯穿列表、正文与 Runtime。

## 范围

- macOS 使用原生窗口控制与 Overlay TitleBar；品牌、项目切换、待决定、主题、语言和设置进入 TitleBar。
- Desktop 宽屏明确呈现 Goal Navigator、Goal Focus 与 Runtime 三个工作区。
- Runtime 顶部先显示当前绑定 Goal，再显示会话标签与终端操作。
- 压缩桌面端字号、间距、状态标签和分隔线，贴近确认稿的信息密度。
- Light、Dark 与跟随系统均可用。

## 非目标

- 不修改 Goal 数据、状态机、领取、推进、复核或关系语义。
- 不修改 PTY、WebSocket、Runtime 启动、会话恢复或 Goal 绑定协议。
- 不要求 Web 顶栏和 Desktop TitleBar 使用完全相同的布局。
- 本 Goal 不制作最终 README 推广截图。

## 关键决策

Desktop 由 `?desktop=1` / Desktop cookie 选择独立外观；Web 继续保留原有顶栏。Tauri 使用 `titleBarStyle: Overlay` 和 `hiddenTitle`，WebView 顶部的专用 TitleBar 承载现有操作。三栏仍复用同一份服务端数据与事件绑定，只改变 DOM 的视觉分区与 CSS。

## 验收标准

1. 真实 `.app` 中可见 macOS 原生窗口控制，TitleBar 内现有项目与全局操作可点击。
2. 1440×900 左右的 Desktop 窗口同时呈现 Navigator、Goal Focus、Goal-bound Runtime，三栏标题、边界与密度清晰。
3. 选择 Goal 后三栏保持同一 Goal；添加终端、推进、复制、填入、收起与恢复会话行为不变。
4. Web 页面仍保留完整 Web 顶栏，Desktop 差异只由桌面壳标记触发。
5. Light、Dark、System 与中英文关键状态可读。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/desktop-tui.test.ts tests/visual-foundation.test.ts tests/web.test.ts tests/i18n.test.ts`
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml`
- 构建并打开真实 `.app`，在 1440×900 左右检查 TitleBar、三栏、选中 Goal 与 Runtime 操作。

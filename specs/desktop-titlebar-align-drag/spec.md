# 桌面 titlebar 红绿灯对齐与窗口拖动

状态：已实现。完成等级 **4：内部可用**。不改用户项目数据、不提交、不发布。

## 背景目标

桌面 Overlay 标题栏里，红黄绿按钮应与 32px 行里的项目名/搜索/设置同高；空白处应能拖动窗口。

## 当前行为与问题证据

1. 用户截图（2×）：标题栏约 32 CSS px。项目名垂直中心约 16px；红绿灯中心约 8px，偏上约 8px。
2. Wry 把 `trafficLightPosition.y` 做成 titlebar 容器高度 `按钮高 + y`，但只改按钮 `origin.x`。AppKit 的 `origin.y` 从容器底边算；默认值把灯贴在窗口顶，`y=10` 没有变成顶边留白。
3. 有标签时 `.desktop-titlebar-drag` 被收成 0 宽。空白看起来可拖，实际是 `.tab-scroll`（`flex: 1`）且没有 `data-tauri-drag-region`。Tauri 2 不认单纯的 `-webkit-app-region: drag`。
4. 后续仍「有时拖不动」：Tauri 2 的 `data-tauri-drag-region` 默认只认**点在该元素自己身上**（`deep` 才吃子树）。标题栏 88px 红绿灯让位、flex 间隙、项目目录 topbar padding、设置页标题文字，命中的都是父节点或子节点，不是那条 spacer。按钮、链接、`role=tab` 会挡住拖动，这是对的。

## 范围与非目标

做：

- 主窗口红绿灯：在 Wry 的 inset 之后把按钮 `origin.y` 钉在容器底边，让配置的 `y=10` 成为顶边留白，与 32px 行中心对齐。
- 桌面 titlebar：标签滚动区只占标签宽度；加号和分屏成组钉在 titlebar 右缘；spacer 吃掉标签与加号之间的空白。
- Overlay 标题栏容器用 `data-tauri-drag-region="deep"`：空白、padding、子文本可拖；按钮/链接/标签仍可点。
- `html[data-native-desktop]` 与 `body[data-native-desktop]` 都要生效：bootstrap 写在 `html` 上。

不做：不改网页；不改全屏安全区语义；不改 `trafficLightPosition` 配置值；不改胶囊窗。

## 使用场景

1. 打开项目工作台：红黄绿与项目名垂直同高。
2. 在标签右侧空白按下拖动：窗口跟着动。点项目名、搜索、设置、标签仍触发控件。

## 方案

- `apps/desktop/adapters/tauri` 在 setup / 页面加载 / 缩放与尺寸变化时钉住主窗口按钮 `origin.y = 0`。
- `[data-titlebar-tabs] .tab-scroll` 在 `html`/`body` 的 `data-native-desktop` 下改为 `flex: 0 1 auto; width: max-content`。
- titlebar 顺序为标签滚动区 → spacer → 加号 → 分屏；spacer `flex: 1`。
- 工作台 `.immersive-titlebar`、项目目录 `.topbar`、设置 `.project-preferences-chrome`、引导 `.onboarding-topbar` 在桌面用 `data-tauri-drag-region="deep"`。Tauri 对 BUTTON/A/`role=tab` 会停掉拖动。

## 验收

1. 普通窗口：红绿灯垂直中心与项目选择器中心相差不超过 2 CSS px。
2. 标签未铺满时：加号紧贴分屏左边（间距约 8px），两者钉在 titlebar 右缘。点红绿灯右侧空白、标签与加号之间的空白、项目目录顶栏空白，都能拖窗口。
3. 项目切换、搜索、设置、标签仍可点击。
4. `trafficLightPosition` 仍为 `{ x: 16, y: 10 }`。

## 验证

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/desktop-tui.test.ts tests/chrome-inner-scroll.test.ts
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop
```

真实桌面窗口再看红绿灯与拖动。

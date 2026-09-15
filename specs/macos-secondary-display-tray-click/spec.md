# macOS 非主屏菜单栏入口无法点击

## 完成等级

功能可用（等级 3）：真实 macOS 多屏下，非主屏菜单栏的 Molis Work 图标左键可以打开工作胶囊；再次点击、点别处、Esc 仍能关闭。自动测试覆盖坐标与失焦契约；双屏真机行为需人工确认。

## 背景与问题证据

用户反馈：Mac 非主屏上，菜单栏（常被叫成顶部工具栏）里的 Molis Work 图标没法点。

当前实现：

- 左键点击菜单栏入口时，用 Tauri 托盘事件里的矩形把胶囊放到图标下方，再 `show()` / `set_focus()`。
- 窗口失焦时立即隐藏。
- 托盘矩形来自 `tray-icon`：把 AppKit 的点坐标用**主屏像素高度**做 Y 轴翻转，再用**状态项所在屏**的 `backingScaleFactor` 转成物理像素。
- 随后 `set_position(PhysicalPosition)` 又用**胶囊窗口当前所在屏**（通常是主屏）的 scale 转回逻辑坐标。

这套换算只在「点击发生在主屏、胶囊也还在主屏」时互相抵消，所以主屏看起来正常。副屏、尤其是和主屏 DPI 不同时：

1. 托盘矩形落不进任何显示器，回退到主屏。
2. 胶囊出现在另一块屏幕，或一块透明置顶窗口压在副屏菜单栏上。
3. 同一次点击立刻让胶囊失焦，随即隐藏。

用户感知就是：图标在，点了没反应。

隐藏后的透明置顶窗口如果仍参与命中测试，后续点击也会打到窗口而不是菜单栏图标。

## 范围

### 包含

- 用 AppKit 屏幕坐标（鼠标位置 + `NSScreen.visibleFrame`）把胶囊锚在**点击发生的那块屏**的菜单栏下方。
- 打开后短暂忽略失焦，避免同一次点击把面板马上关掉。
- 隐藏时忽略鼠标命中，避免透明窗口挡住菜单栏。
- 胶囊窗口在显示时移到当前 Space，并能出现在该屏的全屏 Space 上。
- 用纯函数测试副屏（含负 X、不同高度）锚点和失焦宽限。

### 不包含

- 重写为原生 `NSPopover` / `NSPanel`。
- Windows / Linux 托盘。
- 主窗口标题栏、红绿灯、Dock 图标。
- 修补上游 `tray-icon` crate。

## 使用场景

1. 笔记本是主屏，外接屏是非主屏。光标在外接屏菜单栏，左键点 Molis Work 图标。胶囊出现在该图标正下方，而不是主屏。
2. 外接屏在主屏左边（全局 X 为负）。行为相同。
3. 再点一次图标、点其他地方或按 Esc，胶囊关闭。之后菜单栏图标仍可点。
4. 主屏点击路径保持现有行为。

## 方案与关键决策

- 不再用托盘事件里的物理矩形作为副屏定位源。macOS 上改为：读取 `NSEvent.mouseLocation`，找到包含该点的 `NSScreen`，在该屏 `visibleFrame` 内用 AppKit 坐标 `setFrame`。水平对齐点击位置（也就是图标），垂直贴在菜单栏下方。
- 不经过 Tauri/tao 的 `PhysicalPosition` 往返，避免主屏像素高度和窗口 scale 再次把坐标拧到另一块屏。
- 显示后约 400ms 内忽略 `Focused(false)`，只挡住「点开的那一下」造成的失焦；超时后点别处仍关闭。
- 隐藏时 `set_ignore_cursor_events(true)`，显示时恢复。
- 用 `MoveToActiveSpace | FullScreenAuxiliary | Transient`，而不是常驻所有 Space，避免隐藏后的幽灵窗口。

## 输入输出与依赖

- 输入：菜单栏左键、鼠标的 AppKit 位置、当前 `NSScreen.visibleFrame`、胶囊宽高。
- 输出：胶囊窗口的 AppKit frame、`--capsule-anchor-x`、显示/隐藏与命中测试状态。
- 依赖：现有胶囊窗口、托盘左键切换、失焦/Esc 关闭。macOS 使用已有 objc2 栈，不引入新的窗口框架。

## 文件与模块边界

- `apps/desktop/adapters/tauri/src/capsule_window.rs`：AppKit 锚点纯函数、macOS 定位、失焦宽限。
- `apps/desktop/adapters/tauri/src/main.rs`：托盘点击、显示/隐藏、setup 接线。
- `apps/desktop/src-tauri/Cargo.toml`：macOS objc2 依赖。
- `specs/macos-secondary-display-tray-click/spec.md`：本需求。

## 验收标准

1. 非主屏菜单栏左键点击 Molis Work 图标后，胶囊出现在该屏、图标下方；不会只在主屏闪一下或完全没反应。
2. 主屏点击、再次点击关闭、点别处关闭、Esc 关闭仍成立。
3. 关闭后，同一副屏图标仍可再次点开。
4. 靠近副屏左右边缘时，面板仍完整落在该屏工作区内。
5. 相关 Rust 单元测试通过；现有胶囊定位测试不回退。

## 验证命令

```
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

人工：把 Molis Work 主窗口放到副屏，用副屏菜单栏图标打开/关闭胶囊；再在主屏重复一次。

## 假设与开放问题

- 按「顶部菜单栏状态项」理解「工具栏里的 Molis Work 图标」。若实际是窗口标题栏或 Dock，本 spec 不覆盖。
- 假设副屏点击仍能到达 `tray-icon` 的 `mouseDown`。若图标完全收不到事件，需要另开任务补状态项事件投递，而不是继续改坐标。

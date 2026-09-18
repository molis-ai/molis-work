# Shelf 轮盘：对标 DropAgent 的瓣材质与进出场

状态：几何、进出场、启用态已落地；纸面/字色仍未对齐 DropAgent。真人拖放未在本机脚本化。

本文件补 [`specs/shelf-plugin/spec.md`](../shelf-plugin/spec.md) 已要求、但现行原生轮盘没接到的 DropAgent 表面。权威是正在跑的 DropAgent：`macos/App/EdgeDropView.swift`、`EdgeDropController.swift`、`EdgePlacement.swift`。

## 背景与目标

现在的 Molis 轮盘把六条粗描边画在同一个透明窗里：圆头弧叠在一起，半透明纸色互相加成，看起来像一堆灰圆；图标没用 SF Symbol 调色；`orderFront` / `orderOut` 瞬间切。DropAgent 的轮盘是钉住的六块独立瓣，每瓣有纸面、浅投影、悬停回弹，出现淡入、离开淡出。

截图证据：拖到 Cursor 上时只有「加入材料」一块深色椭圆，其余瓣糊成灰圈，图标和字叠在底下 App 上。

## 当前行为与问题证据

- `drop_wheel.rs` 已有 `CONCEAL_DURATION`（120ms）和 `BOUNCE_SCALE`（1.06），标了 `dead_code`，原生层没用。
- `draw_wheel` 对中半径弧 `stroke` 线宽 64、圆头：六瓣在一个 `NSView` 里叠画。
- 图标：`imageWithSystemSymbolName` 之后 `SourceOver` 画进 16pt 框，没有 `SymbolConfiguration` / `paletteColors`。
- 实机图：左三瓣透出底下 GitHub 浅底，右三瓣吃 Cursor 深底。纸面 0.96 没盖住 `NSVisualEffectView`：chrome 不是 layer-backed（DropAgent 的 `chrome.wantsLayer = true`），frost 用 `maskImage` 而不是 `CAShapeLayer`，禁用瓣还把纸面 alpha 降到 0.45（DropAgent 始终 0.96，只把图标和字退灰）。
- 标签用了手写 `"NSFont"` / `"NSColor"` 键，没有 AppKit 的 `NSFontAttributeName` / `NSForegroundColorAttributeName`；chrome 跟着 vibrancy 走，字色不像 Palette `#E9E9ED`。

## 范围

对标 DropAgent 现行实现，不另做一版 Molis 玻璃轮盘。

**瓣**

- 几何仍是中半径弧 + 线宽 `outer - inner` + round cap，再 `CGPathCreateCopyByStrokingPath` 得到闭合瓣形后**填充**，与 `EdgePlacement.tilePath` 一致。命中继续用现有 `tile_contains`。
- 六瓣各是一个子视图，互不在同一层里把半透明描边叠脏。
- 每瓣：`NSVisualEffectView` material `.popover`、blending `.behindWindow`、state `.active`，vibrant light/dark；纸面 `#FCFCFB` / `#19191B` 填 0.96；悬停再叠动作色 0.10 / 0.18；发丝边 0.8，悬停 1.4 并改动作色 0.7。
- 投影：offset `(0, -5)`，休息 radius 7 opacity 0.14，悬停 12 / 0.24，禁用 0.08。
- 图标：`SymbolConfiguration` 16pt regular + `paletteColors`。标签 10.5pt medium。图标和字锚在瓣路径包围盒中心（与 DropAgent `bounds.mid` 相同），不要锚在中半径弧点再竖直挪——侧瓣会离开中线。标签宽不超过该瓣水平宽度减 6pt（最多 72），单行截断；fill/stroke 后 clip 到瓣形。色组与 DropAgent `Palette` / `RecipeGlyph` 相同。
- 禁用瓣仍画、退灰、不接拖。`hitTest` 只在启用瓣上返回自己。

**进出场（`EdgePlacement` / `EdgeDropController.showWheel` / `concealWheel`）**

- 钉住、0.18s、顶 80pt、出圈 + 18pt 本次不再出现、未现身时面板矩形避让、已现身则轮盘拥有到外圈：几何与时序仍在本文件；**何时算一次拖**见 [`specs/shelf-drop-wheel-arming/spec.md`](../shelf-drop-wheel-arming/spec.md)。
- 窗 `animationBehavior = none`，避免系统默认窗动画抢节奏。
- 出现：若窗还不可见，alpha 0 → 1，时长 200ms，曲线 `(0.16, 1, 0.3, 1)`。已可见则 alpha 保持 1，不重放。
- 消失：alpha 1 → 0，时长 120ms，同一条曲线；完成且这次拖没有再次武装轮盘才 `orderOut`，并把 alpha 设回 1。
- 悬停启用瓣：`transform.scale` 弹到 1.06。弹簧 mass 0.45、stiffness 420、damping 22，时长不超过 220ms。离开或换瓣回到 1。
- Reduce Motion：不淡入淡出、不缩放，仍立刻显隐和换悬停色。
- 开关仍读 Shelf `drop_wheel_enabled`。关了：不出轮盘，菜单栏和图标仍接拖。

**启用态**

- 拖开始时读一次架子 runtime（短缓存）：有可执行 Agent 则「发给终端」启用；`can_run_job` 则四个 Recipe 瓣启用。读 `/api/shelf` 必须解开 HTTP chunked，否则 JSON 解析失败会被当成没 Agent，五瓣一直灰。读不到则保持上次缓存，默认全关（只留加入材料）。

## 非目标

- 不改六瓣顺序、圆心空洞、进货/发给/Recipe 调用链方向。
- 不把「发给终端」这条投递补完（若仍只进货，启用态仍跟 Agent 走，和 DropAgent 瓣可用性一致）。
- 不做摇一摇、修饰键、轮盘确认窗。
- 不改 Web 工作面、Coss、Goal 胶囊。
- 不把 HTML 切片当成原生验收。

## 使用场景

1. Finder 拖一份 PDF，约 0.2 秒指针周围淡入六块独立瓣，不是一摊灰圆。
2. 拖进「加入材料」：该瓣略放大、描边变麦色；松手进货，轮盘 120ms 淡出。
3. 往外一甩超过外圈 + 18pt：轮盘淡出，这次拖不再出现，文件还能丢到桌面。
4. 开了 Reduce Motion：出现/消失是切，瓣不弹。
5. 本机有可跑 Job 的 Agent：总结等瓣是彩色图标，能命中。没有则退灰、点不中。

## 方案与关键决策

- 复刻 DropAgent 的视图结构，不在一个 `drawRect` 里描六条粗弧。
- frost 用 `CAShapeLayer` 做 `layer.mask`（不是 `maskImage`）；chrome `wantsLayer`，外观锁 `aqua` / `darkAqua`，纸面和字色才是 Palette，不被 vibrancy 洗掉。
- 纸面填充盖在 popover 材质上，启用/禁用都是 0.96；禁用只退图标和标签。这是 DropAgent 现行瓣，不是 Coss 玻璃。
- 进出场用 `NSAnimationContext` + 窗 `animator.alphaValue`；悬停用 `CASpringAnimation` 打在瓣层上。
- 消失动画结束要认「是否又武装了」，避免淡出中途再次拖出时被 `orderOut` 吃掉。

## 输入输出与依赖

输入：全局拖、拖拽板、指针相对圆心、系统外观、Reduce Motion、Shelf runtime。  
输出：六瓣命中、淡入淡出、悬停回弹、`admitFromWheel`。  
依赖：现有 `drop_wheel` session、`shelf_http` 进货、DropAgent `EdgeDropView` 视觉合同。

## 文件 / 模块边界

允许：`apps/desktop/adapters/tauri/src/drop_wheel.rs`、`drop_wheel_macos.rs`、`shelf_http.rs`、`apps/desktop/src-tauri/Cargo.toml`、本 spec、`specs/shelf-plugin/spec.md` 轮盘质感句。

禁止：改 Goals/Feed、改用户 home、在 DropAgent 仓库改产品。

## 验收标准

1. 瓣形是闭合 stadium（stroked arc 的填充路径），不是叠在一起的粗描边圆。浅/深都成立。
2. 出现 200ms 淡入，离开或松手 120ms 淡出；Reduce Motion 时无淡入淡出、无缩放。
3. 悬停启用瓣 scale 1.06 弹簧；禁用瓣不放大、不接拖。
4. 有 Agent / 可跑 Job 时对应瓣启用并着色；没有则退灰。
5. 出圈 + 18pt、顶 80pt、未现身时面板避让、设置关掉不出轮盘：原 session 行为保持。
6. `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop drop_wheel` 与相关 `shelf_http` 测试通过；`cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml` 过。
7. 真人：Finder 拖一份文件到空白桌面上方，轮盘像 DropAgent 那样一块块出现，甩出去会淡出。
8. 每个瓣的图标和标签落在该瓣几何中心；标签不画出瓣形（左/右薄向瓣尤其如此）。

## 验证命令

```
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop drop_wheel
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop shelf_http
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
```

拖放无法在这台机器上脚本化：真人拖一次对照 DropAgent。

## 假设与开放问题

- popover 材质垫底 + 0.96 纸面就是 DropAgent 瓣；shelf-plugin 写的「不做玻璃」指装饰高光，不禁止这层材质。
- 发给终端若尚未投递进 TUI，本 spec 只对齐瓣的可用性与外观。

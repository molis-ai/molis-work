# Shelf 轮盘：武装与消失（对标 DropAgent）

状态：代码已落地；`drop_wheel` 14 项与 `cargo build` 通过。真人划选 / Finder 拖未在本机脚本化。

本文件补 [`specs/shelf-plugin/spec.md`](../shelf-plugin/spec.md) 与 [`specs/shelf-drop-wheel-craft/spec.md`](../shelf-drop-wheel-craft/spec.md) 没写清的**何时出现 / 何时彻底结束这次拖**。权威是 DropAgent `EdgeDropController.handleDrag`、`EdgePlacement.dragPasteboardHasPayload` / `consumeDragPasteboard`、`ClipboardPayload.hasDragCargo`、`specs/drop-wheel/spec.md`。

瓣形、淡入淡出、回弹仍走 craft spec。本文件只改武装条件与这次拖的生命周期。

## 背景与目标

一骏在编辑器里划选文字，轮盘就出来。DropAgent 不会：它先问「现在是不是一次带着货的系统拖」，再问「指针在轮盘的哪」。划选、拖窗口、改窗口大小都会发 `leftMouseDragged`，但拖拽板里没有新货。

目标：Molis 轮盘和 DropAgent 用同一套门。没有货不出；货暂时被 Finder 抽空但这次拖还没松手则继续；松手或出圈才结束。

## 当前行为与问题证据

实机：划选文字立刻出轮盘。DropAgent 同机同操作不出。

代码差在门，不在 0.18s 钉住：

1. **残留货能重新武装。** DropAgent 新拖要求 `NSPasteboard(name: .drag).changeCount != consumedChangeCount`，相同计数直接否，哪怕板上还留着上次的文件或字。Molis 在 `changeCount == consumed` 时只要 `snapshot` / `live` 还有内容就继续，于是划选、拖标题栏都会把上次的货再拖出来。
2. **「有货」比 DropAgent 松。** DropAgent `hasDragCargo` = 板上能读出文件 / 图 / 非空字 / http(s)，或承诺类型（标签、promised-file）。Molis `has_drag_cargo` 额外把「除 dummy / `public.item` 以外的任意 UTI」算成货，不读内容。Chromium / Cursor 划选常会声明一堆空类型。
3. **新拖和进行中的拖没分开。** DropAgent：没有 `dragOrigin` 时必须当场有新货；有 `dragOrigin` 后允许 Finder 把板抽空，这次拖继续，直到松手。Molis session 一旦被错误武装，划选期间左键一直按着，200ms watchdog 也不会当松开。
4. **消失。** 出圈 +18pt 这次不再出现、松手进货或收起、进货后记下 changeCount：方向对。错武装之后，轮盘会跟着划选钉在指针上，看起来像「消失逻辑也不对」。

## 范围

复刻 DropAgent 现行武装，不另做一套「划选距离 / 手势识别」。

**每一次 `leftMouseDragged` 只问两件事**

1. 这是不是一次带着货的系统拖？
2. 若是，指针相对这次钉住的圆心，轮盘该显、该藏，还是该把拖还给底下 App？

**有货（`hasDragCargo`，与 DropAgent 同一把尺）**

算：文件、图、非空纯文本 / RTF、http(s) URL；或承诺类型 `WebURLsWithTitlesPboardType` / `com.apple.webkit.WebURLsWithTitles` / `org.chromium.bookmark-entry` / `org.chromium.bookmark-dictionary-list` / `com.apple.pasteboard.promised-file-url` / `com.apple.pasteboard.promised-file-content-type` / `NSPromiseContentsPboardType`。

不算：空板、只有 `org.chromium.drag-dummy-type`、只有 `public.item`、其它没有可读内容的 UTI、系统剪贴板（`.general`）里的旧字。

**新拖 vs 进行中**

- 没有 `dragOrigin`：必须 `changeCount != consumed` **并且** 当场 `hasDragCargo`。否则什么都不做；若轮盘还露着，立刻收起并结束外部拖。
- 已有 `dragOrigin`：不再用空板否掉这次拖（Finder 会抽空）。左键仍按着就更新指针、snapshot（板上有新内容才覆盖）、钉住后的显隐。
- 第一次通过新拖门时记下 origin / 开始时刻，并读 Shelf runtime 门。

**鼠标状态**

- 只听 `leftMouseDragged` / `leftMouseUp`（全局 + 本地），不听 `leftMouseDown`。
- 武装后每 200ms 看 `pressedMouseButtons & 1`。左键已松开当 `mouseUp` 收尾（有的 App 会吃掉 mouseUp，DropAgent 的 watchdog 就是为这个）。
- 不靠划选位移阈值、不靠「像不像拖」。0.18s 延迟 + 真货已经把划选、改窗口大小挡在门外。

**消失（这次拖的终点）**

- 出圈 + 18pt：藏轮盘，`dismissed = true`，这次拖不再出现；货仍可丢到桌面。
- 未现身时顶 80pt、未现身时在已打开的 Shelf 工作面：不出。已现身则轮盘拥有到外圈。
- 松手：瓣上且启用则进货；空洞 / 圈外 / 禁用瓣不进货。然后 `hide`：清 session，按 DropAgent 规则 `consumeDragPasteboard`（只有这次确实进了货才 `clearContents`），记下新的 changeCount。不清 `.general`。
- 设置关掉轮盘：不武装、不出现；菜单栏图标仍接拖。

## 非目标

- 不改六瓣顺序、几何、淡入淡出、回弹、纸面材质。
- 不补「发给终端」真投递。
- 不加划选距离、修饰键、摇一摇。
- 不把系统剪贴板当拖货。
- 不在 DropAgent 仓库改产品。

## 使用场景

1. 在 Cursor / 工作台里划选一段字：左键按着移动，轮盘始终不出现。松手后下一次划选也不出现。
2. 把已经选中的字拖出去（拖拽板里真有字）：约 0.18s 钉住轮盘；松在「加入材料」进货。
3. Finder 拖 PDF：约 0.18s 出现；甩出外圈 + 18pt 消失，文件还能丢桌面。
4. 进完货后再拖窗口标题栏或改窗口大小：轮盘不出现。
5. 拖的中途 Finder 把拖拽板抽空：轮盘还在，直到松手或出圈。
6. Chrome 只带 dummy / `public.item` 的空拖：不出现。

## 方案与关键决策

- **门在 session 里，AppKit 只负责读板和鼠标。** `DropWheelSession` 增加 `consumed_change` 与「是否已通过新拖门」。单元测试能直接打：残留货 + 相同 changeCount → 不出；dummy → 不出；promised-file → 出；origin 已记下后板被清空 → 仍继续。
- **`has_drag_cargo` 收到 DropAgent 那把尺。** 删掉「任意额外 UTI 就算货」。可读内容或承诺类型才算。图按 DropAgent 算货（当前 `read_cargo` 若还没读图，一并补上，否则拖图片会不出轮盘）。
- **macOS `on_drag` 先问新拖门，再 `session.on_drag`。** 现在那段 `change == consumed && !content → return` 换成 DropAgent 的 `origin || (change != consumed && hasDragCargo)`。
- **watchdog 原样保留**，但只有通过新拖门之后才 poke；划选根本不启动 watchdog。
- **不引入位移阈值。** 和 DropAgent 保持同一用户感觉，避免「拖一点才出」的第二套手势。

## 输入输出与依赖

输入：`leftMouseDragged` / `leftMouseUp`、`NSPasteboard(name: .drag)` 的 changeCount 与内容、`pressedMouseButtons`、指针、屏幕顶、Shelf 工作面矩形、轮盘开关。  
输出：武装 / 钉住 / 出圈藏 / 松手进货或收起 / 记下 consumed changeCount。  
依赖：现有 `DropWheelSession`、`drop_wheel_macos` 读板、craft spec 的显隐动画。

## 文件 / 模块边界

允许：`apps/desktop/adapters/tauri/src/drop_wheel.rs`、`drop_wheel_macos.rs`、本 spec、`specs/shelf-plugin/spec.md` 轮盘武装句、craft spec 里「保持现有 session」那句改为指向本文件。

禁止：改 Web 工作面、Goals、用户 home、DropAgent 仓库。

## 验收标准

1. 划选文字、拖标题栏、改窗口大小：轮盘不出现。
2. 拖文件 / 已选中的字 / 浏览器标签（承诺类型）：约 0.18s 钉住；出圈 +18pt 这次不再出现；松手规则与现在一致。
3. 进货后同一份残留拖拽板内容不会在下一次按住移动时再出轮盘。
4. 只有 dummy / `public.item` / 空类型：`has_drag_cargo` 为 false。
5. 已武装后把板清空：轮盘不因此消失。
6. `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop drop_wheel` 覆盖 3–5；`cargo build` 过。
7. 真人：工作台划选不出；Finder 拖 PDF 仍出。

## 验证命令

```
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop drop_wheel
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
```

划选与 Finder 拖无法脚本化：对照 DropAgent 真人做场景 1–4。

## 假设与开放问题

- 划选出轮盘的主因是门太松，不是 0.18s 太短。不把延迟加长当修复。
- 拖「已经选中的字」应当出轮盘，这是真拖货，和划选不是一回事。
- 图作为拖货与 DropAgent 一致；若补读图只为武装判定，进货链仍走现有文件 / 字 / URL。

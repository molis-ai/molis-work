# PG-053 终端客户端不再由平台入口手列（ac-shell）

状态：草稿，2026-10-25，在 `claude/ac-shell-d3`（从 `origin/batch/1025-40` 的 `50823b548` 起）。不改合同、不改 SDK、不改动作，直接做；留给别线的写在 §3。

验收编号：RAC-715～718（RAC-719 空）。BL：BL-637（Goal 终端窗格）、BL-638（Shelf 的小尾巴），都在 §3。

## 1. 现状（按 2026-10-25 本分支头重核）

`dist/web/pty-client.js` 由根 `pnpm build:pty-client` 从 `apps/workbench/src/terminal-client.ts` 打出，宿主在 `/desktop/pty-client.js` 发它。它做三件事：

| 部分 | 现状 | 属于 |
| --- | --- | --- |
| `molisTerminalRenderer = mountTerminalView` | xterm 画面部件，插件页（框架）的 `terminal.mount()` 缺它时按需加载这份脚本（`browser/plugin-frame/terminal-renderer.ts`） | 平台 |
| `startCharacterTerminalClient()` | Characters 页的终端，Characters 是平台自己的面 | 平台 |
| `startGoalTerminalClient()` | 工作台页里 Goal 文档旁的终端窗格（`[data-tui-pane]`，`shell-page-renderer.ts` 画，`terminal/pane.ts`），Goals 的 UI | Goals（S11） |
| `startShelfTerminalClient()` | **入口直接 `import "@molis-ai/molis-work-plugin-shelf/terminal-client"`**：Shelf 的「对话」终端井（`[data-shelf-tty-screen]`），只在 Shelf 自己的插件框架里跑 | **Shelf** |

Shelf 的 `registration.workbench.clientAssets` 写 `/desktop/pty-client.js`：为了让框架在 Shelf 的包之前先装这份脚本，Shelf 的终端客户端才有机会启动。所以平台入口既点名了 Shelf 的包，Shelf 又靠一条路径把平台的整份脚本拉进自己的框架。

## 2. 剩下什么、怎么做

只剩 Shelf 这一处（PG-053 行末句）：入口点名一个插件包，该插件的客户端代码躲在平台的打包里。

1. Shelf 的终端井搬进 Shelf 自己的浏览器包（`plugins/native/shelf/src/browser/terminal.ts`）。这一步与 ac-shell 的 PG-053 片（`8ec97dab4`）撞在同一处，合并时按它的形状：`installTerminal(page)` 由 `shelfClient` 在 `installTui` 之前调用，随根的生命周期结束（不再是 `startShelfTerminalClient(host.pluginRoute)`）。仍用平台给每个插件框架的 `molisPageTerminal`，不新开合同。
2. 删 Shelf 的 `./terminal-client` 导出与 `src/terminal-client.ts`；`apps/workbench/src/terminal-client.ts` 不再 import 任何插件包。
3. Shelf 的 `clientAssets` 删掉 `/desktop/pty-client.js`：插件调 `terminal.mount()`，平台在第一次挂载时按需装渲染部件（框架的 CSP 本来就允许它）。Shelf 不再预装 xterm，没打开「对话」的 Shelf 页少加载 0.5 MB。
4. 同步登记与文档：`dom-events.ts` 里 `molis-shelf-tui-unsent` 的发出文件、Shelf README、GLOSSARY 里点名旧文件的行、`ui-host` README。

## 3. 不在本片

- `startGoalTerminalClient` 与 `[data-tui-pane]` 窗格是 Goals 的界面，随 Goals S11 一起改成 Goals 自己的客户端（BL-637）；入口里这一行留着。
- `molisTerminalRenderer`、Characters 终端：平台自己的，留在入口。
- Shelf 里留下两处小尾巴，不是这片的事（BL-638）：包里早已没人引用的 `@xterm` 依赖与 `xterm-css.d.ts`，以及终端井两句写死的中文恢复提示（原样搬过来，没有进翻译键）。
- 终端合同（`UiPageTerminal`）不动：`molisPageTerminal` 仍是框架给每个插件的句柄；把它放进 `UiPluginClientHost` 是合同新字段，另议。
- 页面资源：Shelf 包（`shelf.js`）因接收这段代码增大约 1.4 KB，`pty-client.js` 同量减小（它不在预算里）。这是搬家，不是新功能；放行写在 PR。

## 4. 验收

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-715 | 平台的终端入口（`apps/workbench/src/terminal-client.ts`）不 import 任何 `@molis-ai/molis-work-plugin-*`；Shelf 包不再导出 `./terminal-client`、源码里没有 `src/terminal-client.ts` | `tests/terminal-client-entry.test.ts` |
| RAC-716 | Shelf 的终端桥在 Shelf 自己的浏览器包里：包里有桥的启动代码，平台打包入口里没有；Shelf 的 Manifest 登记不再把 `/desktop/pty-client.js` 当预装资源 | 同上 |
| RAC-717 | 行为不变：开启走 Shelf 自己的后端路由、排队的文字在连上后冲出、失败时恢复输入框并只通知一次（原 `shelf-terminal-recovery` 的四条，改读新位置） | `tests/shelf-terminal-recovery.test.ts` |
| RAC-718 | 页面事件登记里 `molis-shelf-tui-unsent` 的发出文件指向新位置，登记门禁通过 | `pnpm health:check`（`dom-events` 门禁） |

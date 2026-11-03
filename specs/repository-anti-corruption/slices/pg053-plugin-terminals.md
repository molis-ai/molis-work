# PG-053：终端客户端随各自的客户端包，工作台只给渲染器和页面终端（设计稿与实现）

状态：实现完成，待统筹评审；分支 `claude/pg053-plugin-terminals`（基于 origin/main 2b3dc51de），未开 PR。号段 RAC-900～909（用到 900～902）、BL-695～699（BL-695 用于下面的余项）；没有新 S 号，只加固了一条现有通道的入口（RAC-901），需要不需要给它登 S 号请统筹定。

## 1. 问题

`apps/workbench/src/terminal-client.ts` 手列三个终端客户端（Goal 的工作终端、Shelf、Characters），并直接 import Shelf 包的 `@molis-ai/molis-work-plugin-shelf/terminal-client`；Characters 的终端 import 工作终端的连接与屏幕模块。工作台因此点名了插件，插件的终端代码长在工作台的包里（privileges.md PG-053）。

## 2. 做法

平台给每个要终端的页面两样东西，都在 `dist/web/pty-client.js`（`apps/workbench/src/terminal-client.ts`）：

1. `molisTerminalRenderer`：画一个面板的屏幕（xterm、键盘、回放、主题、尺寸）。
2. `molisPageTerminal`：插件框架里的页面本来就由框架给（`plugin-frame/child.ts`，经父页的受限通道）；工作台自己画的页面此前没有，现在由 `terminal/page-terminal.ts` 的 `createPageTerminal(render)` 在 shell 自己的 /pty 通道上给出同一个 `UiPageTerminal`。页面只能 `attach / write / resize / kill`，通道在入口处拒绝别的命令并按字段重建消息，页面不能启动进程、不能带额外字段（RAC-901）。框架里已有 `molisPageTerminal` 时不覆盖。

终端客户端不再由工作台列名，各随各自的客户端包发，并只通过上面两样东西用终端：

| 客户端 | 原先 | 现在 |
| --- | --- | --- |
| Shelf「对话」终端井 | 工作台 import `plugin-shelf/terminal-client`，随 pty-client 启动 | `plugins/native/shelf/src/browser/terminal.ts`，由 Shelf 自己的客户端包入口 `factory.ts` 启动；包不再导出 `./terminal-client`；`molisWorkShelfTui` 桥与对外行为不变 |
| Characters 原生执行记录的终端 | `apps/workbench/src/character-terminal-client.ts` 用工作终端的 `connection`、`screens` 自管 websocket 与 xterm | `apps/workbench/src/browser/characters/terminal.ts`，在 Characters 自己的客户端包里，经 `molisPageTerminal.mount` 挂载；它所在的 Host 面的资源表（`HOST_SURFACE_CLIENTS`）在包前加载 pty-client |
| 工作终端（`[data-tui-pane]`，Goal 工作面板的多标签终端） | 工作台命名为 Goal 终端 | 留在工作台，改名 `startWorkTerminalClient`，见 §3 |

pty-client 脚本现在可以被 shell 和一个 Host 面各加载一次：入口先看 `molisTerminalRenderer` 是否已在，在就什么都不做。

## 3. Goal 那支：与 #1295 的关系和取舍

先看 #1295（Goals 切 Plugin Runtime，S9-3～S12）：改动里没有任何终端文件，也不碰 `apps/workbench/src/terminal*`、`pty-client` 路由或 `plugin-workbench.ts` 的 `HOST_SURFACE_CLIENTS`，**没有重叠**。（它改动 `apps/workbench/src/browser/plugin-frame/types.ts` 与 `parent.ts`，本片不碰这两个文件。）

仍然没有把工作终端搬进 Goals 包，理由有两条，请统筹确认：

1. 它不是插件客户端而是 shell 的工作面板：面板的外壳由 shell 画（`renderGoalFrameStage`、`terminal/pane.ts`），终端靠 control token 的 /pty 通道**启动**进程（`panel-spawn.ts` 的 `spawn`）。插件页面的通道按设计只能附着本安装已有的面板、不能启动；把它挂到插件通道上等于改动授权模型，要新的 S 号和服务端改动。
2. 搬它要把 shell 里 Goal 面板的画法、样式、词典一起交给 Goals 包，就是 W5-06 / W6-01（Goals 在工作台里的特殊待遇）；这两项在等 PG-070/071。

所以本片的结果是：工作台的终端入口不再点名任何插件、不 import 任何插件包，剩下的工作终端按它的实际身份叫「工作终端」（PG-053 的行里它本来就叫 Work）。余项 BL-695：工作终端随 W5-06 / W6-01 交给它的主人，并决定它用什么通道启动进程。

## 4. 验收

| 编号 | 内容 | 测试 |
| --- | --- | --- |
| RAC-900 | 页面终端用 control token 开 /pty、只以 `attachOnly` 附着；服务端消息以页面的话到达监听者，`ready` 不外传；通道断开会通知、恢复后重新附着尚在的面板而不重启，已 kill 的不再附着 | `tests/page-terminal.test.ts` |
| RAC-901 | 页面终端只发 attach、write、resize、kill；`spawn`、`auth`、缺 `panelId`、空命令被拒，额外字段不外传 | `tests/page-terminal.test.ts` |
| RAC-902 | 工作台的终端入口与 `terminal/` 不 import 插件包、不含插件 id 或 Shelf/Character/Goal 字样；Shelf 的客户端包自己启动终端且包不导出它；Characters 的终端不引用工作终端的模块，且它的资源表在包前加载终端包 | `tests/page-terminal.test.ts` |
| 回归 | Shelf 终端的排队、恢复与重发不变；Characters 的 SC-2（页面只拿到面板号，终端输出不保存）与重新附着不变；工作终端不变 | `tests/shelf-terminal-recovery.test.ts`、`tests/work-terminal-client.test.ts`、`tests/desktop-tui.test.ts`；浏览器：`tests/security-invariants-plugin-terminals.e2e.test.ts`、`tests/shelf-client-boundaries.e2e.test.ts`（本机不跑，交 CI） |

## 5. 影响

- 合同：`platform/dom-events` 的 `character-terminal` 与 Shelf 事件的登记文件路径换了，`molis-work:character-terminal` 的载荷说明收窄为 `{ panelId, attachOnly: true }`（本来只有这两个字段，没有任何能启动进程的字段，SC-2）。API 快照已刷新。
- Shelf 包去掉子路径导出 `./terminal-client`（只有工作台用过）。
- 页面资源：`pty-client.js` 不在 `/assets/` 下，不在页面资源预算内；Shelf 的客户端包、Characters 的客户端包各自变大（挪进来的终端代码），见 PR 说明里的字节数与放行。

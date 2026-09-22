# Desktop TUI Workspace

## 背景与目标

用户同时开多个 Runtime TUI 时，很难记住哪个对话在推进哪条 Goal。

Goal 工作台在详情右侧提供 TUI 标签：标签开在哪个 Goal 上就属于哪个 Goal。网页浏览器和 macOS App 打开同一套 loopback Web，第三栏表现一致。打开页面不会创建 Session 绑定；只有用户点「添加终端」才绑定该 work context。

## 当前行为与问题证据

- Catalog 只有 Session→Project 绑定；打开网页不能新建 Session 身份。
- MCP 在 `_meta.threadId` 出现时会覆盖环境里的 `MOLIS_WORK_WORK_CONTEXT_ID`，桌面预绑定的工作入口可能变成未确认的新 Session。

## 范围

- 保留 loopback Web；浏览器与 App WebView 都打开同一 4173 服务，Goal 页渲染第三栏。
- Node Web 进程用 `node-pty` 托管 PTY，经本机 WebSocket `/pty` 把字节送到 xterm；App 不再作为 PTY 必要条件。
- Catalog 增加 Goal 面板行：打开标签 = 该终端属于当前 Goal；关标签删除面板行并停 PTY，不自动解除 Session→Project。
- 打开面板视为用户确认，把该面板的 work context（及后来的宿主 session 别名）绑定到当前项目。
- 标签工具条：**推进这个 Goal**（打字并回车）、**填入不发送**、进程退出后的**重新打开**。打开时不自动发送、不自动 claim。
- 通用 PTY 运行任意 TUI；Codex、Claude Code、OpenCode、Pi Agent、Grok Build 可带各 Runtime 的 resume 参数。进程环境带上项目连接与 `MOLIS_WORK_GOAL_ID`。设置页 MCP adapter 覆盖同一组 Runtime。
- Skill：若存在 `MOLIS_WORK_GOAL_ID`，视为用户已在该 Goal 旁打开对话，读取该 Goal 合同，仍不自动领取。

## 非目标

- 不因打开网页或 Goal 详情而自动绑定 Session 或启动 Runtime。
- 不拖入外部窗口、不画 Runtime 对话 UI、不复制对话数据。
- 不自动 `select_goal` / claim。
- 不热更新简报文件；不往用户仓库写上下文。
- V1 不打包 Windows/Linux App。

## 用户场景

1. 浏览器或 App 打开同一项目的 Goal A：右侧可「+」开 Claude Code、Codex、OpenCode、Pi Agent、Grok Build 或自定义命令。该标签只属于 A。打开页面本身不绑定 Session。
2. 切到 Goal B：左边换文档，右边换 B 的标签；A 的进程继续在后台。
3. 点「推进这个 Goal」：短指令进入 TUI 输入框并发送；点「填入不发送」则不回车。
4. 在 A 的终端里改去推进 B：标签仍挂在 A；B 的 Goal 状态经 MCP 更新。
5. 关闭标签：面板记录删除，PTY 结束。
6. Codex 随后通过 `_meta.threadId` 报到 MCP：该 thread 记为同一面板的别名，项目仍是打开时绑定的那个。
7. 决定中心、归档、回收站保持两栏，没有终端。

## 方案与关键决策

- 关联规则只有一条：标签开在哪个 Goal 上，就属于哪个 Goal。树只导航。
- 第三栏不再依赖桌面标记；`x-molis-work-desktop` / cookie / `?desktop=1` 仍用于 App 链接与 cookie，不作为能否打开终端的门禁。
- 面板存在 catalog（schema 8），不进 Goal 文档。
- PTY 在 Node Web 内；页面只走 WebSocket。已运行的面板再次 spawn 时接到原进程并回放缓冲，不重启。页面加载和断线重连只用 attach，catalog 为 open 但进程已不在时标成 exited，由用户点「重新打开」。PTY 环境从隔离的 login shell 重建，并补上用户工具链 PATH。nvm 要把 `alias/default` 写成 `24` 这类主版本号解析到已安装的 `v24.x`，并带上正在跑 Web 的 `node` 所在目录；login shell 往往不加载 `.zshrc`，否则 Codex 拉起的 `molis-work-mcp` / 其他 `#!/usr/bin/env node` MCP 会在 initialize 时 Broken pipe。仍不继承 Web/`tsx`/编辑器进程的 `NODE_OPTIONS`、`NODE_PATH`、相对 PATH 或 Cursor 宿主变量。spawn 时 `PWD` 与 posix cwd 对齐；没有项目工作目录则拒绝打开。关面板时服务端杀掉 PTY 及进程组；Web 主进程在 SIGINT/SIGTERM 时 `killAll`。
- 往 TUI「注入」= 用户点工具条后往 PTY 写字节。进程环境里的 Goal ID 给已接入的 Skill/MCP 用。

## 输入、输出与依赖

- 输入：project_id、goal_id、runtime_kind、命令/参数、可选 resume id、cwd、用户点击。
- 输出：面板记录、spawn 环境、PTY 字节流、Session 绑定与别名。
- 依赖：`MolisWorkProjectCatalog`、现有 Web 控制令牌、Runtime MCP、Skill、`node-pty`、`ws`。

## 文件与模块边界

- `src/projects/catalog.ts`：面板表、打开/关闭、宿主 session 别名、用户确认绑定。
- `src/mcp/server.ts`：`MOLIS_WORK_PANEL_ID` 下把 `_meta` session 链到面板。
- `src/web/pty-host.ts`、`src/web/pty-socket.ts`：本机 PTY 与 `/pty` WebSocket。
- `src/web/server.ts`、`src/web/render.ts`、`src/web/pty-client.ts`：三栏、面板 API、xterm。
- `src/desktop/`：推进指令与启动配方。
- `desktop/src-tauri/`：Tauri 2 窗口；PTY 不再作为页面通路。
- `skills/goal-advance/SKILL.md`：存在 `MOLIS_WORK_GOAL_ID` 时读取该 Goal。
- `PRODUCT.md`、`DESIGN.md`：网页与 App 共用第三栏。
- `tests/project-catalog.test.ts`、`tests/mcp.test.ts`、`tests/web.test.ts`、`tests/desktop-tui.test.ts`。

## 验收标准

- 浏览器与带桌面标记的 Goal 页都含第三栏与「推进这个 Goal」。
- 决定中心 HTML 不含 TUI 容器。
- 打开面板后，该 work context 的 `context_resolve` 为 `bound`；关闭面板不要求解绑项目。
- `_meta.threadId` 在 `MOLIS_WORK_PANEL_ID` 下成为同一面板别名，且绑定同一项目。
- 推进指令含 Goal 标题与 id，不含五章全文。
- 不自动 claim。打开 Goal 页不绑定 Session；点「添加终端」才绑定。
- 面板 POST 仍走本机 Origin、控制令牌和一次性请求键；PTY WebSocket 在 loopback Host 上升级，若有 Origin 则必须与 Host 一致，并在首包用同一控制令牌认证。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/project-catalog.test.ts tests/mcp.test.ts tests/web.test.ts tests/desktop-tui.test.ts tests/i18n.test.ts
pnpm test
```

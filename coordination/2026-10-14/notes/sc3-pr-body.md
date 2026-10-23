## 做了什么（SC-3，PG-082）

Goal 终端与项目目录关联离开 Work 插件，各回各的主人；路由路径不变。

- **宿主接走项目目录关联**：Work 的 `http/workspaces.ts` 里除「在文件夹里启动会话」（`POST /api/workspaces/:id/sessions`，随 Sessions 下线 SC-4 一起做）之外的路由（选目录窗口、关联、修复、解除）搬到 `apps/local-host/src/project-workspace-http.ts`，经 `web-project-platform-routes.ts` 挂上。
- **宿主接走面板路由**：Work 的 `http/panels.ts` 搬到 `apps/local-host/src/web-panel-routes.ts`（`web-panel.ts` 装配），Work 的 `http/types.ts` 去掉面板端口。
- **工作台接走终端客户端**：Work 的 `terminal/*` 与 `ui/terminal.ts` 搬到 `apps/workbench/src/terminal/`（`ui/terminal.ts` → `pane.ts`）；`terminal/client.ts`（481 行）、`terminal/panels.ts`（389 行）按职责拆成 `client-*.ts`、`panel-spawn.ts`，每个函数在 150 行以下；终端英文译文挪到 `apps/workbench/src/i18n/terminal-en.ts` 并进 `EN`。pty-client 入口仍是 `apps/workbench/src/terminal-client.ts`（`pnpm build:pty-client`）。Work 包去掉 xterm 依赖。
- 没碰：tui-recorder、PTY 钩子、pty-socket、character-native-execution、modules/characters、Work 的 Sessions 部分、Goals HTTP、`project-plugins.ts`。

## 报错状态（① 裁定 SC-3 选 A）

宿主的目录路由与面板路由，拒绝一律经 `respondLocalWebRefusal`（`apps/local-host/src/web-http.ts`）按错误的 kind 定状态（SDK `actionErrorResponse`，类别到状态只在 `packages/plugin-sdk/src/errors.ts` 一处），body 带 `code`；不是 ActionError 的失败交给宿主出口 `sendUnhandledWebError`（记日志，500 带 `diagnostic_id`，不回原文）。新文件里没有按错误码或类型选 HTTP 状态的字面量。

**已知的面板输入没有一个走到 500**：路径里无效的百分号编码现在是 `host.request_path_invalid`（invalid，400，目录路由与面板路由共用 `decodeLocalWebPathPart`）；自定义终端没给启动命令是 `desktop.launch_command_required`（invalid，400，`apps/desktop/src/launch.ts`，主人表新增 `desktop` 一条）；面板找不到、名字不合法、Goal 不存在等已有的码按各自 kind（404 / 400 / 404）。只有没有我们自己的码的失败才 500。

**预期变化**（WSERR-03 已核对，spec 文字与断言只改成新值，没有放宽或删除）：

| 情形 | 之前 | 之后 |
| --- | --- | --- |
| 目录路由 `actions.forbidden` | 400 | 403 |
| 目录路由拒绝的 body | `{ error }` | `{ error, code }`（有 `details` 时也带） |
| 关联（add）路由的拒绝 | 一律 400 | 按 kind：`actions.service_unavailable` / `actions.unredeemed` 503、forbidden 403、conflict 409…… |
| 修复、解除路由 | `actions.service_unavailable` / `actions.unredeemed` 503，其余 400 | 同上按 kind；503 不变 |
| `host.workspace_not_found` | 404（按码特判） | 404（kind 改为 not_found） |
| `work.session.*` | 400 | 按声明的 kind：多数仍 400，`message_target_changed` / `message_attempt_changed` 409 |
| 选目录路由请求体过大 | 400 | 413；不是 JSON 仍 400，带 `code` 与 `diagnostic_id` |
| 目录路由路径编码无效 | 500 | 400 `host.request_path_invalid` |
| 面板路由路径编码无效 | 500 | 400 `host.request_path_invalid` |
| 自定义终端没给命令 | 400（无码，原文） | 400 `desktop.launch_command_required` |
| 面板路由没有码的失败 | 400（原文） | 500，带 `diagnostic_id`，原文只进日志 |

`work.workspace.change_rolled_back` / `recovery_required` 已由 SC-1（#1075）删除，这里不再出现。

**合同变更**（`docs/system/CONTRACT-CHANGES.md` §3 第 2 条）：`host.workspace_not_found` 的 kind 由 invalid 改为 not_found；经动作网关调项目目录动作的 Agent、MCP 与工作流拿到的错误类别随之变化（码与文案不变）。仓库里没有按这个 kind 分支的消费者；`hostErrors` 在 local-host，不在公开 API 快照与动作合同快照里，不用 `api:update` / `actions:update`。

**工作台客户端**：设置页的目录操作与终端客户端都经 `UiRequest` 读 body 里的 `code`，没有按 400 分支的地方，不用改。

## 文档

Work、工作台、ui-host 的 README，`docs/platform/DESKTOP.md`、`docs/system/EXTENSION-POINTS.md`、`docs/system/HUGE-CLASS-MIGRATION.md`（三个 Work 巨大单元随拆分消失，154 → 151 个单元，其余数字已重算），BACKLOG（BL-121、BL-392 的路径），反腐 spec（W3-02-G4-05、WSERR-03、HOSTOWN-01 的 SC-3 注记），`privileges.md` 的 PG-082 状态，`ai-entry-inventory.md` 的 EX-5。

## 本机延后验证

（affected-tests 结果）

## 测试改动

- `tests/workspace-directory-picker.test.ts`：失败循环改成按 kind 的新状态并断言 `code`；新增无效编码在动作执行前被拒。
- `tests/desktop-tui.test.ts`：新增没命令的自定义终端与无效编码的面板路径都回 400 带码（SC-3）。
- `tests/work-terminal-client.test.ts`、`tests/work-session-ui.test.ts`、`tests/visual-foundation.test.ts`、`tests/builtin-plugin-composition.test.ts`：跟着新路径。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

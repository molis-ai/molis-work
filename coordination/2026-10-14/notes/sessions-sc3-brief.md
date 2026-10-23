# SC-3 交接：工作区与终端面板离开 Work 包（③，2026-10-23）

PG-082。① 批的 D1：③ 做，② 审「放哪」。总计划见同目录 `sessions-cleanup-plan.md` 的 SC-3 一节，谁在用什么见 `sessions-cleanup-inventory.md`。

## 起点

- SC-1 改过这一片要搬的同一批文件：`http/panels.ts`、`http/workspaces.ts`、宿主的 `web-panel.ts` 和 `project-workspace-actions.ts`。
- SC-1 是 #1075，分支 `migrate/sessions-sc1-stop-writes`，提交 `917ff927b`（已合 main），已交给 ⑩ 评审。
- 所以 SC-3 从 `origin/migrate/sessions-sc1-stop-writes` 开新分支，再合 `origin/main`。
- SC-1 合入后再合一次 main。PR 等 SC-1 合入后再开，这样 diff 里只有 SC-3 自己的改动。
- 只用 merge，不 rebase。

## 搬什么、搬到哪

| 现在（`plugins/native/work/src/`） | 搬到 |
| --- | --- |
| `http/workspaces.ts`（除 `POST /api/workspaces/:id/sessions` 之外） | 宿主，和 `project-workspace-actions.ts` 放一起（`project-workspace-*.ts`） |
| `http/panels.ts`（`handleWorkPanelHttp`） | 宿主 `web-panel.ts` 一侧 |
| `terminal/*`、`ui/terminal.ts` | 工作台 `apps/workbench/src/terminal/` |

- `POST /api/workspaces/:id/sessions` 是 Sessions 的入口，留在 Work，SC-4 随 Sessions 一起删。
- 路由路径一条都不改。`/api/goals/:id/panels` 的改名是 BL-384（D7），这一片不做。
- 现在点名 Work 包这几处的代码，改成从新位置取：
  - `apps/workbench/src/terminal-client.ts`、`character-terminal-client.ts`、`ui-composition.ts`（`WORK_TERMINAL_UI_CONTRIBUTION_ID`）
  - 宿主 `web-panel.ts`
  - Work 包 `package.json` 的 `./terminal`、`./terminal-client` 两个出口：搬完删掉
- Goals `event-document-client.ts:64` 认 `[data-tui-pane]`。属性名不变，就不用改。

## 门禁（D8：门禁不改）

- 巨大单元按文件路径记，搬到新文件的算新增，所以三个函数必须拆到阈值以下：
  - `startWorkTerminalClient`，431 行
  - `createTerminalPanels`，365 行
  - `handleWorkPanelHttp`：SC-1 之前 163 行，SC-1 删了几行，开工时重新量
- 量法：`node scripts/check-health-gates.mjs --report --top 40`。
- 「拆巨大函数」和「搬家」放在同一片，因为门禁按路径记，拆不开。
- page-assets：终端客户端本来就打进工作台的脚本，搬家后体积应当基本不变。
  - 只要哪个资源变大，或要新增资源，先停下来问 ①。
  - 一次涨超过 10 KB，或新增一个资源，要问用户（AGENTS.md）。
- 点名内置插件包名的文件数只许减少。宿主少 import Work 一次，这个数会降。
- 改了 import 的可达性，跑 `node scripts/gates/package-inventory.mjs --table` 核对。

## 不碰

- `tui-recorder.ts`、`web-server.ts` 的 PTY 钩子、`pty-socket.ts`：SC-2 合入后删，在 SC-1 或 SC-4 里做。
- `character-native-execution.ts`、`modules/characters`：SC-2 的地盘。
- Work 的 Sessions 部分（会话目录、Handoff、消息、内容）：SC-4。
- Goals 的 HTTP 处理器、`project-plugins.ts`：③ 的 Goals S7b、S4。

## 验证（① 10-23 新规矩：开发优先，本机不跑验证）

- 本机不跑相关用例、health、boundary、基线对比，也不跑全量和浏览器用例。
- 只有合同或动作变了，才构建并刷新快照，按开发类跑：
  - `HEAVY_CLASS=dev coord-shared/tools/heavy.sh "<标签>" -- …`，放到后台；
  - 构建后跑 `pnpm api:update`、`pnpm actions:update`。
  - 根目录 `pnpm build` 会在 local-host 的 Swift 步骤失败（本机问题），失败后补跑这三步：
    1. `pnpm --filter @molis-ai/molis-work-app-local-host exec tsc -p tsconfig.json`
    2. `pnpm --filter @molis-ai/molis-work-app-desktop run build`
    3. `pnpm --filter @molis-ai/molis-work-app-server run build`
  - 搬路由要刷新路由表快照（`tests/fixtures/web-route-table.snapshot.json`），做法见该测试。
- 推送前先 `git fetch origin main && pnpm secrets:check`。
- PR 正文加一节「本机延后验证」，写：
  - `node scripts/affected-tests.mjs --base origin/main --json` 选出的用例和 `full` 字段；
  - 命中的规则；
  - 本机没跑的检查。
  - `full` 命中就写「要进 ⑤ 的集成批次」。
- 巨大单元：门禁本机不跑，所以拆完自己数行数，每个函数都要在 150 行以下（看 `tooling/gates/limits.json` 的阈值）。
- PR 交给 ⑩：发「移交 #N @ <head 前 9 位>」，之后这条分支不再推送。
- 新发现的高风险或延后事项，发给 ①（`local_77a3221d-3c7c-4823-bd6a-399ce8cbce5b`）。

## ③ 进度（10-23 晚）

- SC-3 按 ① 的 A 做完，本地提交 `e1771b511`（分支 `migrate/sessions-sc3-terminal-workspaces`，叠在 SC-1 上），未推。dev 构建与 local-host、desktop、workbench、work 的 typecheck 都过；页面资源与预算逐项相同，没有变大。
- 等 #1075 合入后：merge origin/main → 重算 affected-tests → secrets:check → 推一次 → 开 PR → 移交 ⑩。CI 拥堵期间只推这一次。
- Goals S7b 已提成子会话卡（goals-s7b-routes），等用户开。
- ① 批了 S7b 两点（不等 S3-2；web-request.ts goals 项里的过渡改写，S9 删）。BL-386 分给 S7b 的「S9 删改写、客户端改打插件前缀」。③ 号段：383/384 预留，385 在 #1080（R-17），386 S7b，387–389 空。

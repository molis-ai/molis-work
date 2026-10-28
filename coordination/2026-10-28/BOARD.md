# 看板

只有统筹改。这里只写不会变的：派给谁、顺序、依赖、锁定的文件。任务现在走到哪一步，由 `next.mjs` 从分支、PR 和评论推出来：

```bash
node "${TMPDIR:-/tmp}/next.mjs" --role status
```

取法见 README 第 12 节。「派给」写「池」的，A、B 谁空谁领。`specs/BACKLOG.md` 和 spec 的进度表是只加、删自己行的文档，不锁；`specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md` 由 T-003、T-005 各改自己的行。

## 任务

| 任务 | 标题 | 档 | 派给 | 顺位 | 依赖 | 锁定的文件 |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | 删掉 Feed 两个没有调用方的读取函数 | 丙 | A | 1 | — | `plugins/native/feed/src/store/items/index.ts`、`plugins/native/feed/src/store/listener.ts`、`tests/owner-readers.test.ts`、`plugins/native/feed/README.md`、`docs/system/HOME-DATA.md` |
| T-002 | privileges 状态列收口与 BACKLOG 清理 | 丙 | B | 1 | — | `specs/repository-anti-corruption/privileges.md` |
| T-003 | 给 Feed、Inbox 各加一项生命周期用例 | 乙 | A | 2 | — | `tests/shipped-plugin-lifecycle-feed.test.ts`、`tests/fixtures/shipped-lifecycle.ts`（只改 `declared()`，与 T-005 共改，后合的解冲突） |
| T-016 | 分屏之后后台刷新把顶栏标签条又显示出来（夜间 Full 红） | 甲 | A | 3 | — | `apps/workbench/src/scripts/client/frame-container.ts`、`tests/workbench-pane-feed.e2e.test.ts`、`tooling/gates/page-assets.json`（只经 `--update --base`，与 T-006 共改，后合的在合并结果上重量） |
| T-005 | 双实例插件 Home 一半停用后不再答裸 404，加回置物架走查 | 甲 | B | 2 | — | `apps/local-host/src/home-plugin-http.ts`、`tests/dual-instance-routes.test.ts`、`tests/fixtures/shipped-lifecycle.ts`（与 T-003 共改：T-003 只改 `declared()`）、`tests/shipped-plugin-lifecycle-personal.test.ts`、`specs/dual-instance-plugins/spec.md` |
| T-004 | 公开来源拉取已提交后判断失败，对外报原来的错误 | 乙 | A | 4 | — | `plugins/native/feed/src/source-sync.ts`、`tests/feed-sync-concurrency.test.ts`、`tests/feed-inbox-lifecycle.test.ts`、`tests/feed-runtime-plugin.test.ts`（与 T-007 共改：只追加，不改已有用例和辅助函数；后合的解冲突，两边的用例都留） |
| T-006 | 插件市场与 Dock 说明添加、移除会连带什么 | 乙 | B | 3 | — | `apps/workbench/src/immersive-shell.ts`、`apps/workbench/src/scripts/client/plugin-workbench.ts`、`apps/workbench/src/i18n/gap-en.ts`、`tests/plugin-market-catalog.test.ts`、`tests/plugin-picker-pins.test.ts`、`tests/immersive-workbench.e2e.test.ts`、`tests/plugin-picker-pins.e2e.test.ts` |
| T-007 | 崩掉、没启用的安装被启停刷新去停后，页面请求全部失败（R-70 / BL-813） | 甲 | 本机 | 1 | — | `apps/local-host/src/project-plugin-enablement.ts`、`tests/project-plugin-enablement-refresh.test.ts`、`tests/feed-runtime-plugin.test.ts`（与 T-004 共改，只在 D4-d 之后追加一条）、`specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md` |
| T-008 | Runtime 动作调用路径的成本（BL-814） | 甲 | 本机 | 2 | T-007 | 开工时补 |
| T-009 | 助理只认 not-found 码（BL-810） | 甲 | 本机 | 1 | — | `apps/local-host/src/assistant/`、`apps/local-host/src/installed-publisher-standing.ts`、`tests/host-log-listeners.test.ts`、`tests/assistant-not-found.test.ts`；`docs/system/SECURITY-INVARIANTS.md` 只改 S-87 一行 |
| T-010 | W5-11 第 3 片：OAuth 通用回调与判断顺序 | 甲 | 本机 | 1 | — | `apps/local-host/src/connector-api-oauth.ts`、`apps/local-host/src/web-connector-api-methods.ts`、`apps/local-host/src/integration-registry.ts`、`apps/local-host/src/connector-protocol-store.ts`、`horizontal/connector-host/src/protocol-store.ts`（只加按 state 取的方法）、`tests/connector-api-oauth.test.ts`、`tests/integration-registry.test.ts`、`tests/security-invariants-connector-oauth-callback.test.ts`、`docs/system/SECURITY-INVARIANTS.md`（与 T-009 共改，各改各的行）、`specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md` |
| T-017 | privileges 与 BACKLOG 的三处陈旧话（T-002 二审的建议） | 丙 | 池 | 1 | T-002 | `specs/repository-anti-corruption/privileges.md`（只 PG-017 状态格与 §8 一句；T-014 改 PG-093 格，各改各的行）、`specs/repository-anti-corruption/slices/w5-08-workbench-exports.md`（只「等 A3」两处） |
| T-012 | 置物架终端井的两处尾巴：删掉没人引用的 xterm 依赖，两句恢复提示进 `messages.ts` | 乙 | B | 4 | — | `plugins/native/shelf/package.json`、`plugins/native/shelf/src/xterm-css.d.ts`、`plugins/native/shelf/src/browser/terminal.ts`、`plugins/native/shelf/src/messages.ts`、`tests/shelf-terminal-recovery.test.ts`、`tests/shelf-client-bundle.test.ts`、`pnpm-lock.yaml`（只 shelf 的 importer 块）、`tooling/gates/page-assets.json`（只经 `--update --base`） |
| T-013 | 删除项目与 MCP 授权设置两个出口的状态改由错误的种类决定 | 乙 | B | 5 | — | `apps/local-host/src/web-project-deletion.ts`、`apps/local-host/src/web-mcp-action-settings.ts`、`tests/project-settings-deletion.test.ts`、`tests/mcp-action-settings.test.ts`、`docs/system/CALL-CHAINS.md`（只第 82、271、275 行讲这两条路由状态的句子） |
| T-014 | 信息助手按能力 id 取 Feed 与 Inbox，不再 import 两个插件包 | 乙 | 池 | 2 | — | `apps/local-host/src/information-actions.ts`、`apps/local-host/src/information-planner.ts`、`tests/plugin-query-consumers.test.ts`、`tests/information-plan-capability-ids.test.ts`、`specs/repository-anti-corruption/slices/pg031-remaining.md`（只第 35 行）、`specs/repository-anti-corruption/privileges.md`（只 PG-093 状态格）、`docs/system/RUNTIME-MIGRATION.md`（只第 126 行那一句） |
| T-018 | T-017 二审的两条建议：A3 的写法、PG-017 的行号、pg017 片里 BL-490 的旧状态 | 丙 | 池 | 3 | T-017 | `specs/repository-anti-corruption/slices/w5-08-workbench-exports.md`（只「A3 已合入」两处）、`specs/repository-anti-corruption/privileges.md`（只 PG-017 状态格；T-014 改 PG-093 格）、`specs/repository-anti-corruption/slices/pg017-sandbox-services.md`（只第 30、117、118 行） |
| T-019 | CI 装依赖不再现场去 nodejs.org 下载 Node 头文件，挂住了快速失败（【方案】要用户批） | 甲 | 池 | 1 | — | `.github/workflows/ci.yml`、`.github/workflows/full-suite.yml`、`tests/ci-install.test.ts`（新）、`tests/fixtures/ci-workflow.ts`（只加读取函数） |

## 在途，不走任务书

这些文件正被本机线或 Codex 改着，任务不碰。

| 在途 | 线 | 锁定的文件 |
| --- | --- | --- |
| W5-16 B2b，不碰真实 Home 的部分 | Codex | 开工时在 #1332 报 |

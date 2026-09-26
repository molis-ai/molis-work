# 公共 Server core 接入交接

2026-09-26。来源工作树 `/Users/yijunwang/.codex/worktrees/573f/goalboard`。本交接先冻结公共 core，独立 `apps/server` 的迁移命令后续单独交付。不得拷贝工作树全量 diff、dist、node_modules 或 pnpm-lock。

## 精确文件

- `server/package.json`、`server/tsconfig.json`、`server/README.md`
- `server/src/auth.ts`、`database.ts`、`errors.ts`、`events.ts`、`http.ts`、`identity.ts`、`index.ts`
- `server/src/continuity/actions.ts`、`service.ts`、`types.ts`
- `server/public/continuity.html`、`style.css`、`client.js`、`preview.mjs`
- `tests/cross-device-http.test.ts`、`tests/cross-device-client.test.ts`

保留聊天 owner 的 `server/src/im/**` 原文件；本 core 的 index 依赖其 `createImDomain` 导出与类型。不要覆盖该目录，也不要恢复旧根级 `reads.ts`/`writes.ts`。`server/tooling/continuity-demo.mts` 和另外两个 cross-device tests 涉及启动器，后续一并交付。

## Builder 串行依赖窗口

1. `pnpm-workspace.yaml` 和 `scripts/workspace-packages.mjs` 的 `WORKSPACE_GLOBS` 加入根级 `server`。
2. 根 build/typecheck/clean 的递归 filter 加 `--filter './server'`。
3. WORKSPACE_PACKAGES 新增 core：path `server`，name `@molis-ai/molis-work-server`，kind `foundation`，contract `@molis-ai/molis-work-contracts/platform/app-host`，maturity `partial`，extraWorkspaceDependencies 仅 `@molis-ai/molis-work-storage`（contracts 是原生成器基础依赖）。职责为共同身份、设备、项目访问、HTTP、SSE 与接续；不拥有 Goal/Artifact 事实或模型运行时。
4. 与聊天 owner 一起添加 `packages/im-ui` inventory，以及 `apps/local-host` 对 server/im-ui、`apps/workbench` 对 im-ui 的依赖。具体 adapter 与 package delta 采用聊天 owner 交付。
5. 在当前主树执行 pnpm lock 更新，不覆盖本工作树的整份锁文件。新增 server importer 只有 contracts -> `../packages/contracts`，storage -> `../packages/storage`；无需第三方依赖。

core 不依赖 local-host、desktop 或 im-ui。local-host -> server 不构成环。Node 24+。

## 接口与验证

`createServerRequestHandler` 为唯一受保护 HTTP handler；standalone `startServer` 也调用它。注入实际 origin、同一 Identity/ServerEvents/ContinuityService 与聊天领域，挂载 `/im*`、`/continuity*`。关闭 adapter 时调用 events.close()。

`node node_modules/typescript/bin/tsc -p server/tsconfig.json` 已通过。
`node --import tsx --test tests/cross-device-http.test.ts` 已通过：隔离数据库 cookie名不同、同库重启保持、同浏览器多端口不覆盖身份；非成员 IM SSE 403；事件 ready/change 与 close断流；LAN无TLS拒绝。

真实原 Goal 业务试验已通过配对、两成员、回执恢复、CAS、撤权、重启。接入主树后由聊天 owner 验正式导航/页面，不能以本 core 测试代替主工作台真实启动。

客户端实际原脚本回归 `node --import tsx --test tests/cross-device-client.test.ts` 3/3 通过：迟到 GET/POST 不能在退出后恢复私有内容、项目切换忽略旧请求、SSE 重连403清理而普通断网保留草稿。

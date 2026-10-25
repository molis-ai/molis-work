# PG-056：插件页面代码只经共同请求助手发请求

状态：执行中（2026-10-25）。Artifacts 的三个片段与 Pages 评论侧栏改走 `molisWorkRequest`，加一条测试把「插件页面代码不自己 fetch」钉住；Alchemist 与插件创作台按统筹裁定绕过、不迁（BL-376/377）；本地构建、定向用例与健康门禁通过，待统筹集成全量。叠在 #1284（PG-055）之上，#1278、#1284 合入后只剩本片的差异。

验收编号：RAC-556～557。

## 范围

- Artifacts 的目标输入、关联作品、插件输入三个片段（`goal-input-client.ts`、`works-client.ts`、`port-input-ui.ts`）原来各自 `fetch`、手写控制头与一次性键、手写错误解析；现在是 `molisWorkRequest(url, { body, fallback })`：控制令牌、一次性键、`no-store`、错误的消息与码由助手一处给。关联作品读不到时仍是空列表（读失败不挡页面）。
- Pages 评论侧栏（`comment-side-client.ts`，属于 `editor-browser.ts` 的编辑器包）原来自己 `fetch`，也是 V-17 说的「门禁数不到」的那一处：浏览器程序门禁只认「读包文件 + 字面 `esbuild … --outfile`」这一种配对，编辑器包不在其中。现在改用助手，`CommentSideHost.controlHeaders` 删除，包入口 `import type {} from "…/plugin-sdk"` 取全局声明。
- `tests/plugin-client-request.test.ts` 补上门禁的盲区：`plugins/native/*/src` 里的 TypeScript 代码与它们送进页面的字符串里，不得出现 `fetch`、`XMLHttpRequest`、`EventSource`、`sendBeacon`；只有 `BYPASSED` 里的两个插件例外，且名单里的插件若已不自己发请求，测试要求把它从名单里删掉。门禁本身（`scripts/gates/browser-fetch.mjs`）不动。

## 不迁（统筹裁定）

- Alchemist（`client.ts` 的 `api`、`client-flows.ts` 的导出）与插件创作台（`agent-studio.ts` 的两处）：BL-376/377，绕过、不迁。它们的原始 fetch 留在基线里。
- 桌面壳的 `capsule-shell.ts` 与 `packages/im-ui` 的 `transport.ts` 不是插件，不在本项。

## 对插件和调用方的影响

没有改动作、Manifest、路由、库结构和公开 API。页面行为不变：写请求仍带控制令牌与一次性键，错误提示仍是服务端给的 `error`，缺省是原来的那句话。

## 验收

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-556 | 除 `BYPASSED` 里的两个插件外，没有插件的页面代码自己调 `fetch`、`XMLHttpRequest`、`EventSource`、`sendBeacon`，不论在代码里还是在送进页面的字符串里 | `tests/plugin-client-request.test.ts` |
| RAC-557 | 绕过名单里的每个插件仍有自己的请求，名单不会留着已迁完的条目；扫描器认得 `fetch(`、`x.fetch(`、`new EventSource(`、字符串里的 `fetch(`，不误报 `prefetch` 和注释 | 同上 |

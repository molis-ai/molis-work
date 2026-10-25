# PG-056：插件页面代码只经共同请求助手发请求

状态：执行中（2026-10-25）。Artifacts 的三个片段与 Pages 评论侧栏改走 `molisWorkRequest`，补充所列请求写法的静态回归测试；Alchemist 与插件创作台按统筹裁定绕过、不迁（BL-376/377）；本地构建、定向用例与健康门禁通过，待统筹集成全量。叠在 #1284（PG-055）之上，#1278、#1284 合入后只剩本片的差异。

验收编号：RAC-556～557。

## 范围

- Artifacts 的目标输入、关联作品、插件输入三个片段（`goal-input-client.ts`、`works-client.ts`、`port-input-ui.ts`）原来各自 `fetch`、手写控制头与一次性键、手写错误解析；现在是 `molisWorkRequest(url, { body, fallback })`：控制令牌、一次性键、`no-store`、错误的消息与码由助手一处给。关联作品读不到时仍是空列表（读失败不挡页面）。
- Pages 评论侧栏（`comment-side-client.ts`，属于 `editor-browser.ts` 的编辑器包）原来自己 `fetch`，也是 V-17 说的「门禁数不到」的那一处：浏览器程序门禁只认「读包文件 + 字面 `esbuild … --outfile`」这一种配对，编辑器包不在其中。现在改用助手，`CommentSideHost.controlHeaders` 删除，包入口 `import type {} from "…/plugin-sdk"` 取全局声明。
- `tests/plugin-client-request.test.ts` 静态扫描 `plugins/native/*/src` 下的 `.ts/.mts/.tsx`（不含 `.d.ts`）：检查语法树中具名的直接或属性传输调用（`fetch`、`XMLHttpRequest`、`EventSource`、`sendBeacon`），也检查模板与字符串字面量中的所列写法。只有 `BYPASSED` 里的两个插件例外，且名单里的插件若已不自己发请求，测试要求把它从名单里删掉。门禁本身（`scripts/gates/browser-fetch.mjs`）不动。

该扫描不覆盖 `.js/.mjs`、`plugins/official-integrations`、`const f = fetch; f(url)` 这类别名调用，也不检查 `WebSocket`、动态 `import()` 等其他路径；它是所列写法的回归检查，不是所有网络路径的安全边界。

## 不迁（统筹裁定）

- Alchemist（`client.ts` 的 `api`、`client-flows.ts` 的导出）与插件创作台（`agent-studio.ts` 的两处）：BL-376/377，绕过、不迁。它们的原始 fetch 留在基线里。
- 桌面壳的 `capsule-shell.ts` 与 `packages/im-ui` 的 `transport.ts` 不是插件，不在本项。

## 对插件和调用方的影响

没有改动作、Manifest、路由、库结构和公开 API。页面行为不变：写请求仍带控制令牌与一次性键，错误提示仍是服务端给的 `error`，缺省是原来的那句话。

## 验收

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-556 | 在上述扫描范围和识别写法内，除 `BYPASSED` 里的两个插件外，未检出 `fetch`、`XMLHttpRequest`、`EventSource`、`sendBeacon` 传输调用或模板、字符串中的对应写法 | `tests/plugin-client-request.test.ts` |
| RAC-557 | 绕过名单里的每个插件仍有自己的请求，名单不会留着已迁完的条目；扫描器认得 `fetch(`、`x.fetch(`、`new EventSource(`、字符串里的 `fetch(`，不误报 `prefetch` 和注释 | 同上 |

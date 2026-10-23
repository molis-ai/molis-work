# Goals S7b 计划（PG-094 S7 后半，验收 PG094-09）

写于 2026-10-23，工作树 `competent-ellis-b4c6c2`，分支 `claude/competent-ellis-b4c6c2`，基于 main `9ad4b12db`。
等 ③ 确认后动手。

## 0. 前置检查

- 在途 PR 没有人改 `plugins/native/goals/src/http/`。会撞的只有 `apps/local-host/src/web-request.ts`：
  #1076 / #1083（Shelf S3/S4，删 Goals 附近的 shelf 行）、③ 的 SC-3（加两行）。我只改 `goals` 那一条路由项和一行 import，冲突会很小，合并时手解。
- PG-056 写着「S7b 等 ⑥ S3-2」：S3-2 是 BL-314，未实现、未分配，没有在途代码。
  我不等它：S7b 照做，在 PG-056 与 `specs/ai-input-receipts/spec.md:92` 改写成「S3-2 的新路由直接写成 binding 加 Manifest 声明」。如 ③ 要等，告诉我。

## 1. Goals 包这一侧

- `goalsManifest` 加 `routes`：31 条，路径 = 现在的路径去掉 `/api`，方法不变；不设 `permission`，不设 `max_body_bytes`（默认 256 000 字节，与宿主现在读 body 的上限相同）。

  | route_id | 方法 | 路径 |
  | --- | --- | --- |
  | goals.create | POST | /goals |
  | goals.directory | GET | /goals/directory |
  | goals.policy-save | POST | /policy-bindings |
  | goals.guidance-read | GET | /project-guidance |
  | goals.guidance-add | POST | /project-guidance |
  | goals.guidance-update | PATCH | /project-guidance/:guidanceId |
  | goals.relation-add | POST | /goals/:goalId/relations |
  | goals.relation-deactivate | POST | /relations/:relationId/deactivate |
  | goals.active / archive / trash | POST | /goals/:goalId/active、/archive、/trash |
  | goals.tree-decide | POST | /goal-tree-proposals/:proposalId/decision |
  | goals.event-state / event-timeline | GET | /goals/:goalId/event-state、/event-timeline |
  | goals.event-read | GET | /goals/:goalId/events/:eventId |
  | goals.history-read | GET | /goals/:goalId/history/:itemId |
  | goals.event-configure … event-note（9 条） | POST | /goals/:goalId/event-configure、-report、-progress、-concern、-decision-request、-agree、-close、-resume、-note |
  | goals.event-decision | POST | /goals/:goalId/event-decision |
  | goals.deliverables-read / -write | GET / POST | /goals/:goalId/deliverables |
  | goals.artifact-inputs-read / -write | GET / POST | /goals/:goalId/artifact-inputs |
  | goals.inputs | POST | /goals/:goalId/inputs |

  `/goals/directory` 排在 `/goals/:goalId/…` 前面不影响：段数不同，匹配器按方法加段数先过滤。
- 每个 `http/*.ts` 原地改写成返回 `PluginRouteBinding[]` 的工厂（文件名不变，门禁按文件计的错误码、状态数字跟着原文件走）；`http/index.ts` 改成 `goalsRoutes(ports): PluginRouteBinding[]` 汇总。参数从 `request.params` 取，不再用正则拆路径；查询从 `request.query` 取；body 从 `request.body` 取（宿主仍按旧规矩读：空 body 为 `{}`）。
- 失败：每个 binding 外包一层 try/catch，`ActionError` 等照旧走 `actionErrorResponse`（`http/failure.ts` 改成返回 `PluginRouteResponse`）；只认 SDK 的状态表，不抄 coding 插件按码选状态的写法。
- 端口（`GoalsRoutePorts`，都收 `PluginRouteRequest`，S9 时换实现、不换形状）：
  - `actions(request) → BoundActionClient`：S7b 是宿主 `bindGoalsWebActions` 的结果（web `user_action` 注入仍在宿主，PG-029）。
  - `routePrefix(request) → string`：建 Goal 后回给页面的 `goal_path` 用。
  - `idempotencyKey(request) → string | undefined`：S7b 是宿主读到的 `x-molis-work-idempotency-key` 头（`PluginRouteRequest` 没有头）。各处「头和 body 谁先」的现行顺序原样保留（relations 头优先，其余 body 优先）。
  - `changed(request)`：S7b 是删宿主的 Web 视图缓存；原来调它的那几处照旧调，没调的照旧不调。
- `index.ts` 去掉 `handleGoalsWebHttp`、`handleGoalEventDecisionHttp`、`GoalsHttpContext` 的导出，改导出 `goalsRoutes`、`GoalsRoutePorts`。

## 2. 宿主这一侧（S9 前怎么挂）

- 做法：宿主把请求转成 `PluginRouteRequest`，按 Manifest 匹配后调 binding。不另起一套路由表、不新增插件命名的宿主文件、不新增 typed 宿主能力。
- 在 `apps/local-host/src/plugin-route-operations.ts` 加一个不点名插件的函数（暂名 `dispatchDeclaredPluginRoutes`）：入参是 Manifest、bindings、HTTP 请求与响应、URL、匹配用路径；
  用 `pluginRouteMatcher(manifest)` 匹配（与 Plugin Runtime 同一个匹配器），GET/HEAD 之外用 `readLocalWebBody(request, match.max_body_bytes ?? undefined)` 读 body（读失败走 `actionErrorResponse`），
  拼 `PluginRouteRequest`（pathname 为真实路径、query 为 `Object.fromEntries(url.searchParams)`、GET 时 body 为 null、actor 为 `LOCAL_PERSON_ACTOR_ID`、无 `execution`），调 binding，发 JSON。没匹配上返回 false，路由表往下走。
- 匹配用路径：页面现在打的是 `/api/<rest>`，宿主把它改写成 `/api/plugins/io.molis.work.goals/<rest>` 再匹配。这是 S9 前唯一的过渡，只在 `web-request.ts` 的 `goals` 路由项里。
- `web-request.ts` 的 `goals` 项改为：用 `goalsManifest` + `goalsRoutes(ports)`（ports 用本次请求的 `goalActions`、`options.routePrefix`、请求头、`webViewCache.delete`），调上面的函数。导入还是 `@molis-ai/molis-work-plugin-goals`，不新增点名 Goals 的宿主文件。

## 3. 挪到 S9 的

1. 删掉第 2 节的过渡改写与 `goals` 路由项；页面改打 `/api/plugins/io.molis.work.goals/…`（Goals 客户端脚本那时再改，S7b 不碰），Goals 由 Plugin Runtime 监督器装配（`project-plugins.ts`，S4 那条线）。
2. 幂等键：binding 拿不到请求头。S9 要么平台把头里的键放进路由请求（改合同），要么客户端把键也放进 body（relation 两个客户端现在只放头）。S7b 只把它做成端口。
3. web `user_action` 注入（`bindGoalsWebActions`，PG-029）换成 `services.actions` + `request.execution`。
4. `changed()`：宿主的 Web 视图缓存按 Goals 游标加材料状态做键，S9 换成平台的视图版本或去掉这个端口。
5. `routePrefix` 的来源（宿主的项目前缀）在 S9 换成平台给插件的项目地址。

## 4. 预期变化（PR 里逐条列）

- 页面打的路径、请求、正常回答和状态码不变；`tests/web-route-table.test.ts` 的快照应不变。
- 边缘情况：
  - POST 到 `/api/goals/:id/event-state` 或 `/event-timeline`（这两条只声明了 GET）带非空 body：原来 400 `goals.event_http.unexpected_field`，现在不匹配、落到 404。
  - 查询参数重复时取最后一个（原来 `URLSearchParams.get` 取第一个）。
  - 路径里的 `%` 编码坏掉：匹配器按段解码，可能从 400/500 变成别的回答；照实列出。
  - `/api/plugins/io.molis.work.goals/…`：Manifest 有了 routes，会先进 `runtimePluginsRoute`，Goals 不在监督器上、它返回 false，最终仍是 404。
- 动作合同快照不变（不改动作）；Goals 包不在公开 API 快照里。

## 5. 测试与文档

- `tests/goal-events-state.test.ts` 直接调 `handleGoalEventDecisionHttp` 的那段改成调 `goalsRoutes(...)` 里的 `goals.event-decision` binding，断言原样，注释写 PG094-09。
- 新加 PG094-09 用例（同一个测试文件或 Goals 包的单测）：每个 Manifest 声明的 route_id 恰有一个 binding、反过来也一样；用 `pluginRouteMatcher(goalsManifest)` 对旧路径表逐条匹配到预期 route_id 与参数。
- 本机只跑 typecheck（Goals、local-host），不跑测试、health、基线。
- 文档：`plugins/native/goals/README.md:24`、`specs/repository-anti-corruption/privileges.md` PG-056 / PG-058 / PG-094 的状态、`specs/ai-input-receipts/spec.md:92`（S3-2 写法）。

## 6. 门禁

- 函数 < 150 行，文件 < 800 行；`events.ts` 现在 199 行，改完仍在一个文件里。
- 不新增 typed 宿主能力、插件命名的宿主文件、兼容标记；新错误码不出现（沿用现有码，留在原文件）。

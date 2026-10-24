# Feed 与 Functions 模块的存储出口、PG-010 与两包巨大单元（R5）

状态：2026-10-23 在 `ac-feed-fn` 分支上实现，本地定向通过，待评审与统一验证窗口；PG-010 只做到「默认 Home 规则的选项目标按声明找」，三条规则本身的 Manifest 声明留作 BL-465。

派单：防腐线统筹，R5（W5-08 的这两个模块、PG-010、两包巨大单元）。号段 RAC-170～179、BL-465～469。

## 目标与范围

范围只在 `modules/feed/**`、`modules/functions/**`、`apps/local-host/src/functions-host.ts` 和它们的测试与说明。

1. **W5-08**：`modules/feed` 与 `modules/functions` 的包入口不再导出 Repository/Store。
   - Feed：`FeedEvidenceContentStore`、`createFeedEvidenceContentStore` 是 Storage 同名实现的别名，生产代码没有人用，只剩三个测试；别名删掉，测试直接用 `@molis-ai/molis-work-storage` 的 `createEvidenceContentStore`。
   - Functions：`FunctionsStore`、`openFunctionsStore`、`seedBuiltinFunctions` 不再导出。`FunctionsService` 自己按 `home` 打开库、`close()` 关库（`createFunctionsService({ home, credential, … })`）；Host 的 `openFunctionsService` 只在它外面接 TypeSafe 连接与凭据。测试、预览脚本、Host 都经服务读写。服务补两处调用方需要的读口：`getByKey`、`close`。
2. **PG-010**：Host 不再用 `"io.molis.work.inbox"` 字面量钉死首页规则的选项目标。Functions 播种内置规则时，对每条规则问一次组装根「这些选项的目标是什么」（`builtinSceneMap({ function_key, scene_id, subject_kinds, option_keys })`，规则已存在就不问）。Host 的答案只对首页用途（`home.dock`）给：对该规则的每个选项（offer id），在内置插件目录里找声明了同一 offer id、适用于该规则对象类型的「事项动作」声明（`subject_offer_choices`），用声明它的动作与插件算出选项 key；同一个 offer id 有两处声明就不猜，留空。其余两条规则用的是行为 id，本来没有映射，不变。
3. **两包巨大单元**：`FeedModule`（501 行）与 `FunctionsStore`（331 行）降到阈值以下，`modules/functions/src/store.ts`（937 行）降到 800 行以下。

不改：表、库结构、动作合同、MCP 名、判断记录、HTTP 路由、三条默认规则的文字与选项、已有 Home 里已写下的规则（再次打开不改写）。

## 验收

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-170 | Feed 的包入口不再有 `FeedEvidenceContentStore`、`createFeedEvidenceContentStore`；证据正文库只有 Storage 一份；三个旧调用方改用 Storage 的 `createEvidenceContentStore` 后行为不变 | `tests/functions-feed-module-exits.test.ts`；`tests/feed-security.test.ts`、`tests/web-home-isolation.test.ts`、`tests/home-event-actions.test.ts` |
| RAC-171 | Functions 的包入口不再有 `FunctionsStore`、`openFunctionsStore`、`seedBuiltinFunctions`；服务自己开库、关库；库文件的版本、播种、乐观并发（`updated_at`）、判断记录行为与改前一致 | `tests/functions-feed-module-exits.test.ts`；`tests/functions-plugin.test.ts`、`tests/functions-store-versions.test.ts`、`tests/functions-system-capability.test.ts`、`tests/functions-agent-references.test.ts` |
| RAC-172 | 新 Home 播下的首页规则，选项目标与改前钉死 Inbox 时写下的完全一致；`modules/functions` 与 `functions-host.ts` 的源码里没有任何内置插件 id 字面量 | `tests/functions-feed-module-exits.test.ts`；本编号同时是 `privileges.md` PG-010 行验收号 PRIV-12、FI-15 的对应证明 |
| RAC-173 | 已存在的内置规则再次打开不被改写（已写下的映射保留）；另两条内置规则没有映射 | `tests/functions-feed-module-exits.test.ts`；`tests/personal-plugins-review-fixes.test.ts` |
| RAC-174 | `modules/feed`、`modules/functions` 里没有超过阈值的文件或类；包入口的 Repository/Store 导出计数只降（Feed 2 → 0，Functions 2 → 0） | `node scripts/check-health-gates.mjs --base origin/main`（门禁，不是测试） |
| RAC-175 | 测试里直接碰服务内部库的写法（`FunctionsStore.prototype`、`openFunctionsStore`）全部改走公开入口：服务的 `close`/`list` | `tests/functions-effect-boundaries.test.ts`、`tests/security-invariants-home-aggregate.test.ts`、`tests/project-deletion-owners.test.ts` |
| RAC-176 | 同一个 offer id 有两处声明时，首页规则不猜目标（该选项留空），而不是取其中一处 | `tests/functions-feed-module-exits.test.ts`（经内置目录的公开导出临时加一条同 option id 的声明，播种后 `home.dock` 的 `scene_map` 为空） |

## 没做、交给后面

- **BL-465**：三条内置规则（首页事项处理、是否进 Inbox、挑 Inbox 下一步）的文字、选项和用途仍写在 `modules/functions/src/builtin.ts`。PG-010 的完整目标是「默认规则随插件 Manifest 声明，平台照声明种」：要给场景声明加一个字段、SDK 解析、并改 Inbox 与 Feed 的场景声明；这改合同（`pnpm api:update`），而 #1098 正在改所有 `manifest.ts`，所以本片不碰。本片只把组装根钉死插件 id 的那一处去掉。
- 目录来源：首页规则的目标现在只在内置插件目录里找（播种发生在 Home 的库第一次打开时，那时没有可用的实时动作目录）。装上的插件不参与；这与「插件同等待遇」不完全一致，随 BL-465 一起改成按声明走。
- **PG-064 的目录 owner**：`functions-host.ts` 现在从工作台包的入口（`@molis-ai/molis-work-app-workbench`）取 `BUILTIN_PLUGIN_CATALOG`，宿主里已有同类取法，本 PR 不新增第二种。PG-064 把内置插件登记表搬出工作台、改成由各插件公开入口或生成的登记表提供时，要跟着改 `functions-host.ts` 和宿主里其余同类取法；那属于 PG-064 的范围，不在本片。

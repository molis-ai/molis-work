状态：W2-11 收尾清单（2026-10-12，W2-11 d 写成）：测试与脚本里还直接引用 `apps/local-host` 授权内部代码的每一处，带原因与归属。这是用户 2026-10-10 那条「收尾时剩下的每一处列出原因与归属」（[spec.md](spec.md) §1）里 W2-11 管的那一部分；其余内部引用的逐处清单由 W2-10 的工具给（`node scripts/test-imports.mjs --ledger`，PR-D 把它写进来）。逐处数字按四个分支的头计：c1 `test/test-kit-local-host-http`、c2 `test/plugin-grants-real-route`（`4c99700cb`）、c3 `test/agent-function-grants-real-route`（`cc7c00864`）、d `test/goals-mcp-grants-real-route`；它们合入 main 之后用第 4 节的命令复核，不一致就是清单该改。

# W2-11 收尾：测试里剩下的授权内部引用

## 1. 口径

- 范围：`apps/local-host/src` 里四个模块的导入——`mcp-action-grants`（`createMcpActionGrant`、`resolveMcpActionContext`、`assertMcpActionAuthority`）、`mcp-settings-store`（`writeMcpActionGrant`、`parseMcpToolPreference`、`mcpToolPreferencePath`，另有已公开的 `readMcpToolPreference`）、`mcp-action-client`（`authorizeMcpActions`）、`project-action-availability`（`projectActionAvailability`，#385 起已公开）。在 W2-11 开工时它们在 46 个测试文件里有 93 条导入语句（门禁数的就是这个口径：一条 `import` 算一处）。
- 做法：测试不再自己写 `config/mcp-tools.json`，也不再拿内部函数造授权；授权、撤销和项目创建走 Host 自己的设置接口（`POST /api/settings/mcp/actions`、`POST /api/settings/projects`），装配在 `tests/fixtures/test-home.ts`，请求在 `@molis-ai/molis-work-test-kit/local-host-http`。因此产品会拒绝的授权（不可用的能力、只给本人的能力、不在目录里的项目、缺依赖）在用例里同样被拒绝。不加 `testing` 子路径（决定 #12）。
- 规则：一个文件只有在它原来就从包名和 `src` 两处加载同一个包、或这次改动把它的 `src` 导入都去掉时，才改用装配（W2-10 的「不新增混用进程」规则）；已公开的名字，文件里仍有非公开 `src` 导入时留在 `src`，免得一个测试进程里同一个包加载两份。
- 结果：93 条导入语句、46 个文件 → **15 条、8 个测试文件**（合入时是 16 条；2026-10-15 删去 #486 改走包入口的一条，见第 2 节末），另有 3 处脚本里的深引用（不在门禁的数里，在这里列出）。c1、c2、c3 各自把负责的测试改走设置接口（c1 的 `external-mcp-dispatch`、`feed-sync-authority` 各留一条，c3 的 `function-agent-authoring.e2e` 留两条，原因在下表）；d 去掉 `fixtures/goals-mcp-grants` 里的两条，和 `goals-actions`、`goals-configuration-actions`、`goals-decision-actions`、`goals-tree-actions`、`goals-mcp-actions`、`mcp-context-actions`、`mcp-resume-view`、`mcp-action-catalog`、`mcp-action-settings` 里的授权内部引用（这九个文件到 0 条）；`hostActionToolName` 在 #385 搬到了 `@molis-ai/molis-work-app-mcp`，`projectActionAvailability` 同一个 PR 里公开。

## 2. 剩下的逐处

| # | 位置 | 名字 | 为什么还在 | 归属 |
| --- | --- | --- | --- | --- |
| 1 | `tests/mcp-action-grants.test.ts:8` | `createMcpActionGrant`、`resolveMcpActionContext`、`assertMcpActionAuthority` | 它们就是被测对象：S-08 的授权规则用例（精确到客户端、项目、Home、提供方、版本和权限，不借用权限）。受众规则（本片补进来的断言：只给本人的动作、`agent:` 与 `runtime:` 身份各自的受众、空客户端名）也在这里，因为经设置接口走时请求在更早一步就以 404 `actions.missing` 被拒，走不到 `createMcpActionGrant` | 授权规则的主人 `mcp-action-grants.ts`；W5-08 把它迁出 Host 入口时，这个用例随它搬到包内 |
| 2 | `tests/mcp-action-grants.test.ts:9` | `parseMcpToolPreference`、`readMcpToolPreference`、`writeMcpActionGrant`、`mcpToolPreferencePath` | 授权文件的并发写入、版本不符与损坏时的拒绝（S-08）：要直接写出坏文件才测得到，设置接口只会产出合法的文件。`readMcpToolPreference` 已公开，但同一条导入里有非公开名，整条留在 `src` | 同上 |
| 3 | `tests/generated-action-costs.test.ts:8` | `createMcpActionGrant`、`resolveMcpActionContext` | 在合成的创作台动作视图上直接解授权，测的是生成动作的成本项；没有项目、没有 Home 目录，经设置接口走需要真实目录里有这个生成动作 | 创作台（`plugin-builder`）的测试主人；W5-08 随授权规则一起迁 |
| 4 | `tests/companion-actions.test.ts:18`、`:20` | `createMcpActionGrant`、`readMcpToolPreference`、`writeMcpActionGrant` | 目录与 Host 已经从包入口装配（#486 起），面板存储仍从 `apps/desktop/src` 取。`createMcpActionGrant`、`writeMcpActionGrant` 不在包入口，从 `dist` 的模块路径取；`readMcpToolPreference` 已公开，但和 `writeMcpActionGrant` 同出一个模块，整条留在 `dist`。授权先写进这个 Home，再由无头同伴的 stdio MCP 进程读 | W2-10 |
| 5 | `tests/connector-mcp.test.ts:26`、`:27`、`:28` | `authorizeMcpActions`、`createMcpActionGrant`、`writeMcpActionGrant` | 文件只从 `src` 加载 local-host，并保留 7 条非公开的 `src` 导入（六个连接器模块和 `mcp-tool-actions`）；授权是 Home 级的连接器工具（`project_id` 为 null），并在准备请求的途中被撤销，用进程内的 `authorizeMcpActions` 取同一个宿主的授权。换成网页服务会让它同时从包加载 local-host | 连接器（`connector-mcp`）的主人；W5-08 把连接器内部名字分类后 |
| 6 | `tests/agent-action-tools-prologue.test.ts:9`、`:10`、`:11` | `authorizeMcpActions`、`createMcpActionGrant`、`writeMcpActionGrant` | 只从 `src` 加载；Host 是一个裸 `LocalHost`（非公开类）加上注册在内存项目 `memory:project` 里的夹具提供方，目录里没有项目，经项目设置接口建不出它；`authorizeMcpActions` 带每次调用的取消信号和执行前检查（第五个参数）。`refactor/agent-entries` 也在这个文件的装配上 | Agent 入口（`agent-host-composition`）与 W5-08 |
| 7 | `tests/external-mcp-dispatch.test.ts:14` | `authorizeMcpActions` | 取消：调用带自己的 `signal`，用例断言服务端对取消的反应（`CANCELLED`、取消太晚后的 `EFFECT_RECONCILE_REQUIRED`）。经网关时调用方只看到一个 `AbortError`，服务端那一半的错误码不会回到调用方；`LocalMcpServer` 的调用信号是连接的寿命，不是每次调用的。授权本身已走设置接口 | W5-08：要么公开一个带每次调用信号的进程内 MCP 客户端，要么把取消的断言挪到网关一侧 |
| 8 | `tests/feed-sync-authority.test.ts:14` | `authorizeMcpActions` | 同上：中途取消后马上比较 Feed 的快照，经网关时服务端可能还在收尾。授权本身已走设置接口 | 同上 |
| 9 | `tests/function-agent-authoring.e2e.test.ts:13`、`:15` | `createMcpActionGrant`、`writeMcpActionGrant` | 一条授权设置接口做不出：Home 级的判断规则要推荐某个项目插件的动作，接口以 `mcp.grant_requires` 拒绝（Home 目录不列项目的动作，即使项目里已授权）。用例先断言这个拒绝（产品哪天接受它，这条用例就变红），再写文件造出需要的状态 | W2-11 c3（授权接口与 Home 目录的关系由 Home 判断规则的主人 `functions` 决定） |
| 10 | `scripts/contextual-slice/dock-compare.mts:18` | `projectActionAvailability` | 审计脚本从 `apps/local-host/dist` 深引用；名字 #385 起已公开，可改走包入口。不在测试门禁的数里 | 审计脚本的主人；W5-08（装配名单的第 16 个名字，或它的替代） |
| 11 | `scripts/contextual-slice/p1-server.mts:11` | `projectActionAvailability` | 同上 | 同上 |
| 12 | `scripts/gates/action-contract-host.mjs:58` | `projectActionAvailability`（动态导入） | 动作合同快照门禁在临时 Home 里装配宿主时用它；从 `apps/local-host/dist` 深引用，可改走包入口 | 动作合同快照门禁（`scripts/gates/`）的主人；W5-08 |

## 3. 不在这张表里的

- 文件里别的非公开 `src` 导入（`NATIVE_CONTENT_PERMISSIONS`、`functions-host`、连接器内部名字、`dist/assistant/*` 等）不属于授权内部代码，逐处清单由 `node scripts/test-imports.mjs --ledger` 给，归 W2-10 与 W5-08。
- 由 `LocalHostHttpClient` 取代的请求：`apps/workbench/src/scripts/mcp-access.ts` 和 `apps/server/src/admin-grants.ts` 是产品里调同一个接口的两个客户端，不是测试引用，不在范围内。
- 授权设置接口与 `with`（一次最多 16 个同范围的动作一起存）是产品的行为；Goals 夹具用它把约 60 个 Goals 动作分四次存，不改变哪些授权被接受。

## 4. 怎样复核

```
git grep -n -E "from ['\"].*(mcp-action-grants|mcp-settings-store|project-action-availability|mcp-action-client)" -- tests scripts
git grep -n "project-action-availability" -- scripts
```

第一条应只命中上表第 1 至 11 行（共 15 条 `import` 加 `dock-compare`、`p1-server` 两条脚本导入）；第二条另会命中第 12 行的动态导入。（2026-10-15：原第 4 行 `companion-actions.test.ts:17` 的 `projectActionAvailability` 在 #486 改走包入口，按本节规则删去，后面的行号前移一位。）多出来的就是新增的内部引用（门禁会按文件拦下），少了的就是这张表该删的行。

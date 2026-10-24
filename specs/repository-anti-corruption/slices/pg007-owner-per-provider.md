# PG-007 阶段 4：本人的权限按宿主提供方给

状态：已开 PR，进集成批（2026-10-24，防腐线 ac-kernel 接 ac-platform 的片，分支 `ac-kernel/pg007-owner-per-provider-2`，已合 main `112114f23`）；做的是 `privileges.md` PG-007 行的「阶段 4 收尾」，以及 `platform-queue.md` 第 14 条。代码按 main `61248691d` 核过：首页对话（`home-talk-actions.ts`）已随 #1157 删掉，Work 的宿主提供方也已不在，两者不再列。

2026-10-24 本轮评审修复由 Codex 负责，基于 PR #1228 的 `a89b76376dfe31e7209cab522e3351abdbae8122`；目标是本切片的权限定义与真实登记一致、定向工程验证通过，随后交独立增量复查。全量仍由统筹在共同集成分支组批，不在本会话重复运行。

## 1. 要解决的

`localWebActionContext` 让本人调宿主自己登记的动作（没有安装 id 的提供方）时，只看动作要的权限在不在全局集合 `LOCAL_OWNER_PERMISSIONS` 里，不看提供方是谁。`artifact:read`、`artifact:write` 是本人对 Characters 持有的，却因此对任何要它们的宿主动作都成立。

## 2. 做法

- `local-owner-permissions.ts` 新增 `localOwnerPermissionsOver(provider_id)`，按提供方 id 逐个写出本人对它持有什么：
  - 宿主自己的 native 插件：持有它 Manifest 动作声明的权限；
  - 宿主服务（首页、连接、信息助手、判断规则、项目工作目录、平台、Characters、个人规划、助理规则、搜索、资料、放置、记忆）：持有各自动作声明或已有权限常量；首页、连接、信息助手、判断规则、项目工作目录、个人规划的提供方 id 与实际登记处共用常量，不在权限表重复写字符串；判断规则、项目工作目录与助理规则用 `asks(...)` 汇总动作声明；
  - 外部 MCP 的提供方（`…#mcp:…`）：只持有 `mcp:external`。
  没写进去的宿主提供方，本人一项也不持有。
- 宿主自己的提供方 `HOST_PROVIDER_ID`（`"platform"`，`registerAction` 在定义没写提供方时用的那个：工作目录读取、Git 评审、writer 工作树、Agent Host、项目设置）只由宿主代码登记，本人持有它每个动作自己要的权限（`localOwnerPermissionsOver(provider_id, asked)` 原样返回 `asked`），仍受路由上限收窄。只列常量会漏：它下面的动作要什么权限各不相同（`workspace:read`、`projects:settings` 等），按动作逐个写反而会和登记处分叉。
- `ownerReaches` 要两样都满足：动作要的权限在路由给的上限（原来的 `builtinPermissions`）里，也在本人对这个提供方持有的里面。
- `LOCAL_OWNER_PERMISSIONS` 只是调用能带的上限，不再单独放行任何宿主动作。
- 装上的插件（有安装 id 的提供方）照旧只看安装授权，不变。

评审 #6387362602 关于助理规则「多给 `model:invoke`」的判断不成立：`assistant-http.ts` 将 `assistantThreadRegistration(threads)` 合入同一个 `ASSISTANT_RULES_PROVIDER`，`assistant-thread-actions.ts` 的 start/retry 声明了该权限。规则、跟进、方法与电脑记录当前不要求模型权限，但不能据此删掉整个提供方的模型权限。表项改从规则、跟进与线程的现有声明取值，保留评论线程的实际调用能力与路由上限。提供方 id 去重、从动作声明派生权限两项建议成立。

改动限于权限表、它消费的提供方登记与动作定义、现有权限/安全用例及必要说明；不改动作合同、安装身份、authority、MCP 命名规则、门禁或公共快照。Functions 的 id 由其实际登记 owner `modules/functions/src/actions.ts` 导出，经原包入口供 Host 使用，不向 contracts 增加第二份定义。

## 3. 验收

- **RAC-338**（`tests/local-web-actions.test.ts`，S-15 撤权那条用例末尾）：
  - 本人对 Characters 持有 `artifact:write`，目录里能看到 Characters 要它的动作。
  - 另一个宿主提供方登记一个要 `artifact:write` 的动作：不在本人的 `allowed_actions` 里，`validate_authority` 与调用都 `actions.forbidden`，处理器没跑。
  - 变异检查：去掉按提供方的那一项检查，这条失败。
- **RAC-339**（同一文件）：在项目里和 Home 上，今天宿主登记的、本人能带其权限的每个动作，在新规则下都仍在本人的 `allowed_actions` 里。这条防止改成按提供方以后漏掉哪个提供方。
- **RAC-339-REVIEW-01**（同一文件）：通过实际 HTTP 入口完成助理的条件登记；本人仍看到无模型权限的提醒规则，以及需要 `model:invoke` 的线程 start/retry。路由不给模型权限时，两项线程动作不在 `allowed_actions` 中，authority 与调用拒绝，规则读取仍可用。不调用模型证明该授权边界。
- **RAC-339-REVIEW-02**（同一文件）：覆盖服务连接和项目插件两种 `#mcp:` 提供方形状；只有 `mcp:external` 的工具可见并可执行，路由不给该权限时 authority 与调用拒绝；同提供方多要 `artifact:write` 的动作也拒绝且处理器不运行。其他条件路径复用受影响的既有用例，不新增无关矩阵。

验证：整体 `pnpm build` 后跑 local-host 与 Functions README 的必跑文件，加本切片改到的委托用例、`tests/assistant-thread-reply.test.ts`、`tests/security-invariants-plugin-action-delegation.test.ts`；检查 `node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check` 与 `pnpm secrets:check`。保留完整原始输出，独立复查按固定修复提交与本轮增量裁定；既有 CI Security 红项先复用 TEST 的同头原日志归因，不通过弱化断言处理。

本轮定向工程验证（2026-10-24）：整体构建、边界与对合并基点 `112114f23` 的健康门禁通过；78 个非浏览器文件全部通过，搜索权限文件完整 12/12、隔离测试浏览器的 Functions 草稿保留用例 1/1 通过，共 80 个相关文件。首次搜索回归为 10/12（两条 30 秒超时），随后一次独立尝试因更多不同用例超时而主动中断；原日志均保留。临时阶段诊断在公共构建槽位内证明原两条各以 15.6 秒、10.0 秒通过，撤权提交与查询收束只需毫秒；诊断已移除，再以原 30 秒超时和全部原断言跑完整文件通过，不将早先超时笼统定为 flaky。安装身份、默认拒绝、委托 authority、MCP 连接及评论线程沿既有用例验证；真实外部账号、共同集成全量和用户体验验收不由这些工程结果替代。本轮原件、固定提交和增量交 REVIEW、TEST 与流水线，整体切片仍以共同集成状态为准。

## 4. 测试夹具

这些测试把要本人持有的目标动作登记在虚构的宿主提供方下。PG-007 之后本人对虚构的宿主提供方一项都不持有，这些用例会因为与它们要测的无关的原因失败，所以把目标挪到本人真的持有其权限的宿主提供方下，加注释写明原因，断言不改：

- `tests/workflows-delegation.test.ts`、`tests/plugin-action-query-home-http.test.ts`：挪到 `"platform"`；
- `tests/security-invariants-plugin-action-delegation.test.ts`：挪到 `system.project-workspaces`（本人对它持有 `projects:settings`）。
- `tests/system-search-authority.test.ts`：本轮核对同头 CI run `40109695757` 的 Security 1/2 原日志，唯一失败文件的 10 个用例都停在原合法正控（预期 1 命中、实际 0），尚未进入撤权交错。索引器经 `search-actions.ts` 的 `indexer` 以本人权限读源，未登记的 `fixture.search-authority` 不再持有 `form:read`，与新默认拒绝合同一致。夹具改挂宿主自己的 `platform`；`providerId` 同时用于原始及新 reader、plugins 过滤，MCP 精确 grants、全部 12 个用例及正控/撤权/重授/不泄露断言原样保留，不向生产权限表加夹具 id。

全量里若还有用例把要本人持有的目标挂在虚构的宿主提供方下，按同样的办法改。

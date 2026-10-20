# 同一个插件的 Home 实例和项目实例（双实例）

状态：在做：S0-2a（#877）、S0-2b-1（实例只兑现自己的一半），后续 S0-2b-2、S0-2c、S0-2b-3（2026-10-20）。负责人：平台线 ②。本文记设计取舍、用户的决定、切片顺序和验收；调研底稿是本地笔记 `s0-dual-instance-plan.md`（不在仓库里，事实核对到当日 origin/main）。

## 1. 要解决的事

Shelf 迁到 Plugin Runtime 时，用户已定「同一个 `plugin_id` 双实例」（不拆成两个插件）：Home 实例由 Home 监督器（`apps/local-host/src/home-plugins.ts`）装配，管个人数据；项目实例由项目监督器（`project-plugins.ts` 的启动名单）每个项目装配一个，读项目的成果和过程项。不拆 id，是因为已经钉死的引用都以 `plugin_id` 为键：MCP 授权、MCP 工具名、工作流步骤的精确引用、情境入口、搜索通知。

平台现在撑不起这件事，四处过不去：

| 处 | 现状 | 后果 |
| --- | --- | --- |
| 本机页面调用的授权上下文 | `install_id` 是 `plugin_id` 与发布者签名的哈希，确定性的，Home 库和每个项目库里同一个插件拿到同一个 `install_id`，各自一条记录、各自一个随机的 `installation_generation`。`local-web-actions.ts` 曾把两个库的记录并进一张按 `install_id` 取键的表，Home 的盖掉项目的 | 授权和嵌套调用的 `validate_authority` 读错记录；内核每次调用都走 `validate_authority`，项目实例的动作一律答 `actions.forbidden`（失败时拒绝，不是放行）。**S0-2a 修** |
| 声明了就必须兑现 | Manifest 的动作、路由、视图、端口、命令在 Runtime、`pluginActionProvider`、内核 `exactBindings`、`HomePluginExecutor` 四层都是整套精确匹配 | 一份 Manifest 两个实例过不去；Shelf 的 Manifest 带端口与过程项声明，Home 实例起不来。Runtime 与动作登记两层 S0-2b-1，`HomePluginExecutor` S0-2b-2 |
| 启动名单互斥 | 同一个 `plugin_id` 不能同时在 Home 与项目名单里 | 目录条目一加 `runtime`，每个项目启动都抛错。S0-2b-2 |
| Home 路由的 404 | Home 路由排在请求链第一位，对自己没有的路径直接答 404 | 项目实例的路由被盖住。S0-2b-2 |

## 2. 设计取舍：实例归属怎么表达

| 选项 | 做法 | 取舍 |
| --- | --- | --- |
| **P1（采用）** 隐式部分兑现加可信标记 | 每个实例的 `start` 只返回自己那一半的处理器；宿主启动名单的条目带可信标记，运行时只放宽「声明了没提供」，保留「提供了没声明」 | 不改合同、不改动作哈希、不升版本；标记只存在于宿主自己的条目对象上（与 `bundled` 同一信任规则），第三方和沙箱插件没有任何放宽。代价：「两半的并集等于 Manifest」不是运行时强制，由覆盖测试守；漏登记的动作在运行时是「动作不可用」，失败时拒绝 |
| P2 Manifest 加 `instances` 一节 | 声明式，显式写各实例的动作、路由、视图 | 长期最干净，但改 Manifest 合同（`pnpm api:update`、[CONTRACT-CHANGES](../../docs/system/CONTRACT-CHANGES.md)），与在途 PR 同撞 `plugin.ts` 和 API 快照；留作终局，第二个双实例插件出现时再评 |
| P3 每个实例一份 Manifest（同 id、版本、签名） | 现有精确检查全保留 | 同一身份两份内容不同的 Manifest，签名意义变虚；目录、市场、动作快照、授权页都要「并集」 |

P1 放宽的只有：`assertContributionMatchesManifest` 的 `partial` 参数、Runtime 只登记这一半提供了处理器的动作与场景（`offeredManifest`，内核 `exactBindings` 仍整套精确匹配）、`HomePluginExecutor` 对带标记条目不再因端口等声明拒绝、启动名单对显式双实例放行、Home 路由对带标记插件回落。Home 实例仍拿不到项目的成果库、端口和事件服务。实现层取舍由 ② 定，不放宽信任边界。

不变的约定：两个实例 `plugin_id`、`install_id`、`provider_id` 相同（两份名单里都标 `bundled`）；动作 id、路由 id、路径加方法互不相交，每个 Manifest 动作恰好由一个实例提供；记录各归各库，一个实例的授权、停用、重装、世代不影响另一个。

## 3. 决策记录

- **U1 授权（用户 2026-10-20 定，选方案 A）**：每个实例各一条授权记录，人只在 Home 那条上看和管；双实例插件的 Manifest 权限全部 `required: true`，由门禁检查（必需权限人关不掉，两条记录不会分叉）；一个实例的授权不借给另一个。项目记录会持有只有 Home 一半才用到的权限，这一点写进 host.md 和 S-15 那一行。「项目记录 ∩ Home 记录」的交集方案等真有带可选权限的双实例插件再做。
- **U2 范围（用户 2026-10-20 定，选方案 A）**：先只给宿主装配的插件（目录条目带可信标记），第三方和沙箱插件不能声明。这与用户 2026-10-18「插件待遇一样」之间的差距，是同一个平台缺口（外部插件还装不了 Home 实例），不是给内置插件开的私路；要写进 `skills/molis-plugin-dev/host.md` 和[防腐 spec](../repository-anti-corruption/spec.md) §1，在 S0-2b-2 做。
- **U3 服务 gate 加实例区分（② 定：做）**：模型、主人文件、材料、后台四个服务只比 `install_id`，两个实例相同，分不出；`PluginActionScope` 带上实例的 `installation_generation` 再比。读代码推断的缺口，未实测；写测试找不到这条拒绝就是缺陷，先补最小的拒绝。放进 S0-2b-3，等 #812 合入后做（理由见下条）。
- **S0-2b-1 只做 Runtime 一层（② 2026-10-20 定）**：
  - 本片做的：宿主经 `PluginRuntime` 的 `redemption(definition)` 说这次启动欠什么（`RedemptionScope`：`partial`、`outside_project`），插件自己说了不算。`partial` 时不再要求兑现声明了的动作、场景、视图、路由、命令；端口与事件只在同时 `outside_project` 时才不要求，因为只有项目实例收得到它们：项目那一半不答，事件游标停在 `retry_wait`（`events.ts`），上游输入被默默跳过（`wiring.ts`）。「提供了没声明」任何时候都拒。登记只取这一半提供了处理器的动作与场景，内核不改；撤销、后台任务、片段与事项目标这些互相引用的动作必须在同一半，否则登记以 `actions.definition_invalid` 拒、启动以 `plugin.contribution_unredeemed` 失败。不给 `redemption` 时行为与以前相同。
  - 挪到 S0-2b-2 的：`HomePluginExecutor` 对带标记条目跳过拒绝，标记经 `plugin-entry-identity.ts` 传到 `redemption`。理由：标记唯一可信的来源是 S0-2b-2 的 `PluginRegistration.runtime`，没有它，这两处在 S0-2b-1 里没有触发者，只是一段没人用的放宽。
  - 挪到 S0-2b-3 的：U3。理由：#812（在 Codex 的串行队列里）正在重写 `action-scope.ts` 和服务里约 30 处比实例的位置，现在做必然对撞。S0-2b-2 之前没有任何双实例插件，缺口够不着；Shelf S2 要等 S0-2b-3 合入（见第 4 节）。
  - `PluginRuntime` 类已是巨大单元（637 行、30 个方法），本片只改原有的行，不增一行。

## 4. 切片与顺序

| 片 | 内容 | 能否先合 |
| --- | --- | --- |
| **S0-2a** 授权上下文按作用域取记录（#877） | `local-web-actions.ts` 拆成 `projectRecords` 与 `homeRecords`；`installOf` 在 `provider.project_id` 有值时查项目表，否则查 Home 表；`validate_authority` 的世代比较走同一个函数；场景的权限候选取两表并集 | 能，不依赖别的片，今天没有双实例，行为不变 |
| S0-2b-1 实例只兑现自己的一半 | `RedemptionScope` 与 `PluginRuntime` 的 `redemption` 选项；兑现检查按范围放宽「声明了没提供」；只登记这一半提供的动作与场景（`offeredManifest`） | 共享核心（plugin-runtime），进批、按共享核心跑全量 |
| S0-2b-2 声明与装配 | `PluginRegistration.runtime` 的可信标记（`pnpm api:update`）；标记经 `plugin-entry-identity.ts` 传给两个监督器的 `redemption`；`HomePluginExecutor` 对带标记条目跳过端口等声明的拒绝；启动名单放行显式双实例；Home 路由回落；门禁（标记等于同时在两份名单里、Manifest 无可选权限、两半 `bundled` 一致）；host.md、GLOSSARY、防腐 spec §1 | 代码部分可先合，门禁那块等在途的目录生成 PR |
| S0-2c 端到端夹具与覆盖测试 | 夹具插件（Home 动作 2、项目动作 2、一个端口、两条路由、一个视图）加不带标记的同名对照；覆盖测试遍历所有带标记的注册，Shelf 迁入后自动被覆盖 | 随 S0-2b-2 同批 |
| S0-2b-3 实例间服务句柄不互借（U3） | 模型、主人文件、材料、后台四个服务的 gate 连实例的 `installation_generation` 一起比 | 等 #812 合入；共享核心，进批 |

顺序：S0-2a → S0-2b-1 → S0-2b-2 → S0-2c；S0-2b-3 等 #812 → Shelf S1 → S2。S2 要求 S0-2b-2、S0-2b-3 已合。不做：不改 `ActionDefinition`（会改哈希、升版本、变 MCP 工具名）；不在 `project-host.ts` 加按插件名的分支；不把项目实例搬进 `runtime`（等 PG-005 与项目库 L2）。

## 5. 安全不变量的变化（[SECURITY-INVARIANTS](../../docs/system/SECURITY-INVARIANTS.md)）

编号不在这里预写：新行开 PR 时按 main 加在途 PR 取空号。

| 行 | 变化 | 哪一片 |
| --- | --- | --- |
| S-08 | 补一句：同一插件的两个实例登记同一个提供方和同一个 `plugin_install_id`，各读自己所在库的记录，宿主不把两个库的记录并成一张表 | S0-2a |
| S-18 | 补一句：世代是每个库每条记录自己的；`validate_authority` 只拿同库的记录比世代 | S0-2a |
| S-15 | 补一句：双实例要求两份名单都标 `bundled`、Manifest 权限全是必需，一个实例的授权不借给另一个；标记只来自宿主启动名单 | S0-2b-2 |
| S-31 | 补一句：项目路径下，Home 声明过的路由由 Home 实例答，没声明的回落到项目实例，不由 Home 实例代跑项目的处理器 | S0-2b-2 |
| 新行：身份与授权键 | 授权上下文、嵌套调用复核、MCP、路由都按（所在库、`install_id`）取记录；一边被撤，另一边的动作不受影响；测试断言拒绝 | S0-2a 先由 S-08、S-18 的补句与 DUAL-06 承担，是否另立一行在 S0-2b-2 开 PR 时定 |
| 新行：声明只能来自宿主 | 标记只在宿主条目上；没有标记的插件仍要兑现全部声明；同一 `plugin_id` 无显式声明就出现在两份名单，启动前拒绝；`partial` 永不放宽「提供了没声明」 | S0-2b-2 |
| 新行：实例间服务句柄不互借 | 对应 U3 | S0-2b-3 |

## 6. 验收标准

DUAL-06 由 S0-2a 证明，DUAL-04 由 S0-2b-1 证明；其余各行写明由哪一片证明，片的归属按内容推定，落片时可调，编号不变。测试名带编号。

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| DUAL-01 | 同一个 `plugin_id` 的 Home 实例和项目实例可同时运行；两个库各一条记录，`install_id` 相同、`installation_generation` 不同 | S0-2c；Runtime 层（两个 Runtime 共用一个动作服务）先由 S0-2b-1 的 `tests/dual-instance-contribution.test.ts` 证 |
| DUAL-02 | 两个实例的动作 `provider_id` 都是 `plugin_id`；动作 id 不相交；两边登记同一个动作 id 时第二个以 `capability_duplicate` 被拒，不静默覆盖 | S0-2c；Runtime 层同上 |
| DUAL-03 | Manifest 的每个动作恰好由一个实例提供（并集等于 Manifest、交集为空）；漏一个或多一个测试失败；覆盖测试遍历所有带标记的注册 | S0-2c |
| DUAL-04 | 带标记的条目只兑现自己的一半；提供了 Manifest 没声明的处理器仍以 `plugin.contribution_unredeemed` 拒绝；没有标记的插件（含第三方、沙箱）仍必须兑现全部声明 | **S0-2b-1**：`tests/dual-instance-contribution.test.ts`。本片里「带标记」是宿主给了 `redemption`；标记只来自宿主条目由 S0-2b-2 证 |
| DUAL-05 | 带标记的 Home 实例，Manifest 里有端口、事件、成果、过程项声明也能启动，且拿不到项目的成果库、端口、事件服务；不带标记的 Home 条目仍整体拒绝 | S0-2b-2 |
| DUAL-06 | 本机页面调用：两个实例的动作各按自己库的记录授权；撤销项目记录的授权，项目实例动作不可用、Home 实例动作照常；反之亦然；嵌套调用的 `validate_authority` 在授权有效时通过、撤销后答 `actions.forbidden`（不再因世代不同误拒） | **S0-2a**：`tests/security-invariants-dual-instance.test.ts` |
| DUAL-07 | MCP：一份客户端授权（`provider_id` 等于 `plugin_id`）对两个实例的动作都有效；工具名不变；撤权后排队中的调用被拒 | S0-2c |
| DUAL-08 | 工作流精确引用钉着 `plugin_id`，Home 动作和项目动作各自解析到自己的提供方，不报 `provider_changed`；钉着别的提供方仍报 | S0-2c |
| DUAL-09 | HTTP：项目路径下 Home 声明过的路由由 Home 实例答（S-31 的项目核对不变）；项目实例的路由不被 Home 的 404 盖住；不带前缀的项目路由答 404；两边路径加方法相交则启动前拒绝；不带标记的插件对未声明的路径仍答 404 | S0-2b-2 |
| DUAL-10 | 项目实例调 Home 实例动作：Manifest 自有路径到得了只给 `user` 的动作，`consumes` 路径只到受众含 `agent` 的动作；Home 实例动作内部（无项目）调项目范围动作答 `actions.project_required`；Home 路由在项目路径下被调时可以调 | S0-2c |
| DUAL-11 | 授权不互借：撤掉项目记录的某必需权限，项目实例的相应动作不可用，即使 Home 记录持有；Home 记录撤掉同理；带标记的 Manifest 含可选权限时门禁失败 | S0-2c 加 S0-2b-2 的门禁 |
| DUAL-12 | 启动名单：同一 `plugin_id` 在两份名单里，只有显式声明且两边都 `bundled` 才放行；只标一边、`bundled` 不一致、夹具未声明，启动前抛错；沙箱定义标 `bundled` 仍以 `plugin.grant_denied` 拒绝 | S0-2b-2 |
| DUAL-13 | 生命周期：停用或重装 Home 实例，项目实例的旧句柄不受影响、Home 的旧句柄不能复活；项目删除后 Home 实例的数据保留，项目实例的记录随项目走；关闭 Home 先使全部 Home 句柄失效 | S0-2c |
| DUAL-14 | 视图只出现一次：Manifest 的每个视图在 `plugin_stages` 和项目侧栏里只由一个实例提供 | S0-2c |
| DUAL-15 | 目录缓存：同一遍目录里，两个库里相同 `install_id` 的记录不互相串；一个库的记录被改，另一个的可用性不变 | S0-2c，依赖在途的目录缓存 PR（#851），未合则延后 |
| DUAL-16 | 实例间服务句柄不互借：项目实例的动作拿 Home 实例的模型、主人文件、材料、后台句柄调用被拒 | S0-2b-3 |

## 7. S0-2a 的证据与已知边界

- 红：S0-2a 之前，`tests/security-invariants-dual-instance.test.ts` 里项目实例的动作在本机页面上下文里一律答 `actions.forbidden`；项目记录撤权后仍凭 Home 记录的授权可用（借权）；只撤 Home 记录时项目实例被误拒。绿：修后四条全过。
- S0-2a 的测试用两份 Manifest（同 `plugin_id`、同签名、动作互不相交），因为部分兑现要等 S0-2b-1；权限用可选权限，让借权可观察（真实的双实例插件按 U1 全是必需权限）。
- `localWebActionContext` 现从 local-host 入口导出，让测试按包名导入、不增加「测试引用包内部」的数字。
- 未实测：U3 的服务 gate 缺口；对在途 PR 的位置冲突判断来自文件清单与 diff。

## 8. S0-2b-1 的证据与已知边界

- `tests/dual-instance-contribution.test.ts`（DUAL-04，加 DUAL-01、DUAL-02 的 Runtime 层）：
  - 同一半，宿主不给 `redemption` 时启动被拒，给了 `partial` 才起来，而且只登记自己的动作。
  - `partial` 下多给没声明的动作、重复的动作、没声明的场景、路由、事件处理器，照旧拒绝。
  - 范围按定义给：同一个 Runtime 里宿主没点名的插件仍要兑现全部声明；全部兑现时按 Manifest 的顺序登记全部动作。
  - 项目里的 `partial` 一半仍要答端口与事件；`outside_project` 单独不放宽任何东西。
  - 两个 Runtime 共用一个动作服务：Home 一半与项目一半都以 `plugin_id` 为提供方并存，`install_id` 相同、世代不同；第三个实例登记已被占的动作 id，以 `capability_duplicate` 失败，原来的照常。
- 不给 `redemption` 的宿主行为不变：两个监督器在本片都还不传它，现有的插件用例照旧（见 PR 的验证）。
- 未覆盖：
  - 视图的部分兑现只靠检查代码放宽，没有单独的用例；视图只出现一次由 S0-2c 的 DUAL-14 证。
  - 路由回落到另一半要等 S0-2b-2；在那之前，一半没有的路由答 `actions.execution_failed`（失败时拒绝）。
  - 命令今天没有派发方，放宽它没有可观察的行为。

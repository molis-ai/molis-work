# 同一个插件的 Home 实例和项目实例（双实例）

状态：在做：S0-2a（#877）、S0-2b-1（#882）、S0-2b-2（#891）、S0-2c（#893）已合，S0-2b-3（实例间服务句柄不互借）待合（2026-10-23）。负责人：平台线 ②。本文记设计取舍、用户的决定、切片顺序和验收。

## 1. 要解决的事

Shelf 迁到 Plugin Runtime 时，用户已定「同一个 `plugin_id` 双实例」（不拆成两个插件）：Home 实例由 Home 监督器（`apps/local-host/src/home-plugins.ts`）装配，管个人数据；项目实例由项目监督器按同一份登记的 `project_runtime` 每个项目装配一个（PG-067 前是 `project-plugins.ts` 的启动名单），读项目的成果和过程项。不拆 id，是因为已经钉死的引用都以 `plugin_id` 为键：MCP 授权、MCP 工具名、工作流步骤的精确引用、情境入口、搜索通知。

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
- **U3 服务 gate 加实例区分（② 定：做）**：模型、主人文件、材料、后台四个服务只比 `install_id`，两个实例相同，分不出；`PluginActionScope` 带上实例的 `installation_generation` 再比。读代码推断的缺口，未实测；写测试找不到这条拒绝就是缺陷，先补最小的拒绝。放进 S0-2b-3，等 #812 合入后做（理由见下条）。**范围（① 2026-10-22 定：全范围，不收窄）**：不止这四个服务，凡是按 `install_id` 核对正在运行的动作的地方都连世代一起比——私有存储、文件、数据库、项目库、成果与端口输出、事件、动作与能力调用、动作目录与查询、图片、模型设置、后台作业；宿主据此要知道实例的世代，`PluginStartContext` 加 `installation_generation`（改合同，按 `docs/system/CONTRACT-CHANGES.md` 不留兼容期）。
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
| S0-2b-2 声明与装配 | `PluginRegistration.runtime` 的可信标记（`pnpm api:update`）；标记经 `plugin-entry-identity.ts` 传给两个监督器的 `redemption`；`HomePluginExecutor` 对带标记条目跳过端口等声明的拒绝；启动名单放行显式双实例；Home 路由回落；门禁（标记等于同时在两份名单里、Manifest 无可选权限、两半 `bundled` 一致）；host.md、GLOSSARY、防腐 spec §1 | 门禁（`scripts/gates/dual-instance.mjs`）在 PR 的最后一个单独提交里，只新增检查，不放宽任何已有规则；用户 2026-10-21 批准 |
| S0-2c 端到端夹具与覆盖测试 | 夹具插件（Home 动作 2、项目动作 2、一个端口、两条路由、一个视图）加不带标记的同名对照；覆盖测试遍历所有带标记的注册，Shelf 迁入后自动被覆盖 | 随 S0-2b-2 同批 |
| S0-2b-3 实例间服务句柄不互借（U3） | 凡是核对正在运行的动作属于本实例的 gate，都连实例的 `installation_generation` 一起比（模型、主人文件、材料、后台四个之外，见第 3 节 U3 的范围）；`PluginStartContext` 加 `installation_generation` | #812 已合；共享核心，进批 |

顺序：S0-2a → S0-2b-1 → S0-2b-2 → S0-2c；S0-2b-3 等 #812 → Shelf S1 → S2。S2 要求 S0-2b-2、S0-2b-3 已合。不做：不改 `ActionDefinition`（会改哈希、升版本、变 MCP 工具名）；不在 `project-host.ts` 加按插件名的分支；不把项目实例搬进 `runtime`（等 PG-005 与项目库 L2）。

## 5. 安全不变量的变化（[SECURITY-INVARIANTS](../../docs/system/SECURITY-INVARIANTS.md)）

编号不在这里预写：新行开 PR 时按 main 加在途 PR 取空号。

| 行 | 变化 | 哪一片 |
| --- | --- | --- |
| S-08 | 补一句：同一插件的两个实例登记同一个提供方和同一个 `plugin_install_id`，各读自己所在库的记录，宿主不把两个库的记录并成一张表 | S0-2a |
| S-18 | 补一句：世代是每个库每条记录自己的；`validate_authority` 只拿同库的记录比世代 | S0-2a |
| S-15 | 补一句：同一插件在两份名单里只有 Home 一侧带宿主的标记才放行；Manifest 权限全是必需，一个实例的授权不借给另一个 | S0-2b-2 |
| S-31 | 补一句：Manifest 声明过的路由，Home 实例绑定的由它答，其余回落到项目实例，不由 Home 实例代跑项目的处理器；不带前缀的项目路由不由任何实例答 | S0-2b-2 |
| S-08、S-18 | 再各补一句：两半 `bundled` 一致，提供方相同；一个实例停用，另一个照常、也不代答它的路由 | S0-2b-2 |
| 新行：身份与授权键 | 授权上下文、嵌套调用复核、MCP、路由都按（所在库、`install_id`）取记录；一边被撤，另一边的动作不受影响；测试断言拒绝 | 不另立（S0-2b-2 定）：S-08、S-18 在 S0-2a 补的句子与 DUAL-06 已写全，另立一行只是重复 |
| 新行：声明只能来自宿主 | 标记只在宿主条目上；没有标记的插件仍要兑现全部声明；同一 `plugin_id` 无显式声明就出现在两份名单，启动前拒绝；`partial` 永不放宽「提供了没声明」 | S0-2b-2（S-48） |
| S-48 | 再补一句：两半的服务句柄不互借，每个服务按正在运行的动作所属的实例（`install_id` 加世代）核对。不另立一行：S-48 已是双实例那一行，拒绝也是同一个对象 | S0-2b-3 |

## 6. 验收标准

DUAL-06 由 S0-2a 证明，DUAL-04 由 S0-2b-1 证明；其余各行写明由哪一片证明，片的归属按内容推定，落片时可调，编号不变。测试名带编号。

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| DUAL-01 | 同一个 `plugin_id` 的 Home 实例和项目实例可同时运行；两个库各一条记录，`install_id` 相同、`installation_generation` 不同 | S0-2c：`tests/dual-instance-actions.test.ts`；Runtime 层（两个 Runtime 共用一个动作服务）先由 S0-2b-1 的 `tests/dual-instance-contribution.test.ts` 证 |
| DUAL-02 | 两个实例的动作 `provider_id` 都是 `plugin_id`；动作 id 不相交；两边登记同一个动作 id 时第二个被拒（动作服务答 `kernel.capability_duplicate`，Runtime 把那一半记为 `plugin.contribution_unredeemed`），不静默覆盖 | S0-2c：`tests/dual-instance-actions.test.ts`（宿主里提供方相同、第二个被拒；提供方等于 `plugin_id` 只对随宿主发布的一对成立，见第 10 节）；Runtime 层同上 |
| DUAL-03 | Manifest 的每个动作恰好由一个实例提供（并集等于 Manifest、交集为空）；漏一个或多一个测试失败；覆盖测试遍历所有带标记的注册 | S0-2c：`tests/dual-instance-coverage.test.ts` |
| DUAL-04 | 带标记的条目只兑现自己的一半；提供了 Manifest 没声明的处理器仍以 `plugin.contribution_unredeemed` 拒绝；没有标记的插件（含第三方、沙箱）仍必须兑现全部声明 | **S0-2b-1**：`tests/dual-instance-contribution.test.ts`。本片里「带标记」是宿主给了 `redemption`；标记只来自宿主条目由 S0-2b-2 证 |
| DUAL-05 | 带标记的 Home 实例，Manifest 里有端口、事件、成果、过程项声明也能启动，且拿不到项目的成果库、端口、事件服务；不带标记的 Home 条目仍整体拒绝 | S0-2b-2 |
| DUAL-06 | 本机页面调用：两个实例的动作各按自己库的记录授权；撤销项目记录的授权，项目实例动作不可用、Home 实例动作照常；反之亦然；嵌套调用的 `validate_authority` 在授权有效时通过、撤销后答 `actions.forbidden`（不再因世代不同误拒） | **S0-2a**：`tests/security-invariants-dual-instance.test.ts` |
| DUAL-07 | MCP：一份客户端授权（`provider_id` 等于 `plugin_id`）对两个实例的动作都有效；工具名不变；撤权后排队中的调用被拒 | S0-2c：`tests/dual-instance-actions.test.ts` |
| DUAL-08 | 工作流精确引用钉着 `plugin_id`，Home 动作和项目动作各自解析到自己的提供方，不报 `provider_changed`；钉着别的提供方仍报 | S0-2c：`tests/dual-instance-actions.test.ts` |
| DUAL-09 | HTTP：项目路径下 Home 实例绑定的路由由 Home 实例答（S-31 的项目核对不变）；项目实例的路由不被 Home 的 404 盖住；不带前缀的项目路由不由任何实例答（和别的不带项目的项目路由一样答 400）；Manifest 没声明的路径仍由 Home 答 404；Home 实例停了，它的路由不由项目实例代答；不带标记的插件对未声明的路径仍答 404；两边绑定同一条路由由 S0-2c 的覆盖测试查 | S0-2b-2 |
| DUAL-10 | 项目实例调 Home 实例动作：Manifest 自有路径到得了只给 `user` 的动作，`consumes` 路径只到受众含 `agent` 的动作；Home 实例动作内部（无项目）调项目范围动作被拒（`actions.scope_mismatch`）；Home 路由在项目路径下被调时可以调，不带项目前缀时答 `actions.project_required` | S0-2c：`tests/dual-instance-actions.test.ts`（`consumes` 一条见第 10 节） |
| DUAL-11 | 授权不互借：撤掉项目记录的某必需权限，项目实例的相应动作不可用，即使 Home 记录持有；Home 记录撤掉同理；带标记的 Manifest 含可选权限时门禁失败 | S0-2c：`tests/dual-instance-lifecycle.test.ts`（Home 记录一侧）；项目记录一侧由 S0-2a 的 DUAL-06 证；门禁由 S0-2b-2 |
| DUAL-12 | 启动名单：同一 `plugin_id` 在两份名单里，只有 Home 一侧显式声明且两边 `bundled` 一致才放行；只标项目一侧、带标记却没有项目一半、`bundled` 不一致、夹具未声明，启动前抛错；沙箱定义标 `bundled` 仍以 `plugin.grant_denied` 拒绝 | S0-2b-2 |
| DUAL-13 | 生命周期：停用或重装 Home 实例，项目实例的旧句柄不受影响、Home 的旧句柄不能复活；项目删除后 Home 实例的数据保留，项目实例的记录随项目走；关闭 Home 先使全部 Home 句柄失效 | S0-2c：`tests/dual-instance-lifecycle.test.ts`（重装见第 10 节） |
| DUAL-14 | 视图只出现一次：Manifest 的每个视图在 `plugin_stages` 和项目侧栏里只由一个实例提供 | S0-2c：`tests/dual-instance-coverage.test.ts`（贡献一层；页面一层见第 10 节） |
| DUAL-15 | 目录缓存：同一遍目录里，两个库里相同 `install_id` 的记录不互相串；一个库的记录被改，另一个的可用性不变 | S0-2c，依赖在途的目录缓存 PR（#851），未合则延后 |
| DUAL-16 | 实例间服务句柄不互借：一半的动作拿另一半的服务句柄被拒，自己这一半的照常。模型、主人文件、材料、后台在两个方向都被拒、到不了端口；私有存储的写入两个方向都被拒、没有写进去；项目一半的动作拿 Home 一半的动作客户端调用被拒；事件只有项目一半有（DUAL-05），Home 一半的动作拿它发布被拒；其余服务（文件、数据库、项目库、成果与端口、图片、模型设置、动作目录与查询、能力调用、后台作业）走同一个核对 | **S0-2b-3**：`tests/dual-instance-handles.test.ts`；其余服务见第 11 节 |

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

## 9. S0-2b-2 的证据与已知边界

- 宿主一侧：
  - 标记是 `PluginRegistration.runtime.dual_instance`（Home 目录条目）或 Home 夹具 `{ definition, dual_instance: true }`，经 `plugin-entry-identity.ts` 只按宿主实际定义对象记下。两个监督器据它给 Runtime 的 `redemption`（`partial`）；`HomePluginExecutor` 据它不再因端口、事件、成果、过程项的声明拒绝 Home 那一半。
  - `outside_project` 不再由宿主说：`redemptionIn` 按 Runtime 自己的 `actions.project_id` 定（⑤ 评 #882 的顺手项）。`validate_authority` 选库与 `installOf` 共用一个判断（⑤ 评 #877 的顺手项）。
- 测试：
  - `tests/dual-instance-declaration.test.ts`（DUAL-05、DUAL-12）：
    - 带标记的两半都起来，各只登记自己的动作；提供方相同、`install_id` 相同、世代各自。
    - Home 那一半拿不到事件、输入、输出、成果、过程项服务，项目那一半拿得到。
    - 不带标记出现在两份名单、标记写在项目一侧、带标记却没有项目一半、沙箱定义，都在启动前被拒。
    - 不带标记的 Home 插件声明了事件仍被拒，它自己的 `start` 没有跑。
  - `tests/dual-instance-routes.test.ts`（DUAL-09，S-31）：
    - 项目路径下两半各答自己的路由，都在那个项目里，查询里的项目不读。
    - 不带前缀只有 Home 一半的路由，不在任何项目里；项目不存在答 `actions.missing`。
    - Home 那一半停用后，项目一半照常；Home 的路由在项目路径下答 `actions.execution_failed`，不带前缀答 400。
    - 不带标记的对照照旧。
- 取舍：
  - 回落只看 Manifest 声明过的路由（`home-plugin-http.ts` 的 `projectHalfRoute`）：没声明的路径由 Home 答 404，不交给项目，不带前缀时也不变成「请先选择项目」。
  - 不带前缀的项目一半路由答 400（「请先选择一个 Molis Work 项目」），不是方案里写的 404：这是请求链给所有不带项目的项目路由的答复，`web-request.ts` 不改；失败时拒绝，没有实例运行。Home 那一半停用时，不带前缀的 Home 路由也答 400：停了的一半不绑定任何路由，宿主分不出哪条是它的。
  - 宿主夹具里的双实例插件没有目录条目，项目「显示这个插件」的核对对它只看项目存在（`routeProject`），与它的项目一半在每个项目都启动一致。
- 已补（BL-394，⑤ 评 #891）：项目一半从发行物恢复已装版本时，`plugin-platform.ts` 的 `start` 让恢复出的定义对象带上名单条目的标记（`bundled`、`dual_instance` 与各项声明），与 Home 一侧的 `releaseArtifact` 一致；**RAC-330** 由 `tests/dual-instance-restored-release.test.ts` 证：名单上的新版本接不了已装版本时，恢复出的旧版本仍只兑现自己这一半并运行，不记成 crashed。
- 未覆盖：
  - `bundled` 不一致的拒绝没有用例：夹具都不随宿主发布，今天也还没有带标记的目录条目；目录条目由门禁 `scripts/gates/dual-instance.mjs` 查（PR 里最后单独一个提交，只新增检查，不放宽任何已有规则；改门禁要用户本人的话，用户 2026-10-21 已批）。门禁另查 U1 的「权限全部必需」，用例 `tests/health-gates-dual-instance.test.ts`。
  - 同一份 Manifest 里路径加方法相交，SDK 解析 Manifest 时已拒；剩下的「两半绑定同一条路由」由 S0-2c 的覆盖测试查。
  - 浏览器验证与截图待补（用户 10-19 暂停）。

## 10. S0-2c 的证据与已知边界

- 夹具：`tests/fixtures/dual-plugin.ts` 的 `dualPlugin` 一份 Manifest 两半——Home 一半两个动作（一个给人、MCP 与工作流，一个只给人）、一条路由和舞台视图，项目一半同样两个动作、一条路由和输入端口的处理器；`half()` 换掉一半的部分贡献，`hold()` 让动作停在处理器里。`tests/fixtures/dual-home.ts` 的 `openDualHome` 开一个测试 Home：Home 夹具带标记，项目夹具每个项目一份，一个项目。
- 测试：
  - `tests/dual-instance-coverage.test.ts`（DUAL-03、DUAL-14，加 DUAL-09 的「两半绑定同一条路由」）：
    - 目录里带 `runtime.dual_instance` 的注册必须列在测试的 `SHIPPED` 名单里（今天为空），名单上的每一对两半各在自己的 Runtime 里按宿主给的范围启动、共用一个动作服务，合起来动作、消费场景、路由、视图、命令处理器、输入端口与事件处理器恰好各一次。Shelf 在 S2 标记时，名单不加它就失败。
    - 夹具本身没有问题；漏一个动作、路由、视图，或两半都给视图、路由，各查出一条；两半都给同一个动作时项目一半起不来；项目一半不答端口，Runtime 自己就拒。
  - `tests/dual-instance-actions.test.ts`（DUAL-01、DUAL-02、DUAL-07、DUAL-08、DUAL-10）：
    - 一个 Home 里两份记录都在跑，`install_id` 相同、世代不同；本机页面看到四个动作同一个提供方，Home 一半的不在任何项目里，各答各的。
    - 项目一半再给 Home 一半的动作：项目一半记成 crashed（`plugin.contribution_unredeemed`），它的动作一个也不登记，Home 一半的动作照常。
    - MCP：一个客户端对两个动作的两条授权提供方相同，Home 那条不带项目；两个工具名就是每个动作都有的名字，只给人的两个不列；`tools/call` 各答各的；处理器运行中撤掉项目动作的授权，`beforeEffect` 时以 `mcp.action_revoked` 拒，Home 动作的授权照常。
    - 工作流步骤的精确引用钉着这个提供方，两半的动作都解析得到；钉着别的提供方答 `actions.provider_changed`。
    - 两半互调：项目一半调 Home 一半只给人的动作，到得了；Home 一半自己调项目动作被拒；Home 路由在项目路径下调项目动作，在那个项目里答；不带前缀答 `actions.project_required`。
  - `tests/dual-instance-lifecycle.test.ts`（DUAL-11、DUAL-13）：
    - Home 记录缺一个必需权限时 Home 一半起不来（`plugin.grant_denied`），项目记录持有它也不借；项目一半照常。
    - 停用再启用 Home 一半：旧句柄答 `actions.forbidden`，启用后给新句柄、数据还在，旧句柄不复活；项目一半的句柄一直可用。
    - 删项目：项目库文件没了，项目一半的句柄答 `plugin.grant_denied`；Home 一半在跑、数据还在。
    - 关 Home：两半的句柄都失效。
  - `tests/dual-instance-declaration.test.ts` 随夹具改了 Home 一半的动作清单。
- 取舍：
  - 提供方：宿主只给随宿主发布（`bundled`）的定义用 `plugin_id` 作提供方，其余用 `install_id`（`plugin-entry-identity.ts` 的 `providerFor`）。夹具不随宿主发布，所以端到端用例里两半登记在共同的 `install_id` 下，断言的是「两半同一个提供方」和「钉别的提供方被拒」；提供方等于 `plugin_id` 由 S0-2b-1 的 Runtime 用例与覆盖测试（两者都按 `plugin_id` 登记）证，宿主一层等第一个带标记的目录条目（Shelf S2）。
  - DUAL-10 原写的 `actions.project_required` 是路由不带项目前缀时的答复；Home 一半自己的嵌套调用答 `actions.scope_mismatch`：内核先核对提供方的项目绑定（项目一半绑定在项目里，调用方不在任何项目），再看动作要不要项目。两者都是拒绝，改这个次序要动内核（PG-110 要 ③ 同意），不值得，按内核现行的写进 DUAL-10。
  - MCP 的 `tools/call` 对没有对象输出 schema 的动作答 `{ result: … }` 外层，用例按这个外层断言。
  - 端到端用例经 local-host 入口已导出的 `localWebActionContext` 建页面上下文（与 S0-2a、S0-2b-2 的用例相同），不新增入口导出。⑤ 评 #877 时建议 S0-2c 之后收回这个导出；main 上已有 8 个测试文件经入口用它（助理、搜索、侧栏等），收回要另找建上下文的公开写法，是单独的后续，不在本片。
  - 不进 `test:security`（这些是 DUAL 行，安全的拒绝已由 S-08、S-18、S-31、S-48 的用例断言），也不进 `tests/ci-product-subset.txt`（每个用例开一个测试 Home，一个文件两个一起跑时 20 到 30 秒，也不走用户动线）。
- 未覆盖：
  - DUAL-10 的 `consumes` 路径：插件对自己 Manifest 里的动作先走自有路径（`plugin-actions-client.ts`），两半之间够不到 `consumes`；它的受众规则由现有的动作用例管。
  - DUAL-11 的项目记录一侧在宿主一层：项目监督器每次启动都按 Manifest 补回必需权限，宿主里拿不掉项目记录的必需权限；这一侧由 S0-2a 的 DUAL-06（本机页面上下文不借权）和 Runtime 的 `assertRequiredGrants` 管。
  - DUAL-13 的重装：停用再启用覆盖了「旧句柄不复活」；重装换新版本走发行物：恢复已装版本的标记由 RAC-330 证，换版本后两半句柄的生命周期仍没有用例。
  - DUAL-14 的页面一层（`plugin_stages` 与项目侧栏里只出现一次）：覆盖测试只看两半的贡献；页面渲染要浏览器。
  - DUAL-15 等目录缓存（#851）合入。
  - 浏览器验证与截图待补（用户 10-19 暂停）。

## 11. S0-2b-3 的证据与已知边界

- 做法：
  - plugin-runtime 的 `action-scope.ts` 加 `PluginInstance`（`install_id` 加 `installation_generation`）与 `inPluginInstance`；`assertPluginActionCurrent`、`assertCapturedPluginActionCurrent` 收实例，不再收 `install_id`。动作、场景与后台作业的作用域都带世代，每个服务的 gate 也带世代，核对处一律经 `inPluginInstance`。
  - 宿主从启动上下文建 gate：`PluginStartContext` 加 `installation_generation`（Runtime 从安装记录填），宿主一侧的文件、数据库、分区数据库、项目库、动作客户端、动作目录与查询、能力调用都收这份上下文作实例。
  - 事件：发布者身份（`PluginEventPublisherIdentity`）不改，发布前拿 Runtime 当前的安装记录（带世代）核对，不扩合同。
  - 创作台自己的存储（`apps/local-host/src/plugin-builder/storage.ts`）不是任何插件实例，给一个不会和真实世代相同的固定值，行为不变。
- 测试：`tests/dual-instance-handles.test.ts`（DUAL-16，S-48）：
  - Runtime 一层：两个 Runtime 共用一个动作服务，两半 `install_id` 相同、世代不同；每一半从自己的启动上下文建模型、主人文件、材料、后台句柄。一半的动作拿另一半的四个句柄，各以 `plugin.model_action_required`、`actions.forbidden`、`plugin.materials_action_required`、`plugin.background_action_required` 被拒，端口一次也没被碰到；两个方向各一遍。对照：自己这一半的模型与材料到达端口、主人文件读得到，后台过了实例核对、停在下一道（查询不能受理后台执行，`plugin.background_undeclared`）。
  - 宿主一层（`openDualHome`，夹具加了 `inside(run)`：下一次 `home` 或 `project` 动作先在处理器里跑 `run`）：私有存储两个方向的写入都以「属于另一个插件实例」被拒，数据没变，自己那一半写得进；Home 一半的动作拿项目一半的事件发布被拒，项目一半自己发得出；项目一半的动作拿 Home 一半的动作客户端调用被拒，用自己的照常。
  - 进 `test:security`。
- #1018 加的服务（BL-368）：`tests/dual-instance-services.test.ts` 给动作依赖、Agent、终端、安装目录、通知、定时器、已授权目录各一条。夹具是另一个双实例插件，一个 Manifest 声明了这些服务要的权限和项目库，Home 一半带主人文件（终端要它）；每半一个并行命令，声明全部用到的权限，所以拿另一半句柄的那个动作满足服务的其他每个条件，只差实例。
  - 动作依赖两半都有，两个方向都拒。Agent、安装目录、通知、定时器只有项目一半有，在 Home 一半的动作里被拒；已授权目录两半都有，授权是人在项目里给的，归项目一半，Home 一半的动作在同一个项目、同一个人下读它被拒。终端只有 Home 一半有（要 Home 的主人文件），在项目一半的动作里被拒，到不了终端宿主。
  - 对照：自己这一半的动作过了实例核对，或者照常答（动作依赖、安装目录、定时器、已授权目录列出目录），或者停在下一道（Agent 没声明角色、终端参数不对、通知没有标题），所以没有 Agent 在跑、没有进程被启动、没有通知送出。
  - 终端面板（`apps/local-host/src/pty-page-access.ts`）没有单独的用例：它不交给插件句柄，只在终端服务的 `open` 里登记面板归谁；它的核对拿这次调用和它自己比实例，比不出另一半，两半之间的拒绝就是终端那一条。
  - 变异：这七个服务的实例核对都走 `inPluginInstance`（直接调，或经 `assertCapturedPluginActionCurrent`）。把它改成只比 `install_id`、重建 plugin-runtime 后，七条全红，每条红在跨半的那句断言上；还原后七条全绿。
  - 进 `test:security`，挂在 S-48。
- 未覆盖：
  - 没有在改之前的代码上跑一遍看它变红：缺口是读代码推断的（第 3 节 U3）。代替它的是 ⑤ 评审时的变异：把 `inPluginInstance` 改回只比 `install_id`，重建 plugin-runtime，`tests/dual-instance-handles.test.ts` 五条里四条变红，红的正是预期的拒绝断言；还原后转绿。
  - 文件、数据库、项目库、成果与端口输出、图片、模型设置、动作目录与查询、能力调用、后台作业没有各自的双实例用例：它们和用例里的服务走同一个 `inPluginInstance` 核对，夹具插件也没有声明这些服务（Home 一半的数据库、文件来自宿主的可信名单，夹具没有）。
  - 终端面板的主人和页面接入只按安装、项目、人认，不带世代：同一个人在同一个项目里打开这个插件的页面，不管页面挂在哪一半，都接得上 Home 一半开的终端。页面是整个插件的，不是某一半留着的句柄，U3 不管；要分开，得让页面也带世代，是另一件事。
  - 读不在核对之内：私有存储的 `get`、模型的 `availability` 这类读本来就不按动作核对（启动、路由里也能读），一半的代码留着另一半的句柄仍读得到另一半的数据。这与本片之前一样，U3 只管写入与调用；要连读也分开，得给读也加作用域，是另一件事。
  - 浏览器验证与截图待补（用户 10-19 暂停）。

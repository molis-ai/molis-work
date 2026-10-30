# 合同变更流程

状态：现行（2026-10-08 入库；同日用户定了读取兼容的起点；2026-10-29 用户定 1.0.0 之前都是开发版本）。分两个阶段：现在在**阶段一，不留兼容期**；**阶段二，读取兼容**从第一个装到开发机之外的版本开始，这个版本不早于 1.0.0。

> **阶段二的起点（用户 2026-10-08 定，`specs/repository-anti-corruption/spec.md` §1「『不留兼容』何时结束」；路线图待决 #15）：第一个装到开发机之外的版本。** 用户 2026-10-29 又定「1.0.0 之前都是开发版本」：0.3.0 和 1.0.0 之前的其他版本都是开发版本，不是起点，所以起点不早于 1.0.0。开发机指参与开发的人（现在是用户和同事）用来开发和试用的机器。起点之前一律按阶段一的「不留兼容」做。
>
> 起点日期：**还没到，没有固定日期。** 起点发生时，发那个版本的 PR 在这里写下版本号、日期和提交，第 3 节标为已结束，第 4 节开始适用。第 5 节的前置要在那之前就位。

起点之前，没有要保留的旧用户数据：2026-10-02 用户确认没有同事在用要保留的 Home（`specs/repository-anti-corruption/spec.md` §1），所以破坏性变更直接做，不留兼容代码。起点之后才有「读取兼容、写入严格」的兼容期，那时每一段兼容都要写明消费者和删除条件。本文把两个阶段都写下来，让起点一到就有流程可用，也让现在的做法有边界。

## 1. 哪些算合同

这里的合同是别人（别的包、别的进程、外部插件、用户的数据）依赖的形状：

| 合同 | 在哪里 | 版本记在哪 |
| --- | --- | --- |
| `packages/contracts` 的公开子路径 | `packages/contracts/package.json` 的 `exports` | 没有版本号；形状记在公开 API 快照 `tooling/gates/api/contracts/<子路径>.txt`，`pnpm health:check` 对照源码，有任何不同就失败，有意改用 `pnpm api:update`（第 3 节第 6 条）。新子路径不能只导出一个没人用的 `ContractDescriptor` 占位，`pnpm health:check` 的占位子路径规则（`scripts/gates/contract-placeholders.mjs`）直接失败 |
| `packages/plugin-sdk` 的出口 | `packages/plugin-sdk/src` | 同上，快照是 `tooling/gates/api/plugin-sdk/index.txt` |
| 动作（能力）的身份、输入输出 schema | `packages/contracts/src/platform/actions.ts`；各插件 Manifest 的动作声明；规则见 `specs/action-architecture/spec.md` §3 | 每个能力定义的 `version`；被固定的引用写成 `capability_id@version` 加提供方。形状记在动作合同快照 `tooling/gates/actions/`，`pnpm test:contracts` 对照，有意改用 `pnpm actions:update`（第 3 节第 6 条） |
| 插件 Manifest 的格式与升级声明 | 类型在 `packages/contracts/src/platform/plugin-manifest.ts`（经 `platform/plugin` 子路径导出），校验与版本比较在 `packages/plugin-sdk/src/manifest.ts`（成果类型的声明检查在同包的 `artifact-declarations.ts`）；用法见 `docs/platform/PLUGIN-DEVELOPMENT.md`「插件版本升级」 | Manifest `version`（SemVer）；`upgrade_compatibility.compatible_from_versions` / `migratable_from_versions`。内置插件的 `version` 跟产品版本，只在发布 PR 里改（`docs/releases/POLICY.md`）：别的 PR 改 Manifest 的形状升的是能力 `version` 或合同里的其他版本字段，不动它 |
| MCP 工具名与参数 | `apps/mcp`；`docs/mcp.md`；`skills/goal-advance` | 工具名即身份；Skill 与手册随它改 |
| 对外合同 id | 现在没有（Casebook 的 `molis-work.casebook.*` 已于 2026-10-10 删除；以后出现新的对外合同 id，就在这里登记） | 合同 id 里的版本 |
| Home 里存的数据 | 项目库、目录库等，清单与版本方案见 `docs/system/HOME-DATA.md` | 库的结构版本（`PRAGMA user_version` 或自带的 meta 表），经 `packages/storage/src/sqlite-baseline.ts` 的 `applySqliteBaseline` 建库，版本不符就拒绝 |

## 2. 版本号的编号方案

产品版本的编号方案已定（`specs/repository-anti-corruption/spec.md` §1，2026-10-08「版本与发布策略」）：一个产品版本，下一版 0.3.0；根包、桌面端、Tauri 跟同一版本，内置插件的 Manifest 跟宿主版本，工作区包保持私有 0.0.0；每次发布有说明、CHANGELOG 和带各库版本表的检查单。这个方案的落地由路线图做，现在还没完成。

能力定义的 `version`、Home 库的结构版本、对外合同 `$id` 里的版本是各自合同的版本，是代码里单独的字段，不跟产品版本走。本文规定「形状变了就升这份合同自己的版本」。

## 3. 阶段一：现在，不留兼容期

1. **合同读写都只认现行取值**（`AGENTS.md` 硬约束）。破坏性变更直接改合同，不留旧版本解析、别名、兼容出口、读取时兜底历史取值。需要新增兼容或迁移逻辑的，要先写进 `specs/repository-anti-corruption` 的保留机制并经用户确认。
2. **同一个 PR 改完所有消费者**：仓库里的调用方、Skill 与手册、测试。PR 描述列出消费者和改了什么。先例（spec §1）：Casebook 改名（2026-10-04）要求「PR 里列出全部新旧 id」；MCP 连接工具去掉 `actor_id` 的决定（2026-10-07）写明 goal-advance Skill 与 `docs/mcp.md` 同步改。
3. **有版本字段的合同，形状变了就升版本。** 这样固定了旧版本的引用不会被静默当成新形状：例如工作流固定的能力引用，失效时保留并报错，不换成新版本或另一个提供方（`specs/action-architecture/spec.md` §3「工作流存量内容站迁移」）。
4. **存量数据由维护改成现行形状，读取时不兜底。** Home 的库：改建库基线并升结构版本，版本不符的库被拒绝（`applySqliteBaseline`），不就地升级，也不写迁移链。开发用的 Home 用一次性脚本升级或重建，脚本放会话临时目录，不进仓库产品代码（spec §1，2026-10-04）。真实 Home 的任何改动：先整份备份，在拷贝上演练，再动原库，并且要用户当次同意（spec §1，2026-10-02 至 10-07 各行）。
5. **外部已经在用的名字**（Runtime 用的 MCP 工具名）：改动是产品决定，先问用户，在 spec §1 记一行，PR 里列新旧名，外部插件同步。
6. **门禁守着**：源码里的兼容标记（`legacy`、`compat`、`@deprecated`、`backfill`）按文件计数，只许减少，新文件从零（`pnpm health:check`，`AGENTS.md` 健康门禁一条）。就地补表、测试引用包内部同样只许减少。

   **公开 API 快照门禁**（`scripts/gates/api-snapshot.mjs`，口径在 `tooling/gates/README.md`「公开 API 快照」）：`packages/contracts` 每个子路径和 `packages/plugin-sdk` 的公开 API 由编译器的声明输出生成（名字加签名，去注释），入库在 `tooling/gates/api/`。`pnpm health:check` 把源码生成的内容和入库的快照比，有任何不同就失败：加、删、改签名、新子路径没有快照、已删子路径的快照还在、快照被手改。它是一份不许静默变化的清单，不是只许减少的数字，所以 `--update` 和改基线都碰不到它。有意改 API 的 PR：先改代码，再跑 `pnpm api:update`，提交 `tooling/gates/api/` 的变化，并在 PR「公开合同与 API 影响」一栏写这个变化对插件和调用方的影响（`.github/pull_request_template.md`）；`--base` 时门禁日志还会列出相对 merge-base 的 API 变化，评审读它。它只管形状：函数体、注释、语义变化看不到，各插件 Manifest 里的动作声明与 schema 也不在里面（那是路线图 W2-15 的动作合同快照），所以第 3 条的版本字段和评审照旧要做。

   **动作合同快照门禁**（`scripts/gates/action-contract-snapshot.mjs`，口径在 `tooling/gates/README.md`「动作合同快照」，跑在 `pnpm test:contracts` 的 `tests/action-contract-snapshot.test.ts`）：每个内置 Manifest 声明的动作与消费场景，一行一个 `capability_id@version`，写明提供方（Manifest 的 `plugin_id`，和宿主登记它用的提供方 id 各一列：固定引用里写的是后者）、种类、谁能调（受众、权限）和输入、输出 schema 的哈希，入库在 `tooling/gates/actions/`；所有内置插件启用时宿主还登记着、却没有 Manifest 声明的动作与消费场景（现在是首页的 `home.dock@1`，判断绑定固定的就是它和提供方 id），另记在同目录的 `host-actions.tsv` 与 `host-scenes.tsv`。源码与快照有任何不同就失败，并把变化分开列：**同一版本下形状变了**（schema、语义类型、主体、依赖与撤销声明等；已经固定了 `capability_id@version` 的引用会遇到另一份合同，要么升版本，要么在 PR 里写明为什么没有固定它的引用会坏）、**登记用的提供方 id 变了**（改名、原生与 Runtime 装配之间迁移、换了发布签名；该插件每个动作逐个列出，固定了旧 id 的引用会遇到 `actions.provider_changed`，要在同一个 PR 里列出并迁完）、谁能调变了、换了新版本、新增、删除。它只看形状和声明，不看函数体与语义；schema 里的 `title` 和 `description` 是文字，不算。有意改：`pnpm build` 后 `pnpm actions:update`，提交 `tooling/gates/actions/`，把命令打印的变化写进 PR「公开合同与 API 影响」一栏。

7. **不算兼容、要保留的**：合同和 Schema 的版本号字段，插件升级声明 `compatible_from_versions` / `migratable_from_versions` 与发行物留存。它们是起点之后要用的机制，不是为旧数据留的（spec §1，2026-10-02「插件升级声明的机制」）。
8. **破坏性变更要在升级须知里写一条。** 装新版本的人要动手的合同变更（MCP 工具名变了、固定的引用要重选、动作升了版本），在 `docs/releases/CHANGELOG.md` 的 `[Unreleased]`「升级须知」里写一条：谁要动什么；发布时它随版本发出去。PR 描述照第 2 条列消费者，升级须知是给用户看的，两处都要。

## 4. 阶段二：起点之后，读取兼容

起点之后，对第 1 节任何一项做破坏性变更（删字段、改字段含义、收窄取值、改名），按下面做。只加可选字段、放宽输入的变更不算破坏性，照常做。

1. **写变更说明**：`specs/<task>/spec.md` 或 PR 描述写清变了什么、为什么不能只加可选字段、影响谁。
2. **升版本，新旧并存**：新形状用新版本。能力注册新的 `version`，同一个 id 的旧版本继续可调用到窗口关闭；Home 的库加一段 `from → to` 的升级；插件 Manifest 按 SemVer 升主版本，并在 `upgrade_compatibility` 里写清哪些来源版本可以直接用、哪些可以迁移。
3. **读取兼容，写入严格**：读取时接受旧版本并映射成新形状；写入只产生新版本。结果合同回显已存历史时，接受历史取值，写入侧不接受。
4. **消费者清单**：窗口开始时列全：仓库内的调用方（用 `git grep` 找能力 id、工具名、导出名）、外部消费者（使用 MCP 工具的 Runtime 与 Skill）、已安装的插件（用户 Home 里的发行物，创作台生成的插件）。每一项写：谁负责迁、迁移 PR、状态。
5. **删除条件**：每个窗口写一个可检查的条件，例如「清单里的消费者全部迁完，并且已经过一个发布版本，用户 Home 的库都已升到新版本」。条件满足后，一个 PR 删除兼容代码、兼容测试和登记行。**提议：** 兼容代码旁放带窗口编号的标记，登记表（第 6 节）有对应一行，门禁据此放行（第 5 节）。这是本文的提议，没有经过用户确认；`AGENTS.md` 要求新增兼容机制先写进 `specs/repository-anti-corruption` 的保留机制并经用户确认，所以起点之前要先过这一步。
6. **合同测试**：窗口里每一段兼容配两个测试：旧形状被读取并映射成新形状；写入只产生新形状。关窗口时和兼容代码一起删。
7. **插件回放**：合同或运行时的变更，用存量插件样本回放，确认它们仍能加载（解析 Manifest、校验授权声明）、升级（按 `upgrade_compatibility`）、运行（调用一个动作）。工具是 `scripts/replay-plugins.mjs`（在构建好的工作区上跑，每个样本一份临时 Home），样本集在 `tests/fixtures/replay-plugins/corpus.json`：`examples/plugin-sample`、按 `pnpm pack` 打包的内置插件 text-stats（在它自己的位置上以打包的代码升级）；路线图 W4-01 的 2–3 个创作台生成的插件（隔离 Home 里用 MiniMax 真跑）还在补。`tests/replay-plugins.test.ts` 跑它，并确认坏样本会失败。把回放结果贴在 PR 里。
8. **PR 里写清楚**：公开 API 有没有变（快照 diff）、版本怎么变、消费者列表、删除条件。`.github/pull_request_template.md` 有对应的栏目。

## 5. 起点之前要先有的东西

起点一到就要能用，所以这些要在起点之前就位。进度以 `specs/repository-anti-corruption/spec.md` §10 为准：

- 公开 API 快照（`packages/contracts` 各子路径和 `packages/plugin-sdk`）：**已就位**（路线图 W1-04，门禁见第 3 节第 6 条）。导出一变必须显式 `pnpm api:update`，PR 里写影响。
- 动作合同快照（每个内置 Manifest 的 `capability@version`、提供方和 schema 哈希，进 `pnpm test:contracts`）：**已就位**（路线图 W2-15，门禁见第 3 节第 6 条）。schema 变了而版本没变，失败信息会单独点出来，由评审拦下；要不要在 CI 里对照 merge-base 直接拦死「同一版本下形状变化」，取决于「只加可选字段算不算形状变」（第 4 节开头把它列为阶段二才有的例外），这是合同语义，等用户定。
- 插件回放工具与样本集（路线图 W4-01）。
- **提议（未经用户确认，见第 4 节第 5 条）：** 兼容标记门禁改成允许「带窗口编号、登记表里有对应行」的标记，其余仍只许减少。现在的门禁一律只许减少，起点之后的第一段兼容会被它拦住；放宽门禁要另开 PR，改 `tooling/gates/` 与门禁脚本，请求 @yijunw0212 评审。
- 版本策略落地：根包、桌面端、Tauri 与内置插件 Manifest 跟同一个产品版本，发布检查单带各库的版本表（2026-10-08 已定，见第 2 节）。

## 6. 登记表

当前开着的兼容窗口：**没有**（阶段一不留兼容期）。起点之后，每个窗口一行：

| 窗口 | 合同 | 旧 → 新 | 消费者清单 | 删除条件 | 负责人 |
| --- | --- | --- | --- | --- | --- |
| （空） | | | | | |

## 7. 已决与还开着的

已决（用户 2026-10-08，路线图待决 #15）：起点是第一个装到开发机之外的版本，日期到时写进本文。没有选的两个方案：现在就对已有外部消费者的合同开始（Casebook，Runtime 使用的 MCP 工具名）；各合同的主人在发布它时各自开始。补充（用户 2026-10-29）：「1.0.0 之前都是开发版本」，0.3.0 不是第一个外部版本，起点不早于 1.0.0；发版（W5-15 余下）不算进防腐完成标准。

Casebook 已于 2026-10-10 按用户决定删除，不再有对外合同 id；以后重做时按本文重新登记。起点之前，改外部已经在用的名字（如 Runtime 用的 MCP 工具名）是产品决定，先问用户（第 3 节第 5 条）。

还开着的：

- 起点那天要把版本号、日期和提交写进本文顶部，并把第 3 节标为已结束（还没到）。
- 第 4 节第 5 条与第 5 节里标了「提议」的两处，起点之前要经用户确认。
- 第 5 节列的前置还没做完。

## 8. 阶段一已做、对插件作者有影响的合同改动

只记插件作者要知道的改动（不是兼容窗口，阶段一不留兼容期）；新的写在最后。

- **`PluginDatabaseTransaction.savepoint(body)`**（PG-094 S10/S11，S-67 暂定号，落地时重编）：事务句柄多一个**必需**方法，让插件撤销事务的一部分而不结束事务。`body` 同步返回 `{ keep, value }`，`keep: false` 或抛错就撤销这一点之后的写入（含项目日志里的事件与提交后效果），嵌套的点只撤销自己。点的名字由平台生成，插件不发 SQL。对既有插件：用平台给的事务句柄的不受影响；**自己实现 `PluginDatabaseTransaction` 的**（把自己的库包成这个类型，如 Jelly 的商店、测试替身）要补这个方法，`tests/fixtures/plugin-database.ts` 的 `memoryPluginDatabase` 已补。沙箱插件的语句通道（`project_statements`）没有它。
- **项目日志的只读句柄多了 `getIdempotency(actorId, operation, key)`**（PG-094 S9-1/S11）：此前只有写句柄能读自己存的幂等记录，查询路径（只读窗口）读不到，Goals 的重放读取要在查询里用，所以读句柄也有了；写句柄原有的签名不变。自己实现 `PluginJournalReader` 的（测试替身、沙箱适配）要补这个方法。记录仍按调用的 `actorId` 隔离，别的人读不到。
- **`services.attention` 与 `services.contextLedger`，权限 `attention:read`/`attention:write`、`context-ledger:read`/`context-ledger:write`，Manifest v2 的 `attention: { subjects }`**（PG-087、PG-094 S9-0b）：新增、可选，没声明对应权限的插件拿到的是 `undefined`。写入加入插件当前的项目事务；对象的所有者（`owner_plugin_id`）由安装的可信 Manifest 记下，不从调用者输入读，`subjects` 只能是平台的封闭列表（`feed_item`、`goal_decision`、`source_fault`）里的种类。Attention 的条目与事件记录多一个**必需**字段 `owner_plugin_id`（`string | null`，null 是明确的「未指派」），`AttentionSubjectType` 改成上面的封闭列表，`deleteSubject` 多一个可选的所有者参数。自己构造这些记录的代码（测试替身）要补字段。
- **页面与管理入口给出处，同一个写法（`user_action.message_ref` 一律 `web:<键>` / `management:<键>`，整份确认走请求头 `x-molis-work-whole-confirmation: 1`）**（PG-029 后半、PG-008 Goals 部分，PG-094 S12）：出处由宿主入口（`apps/local-host/src/entry-user-action.ts` 的 `entryUserAction`）给，不再各动作手写；页面一次请求的 `message_ref` 取该请求已有的一次性键（`x-molis-work-idempotency-key`，同一次操作的重试用同一把），管理入口取命令的 `idempotency_key`。此前存下来的决定记录里的 `web-decision:<键>`、`web-event-decision:<键>`、`management-tree-decision:<键>`、`management-event-decision:<键>` 不改（读取不兜底，也不用它们比对），之后新存的是新写法。树决定的"整份确认"此前由请求体里的 `confirm_all_pending` 带出，现在页面入口只认请求头，只有 Goals 方案页的"确认整份"控件会发；页面入口的权限不再手写，按每个动作在 Manifest 里声明的权限与已运行安装的授权逐请求求解（`localWebActionContext`）。
- **结构提案的决定，请求身份不再含 `conversation_ref`、`message_ref`**（PG-094 S12）：这两个是入口给的审计定位，不是"决定了什么"；页面入口的 `message_ref` 现在取该请求的传输键，同一个业务键换一把传输键重试，仍重放原结果（`HTTP goal-tree decisions replay the original result with a stable business key` 照旧通过），同键不同内容仍被拒。决定记录里照旧存原来那条的定位。
- **`artifacts.links` 多声明权限 `goals:read`**（PG-094 S12；**已被取代**：现状只要 `artifacts:read`，取标题改由下面 BL-646 那条的 link_subjects 做）：该动作为"交付它的 Goal"取标题，现在以调用者的身份问 Goals 的目录（`goals.directory.read`），不再经宿主私路读 Goals 的库；取不到就退回只显示 Goal id。调用它的客户端（页面、助手、MCP、工作流）要持有 `goals:read`；本机所有者与已安装 Goals 的项目照旧有。动作合同快照里 `artifacts.links` 一行的 `谁能调` 随之变，输入输出形状不变，版本不升。
- **`artifacts.links` 的输出按声明链接的插件分组，新增「链接对象的名字」合同**（BL-646，T-113，2026-10-30）：输出从 `{ goals: [{ goal_id, title, role }], other }` 改成 `{ plugins: [{ plugin_id, plugin_title, objects: [{ id, title, role, proposal, open: { surface, id } }] }], other }`，`role` 只有 `input`、`output`，「提议的」另由 `proposal` 说；此前凡是命中已声明种类的边都被当成 Goal 列出、用 Goal 的目录查名字。名字与打开位置由声明那个链接种类的插件自己答：`platform/actions` 新增 `defineArtifactLinkSubjectsAction`、`isArtifactLinkSubjectsAction`（插件作者从 plugin SDK 取 `defineArtifactLinkSubjectsAction`、`ARTIFACT_LINK_SUBJECTS_BATCH` 和三个类型）（输入 `{ ids }`、输出 `{ objects: [{ id, title, open }] }`，按 input/output 类型识别），宿主以调用者身份调它，只收问过的 id；没有这个动作、调用失败或调用者读不了的，显示 id、按边的 `source.module` 打开。link_subjects 的受众与 `artifacts.links` 相同（user、agent、workflow、mcp），因为它以 `artifacts.links` 的调用者身份被问：MCP 或工作流调用方要同时被授予声明方的 link_subjects 才看得到名字（与此前要有 `goals.directory.read` 一样），没有就只看到 id。一次最多 200 个 id，成果库分批问；声明方给的 `open` 只认它自己的 surface，别的退回边的 module。被拒（`forbidden`、`not_found`，以及 MCP 客户端没被授予命名动作时的 `mcp.action_revoked`）就是「读不到」的回答，显示 id、不写日志；其余失败写进宿主日志（`artifacts.link_subjects_failed`）再显示 id。Goals 声明 `goals.artifacts.link_subjects@1`（`goals:read`）。**为什么不升 `artifacts.links@2`**（§3 第 6 条）：仓库里没有固定 `artifacts.links@1` 的工作流模板、场景或绑定，唯一调用方是宿主成果页，本次已改；阶段一没有要保留的 Home 数据；同版本换输出形状有先例（batch-25 #1194 的 `goals.subject.read@1` 等）。开发 Home 里固定了它的工作流会读到新形状，已写进 CHANGELOG 升级须知。动作合同快照里这一行的输出哈希随之变。**声明了 `artifacts.links` 的插件**要声明自己的 link_subjects 动作，否则它的对象只显示 id。本条取代上面 PG-094 S12 那条的取标题方式。
- **`goals.board.initialize` 采纳启动时代做的看板**（PG-094 S12）：Goals 在项目启动时用根行代为开板（先于任何人要它）。人第一次明确初始化（如 `molis-work v1 init` 开一个目录库之外的库）时，若看板正是这一次启动时做的，就当作这次调用要的看板回答，并记成这次调用自己的回执（重试重放）；更早的运行或更早的调用做的看板，照旧以 `goals.board.exists` 拒绝。

- **Manifest 的 `attention.inbox`：插件声明哪些种类的条目是人的 Inbox；Inbox 读取入口改按声明解析；Feed 不再能开 `goal_decision` 条目**（PG-094 S12，RAC-806～809，统筹 2026-10-25 定）：`attention` 在 `subjects` 之外可选地加 `inbox`（`subjects` 的子集，不空、不重复）；`AttentionQuery` 加 `listInbox(projectId, declared)` 与 `getInbox(projectId, entryId, declared)`，`declared` 是 `AttentionInboxDeclarations`（主人插件号 → 它声明的种类）。Inbox 是未归属条目，加上「主人声明了该种类」的有主条目，别的一律不解析（声明只对声明者自己的条目生效，A 声明的种类不会让 B 的条目出现）。宿主从项目库里运行中的安装、按发行物归档里的 Manifest 读出声明（`apps/local-host/src/plugin-inbox-declarations.ts`），Feed 的 `listInboxEntries`、`getInboxEntry`、`setInboxEntryStatus` 经 `FeedApplicationPorts.inboxDeclarations` 调这两个查询，代码里不点名任何插件。Goals 的 Manifest 声明 `inbox: ["goal_decision"]`。停用、卸载或发行物未归档的安装不贡献声明。同时 Feed 不再读 Goals 的表，`inbox.add` 一类入口对 `goal_decision` 一律以 `feed.invalid_transition` 拒绝（提醒由 Goals 自己开）。调用方的影响：不声明 `inbox` 的插件，它的有主条目不进 Inbox（照旧只经 `services.attention` 读）；想往 Inbox 手动加一个 Goal 的客户端会得到拒绝，没有正常路径依赖它。
- **没有 Home 的 Host，项目插件名单里不含声明 Home 库的插件**（PG-094 S12）：Goals 声明了 Home 库，没有 Home 的 Host 原先整张名单被 `assertDatabaseEntries` 拒绝而全部起不来，现在只是 Goals 不在名单里、其余照常启动。产品里的 Host 都有 Home，不受影响。
- **`services.artifacts.join(tx, write)` 与 `PluginArtifactWriter`；Feed 六个动作多声明 `artifact:write`**（RAC-510，S-100 暂定号，统筹 2026-10-27 批）：`PluginArtifactClient` 多一个可选方法 `join`，只给有项目库的插件，没有项目库的拿到的是 `undefined`。`write` 同步拿到一个 `PluginArtifactWriter`（`head`、`publish`）；它钉的成果版本是插件当前项目事务的一个保存点，和插件自己的行一起提交、一起回滚，日志事件也在同一个事务里，事务结束后写入器失效。写入器每次 `head`、`publish` 都问 S-68 那道门：安装在跑、持有 `artifact:write`、原调用方仍有效，调用是声明了 `artifact:write` 的可等待并行动作。产出者、作者（原调用方的 `audit_actor_id ?? actor_id`）、项目和范围由平台盖，类型照 Manifest 的 `artifacts.produces` 核。原有的 `services.artifacts.publish` 不变。调用方的影响：`feed.sources.sync`、`feed.sources.tick`、`feed.sources.wake`、`feed.notifications.receive`、`feed.rules.evaluate`、`feed.content.receive` 多声明 `artifact:write`，`feed.content.receive` 另多声明 `attention:write`（FI-C-08）；调用它们的客户端（页面、助手、MCP、工作流、场景）要多持有这几项，不留兼容期。动作合同快照里这 6 行的 `谁能调` 随之变，输入输出形状不变，版本不升。

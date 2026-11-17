# 合同变更流程

2026-11-16 第 34 批 Sessions：`packages/contracts/src/platform/external-tools.ts` 的 `ExternalToolEntry` 新增可选 `display_name_en`（28 条中文显示名补齐，页面仍不直接导入登记表，由 `/api/sessions/*` 投影）；`services/sessions` 包成熟度 `contract-only` → `partial`，新增系统动作 `sessions.connector.usages@1`，删除无抛出路径的 `sessions.suggestion_unavailable`；`modules/private-work-context` 提取 `WORK_CONTEXT_PERSON_RELATION_KEPT_CODE` 常量（类型值不变）。均为阶段一原地变更，无旧值读取、无库迁移；动作/API/库结构快照随本批更新。

2026-11-14 第 12 批合后审计：`UiPageWorkspaces.readInstructions()` 的返回从 `Promise<void>` 改为 `Promise<UiPageInstructionSettings>`（`off`/`trusted`/`why_not`，与 `ProjectDirectories.instructions` 同形），工作台框桥把回执交给页面，Coding 直接更新规则菜单而不再整页重读；`contracts/platform/ui` 的 API 快照随改。阶段一原地改，不保留旧返回值读取；调用方只有本仓库的工作台框桥与 Coding。

2026-11-05索引Home增量：Memory ledger现行索引采用格式为2，DDL/业务行不变，仅授权隔离的真正空容器建2；Home恢复journal现行schema为1（#1837 统一起点；用户 2026-11-12 定保持 1），形状和原phase不变，但旧App不得按旧路径权限回滚新索引材料。普通打开拒绝旧/未来版本、不兜底；旧Home的记忆账本只经下方「当前保留机制」登记的 1 → 2 升级段进入第 2 版。生产/冷维护显式 `indexed-v1`，snapshot新增SDK共享DB及精确侧车拒入/目标reset；MemoryRestoreSdkPort签名不变，purge材料语义为SDK已确认的现存权威文件，不能假设一条独占一文件或删除共享DB。公开API没有因此新增类型；原API快照由统筹核对。新容器不得交旧App或改版本回退，回退使用原隔离树和原Home。

状态：现行（2026-10-08 入库；同日用户定了读取兼容的起点；2026-10-29 用户定 1.0.0 之前都是开发版本）。分两个阶段：现在在**阶段一，不留兼容期**；**阶段二，读取兼容**从第一个装到开发机之外的版本开始，这个版本不早于 1.0.0。

> **阶段二的起点（用户 2026-10-08 定，`specs/archive/repository-anti-corruption/spec.md` §1「『不留兼容』何时结束」；路线图待决 #15）：第一个装到开发机之外的版本。** 用户 2026-10-29 又定「1.0.0 之前都是开发版本」：现行 0.1.0 候选、原 0.3.0 候选和 1.0.0 之前的其他版本都是开发版本，不是起点，所以起点不早于 1.0.0。开发机指参与开发的人（现在是用户和同事）用来开发和试用的机器。起点之前一律按阶段一的「不留兼容」做。
>
> 起点日期：**还没到，没有固定日期。** 起点发生时，发那个版本的 PR 在这里写下版本号、日期和提交，第 3 节标为已结束，第 4 节开始适用。第 5 节的前置要在那之前就位。

起点之前，没有要保留的旧用户数据：2026-10-02 用户确认没有同事在用要保留的 Home（`specs/archive/repository-anti-corruption/spec.md` §1），所以破坏性变更直接做，不留兼容代码。起点之后才有「读取兼容、写入严格」的兼容期，那时每一段兼容都要写明消费者和删除条件。本文把两个阶段都写下来，让起点一到就有流程可用，也让现在的做法有边界。


2026-11-04 Memory C2：新增只收引用的 plugin-only `memory.learning.enqueue/run/form@1`，沿原 memory.learn 队列进入当前来源安装；既有 memory.* 形状不变。公开执行控制增加仅收紧的同步 `assert_memory_sources_current`，bound client 保留原限制并求交；callback view 不包含此字段。schedule.enqueue 第二参转交已采用 SDK 的 signal/beforeCommit。队列只增加 refs-only plugin-run payload 分支及固定 installation_generation，Assistant 原任务格式和 key 不变；不增加库格式、迁移或旧值兜底。
2026-11-05 Memory 历史恢复：当前 `memory.history@1`，strict响应增加历史`classification`、`expires_at`、`snapshot_available`，只给安全投影，不输出原snapshot。按 main 的阶段一版本规则原位扩充严格 schema，Workbench通过共享Action定义消费；旧 `@2` / `@3` 固定引用明确失效，不保留兼容入口。`memory.change@1`输入形状不变；restore在现无正文操作marker绑定所选历史版号，update/restore子CAS固定原确认版本，已有marker缺少所需原决定时不能补猜。没有新增库/迁移/SDK状态或正文备份；不恢复已取消的旧库采用。公开API与Action快照由原生成命令同步，具体工程和页面结果在现Memory spec记录。

2026-11-05 用户明确决定：旧版跨范围移动在源已不可用、又完全缺少目标回执时停止自动续办，保留现存内容并提示待核对；撤回该旧态的自动恢复成功承诺，不新增SDK查找口或从隐藏历史重建请求。当前移动仍须在接受源遗忘前原子保存目标回执及历史；真实事务失败、已保存回执后的清理失败均保留原请求恢复要求。已接受的自动新增撤销只凭原change/undo/purge/独立决定的精确身份继续清理，不重新开放正文。输入输出schema不变，原错误码与权限不放宽；旧红日志、明确范围与验证保留在Memory spec。

## 1. 哪些算合同

这里的合同是别人（别的包、别的进程、外部插件、用户的数据）依赖的形状：

2026-11-08 D0071：动作网关移除请求体 `client_id`，使用独立注册凭据签发的短时证明取得身份；原接入不自动换凭据，用户重新确认 Runtime 接入。新私有文件格式 `format.mcp.client.credential` 从第 1 版开始，凭据不进入快照。动作 id/schema、MCP 工具名与公开 contracts/SDK 形状不变；实验 Server 管理员授权必须指定本机安装 Home。

| 合同 | 在哪里 | 版本记在哪 |
| --- | --- | --- |
| `packages/contracts` 的公开子路径 | `packages/contracts/package.json` 的 `exports` | 没有版本号；形状记在公开 API 快照 `tooling/gates/api/contracts/<子路径>.txt`，`pnpm health:check` 对照源码，有任何不同就失败，有意改用 `pnpm api:update`（第 3 节第 6 条）。新子路径不能只导出一个没人用的 `ContractDescriptor` 占位，`pnpm health:check` 的占位子路径规则（`scripts/gates/contract-placeholders.mjs`）直接失败 |
| `packages/plugin-sdk` 的出口 | `packages/plugin-sdk/src` | 同上，快照是 `tooling/gates/api/plugin-sdk/index.txt` |
| 动作（能力）的身份、输入输出 schema | `packages/contracts/src/platform/actions.ts`；各插件 Manifest 的动作声明；规则见 `specs/action-architecture/spec.md` §3 | 每个能力定义的 `version`；被固定的引用写成 `capability_id@version` 加提供方。形状记在动作合同快照 `tooling/gates/actions/`，`pnpm test:contracts` 对照，有意改用 `pnpm actions:update`（第 3 节第 6 条） |
| 插件 Manifest 的格式与升级声明 | 类型在 `packages/contracts/src/platform/plugin-manifest.ts`（经 `platform/plugin` 子路径导出），校验与版本比较在 `packages/plugin-sdk/src/manifest.ts`（成果类型的声明检查在同包的 `artifact-declarations.ts`）；用法见 `docs/platform/PLUGIN-DEVELOPMENT.md`「插件版本升级」 | Manifest `version`（SemVer）；`upgrade_compatibility.compatible_from_versions` / `migratable_from_versions`。内置插件的 `version` 跟产品版本，只在发布 PR 里改（`docs/releases/POLICY.md`）：别的 PR 改 Manifest 的形状升的是能力 `version` 或合同里的其他版本字段，不动它 |
| MCP 工具名与参数 | `apps/mcp`；`docs/mcp.md` | 工具名即身份；手册随它改 |
| 对外合同 id | 现在没有（Casebook 的 `molis-work.casebook.*` 已于 2026-10-10 删除；以后出现新的对外合同 id，就在这里登记） | 合同 id 里的版本 |
| Home 里存的数据 | 项目库、目录库等，清单与版本方案见 `docs/system/HOME-DATA.md` | 库的结构版本（`PRAGMA user_version` 或自带的 meta 表），经 `packages/storage/src/sqlite-baseline.ts` 的 `applySqliteBaseline` 建库，版本不符就拒绝 |

2026-11-08 D0244：Search 的仓库内部公开服务新增 `SearchService.indexedCatalog`，提供受当前来源/读取器权限约束的同项目快照及原来源同步检查，Host 同片接入 Knowledge 整理。没有动作 id/schema、Manifest、MCP 工具名或公开 contracts/SDK 形状变化，也不改持久化格式；旧业务缓存保留，失效来源或失败缓存不用于新模型整理。

2026-11-09 日报 A 类：Manifest 新增可选 `demo_seed` 动作引用，由通用 Runtime 启动后调用；新增 `feed.demo.seed@1`（仅 workflow）、`goals.states.read@1` 批量读取和 `contextual.draft_reference.issue/take@1` 项目动作。Goals 输出加入取消状态；列表合同增加 owner SQL 分页/筛选、情境账按键批量读取，SDK 新增统一 HTML 清理与事务错误保全。仓库内所有调用方同片更新，API 与动作快照随片更新；当前阶段一，不保留旧形状或旧命令兼容。Server 组合入口统一为 `molis-work server …`，本机恢复适配器仍归 Host，不新增插件恢复权限。完整消费影响与验证见[本批需求](../../specs/archive/daily-quality-medium-20261108/spec.md)。

插件状态在 Manifest 可选字段 `state_machines`，阶段一在现行 Manifest 格式上添加。contracts 的 `/platform/state-vocabulary` 与 SDK 的 `/state-machine` 进入 API 快照；机器版本由插件作者维护。调用方继续使用现有状态取值和动作引用。声明随 Manifest 摘要，已装同版的声明变化适用同版摘要拒绝。状态集合变化沿插件升级合同，阶段二的读写主体与过渡期按第 4 节。

## 2. 版本号的编号方案

产品只有一个版本，根包、桌面端、Tauri 和内置插件的 Manifest 同版，工作区包保持私有 0.0.0；每次发布有说明、CHANGELOG 和带各库版本表的检查单。2026-10-08 原定的下一版 0.3.0，已由用户 2026-11-02 的 N34 决定改为复位 0.1.0。2026-11-06 依追加授权删除旧 GoalBoard `v0.1.0` release 与同名 tag、核实名称释放后，现行产品载体及全部内置 Manifest 已复位 0.1.0；版本归属和发布流程见 [版本策略](../releases/POLICY.md)，候选范围见 [v0.1.0.md](../releases/v0.1.0.md)。这是未发布的开发候选，不登记首次外部安装或真实 Home 的统一起点日期。

能力定义的 `version`、Home 库的结构版本、对外合同 `$id` 里的版本是各自合同的版本，是代码里单独的字段，不跟产品版本走。第 3 节规定阶段一怎样改形状，第 4 节规定首次外部安装后的过渡期。Home 库与带版本文件以重建为升级起点，见[升级连续性 §3](../../specs/upgrade-continuity/spec.md#3-起点库从统一起点开始升级链)。

## 3. 阶段一：现在，不留兼容期

1. **合同读写都只认现行取值**（`AGENTS.md` 硬约束）。破坏性变更直接改合同，不留旧版本解析、别名、兼容出口、读取时兜底历史取值。需要新增兼容或迁移逻辑的，要先写进本文「当前保留机制」并经用户确认。
2. **同一个 PR 改完所有消费者**：仓库里的调用方、Skill 与手册、测试。PR 描述列出消费者和改了什么。先例（spec §1）：Casebook 改名（2026-10-04）要求「PR 里列出全部新旧 id」；MCP 连接工具去掉 `actor_id` 的决定（2026-10-07）写明 goal-advance Skill 与 `docs/mcp.md` 同步改。
3. **动作、Manifest、MCP 工具名和宿主 API 在阶段一按现行版本改。** 第 02 批复位后沿用第 1 版。形状改动仍要刷新快照、说明对调用方的影响。已保存的调用按现行合同校验，版本不存在或输入不合要求时明确失败。工作流保留原引用，由使用者重新选择；保留提供方和权限检查。阶段二从首次外部安装开始，届时按第 4 节升版本并设过渡期。
4. **Home 库与带版本文件从重建开始升级。** 统一起点是经维护窗口验证真实 Home 干净重建、各库及带版本文件回到第 1 版的那一次。此前按现行基线建库，错版拒绝；此后每次改结构都升版本，并提供连续的 `n → n+1` 升级，较新的库仍拒绝降级。内置插件的表从同一次重建起算，外装插件的表从其首次安装起算。库主人、备份和窗口的实际日期分别见 [HOME-DATA](HOME-DATA.md) 和[发布检查单](../releases/CHECKLIST.md#4-真实-home搬开后干净重建)。
   **本次助理库例外（用户 2026-11-09 明确）。** 第 10、16 批共用的 `database.assistant_store_baseline` 保持第 1 版；草稿保护、通知与跟进的新结构和功能照常实现，不增加第 2、3 版或数据迁移，读取只认现行形状。原文保留、重启与去重等行为照常验证，测试和金样按现行结构维护；不操作真实 Home，不扩成全仓版本重置。此决定取代本批此前通知 JSON 的升版计划，具体范围见 [B/C 检查](../../specs/font-and-skin-system/bc-preflight.md#助理通知与跟进记录)。
5. **外部已经在用的名字**（Runtime 用的 MCP 工具名）：改动是产品决定，先问用户，在 spec §1 记一行，PR 里列新旧名，外部插件同步。
6. **门禁守着**：源码里的兼容标记（`legacy`、`compat`、`@deprecated`、`backfill`）按文件计数，只许减少，新文件从零（`pnpm health:check`，`AGENTS.md` 健康门禁一条）。就地补表、测试引用包内部同样只许减少。

   **统一起点版本检查（N41）。** 分两半。不用构建的一半是产品代码中自有的 `*VERSION` 常量和 `tooling/versions.json` 里持久化格式的条目：它是 `pnpm health:check` 的绝对规则（用户 2026-11-07 定），CI 里跑。另一半只有 `node scripts/gates/initial-versions.mjs` 查：它在临时 Home 检查内置 Manifest 与宿主登记的动作，再读内置提示词、主角色和子角色的登记和提示词、方法的版本条目，并把前一半再查一遍。2026-11-08 第 16 批核实，这一半还经 `tests/initial-versions-check.test.ts` 的 VG-35 进入 `test:contracts`，不只在重建窗口手跑。外部服务的协议号、SQLite 引擎版本、产品 SemVer 与匹配 SemVer 的正则分别由各自的主人检查。任何一项未复位都会指出名字并返回失败。窗口已于 2026-11-07 执行，结果记在发布检查单第 4 节；日常 CI 当前同时触发这两半。用户 2026-11-08 已批准第 16 批将日常内容检查改为核对唯一版本表和实际内容变更，保留显式起点核查用途；限定版本范围及尚未实施的边界见 [B/C 检查](../../specs/font-and-skin-system/bc-preflight.md) 与 [内容候选](../../specs/font-and-skin-system/bc-content-scope.md)。公开动作、Manifest/API 仍沿阶段一规则；持久化库或文件的结构版本依第 3 节第 4 条升级。持久化格式的名单在 `scripts/gates/initial-versions.mjs`，大于 1 时要有登记的连续升级链且回放通过。这份登记（`chains`）由 U1-d 接，脚本和 `pnpm health:check` 两处都接了；「回放通过」由 U2-d 接到金样：金样清单要存着这个格式从 1 到新版本减 1 的每个版本，回放本身由挡合并的 `golden-replay` 作业跑。U1 首次接入这类版本时，须在同一变更中以主人的升级链及回放验收接替该项初始值检查，不能直接删检查来放行高版本。

   **公开 API 快照门禁**（`scripts/gates/api-snapshot.mjs`，口径在 `tooling/gates/README.md`「公开 API 快照」）：`packages/contracts` 每个子路径和 `packages/plugin-sdk` 的公开 API 由编译器的声明输出生成（名字加签名，去注释），入库在 `tooling/gates/api/`。`pnpm health:check` 把源码生成的内容和入库的快照比，有任何不同就失败：加、删、改签名、新子路径没有快照、已删子路径的快照还在、快照被手改。它是一份不许静默变化的清单，不是只许减少的数字，所以 `--update` 和改基线都碰不到它。有意改 API 的 PR：先改代码，再跑 `pnpm api:update`，提交 `tooling/gates/api/` 的变化，并在 PR「公开合同与 API 影响」一栏写这个变化对插件和调用方的影响（`.github/pull_request_template.md`）；`--base` 时门禁日志还会列出相对 merge-base 的 API 变化，评审读它。它只管形状：函数体、注释、语义变化看不到，各插件 Manifest 里的动作声明与 schema 也不在里面（那是路线图 W2-15 的动作合同快照），所以第 3 条的版本字段和评审照旧要做。

   **动作合同快照门禁**（`scripts/gates/action-contract-snapshot.mjs`，口径在 `tooling/gates/README.md`「动作合同快照」，跑在 `pnpm test:contracts` 的 `tests/action-contract-snapshot.test.ts`）：每个内置 Manifest 声明的动作与消费场景，一行一个 `capability_id@version`，写明提供方（Manifest 的 `plugin_id`，和宿主登记它用的提供方 id 各一列：固定引用里写的是后者）、种类、谁能调（受众、权限）和输入、输出 schema 的哈希，入库在 `tooling/gates/actions/`；所有内置插件启用时宿主还登记着、却没有 Manifest 声明的动作与消费场景（现在是首页的 `home.dock@1`，判断绑定固定的就是它和提供方 id），另记在同目录的 `host-actions.tsv` 与 `host-scenes.tsv`。源码与快照有任何不同就失败，并把变化分开列：**同一版本下形状变了**（schema、语义类型、主体、依赖与撤销声明等；已经固定了 `capability_id@version` 的引用会遇到另一份合同，阶段一保留原版本并在 PR 里说明影响，首次外部安装后按第 4 节升版本并设过渡期）、**登记用的提供方 id 变了**（改名、原生与 Runtime 装配之间迁移、换了发布签名；该插件每个动作逐个列出，固定了旧 id 的引用会遇到 `actions.provider_changed`，要在同一个 PR 里列出并迁完）、谁能调变了、换了新版本、新增、删除。它只看形状和声明，不看函数体与语义；schema 里的 `title` 和 `description` 是文字，不算。有意改：`pnpm build` 后 `pnpm actions:update`，提交 `tooling/gates/actions/`，把命令打印的变化写进 PR「公开合同与 API 影响」一栏。

7. **当前保留机制**见下节：它们属于现行功能或依赖，不是兼容窗口，不允许据此增加历史格式读取。
8. **破坏性变更要在升级须知里写一条。** 装新版本的人要动手的合同变更（MCP 工具名变了、固定的引用要重选、动作升了版本），在 `docs/releases/CHANGELOG.md` 的 `[Unreleased]`「升级须知」里写一条：谁要动什么；发布时它随版本发出去。PR 描述照第 2 条列消费者，升级须知是给用户看的，两处都要。

### 当前保留机制

以下机制从防腐 spec §4.1 及已采用决定归回本文；兼容标记的历史数量仍留原 spec，不作为当前计数。阶段一不因登记而放宽门禁：源码兼容标记只许减少，新文件从零；新增兼容或迁移须先在这里写清目的、owner、消费者、允许边界和删除条件，并经用户确认，登记本身不能放行增长。

| 机制 | 目的与允许边界 | owner 与移除条件 |
| --- | --- | --- |
| 记忆新一代起点（Memory V0，用户 2026-11-07 定不迁移） | `memory` 1 → 2 只删账本里关于旧记忆的行（历史、候选、变更、信号、使用、配对、标记），保留归属标题和每个开关；偏好里唯一新增的 `class_restrictions` 在缺少时补成空列表（不限制任何类别，用户 2026-11-11 定），不改其他字段；并留一个标记；持主人锁的下一次启动只凭这个标记，先永久删除 `agent-runtime/records/` 下旧布局的 `io.molis.work~memories` 与 `io.molis.work~memory-candidates` 两个目录（SDK 索引库在它们存在时拒绝挂载；不是普通目录的拒绝、不删；用户 2026-11-11 定），再写空的 `memory-forgetting-v2.json`，最后删标记；中途停下的下一次启动重做。其他 SDK 记录不动，旧记忆不读、不搬；别的缺遗忘文件的 Home 照旧拒绝。真实 Home 升级前按发布检查单先做完整备份 | 记忆账本（`packages/storage`）；最早支持的金样不再需要第 1 版时删除此升级段与标记处理 |
| 记忆账本无正文归因收口（第 31 批合后复查 #2087，2026-11-15；PR 正文称用户当次明确指令，独立决定记录待补） | `memory` 2 → 3 将既有 `memory_revisions.body` 原位清洗为只含 `{version, change, by, at}`（去除第 2 版曾写入的重复 `text`/`kind`/`applies`/`snapshot`），并移除非 `pending` 的 `memory_markers.body` 中的 `$.merge` 暂态字段；现行第 3 版读取路径严格校验四键归因形状，残留正文或未知键直接报 `storage.memory.invalid`，不做读时过滤兜底；遗忘与完成提交同时从 `memory_changes` 与 `memory_markers` 擦除自动改动的 `trigger_evidence` | 记忆账本（`packages/storage`）；最早支持的金样不再需要第 2 版时删除此升级段 |
| Files 退役与过程项同步切换（第 06 批，用户 2026-11-09 批准隔离实现） | 用户随后明确取消新增升版：06 批当时项目库保持 2（第 15 批 #2017 已升到第 3 版；11-13 用户决定同版本例外改指第 3 版）、过程项同步保持 1、D1 保持 6。精确旧 Files 身份、三类过程项及相关端口／绑定的功能转换仍做，同版本按账号 cutoverId 派生私有同步分区，公开集合不变；原不同版本 namespace 方案不再执行。显式隔离 owner 采用不伪装 U1 同版本升级，普通打开只检当前结构、不补 DDL；[同版本采用设计](../../specs/batch-06-shared-tools/current-version-adoption.md)已独立复核。2026-11-12 起：项目库采用程序在 `apps/local-host/src/process-items-adoption.ts`（只在隔离 Home 测过）；现有 1→2 步骤直接升到新布局，只动结构（用户 11-12 定）；旧布局第 2 版只走显式采用，采用中换日志后在同一事务走完 2→3，落到第 3 版现行（用户 11-13 定）。项目库结构快照的同版本变化只按 `tooling/gates/schemas/same-version-exceptions.json` 的唯一一条放行（用户 11-11 定，11-13 改指第 3 版）。同一采用事务里，项目库按 spec「本库安装清理」把 Files 的官方安装记成已卸载（私有值保留）、删去它作为订阅方的事件游标（Runtime 的 `retired-install.ts`）；全部项目采用后，Home 步骤除撤同意外，由 Projects 的 `plugin-retirement.ts` 把 `files` 移出各项目成员（本地与可同步两份），每个项目记一条普通的移除事件（11-12 起，只在隔离 Home 测过）。限定旧源预检、封前容量预留、冻结值播种、精确旧回执与保留期内受权历史读取。脏旧设备在改属前保全原值、操作与同步恢复数据，恢复件登记首版格式，走本人显式接管；普通读写不兜底旧业务结构。真实部署、真实 Home 与云端迁移另授权；[完整合同及验收](../../specs/batch-06-shared-tools/sync-cutover.md) | 成果／过程项 owner 管业务图，Runtime 管端口与同意，sync-replication 管恢复件和客户端，Rust 同步 owner 管 D1／R2，Host 的实际 Home owner 控制本地采用窗口。消费者为资料、Coding、Diff、Text Stats 与同步设置。支持的旧源全部迁完且无待接管恢复件后移除专用转换和旧源捕获入口；已有恢复件在用户处置前保留。永久封印、原回执及仍有效的历史权利按其合同继续履行，不随转换代码删除。 |
| 技能设置与用量建表（08-7，用户 2026-11-06 同意） | `agent-definitions` 1 → 2 只创建空的 `skill_settings`、`skill_uses` 及用量索引；既有提示词覆盖、历史和用量不变。由 U1 升级执行，普通打开仍拒绝旧版本 | 宿主 Agent 定义；最早支持的金样不再需要第 1 版时移除此升级段，不保留旧结构读取 |
| 技能草稿、已知答案、回放与来源建表（第 42 批，用户 2026-11-16 同意） | `agent-definitions` 2 → 3 只创建空的 `skill_drafts`、`skill_cases`、`skill_trials`、`skill_lineage` 及其索引；既有提示词覆盖、技能设置与用量不变。由 U1 升级执行，普通打开仍拒绝旧版本 | 宿主 Agent 定义；最早支持的金样不再需要第 2 版时移除此升级段，不保留旧结构读取 |
| 工作记录评测样本留存建表（第 30 批，`specs/observation-collection/spec.md` §9） | `observation` 1 → 2 只创建空的 `evaluation_holds`、`evaluation_hold_records` 及关联索引；既有工作记录、加密证据快照、覆盖登记与写入状态原样保留。由 U1 升级执行，普通打开仍拒绝旧版本 | 工作记录层（`horizontal/observation`）；最早支持的金样不再需要第 1 版时移除此升级段，不保留旧结构读取 |
| Goals 方法库删除（第 41 批第 2 项，用户 2026-11-14 定「和 Goals 没有关系」「直接删，没有用户」） | 项目库 Goals 的表 3 → 4 只删 `planning_method_packs` 表和 `goal_event_config_versions.adopted_planning_json` 列，别的行不动（同一版里删表删列，有意不走「先扩后收」：没有用户，回退靠升级前的快照）；Home 库 `goals/goals.db` 由升级轮连目录删除（`REMOVED_HOME_STORES`）。不搬成技能、不留读取旧方法的代码；往 `REMOVED_HOME_STORES` 加新项要另经用户确认 | Goals 插件 owner（升级段）与宿主升级 owner（删除表）；统一起点重置、这一段不再有 Home 需要走时，删段与表项 |
| 插件升级声明（`upgrade_compatibility.compatible_from_versions`、`migratable_from_versions`）、同版本重装与发行物留存 | 插件版本之间的升级是现行产品功能，不是读取旧业务数据；内置插件为过去版本写的旧声明不因此保留 | Manifest 合同与 plugin SDK，使用规则见 [插件开发手册](../platform/PLUGIN-DEVELOPMENT.md)；随该现行升级功能或相应发行物生命周期处理，不作为永久历史读取许可 |
| pdfjs 的 `legacy/build` 路径 | 第三方包给 Node 的构建名，不是本产品的旧格式读取分支 | 引用 pdfjs 的现行功能及该依赖；上游构建入口改变或功能移除时随之修改 |
| 产品文案中的「回填」说明 | 给人看的现行文字，不是数据转换逻辑 | 各文案的功能 owner；随文案修改或功能移除，不据词面保留旧读取代码 |
| 各库的版本号与基线 | 一份当前 schema 加版本，版本不符就拒绝；可由权威事实重建的派生库按自身既有合同重建，不算兼容 | 各库 owner 及 [Home 数据表](HOME-DATA.md)；库移除时移除，不留已移除库的读取路径 |
| Goal 事件历史、成果的固定版本 | 现行历史记录和固定版本功能，不是旧格式 | Goals 与成果事实 owner；按对应功能和留存合同处理，不因防腐清理删除用户历史 |
| 库与带版本文件的升级链（`SqliteBaseline.upgrades`、`VersionedFile.upgrades`、`PluginDatabaseDeclaration.upgrades`、升级记录、升级快照） | 统一起点之后，让 `n → n+1` 的结构变更不再要求重建 Home。只在持存储主人锁的升级过程里执行（安装器自己的 `config/installation.json`、`release.json` 在安装器读它们时升，这时还没有宿主），读写路径只认现行版本，不做读时兼容、不做回写回退。比程序新的库只拒绝。起点：第 02 批的统一起点；段的跑法和范围检查对所有插件同一份。已装签名包由明确确认的版本切换驱动，读取旧库只供校验，SQL 由独立有界进程执行，库版本、归属账本、安装行和批准记录一起提交（第 26 批 U4） | `packages/storage` 负责机制，各库主人负责自己的段。某段在最早支持的金样都用不到时删段；机制随产品保留，不是过渡期 |
| 第 15 批组合纠正表的项目库 2→3 升级（用户 2026-11-08 批准） | 沿用上一行升级链，新建空 `surface_corrections`；保留原项目数据和 1→2 段，不新增读取兼容。补存着 v2 的独立金样，在隔离 Home 验 1→2→3 与失败保留原数据；不升级真实 Home；已随 `b819373250` 合入 | 纠正事实归 `horizontal/surfaces`，项目库基线由宿主装配。该段随最早支持金样的规则保留；具体方案见[组合服务 §14.1](../../specs/surface-composition/spec.md#141-s-1-当前开工检查2026-11-08) |
| 第 15 批 IM 消息 `subjects_json` 同版本例外（用户 2026-11-09 批准） | `server/server.sqlite` 保持 v1，仅在 `im_messages` 加 `subjects_json TEXT NOT NULL DEFAULT '[]'`；只允许旧结构 `626a2905680637a9` → 新结构 `2c4efaa24415de5e` 这一对准确差异，owner server、版本 1、无升级段。旧结构在可写连接前拒绝且保持原字节，不自动转换或修改真实 Home；`scripts/gates/store-schemas.mjs` 的 `DISCUSSION_V1_SUBJECTS_CHANGE` 只认这一对，其他库、反向变化和以后新增变化继续拒绝 | server/IM owner；删除条件：旧结构不再需要被拒绝，或该列随下一次正式版本升级进入升级链时移除此一次性例外。后续结构变化重新按第 3 节第 4 条处理；批准原文见[智能呈现 §17.2](../../specs/intelligent-surfaces/spec.md#172-保持版本-1-的-im-实施边界2026-11-09-用户批准) |
| 第 15 批 Builder 两种格式的限定同版扩展（用户 2026-11-09 批准） | 仅 `format.builder.saved-state`、`format.builder.portable` 保持 1，允许本次可选 `ui.slots`、组件 `surfaceSlot` 引用及 `surface-slot` kind。旧无挂载位数据仍是当前合法子集；原数据、历史发行物和签名包不改写，不迁移、不读时转换。未知字段、非法引用／组件、签名不符及错误版本严格拒绝且原内容不变。例外不涉及真实 Home，不扩大到其他格式或后续结构变化，也不放宽门禁 | Builder 持久化 owner 与 SDK 共用声明校验；具体接线和正反例见[公共来源与呈现 §7](../../specs/shared-sources-and-surfaces/spec.md#7-sdk-里共用的校验)。这是本次字段加法的准确授权记录，后续变更重新按第 3 节第 4 条处理 |

第 02 批 N30/N36/N37 的 Feed 清理以[本片需求](../../specs/post-anticorruption-roadmap/reference/batches/02.md#origin-reset-preflight)为准：证据正文只用 `feed/evidence/` 和 `system:feed:evidence-content-key:v1`，搜索意图只用 `feed-intent-v1`；环境口令的派生盐为 `molis-work-secretstore-v1`。删除第二密钥、恢复目录和命名空间绕行；旧盐不参与解密，缺钥或认证失败保留错误与原密文，不补副本、不就地迁移。该构建只在隔离 Home 验证，真实 Home 的切换仍要求原可恢复备份和重建窗口；代码合入不表示现场维护完成。

第 39-2 批移交（2026-11-14 用户批准在隔离库实现并验证，2026-11-15 批准增加第 41 批的 v4 来源）。平台项目库 3→4 的显式升级事务同时更新 Goals 私有库到 v5，并将 `goal_event_trusted_decisions`、`goal_tree_proposal_decisions` 和 `policy_bindings` 交给平台。分别校验 Goals v1～v4 的旧库，沿原升级保留事件证据和第 17 批的风险引用，完成第 41 批的旧方法表与采用列清理。未知组合、错误发布者、未记账旧表均拒。保留原主键、关系、历史来源和规则语义，旧资料按原证据展示。消费者为 Goals、统一管理、保护决定的 Web／MCP 入口及同步恢复。Goals 同步集合升为 `project_goals@2`，旧游标、待发和冲突只保存在升级备份。同步写方和恢复边界见[移交设计](../../specs/agent-approval/trusted-decisions-design.md#3-存量交接方案)。最早支持的金样已包含平台事实时移除此转换段。

第 44 批存量搬迁（2026-11-17 用户确认 A、B1、C；C 已实现，A、B1 未实现）。B1 的前提「平台认可补同步集合」在第 3 项开工时定：本批补，或明确接受补上之前第二台设备看不到要求认可；定之前不写 B1 的升级段。

三项的共同规则：
- 只在持存储主人锁的升级轮里执行；
- 只认现行版本，不做读时兼容；
- 未知组合拒绝，原数据不变；
- 在隔离 Home 用金样验证，不动真实 Home。

**A 项目指导回平台**（片 2，PEQ-01、PEQ-10）

推荐做法：平台项目库 4→5 的显式升级事务，同时把 Goals 私有库升到 v6（照 39-2 的做法）。
- 新表：平台新建 `project_guidance_entries`、`project_guidance_revisions`，主人是 `modules/projects`。列与约束照原表，但不再引用 Goals 的 `boards`。
- 搬什么：原样拷入主键、位置、修订号、内容哈希、来源引用、操作者与时间，再在 Goals 库删这两张表。`project.guidance_%` 日志类型和 `add_project_guidance`、`update_project_guidance` 收据随表移交。
- 只认 Goals v5 的登记结构。
- 同步：Goals 集合升 `project_goals@3`，去掉这两张表和这两类日志；平台另登记一个项目指导集合；旧游标、待发和冲突只留在升级备份里。
- 消费者：Agent Run 与助理回合的项目层提示词、MCP 上下文工具、Coding、设置页「项目指导」、同步恢复。
- 没装 Goals 的项目，升级后得到空表。
- 金样：带指导与修订的 v4 项目库，验 4→5，并验失败时原数据保留。
- 删除条件：最早支持的金样已含平台表时，删这一段。

PEQ-10 要求旧指导能读，所以不提供「从空开始」的选项。

**B 要求与认可交给平台**（片 9，PEQ-02、PEQ-16）

两边模型不同：

| | 平台认可 | Goals 现在 |
| --- | --- | --- |
| 存在哪 | Home 库 `acceptance.db`，目前不同步 | 项目库，随 `project_goals@2` 同步 |
| 要求挂在 | 主体（provider、kind、id），要求有版本 | 每个 Goal，挂在事件类型与配置版本上 |
| 判断 | 每轮交付的检查，只有 `supports`／`contradicts` | 挂在工作报告上，还有 `unknown` |
| 认可 | 逐条要求的人的决定：`accepted`／`returned` | 对一个决定请求整体 `accepts_requirements`；结论是 `accepted`／`rejected` |

三个选项：

- **B1（推荐）全部搬过去，保留历史。**
  - 主体：每个 Goal 一个主体（`goals`、`goal`、goal_id）。
  - 要求：修订号转成版本，`retired` 转成撤回。
  - 判断：每份带判断的工作报告转成一轮交付，版本记 `goal-event:<event_id>`。`supports`／`contradicts` 判断转成检查，档位照搬。`unknown` 不产生检查，原文仍在报告里。
  - 认可：要求结论转成逐条决定，`rejected` 转成 `returned`。
  - Goals 保留：Goal、关系、工作事件，以及「事件类型→要求」的绑定（存平台的要求号）。删掉要求、判断、结论三类表。`project_goals` 升 `@3`。
  - 跨两个库文件：先按来源键幂等地写 `acceptance.db`，再提交项目库事务。任何一步失败，用升级快照把两边一起还原。
  - 前提：平台认可要有同步集合。要么本批补上，要么接受补上之前第二台设备看不到要求认可。
- **B2 只搬要求定义和最后的结论。**
  - 不搬逐份报告的判断。
  - 更简单，但删掉了用户的历史，和上表「Goal 事件历史、成果的固定版本」一行冲突（那一行规定不因防腐清理删除用户历史）。
- **B3 不搬，升级时删除。**
  - 照 41-2「没有用户」的做法，删掉 Goals 的要求、判断与结论。Goal 和工作事件保留。
  - 要求要在平台上重新挂。
  - 这样 PEQ-02「要求认可都在」只对新数据成立。

**C 删 `goal-advance` 的运行时接入**（第 7 项）

已实现（第 44 批第 7 项）：收据 `format.runtime.integration.receipt` 1→2，去掉 `skill_path`、`skill_target`（声明与升级段在 `apps/local-host/src/installer/runtime-integration-receipt.ts`）。实现时与上面确认的方案有三处出入，都在 PR 里写明：
- 什么时候升：收据是宿主读的，不是安装器读的，所以登记进宿主的升级轮次（`apps/local-host/src/platform-upgrade-stores.ts`，持 Home 的锁），不走 `installation.json` 那条路。
- 删哪些链接：外部运行时目录里的 `goal-advance` 链接只在一种情况下删——它仍是指向收据里所记目标的符号链接。目录是 `~/.codex/skills/`、`~/.claude/skills/`、`~/.config/opencode/skills/`、`~/.pi/agent/skills/`，以及原方案漏列的 Grok Build 的 `~/.grok/skills/`。
- 指向别处或被用户改过的链接不动，写进宿主日志（`runtime_skill_link_kept`），不在接入状态里报：接入状态不再有 Skill 一项。
- 运行时配置条目和客户端凭据不变。
- 门禁与金样（用户 2026-11-17 同意）：收据登记为持存格式（`scripts/gates/initial-versions.mjs`），金样 `0.1.1-dev.6` 在本批的分叉点上生成，带一份 v1 样本收据。收据只有装过的 Home 才有，又记本机路径和对含 Home 路径的条目的指纹，所以样本用固定值、不含真实路径，原因记在金样清单的 `imports` 里；回放经主人的移除预览读回它。
- 删除条件：最早支持的金样不再含 v1 收据时，删这一段。

另一个做法是留下断链（目标随包一起删掉）。这会在用户的运行时目录里留下坏条目，不推荐。

### 存储版本变更登记

当前版本的唯一清单是 [CHECKLIST.md 第 3 节](../releases/CHECKLIST.md#3-各库版本表)，本表只登记版本变化及其来源、取消或未验证状态。2026-10-30 已取消的旧维护不因搬迁复活；真实重建、Memory 与旧 Home 的授权和 HOLD 仍按原决定。表内的 `slices/` 路径均相对原 `specs/archive/repository-anti-corruption/` 目录。

**2026-11-08 审计更正：** 下表「维护」列里写「真实重建未开始／尚未重建／真实Home未操作」的行，都是统一起点登记（2026-11-07）之前的旧状态；记录中的真实 Home 已于 2026-11-07 在记录里的那台开发机按[发布检查单第 4 节](../releases/CHECKLIST.md#4-真实-home搬开后干净重建)重建并登记统一起点。本次审计／维修所在的机器不是那台机器，本机无法核验（见[第 02 批记录](../../specs/post-anticorruption-roadmap/reference/batches/02.md#batch-02)）。行文保留历史原文，不逐行改写。

**助理库本次决定（用户 2026-11-08）：** 第 10 批的独立草稿版本与第 16 批的通知文字工作维持第 1 版；用户明确「版本号不升，其他照常，不用考虑迁移」。撤回 #1991 在途的 1→2 升级段，隔离金样直接使用当前结构，不新增读取兼容，不执行真实 Home 维护。此决定仅涉及这两批共享的助理库，不重置其他库。

**库版本维护清单**（门禁 `scripts/gates/store-versions.mjs` 只认这张表；统一起点登记之后还读升级段所在的代码文件）：检查清单第 3 节表里某个库的版本，和 merge-base 比变了（升或降），同一个 PR 就要在这里加一行，不然 `pnpm health:check` 失败。写法固定：「位置」一格是检查清单第 3 节同一行的位置，原样加反引号；「版本」一格写 `旧 → 新`，两边是数字，箭头是 `→`；后两格写哪个提交或 PR 改的版本、怎样维护和做没做。别处正文里写的不算。

统一起点已登记（检查清单第 4 节），之后这张表多三条规则：版本不许降，写了行也不行；升版本的行，「维护」一格固定写成 `定义处#旧→新`，整格用反引号包住，比如 `` `plugins/native/pages/src/database.ts#PAGES_DATABASE#1→2` ``，定义处和检查清单同一行的「定义处」完全相同，旧、新和「版本」一格的两个数字相同；这个定义的 `upgrades` 字面量里，要有从旧到新减一的每个 `from`。表里留着历史，同样数字的旧行写着文字不碍事，写成指针的每一行都要站得住。完整口径见 [tooling/gates/README.md](../../tooling/gates/README.md)。

| 位置 | 版本 | 改版本的提交 | 维护 |
| --- | --- | --- | --- |
| `agent-definitions/agent-definitions.db` | 1 → 2 | 第08批 #1984；2026-11-06 已授权新增空表 | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE#1→2` |
| `projects/<project_id>/molis-work.db` | 17 → 1 | 第02批 #1837（`67d04ce981`，接 Personal 后复位） | 保留当前完整结构与同步表。2026-11-07 旧Home完整备份、搬开后新建，统一起点已登记（[发布检查单第 4 节](../releases/CHECKLIST.md#4-真实-home搬开后干净重建)）；错版和不符所属结构仍拒绝，不就地升级。 |
| `projects/<project_id>/molis-work.db#coding` | 3 → 1 | 同上 | 同上 |
| `projects/<project_id>/molis-work.db#goals` | 2 → 1 | 同上 | 同上 |
| `projects/<project_id>/molis-work.db#inbox` | 2 → 1 | 同上 | 同上 |
| `projects/<project_id>/molis-work.db#schedule` | 2 → 1 | 同上 | 同上 |
| `projects/catalog.db` | 26 → 1 | 同上 | 同上 |
| `spaces/<spaceId>/sync/sync.db` | 5 → 1 | 同上 | 同上 |
| `plugin-runtime/plugin-runtime.db` | 4 → 1 | 同上 | 同上 |
| `issues/issues.db` | 4 → 1 | 同上 | 同上 |
| `form/form.db` | 4 → 1 | 同上 | 同上 |
| `cognia/cognia.db` | 3 → 1 | 同上 | 同上 |
| `dataset/dataset.db` | 3 → 1 | 同上 | 同上 |
| `images/images.db` | 3 → 1 | 同上 | 同上 |
| `jelly/jelly.db` | 3 → 1 | 同上 | 同上 |
| `lingguang/lingguang.db` | 3 → 1 | 同上 | 同上 |
| `pages/pages.db` | 4 → 1 | 同上 | 同上 |
| `ppt/ppt.db` | 3 → 1 | 同上 | 同上 |
| `todo/todo.db` | 4 → 1 | 同上 | 同上 |
| `workflows/workflows.db` | 3 → 1 | 同上 | 同上 |
| `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 3 → 1 | 同上 | 同上 |
| `characters/characters.sqlite` | 4 → 1 | 同上 | 同上 |
| `shelf/catalog.json` | 2 → 1 | 同上 | 同上 |
| `projects/<project_id>/molis-work.db#feed` | 2 → 1 | 同上 | 同上 |
| `projects/catalog.db` | 22 → 1 | W5-17（`feature/maintenance-w517-a`；统筹 #1332 6517794305） | 原迁移已取消，真实重建未开始。当前结构无projects.database_path，路径由可信Home与project_id推导；删除catalog维护脚本、旧结构夹具与演练。新建/错版拒绝及S-102在 `tests/catalog-path-derivation.test.ts`、`tests/security-invariants-project-storage.test.ts`。旧Home整体搬开后新建当前结构1，等全部代码合入/构建就绪后用户另说“开始”；不碰#1101分支。 |
| `config/mcp-tools.json` | 2 → 3 | ACA005（`feature/aca005-search-authority`，本片 PR） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `server/server.sqlite` | 1 → 2 | W5-16 B1（`anticorr/codex-w5-16-im-invite-hash`） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `memory/memory.db` | 2 → 3 | 记忆策略 M1 第一片（`codex/memory-p0`，独立 PR 交付） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `memory/memory.db` | 3 → 4 | [Memory SDK 采用 PR #1064](https://github.com/molis-ai/molis-work/pull/1064)，`6bbacc107` | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `connectors/connectors.db` | 1 → 2 | #661（`7074abe67`、`fe5634dd3`、`7007532b8`） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `pages/pages.db` | 1 → 2 | `0ff3adb8a`（10-13，直接提交到 main、没有 PR；只多一张 `page_comments`，其余建库语句逐条相同） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `plugin-runtime/plugin-runtime.db` | 2 → 3 | ac-trust T1（`claude/ac-trust-t1`） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `characters/characters.sqlite` | 1 → 2 | Sessions 收尾 SC-2（`migrate/sessions-sc2-characters-runs`；Characters 自己记原生执行，D3） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `functions/functions.db` | 3 → 4 | 平台服务 P2（`claude/ac-platform-scenes`；判断账按记它的插件安装分开存，S-90，[slice](../../specs/archive/repository-anti-corruption/slices/platform-scenes-judgments-services.md)） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `assistant/assistant.db` | 2 → 3 | PG-036 C8-3（`claude/ac-coding-93b25f`；助理按执行方协议选执行方，工作正文的执行方改记插件标识） | 已被2026-10-30干净Home重建取代；旧转换取消，工具、旧结构夹具与演练删除，历史证据从Git查，不作为安装步骤。 |
| `projects/<project_id>/molis-work.db` | 11 → 1 | 干净Home第一片 | 不迁移旧库；保留现行完整DDL，只在干净Home创建1。旧Home搬开另由用户给“开始”；错版仍拒绝，项目旧维护链已删。 |
| `projects/<project_id>/molis-work.db#feed` | 2 → 1 | 同第一片 | Feed现行12表和索引不改，声明起点1；旧账本不升级。 |
| `plugin-runtime/plugin-runtime.db` | 3 → 1 | 干净Home第三片（统筹6517794305） | 原迁移已取消，升级SQL/旧结构/演练删除；当前DDL不变，新建与拒绝回归见 `slices/clean-home-core-stores.md`。真实重建未开始，等全部代码就绪后用户“开始”。 |
| `characters/characters.sqlite` | 2 → 1 | 干净Home第三片（统筹6517794305） | 原迁移已取消，升级SQL/旧结构/演练删除；当前DDL不变，新建与拒绝回归见 `slices/clean-home-core-stores.md`。真实重建未开始，等全部代码就绪后用户“开始”。 |
| `functions/functions.db` | 4 → 1 | 干净Home第三片（统筹6517794305） | 原迁移已取消，升级SQL/旧结构/演练删除；当前DDL不变，新建与拒绝回归见 `slices/clean-home-core-stores.md`。真实重建未开始，等全部代码就绪后用户“开始”。 |
| `assistant/assistant.db` | 3 → 1 | 干净Home第三片（统筹6517794305） | 原迁移已取消，升级SQL/旧结构/演练删除；当前DDL不变，新建与拒绝回归见 `slices/clean-home-core-stores.md`。真实重建未开始，等全部代码就绪后用户“开始”。 |
| `issues/issues.db` | 2 → 1 | 干净Home第四片（统筹6517794305） | 现行完整DDL、owner与权限保留；旧Home整体搬开后新建，不升级旧数据。新建/重开/错版拒绝见 `slices/clean-home-plugin-stores.md`；真实重建等全部代码就绪后用户“开始”。 |
| `form/form.db` | 2 → 1 | 干净Home第四片（统筹6517794305） | 现行问卷/回答/发布恢复结构和实体版本保留；旧Home整体搬开后新建，不转换旧数据；库起点1，不改动作版本。真实重建未开始。 |
| `pages/pages.db` | 2 → 1 | 干净Home第四片（统筹6517794305） | 当前文稿/评论/发布恢复完整DDL保留；旧Home整体搬开后新建，不升级旧库；新建/重开及拒绝见本片，真实重建未开始。 |
| `search/search.db` | 2 → 1 | 干净Home第四片（统筹6517794305） | 现行索引结构保留，元数据起点1；仍按既有派生缓存合同在缺失/损坏/版本不符时重建，从事实owner获得相同结果，不迁移业务库。真实Home未操作。 |
| `memory/memory.db` | 4 → 1 | 干净Home第五片（统筹6517794305） | 原storage/Host/SDK显式采用路线已取消，工具/演练删除；现行DDL不变，新Home完整reviewed偏好，旧账本错版和不完整设置仍拒绝。SDK内部shape不改；真实重建等全部代码就绪后用户“开始”。 |
| `server/server.sqlite` | 2 → 1 | 干净Home第六片（统筹6517794305） | 现行IM/身份/传输完整DDL归1，错版与错结构在可写打开前拒绝；旧邀请转换工具/演练删除，旧Home整体搬开后新建，真实未开始。 |
| `feed/secrets.json` | 2 → 1 | 干净Home第六片（统筹6517794305 / 6518340875） | 只改外层文件格式号；AES-GCM、AAD、Home绑定及缺原key拒绝保持，不改Keychain或SDK内部形状；旧Home整体搬开，真实未开始。 |
| `config/mcp-tools.json` | 3 → 1 | 干净Home第六片（统筹6517794305） | 现行逐客户端/动作精确授权字段归外层1，权限与撤销保持；旧Home整体搬开后用户重授权，不转换旧授权。 |
| `shelf/catalog.json` | 2 → 1 | 干净Home第六片（统筹6517794305） | 当前item/job/clipboard字段不变，外层1；旧转换工具删除，坏格式不补造；旧Home整体搬开后新建。 |
| `connectors/connectors.db` | 2 → 1 | 干净 Home 连接库片（统筹 #1332 6520836999） | [本片规格](../../specs/archive/repository-anti-corruption/slices/clean-home-connectors.md)；保留现行完整DDL（含授权结果表），旧库不迁移，用户批准开始后整份Home搬开重建；当前只有代码候选和临时Home验证，真实Home未操作。 |
| `shelf/catalog.json` | 1 → 2 | 2026-11-04 personal/main 集成 | 保留 personal 的现行目录形状与完整文件指纹，由 Shelf 统一读写并核对字段。版本 1 拒绝且保留原件，不迁移真实目录。 |
| `projects/<project_id>/molis-work.db` | 1 → 17 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/<project_id>/molis-work.db#coding` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/<project_id>/molis-work.db#feed` | 1 → 2 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/<project_id>/molis-work.db#goals` | 1 → 2 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/<project_id>/molis-work.db#inbox` | 1 → 2 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/<project_id>/molis-work.db#schedule` | 1 → 2 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/catalog.db` | 1 → 26 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `plugin-runtime/plugin-runtime.db` | 1 → 4 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `issues/issues.db` | 1 → 4 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `form/form.db` | 1 → 4 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `cognia/cognia.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `dataset/dataset.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `images/images.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `jelly/jelly.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `lingguang/lingguang.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `pages/pages.db` | 1 → 4 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `ppt/ppt.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `todo/todo.db` | 1 → 4 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `workflows/workflows.db` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 → 3 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `characters/characters.sqlite` | 1 → 4 | 2026-11-04 personal/main 集成（personal `e33e1ade4`、main `8de0b0740`；本次合并提交） | 将个人同步技术表合入现行 owner 完整基线，版本取两分支已用编号以上；只验证隔离新 Home 和旧库拒绝，未维护真实 Home。旧 Home 不自动升级，安装前须另行明确维护或新建方案；本轮只合代码，不更换运行中的应用。 |
| `projects/<project_id>/molis-work.db` | 1 → 2 | 第 05 批 #1979（项目目录合同：去掉浏览目录设置、加材料最近使用） | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE#1→2` |
| `projects/catalog.db` | 1 → 2 | 第 05 批 #1979（项目目录合同：工作目录的输入、输出两种角色取代 `is_default`，加来源链接表） | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION#1→2` |
| `projects/<project_id>/molis-work.db` | 2 → 3 | 第 15 批 S-1（2026-11-08 用户批准，已随 `b819373250` 合入）。新建空 `surface_corrections`，保留 1→2；v2 金样 `0.1.1-dev.1` 已生成并复现，候选回放随本批验证；不操作真实 Home。 | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE#2→3` |
| `projects/<project_id>/molis-work.db#goals` | 1 → 2 | 第 24 批（逐项依据合同：判断记下所核对的版本、依据与可信层级，结论记下它针对的版本；只加列，旧行按「自述」读） | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE_V4#1→2` |
| `projects/catalog.db` | 2 → 3 | 2026-11-08 日报 A 类 D0057/D0273；删除退役空表，非空拒绝并保留原库 | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION#2→3` |
| `projects/catalog.db` | 3 → 4 | 第 12 批（项目规则的信任：新表 `project_instruction_settings` 记读取开关与本人确认的输出，外键随项目删除；只建表） | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION#3→4` |
| `memory/memory.db` | 1 → 2 | Memory V0 收口（#2020，BL-1071；用户 2026-11-07「不管旧的，不考虑迁移，只做新的」）：记忆改存 SDK 索引库，旧记忆不搬；账本里关于旧记忆的记录清空，归属标题和所有开关保留，新增的按类别限制补为空（用户 2026-11-11 定），下次启动删除两个旧布局记忆目录并建新的空遗忘文件 | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE#1→2` |
| `projects/<project_id>/molis-work.db#schedule` | 1 → 2 | 第 25 批第 1 项（错过的运行：晚过宽限的任务记一行错过、照常排下一次，加错过表） | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE#1→2` |
| `projects/<project_id>/molis-work.db#feed` | 1 → 2 | 第 25 批第 1 项（错过的拉取：晚过宽限的来源不拉、记错过、推到下一时刻，加错过表） | `plugins/native/feed/src/database.ts#FEED_PROJECT_DATABASE#1→2` |
| `projects/<project_id>/molis-work.db#goals` | 2 → 3 | 第 17 批 #2058（顾虑引用对象 `cited_subjects`，删 `blocking_risks`） | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE_V4#2→3` |
| `projects/<project_id>/molis-work.db` | 3 → 4 | 第 39 批 APR-19，项目库备份后在同一事务交接平台决定、项目规则、Goals 库登记与同步集合。用户 2026-11-14 批准隔离验证。 | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE#3→4` |
| `projects/<project_id>/molis-work.db#schedule` | 2 → 3 | 第 17 批 #2058（一次性对象任务 `repeat`／`run_at`／`subject`） | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE#2→3` |
| `projects/<project_id>/molis-work.db#goals` | 3 → 4 | 第 41 批第 2 项（用户 2026-11-14：规划与拆解方法是随系统自带的技能，和 Goals 没有关系，不迁移）：删 `planning_method_packs` 表和 `goal_event_config_versions.adopted_planning_json` 列，升级段声明 `reduces_rows`；同批删掉 Goals 的 Home 库 `goals/goals.db`（宿主 `REMOVED_HOME_STORES`，升级轮里连目录删除，个人方法不搬） | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE_V4#3→4` |
| `projects/<project_id>/molis-work.db#goals` | 4 → 5 | 第 39 批 APR-19。平台项目库 3→4 时，Goals v1～v3 先完成原步骤，v4 直接交接决定和规则。保留既有物化、原身份和出处。用户 2026-11-15 批准隔离验证。 | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE#3→4` |
| `memory/memory.db` | 2 → 3 | 第 31 批合后复查 #2087（2026-11-15）：权威正文与有界历史快照归 Prologue SDK 唯一持有（变更流/配对/候选的显示副本不是事实主人），账本 `memory_revisions.body` 升级清洗为 `{version, change, by, at}` 无正文归因并移除非 `pending` 的 `memory_markers.body` 中 `$.merge`，收紧现行读取校验 | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE#2→3` |
| `observation/observation.db` | 1 → 2 | 第 30 批（新增评测样本留存表 `evaluation_holds` 与 `evaluation_hold_records`，留存记录与证据快照豁免到期与手动清理） | `horizontal/observation/src/schema.ts#OBSERVATION_BASELINE#1→2` |
| `agent-definitions/agent-definitions.db` | 2 → 3 | 第 42 批 #2107（用户 2026-11-16 批准：新增技能草稿 `skill_drafts`、已知答案 `skill_cases`、回放 `skill_trials`、来源 `skill_lineage` 四张空表，已有的技能设置与用量不动） | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE#2→3` |

## 4. 阶段二：起点之后，读取兼容

起点之后，对第 1 节任何一项做破坏性变更（删字段、改字段含义、收窄取值、改名），按下面做。只加可选字段、放宽输入的变更不算破坏性，照常做。

1. **写变更说明**：`specs/<task>/spec.md` 或 PR 描述写清变了什么、为什么不能只加可选字段、影响谁。
2. **升版本，新旧并存**：新形状用新版本。能力注册新的 `version`，同一个 id 的旧版本继续可调用到窗口关闭；Home 的库加一段 `from → to` 的升级；插件 Manifest 按 SemVer 升主版本，并在 `upgrade_compatibility` 里写清哪些来源版本可以直接用、哪些可以迁移。
3. **读取兼容，写入严格**：读取时接受旧版本并映射成新形状；写入只产生新版本。结果合同回显已存历史时，接受历史取值，写入侧不接受。
4. **消费者清单**：窗口开始时列全：仓库内的调用方（用 `git grep` 找能力 id、工具名、导出名）、外部消费者（使用 MCP 工具的 Runtime 与 Skill）、已安装的插件（用户 Home 里的发行物，创作台生成的插件）。每一项写：谁负责迁、迁移 PR、状态。
5. **删除条件**：每个窗口写一个可检查的条件，例如「清单里的消费者全部迁完，并且已经过一个发布版本，用户 Home 的库都已升到新版本」。条件满足后，一个 PR 删除兼容代码、兼容测试和登记行。**提议：** 兼容代码旁放带窗口编号的标记，登记表（第 6 节）有对应一行，门禁据此放行（第 5 节）。这是本文的提议，没有经过用户确认；`AGENTS.md` 要求新增兼容机制先写进本文「当前保留机制」并经用户确认，所以起点之前要先过这一步。
6. **合同测试**：窗口里每一段兼容配两个测试：旧形状被读取并映射成新形状；写入只产生新形状。关窗口时和兼容代码一起删。
7. **插件回放**：合同或运行时的变更，用存量插件样本回放，确认它们仍能加载（解析 Manifest、校验授权声明）、升级（按 `upgrade_compatibility`）、运行（调用一个动作）。工具是 `scripts/replay-plugins.mjs`（在构建好的工作区上跑，每个样本一份临时 Home），样本集在 `tests/fixtures/replay-plugins/corpus.json`：`examples/plugin-sample`、按 `pnpm pack` 打包的内置插件 text-stats（在它自己的位置上以打包的代码升级）；W4-01 的两个真实来源样本也已入库：MiniMax 生成的计数器，以及模型生成后端加用户批准人工验收／文案适配的清单，各目录 README 保留来源与失败边界。签包样本走真实 CLI 预览／确认 pin、同安装兼容升级和 Host 关闭重开；macOS 已有两份独立回放结果，其它平台明确报告 unsupported，不能把未运行算通过。原始模型源码是 source.json 数据夹具，回放只执行已签包中的真实 bundle。`tests/replay-plugins.test.ts` 跑它，并确认坏样本会失败。把回放结果贴在 PR 里。
8. **PR 里写清楚**：公开 API 有没有变（快照 diff）、版本怎么变、消费者列表、删除条件。`.github/pull_request_template.md` 有对应的栏目。

## 5. 起点之前要先有的东西

起点一到就要能用，所以这些要在起点之前就位。进度以 `specs/archive/repository-anti-corruption/spec.md` §10 为准：

- 公开 API 快照（`packages/contracts` 各子路径和 `packages/plugin-sdk`，以及别的工作区包的 `./contract`，第 27 批起）：**已就位**（路线图 W1-04，门禁见第 3 节第 6 条）。导出一变必须显式 `pnpm api:update`，PR 里写影响。
- 动作合同快照（每个内置 Manifest 的 `capability@version`、提供方和 schema 哈希，进 `pnpm test:contracts`）：**已就位**（路线图 W2-15，门禁见第 3 节第 6 条）。阶段一形状变了而版本没变，检查仍逐条显示差异，PR 写清对已保存引用和调用方的影响。阶段二按第 4 节的规则升版本。
- 插件回放工具与样本集（路线图 W4-01）。
- **提议（未经用户确认，见第 4 节第 5 条）：** 兼容标记门禁改成允许「带窗口编号、登记表里有对应行」的标记，其余仍只许减少。现在的门禁一律只许减少，起点之后的第一段兼容会被它拦住；放宽门禁要另开 PR，改 `tooling/gates/` 与门禁脚本，请求 @yijunw0212 评审。
- 版本策略落地：根包、桌面端、Tauri 与内置插件 Manifest 跟同一个产品版本，发布检查单带各库的版本表（2026-10-08 已定，见第 2 节）。

## 6. 登记表

当前开着的兼容窗口：**没有**（阶段一不留兼容期）。起点之后，每个窗口一行：

| 窗口 | 合同 | 旧 → 新 | 消费者清单 | 删除条件 | 负责人 |
| --- | --- | --- | --- | --- | --- |
| （空） | | | | | |

## 7. 已决与还开着的

已决（用户 2026-10-08，路线图待决 #15）：起点是第一个装到开发机之外的版本，日期到时写进本文。没有选的两个方案：现在就对已有外部消费者的合同开始（Casebook，Runtime 使用的 MCP 工具名）；各合同的主人在发布它时各自开始。补充（用户 2026-10-29）：「1.0.0 之前都是开发版本」，现行 0.1.0 候选和原 0.3.0 候选均不是第一个外部版本，起点不早于 1.0.0；发版（W5-15 余下）不算进防腐完成标准。

Casebook 已于 2026-10-10 按用户决定删除，不再有对外合同 id；以后重做时按本文重新登记。起点之前，改外部已经在用的名字（如 Runtime 用的 MCP 工具名）是产品决定，先问用户（第 3 节第 5 条）。

还开着的：

- 起点那天要把版本号、日期和提交写进本文顶部，并把第 3 节标为已结束（还没到）。
- 第 4 节第 5 条与第 5 节里标了「提议」的两处，起点之前要经用户确认。
- 第 5 节列的前置还没做完。

## 8. 阶段一已做、对插件作者有影响的合同改动

- 2026-11-08，D0038（用户选择 D）：工作台页面改为 `molis-work-page-session` meta 与 `x-molis-work-page-session` 请求头，只传 HttpOnly 会话配对的 CSRF 证明；账号状态从返回 `viewToken` 改为非授权的 `viewScope` 修订标识。页面不得依赖宿主控制令牌或把证明当作进程凭据；共用 UI 请求助手及 socket 消费者同期更新，旧页面须刷新。不新增读取兼容。CLI/MCP 的私有控制认证、独立客户端证明和原生身份保持各自检查；动作 id/schema、Manifest 与持久库版本不变。见 [实施及验收](../../specs/archive/daily-quality-d0038/spec.md)。

只记插件作者要知道的改动（不是兼容窗口，阶段一不留兼容期）；新的写在最后。

- **`PluginDatabaseTransaction.savepoint(body)`**（PG-094 S10/S11，S-67 暂定号，落地时重编）：事务句柄多一个**必需**方法，让插件撤销事务的一部分而不结束事务。`body` 同步返回 `{ keep, value }`，`keep: false` 或抛错就撤销这一点之后的写入（含项目日志里的事件与提交后效果），嵌套的点只撤销自己。点的名字由平台生成，插件不发 SQL。对既有插件：用平台给的事务句柄的不受影响；**自己实现 `PluginDatabaseTransaction` 的**（把自己的库包成这个类型，如 Jelly 的商店、测试替身）要补这个方法，`tests/fixtures/plugin-database.ts` 的 `memoryPluginDatabase` 已补。沙箱插件的语句通道（`project_statements`）没有它。
- **项目日志的只读句柄多了 `getIdempotency(actorId, operation, key)`**（PG-094 S9-1/S11）：此前只有写句柄能读自己存的幂等记录，查询路径（只读窗口）读不到，Goals 的重放读取要在查询里用，所以读句柄也有了；写句柄原有的签名不变。自己实现 `PluginJournalReader` 的（测试替身、沙箱适配）要补这个方法。记录仍按调用的 `actorId` 隔离，别的人读不到。
- **`services.attention` 与 `services.contextLedger`，权限 `attention:read`/`attention:write`、`context-ledger:read`/`context-ledger:write`，Manifest v2 的 `attention: { subjects }`**（PG-087、PG-094 S9-0b）：新增、可选，没声明对应权限的插件拿到的是 `undefined`。写入加入插件当前的项目事务；对象的所有者（`owner_plugin_id`）由安装的可信 Manifest 记下，不从调用者输入读，`subjects` 只能是平台的封闭列表（`feed_item`、`goal_decision`、`source_fault`）里的种类。Attention 的条目与事件记录多一个**必需**字段 `owner_plugin_id`（`string | null`，null 是明确的「未指派」），`AttentionSubjectType` 改成上面的封闭列表，`deleteSubject` 多一个可选的所有者参数。自己构造这些记录的代码（测试替身）要补字段。
- **页面与管理入口给出处，同一个写法（`user_action.message_ref` 一律 `web:<键>` / `management:<键>`，整份确认走请求头 `x-molis-work-whole-confirmation: 1`）**（PG-029 后半、PG-008 Goals 部分，PG-094 S12）：出处由宿主入口（`apps/local-host/src/entry-user-action.ts` 的 `entryUserAction`）给，不再各动作手写；页面一次请求的 `message_ref` 取该请求已有的一次性键（`x-molis-work-idempotency-key`，同一次操作的重试用同一把），管理入口取命令的 `idempotency_key`。此前存下来的决定记录里的 `web-decision:<键>`、`web-event-decision:<键>`、`management-tree-decision:<键>`、`management-event-decision:<键>` 不改（读取不兜底，也不用它们比对），之后新存的是新写法。树决定的"整份确认"此前由请求体里的 `confirm_all_pending` 带出，现在页面入口只认请求头，只有 Goals 方案页的"确认整份"控件会发；页面入口的权限不再手写，按每个动作在 Manifest 里声明的权限与已运行安装的授权逐请求求解（`localWebActionContext`）。
- **结构提案的决定，请求身份不再含 `conversation_ref`、`message_ref`**（PG-094 S12）：这两个是入口给的审计定位，不是"决定了什么"；页面入口的 `message_ref` 现在取该请求的传输键，同一个业务键换一把传输键重试，仍重放原结果（`HTTP goal-tree decisions replay the original result with a stable business key` 照旧通过），同键不同内容仍被拒。决定记录里照旧存原来那条的定位。
- **`artifacts.links` 多声明权限 `goals:read`**（PG-094 S12；**已被取代**：现状只要 `artifacts:read`，取标题改由下面 BL-646 那条的 link_subjects 做）：该动作为"交付它的 Goal"取标题，现在以调用者的身份问 Goals 的目录（`goals.directory.read`），不再经宿主私路读 Goals 的库；取不到就退回只显示 Goal id。调用它的客户端（页面、助手、MCP、工作流）要持有 `goals:read`；本机所有者与已安装 Goals 的项目照旧有。动作合同快照里 `artifacts.links` 一行的 `谁能调` 随之变，输入输出形状不变，版本不升。
- **`artifacts.links` 的输出按声明链接的插件分组，新增「链接对象的名字」合同**（BL-646，T-113，2026-10-30）：输出从 `{ goals: [{ goal_id, title, role }], other }` 改成 `{ plugins: [{ plugin_id, plugin_title, objects: [{ id, title, role, proposal, open: { surface, id } }] }], other }`，`role` 只有 `input`、`output`，「提议的」另由 `proposal` 说；此前凡是命中已声明种类的边都被当成 Goal 列出、用 Goal 的目录查名字。名字与打开位置由声明那个链接种类的插件自己答：`platform/actions` 新增 `defineArtifactLinkSubjectsAction`、`isArtifactLinkSubjectsAction`（插件作者从 plugin SDK 取 `defineArtifactLinkSubjectsAction`、`ARTIFACT_LINK_SUBJECTS_BATCH` 和三个类型）（输入 `{ ids }`、输出 `{ objects: [{ id, title, open }] }`，按 input/output 类型识别），宿主以调用者身份调它，只收问过的 id；没有这个动作、调用失败或调用者读不了的，显示 id、按边的 `source.module` 打开。link_subjects 的受众与 `artifacts.links` 相同（user、agent、workflow、mcp），因为它以 `artifacts.links` 的调用者身份被问：MCP 或工作流调用方要同时被授予声明方的 link_subjects 才看得到名字（与此前要有 `goals.directory.read` 一样），没有就只看到 id。一次最多 200 个 id，成果库分批问；声明方给的 `open` 只认它自己的 surface，别的退回边的 module。被拒（`forbidden`、`not_found`，以及 MCP 客户端没被授予命名动作时的 `mcp.action_revoked`）就是「读不到」的回答，显示 id、不写日志；其余失败写进宿主日志（`artifacts.link_subjects_failed`）再显示 id。Goals 声明 `goals.artifacts.link_subjects@1`（`goals:read`）。**为什么不升 `artifacts.links@2`**（§3 第 6 条）：仓库里没有固定 `artifacts.links@1` 的工作流模板、场景或绑定，唯一调用方是宿主成果页，本次已改；阶段一没有要保留的 Home 数据；同版本换输出形状有先例（batch-25 #1194 的 `goals.subject.read@1` 等）。开发 Home 里固定了它的工作流会读到新形状，已写进 CHANGELOG 升级须知。动作合同快照里这一行的输出哈希随之变。**声明了 `artifacts.links` 的插件**要声明自己的 link_subjects 动作，否则它的对象只显示 id。本条取代上面 PG-094 S12 那条的取标题方式。
- **`knowledge.locate` 升 @3，输出多一个 `omitted`；`platform/model-prompts` 新增 `MODEL_DATA_MAX_CHARS`**（T-132，RAC-2496～2499，2026-10-30）：选节时交给模型的分节树按整节放进宿主文字模型端口的数据位（`MODEL_DATA_MAX_CHARS` = 180,000 字，按码点数；此前端口的 `PROMPT_MAX_CHARS` 里直接写数字），每份轮流放、从分节树开头连续放，放不下的节整节不进、不截半节；`omitted` 是读到的分节树里没交给模型的节数（含每份 300 节之外的），0 也返回。按上限算五份分节树能到 23 万字以上，此前整次调用被端口拒绝。**为什么升版本**：输出 schema 是 `additionalProperties: false`，多一个必有字段就是形状变了（§3 第 3 条），不留 @2。仓库里没有固定 `knowledge.locate@2` 的工作流模板、场景或绑定（只有归档 spec 写过这个 id）；Agent、MCP 和工作流调用方读到的输出多一个整数字段，MCP 工具名不含版本、不变；开发 Home 里固定了 @2 的工作流引用会报错并保留，要重选，已写进 CHANGELOG 升级须知。`KnowledgeLocator` 的类型不变（它收到的输入已经放得下）；宿主的 `knowledgeModelLocator` 改用 `knowledgeLocateData(input)` 作数据，与 `locateSections` 量的是同一个字符串。动作合同快照里这一行换成 @3。
- **`goals.board.initialize` 采纳启动时代做的看板**（PG-094 S12）：Goals 在项目启动时用根行代为开板（先于任何人要它）。人第一次明确初始化（如 `molis-work v1 init` 开一个目录库之外的库）时，若看板正是这一次启动时做的，就当作这次调用要的看板回答，并记成这次调用自己的回执（重试重放）；更早的运行或更早的调用做的看板，照旧以 `goals.board.exists` 拒绝。

- **Manifest 的 `attention.inbox`：插件声明哪些种类的条目是人的 Inbox；Inbox 读取入口改按声明解析；Feed 不再能开 `goal_decision` 条目**（PG-094 S12，RAC-806～809，统筹 2026-10-25 定）：`attention` 在 `subjects` 之外可选地加 `inbox`（`subjects` 的子集，不空、不重复）；`AttentionQuery` 加 `listInbox(projectId, declared)` 与 `getInbox(projectId, entryId, declared)`，`declared` 是 `AttentionInboxDeclarations`（主人插件号 → 它声明的种类）。Inbox 是未归属条目，加上「主人声明了该种类」的有主条目，别的一律不解析（声明只对声明者自己的条目生效，A 声明的种类不会让 B 的条目出现）。宿主从项目库里运行中的安装、按发行物归档里的 Manifest 读出声明（`apps/local-host/src/plugin-inbox-declarations.ts`），Feed 的 `listInboxEntries`、`getInboxEntry`、`setInboxEntryStatus` 经 `FeedApplicationPorts.inboxDeclarations` 调这两个查询，代码里不点名任何插件。Goals 的 Manifest 声明 `inbox: ["goal_decision"]`。停用、卸载或发行物未归档的安装不贡献声明。同时 Feed 不再读 Goals 的表，`inbox.add` 一类入口对 `goal_decision` 一律以 `feed.invalid_transition` 拒绝（提醒由 Goals 自己开）。调用方的影响：不声明 `inbox` 的插件，它的有主条目不进 Inbox（照旧只经 `services.attention` 读）；想往 Inbox 手动加一个 Goal 的客户端会得到拒绝，没有正常路径依赖它。
- **没有 Home 的 Host，项目插件名单里不含声明 Home 库的插件**（PG-094 S12）：Goals 声明了 Home 库，没有 Home 的 Host 原先整张名单被 `assertDatabaseEntries` 拒绝而全部起不来，现在只是 Goals 不在名单里、其余照常启动。产品里的 Host 都有 Home，不受影响。
- **`services.artifacts.join(tx, write)` 与 `PluginArtifactWriter`；Feed 六个动作多声明 `artifact:write`**（RAC-510，S-100 暂定号，统筹 2026-10-27 批）：`PluginArtifactClient` 多一个可选方法 `join`，只给有项目库的插件，没有项目库的拿到的是 `undefined`。`write` 同步拿到一个 `PluginArtifactWriter`（`head`、`publish`）；它钉的成果版本是插件当前项目事务的一个保存点，和插件自己的行一起提交、一起回滚，日志事件也在同一个事务里，事务结束后写入器失效。写入器每次 `head`、`publish` 都问 S-68 那道门：安装在跑、持有 `artifact:write`、原调用方仍有效，调用是声明了 `artifact:write` 的可等待并行动作。产出者、作者（原调用方的 `audit_actor_id ?? actor_id`）、项目和范围由平台盖，类型照 Manifest 的 `artifacts.produces` 核。原有的 `services.artifacts.publish` 不变。调用方的影响：`feed.sources.sync`、`feed.sources.tick`、`feed.sources.wake`、`feed.notifications.receive`、`feed.rules.evaluate`、`feed.content.receive` 多声明 `artifact:write`，`feed.content.receive` 另多声明 `attention:write`（FI-C-08）；调用它们的客户端（页面、助手、MCP、工作流、场景）要多持有这几项，不留兼容期。动作合同快照里这 6 行的 `谁能调` 随之变，输入输出形状不变，版本不升。
- **动作工厂的版本必填；`compareCodeUnits`**（第 02 批 N34-VS、N4，#1837）：20 个 `define*Action` 工厂的签名变成 `(id, version, …)`，`createActionDefinition` 的末位 `version`、`defineWorkExecutorAction` 的 `options.version` 也必须传。插件作者的每个调用都要补版本：写错位置时 TypeScript 编译失败，JS 作者过不了声明检查。插件开发包新增 `compareCodeUnits(a, b)`，按 UTF-16 码元比较，不随语言环境变化；摘要、签名和幂等排序都用它。
- **`host.returns`、`host.connectionNeed` 可用；SDK 的 `renderReturnBar`、`renderResumePrompt`；`molis-work:place-changed` 多 `cover`**（第 12 批第 3 项草稿与返回、第 13 批④c-2，`specs/draft-and-return/spec.md`）：`UiPluginClientHost` 多一个**必需**成员 `returns`（`go(need, carry?, { signal? })`、`arrived()`，类型 `UiPageReturns`、`UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome` 从 `platform/ui` 与 SDK 入口取，`carry` 的上限是 `UI_RETURN_CARRY_LIMITS`，按码点计、不许为空）；`host.connectionNeed` 从固定拒绝变成真实实现，签名不变。插件作者只调用这两个成员；自己写宿主替身（测试里的假 host）的要补上 `returns`。SDK 的 `@molis-ai/molis-work-plugin-sdk/ui` 新增 `renderReturnBar`（设置顶上的返回条，外壳用）与 `renderResumePrompt`（回到原处后问一句「接着做」，插件放位置、给文字，不自己画）。页面事件 `molis-work:place-changed` 的 detail 多一个 `cover`（缺省读作 `null`），已有监听方不受影响；新增 `molis-work:layout-holds`、`molis-work:return-claim`、`molis-work:return-settled` 三个外层文档事件，只给外壳与框架宿主用。都是新增，不需要升级须知。
- **N39 合同复位与工作执行方协议（第 02 批复查修复，[#1960](https://github.com/molis-ai/molis-work/pull/1960)）**：在原版本上改，不升版本。
  - **改成必填：** `CodingFileChange.review`、`CodingChangeSet.origin` 与 `coverage`，以及 `AgentMcpToolRef.version`、`configuration_version` 和 `AgentMcpSourceRef.configuration_version`。Coding 是 `type.coding.changeset` 唯一的写入方，一直写全；自己产出这种成果的插件要写全。MCP 引用缺这两项，此前在 MCP 校验时就被拒。
  - **删掉的：** `CodingChangeScope` 的 `workspace-current`；没人用的 `AgentRuntimeAdapter.mcp?`、`AgentMcpCapability`、`AgentMcpServerHealth`；`UiSlotDescriptor.version`（槽位不带版本，带了也不读）。
  - **工作执行方协议：** `session.read` 的输出里，`mcp_tools` 每项多两个必填字段 `version`、`configuration_version`，所以 `coding.executor.session.read@1` 同版本改了形状；`agent.run.start@1` 也同版本改了形状，原因是上面的 `AgentMcpToolRef` 必填，不是执行方协议。SDK 在 Manifest 校验时把执行方声明和规范 schema 逐字比较，按旧合同打包的第三方工作执行方插件会被拒，要按新合同重新打包。
  - **其他：** contracts 新导出 `WORKFLOW_CONTENT_OUTPUT_VERSIONS`，值和原先两份副本相同。
- **判断规则的编辑动作必带 `expected_updated_at`；`functions.authoring.get` 对插件开放**（第 05 批 N14，AIC-01～16，#1961）：
  - `functions.authoring.update`、`preview`、`publish`、`delete`、`sample.add`、`sample.remove` 的输入改为必须带读取时的版本 `expected_updated_at`（非空字符串，取读到的记录的 `updated_at`），旧字段 `updated_at` 不再接受。其中 update、preview、publish 本来就对 `plugin` 受众开放，插件调用时同样要带。
  - 版本过期得到 `functions.draft_stale`，样例不在得到 `functions.sample_not_found`，已发布后读到的不是发布的那一版得到 `functions.published_immutable`。
  - `functions.authoring.get` 的受众加了 `plugin`，权限和 `list` 一样是 `functions:manage`。插件收到 `draft_stale` 后用它读回最新记录，就地接住（Feed 的规则页就是这样做的，界面写法见 `docs/design/rule-stale-reload/README.md`）。
  - `updated_at` 只随定义内容变化，试跑、样例、发布不推它。
  - 都在原版本上改（§3 第 3 条），MCP 工具名不变。动作合同快照里 6 行的输入哈希、`get` 一行的「谁能调」随之变。
- **`projects.directories.*` 取代 `projects.workspaces.*`、`projects.workspace.read` 和浏览目录设置；`is_default` 改 `roles`**（第 05 批 #1979，路线书 05 ②，`specs/shared-sources-and-surfaces/spec.md` §3、§8）：项目的文件夹分成输入（只读，可多个）和输出（唯一，可写），都在原版本 @1 上改，旧名不留（§3 第 3 条）。
  - **删掉的动作：** `projects.workspaces.add@1`、`projects.workspaces.repair@1`、`projects.workspaces.unlink@1`、`projects.workspaces.list@1`、`projects.workspace.read@1`（首选工作区，没有替身：要输出目录就取 `roles` 含 `output` 的那一项）、`projects.settings.workspaces.read@1`、`projects.settings.browsing-workspace.read@1`、`projects.settings.browsing-workspace.select@1`；项目库的表 `project_browsing_settings` 也删了（项目库升到第 2 版）。
  - **删掉的导出（contracts `modules/projects`）：** `projectWorkspaceActions`、`projectsCapabilities`（`listWorkspaces`、`readWorkspace`）；`projectSettingsCapabilities` 的 `workspaces`、`browsingWorkspace`、`selectBrowsingWorkspace`（只剩 `runtime`、`selectRuntime`）；类型 `ChangeWorkspaceProjectInput`、`RepairWorkspaceProjectInput`；`ProjectsCommandApi` 的 `repairWorkspaceProject`、`setWorkspaceDefault`、`removeWorkspaceMembership`；`ProjectsQueryApi.preferredWorkspacePath`；错误码 `catalog.context.workspace_default_unsupported`。
  - **新增：** `projectDirectoryActions`：`projects.directories.get@1`（读；受众 `user`、`plugin`、`agent`、`mcp`、`workflow`；输入是空对象；输出 `ProjectDirectories`，即 `{ project_id, directories: [{ workspace_id, canonical_path, realpath_verified, display_name, roles, state }], source_links, revision }`，恰好一项带 `output`）与 `add_input`、`remove_input`、`set_output`、`repair`、`map_source`、`unmap_source`（只给 `user`，权限 `projects:settings`，输入都带必填的 `expected_revision`，过期以 `actions.conflict` 拒绝；`set_output`、`map_source` 的目标三选一：`workspace_id`、`workspace_path`、`default_output: true`）。类型 `DirectoryRole`、`DirectoryTarget`、`DirectoryChange`、`ChangeDirectoriesInput`、`ProjectDirectory`、`ProjectDirectories`、`RunDirectories`；`ProjectsQueryApi` 多 `projectDirectories`、`outputDirectory`、`defaultOutputDirectoryId`、`workspaceIdAt`，`ProjectsCommandApi` 多 `changeDirectories`；错误码 `projects.directory_unmapped`、`projects.directory_input_only`（`directoryInputOnly`）。
  - **`is_default` → `roles`：** `ProjectWorkspaceMembership.is_default: boolean` 改成 `roles: ("input" | "output")[]`（同一个文件夹既是输入又是输出时两项都有）；目录库的 `workspace_project_memberships` 用 `role_input`、`role_output` 两列，另有新表 `workspace_source_links`（另一台设备的目录对应到本机的哪个文件夹，只在本机）。存量按上面第 3 节登记的 `projects/catalog.db` 1 → 2 升级：关联过恰好一个文件夹的项目，它成为输出（仍是输入），关联过几个的每个都是输入，没有输出的项目补上默认输出目录。
  - **默认输出目录：** 没选过输出的项目，输出是 Home 的 `outputs/<project_id>/`，目录库里是真实的一行（`canonical_path` 记为 `project-output:<project_id>`，不存路径）；文件夹第一次在里面写或运行时才建，`directories` 里照样列出，`state` 是 `ok`。`default_output: true` 把输出设回它。
  - **Git 默认在输出目录里写，输入只读：** Agent 的会话和轮次、原生 Character、终端、本机进程的 MCP、Git 的写在只作输入的目录里开会被拒（`projects.directory_input_only`）；Git 的读取在 `workspace_id` 缺省时看输出目录（见下一条）。
  - **宿主路由：** `POST /api/workspaces`、`PATCH /api/workspaces/:id/path`、`POST /api/workspaces/:id/unlink`、`GET|POST /api/project-settings/workspaces` 删掉；新增 `GET|POST /api/project-settings/directories`（POST 带 `{ change, input }`，`change` 是 `add_input`、`remove_input`、`set_output`、`repair`、`map_source`、`unmap_source` 之一，其余键 400）；`POST /api/workspaces/pick` 不变。
  - **对调用方：** Manifest `capabilities.consumes`、工作流程步骤与绑定、Skill 里写旧 id 的都要改成 `projects.directories.get`（入参 `{}`，原来是 `[]`）；MCP 工具 `molis_work_v1_action_projects.workspace.read__v1` 没有了，新增 `molis_work_v1_action_projects.directories.get__v1`（改目录的动作只给本人，MCP 调不到）。动作合同快照里，原有的 `projects.workspace.read`、`projects.workspaces.add`、`repair`、`unlink` 四行删去，新增七行 `projects.directories.*`；公开 API 快照 `modules/projects` 随之变。
- **`UiPageWorkspaces.select` 改 `setOutput`；`files.state` 与 `git.*` 的读取按页面说的文件夹**（第 05 批 #1979）：
  - `UiPluginClientHost.workspaces`（`UiPageWorkspaces`）：`select(workspaceId)`（切换当前浏览目录）删掉，项目不再记浏览目录；换成 `setOutput(workspaceId)`——宿主显示插件、项目和这个目录的名字（宿主自己读，不用页面给的），人确认后把项目已有的目录设为输出，用在「只作输入，设为输出后才能写」的拒绝旁边。`add(path)` 不变，现在加的是输入目录。页面看哪个文件夹是页面自己的状态。
  - 在原版本 @1 上改：`files.state` 的输入从 `{}` 变成 `{ workspace_id?: string }`，输出多一个必有字段 `resolved`（`string | null`，页面说的 id 在本机对应哪个文件夹）；`git.state`、`git.summary`、`git.operations`、`git.results`、`git.pr-support` 的输入从 `{}` 变成 `{ workspace_id?: string }`，`git.conflict` 的输入多可选的 `workspace_id`。`workspace_id` 缺省就是项目的输出目录，原来是项目设置里选的浏览目录；说的 id 已不在项目里时，`files.state` 与 `git.state` 退回输出目录，别的读取被拒。动作合同快照里 `files.state` 与六个 `git.*` 的输入哈希随之变，`files.state` 的输出哈希也变。
  - contracts `modules/workspace-artifacts` 多导出 `resolveWorkspaceFileSubject`、`resolveWorkspaceId`、`WorkspaceIdMapping`（读另一台设备的引用时，把它的目录 id 换算成本机对应的文件夹）；`WorkspaceFileResult` 的 `binary` 结果多带 `fingerprint`。并行写手的 `worktree_id` 等改动见 CHANGELOG 的 05 ② 一条。
- **同版本下形状变了的其他动作**（第 05 批 #1979，都在原版本 @1 上改，仓库里没有工作流、场景或绑定固定它们）：`files.open`、`files.directory` 的输出里 `binary` 必带 `fingerprint`、`unsupported` 可带（读到但解不出来；不带的是「不是普通文件」），按 `outcome` 分支的调用方不受影响，严格按输出 schema 校验的调用方要接受 `fingerprint`；`git.conflict` 输入多可选 `workspace_id`；`agent.run.start` 输入 `subagent_workspaces[].workspace_id` 改 `worktree_id`；`agent.run.read`、`agent.run.wait`、`agent.session.read` 输出多可选 `directories`（开轮时冻结的输出、输入和执行位置）；`projects.workspace.writers.{list, prepare, integration.read, integration.prepare}` 的写手工作树改用 `worktree_id`、`subagent_id` 可选；`coding.runs.start` 输入多可选 `worktree_id`。上面「新增」里的 `projectDirectoryActions` 及其类型此前已在合同里声明，本 PR 起由宿主登记（动作快照多 7 行）；真正新增的导出是 `DirectoryChange`、`ChangeDirectoriesInput`、`directoryInputOnly`。
- **`materials.recent`、`materials.recent.record`、`materials.origins`：最近用过的资料与引用的出处**（第 05 批 #1979，`specs/shared-sources-and-surfaces/spec.md` §2）：由宿主在提供方 `system.project-workspaces` 上登记（动作合同快照 `host-actions.tsv` 多三行），受众 `user`、`plugin`。`materials.recent@1` 返回 `{ items: [{ ref, origin }] }`，新的在前，每个调用方在每个项目里最多 20 份；给插件时只返回它此刻读得了的，读不了的不说是哪一个，也不数；`materials.recent.record@1` 输入 `{ refs }`（1 到 10 个 `MaterialRef`），读不了的引用静默不记；`materials.origins@1` 输入 `{ items }`（1 到 20 项，每项 `{ ref }` 或只有 `{ subject }`），按给的顺序返回 `{ items: [{ origin }] }`，读不了的 `origin` 为 null、不说原因。三个都声明 `scheduling: "concurrent"`（要等各主人答出处），`materials.recent.record` 在 `beforeEffect()` 之后提交。contracts `platform/project-materials` 多导出 `MaterialOriginQuery`、`MaterialOriginAnswer`、`MATERIAL_ORIGINS_MAX`、`MATERIAL_ORIGINS_COMPARE`、`MATERIAL_ORIGIN_NOTES`、`MATERIAL_ORIGIN_QUERY_SCHEMA`、`MATERIAL_ORIGIN_ANSWER_SCHEMA`，`modules/projects` 多导出 `materialOriginActions`；`RecentMaterial.origin` 从 `MaterialOrigin` 变成 `MaterialOrigin | null`（给本人时找不到唯一的主人就是 null）。项目库的表 `material_recent_uses`（`modules/projects` 独占）随项目库升到第 2 版新增，从空开始。

- **第 08 批：只有声明的插件、方法声明、Skill 目录与安装预览**（#1936 先合、#1984 合入，用户 2026-11-08 合并）：`AgentSkillDeclaration` 增可选 `description`、`when_to_use`、`when_not_to_use`、`applies_to`、`user_invocable`、`argument_hint`、`resources`、`connector_categories`、`native_only_reason`；Manifest `methods` 类型改为 `PluginMethodDeclaration`，`description`/`applies_to` 必填，旧三键 `{ name, purpose, body }` 的签名沙箱包明确拒绝、不读不转换（2026-11-08 用户定，作者重新打包签名；`docs/releases/CHANGELOG.md` 升级须知同文）。`plugins.install.preview@1` 在原版本上扩形状：输入支持 `bundle` 或 `bundled` 二选一，输出多 `skills`、`requires`，`agent_bodies` 只留角色；新增 `plugins.bundled.list@1`；新增 `contracts/services/skills` 子路径与 `skills.catalog.list@1`、`skills.body.read@1`、`skills.resource.read@1`、`skills.settings.set@1`、`skills.import.preview@1`、`skills.import.confirm@1`（导入登记在 `plugin-install` 提供方）；SDK 出口 `ContentPackageSkill` 改 `PackagedSkillBody`、`sandboxAgentBodyIdentity` 改 `sandboxRoleIdentity`，新增 `contentPackagePayload`、`skillFromFolder`、`readPackagedSkills`。库 `agent-definitions` 1→2 只建空的 `skill_settings`、`skill_uses`（见上文建表一步）；动作快照新增 7 行、`plugins.install.preview@1` 两列哈希变化。固定调用 `plugins.install.preview@1` 的调用方须接受新输出形状；本仓库内安装界面已同批更新。
- **（宿主侧，不影响插件作者）08 技能导入的执行控制**（2026-11-09）：`PluginRuntimeApi.upgrade` 输入、`start` 的可选第二参数增加进程内 `assertCurrent` 回调；Supervisor 与 Host 安装生命周期原样传递到异步准备之后、安装锁内及版本／运行状态提交之前。它不来自动作输入，不进 Manifest 或持久化，不增加权限；未传控制的宿主恢复路径保持原行为。取消只恢复旧安装，不记新的失败状态。`platform/plugin` API 快照同步，动作 schema／MCP 名称与库版本不变。验收见 [SKC-10](../../specs/skill-packs/contract-design.md#14-验收编号候选) 与 `tests/plugin-upgrades.test.ts`。
- **第 09 批：助理与 Coding 读同一份技能目录、一轮按 `SkillRef` 冻结；能力包汇总**（#2015 全批、#2019 收尾，2026-11-11；阶段一在原版本改，无兼容期，§3 第 3 条）：
  - **工作执行方协议的 `run.start` 同版本多一个 `skills`**（`packages/contracts/src/platform/work-executors.ts` 的 `WorkExecutorRunStart`）：`skills` 是 `SkillRef` 数组（至多 20 项，`SKILL_REFS_MAX`），把这一轮要用的技能交给执行方；类型版本仍是 1。第三方工作执行方要接住它：按引用把正文读进这一轮、按精确引用冻结，读不到就整轮拒绝，不悄悄换成另一个版本。它只说明「载入什么」，谁是本人点名的由宿主在 `ActionCallContext.named_skills` 里给（`manual` 的技能不在其中就拒绝）。SDK 在 Manifest 校验时把执行方声明与规范 schema 逐字比较，按旧合同打包的第三方执行方插件会被拒，要按新合同重新打包。
  - **`skills:read` 与第三方执行方**：读共同目录用插件自己的身份，要 `skills:read`（Coding 的 Manifest 同批加了这一项，内置与第三方一样）。第三方工作执行方要声明并获授予 `skills:read`，才能在自己开的一轮里用目录里给它的技能；本人已在助理里点名、由宿主绑定到这次调用的 `named_skills` 项按冻结名单读，执行方没有这个权限也能用，别的目录项不跟着放开。缺权限时目录读取被拒，这一轮不开。
  - **Manifest 的 `AgentRoleDeclaration` 删掉 `skills` 字段**（连同 `AgentRoleSkillsDeclaration`）：角色不再自带技能表，一轮用到哪些技能由共同目录（`skills.catalog.list@1`）与 `run.start` 的冻结名单给出。写了旧字段的 Manifest 声明检查拒绝；插件作者删掉它，技能写进 Manifest 的 `methods`（给别的 Agent 用）或 `agent.skills`（自己的 Agent 用）。
  - **SDK 新增 `/skill-ref` 子路径**：导出 `skillRefKey(ref)`，一个精确引用的比对键（`source.kind`、`plugin_id`、`plugin_version`、`publisher_signature`、`install_id`、`installation_generation`、`skill_id`、`version` 全部带上，两个安装里同名技能因此不会混）。页面也能引（只依赖类型）。自己比较两个 `SkillRef` 的插件改用这一个键，不另写一套字段。
  - **其他同批形状**：`ActionCallContext` 加 `named_skills`（`ActionNamedSkills`，绑定安装与动作，只由路由信封与宿主委派写）与 `skill_round`（`ActionSkillRound`，`consumer` 与冻结的 `named`）；`frozen.skills` 每项由 `{ skill_id, version }` 改为带 `ref`（`SkillRef`）、`origin`、`name`、`tools`、`named`，冻结输出加 `frozen.reply_locale`；`assistant.methods.read` 只收角色（同版本 @1，方法（技能）的正文改用 `skills.body.read`）；`SignedAgentReference` 只剩角色；删 `AgentSkillRef`、方法库端口与 `AgentSkillsCapability`（Coding 旧的 `agent.skills.discover/install/list/read@1`、`skill-selection.ts` 与方法库存储一并删除）；SDK 拒绝同一个插件的 `agent.skills` 与 `methods` 重名。
  - **快照刷新**：`tooling/gates/actions/` 与 `tooling/gates/api/` 随本批更新（`skills.*`、`kit.*` 与 `plugins.package.export@1` 等动作，`services/skills`、`platform/action-named-skills`、`plugin-sdk/skill-ref` 等公开面）。仓库内调用方（助理、Coding、Agent Host、宿主组合）同批迁完，不留旧形状；没有读取兼容。

- **第 41 批：Skill 选用、规划方法变成系统技能包、在设置里写自己的技能**（#2078 + 收尾 #2083，2026-11-15；阶段一在原版本改，没有读取兼容）：
  - **新增动作**：`skills.authored.read@1`（`system.skills`）与 `skills.authored.save@1`、`skills.authored.remove@1`、`skills.authored.draft@1`（`plugin-install`），受众只有 `user`，不成为 MCP 工具；读回、保存、删除按精确版本；自己写的技能是每个范围一个内容包（项目 `io.molis.work.my-skills.project`、个人空间 `io.molis.work.my-skills.home`），用这个 Home 的发布身份签名、走与导入同一条安装路径。新提示词 `skills.draft`。
  - **页面与轮次合同**：`ActionCallContext.skill_round` 的 `round` 与 `auto`；`SKILL_READ_REFUSALS` 加 `over_limit`；`SkillPick`、`ActionSkillRound` 的 consumer 含 `assistant|coding|agent`；`contracts/services/skills` 新增 `SKILL_PICK_CONSUMERS`、`SkillPickConsumer` 与 `isSkillPickConsumer`（页面/插件框校验同一组受众）；`AssistantRound.skills`、`AgentRunView.skill_reads`；`AssistantSendInput.auto_skills`、Agent 起跑的 `auto_skills`；`platform/dom-events` 新增 `molis:skill-pick-open`／`molis:skill-redo`。`skills.catalog.list`／`skills.body.read` 仍不成为 MCP 工具。
  - **系统自带技能包**：`plugins/content/<包>/pack-content.json` 可写 `system.default_state`，构建打到 `apps/local-host/dist/system-skills/`，目录直接读、不安装、不验签；技能正文可带 `SKILL.<语言>.md`，由 `locales` 声明。
  - **Goals 删除**：`goals.planning.catalog/read/save/apply/personal.list/personal.save` 六个动作删除；`goals.events.configure` 去掉 `adopted_planning`、`adopt_default_requirement_ids`；`goals.snapshot.read`／`goals.document.read` 不再带方法；Goals 项目库 3→4 删 `planning_method_packs` 表与 `adopted_planning_json` 列（`reduces_rows`）；Home 库 `goals/goals.db` 由升级轮连目录删除（`REMOVED_HOME_STORES`）。中间金样 `0.1.1-dev.4` 存第 3 版。
  - **页面资源**：`/assets/molis-work-kit.js` +16,528 字节；英文词包换内容寻址路径、四页英文冷启动各 +26 B（用户批准，许可文件 `skill-authoring-b41.json`、`skill-authoring-plural-b41.json`）。

- **按类型交出「接下来」与「错过」：`platform/actions` 新增 `scheduled-runs` 一组**（第 25 批第 1 项，`specs/proactive-assistant/resident-runtime-design.md` §2，2026-11-12）：四个类型 `molis.runs.window.v1`／`molis.runs.overview.v1`／`molis.runs.decision.v1`／`molis.runs.decided.v1`，声明助手 `defineRunsOverviewAction`、`defineRunDecisionAction`（作用域 `project` 或 `home`），宽限 `RUN_MISSED_GRACE_MS`（10 分钟）与上限 `RUNS_UPCOMING_LIMIT`、`RUNS_MISSED_LIMIT`。都是新增，已有的插件不用改；自己定时跑东西的插件同时声明这一对就会出现在菜单栏面板与首页的错过提示里，宿主按类型找到它、只调这两个动作，不读它的库。Schedule、Feed、助理定时三位主人同批接上（`schedule.runs.*`、`feed.runs.*`、`assistant.runs.*`，各 @1）。
- **`materials.read` 的固定版本权限**（2026-11-14）：固定成果库版本除了 action 声明的 `workspace:read`，还要求调用者持有 `artifact:read`（插件持有 `artifacts:read` 也可以），与成果库其他读者一致；快照版本仍只要 `workspace:read`。页面/助理/已声明 `artifacts:read` 的插件不受影响；只有 `workspace:read` 的插件读固定版本会被 `actions.forbidden` 拒绝。
- **第 42 批：Skill 草稿、已知答案回放、版本恢复与通用技能定制**（2026-11-16，[设计稿](../../specs/skill-packs/authoring-path-design.md)；阶段一在原版本改，没有读取兼容）：
  - **新增动作**（`system.skills`）：`skills.drafts.{list,read,create,update,revise,discard}@1`、`skills.cases.{put,remove}@1`、`skills.trials.run@1`、`skills.versions.list@1`、`skills.lineage.dismiss@1`；采用 `skills.drafts.adopt@1` 登记在 `plugin-install`。受众：`drafts.create`、`drafts.discard`、`trials.run` 给本人与助理（权限 `skills:draft`、`model:invoke`），其余只给本人；都不成为 MCP 工具。
  - **删除动作**：`skills.authored.save@1`，由采用草稿取代（技能内容只经采用改变）；`skills.authored.read/remove/draft@1` 保留。调用 `skills.authored.save@1` 的调用方改为起草再采用。
  - **目录形状**：`SkillCatalogEntry` 加 `draft`（开着的草稿）与 `based_on`（改的那份通用技能及其新版本），只给本人受众；`contracts/services/skill-placeholders` 新子路径导出 `SKILL_PLACEHOLDER_PATTERN`、`skillPlaceholders`（页面不必加载整份 `services/skills`）。
  - **库**：`agent-definitions` 2→3（见上文建表一步）。动作与 API 快照随本批刷新。

- **第 32 批结果回流：接续由运行时来问、插件会话由宿主通知、无对话来源的任务可报给助理**（2026-11-15，[事项线需求书](../../specs/work-line/spec.md) §12 当日三项用户决定，[合同设计](../../specs/work-line/contract-design.md) §9）：
  - **删掉**：`agent.collaboration.await@1`（只为 Coding 的唤醒长请求存在）；固定它的引用不再解析。助理与 Coding 的 25 秒长请求一并删去，Prologue 换到 main `02a11ac5`（`collaborationHost.startContinuation`）。
  - **新增**：定向宿主事件 `host.agent.continuation.ready@1`（载荷 `runtime_id`、`session_id`、`request_key`、`wait_id`，只发给拥有会话的那个安装；Manifest 订阅后插件用自己这次激活的权限开轮，S-continuation-start）；合同 `AgentContinuationStartRequest`／`AgentContinuationStartAnswer`／`AgentContinuationStarter`。
  - **加可选字段**：后台任务行 `reports_to?: "assistant"`（`molis.background-tasks.collection.v1` 不升版本；只认这一个取值，别的整行不收）：没有对话来源的任务办完或失败后，项目助理在主对话里起一轮只汇报、只能读（S-task-report-read-only）。两个任务提供方（`coding.background.tasks@1`、`images.background.tasks@1`）与 `background.tasks.read@1` 的输出 schema hash 随之变，形状只多一个可选字段。
  - **新角色**：助理的 `assistant-report`（read-only、不带宿主工具），只给这种汇报轮用；版本登记随 `pnpm versions:generate`。
  - **页面**：`GET /api/attention/events`（只给工作台页面，插件页 403）推「有变化」，页面再读 `/api/attention`；去掉 15 秒定时读（WLN-27）。
- **第 32 批：事项线、后台任务总表、对象引用与逐项认可**（2026-11-15，[事项线需求书](../../specs/work-line/spec.md)、[合同设计](../../specs/work-line/contract-design.md)；阶段一在原版本改，不留兼容，第三方插件要跟着改）：
  - **事件登记改名改形**：`platform/home-events` 换成 `platform/work-events`，类型 id `molis.home-events.*.v1` → `molis.work-events.*.v1`，能力 id `<插件>.home.events` → `<插件>.events`；SDK 的 `defineHomeEventsAction` 删掉，改用 `defineWorkEventsAction`。Todo、Feed、Inbox、Coding 同批改完。
  - **后台任务改形**：`platform/home-background-tasks` 换成 `platform/background-tasks`，类型 id 换成 `molis.background-tasks.*.v1`；行上的 `stop_path`（插件自己的路由）改成动作命令（只认回答方自己的动作），`standing` 拆成 `step` 与 `details`，新增必填的对象引用 `subject`、状态 `state`、`waiting`、执行者 `executor`、`serves`、`scope`、`commands`、`decisions`、`open`，可选的 `reports_to`；`defineBackgroundTasksAction` 多一个 `kinds` 参数；新增 `defineTaskServesAction`（关联 `serves` 的 list、bind、release、create 四步）。SDK 原来的 `HomeBackgroundTask*` 类型导出删掉。
  - **对象打开**：`objects.open@1`（在 `system.mainline` 上）与 `platform/object-link` 的 `objectLink`、`objectLinkTemplate`、`objectLinkAt`，打开某个插件对象的地址只有这一种写法；Shelf、Goals、Pages 等原来手拼的地址同批换掉。
  - **主线服务**：新增 `system.mainline` 的七个动作（`mainline.line.read`、`mainline.place`、`attention.waiting.read`、`background.tasks.read`、`background.tasks.command`、`background.tasks.decide`、`objects.open`，各 @1），只给本人的那几个经 `/api/mainline/*` 入口（S-work-line-person-doors、S-work-line-task-control）。`mainline.line.read` 的输出带 `table`（与 `background.tasks.read` 同形），页面画线与任务面板只读一次。
  - **要求与认可**：新包 `modules/acceptance` 与 Home 库 `acceptance/acceptance.db` 第 1 版；`acceptance.requirements.set`、`acceptance.deliveries.record`、`acceptance.reports.submit`、`acceptance.read`、`acceptance.decide`（各 @1）由 Host 装配为 `system.acceptance`；`acceptance.read` 一次读至多 32 个对象（`subjects` → `views`）；`acceptance.decide` 只给本人。
  - **后台任务回报与「每步先问我」**：`platform/actions` 新增 `BACKGROUND_TASK_DONE_STATES`（办完的三种状态，任务面板、Home 列表与助理的回报共用这一份）；`AssistantWork` 新增可选 `ask_each_step`，助理面板新增 `assistant.panel.works.ask_each_step@1`（只走面板的入口）；`ASSISTANT_NEXT_STEP_REVIEW`（`"next-step"`）是宿主自己的那种确认的 `kind`，经 `services/assistant` 读（`AssistantPendingReview` 挪进同目录的 `assistant-review.ts`，导出不变），答它仍走 `assistant.background.decide@1` 与面板的 `works.review`。Images 的生成行标 `reports_to: "assistant"`、办完或失败的那一行留 10 分钟（PWA-155、PWA-156）。
- **运行视图与助理轮次新增可选 `stop_reason_code`**（2026-11-14）：`person` 是本人停止，`host` 是 Host、护栏或运行时停止；`stop_reason` 仍是给人看的理由。Host 与工作台用它判断是否显示停止原因，不再拿译文做判断。受影响的动作输出（`agent.run.read`、`agent.run.wait`、`agent.session.read`）与公开 API 快照同批更新；动作合同快照按 schema hash 更新。
- **`/rich-text` 的 Markdown 解析器与 peer 依赖**（2026-11-13，第 27 批 #2010）：`renderRichText`／`richPlainText` 从 Marked 换成 Micromark + GFM；SDK 的 peer dependencies 从 `marked` 换成 `micromark`、`micromark-extension-gfm`、`sanitize-html`。用这个子路径的插件要在自己的 `package.json` 里改这三项；只写 `marked` 的插件在加载 `/rich-text` 时会找不到解析器。Coding 与 Feed 已改，`packages/plugin-sdk/README.md` 与插件开发 Skill 的 `ui.md`／`ui.en.md` 已同步；SDK 根入口与 `/highlight` 不受影响。
- **Runtime 配置读地址的顺序**（同上 §6，BL-108）：启动器、命令行与桌面找本机宿主时按 `MOLIS_WORK_WEB_URL` > Home 里的地址文件 `run/endpoint.json` > `127.0.0.1:4173`。Runtime 配置本身的形状不变；地址文件只指路，读的人照旧核身份，核不过就当没有。插件不读这个文件。

- **第 06 批：Files 插件退役、平台资料服务 `system.materials`、N12 Home 成果固定与 SDK 公共工具**（[#2009](https://github.com/molis-ai/molis-work/pull/2009)，`a720834a09`，2026-11-13；阶段一在原版本改，不留兼容）：
  - **删掉**：Files 插件与 `files.*` 动作（`files.state`、`files.directory`、`files.open`、`files.capture`、`files.side.entries`、`files.side.content`）；旧安装、事件游标、目录成员在采用时退役；插件 id `io.molis.work.files` 保留为不可占用。三类过程项类型 `files.collection.v1`／`files.snapshot.v1`／`files.text-selection.v1` 保留，由平台资料服务写入。
  - **新增平台产生者**：`system.materials`（`kind: "system"`）声明三类过程项、`files`／`before`／`after`／`selection` 四个输出端口，以及 `materials.open`、`materials.capture`、`materials.read`、`materials.pinned`、`materials.position`、`materials.subject.read`、`materials.files.entries`、`materials.files.content`。`materials.open/capture` 的权限与受众按 Files 原 open/capture（`artifact:read`、`artifact:write`、`storage:private`、`workspace:read`；`user`、`plugin`）；其余读动作只读。Manifest 的 `default_source` 可写 `{ plugin_id: "system.materials", port }`；`SystemOutputSource`／`SYSTEM_OUTPUT_SOURCES` 是唯一声明来源。
  - **改形状**：`molis-work:knowledge-pick` 的 `selected` 从 `{ kind, id, title }` 改为 `{ ref: MaterialRef, title }`，`molis-work:knowledge-picked` 从 `picks` 改为 `outcome + items`；`knowledge.cards` 的 `limit` 上限 200→500 并新增 `subjects`；`PluginInstalledView.pending_defaults` 必填、由宿主给；`PluginArtifactClient.join` 接受 `PluginProjectRowTransaction`；新增 `PluginDatabase.transactionProjectRow` 与 `PluginProjectRowsDeclaration.artifact_join`；新增 `ActionSceneClient.discoverScenesFor`、`PluginSceneClient.discoverScenesFor`、`ActionSceneSelection`；`AgentMaterialOrigin`／`AgentTextMaterial` 扩展；Goals 合同新增 `material_snapshot` 引用。都在原版本 @1 上改，动作与 API 快照随之刷新。
  - **SDK 只增**：`/browser` 新增 `pluginRequest`、`requiredQuery`、`textCell`、`isAbort`、`codeOf`；index 新增 `zonedParts`、`isTimeZone`、`projectRouteFields`；`/whole-units` 新增 `cutWithEllipsis`。
  - **存储与采用**：项目库同版本采用（`process_items_adopted` 日志）只在 1→2 新布局与 2→3 现行库上；同版本例外只有 `tooling/gates/schemas/same-version-exceptions.json` 的一条（v3 那对哈希）；旧布局 v2 普通打开拒绝，采用程序换日志后在同一事务走完 2→3；真实 Home 采用另授权。见上文「当前保留机制」的 Files 退役一条。

- **第 17 批：风险插件、Goals 顾虑引用任意对象、侧栏 `opens_items`、Schedule 一次性对象任务**（[#2058](https://github.com/molis-ai/molis-work/pull/2058)，`3b296a6337`，2026-11-14；阶段一在原版本改，不留兼容）：
  - **新插件**：`io.molis.work.risk` 声明 16 个 `risk.*@1` 动作（记录、读取、列表、状态、关联、进展、复查、搜索、读取器、呈现），项目库 `risk` 第 1 版；插件不调 AI，复查只登记 Schedule 任务。
  - **Goals 顾虑**：`goals.concerns.apply@1` 输入与 `concern_opened` 系统载荷多可选 `cited_subjects`（至多 8 个 `{kind,id}`，只在 open 时收）；`GoalEventConcernView` 多 `cited_subjects`；`GoalEventUnmetReason` 删 `risk_id`，Goals 里恒为空的 `blocking_risks` 死路径删除。Goals 项目库 2→3，加 `cited_subjects_json TEXT NOT NULL DEFAULT '[]'`；同步列清单和导入校验一起改，格式版本不升。
  - **Manifest**：`UiViewDeclaration` 多可选 `opens_items`（只 `side` 视图、一个插件至多一个）；SDK Manifest 检查在 `packages/plugin-sdk/src/manifest.ts`。
  - **SDK `/ui`**：新增 `renderSeverityGrid`，样式在 design-system `primitives.ts`。
  - **Schedule**：`schedule.tasks.create@1`／`update@1` 多可选 `repeat`、`at`、`subject`；`tasks.list@1` 多可选 `subject`，按对象筛时输出 `reads`（含每个类别的 provider/group/state）；任务库 2→3 加四列；便携格式在原版本加列并校验；一次性任务跑完即停、错过的运行不补跑。
  - **风险复查方法**：`method.risk-review` 正文改用 `risk.list` 的 `keyword`／`linked` 查同一件事，版本 1→2；固定引用这个方法的调用方按新版本取。
  - **调用方影响**：`risk.list@1` 原版本内把 `goal_id` 换成 `linked`，`unlinked` 改为“没关联任何对象/有关联”；风险写动作的受众含 `plugin`；Goals/Schedule 库升级只由升级链做；没有读取兼容，旧 `concern_opened` 缺 `cited_subjects` 是可选字段的缺省，不是旧形状兜底。页面资源许可见 `tooling/gates/page-asset-allowances/17-risk-plugin.json`。
- **首页主区内容：Manifest 的 `presentation.overview.lead`，`surfaces.compose@1` 的 `lead` 组**（第 19 批，WBR-22／23，2026-11-14）：声明了首页概况的插件可以再写 `lead: { view_id }`，指向本 Manifest 自己 navigator 或 stage 槽位的一个视图；装了它的项目，首页主区显示这个视图，细栏可切回基础首页，打不开或移除后回基础首页。`surfaces.compose@1` 版本不变，`home` 描述里可能多一个 `kind: "lead"` 的组（带 `lead` 与 `owner_plugin_id`，状态只有 ok，不放条目）：按 `SurfaceGroup.kind` 穷举分支的调用方要认这个值，重排描述时不能改写它。概况动作（`definePresentationOverviewAction`）的受众同时加了 `workflow`：持有 `actions:delegate` 的插件可经目录读别的插件的概况，权限检查不变。
- **第 29 批：工作记录读取与管理合同**（#2084/#2088，2026-11-15；纯增量，无读取兼容）：`packages/contracts/src/services/observation.ts` 新增 8 个 `system.observation` `@1` 动作——只读 `observation.records.query`、`evidence.get`、`coverage.get`，本人管理 `settings.get/set`、`space.get`、`cleanup.preview/apply`——及五类记录、用途、保留、占用、覆盖视图类型；合同 `io.molis.work.service.observation.v1` 的 `maturity` 由 `partial` 升为 `implemented`。既有 `observation.report@1` 输入输出与指纹 `0dd034973bce`/`8cfd08f953ae` 未变，既有插件与调用方无需改动。动作快照记在 `tooling/gates/actions/host-actions.tsv`，API 快照在 `tooling/gates/api/contracts/services/observation.txt`。合后小修 #2088 只改界面分支/内部导出/文档与测试，不改合同；合后审计收口把 `records.query@1` 的默认模拟来源过滤从 `assistant` 扩到 `assistant`／`evaluation`／`export`（`lookback` 保留并标注 `source_class`），是行为收紧，输入输出 schema、版本与快照均不变。
- **第 31 批：Memory P1（有界版本历史与恢复、导出 `state`、通用关联对象 `applies.objects`、账本 `2 → 3` 单一写主人）与 Coding `find-symbol` 角色覆盖**（#2047、#2081 及合后复查 #2087，2026-11-15；阶段一在原版本 @1 上改，不留读取兼容）：
  - **记忆适用情境 `applies.goal_ids` 改为 `applies.objects`**：`MemoryApplies`（`packages/contracts/src/services/memory.ts`）和相关动作（`memory.write@1`、`memory.change@1`、`memory.recall@1`、`memory.list@1`、`memory.page@1`、`memory.candidates.list@1`、`memory.candidates.accept@1`、`memory.candidates.discard@1`、`memory.history@1`）删掉 `goal_ids`，改为通用关联对象引用 `objects?: { plugin_id, kind, id }[]`（至多 20 项）；Goal 关联统一写成 `{ plugin_id: "io.molis.work.goals", kind: "goal", id }`。
  - **有界历史与恢复**：`memory.history@1` 改由 Prologue SDK 的单条密文记录提供最近 20 版正本投影与可选 `pruned_through_version`，恢复被裁掉的旧版返回 `memory.conflict`；`AgentMemoryCapability.history` 的 `limit`/`before_version` 现在由适配层实际裁剪，未消费者、未实现的 `restored_from_version` 从公开投影删除；`memory/memory.db` 升到第 3 版（`2 → 3` 清洗 `memory_revisions` 只留 `{version, change, by, at}` 无正文归因，并清掉非 `pending` 的 `memory_markers` 里的 `merge` 暂态字段，现行读取拒绝残留 `text`/`snapshot`）。
  - **记忆包交换**：`molis.memory` 导出包（阶段一信封 `version: 1`）条目新增可选 `state`（`disabled`/`paused` 及其原因与时间）并使用 `applies.objects`；未知版本、同时含 `disabled` 与 `paused`、空白或超长原因，以及含已退役 `applies.goal_ids` 的包在写第一条前整包拒绝。`AgentMemoryCapability` 去掉未消费的 `exportScope`/`importScope` 窄口方法，公开 API 与动作快照同批刷新。
  - **Coding 代码智能 `find-symbol`**：Coding 全部 7 个主角色（`planner`、`reviewer`、`writers`、`builder`、`writer` 角色版本 `1 → 2`；`reader` 与 `coordinator` 已在 #2047 升至 `2`）均声明 `find-symbol`（工作区子代理角色 `coding-reader`、`coding-reviewer`、`coding-builder` 沿底座目录模式的系统工具上限不挂会话包工具）；符号位置统一输出相对本轮授权根的 POSIX 路径。

- **第 33 批：Coding 与材料恢复闭环的公共合同**（#2082，`91962f651c`，2026-11-15；阶段一在原版本 @1 上扩展，无读取兼容）：
  - **上下文与窗口**：`AgentCompactionDeclaration` 多可选 `window_ratio`（0 到 1，声明后按有效窗口计算压缩阈值；不声明沿用固定 `above_tokens`）；`PluginStartContext` 多可选 `host_started_at`（宿主启动时刻，Coding 据此判断中断，不再读子进程 `process.uptime()`）；`AgentRunBudget` 多可选 `context_window_tokens`。
  - **估点与进度**：`AgentExecutionPlan` 的节点多可选 `parent_id`、`story_points`、`estimate_source`、`estimate_reason`；`isValidFibonacciStoryPoints` 是唯一校验（正整数、无硬封顶，89/144 合法），`FIBONACCI_STORY_POINTS` 只是常用预设；`AgentStepProgressSummary` 增加 `completed_points / total_points / estimated_leaves / unestimated_leaves / completed_unestimated_leaves / removed_scope_leaves / removed_scope_points`，未知结局步骤以 `unknown_outcome` 从完成数/加权进度扣除；`skipped` 与 `scope_removed` 分开。
  - **子任务重试**：新增 `agent.subagents.retry@1`（`audience: plugin`，项目级写），输入 `{ source, reason?, extend_attempts?, only_extend? }`，输出子任务视图与 `budget.{attempt,max_attempts,retry_source,prior_attempts}`；宿主发起、无预算的追加以 `source: "host"` 记录，不记成本人原话；新增拒绝码 `agent.subagent_key_invalid` 进 `AgentHostErrorCode`。
  - **材料与版本钉住**：`AgentMaterialChecklistItem` 多可选 `source_artifact_id`／`source_version`（与溢出入参 schema 对称）；`knowledge.read@1` 输入多可选 `expected_revision`，主人授权核对通过后才比对 revision，漂移返回 `knowledge.revision_changed`；动作工具与业务网关两处出口对同一轮冻结材料统一注入，覆写锁定版本在入口返回 `agent.pinned_revision_mismatch`（`S-41`）。
  - **引导密钥**：新增 `onboarding.context.secret@1`（`audience: user`，Home 级，`scheduling: "concurrent"` + `beforeEffect()`），输入 `{ key, decision: "strip"|"raw"|"exclude", reorganize? }`，`additionalProperties: false`；文件在本人选择前留在 `held_secrets`，`raw` 的许可绑定 `(kind,path,sha256)`，内容改变后失效（`S-onboarding-secret-hold`）。
  - **合后五维收口（PR #2095，2026-11-15）**：公开合同新增 `AgentStepProgressSummary`、`AgentSubagentBudgetView`、`AgentSubagentPriorAttemptView`、`AgentMaterialDeliveryMode`、`knowledgeSubjectHashInput`、`knowledgeRefFromDigestHex`、`KNOWLEDGE_REF_HEX_CHARS`、`contextSkipRuleName`；`AgentMaterialChecklistItem` 多可选 `material_id` 且 `delivery` 改用 `AgentMaterialDeliveryMode`，`AgentMaterialOrigin.delivery` 同型；`AgentStepBoard` 多可选 `skipped: true`。`coding.state@1` 查询多可选 `workspace_id`（只影响环境准备清单的目录选择）；`agent.subagents.retry@1` 输入补齐 `notes`、`expected_revision` 与 1..10 的 `extend_attempts` 校验；`onboarding.context.secret@1` 拆成准备／复核／提交三步，取消或过期不写旅程状态。`knowledge.read@1` 与 `materials.read@1` 两个出口都按轮次冻结的 `read_revision` 钉版本，覆写返回 `agent.pinned_revision_mismatch`。API 与动作快照同批刷新。
  - **调用方影响**：全部为 @1 原版本内的可选扩展或新增动作，不升版本、不保留旧形状读取；API 快照 `tooling/gates/api/contracts/services/agent-host.txt`、`knowledge.txt`、`platform/plugin*.txt` 与动作快照 `tooling/gates/actions/host-actions.tsv` 同批更新；`agent.subagents.retry@1` 与 `onboarding.context.secret@1` 登记在 `tooling/versions.json`。

- **第 30 批：评测样本留存与端到端评测合同**（[#2096](https://github.com/molis-ai/molis-work/pull/2096)，`ddda618006`，2026-11-15；纯新增，无读取兼容）：`packages/contracts/src/services/observation.ts` 新增 `observation.holds.{put,release,list}@1` 三个仅本人可调的动作；新公开合同子路径 `@molis-ai/molis-work-contracts/services/evaluation`（`io.molis.work.service.evaluation.v1`）及 `system.evaluation` 九个 `@1` 动作——`samples.put/list/remove`、`runs.execute/get/list/compare`、`reviews.record`、`metrics.summarize`。全部 `audiences: ["user"]`；既有 `observation.report@1`、插件 SDK、Manifest 与既有动作形状不变，外部插件无需改。`observation.db` 1 → 2 只新增 `evaluation_holds`／`evaluation_hold_records` 两张空表（见上面「当前保留机制」与「存储版本变更登记」）；`evaluation.db` v1 一次到位。动作快照在 `tooling/gates/actions/host-actions.tsv`，API 快照在 `tooling/gates/api/contracts/services/evaluation.txt` 与 `observation.txt`；设计与边界见 [`evaluation-path-design.md`](../../specs/observation-collection/evaluation-path-design.md) §3～§5。

- **登录一致性 P1（2026-11-16）**：Auth 合同升至 1.3.0，新增配置就绪能力读取；Work 导出生成的 `LoginCapabilities` 类型，Host 使用配置内的客户端身份。既有动作、权限与会话合同不变，无读取兼容或迁移分支。六份上游合同固定真实 Auth 提交，由 CI 核对来源与类型。发布先 Auth 后消费者；缺少新接口时报错。验证与资源增量见 [P1 验收](../horizontal/account-login-p1.md)。

- **第 58 批：子任务公共交互组件**（2026-11-16；新增、无持久格式变化）：SDK `/ui` 新增 `MwSubtaskConversationView`、消息/过程/具名动作及文字类型和 `renderSubtaskConversation`；`/subtask-conversation` 新增 `createSubtaskConversation` 及其读取、输入、控制端口。逻辑 `target` 与精确执行 `binding` 分开，owner 重查权限及代次；未确认结果按原请求查询，页面恢复用 owner 的 `pending`。统一输入 `ComposerCommonOptions.placement?: "local"` 可让插件框架的子输入留在给定挂载点，省略时沿原底栏收件人路由；新增 `ComposerHandle.ready()`：等待当前输入程序挂载，失败显式重试、关闭/切换拒绝；首屏 hold 同步生效。本地和宿主栏桥接均兑现同一生命周期，draft 读取另等。现有消费者无需调用新方法，自行实现 handle 的类型消费者需补齐。无新 Host 动作、表、兼容读取或 Prologue 换包；公开快照为 `plugin-sdk/{ui,subtask-conversation,page-globals}`。公共合同设计于 `3f84298cdd` 通过，实际代码合审于 `e325f3034b` 通过，D 轨在 `99bb1e833d` 通过，独立评审 `6a391b89e5` 无 Blocker/P1；最终头 `f4a8390533` 随 [#2108](https://github.com/molis-ai/molis-work/pull/2108) 合入 `6359987103`。接入边界与验收见 [subagent-interaction §11](../../specs/subagent-interaction/spec.md#11-第-58-批开工与定样2026-11-16)。

- **第 39 批：有限委托、显式人审、可信决定回平台与项目自动化建议合同**（2026-11-16；阶段一在原版本 @1 上改，库升级走升级链，无读时兼容）：
  - **Manifest 与通用可信决定（39-2）**：动作声明新增可选 `requires_trusted_decision?: boolean` 与 `trusted_decision_request?: { capability_id, version }`（SDK `defineReviewRequestAction` 校验读取动作返回 `ReviewRequest`）；任何插件或项目级系统提供方声明需要本人决定的动作统一经受保护入口提交（Web `decideProjectReview`、CLI `review-request`／`review-decide`、管理 MCP `molis_work_v1_review_request`／`molis_work_v1_review_decide`），原 MCP 专用 `molis_work_v1_event_decide`、`molis_work_v1_goal_tree_decide` 与 CLI `goal-tree-decide` 删除。`ReviewOwner` 的 `system` 分支扩支持 `{ scope: "project", provider_id }`；`modules/acceptance` 新增 `acceptance.review@1`，`acceptance.decide@1` 声明 `requires_trusted_decision: true` 并同事务提交平台决定记录，`BackgroundTaskDecision` 与 `AcceptanceView` 携带同一 `ReviewReference`。
  - **项目审批规则与库移交**：新增 `@molis-ai/molis-work-contracts/services/project-approvals`（`project.approvals.decisions.read@1`、`project.approvals.rules.read/change@1`），Goals 的 `goals.policy.history@1`、`goals.policy.save@1` 删除并改为消费平台读口；项目库 `3 → 4` 与 Goals 私有库 `1～4 → 5` 在同一升级事务移交历史决定与规则（见上文「当前保留机制」与「存储版本变更登记」）。
  - **Agent 审查版本、可决定性与有限委托（39-1）**：`agent.reviews.decide@1` 输入必填原审查版本 `version`（取 `reference.version`），待审投影新增 `AgentReviewDecisions` 可决定性；新增 `@molis-ai/molis-work-contracts/services/agent-authorizations`、`agent-delegation-actions`（统一授权与审批来源投影、工作与持续委托收窄／撤销）及 `@molis-ai/molis-work-contracts/services/automation-recommender`（`automation.recommendations.read/preferences.save/report.save@1`）。公开 API 快照与动作快照同批刷新。

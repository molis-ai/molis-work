# 合同变更流程

状态：现行（2026-10-08 入库；同日用户定了读取兼容的起点）。分两个阶段：现在在**阶段一，不留兼容期**；**阶段二，读取兼容**从第一个装到开发机之外的版本开始。

> **阶段二的起点（用户 2026-10-08 定，`specs/repository-anti-corruption/spec.md` §1「『不留兼容』何时结束」；路线图待决 #15）：第一个装到开发机之外的版本。** 计划里是 1.0，也可能更早出现第一个外部用户；哪个先发生，那个版本就是起点。开发机指参与开发的人（现在是用户和同事）用来开发和试用的机器。起点之前一律按阶段一的「不留兼容」做。
>
> 起点日期：**还没到，没有固定日期。** 起点发生时，发那个版本的 PR 在这里写下版本号、日期和提交，第 3 节标为已结束，第 4 节开始适用。第 5 节的前置要在那之前就位。

起点之前，没有要保留的旧用户数据：2026-10-02 用户确认没有同事在用要保留的 Home（`specs/repository-anti-corruption/spec.md` §1），所以破坏性变更直接做，不留兼容代码。起点之后才有「读取兼容、写入严格」的兼容期，那时每一段兼容都要写明消费者和删除条件。本文把两个阶段都写下来，让起点一到就有流程可用，也让现在的做法有边界。

## 1. 哪些算合同

这里的合同是别人（别的包、别的进程、外部插件、用户的数据）依赖的形状：

| 合同 | 在哪里 | 版本记在哪 |
| --- | --- | --- |
| `packages/contracts` 的公开子路径 | `packages/contracts/package.json` 的 `exports` | 暂无；公开 API 快照是路线图 W1-04 |
| `packages/plugin-sdk` 的出口 | `packages/plugin-sdk/src` | 同上 |
| 动作（能力）的身份、输入输出 schema | `packages/contracts/src/platform/actions.ts`；各插件 Manifest 的动作声明；规则见 `specs/action-architecture/spec.md` §3 | 每个能力定义的 `version`；被固定的引用写成 `capability_id@version` 加提供方 |
| 插件 Manifest 的格式与升级声明 | `packages/contracts/src/platform/plugin-manifest.ts`；用法见 `docs/platform/PLUGIN-DEVELOPMENT.md`「插件版本升级」 | Manifest `version`（SemVer）；`upgrade_compatibility.compatible_from_versions` / `migratable_from_versions` |
| MCP 工具名与参数 | `apps/mcp`；`docs/mcp.md`；`skills/goal-advance` | 工具名即身份；Skill 与手册随它改 |
| 对外合同 id | Casebook 的 `molis-work.casebook.*`，Schema `$id` 在 `https://molis-work.dev/contracts/casebook/…` 下（`apps/local-host/src/casebook/`） | `$id` 里的版本 |
| Home 里存的数据 | 项目库、目录库等，清单与版本方案见 `docs/system/HOME-DATA.md` | 库的结构版本（`PRAGMA user_version` 或自带的 meta 表），经 `packages/storage/src/sqlite-baseline.ts` 的 `applySqliteBaseline` 建库，版本不符就拒绝 |

## 2. 版本号的编号方案

产品版本的编号方案已定（`specs/repository-anti-corruption/spec.md` §1，2026-10-08「版本与发布策略」）：一个产品版本，下一版 0.3.0；根包、桌面端、Tauri 跟同一版本，内置插件的 Manifest 跟宿主版本，工作区包保持私有 0.0.0；每次发布有说明、CHANGELOG 和带各库版本表的检查单。这个方案的落地由路线图做，现在还没完成。

能力定义的 `version`、Home 库的结构版本、对外合同 `$id` 里的版本是各自合同的版本，是代码里单独的字段，不跟产品版本走。本文规定「形状变了就升这份合同自己的版本」。

## 3. 阶段一：现在，不留兼容期

1. **合同读写都只认现行取值**（`AGENTS.md` 硬约束）。破坏性变更直接改合同，不留旧版本解析、别名、兼容出口、读取时兜底历史取值。需要新增兼容或迁移逻辑的，要先写进 `specs/repository-anti-corruption` 的保留机制并经用户确认。
2. **同一个 PR 改完所有消费者**：仓库里的调用方、Skill 与手册、测试。PR 描述列出消费者和改了什么。先例（spec §1）：Casebook 改名（2026-10-04）要求「PR 里列出全部新旧 id」；MCP 连接工具去掉 `actor_id` 的决定（2026-10-07）写明 goal-advance Skill 与 `docs/mcp.md` 同步改。
3. **有版本字段的合同，形状变了就升版本。** 这样固定了旧版本的引用不会被静默当成新形状：例如工作流固定的能力引用，失效时保留并报错，不换成新版本或另一个提供方（`specs/action-architecture/spec.md` §3「工作流存量内容站迁移」）。
4. **存量数据由维护改成现行形状，读取时不兜底。** Home 的库：改建库基线并升结构版本，版本不符的库被拒绝（`applySqliteBaseline`），不就地升级，也不写迁移链。开发用的 Home 用一次性脚本升级或重建，脚本放会话临时目录，不进仓库产品代码（spec §1，2026-10-04）。真实 Home 的任何改动：先整份备份，在拷贝上演练，再动原库，并且要用户当次同意（spec §1，2026-10-02 至 10-07 各行）。
5. **外部已经在用的名字**（Casebook 的合同 id、Runtime 用的 MCP 工具名）：改动是产品决定，先问用户，在 spec §1 记一行，PR 里列新旧名，外部插件同步。
6. **门禁守着**：源码里的兼容标记（`legacy`、`compat`、`@deprecated`、`backfill`）按文件计数，只许减少，新文件从零（`pnpm health:check`，`AGENTS.md` 健康门禁一条）。就地补表、测试引用包内部同样只许减少。
7. **不算兼容、要保留的**：合同和 Schema 的版本号字段，插件升级声明 `compatible_from_versions` / `migratable_from_versions` 与发行物留存。它们是起点之后要用的机制，不是为旧数据留的（spec §1，2026-10-02「插件升级声明的机制」）。

## 4. 阶段二：起点之后，读取兼容

起点之后，对第 1 节任何一项做破坏性变更（删字段、改字段含义、收窄取值、改名），按下面做。只加可选字段、放宽输入的变更不算破坏性，照常做。

1. **写变更说明**：`specs/<task>/spec.md` 或 PR 描述写清变了什么、为什么不能只加可选字段、影响谁。
2. **升版本，新旧并存**：新形状用新版本。能力注册新的 `version`，同一个 id 的旧版本继续可调用到窗口关闭；Home 的库加一段 `from → to` 的升级；插件 Manifest 按 SemVer 升主版本，并在 `upgrade_compatibility` 里写清哪些来源版本可以直接用、哪些可以迁移。
3. **读取兼容，写入严格**：读取时接受旧版本并映射成新形状；写入只产生新版本。结果合同回显已存历史时，接受历史取值，写入侧不接受。
4. **消费者清单**：窗口开始时列全：仓库内的调用方（用 `git grep` 找能力 id、工具名、导出名）、外部消费者（Casebook 插件，使用 MCP 工具的 Runtime 与 Skill）、已安装的插件（用户 Home 里的发行物，创作台生成的插件）。每一项写：谁负责迁、迁移 PR、状态。
5. **删除条件**：每个窗口写一个可检查的条件，例如「清单里的消费者全部迁完，并且已经过一个发布版本，用户 Home 的库都已升到新版本」。条件满足后，一个 PR 删除兼容代码、兼容测试和登记行。**提议：** 兼容代码旁放带窗口编号的标记，登记表（第 6 节）有对应一行，门禁据此放行（第 5 节）。这是本文的提议，没有经过用户确认；`AGENTS.md` 要求新增兼容机制先写进 `specs/repository-anti-corruption` 的保留机制并经用户确认，所以起点之前要先过这一步。
6. **合同测试**：窗口里每一段兼容配两个测试：旧形状被读取并映射成新形状；写入只产生新形状。关窗口时和兼容代码一起删。
7. **插件回放**：合同或运行时的变更，用存量插件样本回放，确认它们仍能加载（解析 Manifest、校验授权声明）、升级（按 `upgrade_compatibility`）、运行（调用一个动作）。回放工具是 `scripts/replay-plugins.mjs` 加样本集（路线图 W4-01：`examples/plugin-sample`、2–3 个创作台生成的插件、一个打包后的 Runtime 内置插件），**现在还没有**。有工具之前手工回放：打包 `examples/plugin-sample`，在隔离的 Home 里安装、升级、停用、卸载，结果贴在 PR 里。
8. **PR 里写清楚**：公开 API 有没有变（快照 diff）、版本怎么变、消费者列表、删除条件。`.github/pull_request_template.md` 有对应的栏目。

## 5. 起点之前要先有的东西

起点一到就要能用，所以这些要在起点之前就位。进度以 `specs/repository-anti-corruption/spec.md` §10 为准：

- 公开 API 快照（`packages/contracts` 各子路径和 `packages/plugin-sdk`），导出一变必须显式更新快照（路线图 W1-04）。
- 动作合同快照：每个内置 Manifest 的 `capability@version`、提供方和 schema 哈希，进 `pnpm test:contracts`（路线图 W2-15）。schema 变了而版本没变，评审要拦下。
- 插件回放工具与样本集（路线图 W4-01）。
- **提议（未经用户确认，见第 4 节第 5 条）：** 兼容标记门禁改成允许「带窗口编号、登记表里有对应行」的标记，其余仍只许减少。现在的门禁一律只许减少，起点之后的第一段兼容会被它拦住；放宽门禁要另开 PR，改 `tooling/gates/` 与门禁脚本，请求 @yijunw0212 评审。
- 版本策略落地：根包、桌面端、Tauri 与内置插件 Manifest 跟同一个产品版本，发布检查单带各库的版本表（2026-10-08 已定，见第 2 节）。

## 6. 登记表

当前开着的兼容窗口：**没有**（阶段一不留兼容期）。起点之后，每个窗口一行：

| 窗口 | 合同 | 旧 → 新 | 消费者清单 | 删除条件 | 负责人 |
| --- | --- | --- | --- | --- | --- |
| （空） | | | | | |

## 7. 已决与还开着的

已决（用户 2026-10-08，路线图待决 #15）：起点是第一个装到开发机之外的版本，日期到时写进本文。没有选的两个方案：现在就对已有外部消费者的合同开始（Casebook，Runtime 使用的 MCP 工具名）；各合同的主人在发布它时各自开始。

Casebook 已经按 2026-10-04 的决定改成 `molis-work.casebook.*`，外部插件要同步。起点之前它和其他合同一样按阶段一办：改外部已经在用的名字是产品决定，先问用户（第 3 节第 5 条）。

还开着的：

- 起点那天要把版本号、日期和提交写进本文顶部，并把第 3 节标为已结束（还没到）。
- 第 4 节第 5 条与第 5 节里标了「提议」的两处，起点之前要经用户确认。
- 第 5 节列的前置还没做完。

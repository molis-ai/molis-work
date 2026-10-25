# W5-15 成熟度词表与包描述清理（ac-maturity）：四个词定状态，包描述只写一处

状态：阶段1 方案（2026-10-25，只读调研，未实现、未跑构建与测试）。事实按 `origin/batch/1025-39`（`0cbc76492`）重核；等统筹审过本方案、且 batch-39 进 `main` 后再开实现分支。manifest 版本重置与下一次发布不在本片（见 §5.4）。

依据：`specs/repository-anti-corruption/roadmap-2026-10-07.md` 第 89 行 W5-15；用户 2026-10-25 任务书（`deepseek-goal-C-w5-15-maturity.md`）；`docs/SSOT-MATRIX.md` §2；`specs/repository-anti-corruption/spec.md` §4.4/§4.12/§5.1；W5-02 登记线（`specs/repository-anti-corruption/slices/w5-02-registry.md`）。

验收编号：W5-15-01～W5-15-16（见 §6，阶段2 实现时把编号写进测试名或注释）。

## 0. 结论（先看这一段）

1. **词表目前没有区分度，但也没有检查。** 70 个包里 69 个 `partial`、1 个 `contract-only`（`packages/contracts`）；8 个 absent 行只是 SSOT 里的未来路径。SSOT 的「包成熟度」列没有任何脚本或测试读（`git grep 包成熟度 scripts/ tests/ docs/system/ tooling/` 为空），registry 里的 maturity 只与各 `package.json` 的同一字段对拍。所以「状态」今天是人写的注释，不是可执行的事实。
2. **三处重复里两处已死，一处只有门禁在读。** `packageDescriptor`（70 个 `src/index.ts`，其中 52 个还导出 `MolisWorkPackageDescriptor` 类型）全仓零 import（只有 `scripts/workspace-packages.mjs:216` 用字符串包含检查它）；`legacySources` 全仓零读者（40 个包共 57 条，56 条路径已不存在）；`migrationGoals` 只有 registry、`package.json`、`src/index.ts`、README 之间的相等检查在读（29 个不同 goal id，全部带注入的 `goal-reorg-f2`）。没有任何运行时/产品代码消费这三样东西。
3. **建议的单写源**（§4）：非插件包的包描述只写 `scripts/workspace-packages.mjs`；24 个内置插件的包描述只写各插件 `package.json` 的 `molis-work` 块（W5-02 已定的方向，本片收窄块内字段）；`src/index.ts` 的 `packageDescriptor`、70 个 README 里的 `Status`/`Contract entrypoint`/`Migration Goals` 三行、46 个非插件 `package.json` 的 `molis-work` 块全部删除；`legacySources`、`migrationGoals`（`summary`/`notResponsibleFor` 待 Q4）从数据和门禁里删除；`packages/contracts` 的 `PackageDescriptor`/`PackageKind`/`PackageMaturity` 删除，合同轴的成熟度改名为 `ContractMaturity`（取值不变）。
4. **词表**：`production`（已交付、按现行承诺维护）、`experimental`（存在但未承诺，行内必须写删除或默认关闭条件）、`slice`（目标已建包、已有真实实现，但目标契约还缺一片，行内写缺哪片和后续 Goal）、`absent`（目标包未创建）。判定顺序 absent → experimental → slice → production，证据只取 SSOT 行文 + 运行状态 + 迁移切片验收记录（§2）。
5. **建议映射**：production 55、slice 13、experimental 2、absent 8（§3）。**production 集合是产品语义，最终由统筹/用户定**；标 ⚠ 的 10 行与 2 条语义问题单独列出（§3.2），机制（词表、单写源、门禁）与具体取值解耦。
6. **需要统筹裁定的 7 个问题见 §7**：production 集合、experimental 两个候选、插件成熟度是否允许自报、`summary`/`notResponsibleFor` 是否同批删、SSOT 成熟度列用「校验」还是「生成」、`apps/workbench/src/functions` 非包行去留。

实现分三个提交（阶段2，一个分支）：M1 词表与重标（SSOT + registry 值 + 新检查，不删东西）→ M2 单写源（删三处重复、收窄插件块、改门禁与测试、刷 API 快照）→ M3 收尾（capabilities 漂移、boundary 硬编码、技能/文档、全量验证）。M2 依赖 M1 的取值，M3 依赖 M2 的形状。

## 1. 现状（batch-39 重核，2026-10-25）

### 1.1 成熟度词现在定义在哪、值是什么

| 位置 | 是什么 | 现值 | 谁读 |
| --- | --- | --- | --- |
| `docs/SSOT-MATRIX.md` §2（第 38-50 行） | 7 个状态词 + `workspace-root + legacy-release`：`legacy-mixed`/`absent`/`contract-only`/`partial`/`implemented`/`retired` | 70 个真实行：69 `partial` + 1 `contract-only`；8 个 absent 行 | **没有脚本读**。`scripts/package-owners.mjs` 只读每行「归属」列；`scripts/gates/package-inventory.mjs` 读的是 `spec.md` §5.1 的另一张表 |
| `scripts/workspace-packages.mjs` 的 `entry()`（第 7-34 行）与 46 个 `entry(...)` 调用（第 71-120 行） | 登记表的 `maturity`；默认 `contract-only`，逐包在 `status` 里写 | 69 `partial` + 1 `contract-only`（`packages/contracts` 用默认值） | `checkWorkspacePackages` 与各 `package.json` 的 `molis-work.maturity` 对拍；`scripts/gates/package-inventory.mjs` 不用它 |
| `scripts/workspace-packages.mjs` 的 `nativePluginEntries`（第 48-63 行；常量 `NATIVE_PLUGIN_MATURITY` 在第 42 行，`REGISTERED_PLUGINS` 在第 68 行） | 24 个内置插件的条目从各自 `package.json` 的 `molis-work` 块读，maturity 被强制成常量 `NATIVE_PLUGIN_MATURITY = "partial"` | 24 个 `partial` | 同上；插件块自己写的 maturity 必须等于 `partial`，否则 `pnpm boundary:check` 报错（RAC-576，`tests/plugin-registry-generation.test.ts:314-337`） |
| `packages/contracts/src/platform/package.ts:2` | `PackageMaturity = "contract-only" \| "partial" \| "implemented"`，同时被 `ContractDescriptor.maturity`（第 20 行）使用 | 49 个 `as const satisfies ContractDescriptor` 描述符：4 个 `contract-only`（`platform/testing`、`platform/tooling`、`platform/storage`、`platform/package`），其余 `partial` | `scripts/gates/contract-placeholders.mjs` 只做结构识别（`as const satisfies ContractDescriptor`），**不读 maturity 值**；`scripts/check-package-boundaries.mjs:905,1064,1136` 用字面量 `maturity: "partial"` 检查 3 个合同源文件（合同轴，见 §2.4） |
| 各 `package.json` 的 `molis-work.maturity` | 与 registry 的同一字段重复 | 70 个都等于 registry | `checkWorkspacePackages:184` 对拍；`check-package-boundaries.mjs:431,693` 另对 goals/governance 两包硬编码 `!== "partial"` 报错 |
| `scripts/gates/package-inventory.mjs` | **另一套**词：运行状态 `在用`/`Runtime`/`构建期`/`非产品`（`STATUSES`），测于代码可达性；配「计划深度」`深/中/浅`、「审查」`待审/已审` | 70 行（本次 `--table` 实测：在用 43、Runtime 18、构建期 6、非产品 3） | 绝对规则：`node scripts/check-health-gates.mjs` 里的 `inventoryProblems` 校验 `spec.md` §5.1 表与 registry/代码判定一致（行集合、层、状态、词表、非数字单元格；数字列不守） |

补齐的过时数字（本片要顺手改或至少在方案里纠正）：

- `docs/SSOT-MATRIX.md:50` 的构成句写「8 horizontal、25 native plugin、10 foundation、14 module」，实际是 **9 horizontal、24 native plugin**（Characters 已并入 `modules/characters`、Sessions 已下线）；70 = 6 app + server 1 + foundation 10 + modules 13 + horizontal 9 + native 24 + integrations 6 + tooling 1。日期仍写 2026-10-10。
- `docs/SSOT-MATRIX.md:40` 的行首日期/数量在 roadmap §4.4 已被记为过时（2026-09-28 的 6/11/15/6/25）。
- roadmap:496 记录「41 个包有 legacySources，共 61 条路径，其中 56 条已不存在」；本次实测 **40 个包、57 条、56 条不存在**（只有 1 条还存在）。方案引用新数字，roadmap 作为历史不改。

### 1.2 三处重复：写点、读者、结论

| 数据 | 写点 | 读点 | 结论 |
| --- | --- | --- | --- |
| `packageDescriptor` 对象（packageName/packagePath/kind/maturity/contract/ssot/capabilities，59 个还带 migrationGoals） | 70 个包的 `src/index.ts`；`packages/contracts/src/index.ts:11-20` 是唯一带 `as const satisfies PackageDescriptor` 的写法；`tooling/plugin-cli/src/index.ts` 也是其中一员 | **零 importer**（全仓无 `import { packageDescriptor }`、无 `packageDescriptor.`）。唯一「读者」是 `scripts/workspace-packages.mjs:216-219` 的字符串包含检查（`"packageDescriptor"`、`maturity: "<值>"`、每个 capability 字符串） | 死数据。删对象、删 `MolisWorkPackageDescriptor` 类型别名（52 个包有、18 个没有）、删 contracts 的 `PackageDescriptor`/`PackageKind` 类型、删门禁的字符串检查 |
| `migrationGoals` | `scripts/workspace-packages.mjs:12,22`（自动加基础 `goal-reorg-f2`）；70 个 `package.json` 的 `molis-work` 块；59 个 `src/index.ts`；70 个 README 的 `Migration Goals:` 行 | `checkWorkspacePackages:187` 三方对拍；`:229-233` 要求 README 逐个包含；没有别的读者 | 29 个不同 goal id，全是历史迁移编号；没有运行时意义。全删，历史留在 SSOT「迁移 / 实现 Goal」列（人写的标签）、roadmap/spec 与 git 历史里 |
| `legacySources` | `scripts/workspace-packages.mjs:15,25`；`nativePluginEntries:58` 从插件块读；40 个包共 57 条（24 个内置插件块里也有） | **零读者**（门禁、测试、脚本、运行时都不读） | 死数据，全删；57 条里 56 条是已经删掉的旧文件路径 |
| `capabilities` | registry（46 个非插件包，部分为空）；70 个 `package.json` 里 51 个有（19 个没有该键）；70 个 `src/index.ts`；内置插件块 | `checkWorkspacePackages:218-220` 要求 src 包含；`check-package-boundaries.mjs:434,437,440,697` 只对 goals/governance 读 `package.json` 的 caps；没有产品代码读者 | 现在三份且**没有互相比较**，已经漂移：`apps/workbench/package.json:83` 多一个孤儿 `workbench.goals-proposal-composition.v1`；`plugins/native/{schedule,shelf,workflows}/src/index.ts` 各多 1-2 个只在 descriptor 里的能力名（见 §4.10） |
| `path`/`kind`/`ssot`/`contract`/`summary`/`notResponsibleFor` | 同样三份（`molis-work` 块、registry、`src/index.ts`） | `path/kind/contract` 由 `checkWorkspacePackages:182-185` 对拍；`ssot` 固定 `docs/SSOT-MATRIX.md`；`summary`/`notResponsibleFor` **零读者** | 同批收口：只保留经校验的最少字段（§4.9），`summary`/`notResponsibleFor` 建议删（§4.5、Q4） |
| README 页脚三行 `Status:`/`Contract entrypoint:`/`Migration Goals:` | 70 个 README，位置不一（9 个以 `Status:` 开头，多数在页脚） | `checkWorkspacePackages:229-233` 要求包含；无其他读者 | 三份里的第四份；删检查、删三行，README 的「开发要求」不动（`scripts/package-dev-requirements.mjs` 只管那一节） |

旁证：`docs/reviews/cleanup-audit-2026-10-20.md` §0 第 6 条已经把这件事总结为「包元数据有三份，校验方向不对称」，并明确要求「先定哪一份是权威……不要三处各改一处」；它列的 5 个未登记能力名与本次实测的归属见 §4.10。

### 1.3 门禁与测试谁在检查什么

- `scripts/workspace-packages.mjs:178-232`（`checkWorkspacePackages`）：每包 name 唯一、`private === true`、`version === "0.0.0"`、`molis-work.path/kind/maturity/contract` 与 registry 对拍、`molis-work.ssot === "docs/SSOT-MATRIX.md"`、`migrationGoals` 深相等、依赖集合恰等于 `contracts + extraWorkspaceDependencies + extraDependencies`、`scripts.build/typecheck`、`exports["."]` 走 `dist/`、`src/index.ts` 含 `packageDescriptor`/maturity/capability 字符串、`contract-only` 例外规则、README 含 `Status:`/contract/每个 goal id、`checkDevRequirements`；之后 `checkPackageOwners`、扫描多余 `package.json`、contracts 导出每个 `CONTRACT_SUBPATHS`、`pnpm-workspace.yaml` 的 globs（第 234-286 行）。
- `scripts/package-owners.mjs`：从 SSOT 的「目标 package」表生成/校验「归属」列与 `.github/CODEOWNERS`；每行 6 格、首个反引号路径、归属格按规则（`kind` → 角色；共享核心表；插件 `executive` 规则）；每个 workspace 包恰一行；absent 行用 `—`。**它不读「包成熟度」格**。
- `scripts/check-package-boundaries.mjs` 里与本次相关的硬编码：`:431-440` 读 `modules/goals/package.json` 的 `molis-work.maturity === "partial"` 与 3 个能力；`:690-697` 读 `modules/governance-collaboration/package.json` 的 `maturity === "partial"` 与 2 个能力；`checkArtifactsOwnership`（第 899 行起）要求 `modules/artifacts/src/index.ts` 含 `maturity: "partial"` 与 4 个能力字符串，并要求 `plugins/native/artifacts/src/index.ts` 含 `contract: "@molis-ai/molis-work-contracts/platform/plugin"` 与 `"goal-reorg-ar1"`、`"goal-reorg-ar3"`（第 976-1000 行）；`checkPrivateWorkContextOwnership`（第 1047 行）与 `checkRuntimeHostOwnership`（第 1117 行）同样要求各自入口 `src/index.ts` 含 `maturity: "partial"` 与能力字符串。这些检查的对象正是要删的 `packageDescriptor`。
- `scripts/gates/package-inventory.mjs`：不读 maturity；本片不改它的规则，`spec.md` §5.1 表也不应因本片变化（行集合/层/状态不变）。
- `scripts/gates/module-repository-exports.mjs:23-43`：把 `scripts/workspace-packages.mjs` **当文本**解析 `entry(path, name, "module", …)` 的调用，要求 `modules/*/src/index.ts` 导出 Repository/Store；`entry()` 签名一变它必须跟着改。
- `scripts/gates/api-snapshot.mjs`：公开 API 快照在 `tooling/gates/api/`；本片会改 `contracts/index.txt`、`contracts/platform/package.txt`、`plugin-sdk/index.txt`，必须 `pnpm api:update` 并写影响（§5.1）。
- 测试：`tests/package-inventory-gate.test.ts`（scratch 仓里伪造 `export const WORKSPACE_PACKAGES = [...]` 的 registry 文件；新检查只允许出现在 `checkWorkspacePackages` 里，不碰这个 fake 的形状）、`tests/package-owners.test.mjs`、`tests/plugin-registry-generation.test.ts:314-337`（RAC-576）、`tests/workbench-registration-boundaries.test.mjs:9,76-84`、`tests/doc-reference-gates.test.ts:56,124`（`ContractDescriptor` 夹具，取值不变）、`tests/plugin-package.test.ts`、`tests/build-workspace.test.ts`、`tests/package-dev-requirements.test.ts`。**没有测试读 `packageDescriptor`。**

### 1.4 文档、技能、快照

- 活文档：`docs/SSOT-MATRIX.md`（§2 词表、构成句、70 行成熟度格）、`skills/molis-plugin-dev/host.md:90`（把插件 `molis-work` 块的字段、kind/maturity 由目录定的规则写给人看）、`docs/system/GLOSSARY.md:14`（只指向 SSOT，不需改）、`docs/platform/PLUGIN-DEVELOPMENT.md:5`（只写 `registration` 声明，不需改）。
- 历史文档（不改）：`docs/reviews/cleanup-audit-2026-10-20.md`、`specs/archive/**`、`specs/molis-work-architecture-reorganization/f2-validation.md`、`specs/repository-anti-corruption/roadmap-2026-10-07.md`、`specs/repository-anti-corruption/slices/sc-4-sessions-offline.md`。
- API 快照：见上；`packages/contracts` 无版本号，形状只记在快照里（`docs/system/CONTRACT-CHANGES.md`）。

### 1.5 与 W5-02、batch-39 的边界

W5-02 已经把 24 个内置插件的条目改成从插件自己的 `package.json` 读（`nativePluginEntries`），并规定 `kind` 与 maturity 不能由插件自报（RAC-576：`kind` 按目录判 `native-plugin`、maturity 固定 `partial`）。W5-15 不改这条装配方式，只做三件事：把 maturity 从常量变成「每包一个词」；收窄插件块里可以写的字段；删掉其余重复。插件依赖生成（`scripts/generate-plugin-registry.mjs` 写三份 `package.json` 的插件依赖与两个生成文件）不在本片范围，`molis-work.registration` 键必须保留。

在途：batch-39 基于 batch-38，`scripts/workspace-packages.mjs`、`apps/*/package.json`、插件 `package.json` 都会因 W5-02 后续/批次集成分支再变；阶段2 从 `origin/main` 起新分支，开工前重核（§8.1）。

## 2. 词表：四个词（建议定义）

### 2.1 定义与判定证据

| 词 | 定义 | 判定证据（只取这三类，不看代码自报） | SSOT 行里必须写 |
| --- | --- | --- | --- |
| `production` | 已交付、按现行产品承诺维护：主路径、错误、持久化、恢复、测试、文档都已通过相应迁移切片的验收 | (a) `package-inventory` 运行状态是 `在用`/`构建期`/`Runtime` 且该包由产品启用；(b) SSOT 行文没有列「未实现/待迁移/待接入/重做」的目标能力；(c) 对应迁移切片的验收记录已存在 | 不需要额外说明（旧行文够用） |
| `experimental` | 功能存在，但产品没有承诺保留；去留另定 | 行文明确写「无产品入口 / 去留另定 / 实验」；用户或统筹在产品语义上确认 | **必须写**：删除或默认关闭的条件（谁、看到什么就删/关），以及现在为什么保留 |
| `slice` | 目标 package 已创建、已有真实实现，但目标契约还缺一片（未来能力 / 待迁移的 harness / 待 Desktop 接入 / 拆分未完成） | 行文明确写出缺的那一片；或对应迁移切片验收表里还有未勾的项 | **必须写**：缺哪一片 + 后续 Goal / BL 编号；补齐或收窄目标时转 `production` |
| `absent` | 目标物理 package 尚未创建；行保留未来路径，不参与构建 | 路径不存在、无 `package.json` | 不需要（旧行文够用） |

判定顺序：`absent` → `experimental` → `slice` → `production`，即先看包在不在，再看承诺，再看目标是否缺片，剩下才是 production。证据记录在 SSOT 行本身；本片不改运行状态词（`在用/Runtime/构建期/非产品` 是另一套，见 §1.1 最后一行）。

### 2.2 旧词处置

- `contract-only`：唯一使用者 `packages/contracts` 转 `production`。理由：它的公开类型/Schema 是真实产物、被全部包依赖；旧词在这里的意思是「没有注册假的 Provider/Store/伪成功功能」，不是占位；`spec.md:1375`（R-11）已确认「`contract-only` 这个标记不等于占位」。
- `partial`：按 §3 逐包拆成 `production` / `slice` / `experimental`。不再保留 `partial` 作为兜底。
- `implemented`：当前数据里没有，退役。
- `legacy-mixed`、`retired`、`workspace-root + legacy-release`：迁移期状态词，从 SSOT §2 删除；历史含义已经在 roadmap/spec 的迁移表里，SSOT §2 保留一句「迁移期旧词已退役，见 roadmap 2026-10-07」。
- `ContractDescriptor.maturity` 的 `contract-only`/`partial`/`implemented` **不在这套词表里**：合同轴与包轴分开（§2.4）。

### 2.3 SSOT §2 改后长什么样

替换为四个词一行一个（定义、判定证据、行内必写），并加两句说明：①本列只用于「包成熟度」格（含未来目标路径行），与「运行状态」不同；②每个词的判定证据来自行文与迁移切片验收，不读 `scripts/workspace-packages.mjs` 或 `package.json`（避免循环论证）。`scripts/package-owners.mjs` 按本文 §4.11 增加「成熟度格必须是四个词之一 + 与 registry 一致」的检查（Q5 决定是校验还是生成）。

### 2.4 合同轴：`ContractMaturity`（取值不变，只改名）

`packages/contracts/src/platform/package.ts` 现在的 `PackageMaturity` 同时给 `PackageDescriptor` 和 `ContractDescriptor` 用。本片删除 `PackageDescriptor`/`PackageKind`/`PackageMaturity`，新增：

```ts
export type ContractMaturity = "contract-only" | "partial" | "implemented";
```

`ContractDescriptor.maturity` 改为 `ContractMaturity`，**49 个合同描述符一个字不改**（取值仍只有 `contract-only` 与 `partial`）。理由：合同描述符的 maturity 表达的是「这个合同子路径实现到什么程度」，与包的产品承诺不是同一件事；把两轴混成一个词表会让 49 个合同文件跟着改，且会把 `contract-only`（合同只有类型）误读成包状态。`packageContract` 常量保留（它的 maturity 就是合同轴的 `contract-only`）。

## 3. 逐包映射（建议；production 集合待统筹/用户确认）

### 3.1 全表

旧 = 当前 SSOT/registry 的 maturity；新 = 建议值；理由一列带证据。

**Apps（6）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `apps/desktop` | partial | production | 产品壳、原生 bridge、面板与发布工具已交付；行内无未完成目标能力 |
| `apps/workbench` | partial | production | 产品 UI 组合根在用；行内无未完成目标能力 |
| `apps/local-host` | partial | production | 唯一项目库与业务装配，真实 Home 在用 |
| `apps/server` | partial | **experimental** ⚠ | 行文：独立启动器、无产品入口、只有跨设备测试在用、去留随功能迭代另定；roadmap 提案「标实验并写删除条件」；需产品语义确认 |
| `apps/cli` | partial | production | root bin 与协议 adapter 已交付 |
| `apps/mcp` | partial | production | 受保护的 MCP 入口与工具在用 |

**Server（1）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `server` | partial | production | 右栏「讨论」页签后端在用、继续迭代；`spec.md` §1 用户 2026-10-08 决定（保留并迭代，只修数据登记/越界读表/归类） |

**Foundation（10）与 tooling（1）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `packages/contracts` | contract-only | production ⚠ | 公开类型/Schema 真实且被全部包依赖；旧词意为「无假实现」不是占位（R-11 已确认） |
| `packages/kernel` | partial | production | Capability registry 与 ActionService 主路径已验收 |
| `packages/plugin-runtime` | partial | production | 安装/授权/生命周期/回滚已验收（FD3/DV3） |
| `packages/plugin-sdk` | partial | production | 作者面 API 已交付，SDK 只依赖 contracts |
| `packages/storage` | partial | production | SQLite/文件/事务/备份端口已交付 |
| `packages/ui-host` | partial | **slice** | 行文：Installed Plugin 隔离与完整安全 bridge 仍待独立实现 |
| `packages/design-system` | partial | production ⚠ | 实现在用；「Native 包布局待验」是验证待办，不改变目标职责 |
| `packages/test-kit` | partial | **slice** | 行文：时钟、fake capability 与其余重复 harness 待迁移 |
| `packages/im-ui` | partial | production | 行文：在用、还会迭代，不是待删实验（同 `spec.md` §1 决定） |
| `packages/plugin-sandbox` | partial | production ⚠ | 创作台沙箱后端已交付；行内无未完成目标能力 |
| `tooling/plugin-cli` | partial | production | create/pack/dev 已交付 |

**Modules（13 + server 已列）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `modules/projects` | partial | production | Project/Catalog 事实与删除回执已验收 |
| `modules/context-ledger` | partial | **slice** | 行文：未来 publication / 异步 materialization 未实现（AR2 已验收） |
| `modules/sources` | partial | production | FD1-FD4/Cutover 已验收 |
| `modules/signals` | partial | production | 同上 |
| `modules/feed` | partial | production | 旧 FeedStore 已删除，拆插件剩余部分在插件行 |
| `modules/attention-resumption` | partial | **slice** | 行文：完整 snooze/resume 仍是未来能力 |
| `modules/goals` | partial | production | GW1-GW6/DD1/DD2/Cutover 已验收 |
| `modules/private-work-context` | partial | **slice** | 行文：Sessions 下线后重做见 BL-177 |
| `modules/artifacts` | partial | production | AR1 已建唯一事实、AR3 切换已验收 |
| `modules/shelf` | partial | **slice** | 行文：轮盘/热键仍待 Desktop |
| `modules/characters` | partial | **slice** | 行文：产品接入中（coding-c12） |
| `modules/functions` | partial | production | 函数库与判断落库已交付 |
| `modules/governance-collaboration` | partial | production | EX3/EX4/AR2/DD 已验收 |

**Horizontal（9）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `horizontal/connector-host` | partial | production | FD1/FD3/AP2/Cutover 已验收 |
| `horizontal/listener-host` | partial | production | 同上 |
| `horizontal/scheduler` | partial | production | once/interval 由 Schedule 插件拥有，调度主路径已验收 |
| `horizontal/runtime-host` | partial | **slice** | 行文：Codex 会话适配器随 Sessions 下线删除，Sessions 重做见 BL-177 |
| `horizontal/agent-host` | partial | production | Plugin Platform v2 与 Prologue 单执行引擎已验收 |
| `horizontal/knowledge` | partial | production | KnowledgeService 与系统动作已交付 |
| `horizontal/search` | partial | production | SearchService 与索引/恢复已交付 |
| `horizontal/memory` | partial | production | MemoryService 与写入闸门已交付 |
| `horizontal/placement` | partial | production | PlacementService 与系统动作已交付 |

**内置插件（24）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `plugins/native/alchemist` | partial | production | Direction/Lens/证据/Pulse 等已验收 |
| `plugins/native/artifacts` | partial | production | AR3 已验收；「真实账号联调待验」是验证待办 |
| `plugins/native/coding` | partial | production | 19 项 coding.* 已交付（next-requirements 是后续） |
| `plugins/native/cognia` | partial | **slice** ⚠ | 行文：Cognia 2（生成插件方向）需求书未实施 |
| `plugins/native/dataset` | partial | production | 多维表格编辑/导入导出/回滚已交付 |
| `plugins/native/diff` | partial | production | 变更集消费者与过程项已交付 |
| `plugins/native/feed` | partial | **slice** | 行文：Inbox/Feed 拆插件切片 3 未完成 |
| `plugins/native/files` | partial | production | 目录/预览/过程项已交付 |
| `plugins/native/form` | partial | production | 建题/预览/提交/结果已交付 |
| `plugins/native/git` | partial | production | 工作区 Git 服务与动作已交付 |
| `plugins/native/goals` | partial | production | 事件意图/树/Journal 主线已交付 |
| `plugins/native/images` | partial | production | 生图与 Home 原库已交付 |
| `plugins/native/inbox` | partial | **slice** | 行文：Inbox/Feed 拆插件切片 2–3 未完成 |
| `plugins/native/issues` | partial | production | Home 库、页面、MCP 共用已交付 |
| `plugins/native/jelly` | partial | production | Home 原库与有限服务已交付 |
| `plugins/native/lingguang` | partial | production | 快记/导入/灵感转笔记已交付 |
| `plugins/native/pages` | partial | production ⚠ | 行文只列已实现能力（ProseMirror、批注、卡、Promote）；「外部文件预览/批量导入与幂等收据」是否已达目标待统筹 |
| `plugins/native/plugin-builder` | partial | production ⚠ | 创作台已交付（SSOT 插件创作工作台节） |
| `plugins/native/ppt` | partial | production ⚠ | 导出明确不含图片与图表（范围限制，非缺目标片） |
| `plugins/native/schedule` | partial | **slice** | 行文：其他插件 job 仍只展示与暂停（创建/编辑未做） |
| `plugins/native/shelf` | partial | **slice** | 行文：轮盘/抓页/CLI Recipe 待 Desktop |
| `plugins/native/text-stats` | partial | production | 两个查询动作已交付 |
| `plugins/native/todo` | partial | production | 待办/日期/撤销/视图已交付 |
| `plugins/native/workflows` | partial | production | 交接幂等与 delegate 身份已交付 |

**非包行（1）**

| 行 | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `apps/workbench/src/functions` | partial | production ⚠ | 非 workspace 包的目标路径行（「系统能力服务的判断编辑器」，入口在「能力」）；功能已交付。行本身是否保留见 Q6 |

**官方接入（6）**

| package | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `plugins/official-integrations/catalog` | partial | production | 目录/OAuth/文档导入已交付 |
| `plugins/official-integrations/github` | partial | production | Device OAuth/Provider/快照已交付 |
| `plugins/official-integrations/gmail` | partial | production | OAuth/账号/scope/cursor 已交付 |
| `plugins/official-integrations/rss` | partial | production | 目录/custom RSS/正文分类已交付（真实公开 RSS 拉取是验证待办） |
| `plugins/official-integrations/web-query` | partial | **experimental** ⚠ | 唯一登记在案的非产品包（`package-inventory` 状态 `非产品`），无产品调用方；需写删除或默认关闭条件 |
| `plugins/official-integrations/youtube` | partial | production | Channel 标识与 Provider adapter 已交付 |

**Absent（8）**

`packages/exchange`、`packages/observability`、`modules/identity-team-access`、`modules/sync-replication`、`modules/actions`、`modules/automation`、`plugins/native/actions`、`plugins/native/automation` → 全部保持 `absent`。

### 3.2 需统筹/用户确认的行（10 行标 ⚠，另加 2 条语义问题）

1. `apps/server` → experimental？（生产入口/去留是产品语义，roadmap 有提案但未决）
2. `packages/contracts` → production？（旧词唯一使用者；若统筹认为「只有类型、无实现」应算 slice，则改 slice 并写清缺哪片）
3. `packages/design-system` → production 还是 slice（「Native 包布局待验」算验证待办还是缺片）
4. `packages/plugin-sandbox` → production 还是 experimental（创作台实验属性）
5. `plugins/native/pages` → production 还是 slice（「外部文件预览/批量导入与幂等收据」是目标缺口还是验证）
6. `plugins/native/plugin-builder` → production 还是 slice（创作台 v3 的未完成项）
7. `plugins/native/cognia` → slice 还是 production（Cognia 2 是产品目标还是后续方向）
8. `plugins/native/ppt` → production（范围限制）还是 slice
9. `apps/workbench/src/functions` 非包行 → production / slice / 删行（Q6）
10. `plugins/official-integrations/web-query` → experimental 还是 slice / 直接删除（Q2）
11. `server` 与 `packages/im-ui` → production 依据是 `spec.md` §1 的 2026-10-08 用户决定；若统筹认为 roadmap 的「实验线」提案更新，则两者改 experimental 并写条件
12. 其余 production 行里，`plugins/native/artifacts`、`official-integrations/rss` 有「真实验证待办」；若统筹把「有未完成验证」也算 slice，这两行要改

### 3.3 分布

- 建议值：**production 55、slice 13、experimental 2、absent 8**；另有 1 个非包行（production ⚠）。
- 若统筹把 3.2 的 4、5、6、7 判成 slice，最多是 production 51 / slice 17；无论怎么调，机制不变，只改 SSOT 格与 registry 值。
- sanity check：每个 `production` 行都能在 SSOT 行文里指出「主路径已验收」的证据；每个 `slice` 行都能指出缺的那片与后续 Goal/BL；每个 `experimental` 行都写了条件。

## 4. 单一写入源设计（三处重复的去向）

### 4.1 权威分工（建议写成规则）

| 包类型 | 包描述的权威写入点 | 读取方式 |
| --- | --- | --- |
| 46 个非插件包（apps/server/packages/modules/horizontal/integrations/tooling） | `scripts/workspace-packages.mjs` 的 `entry(...)` 调用 | registry 直接持有；`package.json` 不再有 `molis-work` 块 |
| 24 个内置插件 | 各包自己的 `plugins/native/*/package.json` 的 `molis-work` 块（W5-02 已定） | `nativePluginEntries` 读入并展开成 registry 条目 |
| 两者都不是事实的主人 | `src/index.ts` 的 `packageDescriptor`、README 三行、`package.json` 的 `molis-work`（非插件） | 删除，不再生成/校验 |

规则一句话：**包描述写在它所属的那一类作者面文件里，只写一次；跨文件只保留「形状与取值合法性」校验，不再做「三处相等」式对拍。** 与 roadmap:473「包清单的权威来源唯一：scripts/workspace-packages.mjs」的张力按 W5-02 的既有裁定解释：清单仍由 registry 点名（非插件），插件条目由路径发现 + 包内声明（W5-02）；本片只要求每项事实只写一处。

### 4.2 `packageDescriptor` 的去向

- 删除 70 个 `src/index.ts` 里的 `export const packageDescriptor = {...}`（含 `tooling/plugin-cli`、`packages/contracts`），删除 52 个 `export type MolisWorkPackageDescriptor = typeof packageDescriptor;`。
- 删除 `packages/contracts/src/platform/package.ts` 的 `PackageDescriptor`、`PackageKind`；`PackageMaturity` 改名为 `ContractMaturity`；`packages/contracts/src/index.ts` 与 `packages/plugin-sdk/src/index.ts` 的再导出跟着改/删。
- 删除 `scripts/workspace-packages.mjs:216-220` 的字符串包含检查与 `:222-223` 的 `contract-only` 例外规则（这条规则在词表里没有对应物；`packages/contracts` 的纯度由 `scripts/gates/contracts-purity.mjs` 与 `CONTRACT_SUBPATHS` 检查覆盖，见 §4.11）。
- 没有替代物：它是死元数据，信息（契约入口、能力名、成熟度）已经在 registry 或插件块里。
- 影响：`tooling/gates/api/contracts/index.txt`、`contracts/platform/package.txt`、`plugin-sdk/index.txt` 三份快照更新（§5.1）。

### 4.3 `migrationGoals` 的去向

- 删除：`scripts/workspace-packages.mjs` 的 `entry` 形参/返回值与基础 `goal-reorg-f2` 注入；70 个 `package.json` 的 `molis-work.migrationGoals`；59 个 `src/index.ts`（随 descriptor 一起删）；70 个 README 的 `Migration Goals:` 行。
- 删除 `checkWorkspacePackages:187` 的深相等检查与 `:229-233` 的 README 逐 id 检查。
- 历史信息不迁移：goal id 是迁移期记账，SSOT「迁移 / 实现 Goal」列（人写的 AP3/FD4/… 标签）、roadmap、各 slice 文档和 git 历史已经保存了同一段历史；registry 里的 29 个编号没有运行时读者，保留只会继续漂移。
- 兼容标记：`scripts/check-health-gates.mjs:441-460` 的 `COMPAT_MARKERS` 会把 `legacySources` 里的 `legacy` 记到 `scripts/workspace-packages.mjs`（若 scripts 在扫描范围内）；删除后该计数只会减少（§5.2）。

### 4.4 `legacySources` 的去向

- 直接删除：`entry` 的形参/返回值、`nativePluginEntries` 的读取、40 个包的数据（46 个非插件条目里的 `[]` 也一并去掉形参位置）、24 个插件块里的键。
- 理由：全仓零读者；57 条里 56 条指向已不存在的文件；W5-15 的任务书明确要求清理。没有信息需要合并到别处。
- 注意：roadmap 与历史文档里的 41/61/56 数字不改（roadmap 是历史证据）；新数字 40/57 写进本方案即可。

### 4.5 相邻死字段 `summary` / `notResponsibleFor`

两者**零读者**（README 的「负责/不负责」是给人看的另一份，`checkDevRequirements` 不读它们）。建议同批删除（非插件 entry 的形参、插件块的键），理由：与 `legacySources` 同类的死元数据，留着会继续变高。**但 W5-15 任务书没有点名它们，标为 Q4 由统筹决定；若裁定保留，本片不动，只删点名的三样。**

### 4.6 非插件 `package.json` 的 `molis-work` 块

- 删除 46 个非插件包 `package.json` 里的整个 `molis-work` 块（含 path/kind/maturity/contract/ssot/capabilities/migrationGoals 等）。
- 门禁：`checkWorkspacePackages` 增加「非插件包不得有 `molis-work` 块」检查（防止再加回来）；插件包块做白名单校验（§4.7）。
- 保留 `package.json` 的其他内容（name/private/version/scripts/exports/dependencies）与现有依赖边界检查不变。
- 例外：`plugins/native/*` 保留块（§4.7）；没有其他例外。

### 4.7 内置插件 `molis-work` 块收窄

W5-02 的块里有 13 个键；本片收窄为允许的 5 个键：

```
"molis-work": {
  "maturity": "production",           // 必填，∈ {production, experimental, slice}
  "capabilities": ["...", "..."],     // 必填，字符串数组
  "registration": "./registration",   // 必填，固定值
  "extraWorkspaceDependencies": [...],// 可选，内部包名数组
  "extraDependencies": {...}          // 可选，外部依赖
}
```

- 删除键：`path`、`kind`、`contract`、`ssot`、`summary`（Q4）、`notResponsibleFor`（Q4）、`legacySources`、`migrationGoals`。
- `nativePluginEntries` 改为从路径/常量推出 `path`（目录）、`name`（`package.json.name`）、`kind`（`native-plugin`）、`contract`（固定 `@molis-ai/molis-work-contracts/platform/plugin`）、`ssot`（固定 `docs/SSOT-MATRIX.md`）、`owner`（`packageOwner` 规则）。
- `maturity` 不再强制成常量：允许逐插件声明（`production`/`experimental`/`slice`；`absent` 对已存在的包无意义，拒绝）。RAC-576 的语义变成：插件不能自报 `path`/`kind`/`contract`（块里出现即报错），maturity 必须 ∈ 词表。理由：词表要在 24 个插件之间也有区分度，否则又会回到「全是同一个值」。
- `REGISTERED_PLUGINS` 与 `registeredPluginDependencies` 的推导不变。

### 4.8 README 页脚三行

- 删除 70 个 README 的 `Status: \`<maturity>\``、`- Contract entrypoint: ...`、`- Migration Goals: ...` 三行（位置不一的按实际行删；若与正文混行则只删元数据片段）。
- 删除 `checkWorkspacePackages:229-233` 的对应检查；README 的「## 开发要求」整节不动（`checkDevRequirements` 继续管：负责/不负责/公开入口/依赖/不变量/改动后必跑/相关手册）。
- 理由：三行是第四份包描述，且门禁只要求「包含」不要求位置，已经出现位置漂移。

### 4.9 登记表 `entry()` 的形状与保留的校验

建议签名收成 `entry(packagePath, contract, status = {})`：

- loader 在模块加载时由 `packagePath` 推出 `name`（读 `package.json.name`）、`kind`（路径规则：`apps/*`→app、`server`→module、`packages/*`→foundation、`modules/*`→module、`horizontal/*`→horizontal、`plugins/native/*`→native-plugin、`plugins/official-integrations/*`→integration-plugin、`tooling/plugin-cli`→tooling）、`owner`。
- `status` 保留：`maturity`、`capabilities`、`extraWorkspaceDependencies`、`extraDependencies`、`registeredPluginDependencies`。
- 46 个非插件调用改成三参；24 个插件条目来自包声明（不进手写列表）。
- 保留的跨文件校验（不再有「三处相等」，但仍有意义的）：
  - 每包 `package.json` `private === true`、`version === "0.0.0"`、`scripts.build/typecheck`、`exports["."]` 走 `dist/`；
  - 依赖集合恰等于 `contracts + extraWorkspaceDependencies + extraDependencies`（**保留**：`packages/test-kit/src/boundaries.ts` 的 `undeclared-workspace-dependency` 只防「用了没声明」，不防「声明了没用」；这条相等检查是今天唯一的未用依赖守卫。若未来改成从 import 推导，另开片）；
  - 包名唯一；`kind` 与路径规则一致（loader 推出，无需对拍）；
  - 每个包有 `package.json/tsconfig.json/README.md/src/index.ts`；
  - 多余 `package.json` 扫描、`CONTRACT_SUBPATHS`、`pnpm-workspace.yaml` globs。
- `scripts/gates/module-repository-exports.mjs` 的文本解析跟着改：从 `entry("<path>", "<contract>"` 中取路径，kind 由路径规则推（不再解析第三个参数）。

### 4.10 capabilities 单一来源与漂移收口

- 权威：非插件包 = registry 条目；内置插件 = 插件块（loader 读入后即 registry 条目）。`src/index.ts` 不再声明能力名。
- 收口清单（实测）：
  - `apps/workbench/package.json:83` 的 `workbench.goals-proposal-composition.v1`：全仓唯一出现，删除（孤儿）。
  - `plugins/native/schedule/src/index.ts` 多 `schedule.conversation-tasks.v1`、`schedule.actions.v1`；`plugins/native/shelf/src/index.ts` 多 `shelf.actions.v1`；`plugins/native/workflows/src/index.ts` 多 `workflows.actions.v1`。这些只出现在 descriptor 里（registry/包块没有），descriptor 删除后自然消失；**默认按死名字处理，不补进 registry**（`cleanup-audit` §0 第 6 条的判断：若仍是现行能力，补进登记表；本方案取「不补」，因为没有任何代码按名字消费它们，且 `*.actions.v1` 是旧命名——若统筹要求保留，在 M1 里补进 registry 一行即可）。
  - `characters.actions.v1`：registry、`package.json`、descriptor 三处一致，保留（registry 里已有）。
- 新增校验：非插件包不允许有 `molis-work` 块；插件块白名单（§4.7）；「registry 能力名 == 插件块能力名」由「同源」自动成立，不再需要三方对拍。
- 说明：能力名目前没有产品消费方（只有 goals/governance 的硬编码检查读），所以这次是「把自我描述收成一份」而不是改行为。

### 4.11 门禁改动矩阵（改 / 删 / 加）

| 位置 | 动作 | 完成后的断言 |
| --- | --- | --- |
| `scripts/workspace-packages.mjs:7-34` `entry` | 改 | 新签名；无 `migrationGoals`/`legacySources`/`summary`/`notResponsibleFor`；maturity 必填且 ∈ 词表 |
| 同文件 `:48-63` `nativePluginEntries` | 改 | 插件块白名单（§4.7）；maturity ∈ 词表；path/kind/contract/ssot 由路径与常量推出 |
| 同文件 `:182-191` | 改 | 保留 private/version/scripts/exports/依赖；删 `molis-work.path/kind/maturity/contract/ssot/migrationGoals` 对拍（非插件已无块；插件块由 loader 校验） |
| 同文件 `:216-223` | 删 | src descriptor 字符串检查与 `contract-only` 例外规则 |
| 同文件 `:225-233` | 删 | README Status/contract/migrationGoal 检查；`checkDevRequirements` 保留 |
| 同文件（新） | 加 | 非插件包若有 `molis-work` 块报错；registry maturity 名不符报错（消息带包路径） |
| `scripts/gates/module-repository-exports.mjs:23-43` | 改 | 按新签名解析路径；kind 由路径规则推 |
| `scripts/package-owners.mjs` | 加 | SSOT「包成熟度」格：首反引号词 ∈ 四词；真实行 == registry maturity；absent 行 == `absent`；非包行（`apps/workbench/src/functions`）只查词表成员（Q5：校验还是生成） |
| `scripts/check-package-boundaries.mjs:431-440` | 改 | `modules/goals` 的 registry 条目 maturity 为 `production` 且包含 `goals.lifecycle.v1`/`planning.v1`/`query.v1`（意图保留，数据源改 registry） |
| 同文件 `:690-697` | 改 | `modules/governance-collaboration` 的 registry 条目 `production` 且含两个 governance 能力 |
| 同文件 `checkArtifactsOwnership`（899 起，976-1000） | 改 | 保留「入口不构造 Artifact Repository / 不改 owner 事实」的 forbidden 检查；入口 source 的 `maturity: "partial"`、4 个能力字符串改读 registry；插件侧从 `contract:`/goal id 字面量改为「插件块存在且 `registration` 合法、入口不含 modules/artifacts 与 ArtifactRepository」 |
| 同文件 `checkPrivateWorkContextOwnership`（1047）| 改 | 入口 source 的 `maturity: "partial"`/能力字符串改读 registry；其余不变 |
| 同文件 `checkRuntimeHostOwnership`（1117）| 改 | 同上 |
| `scripts/gates/contract-placeholders.mjs` | 不改 | 结构识别不变 |
| `scripts/gates/package-inventory.mjs` | 不改 | 行集合/层/状态不变；`spec.md` §5.1 不重生 |
| `scripts/gates/api-snapshot.mjs` 快照 | 改 | `pnpm api:update` 刷新三份文件（§5.1） |
| 测试 | 改/加 | 见 §4.12 |

**「删检查」的说明（审查要点）**：`src/index.ts`/README/`package.json` 三方对拍被删，是因为被检查的副本本身被删；不是放宽。哪些意图仍有断言、落在哪里，见上表「完成后的断言」列；没有替代的项只有 `contract-only` 例外规则（其唯一主体 `packages/contracts` 由 `scripts/gates/contracts-purity.mjs` 与 contracts 子路径检查覆盖）。

### 4.12 测试改动

| 文件 | 动作 |
| --- | --- |
| `tests/plugin-registry-generation.test.ts` | RAC-576 改成 W5-15-03/04：块里出现 `path`/`kind`/`contract` 报错、`maturity: "partial"` 报错（旧词不再接受）、`maturity: "production"` 通过；夹具块改成新形状 |
| `tests/workbench-registration-boundaries.test.mjs` | 断言用到 `entry` 字段的地方跟随新形状（path/name/kind 仍由 loader 提供） |
| `tests/package-owners.test.mjs` | 加 SSOT 成熟度格与 registry 不一致时报错、absent 行规则；现有归属/CODEOWNERS 用例保持 |
| `tests/package-inventory-gate.test.ts` | 不改 fake registry 形状（`export const WORKSPACE_PACKAGES`）；确认新增检查不误伤 scratch 仓 |
| `tests/doc-reference-gates.test.ts` | `ContractDescriptor` 夹具只改类型导入名（若导入了 `PackageMaturity`） |
| 新增 `tests/package-maturity-vocabulary.test.ts`（名称以 W5-15 开头注释） | 词表/SSOT 一致性/SSOT 行改词、改行、未知词三种 mutation；非插件 `molis-work` 块回归拒绝 |
| 其余（`package-dev-requirements.test.ts` 等） | 只跑，不改；发现夹具依赖被删字段时改夹具并记在 PR 说明 |

## 5. 影响

### 5.1 公开 API 与合同变更（是合同变更）

`packages/contracts` 的 `platform/package` 子路径形状变化：

- 删除导出：`PackageDescriptor`、`PackageKind`、`PackageMaturity`；新增 `ContractMaturity`；`ContractDescriptor.maturity` 的类型别名换名（取值不变）。
- `packages/plugin-sdk` 根导出删除 `packageDescriptor` 常量与 `MolisWorkPackageDescriptor` 类型；`packages/contracts` 的根导出去掉上述类型。
- 快照：`tooling/gates/api/contracts/index.txt`、`tooling/gates/api/contracts/platform/package.txt`、`tooling/gates/api/plugin-sdk/index.txt`，用 `pnpm api:update` 刷新。
- 影响说明（写进阶段2 PR 说明）：这些导出在全仓零 importer、不在任何插件文档里作为公开 API 出现；删除不影响插件作者已文档化的入口（`definePlugin`/Manifest/ActionCard 等不动）。contracts 子路径没有版本号（`docs/system/CONTRACT-CHANGES.md`），按现行规则不留兼容期，快照与形状由本 PR 一起改。

### 5.2 `pnpm health:check` 数字

- API 快照：会变，先 `api:update`，不是「只许减少的数字」。
- `compat`（兼容标记，`[Ll]egacy` 等按文件计数）：`scripts/workspace-packages.mjs` 的 `legacySources` 会命中 `[Ll]egacy`；若 `scripts` 在扫描范围，删除后计数减 1，只会减少。实际以 `node scripts/check-health-gates.mjs --base origin/main --report` 为准。
- 巨大单元：`scripts/workspace-packages.mjs` 只会变短（删字段/改签名）；新增 loader 逻辑拆成小函数，按 `tooling/gates/limits.json` 的 `functionLines` 自检；`tests/...` 新文件从 0 开始。
- `module-repository-exports` 的计数（8 个入口）：行集合不变，预期数字不变；解析方式变化要在 `--report` 里确认。
- `package-inventory`：行集合、层、状态不变；`spec.md` §5.1 表不重生。
- 源码计数（旧名/空 catch/`as unknown as`/`explicit any`/console）：新代码按 0 写；不新增任何一项。
- 翻译、页面资源、动作合同快照：不涉及。
- spec 状态句：新增文件在 `specs/repository-anti-corruption/slices/` 下，不在 `specs/` 根目录的 spec 目录判定范围内（`scripts/gates/spec-index.mjs` 与 `scripts/check-health-gates.mjs:498-511` 只看 `specs/<dir>/spec.md`），预期不增加状态句计数；阶段2 用 `--report` 复核。

### 5.3 文档与技能

- `docs/SSOT-MATRIX.md`：§2 词表换四个词；§1 第 21 行与 §8 的说明措辞跟着改；§3-§7 的 70 行成熟度格换词（保留必要括号注释）；构成句改成 70 = 6+1+10+13+9+24+6+1 并写日期；8 个 absent 行不动。
- `skills/molis-plugin-dev/host.md:90`：插件块字段清单改成 §4.7 的 5 个键；删「kind 与 maturity 也由目录定」中关于 maturity 的部分，改成「maturity 由插件包声明，取值 ∈ 词表；kind/contract 由路径与常量定」；`legacySources`/`migrationGoals`/`summary`/`notResponsibleFor` 的提法删除。
- `docs/SSOT-MATRIX.md:50` 与 `specs/repository-anti-corruption/spec.md` §4.4 的状态句：本片只改数字错误（构成句），不把 §4.4 标完成——那属于统筹归档。`spec.md` §5.1 表不动。
- AGENTS.md：建议加一句「包成熟度词表在 SSOT §2，registry 与 SSOT 一致由 `scripts/package-owners.mjs` 检查」；是否改 AGENTS 由统筹定（AGENTS 是枢纽文件）。

### 5.4 不在本片（说明理由）

- **Manifest 版本重置与下一次发布**：W5-15 roadmap 行还包含「Reset Manifest versions under the policy and cut the next release」，但用户任务书把这一段排除（版本由用户定）。现状：`docs/releases/POLICY.md:59,64` 与 `spec.md:2074/2745` 已记 0.3.0 跟随产品版本的 2026-10-08 决定；本片不动 `docs/releases/`、不改任何 Manifest 版本、不切版本。
- **`summary`/`notResponsibleFor`**：只建议删，等 Q4。
- **registry 全量改成读 46 个非插件 `package.json`**（另一种单写源方向）：需要另做依赖期望来源（删掉「声明了没用」守卫），超出本片，留作后续片（roadmap 若要可另开）。
- **`extraWorkspaceDependencies`/`extraDependencies` 与 `package.json` dependencies 的重复**：本片保留（它是今天的未用依赖守卫）；若要收口另开片。
- **spec 归档、roadmap 勾选、release 记录**：统筹/用户。
- **`docs/reviews/cleanup-audit-2026-10-20.md` 的修订**：历史证据不改；其结论已在本片处理。

### 5.5 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 映射是产品语义，拍错会误导后来者 | 每条理由带 SSOT 行文；⚠ 行单独列给统筹；机制与取值解耦，改词只动 SSOT 格与 registry 一个值 |
| 删检查被误读成放宽门禁 | §4.11 每条「删」都写明被删的对象也删了、意图转移到哪；没有替代的只有 `contract-only` 规则并说明覆盖者 |
| `entry()` 签名变化碰 `module-repository-exports` 文本解析、testing 夹具 | 同提交改解析与夹具；用 `pnpm boundary:check` + 定向测试兜底 |
| 插件块收窄后 `generate-plugin-registry`/装配门禁受影响 | 生成器只读 `registration`；同提交跑 `node scripts/generate-plugin-registry.mjs --check` 与 `tests/plugin-registry-generation.test.ts` |
| API 快照/plugin-sdk 影响外部插件作者 | 零 importer + 快照 diff 只有预期符号；PR 说明写影响；不升版本（合同子路径无版本号） |
| 阶段2 开工时 batch-39 后又有分支改同一批文件 | §8.1 开工前核对：`git fetch`、看 `git log origin/main`、`gh pr list --search` 查在途 PR 是否碰 `workspace-packages.mjs`/`check-package-boundaries.mjs`/`package-owners.mjs`/api 快照/插件 package.json |
| 读 `package.json` 的 loader 在 scratch/CI 环境不可用 | 只信任仓库内路径；`nativePluginEntries` 已是同步读文件；`package-inventory-gate.test.ts` 的 fake registry 不经过 loader |
| 70 个 README / 70 个 src / 70 个 package.json 机械改动的遗漏 | 用一次性脚本改 + `git grep` 断言零残留（W5-15-05/06/07），失败即红 |

## 6. 验收编号（阶段2 落地；每条都要有测试名/注释或命令）

| 编号 | 验收内容 | 证明 |
| --- | --- | --- |
| W5-15-01 | SSOT §2 只有 `production`/`experimental`/`slice`/`absent` 四个词，旧迁移期词退役说明在（允许在一行退役说明里点名旧词，不得再出现在状态表）；§1/§8 措辞一致 | 文档 diff；`git grep -n "legacy-mixed\|contract-only\|implemented"` 在 SSOT §2 为零（历史文档除外） |
| W5-15-02 | SSOT「包成熟度」格：真实 70 行 == registry maturity；8 个 absent 行 == `absent`；非包行 ∈ 词表 | `tests/package-owners.test.mjs` 新用例（改词/改行/未知词三种 mutation 报错） |
| W5-15-03 | registry maturity 只接受三个值（absent 拒绝），报错带包路径；插件块同理 | `tests/package-maturity-vocabulary.test.ts`；`pnpm boundary:check` 消息 |
| W5-15-04 | 非插件包没有 `molis-work` 块；插件块只有 §4.7 的 5 个键；出现 `path`/`kind`/`contract`/`legacySources`/`migrationGoals` 报错 | 同上新测试 + 三个 mutation（加回块、加回键、改 maturity 旧词） |
| W5-15-05 | 70 个 `src/index.ts` 零 `packageDescriptor` / `MolisWorkPackageDescriptor`；contracts 无 `PackageDescriptor`/`PackageKind`/`PackageMaturity`；新增 `ContractMaturity` | `git grep` 断言零匹配（W5-15-05 注释）+ contracts 测试 |
| W5-15-06 | 代码与数据里零 `migrationGoals`/`legacySources`（历史文档 `specs/archive`、`docs/reviews`、roadmap 除外） | 定向 grep 白名单断言；README/package.json/src 三处零匹配 |
| W5-15-07 | 70 个 README 无 `Status:`/`Contract entrypoint:`/`Migration Goals:` 三行；「## 开发要求」检查仍通过 | `git grep` + `checkDevRequirements` 现有测试 |
| W5-15-08 | `pnpm api:update` 后 API 快照 diff 只有预期符号；`node scripts/gates/api-snapshot.mjs --check` 通过 | 快照 diff 贴进 PR 说明 |
| W5-15-09 | capabilities 单一来源：`apps/workbench` 孤儿删除；3 个插件的 4 个 descriptor-only 名字为零；能力名只在 registry/插件块 | grep 断言 + 新测试 |
| W5-15-10 | 原三方对拍改成的单源检查不空转：goals/governance 的 registry 断言、artifacts/private-work-context/runtime-host 的入口断言仍有对应负例 | `tests/package-boundaries*.test.*`（若无则补最小负例；只加测试，不放宽） |
| W5-15-11 | `pnpm boundary:check`、`node scripts/gates/package-inventory.mjs`、`node scripts/check-health-gates.mjs --base origin/main` 全绿且数字不增 | 命令输出贴 PR 说明 |
| W5-15-12 | SSOT 构成句数字正确（70 = 6+1+10+13+9+24+6+1）且日期更新 | 文档 diff |
| W5-15-13 | 构建通过（机器时段）；定向非浏览器测试通过 | `node scripts/machine-slot.mjs run build --label w5-15-build -- pnpm build`；`node scripts/machine-slot.mjs run browser --label w5-15-test -- node scripts/run-tests.mjs --jobs 1 <files>` |
| W5-15-14 | `pnpm secrets:check` 通过；无未提交改动；分支与提交清单在交付评论里 | 命令输出 + `git log --oneline` |
| W5-15-15 | 本方案文档随阶段2 分支入 `specs/repository-anti-corruption/slices/w5-15-maturity.md`；PR 说明逐条对照本表 | 文件 + 评论 |
| W5-15-16 | 未做清单写清楚（manifest/发布/release、summary 若 Q4 保留、spec 归档、另开片的重复项） | PR 说明末尾 |

## 7. 待统筹裁定

| # | 问题 | 建议 |
| --- | --- | --- |
| Q1 | §3 的 production 集合（⚠ 行与 2 条语义问题）是否按建议定？ | 按 §3.1 建议；⚠ 行逐行确认或改，机制不变 |
| Q2 | `apps/server` 与 `plugins/official-integrations/web-query` 标 experimental 是否可接受？删除/默认关闭条件由谁写？ | `apps/server`：无产品入口则保留到「正式 Server/Exchange 功能 Spec」立项时再定；`web-query`：给一个版本期限（如连续两个版本无产品调用方则删/默认关闭） |
| Q3 | 插件 maturity 允许由插件包声明（枚举校验），还是仍由路径/常量定死？ | 允许声明：否则 24 个插件仍只有一个值，词表没有区分度 |
| Q4 | `summary`/`notResponsibleFor` 是否同批删除？ | 删：零读者、与 legacySources 同源 |
| Q5 | SSOT 成熟度列用「校验」（`package-owners` 校验词与 registry 一致，推荐）还是「生成」（`--write` 生成整列，会丢括号注释）？ | 校验；生成会丢「独立启动器/无产品入口」这类注释 |
| Q6 | `apps/workbench/src/functions` 非包行：保留并标 production / 标 slice / 删行？ | 保留并标 production（功能已交付）；行作为目标路径的备注价值有限，若统筹要收 SSOT，可删行 |
| Q7 | `AGENTS.md` 是否加一句成熟度词表归属？ | 加一句（与「归属列」那句并列） |

## 8. 阶段2 执行与交付（等「方案通过」+ batch-39 进 main 后）

### 8.1 开工前核对

1. `git fetch origin main`；确认 batch-39 已进 `origin/main`：`git log origin/main --oneline | grep -E "batch-39|W5-02"`，且 `git show origin/main:scripts/workspace-packages.mjs | grep -c NATIVE_PLUGIN_ENTRIES` 非零。
2. 查在途 PR 是否碰本片文件：`scripts/workspace-packages.mjs`、`scripts/check-package-boundaries.mjs`、`scripts/package-owners.mjs`、`scripts/gates/module-repository-exports.mjs`、`tooling/gates/api/**`、70 个 `package.json`/README、`src/index.ts`；有冲突就让统筹排期，不抢。
3. 从 `origin/main` 开 `deepseek/w5-15-maturity`；把本方案文档放回 `specs/repository-anti-corruption/slices/w5-15-maturity.md`（阶段1 分支只有这一个文件）。
4. 机器时段：构建/测试按任务书只走 `node scripts/machine-slot.mjs`；不做全量、不跑浏览器批次；同一时间不并发构建。

### 8.2 提交拆分（同一分支）

1. **M1 词表与重标**：SSOT §2 四词 + 70 行换词 + 构成句；registry `entry`/`nativePluginEntries` 的 maturity 值；`PackageMaturity`→`ContractMaturity` 与 contracts/plugin-sdk 类型改动 + `pnpm api:update`；`package-owners` 新校验与测试；新测试 W5-15-01/02/03。此提交仍保留重复字段（不删），保证可独立审。
2. **M2 单写源**：删 `src/index.ts` descriptor（70）、README 三行（70）、非插件 `package.json` molis-work 块（46）、插件块收窄（24）；改 `checkWorkspacePackages`/`module-repository-exports`/boundary 硬编码；改测试夹具；W5-15-04/05/06/07/09/10。
3. **M3 收尾**：capabilities 漂移、SSOT 构成句、`skills/molis-plugin-dev/host.md`、AGENTS 一句（若 Q7 同意）；跑 §8.3 全清单；贴证据；W5-15-08/11/12/13/14/15/16。

若统筹要求每个提交都能被单独合入，M2 不能早于 M1；M3 不单独存在。

### 8.3 验证清单（任务书要求 + 本片新增）

```
node scripts/machine-slot.mjs run build --label w5-15-build -- pnpm build
pnpm api:update                                                   # 快照（M1；改过 contracts/plugin-sdk 导出后）
pnpm boundary:check
node scripts/gates/package-inventory.mjs
node scripts/check-health-gates.mjs --base origin/main
node scripts/check-health-gates.mjs --base origin/main --report   # 对照数字
pnpm secrets:check                                                # 推送前，先 git fetch
node scripts/affected-tests.mjs                                   # 选出定向测试
node scripts/machine-slot.mjs run browser --label w5-15-test -- node scripts/run-tests.mjs --jobs 1 <选中的非浏览器文件…>
```

（`pnpm build` 必须在跑测试前完成，安装类测试比对构建指纹；不做全量、不跑浏览器批次，遵守任务书第 2 节限制。）

### 8.4 交付

- 推送 `deepseek/w5-15-maturity`（只推自己的 `deepseek/*` 分支；不推 batch/integration 分支，不 force push）。
- 在 PR #1300（或统筹指定的批次 PR）发一条评论：分支、基线、SHA、三个提交各自做了什么、与方案不一致的地方（逐个说明）、§8.3 的验证结果、没跑的部分、Q1-Q7 的最终取值。
- 不自己开 PR、不合并；等统筹指示。

## 9. 重核数据（只读，2026-10-25，batch-39 `0cbc76492`）

| 数据 | 值 | 取法 |
| --- | --- | --- |
| workspace 包 | 70（app 6、server 1、foundation 10、module 13、horizontal 9、native 24、integration 6、tooling 1） | `node --input-type=module -e '...'` 读 `WORKSPACE_PACKAGES` |
| 成熟度现值 | 69 `partial` + 1 `contract-only` | 同上 |
| `entry(...)` 调用 | 46（非插件） | 同上/`grep -c` |
| migrationGoals | 29 个不同 id；70 包都带基础 `goal-reorg-f2`；59 个 src descriptor 有列表 | 同上 |
| legacySources | 40 包、57 条、56 条路径不存在 | 同上 + `fs.existsSync` |
| packageDescriptor | 70 个；52 个伴 `MolisWorkPackageDescriptor`；0 importer | `grep -rn` |
| README 元数据 | 70 个含 `Status:`，位置不一（9 个行首） | grep |
| package.json molis-work | 70 个（46 非插件 + 24 插件） | grep |
| SSOT 行 | 78 行 = 70 实包 + 8 absent；另加 1 个非包行 `apps/workbench/src/functions` | 只读解析 `docs/SSOT-MATRIX.md` |
| 能力漂移 | 1 个 pkg-only（workbench），3 个插件共 4 个 descriptor-only 名字 | 对比 registry/package.json/src |
| 合同描述符 | 49 个 `as const satisfies ContractDescriptor`；4 个 `contract-only`、其余 `partial` | grep |
| 证据类别 | inventory 运行状态：在用 43、Runtime 18、构建期 6、非产品 3（`node scripts/gates/package-inventory.mjs --table`） | 命令输出 |

重核脚本（不写仓库）：解析 `docs/SSOT-MATRIX.md` 的 `| \`` 行 → 路径/成熟度/行文；`WORKSPACE_PACKAGES` 动态 import；`git grep` 字段名。阶段2 开工时用同一做法复核，数字写在 PR 说明里。

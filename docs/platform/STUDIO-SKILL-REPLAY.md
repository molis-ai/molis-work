# 创作台 Skill 回放与冒烟

状态：2026-10-08，防腐 §4.14（W1-12）。命令 `pnpm studio:replay`，代码在 `scripts/studio-replay.mts` 与 `scripts/studio-replay/`，守护在 `tests/studio-replay.test.ts`。**提交的语料现在只是种子，不含任何真实的完整设计答卷；真实答卷怎样取，用户已在 2026-10-08 定了（见 2.2），但导出还没有做，所以「完整设计一次通过率」这个主数字目前没有被测量。**

插件创作台在运行时把 `skills/molis-plugin-dev` 的章节挂给每个 Agent（`apps/local-host/src/plugin-builder/skill.ts` 的 `CHAPTERS`），并用 `plugins/native/plugin-builder/src/agent-prompts.ts` 的提示词。改这些文字、或改宿主对设计答卷的整理与校验（`agent-authoring.ts` 的 `expandDesign`、`agent-validation.ts` 的 `validateAgentDesign`），就是在改生成插件的做法。本文规定这类改动怎样用同一种方式验证。

## 1. 三件事，各证明什么

| 做什么 | 命令 | 证明 | 不能证明 |
| --- | --- | --- | --- |
| 离线回放 | `pnpm studio:replay` | 语料里的设计答卷，宿主原来接受的仍接受、原来拒绝的仍因同一类原因拒绝（默认语料是种子：手写条目加 3 份真实首轮方案，见 2.2）；创作台各阶段的 Skill 都挂得上（不超过 20000 字） | Skill 或提示词的文字对模型下一次答卷的影响：答卷是固定的，Skill 改了，回放结果也不变；真实完整设计的一次通过率（语料里还没有这类答卷） |
| 挂载摘要 | 同上，报告末尾 | 每个阶段挂载文字的版本号（内容摘要）和字数；与基线不同就列出变了哪一段 | 变化好不好 |
| 生成冒烟 | `pnpm studio:replay smoke` | 在隔离 Home 里，用当前磁盘上的 Skill 与提示词让真实模型做设计，直到设计冻结；报告每个阶段是否一次被宿主接受、修了几轮 | 单次结果的统计意义：真实模型每次答得不同，要改前改后各跑几次看修复轮数 |

所以改 Skill 文字的验证是两步：先回放（秒级，无模型，CI 里也跑），再冒烟（要模型，只在本机）。回放里 Skill 摘要变了，报告会写明「这个回放无法判断它，请跑冒烟」。

## 2. 离线回放

```
pnpm studio:replay                      # 默认语料 + 基线，报告通过率
pnpm studio:replay --verbose            # 逐条列出拒绝原因与接受结果
pnpm studio:replay --base origin/main   # 同时对照 HEAD 与 origin/main 的合并基点（git merge-base）上的基线（CI 用）
pnpm studio:replay --corpus <文件或目录> [--min-pass 0.8]   # 回放自己的语料（含 Home 的运行记录目录），没有基线，可设下限
```

退出码：0 成立；1 有结果变差、基线落后或 Skill 挂不上；2 命令没能运行。

### 2.1 它跑的是什么

每条语料是创作台设计者的一份原始答卷，加上宿主当时给它的上下文（它细化的方案、可用的动作）。回放对它做宿主在 `AgentBuilderWorkflow` 里做的同样几步（`plugins/native/plugin-builder/src/agent-workflow.ts` 的 `propose` 与 `acceptDesign`）：

- `propose`：解析 JSON → 问题或 2–3 个方案 → `normalizeProposal` → 标识唯一、动作在动作目录内；
- `detail`、`revise`：解析 JSON → `expandDesign` → `validateAgentDesign` → 检查 `rework`。

这是**照着宿主的检查另写了一份**（`replay.mts` 的 `proposeAnswer` 和 `designAnswer` 里的 rework 循环），不是调用同一个函数，因为这些检查还在 `AgentBuilderWorkflow` 的私有方法和闭包里。`tests/studio-replay.test.ts` 的「the replay accepts and refuses exactly what the studio workflow does」把默认语料里每条答卷，以及用例自己造的 Home 运行记录（`harvest` 那条用例里的三种答卷）也交给真实的 `AgentBuilderWorkflow`（脚本化的设计者），要求接受与否、拒绝时回给设计者的原话都和回放一致。宿主的这几步改了而回放没跟上，这条用例会红。**它管不到别人的 Home 里的答卷**：那种语料上两份检查若已分叉，没有用例会红（见第 6 节）。等 `AgentBuilderWorkflow` 的纯检查拆出来、回放直接调用同一个函数，再删这份拷贝和这条对照。

报告的主数字是「一次接受率」：每个任务的第一份答卷（`attempt` 为 0）里，宿主不用退回就接受的比例，按来源（`recorded` 模型真实写的、`synthetic` 为检验某条规则手写的）和阶段分开。修复轮的答卷单独计。

**从运行记录来的答卷，动作清单只有设计者当时看到的那部分。** 运行记录里没有宿主当时检查用的整个动作目录，只有设计者拿到的：完整给出的那些动作，加每个来源最多 8 个示例编号（`focusCatalog`，`agent-catalog.ts`）。宿主检查答卷时用的是整个目录（`agent-workflow.ts` 的 `all`）。所以对这类条目（语料里记为 `shownCatalogOnly`）：

- 答卷用了一个没出现在这份清单里的动作，回放会拒绝（`项目能力目录中没有：…`，宿主自己的措辞），而宿主可能接受过。这样的拒绝在报告里单列并标明，每组的通过率后面括号里给出「若宿主接受这些，上限是多少」，不当作普通拒绝（`replay.mts` 的 `CATALOG_MISS`；用例把宿主的两条真实措辞交给这个正则，宿主改了措辞就红）。`--min-pass` 仍把它们当作拒绝（对门禁取保守的一侧）。
- 反方向也有看不见的：只以示例行出现的动作没有 `execution` 声明，在 `query` 里用了收费动作、或插件自己的操作与从未出现过的动作同名，回放不会拒绝，宿主会。
- 报告开头会写明有多少条答卷是这样重建的。

### 2.2 语料

| 来源 | 内容 | 位置 |
| --- | --- | --- |
| 内置 | 设计者提示词里的完整示例（`BUILDER_PROMPTS.designer`），回放时从提示词里取，改坏它就红 | `replay.mts` 的 `builtinEntries` |
| 手写 | 17 条，各针对一条宿主规则：包裹（`<think>`、围栏）、提前闭合、截断、引用错误、空存储示例、收费动作、筛选栏合并、`rework` 等；`expectFailure` 写明它该因什么被拒 | `tests/fixtures/studio-replay/corpus.json` |
| 真实录制 | 3 份 MiniMax 对「随手记」的首轮方案（旧格式） | `tests/fixtures/builder-designer/minimax-notes-v1.json` |
| 自己的 Home | 创作台每次设计者运行都留一份记录：`<Home>/plugin-builder/<项目>/runs/<构建>/builder-runs/<id>.json`（`horizontal/agent-host/src/adapters/plugin-builder.ts`） | 见 2.3 |

**现状要说清：提交的语料是种子，不是真实答卷的语料。** 它由内置的提示词示例、17 条手写条目和 3 份真实的首轮方案组成。能证明「完整设计一次通过率」的真实 `detail` 答卷（2026-09-27 的 66 份，基线 42/66；之后 studio-v3 回放到 227 份，84 份升到 103 份通过，见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md`，现在的数量可能接近后一个数）只在用户真实 Home 的运行记录里，没有进仓库，所以：

- 默认回放的报告里没有 `recorded detail` 一行，并明文写出「完整设计一次接受率没有被测量」，不用手写条目凑一个好看的比例；
- 路线图里 W1-12 那行写的「离线回放 66 份设计答卷」**没有完成**，缺的就是这一步。

**已决定，尚未执行**（用户 2026-10-08，`specs/repository-anti-corruption/spec.md` §1「创作台 Skill 回放用的真实设计答卷」）：从真实 Home 的拷贝里只读导出，逐条审过再提交。记录的做法是：真实 Home 先 APFS 克隆到会话临时目录，只读打开拷贝（目录库里的绝对路径映射到拷贝）；导出需求原文与设计答卷；逐条审有没有个人信息，有就去掉；不读密钥。另两个选项（只放本机不提交；在隔离 Home 里重新生成）没有选。

这一步没有在本分支做：这个仓库里的命令、测试和 CI 都不读真实 Home，工具只读调用者给的目录。轮到做的人这样接：

1. 按上面的决定克隆并只读打开拷贝，对每个项目运行 `pnpm studio:replay harvest --runs <拷贝>/plugin-builder/<项目>/runs --out <暂存文件>`。`harvest` 只读那个目录，导出设计者的答卷和它们的上下文（细化的方案、设计者看到的动作清单），不抄指令、活动与用量。**它也不导出需求原文**：决定里列了要导出需求原文，而 `harvest` 故意不抄简报；要导出，就给 `harvest` 加一个明确的开关，原文只进暂存文件。这是导出那一步要做的小改动，本分支没有做。
2. 逐条读暂存文件，去掉个人信息。条数可能不是 66 或 227：相同的任务与答卷合并；转换不了的记录会跳过并写明原因；2026-10-05 目录收窄之前的答卷现在可能被拒，那是真实信号，不是工具的错。
3. 提交审过的条目，`pnpm studio:replay --write-baseline`，同时改掉本节「现状」、`report.mts` 的 `SEED_NOTICE` 和 `tests/studio-replay.test.ts` 的「the committed corpus is a seed」。

在那之前，手上有运行记录的人可以直接 `--corpus <运行记录目录>` 自己看通过率，不复制任何东西。

### 2.3 把 Home 的运行记录变成语料

```
pnpm studio:replay --corpus <Home>/plugin-builder/<项目>/runs          # 直接回放，不复制
pnpm studio:replay harvest --runs <Home>/plugin-builder/<项目>/runs --out <文件>   # 整理成语料文件
```

回放与整理都只读运行记录目录，递归走下去：读不了、不是 JSON、不是运行记录的文件跳过并写明原因，不中断。整理时：只保留设计者运行里 `propose`、`detail`、`revise` 三个阶段；`experience`、`compose` 与代码运行跳过并说明原因；不抄简报、指令、活动与用量，动作只留编号和整个 `execution` 声明（费用、时限、频率）；这样的条目带 `shownCatalogOnly`（见 2.1 末段）。

**相同的任务与答卷合并成一条。** 同一个构建重试、或同一份记录被拷了两处，会有内容相同的运行记录：编号由阶段加任务与答卷的摘要组成，所以它们是同一条。回放与 `harvest` 都只留名字顺序里第一份，并报告合并了几份（报告里「Same task and answer met more than once」一节，`harvest` 的输出里「merged N」），不报错。编号相同而内容不同的两条（语料文件里的笔误）仍然报错并写明两个文件。

答卷和它细化的方案是用户为自己要的插件写下的内容。**提交进仓库之前逐条读一遍**，去掉个人信息（2.2 里用户的决定）。

### 2.4 基线

`tests/fixtures/studio-replay/baseline.json` 记每条语料现在的结果：接受，或拒绝及原因的种类，加上这条语料的摘要（`digest`，`scripts/studio-replay/corpus.mts` 的 `entryDigest`：阶段、答卷、给它的上下文、来源类别、必须保持的拒绝，不含「出处」「用途」这类关于它的话）。内置的提示词示例（`prompt-example`）每次从提示词里取，没有固定文字，记 `live`；`live` 只许这一个编号用（`replay.mts` 的 `LIVE_ENTRY_IDS`），别的条目都必须带摘要，否则答卷可以在同一编号下被改写而无人察觉。规则对接受的和被拒的条目一视同仁：

| 情况 | 结果 |
| --- | --- |
| 基线里接受的条目，现在被拒 | 失败（回归） |
| 基线里的条目（接受或被拒），不在语料里了 | 失败；真要去掉，在基线 `retired` 里写条目编号和原因 |
| 基线里的条目，同一编号下答卷或上下文变了（哪怕仍被接受） | 失败；旧条目留着，新答卷用新编号，旧编号写进 `retired` 并写明原因 |
| `retired` 里的编号又出现在语料里 | 失败；退役的编号不再使用 |
| 语料里有基线没记的条目 | 失败，用 `--write-baseline` 记下 |
| 基线里拒绝的条目，现在被接受 | 失败，用 `--write-baseline` 把改进记下 |
| 仍被拒，但原因种类变了 | 只提示 |
| 基线里的条目缺 `digest` | 不是基线（退出码 2） |
| 基线里的条目标了 `live`，但编号不是 `prompt-example` | 不是基线（退出码 2）；就算这样的行混了进来，比较时语料里该编号有固定答卷也算「答卷变了」，失败 |
| `--write-baseline` 遇到回归、缺失或答卷变了 | 拒绝写入，不能靠改基线放过 |
| `--base <ref>` | 同时读 HEAD 与 `<ref>` 的合并基点（`git merge-base HEAD <ref>`）上的基线，不是 `<ref>` 当前的尖端：落后于 `<ref>` 的分支不会因为缺了 `<ref>` 后来加的条目而失败。合并基点上记的每条条目（接受的、被拒的）现在仍须在语料里、答卷未变，接受过的仍须接受，所以在分支上手改基线文件、改写或删掉语料条目都放不过。合并基点的树里有没有这个文件，是问 `git ls-tree` 得到的，不看报错文字；除「文件不在那里」之外的任何 git 失败，命令都以退出码 2 停下，不当作「还没有基线」 |

没有 `--base` 时只比较工作区里的基线与语料：同时改基线和语料可以让本地检查变绿，所以 CI 一律带 `--base`（`.github/workflows/ci.yml` 的 Studio Skill replay）。合并基点上还没有这个基线文件时（加它的那一次提交），没有可比的，只做本地比较，报告在结论之前单独一行 `WARNING:` 写明这一点。把基线文件改名或搬走、同时改 `scripts/studio-replay.mts` 的 `DEFAULT_BASELINE`，也会落到这一支：合并基点上那个路径没有文件，CI 就只剩本地比较。这条路要改门禁脚本和 CI 步骤，评审看得见，工具只用上面那行警告把它说出来，不去猜哪是改名（见第 6 节）。

基线里还记着各阶段 Skill 的版本号和提示词版本，只用于提示「挂载的文字变了」，不影响通过与否，这样并行改 Skill 的分支不会在这几行上互相卡住。

## 3. 生成冒烟

```
pnpm studio:replay smoke                  # 用隔离 Home 里的模型做真实设计
pnpm studio:replay smoke --stand-in       # 用脚本化的本机替身模型检查接线，不要密钥、不花钱
pnpm studio:replay smoke --briefs <文件> --minutes 12 --out <报告.json>
```

冒烟用创作台自己的 `AgentBuilderWorkflow`（和产品是同一个类），对 `tests/fixtures/studio-replay/smoke-briefs.json` 里的每条简报走到设计冻结为止：提出方案 → 选第一个 → 体验草图 → 细化设计。代码角色与 UI 阶段不会运行，不构建、不安装任何插件。报告每个阶段是否一次被宿主接受、修了几轮和宿主退回的原话。

### 3.1 隔离 Home 与密钥

- 必须设置 `MOLIS_WORK_HOME` 指向一个临时目录，且不能是真实 Home `~/.molis-work`、不能在它里面（例如 `~/.molis-work/tmp`），也不能是包含它的目录；符号链接先解开再比，目录还不存在时按最近的已有上级判断。必须设置 `MOLIS_WORK_SECRET_BACKEND=file`。任何一条不满足，命令拒绝运行（退出码 2），在读取任何配置之前。
- 模型只取这个 Home 自己的目录库（`apps/local-host/src/configured-models.ts` 的 `openConfiguredModels`），不读环境里的 `MOLIS_WORK_TEXT_*`，不碰系统钥匙串，不从真实 Home 拷贝任何东西。
- 隔离 Home 里没有可用的文字模型时，命令打印 `SKIP:` 和做法后以 0 退出，不写任何配置，也不创建 `studio-replay` 目录。

给隔离 Home 配模型（由人做，命令不替你做）：

1. `MOLIS_WORK_HOME=<临时目录> MOLIS_WORK_SECRET_BACKEND=file pnpm web --port <空闲端口>`
2. 打开输出的地址，设置 → 模型设置（AI 组，`apps/workbench/src/settings-sections.ts` 的 `models`），添加供应商与密钥，然后停掉服务
3. `MOLIS_WORK_HOME=<临时目录> MOLIS_WORK_SECRET_BACKEND=file pnpm studio:replay smoke`

密钥只存在这个 Home 的文件密钥库里，不打印。冒烟结束后设计者的原始答卷留在 `<临时目录>/studio-replay/runs`，可以用 `harvest` 整理进语料（先读，见 2.3）。

### 3.2 `--stand-in`

起一个临时 Home 和一个只回三种固定答卷的本机模型服务（`scripts/studio-replay/stand-in.mts`），走完整条链：Home 配置 → 模型凭据 → Prologue 代理 → 创作台工作流 → 报告。它检查接线没坏（`tests/studio-replay.test.ts` 的「smoke wiring」用例就跑它），对 Skill 一无所知，报告开头会这样写。

## 4. 改 Skill 或提示词的流程

1. 改 `skills/molis-plugin-dev/` 里创作台挂载的章节，或 `agent-prompts.ts`。
2. `pnpm studio:replay`。红了先看是回归还是预期变化（见 2.4）。Skill 摘要变化会被列出。
3. 在隔离 Home 里改前、改后各跑一次 `pnpm studio:replay smoke`（同样的简报，各跑 2–3 次），看「一次接受」与修复轮数有没有变差；把两份 `--out` 报告附在改动说明里。
4. 回放的语料里加一条能复现你这次要修的答卷问题的条目（手写条目写 `expectFailure`，真实答卷来自 `harvest`）。

## 5. 文件

| 文件 | 作用 |
| --- | --- |
| `scripts/studio-replay.mts` | 命令入口：`replay`（默认）、`harvest`、`smoke` |
| `scripts/studio-replay/corpus.mts` | 语料格式、运行记录转换、`harvest` |
| `scripts/studio-replay/replay.mts` | 逐条回放、汇总、基线比较 |
| `scripts/studio-replay/skill.mts` | 各阶段挂载的 Skill 摘要 |
| `scripts/studio-replay/report.mts` | 报告 |
| `scripts/studio-replay/smoke.mts`、`smoke-command.mts`、`stand-in.mts` | 生成冒烟、隔离 Home 的守卫与接线、替身模型 |
| `tests/fixtures/studio-replay/` | `corpus.json`、`baseline.json`、`smoke-briefs.json` |
| `tests/studio-replay.test.ts` | 每条规则的反例（在临时目录里破坏一处，命令必须失败）、与真实工作流的对照、冒烟接线 |

## 6. 已知限制（说明了，没有关掉）

这些洞要关得动解析器或重新设计，所以在这里和脚本头部写明，不假装已经没有：

| 限制 | 后果 | 何时能关 |
| --- | --- | --- |
| 提交的语料是种子，没有真实的完整设计答卷 | 主数字「完整设计一次通过率」没有被测量；默认回放只证明宿主的检查没有退步，且覆盖面是手写条目能想到的规则 | 按 2.2 里已定的做法导出、审过、提交、记基线 |
| 回放照抄了宿主的检查（`proposeAnswer`、rework 循环），不是调用同一个函数 | 对用例没覆盖到的语料（别人的 Home），两份检查分叉时没有任何东西变红 | 把 `AgentBuilderWorkflow` 的纯检查拆出 plugin-builder 公开导出后改成直接调用，再删这份拷贝和对照用例 |
| 运行记录里没有整个动作目录（2.1 末段） | 对 `shownCatalogOnly` 的条目：宿主接受的答卷可能被回放拒绝（已单列标明），宿主拒绝的答卷也可能被回放接受（看不见） | 运行记录保存宿主检查时用的目录编号与执行声明之后 |
| 基线文件改名并同时改 `DEFAULT_BASELINE` | CI 只剩本地比较（报告里有 `WARNING:` 一行） | 不关：改门禁脚本与 CI 步骤要过评审 |
| 回放的语料只有 `propose`、`detail`、`revise` 三个阶段的答卷，没有 `experience`、`compose` 和代码阶段的 | 这三个阶段的宿主检查不在回放里；生成冒烟走到设计冻结（含 `experience`），也不看 `compose` 和代码阶段 | 另开任务 |


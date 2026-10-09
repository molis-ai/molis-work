# 在这个仓库里工作

Molis Work：本地优先的插件基座加多插件工作平台。平台是一个 Home 的常驻宿主、统一动作服务与授权、Plugin Runtime、工作台外壳和同一个 Prologue AI 运行时；内容与事实归插件，每项事实只有一个主人（`docs/SSOT-MATRIX.md`）。Goals 是每个项目都带的内置插件，拥有 Goal 的事实。

## 先读哪里

| 要做的 | 读 |
| --- | --- |
| 产品是什么、对用户的承诺 | `PRODUCT.md` |
| 包清单、事实 owner、成熟度 | `docs/SSOT-MATRIX.md` |
| 分层与依赖规则 | `docs/system/ARCHITECTURE.md`、`docs/system/PACKAGE-BOUNDARIES.md` |
| 一个词在仓库里该叫什么（动作、判断规则、Skill、Character、项目、插件名…）、旧称是什么 | `docs/system/GLOSSARY.md` |
| 改某个包 | 该包 README 的「开发要求」：负责与不负责、依赖、不变量、改完必跑的测试（写法见 `docs/system/DEVELOPMENT-REQUIREMENTS.md`，门禁在 `pnpm boundary:check`） |
| 能力怎样注册、发现、调用、授权 | `specs/action-architecture/spec.md` §3「基本合同」 |
| 写或改插件 | `skills/molis-plugin-dev/SKILL.md` |
| 调模型、跑 Agent、提示词、模型设置 | `skills/molis-prologue-ai/SKILL.md`（手册 `docs/platform/PROLOGUE-AI.md`） |
| 界面 | `DESIGN.md`、`specs/craft-finish/spec.md`，规格板 `/__ui/catalog` |
| 仓库里放什么：评审截图、根目录杂项、vendored 补丁 | `docs/system/REPOSITORY-HYGIENE.md` |
| 某项任务 | `specs/<task>/spec.md`，开头写状态句；完成后按 `specs/README.md` 归档 |
| 多个会话、工作树同时开发 | `docs/system/PARALLEL-DEVELOPMENT.md`：枢纽文件、构建与浏览器用例排时段、集成分支跑全量、基线比对、共享 Agent 锁、清理、PR 体量 |
| 改合同（导出、动作 schema、Manifest、MCP 工具名、库结构） | `docs/system/CONTRACT-CHANGES.md`：现在不留兼容期；读取兼容的流程，从第一个装到开发机之外的版本开始 |
| 某个包归谁、请谁评审 | `docs/SSOT-MATRIX.md` 各表的「归属」列与 `.github/CODEOWNERS`，由 `scripts/package-owners.mjs` 的规则生成 |
| 发版、改版本号、动真实 Home 的库 | `docs/releases/POLICY.md`、`docs/releases/CHECKLIST.md`；版本核对 `node scripts/verify-release-versions.mjs`（CI 里跑） |

## 硬约束

- 插件不 import 另一个插件的实现；跨模块只走公开 Contract。能力注册一次，由共同目录供页面、工作流、Agent、MCP 使用，不另写名单或宿主分支。
- 模型调用只经 `horizontal/agent-host`（唯一依赖 `@prologue/sdk` 的包）。一个 Home 只有一个执行进程；其他入口转发给常驻宿主。
- 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。被取消、撤权、停用的调用不再写任何记录。
- 合同读写都只认现行取值：存量数据由维护改成现行形状，读取时不兜底历史取值；新增兼容或迁移逻辑要先写进 `specs/repository-anti-corruption` 的保留机制并经用户确认。以后的读取兼容怎样做、从什么时候起算（第一个装到开发机之外的版本），见 `docs/system/CONTRACT-CHANGES.md`。
- 可信身份（actor、项目、安装）从调用上下文来，不从输入读；密钥只给引用。
- 新的内置插件只走 Plugin Runtime 装配（`apps/local-host/src/project-plugins.ts` 的监督器条目）：不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`，也不再往 `apps/workbench/src/builtin-plugins.ts` 加构建期条目。现存的旧路径插件名单冻结在 `tests/builtin-plugin-assembly-gate.test.ts`，只许减少。
- 插件只提供内容，挂在工作台的位置（目录、主区、浮层、设置、侧栏）；不出自己的整页、不开第二个浏览器标签页。例外清单见 `specs/artifact-positioning/spec.md` §4，门禁 `tests/shell-page-gate.test.ts`（CI 里跑）。
- 成果库只收人要留存、引用的固定版本与导入文件：类型在 manifest `artifacts.produces` 声明，带显示名与 owner 的预览动作；交给别的插件的数据是过程项（`process_items.produces`），不进成果库、侧栏文件和搜索。宿主按 manifest 拒绝未声明的写入；门禁 `tests/artifact-type-gate.test.ts`、`tests/artifact-declaration-gate.test.ts`（CI 里跑）。
- 页面里跨模块说话用 DOM `CustomEvent`，每个事件在 `packages/contracts/src/platform/dom-events.ts` 登记（名字、种类、页面状态的主人、发在哪里、载荷）：浏览器代码里名字写字符串字面量，与发它的代码同一个改动里登记；未登记的 `CustomEvent`、监听未登记的页面前缀名、登记了却没人发或听的条目，门禁 `scripts/gates/dom-events.mjs` 拦下（`pnpm health:check`，CI 里跑；`--report` 列出谁发谁听）。新增事件改合同，跑 `pnpm api:update`。
- `vendor/prologue-sdk/` 只放当前使用的 Prologue 包（最多再加一份在途分支的）；换新包时删掉旧包，旧包从 Git 历史取。每个 vendored 的 tgz 旁边有 `.sha256` 和 `.provenance.json`，与 tgz 不符、或包换掉后记录还留着，`pnpm health:check` 拦下；当前包的上游提交与重建步骤见该目录 README，已删的历史补丁（大小、SHA-256、git blob、基线、来源）记在 `vendor/prologue-sdk/patch-history.json`。
- 一张表只由建它的包读写：别的包要读写就调那个包导出的函数，不直接写 SQL；几个包有意共写的表登记在 `tooling/gates/table-owners.json`（带理由；门禁 `scripts/gates/table-owners.mjs`，CI 里跑）。

## 构建与测试

- 安装：`pnpm install --frozen-lockfile --offline`。单包构建写成 `pnpm --filter <包> run build`（`--filter` 在 `run` 前）。
- 改过任何 `*/src`、`scripts`、`package.json` 后，跑全量前先整体 `pnpm build`：安装类测试比对源码与构建指纹。
- 全量回归期间不要改源码、脚本、`package.json` 和 `skills/`（安装类测试会拷贝 `skills/` 并比较两次安装的内容；`docs/`、`specs/` 可以改）；也不要并发构建。
- 跑测试：`node scripts/run-tests.mjs <文件…>`；浏览器用例需要本机 Chrome。判断是否自己引入的失败，用干净的基线工作树（`git worktree add --detach`）跑同一批文件对比。
- 测试截图默认写入已忽略的 `.impeccable/qa/review/`；要刷新仓库里的评审截图才设 `MOLIS_WORK_REVIEW_EVIDENCE=1`，只覆盖已有的图：`.impeccable/` 里入库的文件数只许减少，新增图或新评审组会被 `pnpm health:check` 拦下。
- 不为变绿而跳过、放宽或删除断言；先分清产品回归、预期变化、测试缺陷、环境与时序。
- `pnpm health:check`：巨大单元（类的行数与方法数分开记，各自超限的那一项不许超过基准；行数与方法数中较大的那个也不许变大）、测试引用包内部（按测试文件，用 AST 数 `import`、`export … from`、`import()`、`require()`，含 `server/src`；新测试文件从 0 开始）、vendored SDK 份数、就地补表、spec 状态句只许减少；源码里的兼容标记（`legacy`、`compat`、`@deprecated`、`backfill`）按文件计数，也只许减少，新文件从零开始——只能删掉旧路径；把保留的机制写进 `specs/repository-anti-corruption` 只是记录，放不过变大的。阈值在 `tooling/gates/limits.json`，只许收紧。另有一条不比数字的绝对规则：`specs/repository-anti-corruption/spec.md` §5.1 的包清单表必须与登记表（`scripts/workspace-packages.mjs`）和代码判定的层、状态一致（`scripts/gates/package-inventory.mjs`）——增删 workspace 包、把插件迁到 Plugin Runtime 监督器（`apps/local-host/src/project-plugins.ts`）、或改变 import 的可达性之后，用 `node scripts/gates/package-inventory.mjs --table` 重新生成对应的行，否则变红。**CI 与 `--base <ref>` 对照 merge-base 比**：把当前树和 `<ref>` 的 merge-base 用同一份脚本各量一遍再比（`node scripts/check-health-gates.mjs --base origin/main`；PR 上 CI 检出的是合并结果，比较对象是它合并时目标分支的末端，push 到 main 时是推送前的末端），完全不读 PR 里提交的 `tooling/gates/baseline.json`（缺失、旧格式、被改过都不影响结果）。所以**在 PR 里没有办法把数字调大**：`--update`、改基线、改 spec、登记例外都放不过；唯一的路是改门禁本身（脚本、`limits.json`、CI 步骤），那要过评审、先问用户。新写的、必然很长的单元也一样：在功能 PR 里没有登记这条路，要把每一块拆到阈值以下。例外文件 `tooling/gates/giant-exceptions.json` 只给**已经**超限的单元记一条为什么必须长的理由（单一职责的文案表、样式表、静态数据、生成代码，带理由；**登记不放行新增**：对 merge-base 不是巨大单元的，不管有没有登记都失败，登记过的单元也和所有巨大单元一样不许变大，条目必须对应现存的巨大单元；全部单元的判定与计划见 `docs/system/HUGE-CLASS-MIGRATION.md`）。不带 `--base` 只对照已提交的 baseline.json，快，但它是自己改得动的，推送前以 `--base` 为准。改小了就跑 `node scripts/check-health-gates.mjs --update --base origin/main` 在同一个 PR 里更新这份本地快查（有任何东西比 merge-base 大时拒绝写入）；`--report [--top N]` 打印逐文件、逐单元的数字。
- 源码计数与公开 API 快照（`pnpm health:check` 的另一组规则，与上一条同一个门禁、同样以 `--base` 对照 merge-base）：空 `catch`（块里没有语句也没有注释；TypeScript 代码和浏览器脚本的模板字符串各记一项）、`as unknown as`（含测试）、旧名（源码里的 `goalboard`、`board_id`）按文件计数、只许减少，口径写在 `scripts/gates/source-counts.mjs` 开头和 `tooling/gates/README.md`。contracts 每个 subpath 与插件 SDK 的公开 API 快照在 `tooling/gates/api/`：源码和快照有任何不同就失败，有意改 API 时跑 `pnpm api:update` 刷新快照，提交它，并在 PR 里写对插件和调用方的影响（`docs/system/CONTRACT-CHANGES.md`）。
- `pnpm health:check` 的结构数字（`scripts/gates/`，口径与看不到的部分见 `docs/system/PACKAGE-BOUNDARIES.md` 第 6 节）同样只许减少，比较方式与上一条相同（`--base <ref>` 对照 merge-base，PR 里调不大）：合同包里的副作用、模块级可变状态与 20 行以上的函数、宿主入口的 `export *`、Module 入口（`modules/*` 和 `server`）导出的 Repository/Store、宿主能力（typed）（`HostCapabilityDefinition` 与包装它的别名的引用、无 `action` 的描述符、`registerCapability` 与对 `LocalHost` 一类注册型接收者的 `register` 的调用和引用；新能力注册成动作，不再新增 typed 条目）、层间例外名单（`APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`）的条目，以及以内置插件命名的宿主文件、`registerProvider(` 行、内置插件包名在它自己的包之外被点名的文件数；`tests/builtin-plugin-assembly-gate.test.ts` 的冻结名单与磁盘逐项一致，删掉的条目必须同时移出名单。这些数字按文件记录：拆开带记录的文件，搬到新文件里的条目算新增，要在同一个 PR 里让门禁跟着改并过评审。
- 文档引用与仓库形状也在 `pnpm health:check` 里（规则、写法与怎么办见 `scripts/gates/README.md`）：活文档（`archive/` 之外的 `.md`）没有断链；`skills/`、`AGENTS.md` 和 `docs/system/CALL-CHAINS.md` 里行内代码引用的路径、`pnpm` 脚本与动作 id 必须存在；`specs/README.md` 索引与根目录分类一致；`specs/BACKLOG.md` 没有完成行（做完就删行）；仓库根目录只放 `tooling/gates/root-allowlist.json` 里的名字；`contracts` 不许有只导出一个描述符、没人用的占位子路径。只有根目录一项对照 merge-base 只许变少，其余（含 `contracts` 占位子路径，W2-01 已删光、没有基线）从 0 开始，出现一个就失败。有意的例外写进 `tooling/gates/doc-citation-exceptions.json`（带理由）。
- 写或改 spec 的验收标准：逐条带编号（如 `DOCK-03`），证明它的测试在测试名或注释里写出这个编号；写法见 `specs/README.md`「验收编号」。`node scripts/check-spec-coverage.mjs` 现在只报告，不管找到什么退出码都是 0（只有参数写错、或 git 读不了仓库才退出 2），不挡合并。
- `pnpm page-assets:check`（CI 在 `workspace:verify` 之后跑，要先 `pnpm workspace:build`）：宿主在 `/assets/` 下发的每个文件（三份样式表、两份工作台脚本、Pages 编辑器、各插件客户端包、字体）的字节数冻结在 `tooling/gates/page-assets.json`，只许变小（用户决定 #17）。CI 与 `--base <ref>` 把这份文件和 merge-base 里的比：在 PR 里调大数字、加条目、删掉宿主仍在发的条目都放不过，`--update` 也不会写入变大的；数字必须等于实测，变小了就在同一个 PR 里跑 `node scripts/gates/page-assets.mjs --update --base origin/main` 降下来（合并前 main 若又改了某个资源，在合并结果上重新 `pnpm workspace:build` 再跑）。路由读自 `apps/local-host/src/web-assets.ts` 的字符串字面量，读不成整条字面量的写法（模板、拼接）和文件里整条 `/assets/…` 字面量与插件包那条已知正则以外的单词 `assets`（正则或带转义斜杠的路由）直接退出 2，把这个词本身拆开的写法（如 `asset[s]`）读不到；机制与未覆盖的几项见 `specs/repository-anti-corruption/spec.md` §5a 与脚本头部，不要把它读得比实际更强。
- 界面翻译（`scripts/gates/translations.mjs`，在 `pnpm health:check` 里跑，做法和迁到稳定键见 `apps/workbench/README.md`「界面文字」）：翻译调用的中文原文没有英文、或某本 `*_EN` 词典没并进 `apps/workbench/src/i18n/en.ts` 的 `EN`（英文永远显示不出来），都直接失败；同一句中文译成不同英文的冲突按中文键记，只许减少；无用键只报告。
- 改了创作台挂载的 Skill 章节（`apps/local-host/src/plugin-builder/skill.ts` 的 `CHAPTERS`）、`plugins/native/plugin-builder/src/agent-prompts.ts`，或宿主对设计答卷的整理与校验（`agent-authoring.ts`、`agent-validation.ts`）：跑 `pnpm studio:replay`（离线回放，CI 里跑），再在隔离 Home 里跑 `pnpm studio:replay smoke`；两者各证明什么、语料里的 380 份真实设计答卷是怎么来的，见 `docs/platform/STUDIO-SKILL-REPLAY.md`。
- 测试截图默认写入已忽略的 `.impeccable/qa/review/`；要刷新仓库里的评审截图才设 `MOLIS_WORK_REVIEW_EVIDENCE=1`。入库的 `.impeccable/` 只留现行 spec、文档或测试点名的评审组与设计记录，按评审组计数，只许刷新已有的图：新增图或新评审组会被 `pnpm health:check` 拦下（规则与查法见 `docs/system/REPOSITORY-HYGIENE.md`）；根目录不放介绍页、`outputs/`、`.zcode/`。
- 不为变绿而跳过、放宽或删除断言；先分清产品回归、预期变化、测试缺陷、环境与时序。
- `pnpm health:check`：巨大单元（类的行数与方法数分开记，各自超限的那一项不许超过基准；行数与方法数中较大的那个也不许变大）、测试引用包内部（按测试文件，用 AST 数 `import`、`export … from`、`import()`、`require()`，含 `server/src`；新测试文件从 0 开始）、vendored SDK 份数、就地补表、spec 状态句只许减少；源码里的兼容标记（`legacy`、`compat`、`@deprecated`、`backfill`）按文件计数，也只许减少，新文件从零开始——只能删掉旧路径；把保留的机制写进 `specs/repository-anti-corruption` 只是记录，放不过变大的。阈值在 `tooling/gates/limits.json`，只许收紧。另有一条不比数字的绝对规则：`specs/repository-anti-corruption/spec.md` §5.1 的包清单表必须与登记表（`scripts/workspace-packages.mjs`）和代码判定的层、状态一致（`scripts/gates/package-inventory.mjs`）——增删 workspace 包、把插件迁到 Plugin Runtime 监督器（`apps/local-host/src/project-plugins.ts`）、或改变 import 的可达性之后，用 `node scripts/gates/package-inventory.mjs --table` 重新生成对应的行，否则变红。**CI 与 `--base <ref>` 对照 merge-base 比**：把当前树和 `<ref>` 的 merge-base 用同一份脚本各量一遍再比（`node scripts/check-health-gates.mjs --base origin/main`；PR 上 CI 检出的是合并结果，比较对象是它合并时目标分支的末端，push 到 main 时是推送前的末端），完全不读 PR 里提交的 `tooling/gates/baseline.json`（缺失、旧格式、被改过都不影响结果）。所以**在 PR 里没有办法把数字调大**：`--update`、改基线、改 spec、登记例外都放不过；唯一的路是改门禁本身（脚本、`limits.json`、CI 步骤），那要过评审、先问用户。新写的、必然很长的单元也一样：在功能 PR 里没有登记这条路，要把每一块拆到阈值以下。例外文件 `tooling/gates/giant-exceptions.json` 只给**已经**超限的单元记一条为什么必须长的理由（单一职责的文案表、样式表、静态数据、生成代码，带理由；**登记不放行新增**：对 merge-base 不是巨大单元的，不管有没有登记都失败，登记过的单元也和所有巨大单元一样不许变大，条目必须对应现存的巨大单元；全部单元的判定与计划见 `docs/system/HUGE-CLASS-MIGRATION.md`）。不带 `--base` 只对照已提交的 baseline.json，快，但它是自己改得动的，推送前以 `--base` 为准。改小了就跑 `node scripts/check-health-gates.mjs --update --base origin/main` 在同一个 PR 里更新这份本地快查（有任何东西比 merge-base 大时拒绝写入）；`--report [--top N]` 打印逐文件、逐单元的数字。
- 入库的 `.impeccable/` 文件按评审组计数、只许减少，vendored 包的 `.sha256`、`.provenance.json`、`patch-history.json` 要和文件相符（`scripts/gates/vendored-provenance.mjs`，不靠基线），两条都随 `pnpm health:check` 跑；规则、查法与怎样取回已删的文件见 `docs/system/REPOSITORY-HYGIENE.md`。
- 推送前跑 `pnpm secrets:check`（先 `git fetch origin main`；CI 的 Secret scan 任务跑同一条命令，纳入 `Verify`）：逐个提交扫描本分支新增的行，找各类 API key、令牌、私钥、JWT 和 `api_key|secret|private_key|password|token = "…"` 字面量（含 `secretKey`、`aws_secret_access_key`、`const apiKey: string = "…"` 写法），只显示文件、行号和值的前 4 位。真凭据用 rebase 或 squash 从所有提交里去掉（后一个提交只删它不够）再轮换；已在 main 上的测试数据，把确切值（或锚定的 `/正则/`）连同理由写进 `tooling/gates/secret-allowlist.txt`，不要为过关放宽规则。详见 `docs/cli-and-development.md`。

## 协作

- 同一台机器上常有多个会话与工作树：开工前看 `git worktree list` 与其他会话在做什么；不重置、不覆盖别人的未提交改动，只提交自己的。
- 主检出常被真实 Home 的服务（4207）使用，改动前先确认；推送、开 PR、发布先问用户；推送前先跑 `pnpm secrets:check`。
- 并行开发的规矩写在 `docs/system/PARALLEL-DEVELOPMENT.md`，开工前读一遍：动枢纽文件前先查在途 PR；整台机器同一时间最多一个构建、一个浏览器用例批次；共享核心的几个改动合成集成分支跑一次全量；失败用基线工作树比对；同一个 Home 只有一个进程能跑 Agent；用完的工作树与分支清掉。
- 每个包的归属（角色与评审账号）写在 SSOT 的「归属」列和 `.github/CODEOWNERS`，两处由 `scripts/package-owners.mjs` 的规则生成，`pnpm boundary:check` 校验。CODEOWNERS 只请求评审，不改分支保护。改了规则或新增、删除包后运行 `node scripts/package-owners.mjs --write`。

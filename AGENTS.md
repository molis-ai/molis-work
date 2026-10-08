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

## 硬约束

- 插件不 import 另一个插件的实现；跨模块只走公开 Contract。能力注册一次，由共同目录供页面、工作流、Agent、MCP 使用，不另写名单或宿主分支。
- 模型调用只经 `horizontal/agent-host`（唯一依赖 `@prologue/sdk` 的包）。一个 Home 只有一个执行进程；其他入口转发给常驻宿主。
- 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。被取消、撤权、停用的调用不再写任何记录。
- 合同读写都只认现行取值：存量数据由维护改成现行形状，读取时不兜底历史取值；新增兼容或迁移逻辑要先写进 `specs/repository-anti-corruption` 的保留机制并经用户确认。以后的读取兼容怎样做、从什么时候起算（第一个装到开发机之外的版本），见 `docs/system/CONTRACT-CHANGES.md`。
- 可信身份（actor、项目、安装）从调用上下文来，不从输入读；密钥只给引用。
- 新的内置插件只走 Plugin Runtime 装配（`apps/local-host/src/project-plugins.ts` 的监督器条目）：不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`，也不再往 `apps/workbench/src/builtin-plugins.ts` 加构建期条目。现存的旧路径插件名单冻结在 `tests/builtin-plugin-assembly-gate.test.ts`，只许减少。
- 插件只提供内容，挂在工作台的位置（目录、主区、浮层、设置、侧栏）；不出自己的整页、不开第二个浏览器标签页。例外清单见 `specs/artifact-positioning/spec.md` §4，门禁 `tests/shell-page-gate.test.ts`（CI 里跑）。
- 成果库只收人要留存、引用的固定版本与导入文件：类型在 manifest `artifacts.produces` 声明，带显示名与 owner 的预览动作；交给别的插件的数据是过程项（`process_items.produces`），不进成果库、侧栏文件和搜索。宿主按 manifest 拒绝未声明的写入；门禁 `tests/artifact-type-gate.test.ts`、`tests/artifact-declaration-gate.test.ts`（CI 里跑）。
- `vendor/prologue-sdk/` 只放当前使用的 Prologue 包（最多再加一份在途分支的）；换新包时删掉旧包，旧包从 Git 历史取；补丁只留重建当前包要用的那一份，其余的大小、SHA-256 与来源记在该目录 README。

## 构建与测试

- 安装：`pnpm install --frozen-lockfile --offline`。单包构建写成 `pnpm --filter <包> run build`（`--filter` 在 `run` 前）。
- 改过任何 `*/src`、`scripts`、`package.json` 后，跑全量前先整体 `pnpm build`：安装类测试比对源码与构建指纹。
- 全量回归期间不要改源码、脚本、`package.json` 和 `skills/`（安装类测试会拷贝 `skills/` 并比较两次安装的内容；`docs/`、`specs/` 可以改）；也不要并发构建。
- 跑测试：`node scripts/run-tests.mjs <文件…>`；浏览器用例需要本机 Chrome。判断是否自己引入的失败，用干净的基线工作树（`git worktree add --detach`）跑同一批文件对比。
- 测试截图默认写入已忽略的 `.impeccable/qa/review/`；要刷新仓库里的评审截图才设 `MOLIS_WORK_REVIEW_EVIDENCE=1`。入库的 `.impeccable/` 只留现行 spec、文档或测试点名的评审组与设计记录，按评审组计数，只许刷新已有的图：新增图或新评审组会被 `pnpm health:check` 拦下（规则与查法见 `docs/system/REPOSITORY-HYGIENE.md`）；根目录不放介绍页、`outputs/`、`.zcode/`。
- 不为变绿而跳过、放宽或删除断言；先分清产品回归、预期变化、测试缺陷、环境与时序。
- `pnpm health:check`：巨大单元（类的行数与方法数分开记，各自超限的那一项不许超过基准；行数与方法数中较大的那个也不许变大）、测试引用包内部（按测试文件，用 AST 数 `import`、`export … from`、`import()`、`require()`，含 `server/src`；新测试文件从 0 开始）、vendored SDK 份数、就地补表、入库的 `.impeccable/` 文件（按评审组数）、spec 状态句只许减少；源码里的兼容标记（`legacy`、`compat`、`@deprecated`、`backfill`）按文件计数，也只许减少，新文件从零开始——只能删掉旧路径，把保留的机制写进 `specs/repository-anti-corruption` 放不过变大的。阈值在 `tooling/gates/limits.json`，只许收紧。**CI 与 `--base <ref>` 对照 merge-base 比**：把当前树和 `<ref>` 的 merge-base 用同一份脚本各量一遍再比（`node scripts/check-health-gates.mjs --base origin/main`；PR 上 CI 检出的是合并结果，比较对象是它合并时目标分支的末端，push 到 main 时是推送前的末端），完全不读 PR 里提交的 `tooling/gates/baseline.json`（缺失、旧格式、被改过都不影响结果）。所以**在 PR 里没有办法把数字调大**：`--update`、改基线、改 spec 都放不过；唯一的路是改门禁本身（脚本、`limits.json`、CI 步骤），那要过评审；确需例外，只走评审过的例外文件（计划中的 `tooling/gates/giant-exceptions.json`，现在还没有），不靠改数字。不带 `--base` 只对照已提交的 baseline.json，快，但它是自己改得动的，推送前以 `--base` 为准。改小了就跑 `node scripts/check-health-gates.mjs --update --base origin/main` 在同一个 PR 里更新这份本地快查（有任何东西比 merge-base 大时拒绝写入）；`--report [--top N]` 打印逐文件、逐单元的数字。
- 推送前跑 `pnpm secrets:check`（先 `git fetch origin main`；CI 的 Secret scan 任务跑同一条命令，纳入 `Verify`）：逐个提交扫描本分支新增的行，找各类 API key、令牌、私钥、JWT 和 `api_key|secret|private_key|password|token = "…"` 字面量（含 `secretKey`、`aws_secret_access_key`、`const apiKey: string = "…"` 写法），只显示文件、行号和值的前 4 位。真凭据用 rebase 或 squash 从所有提交里去掉（后一个提交只删它不够）再轮换；已在 main 上的测试数据，把确切值（或锚定的 `/正则/`）连同理由写进 `tooling/gates/secret-allowlist.txt`，不要为过关放宽规则。详见 `docs/cli-and-development.md`。

## 协作

- 同一台机器上常有多个会话与工作树：开工前看 `git worktree list` 与其他会话在做什么；不重置、不覆盖别人的未提交改动，只提交自己的。
- 主检出常被真实 Home 的服务（4207）使用，改动前先确认；推送、开 PR、发布先问用户；推送前先跑 `pnpm secrets:check`。
- 并行开发的规矩写在 `docs/system/PARALLEL-DEVELOPMENT.md`，开工前读一遍：动枢纽文件前先查在途 PR；整台机器同一时间最多一个构建、一个浏览器用例批次；共享核心的几个改动合成集成分支跑一次全量；失败用基线工作树比对；同一个 Home 只有一个进程能跑 Agent；用完的工作树与分支清掉。
- 每个包的归属（角色与评审账号）写在 SSOT 的「归属」列和 `.github/CODEOWNERS`，两处由 `scripts/package-owners.mjs` 的规则生成，`pnpm boundary:check` 校验。CODEOWNERS 只请求评审，不改分支保护。改了规则或新增、删除包后运行 `node scripts/package-owners.mjs --write`。

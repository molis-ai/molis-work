# 在这个仓库里工作

Molis Work：本地优先的 **Agent OS**、**人机与团队协作工作台**及**多插件能力基座**。

- **Agent OS**：一个 Home 的常驻宿主、统一动作服务与授权护栏、Plugin Runtime、同一个 Prologue AI 运行时（个人助理、子代理、后台任务、记忆、工作记录与评测、技能与能力包），以及外部 AI 开发工具会话（`horizontal/sessions`）的接入与治理。
- **协作工作台**：工作台外壳围绕项目、主线与事项线（`horizontal/mainline`）组织人机持续协作（明确交办、结果回流、项目指导 `modules/projects`、可信用户决定 `horizontal/project-approvals`、要求/证据/逐项认可 `modules/acceptance`、对象工作终端服务 `apps/local-host/src/work-terminal-service.ts` 与底层 PTY 宿主 `horizontal/runtime-host`、项目讨论 IM），并向个人同步与多人实时团队协作演进（当前以单 Home 本机协作为主，团队共享项目与团队记忆仍在演进中）。
- **多插件基座**：业务内容与事实归插件或 Module，每项事实只有一个主人（`docs/SSOT-MATRIX.md`）。Goals 与其他项目插件同等地位（新项目不默认安装，可按需添加与移除，移除后数据保留），拥有 Goal 的事实；新平台能力不得绑定任何特定插件（见 `specs/plugin-equal-standing/spec.md`）。

## 先读哪里

| 要做的 | 读 |
| --- | --- |
| 找文档入口、区分现行与历史 | `docs/README.md`；权威来源分工见 `docs/SSOT-MATRIX.md` |
| 产品对用户的承诺 | `PRODUCT.md` |
| 包清单、事实 owner、成熟度、分层与依赖 | `docs/system/PACKAGE-BOUNDARIES.md`、`docs/system/ARCHITECTURE.md`、`docs/SSOT-MATRIX.md` |
| 一个词该叫什么 | `docs/system/GLOSSARY.md` |
| 改某个包 | 该包 README 的「开发要求」（写法见 `docs/system/DEVELOPMENT-REQUIREMENTS.md`） |
| 能力怎样注册、发现、调用、授权 | `specs/action-architecture/spec.md` §3 |
| 添加公开状态、定义插件对象的状态机 | [平台词表](docs/platform/STATE-VOCABULARY.md)、[插件状态机 Skill](skills/molis-plugin-dev/state-machine.md) |
| 写或改插件 | `skills/molis-plugin-dev/SKILL.md` |
| 调模型、跑 Agent、提示词、模型设置 | `skills/molis-prologue-ai/SKILL.md`（手册 `docs/platform/PROLOGUE-AI.md`） |
| 接入工作记录与观测覆盖 | `docs/horizontal/observation.md` |
| 界面、设计、动效、字体、设置页与外观 | `skills/molis-design-ui/SKILL.md`（必读执行手册）、`DESIGN.md`（总规范）、组件板 `/__ui/catalog`、`skills/molis-plugin-dev/text-and-appearance.md`（文案） |
| 本机登录看真实界面（dev 模式起 Auth 与 Molis Work、测试账号） | `docs/cli-and-development.md`「本机登录测试」 |
| 仓库里放什么 | `docs/system/REPOSITORY-HYGIENE.md` |
| 开一项需求、什么要用户拍板、该不该落成平台能力（第 4.1 节） | `specs/post-anticorruption-roadmap/reference/development-workflow.md` |
| 推进路线书的一批：主会话怎样开工、同步 main、评审、入队、收尾 | `specs/post-anticorruption-roadmap/reference/batch-runbook.md` |
| 某项任务 | `specs/<task>/spec.md`（开头写状态句，完成后按 `specs/README.md` 归档） |
| 多会话、工作树、子代理并行 | `docs/system/PARALLEL-DEVELOPMENT.md` |
| 改合同、库结构、版本、发版 | `docs/system/CONTRACT-CHANGES.md`、`specs/upgrade-continuity/upgrade-chain-design.md`、`docs/releases/POLICY.md` |
| 包归谁、请谁评审 | `docs/SSOT-MATRIX.md`「归属」列、`.github/CODEOWNERS` |
| 门禁怎么量、红了怎么办 | `tooling/gates/README.md`、`scripts/gates/README.md` |

## 硬约束

- **跨模块只走公开合同。** 插件不 import 另一个插件的实现。能力注册一次，由动作目录供页面、工作流、Agent、MCP 使用，不另写名单或宿主分支；新动作输入优先用 `InferActionInput<typeof schema>` 推导（`packages/contracts` 公开合同接口除外），不再新增处理器输入 `as` 强转，错误码前缀按 `tooling/gates/error-owners.json` 归属。
- **平台产品服务不拥有业务事实。** 记忆、放置、搜索、资料、呈现组合、能力包、主线、外观、观测、评测、外部会话、自动化建议、项目审批等平台产品服务（`docs/system/ARCHITECTURE.md` §3）只持有策略与机制记录，对象事实一律向主人读取。
- **平台协作与治理能力不各自重造：**
  - 可信用户决定与项目审批归 `horizontal/project-approvals`，要求/证据/逐项认可归 `modules/acceptance`；本人决定只经受保护入口并核对精确版本，证据层级只能由平台判定。
  - 主线/事项线与后台任务总表（`horizontal/mainline`）按调用方权限现读提供方声明，不另存业务状态；执行命令前向提供方复核。
  - 外部 AI 会话（`horizontal/sessions`）原文绝不落库或进全文索引；读取受范围与项目 AI 许可约束。
  - 工作记录/观测层（`horizontal/observation`）：新增或修改入口、动作、后台任务、触发条件、Skill 生效方式或模型上下文时，同步在 `OBSERVATION_COVERAGE_PLAN` 登记覆盖；只经三条写入路（动作出口、`ObservationSink`、`observation.report@1`）记录，不复制业务事实、不改变或拖慢业务结果（`docs/horizontal/observation.md`）。
  - 中央账号（`horizontal/account`）合同以 Auth 仓库为准，不得在 Work 侧独立修改（更新经 Auth 仓库同步脚本生成）。
- **状态与状态机：** 平台能力的公开状态从 contracts 的[公开词表](docs/platform/STATE-VOCABULARY.md)派生，转换归原来的包；插件自己的状态用 Manifest 申报，写入和流水账归该插件。状态声明变更走合同流程，非法转换由 SDK 拒绝；随宿主发布的插件启动时核对代码运行的状态机和清单一致，不一致不启动；已申报的状态机经 `system.state-machines` 只读查询（`state_machines.list@1`、`state_machines.get@1`），登记是投影、不建表（`packages/plugin-runtime/README.md`）。
- **模型调用只经 `horizontal/agent-host`**（唯一依赖 `@prologue/sdk` 的包）。一个 Home 只有一个执行进程，其他入口转发给常驻宿主。
- **外部插件作者只装 `packages/contracts` 与 `packages/plugin-sdk`。** SDK 只依赖 contracts，不转出私有包；作者和平台共用的运行时工具放在 SDK 里，平台各层取同一份。SDK 算共享核心，改它按共享核心跑全量。
- **取消、撤权、停用的调用不再写业务记录。** 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。处理器开始前就被拒的只留一行不含内容的诊断。两个由用户定的例外：跨分区移动被拒后平台把对象移回原处（S-35），OAuth 共用刷新的凭据写回（S-95），条件见 `docs/system/SECURITY-INVARIANTS.md`。
- **合同只认现行取值。** 库与带版本文件改结构须经 `tooling/versions.json` 与 `pnpm versions:generate` 升版本、附连续升级步骤、同步 `docs/releases/CHECKLIST.md` 第 3 节并在 `docs/system/CONTRACT-CHANGES.md`「存储版本变更登记」留记录，且 `tests/fixtures/golden-homes/` 有旧版金样可回放；读取时不兜底历史取值；新增兼容或迁移逻辑先写进 `docs/system/CONTRACT-CHANGES.md`「当前保留机制」并经用户确认。
- **可信身份从调用上下文来**，不从输入读；密钥只给引用。
- **新的内置插件只有一条路：** 在自己包的 `src/registration.ts` 写 `registration`，项目级给 `project_runtime`，由每个项目的监督器（`apps/local-host/src/project-plugins.ts`）按登记装配，那个文件不为新插件改；Home 级在 Manifest 写 `runtime: { scope: "home" }` 并在登记上给 `runtime`，由 `apps/local-host/src/home-plugins.ts` 装配（写法见 `skills/molis-plugin-dev/host.md`）。`apps/workbench/src/builtin-plugins.ts`、`apps/local-host/src/plugin-registry.generated.ts` 及三处 `package.json` 的内置插件依赖均由 `node scripts/generate-plugin-registry.mjs` 生成，不手改。构建期手写接线已清零（第 44B 批，`tests/builtin-plugin-assembly-gate.test.ts` 的名单为空），不得新增。插件创作台不是插件，是平台能力（用户 2026-11-22 定），由 `apps/local-host/src/host-surfaces.ts` 与 `apps/workbench/src/host-surfaces.ts` 两份「平台框内页面」名单登记，不进插件目录。
- **插件同等待遇。** 官方、个人、创作台生成或第三方用同一套 SDK、合同、装配、平台服务与授权；安装信任按发布者签名区分。插件的数据库升级段随 Manifest 申报，由平台按归属执行；已装签名包在用户确认换版时升级。插件缺什么就补进平台，不给某个插件开私路。
- **插件只提供内容，挂在工作台的位置**，不出自己的整页、不开第二个标签页（例外见 `specs/shell-page-exceptions/spec.md`）。
- **成果库只收人要留存、引用的固定版本与导入文件**，类型在 manifest `artifacts.produces` 声明；交给别的插件的数据是过程项（`process_items.produces`）。
- **删除项目只有一份 Host 服务**（`apps/local-host/src/project-deletion-service.ts`），操作者由入口给。
- **项目的文件夹只在目录库里记：** 一个输出目录，其余是只读输入；插件经 `projects.directories.get@1` 读。
- **页面里跨模块说话用登记过的 DOM `CustomEvent`**（`packages/contracts/src/platform/dom-events.ts`），新增事件跑 `pnpm api:update`。
- **界面文字与外观：** 界面短句写 `t("<主人>.<位置>.<元素>", 参数)`，日期数字写 `format`；存下来以后才显示的存键和参数，不存译文，也不拿译文做判断；颜色、字体等值只在 `packages/design-system/resources/` 的基线里，样式只写语义变量；给模型的回复语言由平台一处给。插件每种语言一个 `locales/<语言>.json`，在 Manifest 的 `ui.locales` 声明；后台工作存 `TextRef`。面向用户的文案默认假定用户没有 AI 与编程基础：用直白人话写清影响与下一步，不露架构与 AI 工程黑话，术语对齐 `docs/system/GLOSSARY.md`；写作准则与 SDK 写法见 `skills/molis-plugin-dev/text-and-appearance.md`，界面翻译门禁见 `apps/workbench/README.md`「界面文字」，文案巡检跑 `node scripts/audit-ui-copy.mjs`。
- **受控 vendor 包：** `vendor/` 下每个 `.tgz` 均须带 `.sha256` 与 `.provenance.json`；`vendor/prologue-sdk/` 只放当前使用的 Prologue 包（见 `vendor/prologue-sdk/README.md`），换包须经用户确认且只取上游 `main` 具名提交。
- **存储边界：** 一张表只由建它的包读写，有意共写的表登记在 `tooling/gates/table-owners.json`；所有库统一经 `packages/storage` 走 `node:sqlite`，禁止引入 `better-sqlite3`（`scripts/gates/project-sqlite-driver.mjs`，没有例外）。
- **本机安全边界逐条登记在 `docs/system/SECURITY-INVARIANTS.md`**，每条有断言拒绝本身的测试。改边界同步改表和测试；找不到拒绝就是安全缺陷。「是不是本机地址」在 TypeScript 里只有 `@molis-ai/molis-work-contracts/platform/loopback` 一份。

## 构建与测试

- **环境与安装：** 锁定 `Node 24.15.x` 与 `pnpm@11.9.0`（见 `package.json` 的 `engines` 与 `packageManager`）；安装用 `pnpm install --frozen-lockfile --offline`。单包构建：`pnpm --filter <包> run build`（`--filter` 在 `run` 前）。
- **构建与回归隔离：** 改过 `*/src`、`scripts`、`package.json` 后，跑测试前先 `pnpm build`；全量回归期间不改源码、脚本、`package.json` 和 `skills/`，也不并发构建。
- **定向测试、排队与全量：** 跑测试用 `node scripts/run-tests.mjs <文件…>`，挑相关用例用 `node scripts/affected-tests.mjs`。本机整体构建、工作区清理、类型检查、定向测试（含非浏览器）和健康检查经 `scripts/machine-slot.mjs` 共用一个槽，每批默认执行一个测试文件或同时编译至多两个包；单包构建按开发手册显式取槽；**本机不跑全量**（全量交 CI `full-suite` 标签）；停进程只按 `pid`，不用 `pkill`。详见 `docs/system/PARALLEL-DEVELOPMENT.md` 第 5–8 节。
- **门禁只许变严。** `pnpm health:check` 的各组数字对照 merge-base 量、只许变小，PR 里没有办法调大（`--update`、改基线都不行）；包含 Biome 静态检查、调用次数预算（`tooling/gates/call-budget.json`，必要增长走 `tooling/gates/call-budget-allowances/`）、错误码归属与测试双加载绝对零（`testImportSplits`，同一测试进程不能既读 `src` 又读包名/`dist`，可用 `node scripts/test-imports.mjs --write` 修复）。日常边界与专项校验还有 `pnpm boundary:check`、`pnpm test:security`、`pnpm test:contracts`。口径与例外见 `tooling/gates/README.md`。
- **快照、版本与合并重生：** 有意改公开 API、动作合同、库结构、自有版本时，分别跑 `pnpm api:update`、`pnpm actions:update`、`pnpm schemas:update`、`pnpm versions:generate`，提交生成的文件并在 PR 里写对调用方的影响。同步 `main` 后跑 `pnpm merge:regenerate` 自动重生成被合并驱动跳过的快照，不手工合并快照文件。
- **页面资源、首屏字节与插件样式按预算表管：** 静态资源（`pnpm page-assets:check`）与首屏字节（`node scripts/gates/first-screen.mjs --base origin/main`）对照 `tooling/gates/page-asset-budgets.json` 的路由、总载荷与首屏冷热上限（[决定 58](specs/post-anticorruption-roadmap/reference/decisions.md#decision-58)、第 100 批），插件样式预算（`pnpm plugin-styles:check`）只许降。预算内的改动不用逐字节许可；预算表的上限与各路由计入的资源相对 merge-base 只许收紧，调高上限或把资源移出路由先问用户，新增路由只能列确切资源（量法见 `docs/cli-and-development.md`「页面资源体积」「首屏字节」）。改共用样式或外壳另跑 `pnpm visual:compare`。
- **原生与脚本检查：** 改 Rust（`apps/desktop`、`server/src/sync`、`apps/sync-worker`）、Swift 或 `.sh`/`.py` 时，跑 `node scripts/gates/native-checks.mjs <rust|swift|shell|python>`（对应 CI 的 `native-checks` 与 `shell-checks`）。
- spec 的验收标准逐条带编号，证明它的测试在名字或注释里写出编号（`specs/README.md`「验收编号」）。
- 不为变绿而跳过、放宽或删除断言；先分清产品回归、预期变化、测试缺陷、环境与时序。偶发失败写进 `tests/quarantine.json`（带 owner 与到期日），不从 `tests/ci-product-subset.txt` 删行（规则见 `docs/system/PACKAGE-BOUNDARIES.md`「产品子集作业」）。
- 改了创作台挂载的 Skill 章节、`horizontal/plugin-studio/src/agent-prompts.ts` 或宿主对设计答卷的整理与校验：跑 `pnpm studio:replay`，再在隔离 Home 里跑 `pnpm studio:replay smoke`（`docs/platform/STUDIO-SKILL-REPLAY.md`）。
- 测试截图默认写进已忽略的 `.impeccable/qa/review/`；常规评审截图使用 `shouldSaveReviewScreenshots()`（`MOLIS_WORK_SAVE_SCREENSHOTS=1` 按需开启），仅失败诊断和像素断言测试无条件截屏；入库的评审图只许刷新已有的（`docs/system/REPOSITORY-HYGIENE.md`）。
- **测试卫生防膨胀：** 修 bug 或加断言优先并入对应功能/owner 测试文件，不按单次修复或单次收口新开一次性小文件（不写“收口清单 / spec 文案字符串正则”测试）；浏览器测试同夹具场景复用单个 Chrome 实例，不用超过 500ms 的硬编码 `sleep` 替代真实 DOM/事件就绪条件；不把抓图脚本写进 `*.test.ts`。
- 推送前先 `git fetch origin main`，再 `pnpm secrets:check`。

## 协作

- **工作树与真实 Home 隔离：** 同一台机器上常有多个会话与工作树，开工前看 `git worktree list`；从最新 `origin/main` 开独立工作树，不在主检出里改、不重置或覆盖别人的未提交改动，只提交自己的。测试与预览一律用隔离 Home（`MOLIS_WORK_HOME` 或 `pnpm dev`），不直接动真实 Home（`~/.molis-work`，常驻服务占 `4173` / `4207` / `4208` 与唯一存储锁）。
- **以下红线必须先问用户：** 动真实 Home、换 `vendor/prologue-sdk/` 或改上游、推送 / 开 PR / 发版 / 改版本号、改门禁或 CI、新增兼容读取或迁移逻辑、调高页面资源或首屏预算（含把资源移出路由）、改变产品语义或推翻已定决定。
- **并行规则与包登记：** 并行开发规矩见 `docs/system/PARALLEL-DEVELOPMENT.md`；包归属与 CODEOWNERS 规则维护在 `scripts/package-owners.mjs`（改了跑 `node scripts/package-owners.mjs --write`），包成熟度维护在 `scripts/workspace-packages.mjs`（内置插件写在各自 `package.json` 的 `"molis-work"` 块，变更同步 `docs/SSOT-MATRIX.md` 并由 `pnpm boundary:check` 核对）。

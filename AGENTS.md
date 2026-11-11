# 在这个仓库里工作

Molis Work：本地优先的插件基座加多插件工作平台。平台是一个 Home 的常驻宿主、统一动作服务与授权、Plugin Runtime、工作台外壳和同一个 Prologue AI 运行时；内容与事实归插件，每项事实只有一个主人（`docs/SSOT-MATRIX.md`）。Goals 是每个项目都带的内置插件，拥有 Goal 的事实。

## 先读哪里

| 要做的 | 读 |
| --- | --- |
| 找文档入口、区分现行与历史 | `docs/README.md`；权威来源分工见 `docs/SSOT-MATRIX.md` |
| 产品对用户的承诺 | `PRODUCT.md` |
| 包清单、事实 owner、成熟度、分层与依赖 | `docs/system/PACKAGE-BOUNDARIES.md`、`docs/system/ARCHITECTURE.md`、`docs/SSOT-MATRIX.md` |
| 一个词该叫什么 | `docs/system/GLOSSARY.md` |
| 改某个包 | 该包 README 的「开发要求」（写法见 `docs/system/DEVELOPMENT-REQUIREMENTS.md`） |
| 能力怎样注册、发现、调用、授权 | `specs/action-architecture/spec.md` §3 |
| 写或改插件 | `skills/molis-plugin-dev/SKILL.md` |
| 调模型、跑 Agent、提示词 | `skills/molis-prologue-ai/SKILL.md` |
| 界面、文字与外观 | `DESIGN.md`、`specs/craft-finish/spec.md`、组件板 `/__ui/catalog`、`skills/molis-plugin-dev/text-and-appearance.md` |
| 仓库里放什么 | `docs/system/REPOSITORY-HYGIENE.md` |
| 开一项需求、什么要用户拍板 | `specs/post-anticorruption-roadmap/reference/development-workflow.md` |
| 某项任务 | `specs/<task>/spec.md`（开头写状态句，完成后按 `specs/README.md` 归档） |
| 多会话、工作树、子代理并行 | `docs/system/PARALLEL-DEVELOPMENT.md` |
| 改合同、库结构、版本、发版 | `docs/system/CONTRACT-CHANGES.md`、`specs/upgrade-continuity/upgrade-chain-design.md`、`docs/releases/POLICY.md` |
| 包归谁、请谁评审 | `docs/SSOT-MATRIX.md`「归属」列、`.github/CODEOWNERS` |
| 门禁怎么量、红了怎么办 | `tooling/gates/README.md`、`scripts/gates/README.md` |

## 硬约束

- **跨模块只走公开合同。** 插件不 import 另一个插件的实现。能力注册一次，由动作目录供页面、工作流、Agent、MCP 使用，不另写名单或宿主分支。
- **模型调用只经 `horizontal/agent-host`**（唯一依赖 `@prologue/sdk` 的包）。一个 Home 只有一个执行进程，其他入口转发给常驻宿主。
- **外部插件作者只装 `packages/contracts` 与 `packages/plugin-sdk`。** SDK 只依赖 contracts，不转出私有包；作者和平台共用的运行时工具放在 SDK 里，平台各层取同一份。SDK 算共享核心，改它按共享核心跑全量。
- **取消、撤权、停用的调用不再写业务记录。** 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。处理器开始前就被拒的只留一行不含内容的诊断。两个由用户定的例外：跨分区移动被拒后平台把对象移回原处（S-35），OAuth 共用刷新的凭据写回（S-95），条件见 `docs/system/SECURITY-INVARIANTS.md`。
- **合同只认现行取值。** 库与带版本文件改结构须升版本、附连续升级步骤；读取时不兜底历史取值；新增兼容或迁移逻辑先写进 `docs/system/CONTRACT-CHANGES.md`「当前保留机制」并经用户确认。
- **可信身份从调用上下文来**，不从输入读；密钥只给引用。
- **新的内置插件只有一条路：** 在自己包的 `src/registration.ts` 写 `registration`，项目级给 `project_runtime`，由每个项目的监督器（`apps/local-host/src/project-plugins.ts`）按登记装配，那个文件不为新插件改；Home 级在 Manifest 写 `runtime: { scope: "home" }` 并在登记上给 `runtime`，由 `apps/local-host/src/home-plugins.ts` 装配（写法见 `skills/molis-plugin-dev/host.md`）。`apps/workbench/src/builtin-plugins.ts` 由脚本生成，不手改。构建期手写接线只剩用户批过的 Alchemist 与插件创作台，名单在 `tests/builtin-plugin-assembly-gate.test.ts`，不可照抄。
- **插件同等待遇。** 官方、个人、创作台生成或第三方用同一套 SDK、合同、装配、平台服务与授权；只有安装信任按发布者签名区分。插件缺什么就补进平台，不给某个插件开私路。
- **插件只提供内容，挂在工作台的位置**，不出自己的整页、不开第二个标签页（例外见 `specs/shell-page-exceptions/spec.md`）。
- **成果库只收人要留存、引用的固定版本与导入文件**，类型在 manifest `artifacts.produces` 声明；交给别的插件的数据是过程项（`process_items.produces`）。
- **删除项目只有一份 Host 服务**（`apps/local-host/src/project-deletion-service.ts`），操作者由入口给。
- **项目的文件夹只在目录库里记：** 一个输出目录，其余是只读输入；插件经 `projects.directories.get@1` 读。
- **页面里跨模块说话用登记过的 DOM `CustomEvent`**（`packages/contracts/src/platform/dom-events.ts`），新增事件跑 `pnpm api:update`。
- **界面文字与外观：** 界面短句写 `t("<主人>.<位置>.<元素>", 参数)`，日期数字写 `format`；存下来以后才显示的存键和参数，不存译文，也不拿译文做判断；颜色、字体等值只在 `packages/design-system/resources/` 的基线里，样式只写语义变量；给模型的回复语言由平台一处给。第 16 批前后的过渡写法见 `skills/molis-plugin-dev/text-and-appearance.md`。
- **`vendor/prologue-sdk/` 只放当前使用的 Prologue 包**，每个包带 `.sha256` 与 `.provenance.json`（见该目录 README）。
- **一张表只由建它的包读写**；有意共写的表登记在 `tooling/gates/table-owners.json`。
- **本机安全边界逐条登记在 `docs/system/SECURITY-INVARIANTS.md`**，每条有断言拒绝本身的测试。改边界同步改表和测试；找不到拒绝就是安全缺陷。「是不是本机地址」在 TypeScript 里只有 `@molis-ai/molis-work-contracts/platform/loopback` 一份。

## 构建与测试

- 安装：`pnpm install --frozen-lockfile --offline`。单包构建：`pnpm --filter <包> run build`（`--filter` 在 `run` 前）。
- 改过 `*/src`、`scripts`、`package.json` 后，跑全量前先 `pnpm build`；全量回归期间不改源码、脚本、`package.json` 和 `skills/`，也不并发构建。
- 跑测试：`node scripts/run-tests.mjs <文件…>`；挑相关用例：`node scripts/affected-tests.mjs`。本机排队与份数按 `docs/system/PARALLEL-DEVELOPMENT.md` 第 5–8 节，判断是不是自己引入的失败用基线工作树对比。
- **门禁只许变严。** `pnpm health:check` 的各组数字对照 merge-base 量、只许变小，PR 里没有办法调大（`--update`、改基线都不行）；改门禁本身（脚本、阈值、CI）要过评审、先问用户。每个门禁的口径、例外写法与红了怎么办见 `tooling/gates/README.md`。
- 有意改公开 API、动作合同、库结构、自有版本时，分别跑 `pnpm api:update`、`pnpm actions:update`、`pnpm schemas:update`、`pnpm versions:generate`，提交生成的文件，并在 PR 里写对调用方的影响。
- 页面资源只许变小：一个资源一次涨超过 10 KB 或新增资源，先问用户；量法与放行见 `docs/cli-and-development.md`「页面资源体积」。
- spec 的验收标准逐条带编号，证明它的测试在名字或注释里写出编号（`specs/README.md`「验收编号」）。
- 不为变绿而跳过、放宽或删除断言；先分清产品回归、预期变化、测试缺陷、环境与时序。偶发失败写进 `tests/quarantine.json`（带 owner 与到期日），不从 `tests/ci-product-subset.txt` 删行（规则见 `docs/system/PACKAGE-BOUNDARIES.md`「产品子集作业」）。
- 改了创作台挂载的 Skill 章节、`plugins/native/plugin-builder/src/agent-prompts.ts` 或宿主对设计答卷的整理与校验：跑 `pnpm studio:replay`，再在隔离 Home 里跑 `pnpm studio:replay smoke`（`docs/platform/STUDIO-SKILL-REPLAY.md`）。
- 测试截图默认写进已忽略的 `.impeccable/qa/review/`；入库的评审图只许刷新已有的（`docs/system/REPOSITORY-HYGIENE.md`）。
- 推送前先 `git fetch origin main`，再 `pnpm secrets:check`。

## 协作

- 同一台机器上常有多个会话与工作树：开工前看 `git worktree list`；不重置、不覆盖别人的未提交改动，只提交自己的。
- 主检出常被真实 Home 的服务（4207）使用，改动前先确认；推送、开 PR、发布先问用户。
- 并行开发的规矩见 `docs/system/PARALLEL-DEVELOPMENT.md`；包的归属与成熟度只在 `scripts/workspace-packages.mjs` 写一处，改了跑 `node scripts/package-owners.mjs --write`。

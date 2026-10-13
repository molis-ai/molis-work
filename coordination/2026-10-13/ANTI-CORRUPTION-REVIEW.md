# 功能线防腐复查清单

给四条功能线（adoption #408、receipts #409、interaction #410、contextual #411）用：每次把最新 `main` 合进自己的交接分支后，对**本线自己的 diff** 跑一遍。依据是 `main` 上的现行规则（写于 2026-10-13，对照 origin/main `1ec92c18`）；规则原文以括号里的出处为准，本文只是索引，不新增规则。

出处缩写：**任务书** = `docs/prompts/repository-anti-corruption.md`；**整理要求** = `docs/prompts/repository-systematic-review.md`；**spec** = `specs/repository-anti-corruption/spec.md`；**PB** = `docs/system/PACKAGE-BOUNDARIES.md`；**CC** = `docs/system/CONTRACT-CHANGES.md`；**PD** = `docs/system/PARALLEL-DEVELOPMENT.md`；**HCM** = `docs/system/HUGE-CLASS-MIGRATION.md`；**AA** = `specs/action-architecture/spec.md`。

## 1. 何时跑、怎么跑

- **时机**：每次 `main` 合进交接分支之后；以及请统筹合并之前（合并前分支必须与 main 同步，PD §3）。
- **范围**：只看本线改动：

  ```sh
  git fetch -q git@github.com:molis-ai/molis-work.git '+refs/heads/main:refs/remotes/origin/main'
  BASE=$(git merge-base origin/main HEAD)
  git diff --stat $BASE..HEAD          # 先看碰了哪些包、哪些枢纽文件
  git diff $BASE..HEAD -- <路径>       # 逐项人看
  ```

- **合 main 时的冲突**：枢纽文件两边都留；`tooling/gates/baseline.json`、`tooling/gates/api/**`、`tooling/gates/actions/**` 不手工合并，合完后重新生成（见 §2、§3 第 13 条；PD §2 第 3 条）。
- **记录**：结果写进本线 spec 的进度节，一次一行：日期 · 合入的 main 提交 · merge-base · 结论（通过 / 已修的项（编号+一句）/ 暂缓的项（编号+理由+等谁））。暂缓只用于依赖防腐在途片或统筹决定的项，不能用来跳过门禁。
- 构建与浏览器用例照常走锁（`.claude/locks/slot.sh`，PD §5），不自己跑全量（BOARD「资源优先级」）。

## 2. 机器能查的（命令都已存在）

先后顺序：构建类在前。改过任何 `*/src`、`scripts`、`package.json` 后先整体 `pnpm build`（AGENTS「构建与测试」）。

| # | 命令 | 查什么 | 前置 |
| --- | --- | --- | --- |
| M1 | `pnpm boundary:check` | 分层与依赖方向、deep import、插件互引、SDK 只依赖 contracts（`public-sdk-private-dependency`）、循环依赖、层间例外名单无多余边（PB §2、§6） | 会自建 test-kit |
| M2 | `node scripts/check-health-gates.mjs --base origin/main` | 对照 merge-base 只许减少的全部数字：巨大单元、测试引用包内部、测试进程源码/构建双份、兼容标记、就地补表、vendored SDK 份数、空 catch、`as unknown as`、Biome 规则、旧名、合同包纯度、宿主入口 `export *`、Module 导出 Repository、typed 能力、层间例外、宿主插件文件与 `registerProvider(` 行、插件包名外部点名、错误模型（Error 子类、码形、码主人）；另有无基线规则：内核 K1–K5、DOM 事件登记、翻译缺失与冲突、表主人、公开 API 快照、文档断链与引用、根目录、产品子集清单、vendored 来源记录、`.impeccable/` | 不需构建；推送前以 `--base` 为准 |
| M3 | `--report [--top N]` 同上 | 看本线碰到的单元现值，确认没有变大 | — |
| M4 | `pnpm api:update` 后 `git diff tooling/gates/api/` | contracts 各 subpath 与 plugin-sdk 出口；diff 只应剩本线有意的变化，PR 里写影响（CC §3 第 6 条） | 不需构建 |
| M5 | `pnpm build` → `pnpm actions:update` → `git diff tooling/gates/actions/`；核对 `pnpm test:contracts` | 动作与消费场景的 `capability_id@version`、提供方、受众、schema 哈希；同一版本下形状变了要升版本（CC §3 第 3、6 条） | 需 `pnpm build` |
| M6 | `pnpm workspace:build` → `node scripts/gates/page-assets.mjs --base origin/main` | `/assets/` 下每个文件字节数只许变小（决定 #17）；变小了用 `--update --base origin/main` 降 | 需 `pnpm workspace:build` |
| M7 | `pnpm lint` | Biome 逐处列出（含基线已接受的），确认新增行里没有空 catch、`as unknown as`、浮动 promise、显式 any、console、debugger、`biome-ignore` | 不需构建；构建后多看到跨包 promise |
| M8 | `node scripts/gates/dom-events.mjs`（`--report` 看谁发谁听） | 新 `CustomEvent` 已在 `packages/contracts/src/platform/dom-events.ts` 登记、名字是字面量、无孤儿条目 | — |
| M9 | `node scripts/gates/translations.mjs --missing --conflicts` | 新中文文案有英文、`*_EN` 词典已并进 `EN`、无新冲突 | — |
| M10 | `node scripts/test-imports.mjs --check --chains` | 新测试没有既从 `../P/src` 又从包名/dist 加载同一包 | — |
| M11 | `node scripts/gates/package-inventory.mjs --table` | 增删 workspace 包、迁监督器、改 import 可达性后重新生成 spec §5.1 对应行 | 只在包变化时 |
| M12 | `node scripts/package-owners.mjs --write` | 新增/删除包后同步 SSOT「归属」与 CODEOWNERS | 只在包变化时 |
| M13 | `node scripts/affected-tests.mjs`（`--explain`）→ `--run`，浏览器用例另排锁 | 本线改动选出的用例；它建议全量时交统筹决定，不自己跑 | 先 build |
| M14 | `pnpm test:security` | 动了 SECURITY-INVARIANTS 里的任何边界时 | 先 build |
| M15 | `pnpm secrets:check`（先 fetch main） | 推送前，逐提交扫新增行 | — |
| M16 | `pnpm studio:replay` | 只在改了创作台挂载的 Skill 章节、`agent-prompts.ts`、`agent-authoring.ts`/`agent-validation.ts` 时 | — |

## 3. 要人看的

每条一行、带出处；本线 diff 里遇到就逐条核。

1. **不留兼容**：不写旧取值兜底、别名、旧路由、迁移链、「读取兼容」；库改结构就改建库基线并升版本，版本不符拒绝。新增任何兼容/迁移先写进 spec 保留机制并经用户确认（任务书 §4.1；AGENTS 硬约束；CC §3 第 1、4 条）。
2. **注册一次、单一入口**：新能力注册成动作（Manifest 声明 + 处理器），由共同目录供页面、工作流、Agent、MCP；不改宿主名单、工作流分支、首页分支、MCP 工具总表；不新增 typed 宿主能力（`HostCapabilityDefinition`/`registerCapability`），决定 #1/N-12（AA §3 C1–C8；PB §6 `typedCapabilities`；任务书 §4.2）。
3. **调用链一致**：同一能力从界面、MCP、助理进来，权限、错误码、事件一致；带调用编号（W3-01）；不写绕过动作服务的私有捷径（任务书 §4.2；AA C8）。
4. **身份与提交**：actor/项目/安装取自调用上下文，不从输入或 `_meta` 读；等模型/外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 按读取版本提交；被取消/撤权/停用后不写业务记录（AGENTS 硬约束；S-17、S-18）。
5. **分层**：插件不 import 别的插件/App/横向服务/Module 实现；Module 不往上依赖；平台包（含 design-system、ui-host）只读 `contracts/platform/*` 与更低的平台包；contracts 不依赖任何工作区包；plugin-sdk 只依赖 contracts，不转出私有包（PB §1、§2）。
6. **模型只经 agent-host**：只有 `horizontal/agent-host` 依赖 `@prologue/sdk`；插件要模型走 Runtime 的 `services.model`（W3-06-E），不各写 AI 适配、不供应商直连（AGENTS；整理要求 §8；任务书 §4.3）。
7. **内核纯度**：内核核心不调情境排序；情境排序（`contextual.ts`/`contextual/`）只导入 `contracts/platform/actions`、`contracts/services/contextual`、`node:crypto`，无 I/O、无可变状态、不点名能力 id；新的合同子路径要加进 `CONTEXTUAL_PACKAGES`，那是一次有意评审（PB §6 K1–K5）。
8. **放置与职责**：方法放在数据/规则的主人里；路由、HTTP 处理器、界面渲染不做业务决策；Store 不调网络与模型；不新建万能 Manager/Service/Coordinator；一次性逻辑不建抽象（任务书 §4.4；PB §2 末条；整理要求 §3）。
9. **巨大单元**：文件 >800 行、类 >300 行或 >25 方法、函数 >150 行。新单元一律拆到阈值下（功能 PR 没有登记这条路）；已有巨大单元只许变小；搬动巨大函数等于新增，搬的同时拆；同名函数会被门禁合并成一个键，评审时留意（HCM §1；AGENTS 健康门禁）。
10. **扩展点**：新内置插件只走 Plugin Runtime 监督器条目，不新增 `<插件>-native-plugin-http.ts`、不加 `builtin-plugins.ts` 条目；插件只提供内容挂在工作台位置，不出整页、不开新标签页；插件包名在本包外被点名的文件数不增（AGENTS 硬约束；PB §6 `pluginOutsideMentions`；`specs/artifact-positioning/spec.md` §4）。
11. **合同包纯度**：contracts 只放类型、Schema、无副作用的小工具；不加定时器、`Date.now()`、模块级可变状态、20 行以上函数；不加只导出一个描述符、没人用的占位子路径；新子路径或新合同同一次合入就有真实消费者、守它的测试、写进插件开发 Skill（PB §6 `contractsPurity`；任务书 §4.10、§4.12）。
12. **合同变更**：改了 contracts 导出、SDK 出口、动作 schema、Manifest 格式、MCP 工具名 → 同一 PR 改完所有消费者（调用方、Skill、手册、测试）；有版本字段的形状变了就升版本；改外部在用的 MCP 工具名先问用户（CC §3 第 2、3、5 条）。
13. **快照与基线**：`tooling/gates/api/`、`tooling/gates/actions/`、`baseline.json`、`page-assets.json` 一律重新生成，不手改、不手工合并；数字只能降（PD §2 第 3 条；AGENTS）。
14. **错误模型**：新错误码写成 `defineErrorCodes("<主人名>", …)`，形如 `<主人>.<原因>`；不新写 `extends Error` 子类；不按码选 HTTP 状态（状态只在 `packages/plugin-sdk/src/errors.ts`）；新包/区域先在 `tooling/gates/error-owners.json` 加主人（AGENTS「错误模型的数字」）。
15. **数据**：一张表只由建它的包读写，别的包调它导出的函数；有意共写登记在 `tooling/gates/table-owners.json`；每个库一份当前 schema 建库代码；不就地补表（AGENTS；任务书 §4.11）。
16. **命名**：动作、判断规则、Skill、Character、项目、插件名按 `docs/system/GLOSSARY.md`；不新用旧名（`goalboard`、`board_id`）（任务书 §4.15）。
17. **安全不变量**：动了回环/Host/Origin/令牌、MCP 授权、路径与地址校验、密钥引用、提示注入（S-13：材料带不可信声明、去密钥、不进题面）、桌面 IPC → 同步改 `docs/system/SECURITY-INVARIANTS.md` 的表和断言「拒绝」的测试；本机判断只用 `contracts/platform/loopback`（AGENTS；任务书 §4.18）。
18. **页面事件**：跨模块只用登记过的 DOM `CustomEvent`，名字写字面量，登记与发送同一改动（AGENTS；M8）。
19. **页面资源**：样式与客户端脚本字节只许变小；加东西要同时删等量（W1 合入时的先例：删掉证明无用的客户端代码抵消，spec §10）（决定 #17；M6）。
20. **界面文字**：新文案经翻译函数并给英文；决定 #16 是全部换稳定键、词典按主人分，新词条写在本插件/本包的词典，不往总词典 `i18n/en.ts` 堆（`apps/workbench/README.md`「界面文字」；HCM W5-03）。
21. **浏览器请求**：新的页面请求用 `packages/ui-host/src/request-client.ts`（控制头、幂等键、错误带码与诊断编号），不另写 fetch 包装（W3-10；spec §10）。
22. **测试**：测试经公开入口，不新增对包内部源码的引用（新测试文件从 0 开始）；不跳过、不放宽、不删断言；失败先分产品回归/预期变化/测试缺陷/环境时序，用基线工作树比对（AGENTS；整理要求 §12）。产品用例快而稳就加进 `tests/ci-product-subset.txt`；改名/删除清单里的用例同一 PR 改清单。
23. **验收编号**：本线 spec 的验收条带编号，证明它的测试在名字或注释里写出编号（`specs/README.md`「验收编号」）。
24. **Prologue SDK**：`vendor/prologue-sdk/` 至多 2 份 tgz（当前一份 + 在途一份）；换包删旧包，`.sha256`、`.provenance.json`、`patch-history.json`、README 重建步骤与包相符；两条线要不同 SDK 改动时合成一个包，合成负责人按 BOARD 是 adoption（PD §11；limits.json `vendoredPrologueSdk`）。
25. **枢纽文件礼仪**：只加自己的行、写在自己的位置；不顺手重排/改名/换格式；解冲突两边都留；解完重跑 M1、M2（PD §2）。本线常碰的枢纽：contracts `platform/plugin.ts`、`platform/actions.ts`、`services/agent-host.ts`、`services/assistant.ts`；workbench `i18n/en.ts`、`scripts/client/initialization.ts`、`plugin-workbench.ts`、`page-assets.ts`；`packages/design-system/src/styles/craft-finish.ts`；`assistant-island.ts`、`prologue-node.ts`、`assistant-service.ts`、`announce-guard.ts`；`scripts/workspace-packages.mjs`、`pnpm-lock.yaml`、`tests/ci-product-subset.txt`、`specs/README.md`、`docs/SSOT-MATRIX.md`。
26. **分支卫生**：只往本线交接分支提交，不开新 Molis PR（BOARD 2026-10-13）；不夹带门禁/脚本/CI 改动（那是唯一能放宽数字的地方，单独 PR、先问用户，PD §2 第 5 条）；机械改动与逻辑分开；不用裸 `git stash`；不碰真实 Home（PD §1、§9）。
27. **不放宽门禁**：不改 `limits.json`、`biome.jsonc`（只许变严）、门禁脚本、`giant-exceptions.json`、`doc-citation-exceptions.json`、`secret-allowlist.txt`、`quarantine.json` 来换取通过（AGENTS）。

## 4. 与防腐在途工作的交界

状态取自 spec §10、§10.1（10-12）和 `wave3-batchB-plan.md`；合 main 后以 main 为准，`git log origin/main --first-parent` 核对哪些已合。共同要求：**建在 main 的新形状上；不把被删的写法带回来；要动下表「谁的文件」之前先找统筹**。

| 防腐片 | 状态 | 碰到的线 | 动的东西 | 功能线要做的 |
| --- | --- | --- | --- | --- |
| W3-01 调用编号（A–F） | A–C、E（#448）、D（#452 mcp-gateway）已合；F 在 I4 | 全部 | agent-host `index.ts`、`prologue.ts`、contracts `services/agent-host.ts` 就地改；诊断页 | 新入口跑在 `withCallId` 里；调用记录只记已有字段；被拒只留「未执行」行（AGENTS 硬约束 10-10） |
| W3-02 错误模型 | A、B、D 已合（门禁在 main）；C、E 在 I4；F、G2 第五批；G3、G4、H、R、J 未做 | 全部；G3 撞 interaction/contextual | G3：`assistant-service.ts`、`assistant-island.ts` 包装与读取、`memory-host.ts`、`agent-definitions-http.ts`；G4：`coding-surface.ts`、Coding `routes.ts` | 新码按 §3 第 14 条；碰 G3/G4 文件先问统筹排序 |
| W3-03 / W3-05 声明检查 | 已合（#414、#441、#427、#440） | contextual（#431 SDK 声明） | `packages/plugin-sdk/src/action-declarations.ts`、`action-cross-references.ts` | 新声明字段的交叉检查加在 SDK 这两处，不加回 contracts；`registerProvider` 只剩约 3 行余量（147/150，计划 §2 10-11 量） |
| W3-04 情境归位 | 已合（#376–#379） | contextual | 内核两半、K1–K5；选区推荐保持只给工作台的 HTTP，带删除条件；判断材料分行文字（S-13） | 要让助理/工作流/MCP 用情境推荐 = 触发删除条件：改成只读系统动作，先找统筹 |
| W3-06-E `services.model` | I4，未合 | adoption、interaction、receipts | contracts `platform/plugin.ts`、plugin-runtime、local-host `plugin-model-service.ts`、SDK 出口、PROLOGUE-AI §4/§8 | 插件侧模型调用等它落地后走它；不另建 typed 能力 |
| W3-06-F1/F | 第五批 / 未做 | interaction（Coding） | 从 `handleCodingPluginHttp`（148/150）搬出 `plugin-route-operations.ts` | 不往这个函数加行 |
| W3-07 管理入口走动作 | PR-3 在 I4；PR-4–9 未做 | adoption | CLI、管理 MCP、`host_only` 删除（PR-6）、`LocalMcpServer`（297/300） | 不往 `LocalMcpServer` 加行；不新增 `host_only` 用法 |
| W3-09-3 版本前置 | 未做 | interaction、receipts、contextual（起草） | 所有 AI 来源须带读到的版本（`actions.version_required`）；`assistant-authority.ts` 删本地检查 | 新的 AI 写入路径从一开始就带读取版本 |
| W3-10 浏览器请求助手 | 1a、1b 已合；2–4 未做 | contextual、interaction | W3-10-4：`assistant-island.ts` 包装、`placement.ts`、情境动作、`initialization.ts` 端口 | 新请求用 `request-client.ts`；W3-10-4 与本线同文件，先问统筹 |
| W2-10 / W2-11 测试走公开入口 | 部分合；其余在途 | 全部 | 大量测试 import 改写、test-kit 助手 | 新测试用 test-kit（`/browser`、`/local-host-http`）与公开入口 |
| W4-05 助理拆分样板 | 未做 | interaction、receipts | 在 `assistant-service.ts`、`assistant-store.ts` 里抽出提醒与跟进协作者（决定 #3） | 不往 `AssistantService` 加方法；新逻辑放成按端口依赖宿主的协作者 |
| W4-06 拆 Prologue 节点适配器 | 未做 | adoption | `initializePrologueNodeAdapter` 拆成 `prologue-run.ts` 与 memory/documents/sessions/schedule/recovery 端口模块 | adoption 若先动 `prologue-node.ts`：只就地改、不加长；改动量大时与统筹商量是否顺手按 W4-06 的切法拆 |
| W5-09 拆 agent-host 合同 | 未做 | adoption、interaction | contracts `services/agent-host.ts`（巨大文件）按领域拆，`platform/plugin.ts` 热点瘦身；纯搬移，API 快照守 | 新 AI 交互合同放独立子路径（如 #447 的 `services/agent-interaction`），不往 `agent-host.ts` 堆 |
| W5-10 其余巨大单元 | 未做 | 全部 | 第 1 批 assistant（协作者：委派、材料轮次、记忆桥、提议与撤销），第 6 批 `horizontal/agent-host`（11 文件 15 单元，`prologue.ts` 1,026 行、`index.ts`），另有 `apps/workbench`、`apps/local-host`、design-system（1 文件 2 单元）、kernel | 碰这些文件只减不增；见 HCM §2 顺序表 |
| W5-02 声明式登记 / W5-03 翻译 / W5-04 打包 / W5-05 删旧皮肤 / W4-12 视觉比对 | 未做 | contextual、interaction（design-system、workbench 外壳） | design-system 名单、`initialization.ts` 名字、外壳放置提示；词典按主人；浏览器脚本打包；旧皮肤 | 新外壳挂点尽量走声明；新文案进本包词典；新浏览器代码按设计系统原语写，不依赖将删的旧皮肤 |
| Prologue SDK 收敛 | 方向已定（决定 #25），tgz 移出公开仓库未做 | adoption（合成负责人） | `vendor/prologue-sdk/` | 换包同一提交删旧包、写全来源；不超过 2 份 |

已不执行、不要按旧路线做的：W4-08「拆 MemoryService/记忆搬 Module」（N-03 改为包内由 W5-10 拆）；W3-03「搬进内核/plugin-runtime 由 SDK 转出」（改为放进 SDK 本身）。

## 5. 冲突时怎么办

- 本线需求与上面任何一条冲突（门禁变红、要改在途片的文件、要新兼容逻辑、要新 typed 能力、要放宽数字、要改合同语义）：**停下**，把具体冲突（文件:行、哪条规则、门禁输出、你的两三个做法与代价）报给统筹，等决定，同时推进不依赖它的部分。
- 不改门禁、不加例外、不改基线、不删/跳过/放宽断言来过关；不用 `--update` 掩盖变大的数字（它也写不进去）。
- 防腐片和本线改同一文件时，先合的先合，后者合 main 后重跑 M1、M2 和相关用例（PD §2 第 4 条）。
- 结果（包括「已报统筹、等待中」）照 §1 记进本线 spec。

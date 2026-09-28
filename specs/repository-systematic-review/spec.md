# 仓库系统整理（防腐）

状态：执行中（2026-09-27 起）。要求原文是用户放在主检出的 `docs/prompts/repository-systematic-review.md`（未入库，本文第 1–2 节已收录其要点）；2026-09-27 追加：为每个模块写开发手册、规范与要求（W9b）。
分支 `chore/repo-systematic-review`（工作树 `~/code/goalboard-review`，基于 main `8b609527`）。本文是这次整理唯一的总 spec；逐项证据写在本文第 8、10 节，不另开进度文件。

## 1. 目标

经过多轮迭代后，让仓库重新满足：模块职责合理、代码归属清楚、开发契约落实、能力能被正确发现和使用、跨功能行为一致、失败可恢复、测试表达当前有效预期、文档与代码一致，并给后续开发留下可执行的手册、Skill 和门禁。

交付是实际修复与验证。建议不冒充修复，交接不冒充关闭，测试全绿不冒充产品完整。

## 2. 范围

- 全仓清点：apps、Host、horizontal、modules、packages、plugins、tooling、scripts、tests、docs/specs/skills、vendor。深查按风险安排，未深入的范围在第 7 节标明。
- 修复：真实缺陷与权限/状态问题 → 契约与接入遗漏 → 模块边界 → 共享与 SDK 下沉 → 清理 → 手册与 Skill。
- 不做：发布、部署、推送（推送与开 PR 先问用户）；与本次无关的产品新功能；无依据的大重写；为目录整齐或抽象更多而搬代码。
- 涉及产品语义、公共契约或重大迁移策略的实质变化，先在第 9 节给方案与取舍，等用户决定，同时继续独立工作。

## 3. 事实来源与冲突处理

| 问题 | 先看 |
| --- | --- |
| 产品承诺 | `PRODUCT.md` |
| 包清单、owner、成熟度 | `docs/SSOT-MATRIX.md`、`scripts/workspace-packages.mjs` |
| 分层与依赖规则 | `docs/system/ARCHITECTURE.md`、`docs/system/PACKAGE-BOUNDARIES.md` |
| 能力注册/发现/调用合同 | `specs/action-architecture/spec.md` §3（基本合同）与 `migration.md` |
| 插件开发标准 | `skills/molis-plugin-dev/`、`docs/platform/PLUGIN-DEVELOPMENT.md` |
| 设计规范 | `DESIGN.md`、`specs/craft-finish/spec.md` |
| 当前行为 | 代码、测试、真实界面实操 |

实现、测试、文档都是证据，没有哪一方自动正确。冲突时在第 8 节标明属于：实现回归 / 测试落后 / 测试设计错误 / 文档过时 / 需求不明确。

## 4. 负责人与并行

| 范围 | 负责 | 状态 |
| --- | --- | --- |
| Goals 快照输出合同与历史数据（`modules/goals/src/{goal-commands,query}.ts`、`plugins/native/goals/src/*-schemas.ts`、`contracts/modules/goals.ts`、`tests/goals-query-actions.test.ts`） | 统筹合并会话，分支 `fix/goals-legacy-snapshot` | 在途；合入后本线变基，并排查其他输出合同的同类风险（F-03） |
| Personal Work Assistant 后续 5 个提交 | Codex 工作树 `feature/personal-work-assistant` | 在途，未合入；本线不改 `personal-assistant-*` |
| 其余全部 | 本会话 | — |

本线不写主检出（真实 Home 的 4207 跑它），不重启他人预览；共享核心与有依赖顺序的修改串行做。

## 5. 实施顺序

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| W0 | 现场、授权、负责人；工作树与构建 | 完成 |
| W1 | 清单与基线：全部包/插件/入口；非浏览器与浏览器测试基线及分类 | 完成 |
| W2 | 真实缺陷与权限/状态问题修复 | 完成（F-01、F-02、F-04、F-06） |
| W3 | 契约、注册、发现与接入遗漏（动作目录、MCP、端口、生命周期） | 完成（F-03、F-21、F-23、F-24；端口按 D-04） |
| W4 | 模块边界与代码归属（Host 平铺、Coding 路由、越界读取） | 进行中（F-18 完成；F-19 待做） |
| W5 | AI 能力与 Prologue 专项（入口清单、共享/下沉判断） | 进行中（F-04 完成；F-15 待 SDK 线） |
| W6 | 前端质感与动线（真实界面） | 完成：基线浏览器失败涉及的动线逐一在隔离预览实操（1440/1024/756/601/390，含深色截图用例）；修 F-26～F-34 |
| W7 | 清理：死代码、旧入口、旧文档、旧 spec、vendor | 进行中（F-12、F-13、F-20 完成；F-14 部分；F-17 待用户） |
| W8 | 测试与预期对齐、CI 门禁恢复 | 完成（基线失败逐项对齐；F-08 合同子集进 CI） |
| W9 | Prologue AI 开发手册、Prologue AI Skill、插件开发 Skill 更新与走查 | 完成 |
| W9b | 用户 2026-09-27 补充：每个模块都有开发手册、开发规范与要求（落在各包 README 的「开发要求」一节：负责与不负责、公开入口、允许依赖、不变量、改动后必跑测试、相关手册/Skill；事实部分从代码提取，不变量逐包手写），并由门禁守住存在与链接有效 | 完成：69 个 README 都有这一节；写法见 `docs/system/DEVELOPMENT-REQUIREMENTS.md`；门禁 `scripts/package-dev-requirements.mjs` 挂在 `pnpm boundary:check`（依赖与 package.json 双向一致、测试与链接存在），自身有允许/拒绝用例 |
| W10 | 整体回归、最终交付 | 进行中 |

## 6. 验收

1. 第 7 节清单覆盖全部包与插件，每项有审查状态；未深入的明确标注。
2. 第 8 节每个问题有证据、根因、处理结果和状态（已完成/在途/待决），修复有对应测试或实操证据。
3. 全量非浏览器与浏览器回归与基线逐项对比：没有新增失败；基线失败逐项归类并处理（修复、更新测试或写明原因与负责人）。
4. `pnpm typecheck:all`、`pnpm boundary:check`、`pnpm build` 通过。
5. 手册与 Skill 的路径、链接、触发说明经代表性开发场景走查；69 个包的 README 都有「开发要求」一节，所列测试与链接真实存在。
6. 第 9 节待决事项都有具体方案、取舍和负责人。

## 7. 清单与审查状态

事实来源：`scripts/workspace-packages.mjs`（69 个包）、真实宿主导出的动作目录（496 个动作，2026-09-27）、全量测试基线。深度：**深**＝读调用链并修复/验证；**中**＝定向检查与测试分类；**浅**＝只做清单与文档核对。

| 类别 | 包 | 审查深度 | 结论 |
| --- | --- | --- | --- |
| Apps | `apps/local-host` | 深 | 组合根职责清楚；安装器缺陷 F-01、串行队列 F-21、Home 不一致错误码 F-06；平铺目录判断见 F-18 |
| | `apps/workbench` | 中 | 客户端刷新行为不一致 F-05；翻译缺口 F-07；Agent 提示词映射 F-23；界面走查见 W6 |
| | `apps/mcp`、`apps/cli`、`apps/desktop`、`apps/server`、`server` | 浅 | 生产 MCP 转发拓扑经 Images 用例实测；CLI 安装链经安装族用例；Desktop/Tauri 与 Server 未深入 |
| Foundation | `packages/kernel`、`packages/contracts` | 深 | 结果校验语义按 D-01 实现；`effect` 名字推断误判 F-24（已显式声明，`withActionEffect`） |
| | `packages/plugin-runtime`、`plugin-sdk`、`plugin-sandbox` | 中 | Manifest 端口声明校验生效，夹具落后已修；沙箱未深入 |
| | `design-system`、`ui-host`、`storage`、`test-kit`、`im-ui` | 浅 | 样式测试设计问题已修；其余未深入 |
| Horizontal | `horizontal/agent-host` | 深 | 唯一 SDK 依赖点；错误原因保留 F-04；SDK 错误分类 F-15 |
| | `connector-host`、`listener-host`、`runtime-host`、`scheduler` | 浅 | Feed 拉取并发 F-22；9-22 审计的 Scheduler 租约问题已确认修复 |
| Modules | `modules/goals` | 中 | 快照历史兼容由统筹会话修（#89）；9-22 审计 C02/C03 确认已修 |
| | 其余 14 个模块 | 浅 | 经各插件动作与迁移测试间接覆盖；未逐个读实现 |
| Native 插件 | Pages、灵光、Inbox、Alchemist、Images、Jelly、Coding | 深 | F-02、F-21、F-23；Coding `routes.ts` 结构 F-19 |
| | Goals、Feed、Form、Dataset、PPT、Artifacts、Schedule、Shelf、Work、Workflows、Files/Git/Diff/Text stats、Characters、Cognia、Experiments、Plugin Builder | 中 | 动作目录与测试基线核对；未发现新的实现缺陷；逐插件界面走查见 W6 |
| Integration | catalog、github、gmail、rss、web-query、youtube | 浅 | OAuth 迟到回调按兑换前校验确认；真实账号联调未做 |
| 发布与工具 | `tooling/plugin-cli`、`vendor/*`、安装器、npm 打包 | 中 | 安装链修复并回归；vendor 旧包 D-03 |
| 文档与规范 | `docs/`、`specs/`、`skills/`、`.cursor/`、根指引 | 中 | 断链、SSOT、交接归档、Skill 过时描述已处理；69 个包的「开发要求」（W9b）；规格归档只处理开头有明确状态的（F-14） |

## 8. 问题清单

编号按发现顺序；严重程度 S1（数据/权限/功能不可用）> S2（契约或接入缺口、行为不一致）> S3（结构与维护成本）> S4（文档与清理）。

| 编号 | 严重 | 问题 | 证据 | 根因 | 处理 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | S1 | 从源码安装、打包 npm、准备桌面载荷、卸载预览全部失败 | 基线 12 个安装族用例报「运行时依赖身份无效: @modelcontextprotocol/sdk (…/dist/cjs/package.json)」 | 安装器用 `require.resolve("<包>/package.json")` 取身份；该 SDK 的通配 exports 把它映射到只含 `type` 的子目录清单 | `installer/home-dependencies.ts` 解析结果名字不符时向上找包自己的清单；新增回归用例（修复前失败、修复后通过） | 已完成 |
| F-02 | S2 | Pages 文稿生成被取消（或撤权、停用）后记录停在「生成中」，3 分钟内重试被拒且提示「仍在生成」 | `pages-cross-module` 取消用例；`store.beginGeneration` 对 180 秒内的 running 记录拒绝 | action-architecture F2 规定被拒绝的调用不得再写任何记录（`action-before-effect` 守着），而重试无法分辨这条 running 记录的发起者是否已结束 | 初版修法（取消时写失败记录）违反 F2，已撤回；改为进程内记下这次尝试已结束（`releaseGenerationAttempt`）：被拒的调用不写任何记录，本进程的新调用可立即接管，其他进程的尝试仍守 180 秒租约；新增 `pages-generation-lease` 用例 | 已完成 |
| F-03 | S2 | 读动作把历史记录原样回显，却用严格枚举/`additionalProperties:false` 校验结果；一条旧数据不合规，整个读取失败 | Goals 快照：示例项目首页与设置页打不开（统筹会话 #89） | 内核对结果做致命校验；合同按「新写入」而不是「已存历史」写 | Goals 部分由统筹会话修（#89，原则：读取兼容、写入严格）；按 D-01 保持致命校验，已提交的写动作改报 `actions.output_invalid_after_effect`；新增 `action-read-compatibility`：用 v35 四种历史样本与示例种子跑目录中全部无参读取，未发现其他不合规合同 | 已完成 |
| F-04 | S2 | AI 执行服务被本机另一进程占用或未就绪时，Images 报「无法连接厂商…请检查网络」，文字补全报「模型请求失败或超时」 | 实测 MCP 进程内的图片任务 2ms 失败并显示网络提示 | 推理层保留了错误码但换成通用文字，消费方再改写成厂商/网络原因 | Agent Host 新增共享判断 `inferenceServiceUnavailableReason`，Images 与文字补全共用；两条回归用例（真实占用执行锁） | 已完成 |
| F-05 | S3 | Inbox 列表局部刷新失败时整页重载，Feed 同类失败保留输入并提示 | 两处客户端脚本对比 | Feed 在 craft-finish 改了，Inbox 没跟 | Inbox 对齐为同一提示；测试同时守两边 | 已完成 |
| F-06 | S3 | 「Agent 服务与 Host 必须属于同一个 Home」没有错误码，调用方无法按码处理 | `system-agent-service` 用例期望 `actions.home_mismatch` | 抛的是普通 Error | 改为 `ActionError("actions.home_mismatch")` | 已完成 |
| F-07 | S4 | 47 条界面文案没有英文，英文界面露出中文 | `i18n` 用例 | 新页面文案未进词典 | 补入 `gap-en.ts`，沿用既有术语 | 已完成 |
| F-08 | S2 | CI 只跑边界检查与 3 个定向测试，全量产品测试「暂停」；F-01 这类安装失败长期无人发现 | `.github/workflows/ci.yml` | 早期全量不稳定时暂停，之后没有恢复稳定子集 | 按 D-05：`pnpm test:contracts`（22 个动作目录、Manifest、MCP 授予合同文件）加入 CI 的 ubuntu 任务；干净克隆按 CI 步骤实测两遍 108/108、约 48 秒；PR 模板要求本机全量对比 | 已完成（ubuntu 首跑待推送后确认） |
| F-09 | S3 | 35 个测试把截图写进仓库跟踪的 `.impeccable/review/`（817 个文件、88MB），每次运行都在各工作树制造二进制改动与合并冲突 | 本工作树、主检出、Codex 工作树都有被改写的 png | 测试直接写评审证据目录 | 新增 `tests/fixtures/review-evidence.ts`：默认写入已忽略的 `.impeccable/qa/review/`，刷新评审截图需显式 `MOLIS_WORK_REVIEW_EVIDENCE=1` | 已完成 |
| F-10 | S3 | Alchemist 26 个 vitest 测试不在根测试脚本和 CI 中 | `plugins/native/alchemist/package.json` 的 `test` | 插件自带测试框架 | 跑一遍并决定并入 | 待开始 |
| F-11 | S2 | 端口默认连线按插件名写死（`workspace-plugin-bindings.ts` 13 行名单），第三方插件的输入端口不会被接上，产品里也没有连线页 | 代码 | 端口只服务 Coding 家族时的快捷做法 | 按 D-04 短期方案 C：维持名单，限制写进插件开发 Skill（`elements.md`）；有第三方端口插件时做 A | 已完成（短期） |
| F-12 | S4 | 架构规格目录改名未同步，约 45 处链接失效；README 的 bug 卡台账链接失效 | 断链扫描 | 9824f6e6 改名只改了链接没改目录 | 目录与文件改名，断链清零（仅剩外部机器绝对路径） | 已完成 |
| F-13 | S4 | `docs/SSOT-MATRIX.md` 严重过时：写 39 个包（实际 69）、多处「stub」「待补」与现状不符 | 对照代码 | 各线迭代未回写矩阵 | 按事实重写相关行（4b9be410） | 已完成 |
| F-14 | S4 | `specs/` 根目录约 184 份规格，README 只列 15 份在做，其余多已完成未归档 | 状态行扫描 | 归档规则只执行过一次 | 归档开头写明已完成的两份；其余状态不明的逐份确认后再归档 | 在途 |
| F-15 | S3 | Prologue SDK 把「派发前授权被拒」（如 Character 停用）归为 `MODEL_NETWORK_FAILED` | `agent-action-tools-prologue` 用例 | SDK 错误分类 | 列入 Prologue 下沉/修正清单（W5） | 待决 |
| F-16 | S3 | Images 并发与 Alchemist 多宿主两个用例模拟「同一 Home 多个执行进程」，而生产中 stdio MCP 转发给常驻 Web 宿主 | 两用例在 main 上失败；9-27 迁移记录已指出 | 9-26 统一走 Prologue 后同 Home 只有一个执行进程 | 按生产转发拓扑重写：单一常驻宿主、项目范围授予、生产 MCP 启动器；第二个宿主断言 `inference.home_in_use` | 已完成 |
| F-17 | S4 | `vendor/prologue-sdk` 38 个 tgz（34MB）只 1 个在用；不进发布包，只增加仓库体积 | 锁文件与发布资产测试 | 旧包按约定保留以便回退 | 用户同意 D-03 后，删除操作被本机自动模式的安全检查拒绝，已撤回、未删除；需用户亲自执行或放行（进行中的 `feature/personal-work-assistant` 仍依赖 `compaction-growth.tgz`，应保留） | 待用户 |
| F-18 | S3 | `apps/local-host/src` 约 250 个平铺文件 | 目录 | — | 判断：多为组合适配与 Node IO，按名称前缀已自然分区；整体搬迁只改路径不改职责，且会打断数百处测试引用、与并行工作冲突。不搬，在 `docs/platform/LOCAL-HOST.md` 写清分区与放置规则 | 已完成 |
| F-19 | S3 | Coding `routes.ts` 是约 1400 行的单个闭包：委派信件视图转换、预算存储、子代理分组、后台唤醒循环与路由表混在一起 | 代码 | 各期功能叠加 | W4 拆出纯视图转换与后台循环，路由只做装配 | 待开始 |
| F-21 | S2 | 在处理器里等模型或外部服务的动作没有声明并发，等待期间占住整个项目（或 Home）的串行队列：一次 Alchemist 对话、Pages 生成/写作助手、灵光对话、Inbox 整理成文稿、外部 MCP 工具调用都会让同项目其他所有操作排队（可达数分钟）；Form/Dataset/Jelly/Workflows 已声明，同类行为不一致 | 改写后的 Alchemist 多调用者用例两个对话互相等待；宿主为此打「已占用项目操作队列 N 秒」日志 | 串行是默认，只有部分插件记得声明 | 上述动作声明 `scheduling: "concurrent"`（逐个核对：都在返回后按快照/CAS 提交，或本地不写状态）；新增门禁 `tests/action-model-scheduling.test.ts`：目录中所有声明 `model:invoke` 的动作必须并发，例外逐条写理由；灵光用例验证等模型时同项目读写照常完成（修复前失败） | 已完成 |
| F-22 | S3 | Feed 立即拉取（最长 45–180 秒）、Feed 规则评估、首页/Inbox 判断评估仍在队列内等外部服务 | 目录导出 | 这些写入与用户同时处置同一条目时靠队列排序；Feed 同一来源不同幂等键的两次拉取没有逐来源租约 | 需先改为逐来源租约与按版本提交再放出队列；门禁里列为有理由的例外 | 待开始 |
| F-20 | S4 | `docs/` 根目录的 2026-09-22 两份审计交接（C01–C10、UI #1–#8）仍像待办 | 逐项核对代码 | — | 全部已修（B01 仍开，规范已注明）；加状态说明后移到 `docs/archive/handoffs` | 已完成 |
| F-23 | S3 | Workbench 按插件 id 分支把 Agent 提示词正文配给 Coding、创作台、Schedule；新插件声明了提示词却没有正文时不报错，Agent 以空角色启动 | `plugin-catalog.ts` 的三元分支 | 正文与声明分在两处，靠名单连接 | 正文随目录条目的 `agent` 声明；新增 `builtin-plugin-agent-texts` 门禁（提示词、压缩提示词、方法都要有正文；突变验证能抓到缺失） | 已完成 |
| F-24 | S3 | 动作 `effect` 按 id 推断：`delete_preview`（只存确认凭证）、`goals.trash.set`（可恢复）、`relation.reset`、`sample.remove` 被当成不可撤销 | 目录导出 | 名字推断没有覆盖这些语义 | `withActionEffect` 显式声明为写，并保持原本不进生成插件（`plugin: false`） | 已完成 |
| F-25 | S4 | 插件创作台 README 仍只写“解释器 v1”模式，没写 Agent 写代码、Local Host 构建检查与沙箱试跑 | README 与 `apps/local-host/src/plugin-builder/build-checks.ts` 对照 | 合入后文档未回写 | 已写进该包「开发要求」；README 正文待创作台负责人补一段 | 在途 |
| F-26 | S2 | 首页：常驻今天的前一天事项只显示「23:18」；「此刻」线用字符串比时:分而画在昨天那条之前；30 秒刷新遇上在途请求不重绘，跨午夜日期要等请求返回才翻 | 预览实测（凌晨 02:09）；基线失败 project-home-start「跨午夜」 | 标签与时间比较只按时:分；刷新早退 | 跨天带日期、按时间戳画「此刻」、在途时先按当前时间重绘；单测 + 浏览器用例 | 已完成 |
| F-27 | S1 | Feed 添加来源时计划保存失败：抛 ReferenceError，错误不显示、按钮永久禁用，来源已建却无法重试 | 预览复现；基线失败 product-interaction「recovers a failed schedule」 | b2fc65f3 删掉 `let phase` 却留下引用；客户端脚本是字符串片段，类型检查看不到 | 去掉失效引用；另见 F-35 | 已完成 |
| F-28 | S3 | Feed 来源面板里「拉取频率」下拉 28px，旁边输入框 40px；设计系统与工作台还留着 22 行只对旧 `<dialog>` 生效的样式 | 预览实测 | 弹窗改为工作面面板后旧样式失效 | 下拉尺寸由 Feed 样式给出（保留箭头）；删除失效样式 | 已完成 |
| F-29 | S2 | 底栏右侧 Shelf、灵光在 756px 被压到 18px 宽；直接改成不收缩又与聊天按钮重叠 | 预览实测 601/756/1024/1440 | 右列最小宽 160/136px 小于内容 182px | 右列至少等于内容宽度，中列最小 240→200；四档实测无重叠、无横向滚动 | 已完成 |
| F-30 | S2 | 分屏时切走的标签 iframe 被删除，切回整页重载，展开、滚动、未保存输入丢失 | 基线失败 workbench-pane-feed「related Goal」 | 帧只按激活标签保留 | 隐藏保留，最多 4 个按最近使用淘汰 | 已完成 |
| F-31 | S2 | 在 Goal 工作区目录里切到另一个 Goal，内容和地址变了，标签名与记录仍是原 Goal，刷新或切回会跳回 | 预览实测 | 标签系统未接 `molis-work:goal-changed` | 已有该 Goal 的标签就切过去，否则当前标签改指；不重复加载文档 | 已完成 |
| F-32 | S2 | 在「归档」「回收站」分组里点 Goal 没有任何反应 | 预览实测 | selectGoal 在当前集合找不到就静默返回 | 整页打开它的页面（与直接打开链接一致）；浏览器用例覆盖 | 已完成 |
| F-33 | S2 | 紧凑刷新失败后的整页回退每次都失败，目录停在旧数据且无任何提示 | 基线失败 goals-refresh「falls back」；捕获到被吞掉的「页面数据不完整」 | 回退要求已退役的 `[data-tree-footer]`；刷新里空 `catch` | 前置检查只要求目录与文档；空 catch 改为控制台警告 | 已完成 |
| F-34 | S2 | 390×500 下 Goal 记录表单字段区只剩 45px，输入框被截 | 预览实测；基线失败 goal-form-viewport 390×500 | 底部操作条双重留白；矮窗口仍显示说明 | 去掉内层留白；高度 ≤560px 收起说明；字段区 95px | 已完成 |
| F-35 | S3 | 工作台客户端脚本是拼接的字符串片段，TypeScript 看不到里面，删掉声明漏改引用只在出错分支才炸（F-27） | 代码 | 历史上为避免打包而用字符串 | 候选门禁：对拼接后的 `CLIENT_SCRIPT` 做「未声明标识符」检查，页面全局列白名单；原型在做 | 在途 |

### 基线失败的分类与处理（非浏览器，2834 项中 57 个失败）

| 用例（文件） | 归类 | 处理 |
| --- | --- | --- |
| 安装族 12 项（install、e2e、npm-package、runtime-payload、runtime-dependency-flatten、uninstall×4 等） | 实现缺陷 F-01 | 修复安装器 |
| plugin-input-graph ×8、plugin-durable-coordination | 测试落后：夹具声明端口却没声明 `artifact:read/write` 与 Artifact 类型，现行 Manifest 校验拒绝启动 | 夹具补齐声明 |
| web-service-settings-client ×8 | 测试设计落后：脚本已改为 document 事件委托，测试仍在按钮上触发、并加载整个设置脚本包 | 只加载被测脚本，按委托派发点击；断言不变 |
| plugin-declarative-mounting、plugin-global-settings ×3、chrome-inner-scroll | 测试落后：Functions 独立插件与 workspace 插件已移除，判断规则编辑器迁到「能力」 | 按现行入口更新 |
| inbox-plugin | 测试落后：宿主按场景声明派生三项配置动作 | 期望值改为从声明派生 |
| goals-actions | 测试落后：`goals.subject.read` 加入 MCP 受众；魔数 43 | 改为「正好是声明了 MCP 受众的项目动作」 |
| casebook-interaction | 预期变化：空标题在动作输入 schema 处被拒 | 更新错误码，其余断言不变 |
| coding-artifacts | 测试替身落后：启动前核对原会话归属（F1） | 替身返回真实归属 |
| agent-action-tools-prologue | 预期变化：Character 每次派发前复查，停用后本轮停止 | 更新该分支期望；F-15 |
| handoff-ledger-migration、runtime-binding-ledger | 测试落后：升级终点是当前版本而非当年的版本；历史样本未改 | 断言当前版本常量 |
| evidence-verification-module | 测试错误：v35 历史样本的演示板 id 是改名前的 `goalboard-v1-demo`，测试用了改名后的常量 | 用样本自己的 id |
| jelly-model ×2 | 测试落后：模型调用已改走 Prologue，测试仍 mock 全局 fetch | 在生产接缝 `bindPrologueInference` 处替身，断言端点/协议/凭据 |
| lingguang-plugin、session-web | 测试落后：断言第三轮左栏布局；现行是统一底栏，Inbox/Shelf/Artifacts 改为舞台；「分发」改为诚实的「复制内容」 | 按现行结构更新 |
| list-silent-refresh ×2 | 一项测试落后（Alchemist Studio 已非列表型）；一项促成 F-05 | 更新 + 修复 |
| context-onboarding | 预期变化：授权回调失败统一回到设置页并带原因；迟到 code 在兑换前已被拒 | 断言 302 与原因，并断言旅程与连接不变 |
| coss-control-language | 测试设计错误：禁用类名正则误中模块路径 `./document-action.js` | 限定在类名上下文，另验证仍能抓到真实违规 |
| visual-foundation、workspace-directory | 一项测试设计错误（正则跨规则贪婪匹配）；一项测试落后（选中改为扁平 `--nav-active`） | 限定到规则块 / 按规范更新 |
| i18n | 实现缺口 F-07 | 补翻译 |
| system-agent-service | 实现缺陷 F-06 | 补错误码 |
| pages-cross-module | 实现缺陷 F-02 | 修复 |
| project-settings-deletion | 测试落后：规划方法已归 Goals 插件设置（specs/goal-planning-plugin-settings） | 按现行分工更新 |
| casebook-current-host | 时序：冷启动单独 1.5 秒，测试只等 2.5 秒且全量串行满载 | 改为「退出即失败、最多等 15 秒」 |
| work-terminal-client | 环境：xterm 6 的 UMD 主入口在 Node 下取不到具名导出（浏览器打包走 ESM） | 命名空间导入兼容两边 |
| images-concurrency、alchemist-host-lifecycle | 测试拓扑过时 F-16 | 重写中 |

### 基线失败的分类与处理（浏览器，171 项中 36 个失败）

逐组在隔离预览（示例项目）里实操到当前界面后再改；「预期变化」都给出了依据的 spec 或提交。

| 用例（文件） | 归类 | 处理 |
| --- | --- | --- |
| continuous-surfaces ×3、low-viewport ×2、product-interaction ×2、global-ui-interaction、project-user-journey 1440、goals-navigation（来源） | 预期变化（specs/feed-source-workbench：添加来源进来源栏、弹窗改工作面）+ 实现缺陷 F-27、F-28 | 夹具像人一样展开窄屏来源抽屉；按面板判断开合、来源栏按钮判断选中；修两处缺陷 |
| project-settings-navigation ×3 | 预期变化（1348b3dd 新首次使用页，出口为「稍后再说」/「返回项目」） | 选择器改为 `#cx-exit`，行为一致 |
| project-home-start | 实现缺陷 F-26 | 修复 + 按 craft-finish 更新一条几何断言 |
| goals-document ×3、goals-navigation、goals-refresh ×2、goals-records、goals-storage-migration | 预期变化（specs/frame-task-navigation：Goal 先进 Frame 标签，工作区是内层视图）+ 实现缺陷 F-31、F-32、F-33 | 夹具与用例先「打开工作区」；阅读层「返回」回到触发处；单击过双击判定窗口再断言；修三处缺陷 |
| goal-kanban、goal-canvas-workspace | 预期变化（共享侧栏宽度令牌；纸面留 8px 桌面、手机铺满） | 断言改为对齐令牌与纸面 |
| goal-form-viewport 390×500 | 实现缺陷 F-34 | 修复 |
| workbench-pane-feed（关联 Goal） | 实现缺陷 F-30 | 修复 |
| cross-plugin-recovery | 预期变化（Shelf 在底栏）+ 实现缺陷 F-29 + 测试时序（编辑框异步出现） | 按底栏量入口；修复；等编辑框出现 |
| coding-workbench | 预期变化（新增「能力」入口；窄屏目录抽屉退役） | 计数 5→6；去掉抽屉点击 |
| configured-text ×2 | 预期变化（文字生成改经 Prologue，按流式请求）+ 测试缺陷（测试与宿主各加载一份推理绑定） | 替身回 SSE；从宿主构建产物导入 |
| long-content-viewport ×2 | 预期变化（Inbox「完成」就地处理） | 不再等待导航 |
| project-user-journey 390 | 预期变化（目录抽屉退役）+ 测试时序（标记已读是独立请求） | 断言底栏插件选择；有上限地等已读落库 |
| immersive-directory | 预期变化（第四轮退役左轨、项目岛、Dock；Feed 消息改阅读列表） | 删除针对退役外壳的断言（现行底栏由同文件第二个用例覆盖），列表断言全部保留 |
| shelf-dropagent-parity（只在 r1 失败） | 实现缺陷（CLI 探测缓存） | ad74f76b |

## 9. 待决事项（需用户决定）

| 编号 | 事项 | 方案与取舍 | 建议 | 负责 |
| --- | --- | --- | --- | --- |
| D-01 | 动作结果校验失败时内核怎么处理（F-03） | A. 保持致命：合同必须按「已存历史」写，靠 `tests/action-read-compatibility.test.ts` 用历史样本守住。B. 读动作结果不合规时降级为返回原值并记录诊断：页面不再整页打不开，但调用方拿到不合合同的数据。C. 只对写动作放宽（副作用已提交，报错会诱发重试）。 | A + 探测门禁；写动作结果不合规时报「已执行，但结果不符合合同」专用错误码，避免调用方以为失败而重试 | 用户决定；本线实现 |
| D-02 | `PRODUCT.md` 仍只描述 V1 Goal 真相源，未覆盖插件平台、动作服务、Coding 等（F-13 相关） | A. 用户按现在的产品重写产品承诺。B. 本线起草「当前产品范围」一节供审阅。 | B：起草后由用户改定 | 用户 |
| D-03 | `vendor/prologue-sdk` 37 个不再使用的 tgz（约 33MB，F-17） | A. 删除，回退时从 git 历史取。B. 保留（现约定）。C. 移到 git LFS 或独立仓库。 | A：发布包本就排除，删除只减仓库体积，回退路径仍在 | 用户 |
| D-04 | 端口默认连线按插件名写死（F-11） | A. Manifest 输入端口声明 `default_source`（首选的来源端口角色）。B. 按类型唯一匹配自动连线，歧义时要求用户在连线页选择（需要先做连线页）。C. 维持名单，只服务 Coding 家族。 | 短期 C 并写进插件开发 Skill 的限制；有第三方端口插件时做 A | 用户 |
| D-05 | CI 恢复哪些测试（F-08） | A. macOS runner 跑全量非浏览器（约 22 分钟，费用高）。B. ubuntu 跑一组稳定的契约与动作测试（本线挑选并在本机验证）。C. 维持现状。 | B，并在 PR 模板要求本机全量对比记录 | 用户（需推送验证） |

2026-09-28 用户确认全部按建议执行。结果：D-01 已实现（内核 + 读取探测门禁）；D-02 已起草 `PRODUCT.md`「当前产品范围」，待用户改定；D-03 的删除被本机自动模式安全检查拒绝，已撤回，需用户亲自执行或放行；D-04 按 C 写进 Skill；D-05 已加 CI 子集与 PR 模板，ubuntu 首跑要推送后才能确认。另：用户提到的“ultracode 模式”不存在；可选的是用户自己触发的 `/code-review ultra`（云端多 Agent 审查，计费），本线按建议在本会话内继续。

## 10. 验证记录

- 2026-09-27 非浏览器基线（HEAD 8b609527，本工作树）：2834 项，2774 通过、57 失败、3 跳过（平台/真实凭据门控），用时 22 分钟。
- 2026-09-27 第一轮修复后回归（r1）：非浏览器 2847 项，2842 通过、2 失败（Pages 初版修法与 F2 合同冲突，已重做；安装用例因回归期间改了 `skills/` 而比对失败，单独重跑通过，规则已写进 AGENTS.md）、3 跳过。浏览器 166 项，127 通过、35 失败（基线 171 项，131 通过、36 失败）；失败文件与基线一致，只多出 `shelf-dropagent-parity`（CLI 探测缓存，ad74f76b 已修）、少了 `chrome-inner-scroll` 与 `immersive-workbench`。
- 2026-09-28 变基到 main（含 #89）后定向：Pages/动作/目录/门禁 43/43；effect 与 Skill 相关 84/84；内核与工作流 52/52；门禁单测 4/4；F-23 门禁突变（删去 Schedule 正文）确认会失败。
- 2026-09-28 CI 子集：干净克隆按 CI 步骤（冻结安装 → `pnpm workspace:verify` → `pnpm test:contracts`）两遍均 108/108，子集约 48 秒。
- 2026-09-28 包级「开发要求」所列测试合并跑：211 个文件、1137 项，1134 通过；2 项计时用例（飞书 CLI 状态 3 秒超时、Shelf CLI 探测）只在满载时超时，单独重跑通过，Shelf 用例已改为 `exec` 消除遗留子进程。
- 2026-09-28 浏览器失败逐组修复后定向（每组修完即跑，均为本工作树构建）：project-settings-navigation 3/3、product-interaction 5/5、global-ui-interaction 3/3、low-viewport 2/2、continuous-surfaces 3/3、project-home-start 4/4、project-user-journey 2/2、cross-plugin-recovery 3/3、coding-workbench 1/1（连续两遍）、configured-text 2/2、long-content-viewport 2/2、workbench-pane-feed 3/3 及标签/分屏相关 10 项、goals-document 4/4、goals-navigation 3/3、goals-refresh 3/3、goals-records 1/1、goal-kanban 2/2、goal-canvas-workspace 1/1、goal-form-viewport 2/2、goals-storage-migration 1/1、immersive-directory 2/2。
- 2026-09-28 界面实测（隔离预览，示例项目）：底栏 601/756/1024/1440 四档按钮尺寸与重叠；首页凌晨跨天标签与「此刻」位置；Feed 来源面板控件高度；Goal 标签随工作区选择切换（两种分支）；归档 Goal 从分组打开；390×500 记录表单字段区。

# 验证与接线交接

更新：2026-09-26。工作树 `6385/goalboard`，分支 `feature/work-reuse`。本任务基于派发时的未提交基线开发；不要把整棵 Git diff 当成本任务。`implementation.patch` 是已冻结的 34 文件源码/测试补丁，保持原样；`p1-revocation.patch` 必须在冻结版之后应用，仅包含以下 P1 修复增量。

## 当前结果

业务实现、隔离真实存储实操及工程验证完成；**尚未达到“内部完整”**。生产 Host 的 `WorkReuseHostPort` 注入仍未完成；真实 Prologue 在合成材料上的三轮执行已经通过，研究内容质量与真实市场资料仍需实际试用。未发布，原 checkout 未写入。

首轮研究可显式保存原 Artifact 固定版本，批注经确认成为原 Playbook；第二项研究选择成果、填写沿用理由，检查适用性后确认计划。计划持久化原引用及方法正文/版本，后台实际交叉核对后才记采用。第三轮方法修改为 v2，旧采用记录仍指向 v1。方法可编辑、停用，待确认提案可在重启后继续或拒绝。反馈记录重新解释、准备、纠正与局限，不生成节省百分比。

## 冻结版后的 P1 修复与证据

统筹后续限定复核确认两项 P1。来源撤权后，公开读取现在按**当前请求者**重新读取原固定来源：receipt、feedback、已 recorded 的 reconcile、两个 lens 的 researchGet、researchPlan 创建响应、JSON/ZIP 导出共用投影。隐藏不可读来源的缓存 title/reason；无法分离的历史方法文字和反馈也保守隐藏。固定引用、版本、plan/run、consumedAt、关系状态与数据库原快照保留；不会把撤权解释成消费或 Ledger 副作用没有发生。独立方法库仍按原权限读取，未新增跨内容血缘/污点机制。

`StructuredGenerationRequest.beforeModelDispatch` 与 `AlchemistAiPort.generate.beforeModelDispatch` 是可重复执行的异步复核回调，捕获原 actor，复核当前调用权限、固定来源与方法版本。沿原调用链贯穿 assess、cross-check、摘要与格式纠错；保留既有研究 guard，并在异步 Artifact 读取后再次核对调用权限。**这只是业务侧接线完成**：Host owner 已确认映射到 sharedHost `beforeDispatch` 并与原 `authority.beforeDispatch` 组合，`beforeStart` 保留独立启动检查。生产 `alchemist-prologue.ts` 与最终 SDK 派发边界仍由 Host/Prologue owner 接入；不能用此补丁、取消信号或入口检查宣称真实请求为 0。

新增 `tests/work-reuse/revocation.test.ts` 8 项：唯一私密 marker 的混合可读/不可读来源，读取与 JSON/ZIP 导出无泄露，实际消费与原存储保留，换读者不借用快照创建者权限；prepare/credential 屏障中撤来源/方法/actor 权限；纠错沿用同一 guard；异步来源读取期间撤 actor 权限；原 guard 拒绝；跨异步上下文仍捕获原 actor。发送计数由**受控 AlchemistAiPort 夹具**记录，不冒充真实网络请求证据。

当前验证：包 build 通过；全插件 Vitest **26 文件、78 测试通过**（复用相关 16 项）；原 Kernel/Action/HTTP 集成 **4 项通过**。限定只读复核无剩余 Blocker/P1，未扩审 worker/预算/v1-v2。新增 UI 只增加遮蔽说明与标签，包含于本次编译；冻结版的宽窄屏操作证据保留，尚未新增真实生产 UI 撤权实操。下方真实模型三轮证据属于冻结版，不代替本次最终 SDK 派发边界验证。

## 冻结版已通过的验证

- `pnpm --filter @molis-ai/molis-work-plugin-alchemist... build`，包 typecheck。
- `pnpm --filter @molis-ai/molis-work-plugin-alchemist exec vitest run --maxWorkers=2`：25 文件、70 测试。
- `pnpm exec tsx --test tests/alchemist-actions.test.ts`：4 项真实 Kernel/Action/HTTP 集成测试。
- 新的 8 项业务测试调用原 Alchemist Action、后台 worker、真实 SQLite、ArtifactsModule、ContextLedger。覆盖第二轮不同 idea、三轮研究/提案判断、固定版本、方法 v1/v2、启动前与模型等待后的权限撤回、归档拒绝、不适用方法、CAS 冲突、重复启动、坏模型输出、重启继续、关系补写幂等及 actor 隔离。
- 宽屏与 390px 手机 UI：另一项 idea 选择历史成果/方法→检查适用性→刷新恢复选择和理由→生成计划→再次刷新→继续计划→后台完成→显示实际版本→填写并重读反馈。全链路用受控模型响应，页面顶部明确标注；不计为真实模型验收。
- 手机截图 `mobile-receipt.png`；宽屏截图 `desktop-selection.png`。常规截图接口受宿主缩放影响，最终使用同一浏览器 CDP 截图核对完整视口，未修改页面内容。
- 当时只读复核指出的当前权限重建、仅方法计划及晚到结果的写权限校验已补齐并测试；后续发现的两项 P1 按上节单独收敛。

## 真实模型实测：三轮执行通过，内容质量有限

`verify-prologue.mts` 通过原 `createAlchemistProloguePort` 调用用户已配置的 MiniMax-M3；研究内容只有明确标注的虚构访谈，运行数据库及 Prologue 会话位于临时 Home，结束后移除。配置与凭据仅由原模型 owner 解析，没有复制第二份模型配置、没有裸 provider 旁路、没有私人账号数据。

初次实测发现结构输出未稳定达到原业务契约：一次 judgments 尾项缺字段/重复 status；另一次 JSON 正文双引号未转义。业务校验拒绝，研究显示失败，无假报告和采用记录。过程中有一次探索合法返回空卡，原因是原测试方向太泛；后续将合成场景补充到具体用户、频率、路径及 MVP 边界。保留有限输出提示并维持完整 schema 校验，没有放宽约束。经 Prologue owner 明确建议，增加预算内的一次模型格式纠错：只发送原坏输出和原 schema，worker 先持久化额外调用，原预算不足 4 次时不启用。纠错不是本地篡改结果，修复后仍完整校验。

`prologue-invalid-output.json` 保留缺字段样本；`prologue-verification.json` 保留最终三轮真实调用、耗时、schema、输出、版本和实际反馈。共 8 次模型生成：探索 1 次，交叉验证与摘要各 3 次，第三轮格式纠错 1 次；第二轮消费方法 v1，第三轮消费修改后的 v2，来源关系均为 recorded。第二轮是另一项 idea，第三轮返回第一项继续验证；第二轮前重启。其内容是非私密合成材料的生成结果，可供 owner 复现。成功生成不等于市场事实，来源也未验证真实市场有效性。**用户本人验收、生产 Host 路径及真实市场材料试用未完成；不得以合成任务替代。** 三轮摘要仍有内容质量局限：将机制假设、工程成本或用户偏好描述成支持点，而合成来源无法证明这些事实。最终反馈应保留人工纠正的位置，不能声称格式纠错解决了研究可靠性。未认定效率提升百分比。

## Host owner 必需接线

导出契约：`plugins/native/alchemist/src/work-reuse/contracts.ts` 的 `WorkReuseHostPort`。注入位置：原 `createAlchemistStudioRuntime({ ..., workReuse })`，生产 owner 在 `apps/local-host/src/alchemist-service-host.ts`。当前未注入时界面明确显示“成果入口尚未连接”，方法仍可按原流程使用。

Host port 的 `projectId` 与 `boardId` 分开：前者是当前规范项目 ID，后者是原 Artifact 存储 board，允许不同；不能改写返回记录的 board_id。夹具现在用 project-test 与 board-test 两个不同 ID 验证该映射。personal owner 及 Artifact/Ledger 权限由 Host 原 owner 复核；不要混用公开动作 `artifacts:read` 与 PluginArtifactClient 的 `artifact:read`。

1. `callerFor(trustedStudioActorId, signal)`：每次基于当前项目、原调用者重建 `ActionCallContext`；重启后的后台任务也须重新验证，不能缓存旧 grants 或直接用 actorId 推断权限。
2. `listArtifacts(caller)` 返回现有 Artifact 固定引用；`readArtifact(caller, exactRef)` 重新验证项目、隐私、权限及生命周期，返回原 `ArtifactVersionRecord` 或 null。当前只消费 inline 文本/结构化成果，不读取 Shelf 私人原始剪贴板。
3. `publishReport(caller,{report,evidence,title})`：在原 Artifact owner 私有注册，同一 report.id/revision 幂等，返回固定引用。
4. `linkConsumption(caller,{planId,runId,references})`：在原 Context Ledger 幂等记录固定成果到研究 run 的真实消费关系。失败保持 pending，可单独重试，不重跑模型。
5. `validate`/`assess` 要求 `alchemist:read/write/generate`；发布及补关系要求 read/write。Host 回调还须执行原 Artifact/Ledger 各自权限约定。

方法助理上下文：`alchemistActions.playbookContext`，capability `alchemist.playbook.context`，subject kind `alchemist-playbook`，输入 `{subject_id: ruleId}`。revision 为 `version:status`，包含正文、正反例、作用范围、原始反馈和状态。Artifact 通用 subject reader 仍归 Host owner，不另造副本。

动作/Host owner：`01a0d468-fe5c-7410-8ae8-63a608d76f6d`；Prologue owner：`01a0dbaa-54dd-7b60-be5a-fc07ce030e8d`；统筹：`01a0d6bd-5374-7c23-9a8d-18491920a53d`。端口与真实失败样本均已发送，等待可合入的接线。

## 复现

- `pnpm exec tsx specs/bp-delivery-parallel/work-items/work-reuse/preview-live.mts`，仅监听 `127.0.0.1:43187`，独立临时 SQLite，退出删除临时测试数据。
- `pnpm exec tsx specs/bp-delivery-parallel/work-items/work-reuse/verify-prologue.mts` 会调用现有配置模型。可用 `MOLIS_WORK_SOURCE_HOME` 指向已配置 Home；默认当前用户 `.molis-work`。不要并行运行或当作不消耗模型调用的普通测试。
- Host 接入后在原项目入口重走上述三轮，检查真实 Artifact 查询、权限撤回及 Context Ledger，而不是只跑 fixture。

构建时应用过 Builder owner 明确提供的 `packages/design-system/src/plugin-components.ts` 两行类型收窄修复；该文件不纳入本任务 patch，合入时由 Builder owner 保留其版本。

## 三轮差异（程序实测，不是人的工时统计）

| 轮次 | 本轮新输入 | 实际从持久化记录读取 | 结果与纠正 |
| --- | --- | --- | --- |
| 第一轮 | 具体方向、合成访谈和候选想法 | 无旧成果/方法 | 形成研究报告；确认“原话与反证”方法 v1。摘要仍将若干机制假设说成支持点，不能据此立项。 |
| 第二轮 | 另一项 idea、采用理由 | 首轮固定 Artifact + 方法 v1；重启后继续 | 无需在新请求中重新填写方法正文和原报告。付费、竞争仍未知，不能省去新证据准备。 |
| 第三轮 | 把方法改为区分抱怨/使用/付费，再确认采用 | 第二轮固定 Artifact + 方法 v2；旧 receipt 保留 v1 | 使用一次预算内格式纠错后完成。摘要仍有未经来源支持的成本/偏好推断，需要人工纠正，未证明整体研究质量或效率改善。 |

实际收益证据目前限于“第二/三轮自动读取已确认的原版本，用户在界面只补理由或方法改动”；没有采集人的时间、纠错次数基线或真实团队的效果数据。

## 主目录接入验证

统筹对当前主目录相关文件的临时副本顺序验证原补丁与P1增量，然后精确应用到37个Alchemist路径，保留其他owner现有修改；10个专属文档/脚本/证据文件已接入，既有子spec仅追加。没有覆盖工作树基线、共享Host接线或dist。

主目录 `pnpm --filter @molis-ai/molis-work-plugin-alchemist typecheck` 通过；`pnpm --filter @molis-ai/molis-work-plugin-alchemist exec vitest run tests/work-reuse --maxWorkers=2` 2文件16测试通过，2.62秒，diff-check通过。未重复消耗真实模型，也未用这组受控Host测试替代生产SDK最终fetch边界；P1②仍待共享适配与真实transport联合验证。

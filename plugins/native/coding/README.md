# Coding

编码会话、本轮执行，以及它们产出的变更集、报告与图。

包名：`@molis-ai/molis-work-plugin-coding`。

## 它拥有什么

- **执行成果与过程项**：执行报告 `coding.report.v1` 进成果库；变更集 `coding.changeset.v1`、图 `coding.diagram.v1`、计划与目标快照是 Coding 自己的过程项（不进成果库）。
  每个都带产出它的那一轮执行，读的人总能回到「这是怎么来的」。
- **目标输入快照**：`coding.goal-context.v1` 保存用户确认的 Goal 合同与事件事实。它不是新 Goal，不改变原目标状态；本轮通过精确引用消费，报告保留原目标归属。
- **计划**：规划角色只读，提案可调整步骤、完成条件和阻塞。草稿采用修订冲突检查；用户确认后发布固定 `coding.plan.v1`，通过材料进入原工作区的一轮执行。后续改计划需重新确认，重复执行请求返回已有 Run，状态仍由原 Run 提供，执行结束不代表步骤验收。普通任务不必先规划。SubAgent 分派和 TaskBoard 步骤进度仍未接通。
- **声明式落位**：导航、设置、端口全部写在 Manifest 里，宿主代码里不出现 `coding` 这个 id。

## 它不拥有什么

模型与凭据（宿主设置）、批准决定（用户在宿主审查面里做）、工作区目录（宿主授权后给）、
命令执行（走 Agent Host 的审批路径）。

## 关键约定

**图不是 SVG。** 本轮执行产出的是节点与连线的结构，由宿主来画。
让模型直接吐 SVG 意味着模型输出变成应用自己 DOM 里的标记，中间只隔着一个消毒器——
那种白名单是会被绕过的。现在标签一律作为文本节点进入，注入面不存在。

**本轮材料是项目资料。** 用户在统一的资料选择器里为下一轮选资料（成果、导入的文档、Pages、工作目录里的文件、别的会话的报告……，`specs/archive/project-knowledge` PMAT-18）；
一轮开始时 Coding 逐份经 `knowledge.read` 读出，主人给的是此刻的正文与版本，长的只放开头并告诉 Agent 怎样接着读；读不到的一份让这一轮在开始前停下。
Coding 不按类型解析材料，也没有输入端口。运行中的这一轮保持开始时读到的内容。无材料可以直接执行。

**目标关联用于下一轮。** 会话可选择本项目 Goal，先看完整合同与进展再确认固定版本。发送前若目标变化，
需要重新查看确认；归档、删除或超限显式拒绝，不截断或偷换版本。报告依据本轮固定来源保存归属，
不依据会话后来改选的目标。工作约定版本与目标合同修订分别显示，新报告保存原工作约定版本；旧报告不回填。已保存报告可查看当前原目标、填写并确认进展，通过 Goals 原事件记录精确成果引用；
目标变化拒绝旧确认，同一确认的重试读取原回执。目标时间线可打开原固定报告并返回原会话继续，
不会替换下一轮关联、自动发起任务或验收目标。没有原目标或来源不可确认时不回写；
固定报告缺失时不重新拼接替代。用户可将一份已保存报告设为 report 输出端口的当前值；下游读取原精确引用，不复制报告。
旧确认不能覆盖后来的输出选择，已保存报告和历史来源不受切换影响。Coding「产物」面按引用读取已保存的报告（成果库）与固定变更（过程项），支持标题搜索、刷新、类型/修改数/版本/归档标记及重开精确版本；未保存预览不会混入。通用成果页展示保存时的报告正文，并可返回原固定成果及其任务；变更集不进成果库，其逐条文件提案及批准与执行状态在 Coding 产物面和 Diff 里查看。来源、身份、版本或正文不可用时不提供业务预览，也不读取运行时重新生成。Shelf 可接收 Coding 固定报告和变更为独立副本，保存为固定文字材料后再供下一轮选择；Character 可明确选用本项目已发布的精确版本或不使用；本轮冻结正文与来源，下一轮改选、角色更新或停用不改变已有执行及报告。直接多模态输入、其他成果类型与协作链仍待接通；Character 行为收益和整体体验未完成验收。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- 需求书：[`specs/coding-plugin/spec.md`](../../../specs/coding-plugin/spec.md)

## 当前执行入口

会话输入区可以选择方法、MCP 工具与只读资料来源，并固定下一轮使用的版本。只读资料可用于讨论/评审，外部工具仍走宿主逐笔审查。模型和凭据、工作区授权、连接与执行账各归现有宿主能力；具体已验证路径和未完成部分以需求书 §0 为准。

**报告保留步骤评价。** 新保存的执行报告同时固定原计划完成条件、原步骤图与模型回报，以及保存时的用户评价。返工、未评价和过期评价分别显示；图或计划不可读不阻止保留已有答复，但明确无法判断。后续评价不改写固定报告，需回原任务查看当前评价；旧报告不回填，单步通过也不代表 Goal 验收。

**按轮次查看固定变更。** 结束的一轮可以读取原 Agent Host 文本审查与执行回执，主动保存为该会话/轮次唯一的过程项 `coding.changeset.v1`。同一文件的多次提案分开保留，分别显示批准决定和保存时已执行、未执行、失败或未知；固定版本不代表当前磁盘状态，也不包含命令、二进制或外部操作产生的全部变化。旧版本按原引用读取，读取失败不能用当前 Git 差异替代。

保存后可点击前后行号，填写多条意见；服务端依据固定版本推导引用原行，追加到原任务草稿，由原输入区发送。意见不批准写入，执行仍走宿主审查。本机浏览器保留尚未加入草稿的意见，正式草稿沿用原会话持久化；不另建执行账。保存不自动切换输出，用户明确选择后，原 `changeset` 输出通过默认连线进入 Diff，且不更换 Diff 当前输入组。桌面在右栏阅读，窄屏展开时使用完整内容区，收起恢复对话。

**待审提案可拒绝并反馈。** 运行中的文本修改在宿主审查面填写意见后，点击「拒绝并反馈」把这份提案拒绝，并将意见交给原执行。原决定与意见先保存，再让模型继续；新提案仍需单独批准。填写意见时不能直接批准，避免意见未送出却放行。浏览器本标签页保留尚未提交的意见，刷新或切换会话不会丢失；成功提交后清除草稿，已保存意见和执行记录可在重启后查看。反馈交付失败明确报错，不声称 Agent 已收到，也不自动重放。当前输入针对整份文本提案，运行中逐行定位仍待完善。


只读协作通过原协调者和 Prologue 子任务能力派出代码调查、独立评审。结果区显示原任务、权限、实际工具活动、完整报告和子任务单独用量；可停止执行中的子任务，对结束结果记录接受或返工。返工意见带原父子引用加入任务草稿，由人发送新一轮，原结果保留。Markdown 由 Host 现有清洗渲染器提供，不信任模型 HTML。「并行写入」按用户保存的独立目录分工派出写入子任务；主任务只读，子任务每项修改与命令仍走原审查。成果整合与 TaskBoard 仍未接通，状态及实操证据见原 Coding spec C13。


「独立工作树」可准备并审查从当前仓库提交创建的新目录/分支，批准后关联到项目，再选为下一轮工作区。准备和选用本身不启动模型；Git 注册保存目录与原始提交，项目目录簿保存授权，原 SDK Effect 保存审查及执行回执。主仓库未提交内容、活动内容过滤器、已改变的提交起点或未知执行结果会明确阻止继续。失败时保留已创建目录与分支，旧批准不会重复执行；可勾选 1–4 个已授权的独立目录，填写任务与完成条件并保存，再选择并行写入发送。目录与分工在发送时固定；关闭/刷新保留未保存的本窗口分工草稿，保存后沿用原会话配置。下一轮改分工不改本轮权限或历史。成果整合尚未接通。

Coding 每次发送明确冻结 60 轮执行预算；固定计划按步骤计算若需更多轮次，保留较大值。达到上限会停止，可在原会话开始下一轮继续；这不替代逐笔操作审查。

Directory candidates and browsing preferences come from the [current-project settings protocol](../../../docs/platform/PROJECT-SETTINGS.md). Files/Git consume `projectSettingsCapabilities.browsingWorkspace`; Coding consumes `workspaces` and keeps its execution directory per session. Manage directories in Project Settings → Workspaces.

短草稿（提交说明、接续摘要）的固定指令归 `src/prompts.ts`，由 Coding 的插件定义（`PluginDefinition.instructions`）携带，Coding 运行时登记，支持用户覆盖（PG-051）。`agent.draft-text.v1` 只传 `prompt` id、材料和所选模型；Host 使用原调用插件身份解析，不能在业务输入声明 owner。材料裁剪、摘要降级及提交前的用户审阅仍由 Coding 负责。相关回归：`tests/coding-commit-draft.test.ts`、`tests/coding-history-summary-http.test.ts`、`tests/prompt-registration.test.ts`。

## 开发要求

- 负责：参照 App：编码会话、每轮执行、委派，以及它们产出的变更集、报告与图；自己固定的报告和变更怎样变成可复制的 Markdown 正文（`coding.results.document@1`），以及自己成果的列表。
- 不负责：模型选择、凭据、批准决定、命令执行本身；别的插件拿到这份正文后怎样加标题、来源和指纹（Shelf 的副本归 Shelf）。
- 公开入口：`@molis-ai/molis-work-plugin-coding`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（变更集的逐行比较 `compareTexts` 与 `splitLines`；变更阅读器与子任务合并预览的比较视图用它的 `/diff-view`；页面上模型文字的富文本用它的 `/rich-text`，所以本包按 SDK 的可选 peer 声明 `marked`、`sanitize-html`，只在服务端加载）。会话库是平台借的 `context.services.project_database`（合同 `platform/plugin-database`），Manifest 的 `databases.project`（`src/database.ts`）声明表；宿主不再递原始库句柄。执行入口的四个输入也不再由宿主注入（切片 C2 起 `CodingExecutionPorts` 已删）：模型表与可用性是 `services.model`（权限 `model:read`），Goal 标题是 Goals 的公开读动作 `goals.list`，Character 的列表与可运行判断是 `characters.list@1`、`characters.runnable@1`，「宿主就绪」不再有等待（见下「不变量」）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 前台 HTTP/动作调用把原信号、beforeEffect 与同步 checker 传到实际 Host/SDK 写点；报告、变更、计划与启动的最后一次等待后再核。已经接受的 Run 由激活的后台作业 `follow` 跟到底，等待结束后的下一轮由作业 `wake` 接起（`services.background.keep`，Manifest `background.jobs` 声明；PG-038）：只有安装自己的授权，写之前过作业的检查，平台在激活停止、撤权、项目或 Home 关闭时停它们，作业里的计时器带作业的 `signal`。
  - 后台命令读取失败保留最后事实并标未知；activation ready 后恢复持久等待消费者，服务临时故障退避重试，Runtime 不支持 waits 时明确拒绝并停止该消费者，stop 释放。委派保留已经提交或未知的原目标、原信，只能核对同一封信继续送达；失权不得返回受保护正文。
  - 收下交付先检查 30 项材料容量，已有同版本引用不重复添加；合法插步的当前 SDK 图和用户评价一起固定进报告，后续变化不改固定版本。
  - 模型与 Agent 只经 Host 注入的 Prologue 能力，不直接依赖 SDK。
  - 页面上模型的文字由 Coding 自己画成富文本（PG-062，PG062-05～07）：`src/rich-html.ts` 的 `codingPageHtml` 用 SDK 的 `renderRichText` 给一轮的发言、子任务的结果和报告加 `html`，只加在路由答给自己页面的回答上，并在一轮的指纹算完之后；模型、工作流、MCP 直接调同一个动作只拿到文字。接续摘要那一轮的开场由页面按文字画，不再画一遍；回答开头照抄的压缩标签（`[retained …]`、`[historical …]`）不画。宿主不再替 Coding 画这些，浏览器包里也没有解析器。
  - 页面里给伙伴插件留的两个槽（PG-036 C9，RAC-433～439、449）：`CODING_COMPANION_DIRECTORY_SLOT`（目录里）与 `CODING_COMPANION_RESULT_SLOT`（结果区），在页面描述符的 `slots` 里声明，接受 `declarative-html`。Manifest `ui.embedded_plugins` 里的插件（Files、Git）用 `target_slot_id` 指向它们的 surface 填进来，宿主按 `embedded_plugins` 的次序拼成 `model.nested[slot_id]`，Coding 不 import 它们，宿主也不点名。伙伴没在跑或它的 surface 出错，该槽为空，Coding 页照常画；Diff、Text Stats 只画自己的舞台，不进槽。
  - 变更阅读器和子任务的合并预览也由 Coding 自己画（PG-062，PG062-09）：`src/change-html.ts` 的 `codingChangeHtml` 在同一个路由入口上，用 SDK `/diff-view` 的 `compareChange`、`compareHunks`、`renderDiff` 给变更集的回答加 `html`、复制补丁用的 `patch`（`unifiedPatch`）、`view_mode` 与 `net_groups`（净改动只在恰好如此时提供，`codingNetChange`），给 `coding.read-integration` 的每个文本文件加 `diff_html`。阅读器的词是 Coding 自己的（`src/change-messages.ts`，并进 `CODING_MESSAGES`，经 `codingText` 按调用方的语言取），说法与 Diff 的同一处相同；每个标签用哪个键列在 `change-html.ts` 的 `LABELS`。宿主不再画这两处（`coding-surface.ts` 已在 PG-036 C9 删除）。
  - 一轮的问题卡、建议卡与输入框上方的下一步行由 Coding 向平台要（PG-062，PG062-11～13）：`src/interaction-html.ts` 的 `codingInteractionHtml` 在同一个路由入口上，经 `context.services.interaction` 给每一轮的问题加 `html`（`questionHtml`，可重答）、给每张卡加 `html`（先用 SDK 的 `actionCardView` 变成人读样子，再 `cardHtml`）、给这一轮加 `next_html`（`nextStepsHtml`：问题与卡，一轮结束后最近跑完的那张卡的结果，再接 `src/next-steps.ts` 的 `codingFollowUps`）。后续步骤的词是 Coding 自己的（`coding.round.check-continue`、`coding.round.reconcile`、`coding.round.changes`、`coding.round.changed-files`）；平台按页面的语言画其余部分。动作的直接调用方（模型、工作流、MCP）拿不到这些 html，宿主也不再加料。
  - 执行入口的输入都走平台服务与公开动作，宿主不替它递（specs/coding-plugin §H，W5-01-CODING-23–31；PG-047、PG-086、PG-091、V-13）：
    - 模型：Manifest 声明 `model:read`（必需）与 `model:invoke`（可选）。可选的模型是 `context.services.model.choices()`，选定的模型用 `availability(selection)` 核对；`complete()` 在这里不可用（一轮的模型请求归 Agent 运行时）。`model:invoke` 只管两处显式起草：提交说明与历史摘要经平台动作 `agent.draft-text.v1`（`src/drafts.ts` 的 `codingDraft`，经 `services.actions`）；关掉它，提交说明的路由答 `plugin.grant_denied`，历史摘要退回 Coding 按记录整理的那一份（PG-035）。全仓库只有这一个模型表来源（V-13），`models.ts` 的 `codingModels` 是唯一读取处。
    - 就绪：路由入口不再等 `execution.ready()`，Agent 能力在被调用时自己初始化。恢复起来的唤醒循环（`wake-loop.ts`）遇到暂时读取失败按 5–30 秒退避重试，不依赖页面查询重新启动；Runtime 明确不支持等待续接时才结束该消费者。
    - Goal 标题：读 Goals 的公开读动作 `goals.list`（`goalPluginActions.list`，plugin 受众，写在 Manifest `capabilities.consumes`）。目录面板同步渲染，等不了一次动作，所以 `goal-titles.ts` 的 `codingGoalTitles` 在 Coding 一侧缓存标题。查询只刷新内存；独立后台观察每 5 秒读取并保存标题及会话状态到本插件存储，选择 Goal 的命令也会记下标题。查询不写持久记录、不启动唤醒；后台观察在停止或撤权后结束。还没读过的 Goal，目录第一次绘制显示 Goal 的 id，路由一读就换成标题。
    - Character：列表读 `characters.list@1`（是浏览用的预览，读取按容忍的 `publishedOf` 写法），能不能运行以 `characters.runnable@1` 的回答为准（只答能不能跑与原因；本机程序与工作目录的 `characters.execution@1` 只给本人）；两者都对 `plugin` 受众开放（`characters.runnable` 也给本人，助理的角色选择器用它），都写在 Manifest `capabilities.consumes`，授权在设置页撤回后调用以 `plugin.grant_denied` 拒绝，没声明的以 `actions.forbidden` 拒绝（S-15）。助理（`assistant-http.ts`）也经这两个动作读（C2b），宿主不再给 Coding 造端口。
  - 固定成果的正文只有一处写法：`coding.results.document@1`（定义在合同包 `@molis-ai/molis-work-contracts/modules/coding`，Coding 的 Manifest 声明的就是这个对象，处理器在 `results-document.ts`；plugin 受众的查询，权限 `artifact:read`，输入 `{ reference }`，输出 `{ reference, title, saved_at, markdown }`）。它用 `readOwn` 读自己的版本，已归档、不属于当前项目、不可用、不是报告或变更、成果里的身份与引用不符，一律以 `coding.shelf_material_invalid` 拒绝；别的生产者的版本由平台以 `artifacts.plugin_denied` 先拒。不动 `coding.artifacts.preview@1`。消费方（Shelf）在自己的 Manifest `capabilities.consumes` 声明它，宿主不拼这段文字（W5-01-CODING-01 至 -14）。
  - 自己的报告、变更、计划列表经 `services.artifacts.listConsumable()` 按类型取，再留下生产者是自己的版本（`outputs.ts` 的 `codingOutputReferences`）；宿主不再给列表端口。已归档或不可用的版本不在列表里。
  - 按精确引用消费材料与报告；生产者发布新版本不改写在跑的任务与历史报告；归档、删除或超限显式拒绝，不截断或偷换版本。
  - 目标变化拒绝旧确认，同一确认的重试读取原回执；不替换下一轮关联、不自动发起任务或验收目标。
  - 提示词与方法正文随目录条目声明，Manifest 只写声明。
  - 路由只做装配：委派信件的视图（`delegation-view.ts`）与等待/唤醒的判断和文本（`waits.ts`）是纯函数，不读存储、不调宿主。
  - 页面的客户端是 `src/browser/` 下有类型的 TypeScript（`tsconfig.browser.json` 检查整个目录，没有排除项），构建时 esbuild 打成一个 `dist/workbench-bundle.js`（`(host) => {…}`），`src/workbench-client.ts` 读成登记里的 `clientFactory`；不再有 `src/client.ts` 那样的模板字符串，也不再把函数 `toString()` 拷进脚本（W5-04 3b，RAC-543～548）。主页面在 `src/browser/main/`：`mount.ts` 按固定顺序装配（`mount-core` 建页面对象，`mount-composer` 先建草稿再建经它保存的部件，其后是任务板、工作部件、事件、表单、发送与轮询）；页面记的东西只在 `main/page.ts` 的 `State`，建好的部件在 `Refs`，所有函数收同一个 `page`，模块里不留 `let`；点击是 `main/click*.ts` 的规则表（选择器互不相交，第一条命中的执行）；请求只经 `main/request.ts`（路由取自 `host.pluginRoute`，不写插件 id 与 `/api/plugins/`）；页面文字是 `coding.*` 稳定键。编辑框的草稿（`src/browser/draft.ts`）输入框归哪个会话只看 `owns`：换到别的会话后、它的首次读取认领之前，敲字、追加、保存都不写进它。
  - 工作台上的装配在 `src/browser/workbench.ts`：它把 Coding 的页面和里面 Files、Git 的面板接起来（并把宿主给的 `pluginId`、`pluginRoute`、`confirm` 交给页面）。Files、Git 的客户端由登记的 `clientUses` 经 `host.clients` 交来：它们各是自己的包（`files.js`、`git.js`），页面在挂载 Coding 前装在 Coding 旁边，工厂以它们自己的插件身份挂在 Coding 给的面板上，Coding 不 import 那两个插件，也不替它们发请求；评审动作经 `host.reviews`（宿主的，Coding 不拿决定权）。Files、Git、Diff、Text Stats 的页面不再借 Coding 的包。 页面里的部件（步骤、任务板、计划卡、补充回执等）构建时还各打一份 `dist/*-bundle.js`，只给单元测试用假端口单独挂（`tests/coding-state-rings.e2e.test.ts` 一类），页面本身不读它们。`createCodingTimeline`、`createCodingTurnChanges`、`createCodingCodePaint`、`codingQuestionAnswered` 仍是自包含的函数，因为端到端测试要把它们的文本注入页面。
  - `coding_sessions`、`coding_plan_drafts` 只由本包读写，而且只经 `services.project_database`：`CodingSessionStore` 在 `plugin.ts` 的 `start` 里用它建，宿主没有借出这项服务就启动失败（不退回别的路径）。读是同步的 `get/all`；每一种写都是 `async`，第一个参数是 `beforeEffect`，在 `transaction(beforeEffect, 同步体)` 里提交，一次逻辑写动几行就是一个事务（开一轮的改名与置运行中是 `roundStarted`）。`beforeEffect` 取自调用：动作和路由用这次调用的 `beforeWrite`，后台跟随者用「激活还在、没有更新的一轮」（`stillFollowing`），唤醒循环自己开的一轮用「激活是否已停止」的检查（W5-01-CODING-15–21，V-14）。新增写要照这个形状，不直接拿库句柄写。`action-cards.ts` 里手写的 `beforeWrite.assert_current()` 保留：它守的是私有存储里的 `compareAndSet`，不是库事务。首页标题栏的后台任务列表（PG-043，C4）是 Coding 自己的一个查询：`src/home-background.ts` 的 `coding.home.background-tasks@1`，声明 `home_aggregate`，权限只有 `artifact:read`，由 `CodingSessionStore.backgroundSessions` 读本库里进行中、等人处理或留着后台命令的会话（解析不了的列当作没有，只读、不建表、不写）；宿主 `apps/local-host/src/home-background-tasks.ts` 对每个已打开的项目问同类型的查询并摊平，不认识 Coding，停用或没授权的项目安静跳过，读不了的记一条日志（W5-13-06，W5-01-CODING-32–39、49、50、51）。会话在 Home 进程启动前就记着「进行中」的，答案里写成「需要核对」（停/起 Coding 不是重启：那一次激活晚于轮开始不代表轮被切断）；停掉后台命令仍走原来的会话路由 `coding.background-stop`，地址由宿主按提供方和项目拼。
  - 一轮的建议（`offers`）落成会话的操作卡（specs/ai-interaction-experience D25）：存在插件私有存储的 `cards:<session_id>` 下，整份用 `compareAndSet` 原子替换；每条建议按 `offer_id` 只落一张，落卡在调用自己的 `beforeEffect()` 之后，建议的动作此刻已不在这一轮的授权里就不落。卡只经宿主的 `agent.offers.run` 执行（只跑建议点名的那个动作、过动作自己的输入检查），点击以卡的修订号认领，第二次点击不再执行；结果按失败的 kind 记（D26）。页面路由 `coding.card-run`、`coding.card-dismiss`；角色 coordinator、builder 带 `suggest-action`。
- 改动后必跑：`node scripts/run-tests.mjs tests/coding-action-cards.test.ts tests/coding-action-cards.e2e.test.ts tests/coding-effect-control.test.ts tests/coding-session-effect-control.test.ts tests/coding-store.test.ts tests/coding-session-follow.test.ts tests/coding-surface.test.ts tests/coding-rich-html.test.ts tests/coding-change-html.test.ts tests/coding-interaction-html.test.ts tests/coding-next-steps.test.ts tests/coding-changeset-http.test.ts tests/coding-subagents-http.test.ts tests/coding-runtime-regressions.test.ts tests/coding-material-consumption.test.ts tests/coding-background-wait.test.ts tests/coding-background-tasks.test.ts tests/host-log-catches.test.ts tests/coding-message-wait.test.ts tests/coding-session-messages.test.ts tests/coding-client-lifecycle.e2e.test.ts tests/coding-client-bundle.test.ts tests/coding-actions.test.ts tests/coding-artifacts.test.ts tests/coding-capabilities.test.ts tests/coding-companion-inputs.test.ts tests/coding-delegation-waits.test.ts tests/coding-history-summary-http.test.ts tests/coding-mcp-settings-client.test.ts tests/coding-product-http.test.ts tests/coding-companion-http.test.ts tests/builtin-plugin-agent-texts.test.ts tests/coding-results-document.test.ts tests/shelf-coding-results.test.ts tests/shelf-coding-results-platform.test.ts tests/coding-input-ports.test.ts tests/coding-goal-context-http.test.ts tests/coding-characters-http.test.ts tests/project-plugin-startup.test.ts tests/plugin-model-service.test.ts`
- 相关手册：[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)、[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[specs/coding-plugin/spec.md](../../../specs/coding-plugin/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

Coding 客户端及子面板共享 Host 注入的 UI 挂载生命周期；隐藏时停止会话/目录/审查轮询和时间显示，返回后刷新，卸载取消本机请求并释放监听、观察器和定时器。草稿仍按原业务规则保存；界面关闭不会停止服务端运行。

后台 Run follower 是激活的 `follow` 作业，用安装自己的授权和作业的取消信号；停止/待核对状态产生 v1 `run-updated` 刷新提示，携带开始时确认的工作区和原 Run 引用。它不宣称文件已修改，也不将通知失败改为 Run 失败。

`coding.runs.control` 的现行合同是 version 7：包含中途 `switch-model`、补充要求的 `key` 与 `mode`（version 3），文字、数字、日期、日期时间题的回答 `value`（version 4，T1），对象引用题的回答（`value` 是选中的对象，version 5，T2；标题由宿主按对象主人现在的写法换掉），撤回补充与补充的 `about`（version 6，回执 3b-2a），以及补充的 `source`（version 7，BL-144：`host` 是宿主转交页面代写的话，这一轮记成说明，不记成本人的话）；页面交回问卷卡的字段原样（`values`），由路由用插件开发包的 `questionAnswer` 读成回答再交给动作。固定旧版本的引用明确拒绝，不保留别名或读取旧形状；页面仍走原 HTTP 路径并动态取得现行动作，LOCAL 仅本人可用，MCP 不暴露此控制。验证见 `tests/coding-actions.test.ts` 的 W2-18-CODING-CONTROL-VERSION-01。

Coding 的目标目录、当前约定/状态、进展保存和回执使用 `@molis-ai/molis-work-contracts/modules/goal-actions` 的五个完整合同；Goals 注册这些合同，Coding 不 import Goals 实现、不再消费四个旧 typed 协议。Manifest 声明 Goals 读写权限，实例资格取 Host 启动名单的真实 definition；每次路由调用传原取消、提交前复查与同步尾检。目录页仍取100项；固定报告的进展确认只读当前事实，创建给模型的目标材料才执行20k长度约束。

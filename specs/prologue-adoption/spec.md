# Prologue 采用：能力接入与 TaskBoard 统一协作

状态：执行中，未完成。采用线 2026-10-20 收尾停下，接续入口是下面的「交接（2026-10-20）」：P1–P4、A0、A1、A2-1、A2-2（#822）和换包 #814、#887 在 main；A2-3（#805）也已合入；A2-2b、子任务目录的写后检查、A3 的结构化一半、A5、P5、P6 等后续见 BL-301～309，BL-176 的 Prologue #53 尚未带入。

## 交接（2026-10-20）

这一节是采用线停下时留的接续入口（用户 2026-10-20 定：防腐线之外的线做完手头的就开 PR、写交接、停）。它取代统筹材料里的 `coordination/2026-10-18/lines/adoption.md` 和 `adoption-a2-plan.md`，也取代本文更早的几处接续入口：开头原有的几段引言、[§6.0b](foundation-records.md#60b-现状核对2026-10-14)、[§6.0d](gateway-records.md#60d-p3a-恢复记录2026-10-15) 和 §7「远端交接」。那几处的进度、分支和下一步都以这里为准，正文留作当时的记录。


[交接时的 SDK、合入记录与临时分支](handoff-2026-10-20.md)。正在使用的包查[供应包说明](../../vendor/prologue-sdk/README.md)。

### 没做完、没开工的

都写进了 `specs/BACKLOG.md`；原线已交接的未实现工作保留接续项，已有新执行者的写明去向：

- 新写的：BL-301～BL-309；原 BL-300 的换包由 #887 完成后已删行，效果来源的 Molis 接入继续归 BL-162。
- 原有、负责人原写「采用线」、现在改成「未分配」的：BL-155、BL-160、BL-171、BL-172、BL-173、BL-220、BL-221。
- PG-054 已由 #844（`0744d7dd3`）完成新会话、方法、MCP、委派与整合的运行时目录接入；Character 相关的写死项已在 BL-372 的第一片去掉（运行时自己声明 `supports_character_limits`，默认运行时取目录的 Home 默认）；项目选运行时也已由 BL-372 做完（项目设置的 `projects.settings.runtime.read/select`，没选就是 Home 默认；选定的运行时不可用时新会话被拒绝并指向项目设置，不换一个，`specs/archive/repository-anti-corruption/slices/bl372-runtime-declarations.md`）。

### 接续时先读

本节；§5.3 验收表；§6.0p（A2 的合同，#822 加了 [§6.0p.12](diagnostic-records.md#60p12-a2-2执行器审查卡与-s-422026-10-19)）；[§6.0b](foundation-records.md#60b-现状核对2026-10-14) 逐项核对（10-14 的结果，BL-309 要按 main 重做）；§7.7 决策记录、§7.8 工作规则、[§7.9](handoff-2026-10-13.md#79-已知问题) 已知问题、[§7.10](handoff-2026-10-13.md#710-怎么复现和验证) 复现命令。

### 风险与不能碰的

- 不碰真实 Home（4207、4173）和安装版，不读、不改真实数据；换包和用例都在临时 Home 里跑。
- 不删、不改钥匙串里 Home 的主密钥条目。
- 真实模型的评测用 MiniMax 的 key，只在命令里内联读（`security find-generic-password -a "$USER" -s minimax-api-key -w`），不进对话、文件和日志；要不要跑真实模型先问用户。
- 换包改的是每条 Agent 路径下的 SDK 运行时，算共享核心：在集成分支上跑一次全量；`vendor/prologue-sdk/` 的 `.sha256`、`.provenance.json`、`patch-history.json` 要和包相符，不把门禁改成通过。
- 模型能力弱造成的坏效果不打提示词补丁（§7.7 用户 10-16 的决定）；该在 Prologue 工具设计里改的，记成 BL 行（如 BL-173、BL-176）。

## 目标

目标完成等级：Prologue **完整采用范围内部完整**——§2 原 1–23 项与存储/预算等既有决定逐项完成采用、验证或按已定边界不做；新增 24/25 项使 Coding 与个人助理共用协作事实及外部条件等待。需要接入的路径在真实执行、界面、权限及异常恢复中可顺畅试用。A0 只是当前基础切片，不是整线完成定义。工程通过、真实产品实操、用户本人验收分别记录。进度与接续见上面的「交接（2026-10-20）」；工作规则见 §7.8。

## 0. 现场与去向

### 0.1 核查基点（2026-10-11）

当前唯一实现树与现行 spec：`/Users/yijunwang/code/molis-prologue-a0`，分支 `feature/prologue-a0`，从 `origin/main=9f9bda551` 建立；SDK 集成树 `/Users/yijunwang/code/prologue-a0-integration`、`feature/molis-a0-s1`，基点 `c4b9fde3`。旧采用树仅保留历史和原有在途修改，不再写入。统筹已接受 S1 工程收尾并转交唯一源码 writer；S1 来源树冻结，将完整未提交改动组合进独立 SDK 树，不带题型。下列为前序核查时间点，不能替代当前实现进度。

- Molis 主检出 `main=72137e89a`；本轮 fetch 后 `origin/main=9f9bda551`，不得把本地 main 当最新主线。采用工作树 `.claude/worktrees/prologue-adoption`，分支 `feat/prologue-adoption`、HEAD `8b1a05220`，起点 `118780596`。本文在原工作树修订，原规格无未提交改动；旁边在途源码全部保留。本轮未同步或改写分支历史。
- Prologue 主检出 `4f7110fe`；采用树 `/Users/yijunwang/code/prologue-molis-adoption`、`feat/molis-adoption=c4b9fde3`，干净。Molis 采用树实际依赖 `prologue-sdk-0.0.0-rc.1-molis-adoption.tgz`，来源为该提交；旧 `side-panel-memory` 包来自 `9fc3b173`。不能用旧包推断采用树缺能力。
- Prologue 其他在途树：`prologue-ask-user-fields` 的 `a06ae62e` 已提交带类型问询；`prologue-input-receipts` 的 HEAD 仍为 `4f7110fe`，有输入身份/读到回执的未提交实现和测试；`prologue-computer-use` 的 `d4908c11` 独立推进。上述源码本轮只读，均非已合主线证据。
- Molis 输入回执规格在 `docs/ai-input-receipts:specs/ai-input-receipts/spec.md`；跨插件 AI 规格在主检出未跟踪的 `specs/ai-interaction-experience/spec.md`，并有 `feat/ai-interaction-experience` 分支。本文引用其职责与已决 D 项，不复制输入编号、题型或回执合同。落地时核对分支版本，不把本机绝对路径写成仓库链接。
- Molis Computer Use 在 `.claude/worktrees/computer-use`、`feat/computer-use-land=6919b8cc2`；不假定它仍叠在采用线上。当前开放 PR 为 #180 情境动作规格、#178 插件切换器归档、#156 体验文档；#180 涉及 `specs/README.md`，只更新本线索引行。Prologue 当前无开放 PR。以上是时间点事实，实施前重查。

### 0.2 采用项状态表

「已提交」只证明代码和用例入了采用分支；本轮做源码/提交核查，未重新运行构建、测试或真实模型。提交说明中的历史通过记录不能代替新合同验收。

> 2026-10-13 对账后：表里第 1、3、4、6、7、8、10、12、14、23 项引用的提交（`77fde104`、`da9ddd99`、`804384d8`、`5a4d6feb`、`ceac00a2`、`4d90a1b4`、`65d6c3e1`、`b3235bb1`、`8c0b60fb`、`8b1a0522`）都已随 #472 进 main，以 main 的实现为准；第 6、7 项的核对见 §5.6a，第 14 项的改造清单见 [§7.5](handoff-2026-10-13.md#75-下一步按顺序)。第 13 项的未提交 yield 改动不在任何分支上，作废。

| 项 | 当前证据与状态 | 新方向下去向 / 还缺什么 |
| --- | --- | --- |
| 1、3、4：预算、状态事件、副作用分类 | `77fde1040`；`prologue-node.ts`、`prologue-stream.ts`、状态投影用例 | 保留；`yielded` 后工作未完成的投影改按 §4.6，不能由 Run completed 推断任务完成 |
| 2：派出前授权 | 主线已有修复，采用树 `804384d8a` 补拒绝零派出验证 | 保留；覆盖每次子派发及接续，不能只查首 Run |
| 5：微压缩回执 | SDK `c4b9fde3` 的 `MicroCompactible.rereadable`，Molis 在途包已用 | 保留；消息/子任务结果中的执行回执同样不得压成可重复执行的建议 |
| 6、7：推理力度、运行中换模型 | `ceac00a2b`、`4d90a1b4f`；`run-inputs.ts`、模型控制与浏览器用例 | 保留；接续重新解析有效配置，不偷偷换模型；细则 §4.3 |
| 8：逐轮变更 | `4d90a1b4f`，Run `turn_changes` 投影与 Coding 展示 | 保留；节点只引用真实变更，不另存 diff 真相 |
| 9：写后诊断 | 本轮未找到本线完成提交；现有检查/检查点不是逐文件诊断器 | 待实现有界接入，见 §4.4；不标完成 |
| 10：灵光流式 | `65d6c3e13`，预览、Stop、断连取消、最终版本复查 | 保留；不因协作统一把单次生成改成 Agent |
| 11：结构化生成 | 共享 `hostTextGeneration` 已支持；Alchemist 的领域 parse 与 SDK schema 是不同层 | 未证明 Alchemist 已完成新结构化路径；明确 local/native 与预算，见 §4.5 |
| 12：变化等待 | `b3235bb1b`、`8c0b60fb3`；助理长请求与 Schedule observe 已提交 | 保留观察传输，改为订阅统一协作事实；不是另一份等待状态 |
| 13：Coding yield | 有未提交改动及新文件 `yield-wait.ts`、`round-report.ts`、三个 yield 用例；移除拒绝、投影交回、插件私有等待 | 在途、未验收。保留报告/文案与测试场景；替换私有 `yield:<session>`、busy/retry 判定为共享 TaskBoard 接续，不直接按当前补丁收尾 |
| 14：助理交回 | `8b1a05220`，`AssistantDelegations`、`handed_back_run` / `hand_back_held`、按结果键启动、恢复扫描及用例 | 已提交但需要重做协调部分；保留 Work 内容、角色选择、成果引用、共享用量和通知入口，退出私有协调账与自动续做链 |
| 15、17、18、23：sleep、记忆、密钥扫描、命令扩权 | sleep 投影，`5a4d6feba` 记忆边界用例；`77fde1040` / `4d90a1b4f` 审查文案；`b3235bb1b` 助理侧审查 | 保留并做联合回归；sleep 不是任务等待，审批不等于执行结果 |
| 16、19–22：会话条目、血缘、租约、网络、审计 | SDK/既有能力不等于本线产品接入完成 | 会话条目按输入回执线消费；其他按 §4.7 明确边界，不虚列已完成 |
| 存储写声明 | SDK `c4b9fde3` 已增加独占 owner 重开时清理；`prologue-storage-claims.test.ts` 已在采用树 | 保留独占条件，不把清声明说成恢复未知执行；见 §4.8 |
| 24：统一协作 | 本文新合同；SDK 已有 Board、Delivery、waits、subagent，各自可用但未形成本文闭环 | 待 P1–P6；不能用现有局部用例宣称完成 |
| 25：外部条件等待 | SDK 已有后台命令/输出等待；助理 `watchJob/checkJob` 已通过 Prologue queue 做无模型状态查询（15 秒起、指数退避至 5 分钟，6 小时后 unknown） | 扩成 §4.6.8 的共享合同；可信脚本、明确检测错误/未知、TaskBoard 接续与统一 UI 尚未实现；现有能力不是通用下载/进程监视器 |

### 0.3 范围与非目标

保留 §2 原 1–23 项及存储、墙钟预算等已有决定，按实际依赖逐项采用和验证，不把全部 SDK 能力扩成产品入口。TaskBoard 统一协作（24）与外部条件等待（25）是新增范围，只改变相关协作链；不能取代模型控制、变更/诊断、生成、观察和安全等原采用工作。

协作子范围覆盖 Prologue 通用协作合同及 Molis 公共合同、共享 Host、Coding/个人助理业务接入与界面、旧路径退出。所有 Agent 间的派发、交接、通信、等待、接续，以及主对话对外部工作的条件等待，都关联 TaskBoard 节点；单个无协作的有限生成调用不因此建图。简单分工由系统自动建立少量节点，不要求用户先画图。不得以 `update-todo` 或私有委派列表代替协作图。

不改 Goals 验收主人，不把平台变成自动给业务 Goal 派单的服务；本方案只推进用户已经授权的工作。对人、外部 Runtime 的请求保留其接受/拒绝边界，不借 Agent 通信授权发送外部邮件、IM 或发布。Computer Use、输入回执、交互卡片各自的需求不合并进本文。

## 1. 不变量与事实主人

唯一 SDK 接入在 `horizontal/agent-host`；一个 Home 一个执行进程。共同 Action 目录、可信调用身份、工作区/工具权限、审批、预算、`beforeEffect` 与版本复查都保留。已撤权/取消的原调用不得提交业务结果；合法控制入口仍可记录取消、拒绝及恢复处置事实，不让迟到结果借此继续写入。

| 事实 | 唯一写主人 | 其他层允许保存什么 |
| --- | --- | --- |
| 协作任务、层级、依赖、负责人、协作状态、等待条件、接续安排、结果引用 | **Prologue orchestration 的 TaskBoard**（扩展现有实现，不新建 Molis TaskBoard 库） | Molis 只存业务对象 → Board/节点的稳定引用与可重建视图 |
| Session/Run 生命周期、实际模型调用、用量、工具/Effect 回执、输入消费 | Prologue 对应 Session/Agent/Effect/模型模块 | Board 记执行尝试引用；Agent Host 投影，不改真实 Run 结果 |
| 消息信封、投递、接受、答复关系与消费游标 | Prologue Delivery / Session | Board 记发送/接收节点与信封引用，不复制正文和投递状态账 |
| 协作等待的计时、事件监听、触发执行 | Prologue 现有 waits/编排执行器 | TaskBoard 拥有计划与生效状态；执行器按 wait 引用工作，不能独立变更接续政策 |
| Molis actor、项目/个人范围、安装、角色可用性、权限、审批决定、工作区授权、模型配置 | Molis Host 与既有授权/审查服务 | SDK 只收受信装配给的约束/引用，不收模型自报身份 |
| Coding 计划内容、工作区/Git 整合、报告；助理 Work 内容与成果关联 | 各业务 owner | 引用同一图和真实执行；不再拥有子任务协调状态 |
| 成果固定版本、Goal 是否验收 | Artifacts、Goals 等原 owner | 节点成功仅为协作进展；Run 成功、报告说完成都不能代替产品验收 |

## 2. 逐项定性与处理

以下是 2026-10-09 的问题定位记录，不代表当前完成状态；现状看 §0.2，实施合同看 §4。四类：①有意设计且仍符合约定；②原实现遗漏或缺陷；③Prologue 变化带来的适配需求；④新增能力或优化机会。「出现时机」区分原本存在、升级后才出现、升级后被放大。设计意图的依据写在「依据」列；查不到的写「未知」。

| # | 项 | 定性 | 出现时机 | 依据 | 决定 |
| --- | --- | --- | --- | --- | --- |
| 1 | 思考档覆盖输出预算 | ② | 原本存在 | `afb3bf69`（09-25）把思考时的上限 32768 定为「代替 SDK 默认 4096」，提交说明写「关闭时仍是 SDK 的 4096」；`8a737fec`（09-26）在其前面加了显式预算的 `params`，两次展开后者整体覆盖前者——合在一起是遗漏，不是取舍 | 修：一份 `params`，显式预算优先，思考上限只替代默认值 |
| 2 | 模型派出前授权 | ② | 原本存在，**已在 main 修复** | `87cbaf85`（10-08）让 Form、Dataset、PPT、灵光四处把 `beforeEffect` 作为 `beforeDispatch` 交给 Host | 不重做；核对 Host 侧转发与撤权零派出的测试证据 |
| 3 | 新状态与事件 | ③ | 升级后才出现 | 新包 `AgentControlState` 多 `sleeping`（唯一编译错误）；`turn-changes`、`model-switched`、`agent-control` 落进 `unknown_frames`；`completed{yielded}` 会被当成完成 | 适配：见 §4.1 |
| 4 | 工具副作用分类 | ② | 原本存在，升级后放大 | 网关把 `suggest-action`、委托 start/follow/stop、记忆 remember/forget/suggest 标成 `safe-read`，实际改提议、Work 与记忆；新包在模型流结束前提前执行 `safe-read` | 改为 `mutate-external`，用运行时 `allow` 规则保持现有的「不额外问人」；`prologueActionTools` 只在 `operation=query` 且 `actionEffect=read` 时算只读 |
| 5 | 回执保护与微压缩 | ③ | 升级后才出现 | 新包微压缩默认开（最近 4 轮、512 字节），只看大小与轮次，修改回执会被换成「需要就再调」 | Prologue 增强：只收能再读的观察（§3.2）；Molis 侧核对整理提示词对回执的保留 |
| 6 | 推理力度 | ④ | — | 新包 `reasoningEffort` 两条内置协议都支持；Molis 只有供应商级思考开关 | 见 §4.3 |
| 7 | 运行中换模型 | ④ | — | 新包 `switchModel` 在下一个模型边界生效；Coding 的模型选择只作用于下一轮，运行中发送变成追加要求 | 见 §4.3 |
| 8 | 逐轮变更 | ④ | 依赖 3 | `turn-changes` 从写入回执算出；Coding 时间线已有变更与检查点入口 | 见 §4.4 |
| 9 | 写后诊断 | ④ | — | SDK 只给缝（官方编码包的可选工具），Molis 不用官方包，也没有按文件的检查器 | 见 §4.4 |
| 10 | 文字增量、停止与错误 | ④ | 原本存在（能力未用） | 共享推理已有 `onProgress`；灵光已有 NDJSON 与断连取消，但对话不走它 | 见 §4.5 |
| 11 | 结构化生成 | ④ | — | Alchemist 把 schema 写进提示词，再用容忍围栏的解码与 zod；SDK `local` 校验不容忍围栏，`native` 只有 OpenAI 兼容线支持 | 见 §4.5 |
| 12 | 变化等待口 | ④ | 原本存在 | 助理工作运行中每 1.2 秒读整个工作；Schedule 每 400 毫秒读 Run；`agent.run.wait` 已有 | 见 §4.5；`runViewVersion` 已随 §4.1 扩充 |
| 13 | Coding 子代理交回与续做 | ③+④ | 升级后才出现 | 新包对后台子任务**总是**回灌；`dispatch-subagent` 的 `yield` 对模型可见，让出后的叫醒绕过 Molis 的启动索引、派出检查、项目工作与审查桥，重启后会被判为「缺少宿主启动索引」而挡住会话 | 先拒绝 `yield`（§4.1）；再接通（§4.6） |
| 14 | 助理 Work 委托的交回与续做 | ② | 原本存在 | 子工作在父工作这一轮结束后才完成时：不通知人、不续做父工作，父工作只在下一轮主动查询时才知道 | 见 §4.6 |
| 15 | 休眠 | ③/④ | 升级后才有 | — | 见 §4.7 |
| 16 | 会话条目 | — | — | — | 见 §4.7 |
| 17 | 记忆边界 | ③ | 升级后自动生效 | 新包对数据档条目中和伪标记 | 见 §4.7 |
| 18 | 写前密钥扫描 | ③ | 升级后自动生效 | 扫中 `WORKSPACE_SECRET_DETECTED`，零提案零写入；Molis 时间线只显示原始错误码 | 见 §4.7 |
| 19 | 副本血缘 | — | — | — | 见 §4.7 |
| 20 | 租约排队 | — | — | — | 见 §4.7 |
| 21 | 企业网络 | — | — | — | 见 §4.7 |
| 22 | 审计导出 | — | — | — | 见 §4.7 |
| 23 | 点名扩权 | ③ | 升级后才出现 | 新包 `run-command` 可带 `grants`（额外路径、联网）；Molis 的命令审查卡丢掉它，仍显示「在宿主执行边界内」并允许「本会话不再询问」，记住的规则不含 `grants` | 见 §4.7：审查卡如实展示、不提供记住、按含扩权的完整内容批准 |
| 24 | TaskBoard 统一协作 | ④ | 2026-10-11 用户明确方向 | 所有 Agent 协作必须关联节点；Coding 与助理不各存一套协调状态 | §4.6；先统一合同，再派发、通信、等待与接续，最后产品接入 |
| 25 | 外部条件等待与零模型空耗 | ④ | 2026-10-11 用户补充 | 主对话可挂起等本机/外部工作；非模型检查器查询状态，满足条件后接续 | §4.6.8；采用/统一协作线负责，不并入 Computer Use 或定时 Agent |

升级还带来评估没有列出的变化，一并处理或记录（现状见 §0.2）：

- **后台子任务自动回灌**（新包无法关闭）：父任务还在跑时附在下一次工具观察后；父任务已结束则写进父会话下一轮的上下文。与 Coding 自己的续做摘要并存，见 §4.6。
- **存储写声明**（`b14c6686`）：Node Host 每次提交先建独占的 `.cas` 声明文件；进程恰在提交的同步区段被强杀会留下声明，之后该记录写入报 `STORAGE_CONFLICT`，SDK 不自动夺回。见 §4.8。
- **存储元数据形状守卫**（`3f9d5ff6` Q6）：坏记录改报 `STORAGE_RECONCILE_REQUIRED`。见 §4.8。
- **墙钟预算**：到期取消在途网络（以前只在派出前检查）。行为更正确，Molis 的停止原因文字已覆盖 `AGENT_BUDGET_EXCEEDED`，回归测试覆盖。
- **写前密钥扫描、记忆伪标记中和**：硬边界，自动生效（第 17、18 项）。

## 3. SDK 来源、切换与合同变更

### 3.1 已有与待补的 SDK 边界

> 2026-11-03：按现行包（Prologue #107，`1cc80b05`）重新盘过一遍，见 [现有 SDK 能力盘点](sdk-capability-inventory-2026-11.md)。下表写于 `c4b9fde3`，「必须补齐」列以盘点为准。

源码基点为 Prologue `c4b9fde3`；以下路径均相对 Prologue 仓库。不能把需求册里的「应有」或 README 的历史行为参考算作现役能力。

| 能力 | 已有实现 | 本方案必须补齐 |
| --- | --- | --- |
| TaskBoard | `orchestration/core/taskboard.ts`：层级、DAG、版本检查、负责人、进展、失败策略、持久化、standing board、认领/交回 | 所有协作强制节点绑定；执行尝试、消息、等待、接续引用；跨 Run 接管；统一恢复与取消约束 |
| Subagent | `orchestration/core/subagent.ts` 及 persistence：精确父 Session/Run、权限求交、深度/并发、结果摘要和恢复 | 父 Run 是历史来源，不再是跨 Run 操作的唯一授权键；按当前节点负责人和执行代次授权 |
| 消息 | `delivery`、`composition/core/system-tools-collaboration.ts`：信封、请求/通知/答复、幂等与 Session 投递 | 可信节点作用域、兄弟间受限通信；消息不能绕过图改负责人或扩大权限 |
| waits / 技术队列 | `orchestration/core/waits.ts`：command/envelope/board-node、事件检查、输出轮询、持久化与恢复；`queue.ts` 已有本机持久队列 | 任务组 all/any、外部确定性条件、四态检测结果、可信检查端口、退避/时限；统一 TaskBoard 主人和接续占用；不能把现有吞掉检查异常的行为沿用为新合同 |
| yield/写回 | `composition/core/subagent-writeback.ts`：后台报告回灌；`c4b9fde3` 增加 `onYieldSettled`，已写回再通知 App，阻止默认 wakeRun | 收敛为图上登记等待的便捷入口；回调只是事件接线，不能充当恢复或唯一启动源 |
| App-tools 模式 | `composition/core/agent-run-admission.ts` 仍拒绝 `subagentOptions`；无文件根/命令执行权 | 支持有界协作及每个子 Session 的业务工具装配，仍无默认文件/命令权限；不能仅删除禁止条件 |
| 存储安全 | `c4b9fde3` 微压缩保护、独占 owner 清残留写声明 | 复用，不重造；协作恢复必须另按真实 Run/Effect 对账 |

SDK 修改落在现有 `orchestration`、`delivery`、`session`、`agent`、`composition` 和必要 `tool` 合同；不新增第 30 个模块。`taskboard.ts` / `waits.ts` 扩展统一安排，`subagent.ts` 保留真实父子执行来源，`system-tools-collaboration.ts` 去掉协作可不绑节点的路径；`subagent-writeback.ts` 保留 Delivery 写回，替换“写回后自行 wakeRun”的独立判定为图上接续。Molis 装配不得同时启用 SDK 默认 wakeRun 和 Host 接续。其他消费 App 的公共行为变化在 SDK 原合同中显式列出，不留旧合同分支作为兜底。开工时在原需求分册与切片队列登记窄合同，本文拥有 Molis 采用目标，SDK 模块合同拥有公共语义，两者不各写一套状态机。

SDK 按四层装配：**不可关闭的边界**是身份、权限只收窄、协作节点绑定、单一事实主人、未知不重派；**可替换执行逻辑**沿现有 `collaboration` 槽和 Host 窄口，不因换实现绕过上述边界；**App 配置**包括并发/深度、消息与报告上界、等待期限、允许的协作角色和自动接续政策；**用户干预**是产品里的计划修订、取消、提前继续与授权选择。未装配协作时明确不可用、零派出，不能降级为插件自建协作。配置只进所属模块，不向 Runtime 顶层散放新阈值。

### 3.2 包与集成顺序

**现行（2026-10-14）**：Molis 依赖过渡包 `prologue-sdk-0.0.0-rc.1-interim-p1-cu-image.tgz`，来源 Prologue `release/molis-interim-p1-cu-image` 的 `923e5a40`（在 `08b84296` 上接 main 的 `d8c96e29`，树不够时只把这一步的窗口图交回，并接受节点标识）。`08b84296` = merge(`95cd901d`, `d4908c11`)。`95cd901d` 是 `82488fa0`（PR #6，P1 文档）加输入回执第三刀的修正 H16（名单里没有 `acknowledge-inputs` 就不写编号说明，PR #17）；`d4908c11` 是桌面 Computer Use（PR #15）。两个父提交都在 Prologue main 上，合并提交本身不在。为什么不用 main 末端：P2d 让没绑节点的跑看不到 `dispatch-subagent` 与 `board-*`，并删了 `claims`；Molis 在 P3 之前还在用它们，X6 又不许留兼容路径（用户 2026-10-13 决定用过渡包）。第二次换包放在 P3 的同一个改动里，从 Prologue main 的具名提交打，带 P2a–P2g、S4 及之后的 P2h、P2i，并在那次改动里做 Molis 默认路径验证。来源与重建见 [vendor README](../../vendor/prologue-sdk/README.md)。下面两段是 10-11、10-12 的记录。

旧采用树的在途包来自 `c4b9fde3`，含微压缩、独占写声明、App 接手 yield 三项增强。当前 A0 新实现树仍保留主线 `side-panel-memory` 包及依赖，实际来源见 [vendor README](../../vendor/prologue-sdk/README.md)；组合源码不等于已换包。`c4b9fde3 + S1` 的组合包尚未构建，包、锁文件、来源记录与默认消费路径均待构建时段完成。

A0 基础采用按 §5.5 独立推进；统一协作先冻结 §4.6 合同，再按 §5 的 P1–P6 实现。输入回执、问询字段、Computer Use 若需要共同 SDK，只出一个合成包。实施负责人先核对各分支提交及未提交内容，不能直接打入他人的未验收源码。构建后记录具名来源、校验和与回归证据；最多当前包加一份在途包，换包不累积副本。Prologue 分支先按授权进入上游 main，Molis 合入前改为主线具名提交的包；推送/PR/合并/安装另需授权。

已具备的非协作采用能力可先形成基础包交付，以免输入回执线 D7 被完整协作开发无限阻塞。新的协作 API 必须在 P1 先冻结，输入回执的 Board 引用扩展沿这份合同实现；这不是跳过统一合同或让两套协作提前发布。

### 3.3 只认现行合同，回退也要恢复匹配的数据

遵循 [合同变更流程](../../docs/system/CONTRACT-CHANGES.md)：本阶段不增加历史读取兜底、双写或迁移链。改公开形状、动作版本、数据结构时同批迁调用方/快照/文档；数据由一次性维护改成现行形状，版本不符明确拒绝。旧规格中「新增字段可选，所以换回旧包即可」的回滚保证撤回。

未写新结构时，可回退完整源码/包/锁文件组合；写了新结构后，先停执行，恢复切换前匹配的隔离 Home 快照及包组合，再核对外部副作用。不能用旧包直接读新账，也不能靠回滚数据库撤销外部写入。真实 Home 维护需要另行授权、整份备份和副本演练，本轮不做。

## 4. 具体方案

### 4.1 状态事件与 Run 投影（第 3 项）

保留已提交的 `sleeping_until`、`turn_changes`、`model-switched`、`runViewVersion` 更新。`sleeping` 是活跃 Run 内的定时控制；TaskBoard waiting 是协作工作在等条件；审批/问询 pending 仍归原主人，三者不能混成一个「运行中」。

SDK 的 `completed{yielded}` 表示本次 Run 让出，不能显示「工作完成」。Agent Host 在 Run 视图中忠实保留该事实，工作层从节点等待/接续显示进度。新方案接通前，正式角色不得仅凭在途补丁移除 yield 拒绝；P3/P4 通过后直接切换同一合同，不保留旧私有接续分支。

### 4.2 工具副作用与回执（第 1、2、4、5 项）

保留单一模型参数合成（显式输出预算优先）、派出前授权与安全只读分类。派任务、发消息、登记等待、报告节点都是有状态动作，经过原 Effect 链；不能标成 `safe-read` 以提前执行。SDK 微压缩只收可重读观察，修改回执保留原结果引用；结果未知不得转成「再调用一次」。

### 4.3 推理力度与换模型（第 6、7 项）

采用树已实现每轮冻结 `reasoning_effort`，仅对目录声明可调力度的模型提供快速/平衡/深入；显式输出预算仍独立。运行中切换从下一模型边界生效，UI 区分请求切换和已生效；不支持原力度、上下文窗口变小或 prompt cache 协议不符时拒绝，保持原轮次事实。

接续使用同一个 Host 模型解析/凭据引用与派出前复查，不从旧请求 JSON 恢复凭据、actor 或过期配置。不自动用另一个模型遮蔽原模型不可用；节点保留就绪结果并显示待配置原因。实际用量和模型仍取 Run 回执。

### 4.4 逐轮变更与写后诊断（第 8、9 项）

已提交的逐轮变更从 SDK 写入回执投影，重放同轮不重复；节点引用原 Run/变更/检查点。Coding 保留 Diff、检查点和整合审查，不把节点成功当成已合入主工作区。

写后诊断仍待实现（合同、预算与验收见 §6.0p）：按已授权项目的可用检查工具显式配置，受同一命令/目录审查和预算约束，记录实际命令、退出状态和诊断结果引用；无检查器显示「未检查」，失败不掩盖文件已经写入。不得静默安装工具、启动任意语言服务或把一次完整构建叫作按文件诊断。独立诊断切片 A2 必须给真实语言项目的有界样本与取消路径；未满足就保持未完成，不悄悄删出采用范围。

### 4.5 流式、结构化与变化等待（第 10–12 项）

灵光已实现文字增量作为未保存预览、Stop/断连取消；最终答复只在授权与快照复查后保存，失败保留用户输入。该单次生成行为保留。

结构化调用继续用共享 `hostTextGeneration`。Alchemist 的 schema 指导、JSON 解码与领域校验不能冒充 SDK local/native 约束；先确定调用的 schema 支持范围，local/native 显式选择，未知 schema 与 native 不支持在派出前拒绝。业务 parse 留在插件，格式纠正须预算/授权允许且有界。独立生成切片 A3 用可支持的现有领域 schema 接入并证明错误结果不入库；没有供应商实测时只标工程通过。

助理工作变化长请求与 Schedule `observe` 已在旧采用树提交，保留先订阅再读、关闭即释放。当前 Work/Run 的观察传输可独立采用，不等 TaskBoard；以后接协作事件时仍由 Board、Delivery、Run 或外部作业主人触发；UI 刷新可合并，不能由页面另建定时查询循环判断任务完成。无事件的外部来源由 §4.6.8 的受信非模型检查器有界轮询，不能让模型循环查。连接断开重连按当前版本补读；浏览器不承担唤醒职责。

### 4.6 TaskBoard 统一协作与外部条件等待（第 13、14、24、25 项）

#### 4.6.1 任务与身份合同

以下为待落地合同，字段语义已定，最终导出名在 P1 对照 SDK 公共接口冻结，不伪称现有 API。

| 合同记录 | 必要内容与限制 |
| --- | --- |
| 任务图/节点 | 现有 board ref、node id、version、parent、dependsOn、assignee、失败策略；补业务工作引用、执行尝试引用、结果引用、等待/接续引用。不存在「无图协作」入口 |
| 执行尝试 | 节点引用原始 parent Session/Run、实际执行 Session/Run、当前接管代次；Run 主人提供真实状态/回执。首次来源不可被接管覆盖 |
| 等待安排 | 所属节点、目标节点/信封/命令/外部条件引用、all 或 any、等成功还是等落定、失败/取消策略、期限、是否允许自动接续；冻结具体集合，改集合需版本修订；外部条件的检查器、参数、四态结果、频率/退避与时限见 §4.6.8 |
| 接续安排 | 原等待引用及版本、目标节点/Session、已满足条件引用、稳定启动请求键、占用代次、启动 Run 引用或拒绝/需核对原因；由 TaskBoard 持久写入 |
| 通信绑定 | 发送与接收节点、对应 Session、信封引用、请求/通知/答复、原请求引用；正文与投递账仍在 Delivery |
| 业务关联 | Coding 会话或助理 Work 只持 board/node ref；输入关联用 SDK 的输入身份 `InputRef = { session, input }`（`input` 是 `steerId` / `inputId`，同一身份空间；App 的 `key` / `request_id` 只是幂等键，`call_id` 是动作调用编号，二者都不进图，见 §4.6.9）；成果引用原 owner 的固定版本 |

同一项工作常驻一张图，Run 结束不销毁；Coding 确认计划的执行步骤和助理委派/定时跟进都接到该图。已有项目级聚合 Board 只引用这些任务，不复制状态。长期 standing board 裁剪完成节点前必须保证仍被等待、接续、输入回执或结果定位的引用可解析；不能因保留数量丢失活跃引用，具体保留方式在 P1 核对现有持久记录后落定。

系统可为已有授权范围内的简单分工建立父节点和少量子节点。AI 把新输入判为超出当前约定的新任务时，仍按输入回执 D2 先提议；改验收、扩大范围、给人派活不能借自动建节点绕过用户决定。模型只能提议/报告自己有权修改的节点；人修订仍带当前图版本。

跨 Run 接管以**同一节点的受信负责人/代次**为当前授权依据，历史 parent Run 只作来源。新 Run 管理原孩子须取得此绑定；旧 Run 的迟到回调不得改图或启动接续。换成另一个 Session/角色要有显式交接及当前授权，不能因猜到 ID 接管；不篡改已发生执行的负责人历史。

#### 4.6.2 派发、通信、等待与接续主链

```text
用户授权的 Coding 会话 / 助理 Work
  → 共享 Agent Host 绑定常驻 Board 和当前节点
  → 节点提案/认领通过版本与权限检查，先持久登记派发意图
  → Host 复查身份、工具/目录、审批接线、预算、模型 → SDK 开子 Session/Run
  → TaskBoard 绑定实际执行引用；模型/工具只走原执行链
  → 节点间消息经 Delivery，关联双方节点；等待回复另登记等待
  → 父 Agent 无可推进工作：先存等待和接续安排，再让出 Run
  → 子 Run/信封/命令/外部检查真实结果到达 → 对应主人先落事实
  → TaskBoard 引用事实、结算节点/等待 → 满足条件时占用一次接续
  → Host 当前授权和预算复核 → SDK 按同一请求键启动父接续 Run
  → Board 绑定启动回执 → 父 Agent 核实子结果 → 业务 owner 验收/留存成果
```

Run 完成不自动让协作节点 succeeded：先检查工具/Effect 是否未知、是否仍有待满足条件和子结果；失败/取消按图冻结策略处理。父节点等待时保持未完成，子节点全部成功也不自动通过父业务验收。

逻辑状态沿现有 `not-started → ready → running → succeeded/failed/cancelled`，扩展 `waiting` 与 `needs-reconciliation`；`blocked` 用于明确缺授权、预算、模型、人工裁定或失败策略阻塞，不充当成功。等待条件满足只进入可接续状态，实际运行要等启动回执。等待自身的状态按 §4.6.9 冻结为 `waiting / satisfied / failed / expired / cancelled / needs-reconciliation`（去掉旧的 `fired` / `resumed`，接续归节点上的接续记录），归属于图上的安排；不由插件再保存一份。

事件按主人发布：节点/指派/等待安排修订归 TaskBoard；Run 终态与 Effect 回执归执行；消息接受/答复归 Delivery；等待满足、接续占用/启动/被拒归 TaskBoard 接续记录。事件是通知，丢失或重复后能按版本和真实记录补读；不是只在内存里存在的成功证据。通过窄口组合，不让各模块读取另一模块的存储实现。

#### 4.6.3 受限通信与 App-tools 协作

默认只允许同一协作图中 Host 授权的父子、兄弟节点通信，读取范围限所需节点和有权结果。查找收件人也按此范围过滤；同一个 Home/项目、知道 Session ID 都不构成授权。跨独立工作/项目默认拒绝；显式业务交接经 Host 重新授权并绑定两端节点，不能靠信封正文扩范围。

`prologue-messages.ts` 当前直接拒绝所有子任务，须改为可信节点作用域检查；SDK 同时校验发送身份、目标绑定、请求/回复关系和当前授权，不能仅靠 UI 隐藏。通知只投递，不挂起、不默认开新 Run；请求可以显式登记等待答复。答复和节点进展是候选材料，不是用户指令或审批，不能提升文件/动作权限。父工作能查看自己有权的协作过程；消息正文不默认复制进所有兄弟上下文。

循环等待检查覆盖节点依赖和回复等待关系。登记等待前后重读事实，避免回复先到导致永久挂起；过期明确为未满足，不当成功。支持先派多个、继续做独立工作、之后再等待指定集合；all/any 的完成策略从图读取，不由 Coding/助理硬编码“全回来”。

App-tools 子 Agent 使用自己的 Session、可信 actor/项目/安装绑定、角色和经收窄的业务动作目录，不继承完整父聊天、密钥、工作区或命令权。默认给有界任务材料及引用。助理委托 Coding 时，文件执行权来自 Host 已获准的目标角色/工作区委派授权，并在子执行首次派出前验证；助理的无根模式不因此变成有根，模型也不能自造授权。无此业务授权就拒绝委派，不能以“统一协作”为理由放宽权限求交。

#### 4.6.4 持久化、并发与恢复

TaskBoard 接续从 `armed → eligible → claimed → started`，并有 `blocked/cancelled/needs-reconciliation` 处置；名称在 P1 冻结，语义不得省略。不是在 TaskBoard 之外新增一张 Coordinator 状态表。

- **先登记后执行**：节点派发/等待/接续意图持久后才派出；每个逻辑派发/接续使用一个稳定请求键。TaskBoard 占用通过当前版本和代次互斥，同一 Session 同时只启动一轮；多个子结果同时满足只能启动一次。父 Run 仍活跃时把结果引用交给下一边界，不并发开父 Run。
- **启动跨边界**：占用记录和 Run 启动不能假定跨主人原子事务。Host 按请求键登记启动索引并复查后调用 SDK，SDK 返回真实 Run 引用；写回图失败或应答丢失，恢复先查询该键对应的启动/Run 事实。已启动则补引用，明确未启动才可继续原意图，未知则停在需核对；不能另造键重复调模型。
- **事件重放**：结果引用按原 Run/信封/Effect 身份吸收一次，不为每次观察造新“完成”。恢复时先取 Home 独占执行权，装配同一 SDK，加载 Board/Delivery/Run，核对占用和结果，再恢复等待。内存订阅只负责加速，崩溃不能丢安排。
- **跨重启**：已落盘的完成事实可满足等待，且当前授权/预算有效、启动状态明确时允许自动接续。被重启截断的 Run、结果未知的 Effect/消息或无法确认启动的请求先核对，不自动重派外部动作。恢复历史结果不得重复通知成新成果。
- **取消/撤权**：用户停止协作先由控制入口使等待/接续失效、提升代次，再取消关联 Run/子任务及 pending；已提交的历史结果保留。取消一个子节点不默认取消兄弟，按冻结失败策略阻塞父依赖。取消全部协作不误停同一图中无关独立工作。撤权/停用后的迟到回调不能提交业务结果、消息或新 Run。
- **提前继续**：用户选择后由共享入口取消或修订本次等待，消费已有结果引用并占用一次接续；尚未完成的孩子是否继续由当前安排明确表示。与孩子完成同时发生也只能一个父 Run；不能绕过权限/预算或偷偷将孩子判为完成。
- **重试**：明确失败的节点可创建新尝试并保留前次引用；未知先核对。新尝试仍使用原任务身份，新的输入请求沿输入回执键，不改写旧 Run。失败重试不得自动获得额外预算。
- **预算**：SDK 保留每 Run 的真实用量和执行限制，Molis 沿现有共享用量服务执行工作/协作额度；图只引用预算范围和阻塞原因。所有子派发与接续都计入同一工作上限，派发预留防并发超支、结算以真实回执为准；未知用量不能按零释放额度。接续不重置墙钟/金额/轮次上限，等待不发模型请求。具体数值由当前有效设置给出，不在两条业务线写两份常量。

#### 4.6.5 Molis 公共合同与共享 Host

| 边界 / 实际文件 | 修改、保留或移除 |
| --- | --- |
| `packages/contracts/src/services/agent-host.ts`、`horizontal/agent-host/src/adapters/prologue.ts` | 提取/扩展共享 Board、节点派发、消息、等待、接续与恢复视图；新增内容放职责明确的合同子路径（拟 `services/agent-collaboration`），不增巨文件。最终命名与防腐 W5-09 同批对齐；不是新服务/新库 |
| `horizontal/agent-host/src/adapters/prologue-taskboard.ts` | 从仅确认计划的工具授权/投影改为按当前工作节点的统一接入；保留版本检查、负责人报告、人工修订，去掉“无计划轮次无图工具”的协作例外 |
| `prologue-subagents.ts`、`prologue-node.ts` | 所有子派发先绑节点，App/Coding 两种执行装配共用入口；保留 workspace grant、child review、启动索引、取消。不能让 `onYieldSettled` 直接决定是否续跑 |
| `prologue-messages.ts`、`prologue-waits.ts` | 复用 Delivery/waits，按可信任务范围允许子 Agent；消息/等待绑定图。移除与插件私有等待重复的判定，订阅生命周期跟 activation/Runtime 释放 |
| `prologue-node.ts` 的 `schedule` 适配、`apps/local-host/src/assistant/assistant-service.ts` 的 `watchJob/scheduleJobCheck/checkJob`、`assistant-store.ts` 的 `StoredJob` | 提取已用的非模型 queue 检查装配到共享 Host 端口；退避/时限、是否满足和接续归图，作业真实状态向原 provider 读。删除助理私有检查决策与 `assistant.job-check` 双驱动，保留业务通知/卡片关联视图；细则 §4.6.8 |
| `prologue-stream.ts`、`capability-registration.ts` | Run 投影与协作投影各读原主人；变化版本含等待/接续/消息引用变化。能力登记一次，插件、页面、MCP 都走共同目录；新能力采用 Action，不再扩 typed 历史条目 |
| `apps/local-host/src/system-agent-service.ts`、`agent-host-composition.ts` | 同一 Home 装配一次共享端口；注入启动/接续前的可信身份、权限、模型、预算、审查与业务引用解析，不写图状态机 |
| `apps/local-host/src/assistant/assistant-authority.ts`、既有用量/审查协作者 | 每次派发/接续复核当前 actor、范围、插件/安装启用、角色可用性、授权代次和预算；保留共享用量账与原 pending 审批服务 |
| `tooling/gates/api/`、`tooling/gates/actions/`、`packages/contracts/src/platform/dom-events.ts` | 实施时随合同刷新快照，动作形状变更升版本；如有新 DOM 事件同批登记。本文不改门禁、阈值或快照来假装能力已存在 |

首次启动和每次接续使用同一顺序：解析可信业务对象及调用上下文 → 绑定节点/代次 → 检查项目/个人范围、安装与角色 → 求交工具/目录/通信授权 → 核对共享预算与当前模型配置 → 在首个 Provider/工具前接好审查与 Run 启动索引 → 派出前复查取消/撤权 → 真实执行 → 返回后 `beforeEffect` 和对象版本复查再提交业务结果。长等待不保留旧的一次性批准作为下一次副作用授权；相同操作的批准复用只按现行审查规则。

Molis 公共命令至少覆盖绑定/读图、提案与人工修订、派发/取消、发送/答复、登记/提前结束等待、接续/恢复查询。输入携带预期图版本、节点和原请求键；actor、项目、安装不从模型 JSON 读取。返回图版本、稳定引用、当前拒绝/需核对原因；不返回凭据或原始 Provider 帧。具体 Action 名及版本在 P1 按现有目录冻结并列调用方清单，不承诺改外部 MCP 名字。

#### 4.6.6 Coding 与个人助理接入、旧路径退出

| 产品 | 保留的业务事实 / 路径 | 改成统一事实的部分 |
| --- | --- | --- |
| Coding | `plans.ts` 的计划内容和确认；`run-inputs.ts` 模型参数；角色选择、隔离工作区授权、Diff/检查点、`report.ts` 与 `round-report.ts` 的报告；结果整合和审查；原验收门 | 计划执行步骤投影为同一 Board 节点，普通分工自动有节点。`routes.ts` 只调用共享派发/等待/接续端口；`yield-wait.ts` 的存储、busy 循环与自动启动退出，展示转读共享视图。角色执行仍用各自授权子根，父只读授权范围的子结果，不自动合并写入 |
| 个人助理 | Work 的标题、范围、材料、业务目标/验收、对话、归档、Character 选择、结果对象关系；Coding executor 的业务关联；`assistant-wait.ts` 的变化传输 | 每项 Work 绑定常驻 Board；委派/跟进节点都在图上。`AssistantDelegations` 变成业务适配与视图，移除 `#settling`、`owed`、`handed_back_run`、`hand_back_held`、私有 resume 扫描与基于结果 hash 自启链。子 Work 可保留为专业工作内容容器，只记节点引用；父子协作关系从 Board 读 |
| 共通 | “报告只是候选证据”、现有通知/Inbox入口、共享预算、业务权限与审批 | 交回是否已吸收/要不要自动继续只读 TaskBoard。已有消息/子任务列表是图视图，无第二份负责人/等待/成功状态 |

退出顺序：先完备共享合同与 SDK → Host 公开端口 → 两条产品线的业务适配和 UI → 在隔离 Home 一次性转成现行数据 → 同一产品切换批次停止并删除旧写入/唤醒路径及旧字段读取 → 联合恢复验收。新旧实现可在未发布的不同工作树开发，不在同一运行中的工作双写、双订阅启动或以旧逻辑兜底。助理/Coding 的旧用例保留用户行为断言，改为驱动生产共享端口；不能删除竞态、重启、取消的断言来变绿。

首次使用无需画图：授权范围内开始协作就建立最少节点，显示“已交给谁”。既有会话与未结束工作先列出计划、子工作、Run、等待与成果引用；通过维护在隔离副本里映射成现行节点。已完成历史只链接既有事实，不伪造未记录的通信或接续；无法核对的旧等待/执行进入需人工核对，不自动恢复。真实 Home 切换需另行授权并停旧执行、备份、演练。维护脚本不进入产品读取路径；结构版本不符明确阻止执行，不能运行时懒补表或读取时猜旧字段。

#### 4.6.7 用户动线与界面验收

Coding 步骤板和助理工作/委派视图都读同一图，仍挂在现有工作台；不新增独立整页或第二标签页。最初先做真实或逼真内容的交互切片，含主路径与异常状态，再继续完整实现。

| 用户时刻 | 应看见 / 能做的事 | 事实依据 |
| --- | --- | --- |
| 首次派发 | 谁负责、做什么、哪些权限/工作区；可打开子任务；无模型/无权限在派出前给原因 | 节点绑定、Host 拒绝、实际 Run 引用 |
| 子 Agent 交流 | 请求来自哪个节点、发给谁、是否送达/待答；可定位原消息及相关任务 | Delivery 信封与节点引用，不把通知渲染成人的话 |
| 主 Run 让出 | “等待 A 的结果 / B 的答复”，具体集合、all/any、期限；工作未完成；可以取消或提前继续 | 图上等待，不用 completed 气泡冒充完成 |
| 后台完成 | 有可定位结果；满足条件后显示“准备继续 / 已继续”；窗口关闭再打开也一致 | 等待结算、接续与新 Run 引用 |
| 失败、撤权、预算不足、模型不可用 | 保留已有结果，显示未启动原因和恢复入口；重试须当前条件满足 | 实际拒绝/回执，不将“未发出”写成网络失败 |
| 重启、未知结果 | “需核对”及原执行/回执入口；核对后继续或终止，不自动重做外部动作 | 恢复检查、人工处置回执 |
| 手动停止/提前继续/明确失败重试 | 当前等待与子任务影响清楚；操作后只出现一个有效接续；取消不抹掉已完成成果 | 图版本/代次、启动请求键、Run 事实 |
| 结果审查与输入纠正 | 消息 ↔ 节点 ↔ Run ↔ 固定成果可定位；输入指向同一节点；“AI 的理解”与实际采纳分开 | 输入回执、原成果 owner、业务验收 |

自动接续的授权仅覆盖原工作剩余范围，不能把新的 ask-user 回答、旧审批或子 Agent 建议当成扩大范围许可。交互卡、Option、对象选择和必答等待使用跨插件 AI 线的共享组件/合同；本方案不另造问题系统。节点等待可引用 pending，真正回答/过期仍由 Pending 主人结算。

#### 4.6.8 外部条件等待：非模型检查，满足后恢复主对话

用户结果：主 Agent 启动或发现一项已获授权的外部工作，做完当前可独立推进的部分后，登记“等什么、怎样检查、何时继续”，让出当前 Run。期间只有可信检查器和调度器工作，**此等待不会发出任何模型请求或增加模型用量**。条件满足或出现已约定、确实需要处理的失败，才经同一接续入口恢复原工作/对话的一次新 Run。登记等待和真正接续本身的模型用量正常记账；不把它们混成等待成本，也不承诺外部工作本身（例如正在生成图片）没有模型费用。

**已核实来源与适用边界**：

| 等待来源 | 当前代码证据 | 本方案接入 / 不可声称的能力 |
| --- | --- | --- |
| SDK 托管的构建、测试、长命令 | Prologue `orchestration/core/background.ts` 的 `wait/peek/subscribe`；`assemble-orchestration.ts` 在 ended 事件检查 waits；Molis `prologue-waits.ts` 投影 | 优先等真实退出事件/退出码、结果引用；需要特定输出时复用有界 cursor 查询。命令退出不等于成功，不能靠日志出现“done”盖过失败退出码 |
| 已有插件后台作业 | Molis `platform/actions.ts` 的 `background_job` 描述符；Alchemist 声明 `alchemist.runs.events`；助理 `watchJob/checkJob` 经 `AgentScheduleCapability` 查询同 provider | 保留原 job id、provider/version、状态 query。核对 query 是不调模型的只读动作；明确 pending/satisfied/failed/unknown 映射，不能把未声明状态或 `partial` 一律算满足用户目标 |
| 其他本机进程 | 已托管进程有命令句柄；本轮未核实通用、可跨重启接管任意 PID 的公开能力 | 仅接可信来源提供的进程身份/句柄与状态查询；新增确定性检查器。PID 消失/复用不能证明任务成功；找不到身份或退出结果为 unknown。不得扫描并接管任意进程 |
| 文件/结果生成 | 现有授权根、文件读取可作为检查基础；未有本需求的通用文件等待条件 | 新增可信文件检查器：根引用+相对路径+明确谓词，例如合法结果文件及完成标记。旧文件、部分写入、路径越界不能误命中；只检测“存在”时须明说它不证明内容质量或生成成功 |
| 下载/上传及其他外部工作 | 未核实通用下载/上传状态端口；某些现有 job query 可复用，但不是所有 UI 进度都可查 | 仅支持有可查询真实状态/回执的已授权来源，或登记过的确定性 CLI/API 检查脚本；其他来源显示暂不支持自动等待，不以观察屏幕或模型猜测填补 |

**图上登记的合同**（扩展现有 waits，不开第二张协调库）：

- 绑定同一 Board/节点、原 Work/Session/Run、任务材料引用及输入回执引用；保留先启动外部工作→做其他事→再挂起的路径。外部启动已产生的 job/command ref 不在登记等待时重新执行。
- `source_ref` 指向原 owner 的命令/作业/授权文件/进程；检查器用 Host 可解析的稳定标识及版本、经校验的参数与权限范围引用。Agent 可选择已可用检查器或提议脚本，不能把任意 shell 正文直接存进等候参数就获得运行权。
- 明确 `expected` 的确定性条件和结果映射、all/any 组合、检查间隔与最大退避、单次检查超时、绝对截止时间、错误重试上限、失败/未知处置及接续政策。全部有界；Host 可收紧上限，不能等待无限久。当前助理 15 秒→最多 5 分钟、6 小时上限只是已核实实现，不固化成所有来源的唯一常量；P1 将来源默认值/硬上限放进模块配置并在 UI 回显。
- 检测返回 `pending`（未满足）、`satisfied`（有依据满足）、`failed`（已证实外部任务失败）、`unknown`（无法判定），带检查时间、来源版本/结果引用及有界说明。检查器异常/超时/无效输出属于 `unknown`，另给 checker_error，绝不伪装为外部任务失败或成功。最近观察是“某时检查所得”，不复制原作业状态账；原 stdout、结果和回执仍由原 owner 保存。
- 保存下一次检查时刻、检查代次和必要的最近观察/引用供恢复及 UI；状态收敛与接续占用仍由 TaskBoard 所有。队列只存 wait ref/版本/检查代次与 due time 这些可重建的投递数据、真实队列执行回执，不复制期望条件或业务结果。

**检测与唤醒流程**：登记并持久化→订阅事件/安排首次技术检查→复读防止“结果先到”→无可推进工作才让出 Run。事件可用时以事件为主；无事件时用非模型脚本/query 轮询。每个等待最多一项有效检测在途；检查返回后重新核对图版本、代次、取消/授权与截止时间，过期/迟到结果不得结算。

`pending` 只更新观察和下一次有界检查，不调用 Agent。检查进度的写入、日志和 UI 刷新也不得触发模型摘要、Feed 判断或记忆提取；不能因为用了“只读 query”就忽略其下游可能调用模型。未变化时不周期性通知用户。`satisfied` 才进入 §4.6.4 的唯一接续竞争；父 Run 尚活跃时交给下一边界，不能同时启动新 Run。明确 `failed` 或重试耗尽/超时只触发一次已登记处置：默认保留原因并通知用户；如果原工作授权已包含失败处理，可按图上政策启动一次处理该失败的接续。`unknown` 不结算成功、不重跑外部工作；可在有限次数/时限内重查只读状态，仍不明则停止检查并需核对。不能用每次检测失败都启动 Agent 的方式“排查”。

检查脚本必须是受信登记、可定位版本的只读实现，参数不拼成任意命令；使用现有 Host 命令/目录/网络授权与审批边界，受单次时间/输出/并发限制、取消信号和当前权限复查。未获授权先阻止登记或进入等待授权，不静默运行。不能仅把 shell 标为“查询”就绕过写入/联网审查；允许反复执行的批准须覆盖具体检查器及参数范围，不能从一次批准扩大成任意脚本。更改脚本版本或范围须重新校验，必要时重新审批。检查器不得调用模型服务、AI 动作或模型 CLI；需要模型主观评价的条件如“设计好不好”不属于零模型等待，应改成确定性外部完成信号，再由一次正常接续评价内容。

**两仓落点与单一调度来源**：

| 边界 | 负责的修改 |
| --- | --- |
| Prologue `orchestration/core/{taskboard,waits,queue,background}.ts`、`composition/core/assemble-orchestration.ts` / `assemble-recovery.ts` 与公开 API | 通用外部条件类型、只读检查 Port、四态结算、时限/退避、持久化、恢复、检查代次、唯一接续。扩展现有 waits 的 source 口；检查失败不再按现有 `catch` 当成一次没观察到。复用 LocalQueue 派技术检查，不让队列 runner 直接启动 Agent |
| Molis `horizontal/agent-host` 的 `prologue-waits.ts`、`prologue-node.ts` 既有 schedule 适配及共享协作合同 | 装配同一 Runtime 的 waits/queue，投影检查结果与生命周期；从已有 `AgentScheduleCapability` 提取窄接缝，不再向巨文件加检查状态机。现有 `cancel` 只取消未启动队列项，须补在途只读检查的 signal/代次失效；未补前不能宣称撤权能立即停止检查 |
| Molis `apps/local-host` 的 Agent Host composition、业务 Action 网关、工作区/命令授权服务 | 注册非模型检查器，解析可信 source/job/provider、参数、actor/安装/项目/个人范围；逐次复查并执行只读脚本/query，重启先完成 handler 装配再恢复排程；Host stop/插件停用释放订阅和在途检查 |
| 助理 `watchJob/scheduleJobCheck/checkJob`、`StoredJob` 与 Coding 等待 UI | 迁移查询来源和通知/卡片关联，去掉私有退避/超时/结束判定及 `assistant.job-check` 重复排程；改读共享等待观察。原作业的领域状态、成果和取消接口不迁给助理或 TaskBoard |
| `horizontal/scheduler`、`apps/local-host/src/schedule-runtime.ts`、Schedule 插件 | 已有项目闹钟、租约、missed interval 合并，仍服务用户的定时任务。本线选 **SDK waits + 已接入的 LocalQueue** 作检查驱动，避免再复制一份项目闹钟或让无项目的个人 Work 伪造项目。等待某个 Schedule 作业时读它原 owner 的状态；不新增周期性“问 Agent 好了吗”的 Schedule 任务 |

只读检查自身即使涉及本机/网络，也走原有执行/调用记录与授权链，不能在 SDK JS 中直连文件系统绕过 Host。SDK 的通用检测政策、Molis 的可信检查器和作业业务状态各有主人。现有 waits 的 command/envelope/board-node 事件路径继续使用；新增外部轮询只由 LocalQueue 到点调用同一检查入口，不能让 waits 定时器、助理队列、Schedule 同时查同一等待。队列重启后若上一笔检查状态未知，先使旧代次失效；仅在证明是只读、授权仍有效时安排一次新检测，不重派被观察的工作。

**界面与离线边界**：显示“在等什么”、期望条件、来源入口、最近检查结果/时间、下次检查、截止时间、失败/未知原因及“等待期间未调用模型”。可取消等待，或提前继续；提前继续标“用户选择不再等”，保留未满足/未知事实，经同一占用入口接续，不伪造 satisfied。取消等待默认不停止由其他 owner 运行的外部作业；如需停止，另走该 owner 已授权的取消动作，并说明影响。

- 关闭工作台页面/窗口：只有常驻宿主确实仍活跃、检查器可用时检查继续。使用 `AgentScheduleCapability.claim()` 的实际能力声明/Host 健康状态显示，不根据“装了桌面端”推断。现有安装服务有 macOS LaunchAgent 的 RunAtLoad/KeepAlive，这是已安装并运行时的能力，不是每个开发实例都具备。
- 退出/停止宿主：检查停止；持久等待保留，下一次宿主启动后先复查身份/安装/授权、检查器版本、队列与来源事实再恢复。Prologue `background.hydrate/close` 将原 running 命令记为 interrupted；未知终态需核对，不复活原命令。外部持久服务若仍可查询，可接回原 job，不能凭 PID 重建成功记录。
- 机器休眠/关机：期间不能保证执行检查或唤醒；恢复后按墙钟先处理截止时间和失效代次，只补一次当前状态检查，不追赶所有漏掉的轮询。已超时显示超时；本次请求结果若跨越休眠导致租约/权限失效，拒绝迟到结算。未启动 Host 时不会自行检查或起模型。
- 条件满足不改变输入回执 D4：未读输入仍按已选策略带入/询问，不能把新的未授权目标随外部完成通知自动执行。唤醒消息标 Host 来源，保留原工作/输入引用，绝不伪装成人的新命令。

#### 4.6.9 P1 统一合同（冻结，2026-10-12）

这是 P1 的交付：§4.6.1–4.6.8 的语义落成可实现的合同，SDK 一侧的权威文本是 Prologue [`docs/slices/taskboard-collaboration.md`](https://github.com/molis-ai/prologue/blob/feature/taskboard-collaboration-contract/docs/slices/taskboard-collaboration.md)（下称「SDK 合同」），本节只写 Molis 一侧和两边的一一对应，不重抄 SDK 字段表。冻结的是语义与名字；P2（SDK）、P3（Molis 公共合同与共享 Host）、P4（产品接入）按它实现。标「跨线」的六处（X1–X6）已由统筹按「技术决策看防腐后果」确认（2026-10-12），记在 §6.5。

**现状核查（2026-10-12，main `f5ef12e6` / Molis `aadeef76`）**：SDK 里协作可以不绑节点（`SubagentRequest.claims?` 可选、`session-send` 有无步骤交接）、节点没有执行尝试与代次、等待只有「任何一个」且一个会话一个、检查异常被当成「没看到」、接续分在 `ParkedWait` / 内存 `SubagentWake` / 回灌信封三处；Molis 一侧的协调状态分散在 `prologue-taskboard.ts`（`following`、`roundOf`、2 小时认领过期、`user-` 节点名）、`prologue-waits.ts`（私有 `listeners`、自动 resume）、`prologue-messages.ts`（子任务一律拒发信）、`prologue-node.ts` 索引里的 `attempts[]`、Coding 插件存储（`last-start:*`、`wake-note:*`、内存 `busy` / `held` / `wakeLoop`）和助理（`delegated_by`、`follow_ups`、1500 ms 轮询 `status`、`StoredJob` 与 `assistant.job-check` 退避）。这些都是 P3/P4 要退出或改成视图的。

**三件核心（与 SDK 合同同名）**：

1. **节点绑定。** 每一跑由 Host 在启动时绑到节点（`startAgentRun({ collaboration })`，受信装配）；没绑定的跑没有派出 / 发信 / 登记等待 / 改图工具。派子任务不点名节点时 SDK 自动在调用者节点下建子节点，所以简单分工不要人先画图；自动建节点对人无感：不额外提问、不出新的确认，原来派出要过的审查照旧。Agent 之间的信封带 `scope`（同一张图的父子 / 兄弟），人与人的信（Coding 的人际委派、`audience: "people"`）不在此列。
2. **执行代次。** 节点上 `generation` + 有界 `attempts`（真实 Session / Run 引用、`origin` 父 Run 只作来源）。只有权威换手让代次 +1：交接 / 改派、接管、取消、重试；接续占用用接续自己的修订号做 CAS，不动代次；同一持有者接着开下一轮（例如人在等待期间又说了一句）也不加代次，等待与接续照旧、满足后在这一轮的边界交给它，等它真的吃下才算接续 started。孩子只核自己节点的代次。来自执行的每次改图都带受信 scope，代次不符零变化。新 Run 管原来的孩子靠持有父节点当前代次，不靠「我派的」。
3. **等待组与四态。** 节点上最多一个等待安排：条件闭集 `node` / `envelope` / `command` / `pending` / `external`，`all` / `any`，`until: success | settled`，`onFailure: block | continue`，必有期限，`autoContinue`。每个条件的最近观察是 `pending | satisfied | failed | unknown`；检查器异常 / 超时 / 无效输出只能是 `unknown`（带 `checker_error`），unknown 永不算成功，有界重查到上限进 `needs-reconciliation`。接续是节点上唯一的记录 `armed → eligible → claimed → started`（另有 `blocked` / `cancelled` / `needs-reconciliation`），等待的终态是结果的权威、接续的 eligible 由它推出；占用分「交给活着的跑」与「起新跑」两种，同一请求键只起一次；起新跑与派出复核都经 App 注入的同一个协作口，Runtime 不带自己的起跑实现。

**SDK ↔ Molis 一一对应**：

| SDK 合同 | Molis 公共合同（`services/agent-collaboration`，P3 建，跨线 X4） | Molis Host / 产品 |
| --- | --- | --- |
| `startAgentRun({ collaboration: { board, node } })` | 不对插件暴露；`AgentRunStart` 里由 Host 填 | `prologue-node.ts` 的启动装配（W4-06 拆出的 `prologue-run.ts` 里）：Coding 会话 / 助理 Work 的常驻板 + 当前节点 |
| `TaskNode` + `generation`、`attempts`、`origins`、`results`、`wait`、`continuation`；状态加 `waiting`、`needs-reconciliation` | `AgentCollaborationNode`：`node_id`、`title`、`state`、`parent`、`depends_on`、`owner`（沿用 `AgentStepOwner`）、`generation`、`attempts[]`（`session_id`、`run_id?`、`origin_run_id?`、`state`）、`origins?: { session_id, input_id }[]`、`results?`、`wait?`、`continuation?`、`reports` | Coding 步骤板、助理工作 / 委派视图都读它；`AgentStepBoard` 在 P4 换成它 |
| 板（常驻） | `AgentCollaborationView`：`board_id`、`version`、`work: { kind: "coding-session" \| "assistant-work"; id }`、`nodes`、`terminal` | 板跟着工作走（X5）：人直接开的 Coding 会话一块、一个助理 Work 一块，Host 在建工作时（第一跑之前）admit 常驻板与根节点；助理把工作交给编码角色时，那个 Coding 会话的跑绑在助理 Work 那块板的子节点上，不另开一块。业务对象只存 `board_id`；视图里的 `work` 由业务主人按 `board_id` 反查（Coding 插件存储 / 助理存储），SDK 板上不放 App 引用 |
| `WaitArrangement` + 每条件 `ConditionObservation` | `AgentCollaborationWait`：`wait_id`、`version`、`mode`、`until`、`on_failure`、`deadline_at`、`conditions[]`（`kind`、可定位的 `ref` 与 `label`、`last?: { status, at, note?, checker_error? }`、`next_check_at?`）、`state`、`waited_without_model: boolean`（由 Run 账推出：从 armed 到 started 之间，这个会话没有任何尝试 / Run；不另设 Host 计数器。PA-17 用可计数的 Provider 接缝证明，界面据此回显「等待期间未调用模型」） | Coding 与助理的「在等什么」都读它；`AgentWait` 与 `agent.waits.*.v1` 在 P4 删 |
| `Continuation` | `AgentContinuationView`：`state`、`auto`、`run_id?`、`reason?: { code, note? }` | 「准备继续 / 已继续 / 被拒原因 / 需核对」只读它 |
| `conditionCheckers`（注入，`describe` + 每次带 scope 的 `check`） | 不暴露 | Host 检查器登记表（`apps/local-host` 的 Agent Host 装配），每次检查按 scope（板 → 工作 → actor / 项目 / 安装）复核授权，收回了就回 `refused`（界面「需要授权」）：内置 `molis.action-query`（经声明为 `operation: query` 且 `actionEffect: read` 的动作查原作业状态，映射四态，未声明状态 → unknown）、`molis.file-present`（授权根引用 + 相对路径 + 明确谓词，不越界）；后台命令走 SDK 内置 `command` 条件，不用检查器。检查器不得调用模型、AI 动作或模型 CLI：`molis.action-query` 按动作声明的权限判断，判断类（按合同是命令）与声明了 `model:invoke` 的只读查询都拒（统筹 2026-10-16） |
| `collaborationHost`（注入，`admitDispatch` + `startContinuation`） | 不暴露 | Host 协作口：两个方法按 §4.6.5 同一顺序复核 actor、范围、安装、角色、工具 / 目录、预算、模型、审查接线。`admitDispatch` 在子任务首个模型请求前做，并建共享用量账的预留（不透明引用记在尝试上；结果未知的用量不按零释放）；`startContinuation` 用接续的请求键作开跑幂等键。恢复查 SDK 自己的开跑记录（`findAgentStart`），Host 不另记一份 |
| `boards.attemptOf(run)` | 视图投影用，不另暴露 | 操作卡、待答问题、动作调用编号挂回节点都经它推出（跨线 X2、X3） |
| 错误码 `TASKBOARD_NOT_BOUND`、`TASKBOARD_STALE_GENERATION`、`TASKBOARD_CONTINUATION_CONFLICT`、`WAIT_ALREADY_ARMED`、`WAIT_CHECKER_UNKNOWN`、`WAIT_CONDITION_INVALID` | `agent.collaboration_not_bound`、`agent.collaboration_stale`、`agent.collaboration_conflict`、`agent.collaboration_wait_armed`、`agent.collaboration_checker_unknown`、`agent.collaboration_condition_invalid`（以主人名开头，W3-02；在 `tooling/gates/error-owners.json` 的 `agent` 名下登记） | 给人的原因文字由 Host 写 |

**动作（不新增 typed capability，防腐决定 #1）**：`agent.collaboration.read`（`kind: query`、`operation: query`、`effect: read`：按 `board_id` 或 `run_id` 读视图）；`agent.collaboration.revise.v1`（`kind: operation`、`operation: command`、`effect: write`：人修订计划，带 `expected_version`，沿用现有修订种类并加取消节点、重试节点；P4 替换 `agent.run.step-board.amend.v1`）；`agent.collaboration.control`（`kind: operation`、`operation: command`、`effect: write`：`kind: "cancel-wait" | "continue-now" | "retry" | "resolve-reconciliation"`，带 `expected_version` 与节点 / 等待 / 接续引用；`continue-now` 带 `on_early_continue: keep | cancel`）。actor、项目、安装都从调用上下文取。旧的 `agent.waits.read/await/resume/cancel.v1`、`agent.run.step-board.amend.v1` 在 P4 没有调用方后同一批删除（阶段一不留兼容）；以后这几个动作的形状变了就升 `version`，同一个 PR 里先 `pnpm build` 再 `pnpm actions:update`；MCP 不改已有工具名。revise 现行是 `agent.collaboration.revise`（回执 3d-3 加 insert 的 `origin`，#700）。

**输入、待答问题、操作卡挂到同一张图（跨线 X1–X3）**：

| 东西 | 唯一主人与身份 | 怎样挂到节点 | SDK 合同 | Molis 公共合同 |
| --- | --- | --- | --- | --- |
| 输入（补充、带进的排队输入、回答） | Prologue Session；`InputRef = { session, input }`，`input` = `steerId` / `inputId` | `node.origins`（节点因它新增 / 修订，引擎盖章）；`report.inputs`（报告引用） | `InputRef`、`origins`、`report.inputs`（本刀冻结形状；各最多 8 条，超出整次拒绝、不截断）；写入的工具参数、`acknowledge-inputs` 的 `board-node` / `todo` / `pending` 目标、`pending.about` 归输入回执 S4 | 节点上只给 `input_id`；`key`、来源、读到与说明由 `services/agent-inputs` 解析，不在协作合同里复制 |
| 待答问题 | Prologue Effect-policy；`{ pending_id, revision }` | 推出：`pending.origin.run` → `attemptOf` → 节点；显式：等待条件 `kind: "pending"` | 等待经 Effect-policy 只读口读问题状态；回答 / 过期 / 取消仍由 Pending 结算 | 视图里给 `pending_id` + `revision`，展示与作答沿用 `services/agent-interaction` 的 `AgentPendingQuestion` |
| 操作卡（助理与 Coding 共用） | Molis 卡片协作者（交互线 H2 / 防腐 W5-10）；`card_id` + `revision`，记录产生它的 `session` 与 `run` | 只推出：卡的 `run` → `attemptOf` → 节点；卡不是等待条件，节点需要人决定时用待答问题 | 不进 SDK 图 | 协作视图不含卡；界面在节点下按 `run_id` 取卡片协作者的视图（`InteractionOperationView`）；卡执行不给节点或 Run 加权限 |

**P4 产品接入与旧路径退出（按 X5 的顺序先 Coding 后助理）**：

- Coding：`plans.ts` 的确认计划照旧冻结为节点；`step-verdict:*` / `subagent-verdict:*`（人的验收）保留为业务事实、引用节点；`last-start:*`、`wake-note:*`、内存 `busy` / `held` / `waking` / `wakeLoop` 删除，改读等待与接续视图；`prologue-taskboard.ts` 的 `following` 去抖 steer 改成 SDK 接续在边界交结果，2 小时认领过期改成代次与等待期限。
- 助理：每个 Work 一块常驻板；`delegation(parent)` 改成派子节点（子 Work 仍是专业工作内容容器，只记节点引用）；1500 ms 轮询的 `status` 改成等待视图；`watchJob` / `scheduleJobCheck` / `checkJob` 的私有退避与结束判定改成 `external` 条件 + `molis.action-query` 检查器，删 `assistant.job-check` 排程，保留通知 / 卡片关联与 `told`；委派上限 6 / 3 / 2 数值不变，是助理的产品规则，只定义在 `AssistantDelegations` 的 `DELEGATION_LIMITS`（统筹 10-17 定，[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17)；原写的「协作配置」SDK 里没有）。硬约束（防腐 HUGE-CLASS-MIGRATION 决定 #3）：`delegated_by`、`follow_ups`、委派轮询、`StoredJob` 检查做成 W5-10 形状的协作者——协作者只经端口依赖宿主，样板照 W4-05 拆出的提醒与跟进——算作 W5-10 的一部分，`assistant-service.ts` 不增长；助理这一半开工前由统筹请用户转告防腐线负责人确认先后，在那之前只做 Coding 一半。
- Agent Host：`prologue-messages.ts` 的「子任务一律不能发信」改成 SDK 的 scope 检查；`subagentYieldGuard`（PA-23 的正式拒绝）在 P3 换成「让出 = 登记等待 + 接续」的正式路径时一并删除，PA-23 的「不开放私有自动续做」改由 PA-08 / PA-11 证明；`prologue-waits.ts` 的私有 `listeners` 与自动 resume 删除。
- 合同：新子路径 `services/agent-collaboration` 在 P3 与第一个消费者同批建（空子路径被门禁拒）；`services/agent-host.ts` 不增长（巨大单元），W5-09 拆分时它就是协作这一块的落点。插件开跑的请求（`AgentStartRequest`）不加字段：板与节点由 Host 按业务对象解析后填进 SDK 的 `collaboration`。
- 落点与前置：Host 侧新增 `prologue-collaboration.ts`（协作口、视图投影）与 `prologue-checkers.ts`（检查器登记表）；接线要改 `startAgentRun`，而 `prologue-node.ts`（1550 行，巨大单元）不能增长，所以防腐 W4-06（拆 `initializePrologueNodeAdapter`、`startAgentRun` 搬进 `prologue-run.ts`）是 P3 的硬前置；W4-06 未落时，P3 自己先做这一步拆分并让行数下降，不在原文件里加接线。

**P1 验收**：PA-02、PA-03、PA-16 的合同条款已写进 SDK 合同与本节（节点绑定与自动建节点、越权零执行；单一主人与代次接管；外部条件、检查器、四态、频率 / 时限 / 处置）；证明在 P2（SDK 真实 Node Host）与 P3（Molis 授权测试）。合同文本本身不算这三条通过。

#### 4.6.10 P3 落地（2026-10-14，采用线定）

P1 冻结的是语义（§4.6.9）。这一节写 P3 在 Molis 一侧具体怎么接，以及和 §4.6.9 映射表不一样的几处，理由按「技术决定看防腐后果」。依据是 Prologue main 的公开接口（起初是 `b01067b4`，换包时是 `e5123369`），和 P2 各刀 PR 正文「对消费方的影响」一节。

**为什么换包与接线必须同一刀**：新包同时做了四件事：

- 去掉 `runtime.waits` 的 `park` / `resume` / `flush` 与 `fired` 状态；
- 删 `claims`；
- 删 `onWake` / `onYieldSettled`；
- 把 `dispatch-subagent`、`board-plan` / `board-revise` / `board-report` / `board-wait`、`session-send` / `session-inject`、`await-commands` 的 `park` 简写都收成只有绑定的跑能用。

只换包不改接线，类型检查和 Coding 的派子任务、确认计划、等答复、等后台命令、人排队这几条主路径会同时坏。所以 P3a 一个 PR，默认路径验证也在这个 PR 里做。P3b（换模型之后撤权与「从断点继续」的用例；`beforeAccept` 已由 #523 接好，见 §5.6a）与 P3c（外部条件检查器）各自另成一刀。

**P3a 的接法**：

| 事 | 怎么接 | 和 §4.6.9 的出入 |
| --- | --- | --- |
| 哪些跑要绑 | 这一跑的工具里有协作工具（上面那几个），或者带确认计划。助理（App 模式、自己的委派工具）、Schedule、创作台的跑照旧不绑 | — |
| 绑到哪 | 一律绑在这个会话在项目工作板上的那一块（`prologue-collaboration.ts` 的 `sessionBlock`）：项目根 `project` 第一次用到时加上，会话的块 `s-<会话>` 挂在它下面、由这个会话负责。这个会话有一条可以接着做的接续时，用接续的请求键开跑、绑在接续所在的那一步（就是这一块）。确认计划在这一块下面先加一个计划节点 `s-<会话>.p<n>`，步骤挂在计划节点下面，编号带前缀 `s-<会话>.p<n>.`（`prologue-plan-steps.ts`），给 Coding 的视图仍是 `step-N`、`user-N`。步骤不直接挂在这一块下面：交给另一个会话的步骤若与这一块是兄弟，这一块再给那个会话写信时，对方在旁边就有两步（它自己那一块和交来的步骤），P2g 会以「不止一步相邻」拒绝。根、块与计划节点都是宿主的，模型报告它们会被拒绝 | 用户 2026-10-14 选 B（见下面一段），X5 改了；计划不再单开一块板 |
| 派出复核 | `collaborationHost.admitDispatch`：沿用 `verifySubagentStart` 的角色、目录核对，再跑这一跑的 `beforeDispatch`（授权、安装、停用）。拒绝就带原因码 | 共享用量账的预留这一刀不做，PA-07 的预算一半留到 P4（那里有工作级额度） |
| 接续起跑 | 不给 `startContinuation`。接续满足后停在 `eligible`；Coding 插件看到它，用接续的请求键起跑（`startAgentRun` 的 `agent.idempotencyKey` 填请求键，`collaboration` 填接续所在的那一步）。这一轮走 Coding 自己的 `startRound`，所以照常经过宿主开跑前的全部复核 | §4.6.9 写由协作口起跑。改的理由：Coding 一轮开始时插件还要做自己的账（会话状态、跟随这一跑、委派的接受、标题），宿主替它起跑会漏掉这些；SDK 明确支持「App 看图事件，自己用请求键起」这条路，开跑的唯一入口仍是同一个。助理在 P4 若要宿主直接起跑，再接协作口 |
| 人排队等另一个会话那一轮 | 宿主在排队会话的那一块上以 app 身份 `arm` 一个等待，条件是同一张板上那一轮的节点（`node`），`onFailure: block`。排进去的那一轮的请求体由 Coding 自己存（`queued:<wait>`），等待上不挂数据（`HeldWait` 没有 `data`）。人不等了、直接开始那一轮（开跑请求带 `queued_work_id`，接过那一项）时，宿主撤掉这条等待（`queueTakenOver`），那边做完不会再起一轮 | — |
| 等待的读与控制 | 新合同子路径 `services/agent-collaboration`，两个动作和一个等待：<br>• `agent.collaboration.read`（动作）：每个会话一条视图，是它还要紧的最近一条等待（还在等，或接续还没被接上、没被放弃）；<br>• `agent.collaboration.await`（typed，`operation: wait`，在 `agentHostCapabilities.awaitContinuations`：动作不能是等待）：项目里可以接着做或留给人的接续，最多等 25 秒；<br>• `agent.collaboration.control`（动作）：本刀只做 `cancel-wait`、`continue-now`。等待已经结束、它那一步留给人决定时（失败、到期、要核对），`cancel-wait` 把那一步交还（SDK 没有别的出口），视图从此不再列它。<br>旧的 `agent.waits.read/await/resume/cancel` 只有 Coding 在调，同一刀删掉 | §4.6.9 只列了 read / revise / control。`await` 是加的：Coding 要「等到有一条能接着做」而不轮询。`revise`（替换 `step-board.amend`）、`control` 的 `retry` / `resolve-reconciliation` 留到 P4。P1 写过「不新增 typed」：`await` 是 typed，因为动作的 operation 只有 query、command，长等待的先例是 `agent.run.wait`；它顶替旧的四个 typed（`agent.waits.*`），净减 3，旧 id 不留别名（统筹 2026-10-15 同意）。要做成动作，得等动作合同加上 wait 这种 operation |
| 让出 | 删 `subagentYieldGuard`。`dispatch-subagent` 带 `yield` 按 SDK 走：派出、这一步等孩子那一步、收工；孩子那一步结束，接续 `eligible`，Coding 起下一轮 | PA-23 的「不开放私有自动续做」改由 PA-08、PA-11 证明 |
| 宿主代用户发的「优先」notice | 不再发成信，改由宿主直接告诉范围重叠、此刻正在跑的那几轮（宿主来源的补充）。理由有两条：agents 受众的信只能在相邻的步骤之间走；`people` 受众的信又到不了对方的模型那里。没有在跑的会话不再收到这句话：它下一轮开跑时，项目工作摘要会写出重叠 | — |
| 信交给收件人 | 「子任务一律不能发信」删掉：能不能发、发给谁由 SDK 的位置检查决定（同一项目的会话在项目板上是兄弟，子任务是会话那一块的孩子）。宿主的发信钩子只留三件事：说清不能发的（发给自己、发给别的项目、发给子任务）、把「范围重叠的会话」换成名单、群发上限 5 个。收件人还没有在项目板上的那一块时（它从没跑过一轮），发信之前先给它放上（`place`），不然 SDK 找不到它的位置。会话的信件列表只列四种信（request、notice、reply、handoff），宿主给正在跑的那一轮的 inject 不算信。宿主仍负责把信交给收件人正在跑的那一轮，孩子的跑也算在内（`watchChild` 给每个孩子都登记了 steer）；没在跑的主会话，信留到它下一轮的收件箱。Runtime 自己写回的信（`inject`：子任务回报、等待带回的结果）由 SDK 自己交 | — |
| 跨会话的信与交接 | 保留（用户选 B）。同一项目的会话之间可以互相请求、答复、通知、交接计划步骤（`handoff` 的 `steps` 写步骤在任务图上的编号，没有计划的一轮交不了步骤，用 request）；别人交来的步骤照旧作为材料交给下一轮。跨项目的会话不在同一张板上，照旧拒绝 | — |
| `following`、2 小时认领过期 | 不动，留到 P4（§4.6.9 的 Coding 一项） | — |

**跨会话的信与交接：用户 2026-10-14 选 B（改 X5）**。

- **原题**（统筹经弹窗问）：换包之后，同一项目里两个独立 Coding 会话之间模型互发的信与步骤交接会被 P2g 拒绝，因为两个会话各在自己的板上，不相邻。怎么办？
- **三个选项**：
  - A：接受拒绝。
  - B：所有会话共用项目板。
  - C：先保留，P3 之后再补授权路径。
- **用户选 B**：同一项目的 Coding 会话共用项目工作板，会话之间模型的互相交接与问答保留。
- **对 X5 的影响**：Coding 一侧不再是「一个会话一块常驻板」，改成「项目工作板上每个会话一块」：
  - 项目板有一个项目根；
  - 每个会话的块是项目根的孩子（P2g 的相邻要求共同父节点真实存在）；
  - 这个会话的跑都绑在自己那块上；
  - 它的计划步骤、子任务的步骤都挂在这块下面。计划步骤也要在这里，因为 handoff 只能点名绑定那块板上的步骤；节点编号带会话与计划的前缀，避免 `step-N` 撞号。
- **不变的**：
  - 助理仍是每个 Work 一块板，到 P4 再看；
  - 跨项目的会话不在同一张板上，照旧拒绝，保留断言拒绝的用例；
  - `coding-collab-handoff`、`coding-session-messages`、`coding-message-wait` 要在新路径上继续通过。
- **B 的代价是版本冲突，要正面解决**：
  - 新 SDK 的改图对整张板的版本做比较（`taskboard.ts` 的 `guard`）；
  - 模型的 `board-report`、`board-revise` 都必须带版本；
  - Runtime 自己的每次记账写入也会把版本加一。
  - 所以几个会话共用一张板时，模型的写入几乎总会冲突。Molis 一侧只能用钩子改写版本来绕，统筹要求不这样做。
  - 采用线提议 Prologue 加一刀 P2k「按节点判冲突」：节点记最后被改时的板版本，带版本的改图只看这次碰到的节点；工具形状不变。是否做 P2k 已报统筹（2026-10-14），P3a 等它的结论。

上面表里的几行已按 B 改写。统筹 2026-10-14 批准 P2k，它在 Prologue PR #25；P3a 从 P2k 合入后的 main 打包。

**助理仍是每个 Work 一块板（统筹 2026-10-14，记进决策）**：助理不用 SDK 的协作工具，用的是自己的委派工具；它也没有跨 Work 互相发信的需求。所以这次不跟着 Coding 改，到 P4 的助理那一半再看。

### 4.7 其他采用项（第 15–23 项）

休眠投影、记忆伪标记中和、写前密钥扫描与扩权审查保留。`run-command` 的额外路径/网络必须在批准内容中显示，不能用不含 grants 的记住规则复用；扫描拒绝显示零写入原因，不仅原始错误码。会话私有条目交输入回执线使用，不额外建一份输入账。

副本血缘、租约排队、企业网络、审计导出本次不新增独立产品入口；沿用现行能力并回归采用包的相关边界。它们不是统一协作完成条件，也不作为已完成新功能报出；若发现阻塞本方案的具体缺陷，再更新本文范围和验收，不以空占位写“待实现时补齐”。

### 4.8 存储风险与恢复边界

`c4b9fde3` 只在确有独占 owner 的重开路径清理残留写声明；Molis 已有 `prologue-storage-claims.test.ts`。保留真实 Home 单执行锁，不能用删除 `.cas` 或 owner 锁解决另一进程还在运行的问题。`STORAGE_RECONCILE_REQUIRED` 如实阻止执行并保留待核对信息；损坏记录不自动修成成功。新 Board/接续结构需要的维护/回退按 §3.3；本轮没有读取或复制真实 Home。

## 5. 依赖、分阶段交付与验证

### 5.1 与其他线的分工和共享文件

| 需求线 | 唯一职责与本线依赖 | 交界 / 实施顺序 |
| --- | --- | --- |
| 输入回执（`specs/ai-input-receipts/spec.md`，分支 `feature/handoff-ai-input-receipts`） | 拥有 person/page/host/assistant 来源、输入 key/request_id、L0–L4、处理说明与输入关联；其 D9 已定助理常驻 Board | 本文拥有协作生命周期；常驻 Board 基础落在本线 P1–P4，输入线阶段 5 消费，不再重复建设。D2 新任务提议/D4 未读输入接续策略保持；等待满足不能顺便自动消费未授权的新输入 |
| 输入回执 SDK 与 Molis 接入 | SDK S1–S3 已并入 Prologue main（PR #4、#5），S4（任务板与待办引用输入）沿 §4.6.9 的形状做；D7 还差采用线合入 Molis main | `prologue-stream.ts`、控制/会话入口、TaskBoard 引用字段、Coding `run-inputs.ts`、助理输入路径为交界。先冻结节点与输入引用，再按基础采用包 → 输入接入集成；节点不另造 input id/call id |
| 跨插件 AI（`specs/ai-interaction-experience/spec.md`，分支 `feature/handoff-ai-interaction`） | 拥有问询字段、卡片、Option、对象选择、草稿和共享组件；Prologue `a06ae62e` 已提交题型 | 共用同一接续/Run/pending 引用与输入键；本文只展示它们，不复制 pending。公共 `agent-interaction` 与拟 `agent-collaboration` 分职责；按其 D2 在采用包后合 SDK 接入 |
| Computer Use（`feat/computer-use-land`，Grok 原线） | 设备/浏览器权限、观察和动作自己拥有；本线不实现，不持续看屏幕判断等待 | 共享 `prologue-node.ts`、助理装配与 SDK 包；核对独立分支实际 diff 后集成，不按旧叠分支假设 cherry-pick |
| 防腐（Claude 原线，开发基准） | W3-01 调用编号、W4-05/W5-10 助理协作者、W4-06 Agent Host 拆分、W4-07 Coding 路由、W4-10 订阅、W5-09 合同拆分 | 编号沿现有调用体系；新代码按实际已落地边界写，不在巨大文件继续堆。W 标签只是交界线索，开工按最新 origin/main 核对完成状况；不是把已完成的整改重新列前置 |

**外部等待归采用/统一协作线**，不另开同义需求线；输入回执只管输入政策，Computer Use 继续由 Grok 原线负责，Schedule 只拥有原定时工作及结果。防腐由 Claude 原线推进，其现行规则和已接受变更是开发基准；实施时基于最新已接受边界接入，不把旧采用树结构当成应保留的约束。统筹已为输入回执、跨插件 AI、情境动作分别创建会话，当前只读核对首个切片；后续开发已有用户授权，具体写入/构建时段由统筹按依赖安排。本会话已转入隔离树 A0 实现，不改他线来源树。

实施时共享枢纽包括 `services/agent-host.ts`、新合同出口、`prologue-node.ts`、`prologue-stream.ts`、`assistant-service.ts`、Coding `routes.ts`、`assistant-island.ts`、`i18n/en.ts`、`craft-finish.ts`、SDK 依赖与锁文件、API/动作快照。同一切片一个 writer，先查 PR、串行集成；不同时各改一份唤醒入口。索引、SSOT、手册和 Skill 随实际合同切换更新，不在仅改方案时宣称实现已变。

### 5.2 实施阶段

P0 文档交付已完成，当前执行 A0。原采用项沿 A0–A5 接续；P1–P6 只描述协作子线。A0 完成后优先接 A1 模型控制与逐轮展示，再按各项真实前置推进 A2–A5；协作合同可独立准备，只有涉及协作接续的部分依赖 P1–P4。一个 writer 与共享文件时段约束继续有效，不等于产品依赖。

**给统筹的首轮交接**：

| 切片 | 最小范围与输出 | 前置 / 排除项 |
| --- | --- | --- |
| 基础采用 A0 | SDK `c4b9fde3` 三项增强；Molis 预算/副作用/授权适配、状态事件、必要拆分与回归。先让最新主线能安全消费新 SDK；精确提交、文件和验证见 §5.5 | 不依赖 P1–P6 完成；S1 和问询字段均非前置。力度/换模型、灵光流式和变化观察保留为后续独立切片。正式 yield 入口继续拒绝，私有自动续做不纳入 |
| TaskBoard 统一合同第一刀（P1） | 冻结 board/node 与业务引用、执行尝试/接管代次、受限消息、等待组、外部条件检查描述/四态结果、唯一接续记录和 Host 检查 Port；列状态转换/拒绝/崩溃断点；SDK 原合同与 Molis 公共合同一一映射，输入线只提供原输入引用 | 先查最新防腐已接受的合同/适配器/助理拆分落点，再确定实际文件；不先各写 Coding/助理/脚本轮询版本，也不再重问 TaskBoard 主人。输出足以让 P2 与后续 Molis 接入按同一合同实现 |
| 唯一实现归属 | **采用/统一协作线**拥有等待机制这一条交付链：Prologue `orchestration` 写通用状态与恢复；Molis `horizontal/agent-host` 统一装配；Host 注册可信检查器；Coding/助理只是业务适配与视图 | 输入回执消费同一节点/接续政策；Computer Use/Grok 只提供其已授权、可查询的外部事实；Schedule 不另造轮询 Agent；防腐/Claude 保持结构基准 owner |

采用树从旧基点起，不能整树视为可直接合入的新基准。实现前以最新 origin/main 加防腐已接受变更核对实际包边界、`prologue-node.ts`、`services/agent-host.ts`、`assistant-service.ts` 与 Coding 路由的拆分结果；尚在防腐工作区、未接受的改动只作协调信息，不擅自复制。共享文件落点未稳定时先做合同/只读核对和不冲突部分，统筹安排后再写；不以修改门禁/阈值解决旧树集成冲突。

| 阶段 | 可交付结果 / 依赖 | 验收 |
| --- | --- | --- |
| P0 方案修订 | 本文、现状/去向、跨仓边界、索引 | PA-01 |
| A0 基础采用 | 当前主线上单一 SDK 包与必要适配；独立于统一协作实施，见 §5.5 | PA-22、PA-23 |
| A1 模型控制与逐轮展示（6–8、18/23 展示补验） | 依赖 A0 可消费包与现行模型配置；来源/允许范围/验收见 §5.6，不依赖 TaskBoard | PA-12、PA-24 |
| A2 写后诊断（9） | 依赖现有写入回执、受审命令与项目检查器；真实语言项目样本与取消，未配置明确未检查；不依赖 P1/P4 | PA-12；实现前在同一 spec 补检查器输入/输出和定向用例；合同与验收（PA-25～PA-39）见 §6.0p |
| A3 单次生成（10–11） | 灵光先取 `65d6c3e13`；结构化按共享生成器与领域 schema 单独接入。依赖 A0/该插件授权复核，不依赖协作 | PA-12；流式停止/断连零迟到保存、错误结构零入库 |
| A4 变化观察（12） | 取 `b3235bb1b`、`8c0b60fb3` 的观察传输与必要拆分，消费现行 Work/Run 事实；不取私有接续。协作状态部分届时依赖 P3 | PA-12；无丢事件、无持续全量轮询、关闭释放 |
| A5 其余采用核验（15–23、存储/预算） | 15/17/18/23 和存储/预算随 A0/A1 补验；16 的输入消费归输入回执线，仅 Board 引用依赖 P3；19–22 沿现行边界回归、不新增产品入口 | PA-12；逐项标采用/验证/按已定边界不做，不把未做入口报成功能 |
| P1 统一协作合同 | 仅先于新协作派发/等待实现；冻结外部条件/检查器/四态结果与零模型等待边界 | PA-02、PA-03、PA-16 |
| P2 SDK 机制与包 | 依赖 P1；节点派发/消息/等待/接续一条路径，App-tools 能协作 | PA-04–PA-06、PA-17、PA-18 |
| P3 Molis 公共合同与共享 Host | 依赖 P2 可用包；两产品先接同一端口，无第二正式执行路径 | PA-07、PA-08、PA-19 |
| P4 Coding/助理产品闭环 | 依赖 P3；先高保真切片，再真实产品集成 | PA-09–PA-11、PA-20 |
| P5 协作与关联线集成 | 仅输入/问询的节点、消息、接续联合路径依赖 P3/P4 与对应 SDK 合同；独立输入/题型消费按各线前置推进，不承包 A1–A5 | PA-13 |
| P6 协作旧路径退出与恢复验收 | 依赖 P3–P5；数据演练、删除双启动源、联合恢复验收。整条采用线最终验收另汇总 A0–A5 与 P1–P6，不能用协作完成代替原清单 | PA-14、PA-15、PA-21 |

### 5.3 验收标准与计划证明

本线使用 `PA-` 前缀；实施测试名/注释写对应编号，不复用输入线的 AC/D 编号。以下是验收标准，当前只执行 A0；逐条结果见 §6。不能通过把编号加进旧用例而声称新语义已被覆盖。

| 编号 | 可观察验收标准 | 计划证明 |
| --- | --- | --- |
| PA-01 | 统一事实源、两仓文件边界、在途实现去向、依赖/异常/切换齐备 | 源码与 spec 对照，文档链接/索引/差异校验；不以文档通过代替产品验收 |
| PA-02 | 任何协作都绑节点，简单分工自动建图，扩大任务仍提议；越权报告、无节点派发零执行 | SDK 公开合同测试，同时断言拒绝、持久节点和执行数量 |
| PA-03 | Board/Run/Delivery owner 唯一，来源 Run 不改，跨 Run 接管有代次 | 并发版本冲突、旧代次回调被拒，新 Run 能管理原孩子；原执行引用不变 |
| PA-04 | 有根与无根模式均走真实子 Run；无根拒绝文件/命令，角色权限求交 | 真实 Node Host，公开 start/dispatch，检查子 Session 的工具与目录授权 |
| PA-05 | 父子/兄弟范围内请求答复可用；越图、伪造身份、伪回复、循环等待被拒 | Delivery 原回执、零越权消息/副作用；无环与循环交错用例 |
| PA-06 | 先派后等、all/any、结果先到、超时/取消均有明确状态 | 内存 Host 状态测试加真实 Node Host 落盘重开；不靠持续轮询才结算 |
| PA-07 | 首次/子派发/接续都查身份、安装、目录/工具、审查、模型、预算；撤权/取消/额度不足零新派出、零迟到业务写 | Molis 生产端口与替身模型，等待期间改变授权/安装/模型配置；检查持久化与外部副作用 |
| PA-08 | 两个结果与人工继续并发到达最多一个父 Run；占用后或启动后回写前崩溃可恢复，未知不重派 | SDK 真实磁盘 + Molis 临时 Home，屏障控制交错、进程重开、按同一启动键查询 |
| PA-09 | Coding 的计划、普通分工、隔离工作区、角色、整合审查都用同图；父核对不等于获准整合 | 真实测试仓库与浏览器：子目录产物、父只读边界、整合批准/拒绝、原步骤定位 |
| PA-10 | 助理 Work 常驻图，委派/跟进/成果可追溯；App→Coding 仍查目标授权 | 临时 Home 真实业务工具和 Coding 执行器，核对 Work 只存业务事实/节点引用 |
| PA-11 | 两产品都能派发→兄弟问答→父让出→后台完成→唯一接续→核实交付 | 实际浏览器动线、关闭/重开视图，§4.6.7 全部状态、浅深色和窄屏；Mock 只证明切片 |
| PA-12 | §4.1–4.5/4.7 的预算、副作用、回执、力度/换模型、变更、流式、结构化、诊断、等待与安全边界仍成立 | 原采用定向回归加写后诊断真实项目；SDK/替身/真实模型证据分记 |
| PA-13 | 同一输入键和节点可定位消息/Run/成果；题目提交/过期/取消由原 pending 结算，无第二编号/状态账 | 与输入回执、跨插件 AI 线的联合生产链路样本，补充/问询不误当新授权 |
| PA-14 | 既有会话/未结束工作在隔离副本维护为现行形状；不明确者需核对，旧结构被拒；旧私有协调读取/写入/启动链退出 | 维护演练前后业务引用一致、旧形状拒绝、新运行路径实操；源码 owner 检查辅助，不代替行为；重复观察无重复通知 |
| PA-15 | 两仓工程、Molis 真实动线/重启恢复分别通过后才标内部完整；用户验收另记 | 包消费者、Molis 全量、真实模型/产品操作记录逐条对照；未运行项不得按完成处理 |
| PA-16 | 外部条件绑定同一图/工作/输入引用；未授权脚本、非确定性条件、AI 检查器被拒；来源/期望/频率/时限/处置齐备 | SDK 合同与 Molis 授权测试，覆盖原工作已启动后才登记，不重跑原命令 |
| PA-17 | 真实外部任务在多次 pending 期间，等待所致 Provider 请求数和模型用量增量均为零；满足后同一工作/Session 恰好一轮接续 | 独立可计数的 Provider 接缝、真实子进程/结果文件+确定性脚本；登记/接续调用单独计数，核查原 Run 已结束，避免只测一个 mock 计数器 |
| PA-18 | pending/satisfied/failed/unknown 不混淆；检测器异常、无效输出、超时、部分文件与旧结果不能误成功；失败处置有界 | 四态真实检查器、事件先到/登记竞态、错误退避/截止、重复/并发回调+人工继续；验证最多一次有效接续且不重做外部任务 |
| PA-19 | 在途检测可取消；撤权/停用/停止后无新检测与接续，迟到结果无效；预算不足只保留待接续原因 | 生产 Host/命令/Action 权限链，检查前、执行中、结果后各注入取消与撤权；核对零业务副作用及模型请求 |
| PA-20 | 两产品可看最近检查/时间/原因，取消与提前继续语义真实；输入来源及未读输入策略不被外部满足绕过 | Coding 实际构建/测试进程+脚本文件检查；助理已声明 job query 样本；浏览器对照同一 Board/Run/输入与原结果，不造下载上传能力 |
| PA-21 | 窗口关闭、宿主退出/重启、机器休眠恢复符合实际能力；不追赶补跑，不复活旧命令，不双唤醒 | 临时 Home 真进程重启；可控墙钟/调度挂起测错过间隔及租约失效；可用环境再做真实休眠/唤醒，未做明确记未验证；观察原外部 owner 结果与模型计数 |
| PA-22 | A0 的实际打包消费者可用；显式预算不被思考默认值覆盖、修改回执不被压成可重做观察、状态/审查如实展示，撤权或取消时零派出/零迟到写 | §5.5 的 SDK 三项回归、干净包消费者及 Molis 生产适配路径；独占重开成功与非独占拒绝同时验证 |
| PA-23 | A0 不带私有接续，不开放 yield 自动续做；当前主线删除的旧 Runtime/合同/SQL 路径不复活，依赖与快照从集成结果生成 | 正式派发入口拒绝用例且无父 Run 重启、scoped diff 与主线基准门禁、隔离 Home 启动与 Coding 时间线实际操作；历史提交通过记录不作证 |
| PA-24 | A1 力度按模型能力与每轮配置生效，运行中切换在下一模型边界生效，拒绝不改变原事实，逐轮变更与写入/扩权结果如实展示 | §5.6 公开控制入口、可计数请求与浏览器实操；预算/权限/恢复拒绝断言 |

### 5.4 验证方法和运行约束

以下是实施命令与方法；已运行结果只记 §6，不能把计划当成已通过。

- Prologue：按包脚本做 typecheck/build；`pnpm exec vitest run packages/sdk/test/subagent-writeback.test.ts packages/sdk/test/subagent-writeback.live.test.ts` 及受影响 TaskBoard/Delivery/waits/App-mode 测试。PA-03–PA-08 增加真实 Node Host、公开 SDK 入口、落盘重开与故障注入；用虚拟时钟/屏障制造竞态，不只检查源码字符串。打包后干净消费者验证，来源记录与实际包一致。
- Molis：源码改动后先 `pnpm build`，再 `node scripts/run-tests.mjs` 指定定向用例。现有锚点：`tests/prologue-taskboard.test.ts`、`tests/prologue-subagents.test.ts`、`tests/prologue-recovery.test.ts`、`tests/prologue-storage-claims.test.ts`、`tests/prologue-start-refusal.test.ts`、`tests/assistant-delegation-handback.test.ts`、`tests/assistant-work-wait.test.ts`、`tests/coding-message-wait.test.ts`、`tests/coding-delegation-waits.test.ts`；在途 yield 用例先改为新共享合同再作为证据。
- PA-16–PA-21：SDK 扩展 `packages/sdk/test/background-waits.test.ts`、`background-command.live.test.ts`、`queue.test.ts`；Molis 扩展 `tests/coding-background-wait.test.ts` 与已有作业观察测试。零模型用量按等待原因/Run 归因：登记 Run 的迟到用量回执不得算成检查花费，外部作业自己的模型费用也不混入；同时断言每次检查没有 Provider 请求。真实文件/进程样本必须经过生产检查端口，不仅手工调用测试脚本。
- PA-12 复用 `tests/prologue-model-controls.test.ts`、`tests/coding-model-controls.e2e.test.ts`、`tests/prologue-status-projection.test.ts`、`tests/prologue-memory-boundary.test.ts`、`tests/prologue-inference-native.test.ts`、灵光用例；写后诊断另补真实项目样本，不能拿已有检查点用例替代。
- 公开合同变更跑 `pnpm api:update`、构建后 `pnpm actions:update` 和合同测试；不放宽健康/资产门禁。最终按当前主线脚本跑 `pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm page-assets:check`（先 workspace 构建）。共享核心/存储切换阶段按仓库规则整体全量一次；整台机器同一时间最多一个构建、一个浏览器用例批次。
- 真实产品：临时 Home，Coding 两个子任务一次受限问答、父让出、子结果核查与整合审查；助理业务子任务加获准 Coding 委派、成果定位、后台完成接续。对每条加入窗口关闭/重连、重启、手停、撤权/停用、预算/模型拒绝和未知副作用。真实 MiniMax 能力按现有配置验证，未支持的场景明确未验，不用替身声称产品可用。真实 Home 不参与开发验证。
- 因本线采用树落后 main，失败先用同批文件在最新干净基线比对；A0 已改为最新主线独立实现，完整构建/回归仍须排时段。产品实现结束后逐条登记 PA 编号的通过/失败/未运行与证据，运行测试数和提交摘要本身不证明验收。


§5.5–5.6a 的起点、A0 交接和 A1 核对见[早期采用记录](foundation-records.md)。

## 6. 进度、证据等级与待定项


- [Prologue A0、A1 与早期采用验证](foundation-records.md) — 原 §5.5–5.6a 和 §6.0–6.0c。包括证据等级、验证缺口、候选包与暂停点。
- [Prologue 外部等待、执行角色与网关](gateway-records.md) — 原 §6.0d–6.0h 的设计、运行记录和补证。
- [Prologue 协调者与助理任务图](coordination-records.md) — 原 §6.0i–6.0o 的 P4 决定与实施记录，包括 MCP 注解和 App-tools 外部等待。
- [Prologue 写后诊断与采用证据](diagnostic-records.md) — 原 §6.0p–6.4 的实施、回归与交接。PA-25 至 PA-39 和后续三组决定保留在[主文 §6.0p.7](spec.md#60p7-验收pa-25pa-39)。


<a id="60l-app-tools-只读外部等待的统一-sdk2026-10-17"></a>
<a id="60m-mcp-参数注解与派出校验的统一-sdk2026-10-17"></a>
SDK 专题见[§6.0l App-tools 外部等待](coordination-records.md#60l-app-tools-只读外部等待的统一-sdk2026-10-17)和[§6.0m MCP 参数注解](coordination-records.md#60m-mcp-参数注解与派出校验的统一-sdk2026-10-17)。


### 写后诊断的验收与决定（§6.0p）

#### 6.0p.7 验收（PA-25～PA-39）

每一条都带一个拒绝或反例。用例名是 Molis 那一刀要建的文件；真实进程的几条用 Node Host 加脚本模型（不调付费模型）。

| 编号 | 标准 | 拒绝或反例 | 用例 |
| --- | --- | --- | --- |
| PA-25 | 人在项目设置里存检查器，版本从 1 起，带 `expected_version` 改 | Agent 一轮里的工具、MCP 客户端、工作流、别的插件调 `agent.write_checkers.save` 都被拒，配置不变；版本过时的保存被拒 | `tests/coding-checkers-settings.test.ts` |
| PA-26 | 只能给此刻已授权、`realpath_verified` 的工作区存；撤回授权后写入观察写「未检查：工作区授权已撤回」，不起审查 | 给没授权的工作区存被拒；撤回后零审查、零进程 | `tests/coding-checkers-settings.test.ts` |
| PA-27 | 检查用的 argv 与配置逐项相同，只把 `{file}` 换成写入回执里的路径 | 写入的文件里写着 `// checker: rm -rf .`、`package.json` 里有 scripts，argv 照旧；写入调用多带 `command` 字段被写入工具的合同拒 | `tests/coding-diagnose-after-write.test.ts` |
| PA-28 | `{file}` 作为一个完整参数；`-rf.js` 写成 `./-rf.js`；带空格、`;` 的路径原样是一个参数 | `--file={file}`、`{file}` 出现两次、配置带 `grants` 或 `env_allowlist`、时长超出 1,000–60,000、`executable` 带路径、空白或 shell 符号或是 `NEVER_RUN` 里的名字、`cwd` 首尾带空白、以盘符加分隔符开头（含 normalize 之后才露出来的 `./ /etc`、`./C:/x`）或落在 `.git`、`node_modules`、`.prologue` 里的保存都被拒，拒绝的提示语按类核对；`.github/workflows`、`node_modules_cache`、`C:x` 照存 | `tests/coding-checkers-settings.test.ts`、`tests/security-invariants-checkers.test.ts` |
| PA-29 | 每次检查恰好一张命令审查卡，内容与配置相同，带「写后检查：<名>（配置 v<n>）」，名和版本按执行器记下的（run，`operationKey`）读；批准后才跑 | 拒绝或过期：进程没起（夹具检查器会写一个标记文件，断言它不存在），观察写「被拒」「没有获批（过期）」 | `tests/coding-diagnose-after-write.test.ts`、`tests/security-invariants-checkers.test.ts` |
| PA-30 | 选「本会话不再询问」后，同一文件再写，经同一决定路径自动批准 | 换一个文件（argv 不同）要再审；改了配置（argv 不同）要再审 | `tests/coding-diagnose-after-write.test.ts`、`tests/security-invariants-checkers.test.ts` |
| PA-31 | 超过时长的检查被停，观察写「超时（2 秒）」，文件内容是新的 | 审查等了 3 秒才批，时长 2 秒的检查照样跑完（审查等待不计入） | `tests/coding-diagnose-after-write.test.ts` |
| PA-32 | 超过 SDK `config.tool.observation` 上限的输出，给模型的是 SDK 截断后的那一份；完整输出在命令回执里 | 不到上限的输出原样，没有截断标记 | `tests/coding-diagnose-after-write.test.ts` |
| PA-33 | 一轮第 11 次检查不审查、不起进程，观察写「未检查：这一轮已检查 10 次」 | 下一轮第 1 次照常审查、照常跑 | `tests/coding-diagnose-after-write.test.ts` |
| PA-34 | 观察里检查那一段只有 SDK 写的那几行，Molis 只加「未检查」的原因；退出码 0 和 1 的全文与快照逐字相同 | 退出码 1 不写成「失败」，0 不写成「通过」；检查器名和配置版本不进观察 | `tests/coding-diagnose-after-write.test.ts` |
| PA-35 | 没有检查器的项目：零调用、零审查，观察不变，时间线标「未检查」；没有适用检查器的文件：观察写「未检查：没有适用于 .md 的检查器」 | 检查过的写入在时间线上显示检查器和退出码，不显示「未检查」；时间线的结果从回执读，把观察文字改掉不影响它 | `tests/coding-diagnose-after-write.test.ts`、`tests/coding-diagnose-timeline.e2e.test.ts` |
| PA-36 | 停下这一轮：等审查的检查撤回审查、不起进程；在跑的被停；之后 Coding 时间线没有检查项、Molis 存储没有检查结果、审查队列没有待审 | 停下之前已经跑完的检查，回执和时间线项都在 | `tests/coding-diagnose-after-write.test.ts` |
| PA-37 | 检查器启动失败（`executable` 不存在）：写入的结果在前，后面一行「未检查：检查器启动失败（ENOENT）」，盘上是新内容 | 写入本身失败时不起检查，观察只有写入的失败 | `tests/coding-diagnose-after-write.test.ts` |
| PA-38 | 真实语言样本：JS 项目配 `node --check {file}`，Python 项目配 `python3 -m py_compile {file}`；写进语法错，原样的报错行到观察里；改对后退出码 0 | 本来就对的文件退出码 0、输出为空；不装任何东西，不起语言服务 | `tests/coding-diagnose-after-write.test.ts`（真实 Node Host） |
| PA-39 | §6.0p.6 那一行安全不变量的四条拒绝各有断言，表里点名这个文件 | 去掉受众检查、`./` 前缀、审查、或让规则只比检查器编号，对应断言变红 | `tests/security-invariants-checkers.test.ts` |

Prologue 那一刀的验收写进它自己的切片：缝交回命令后经同一审查资源与回执、审查等待不计入写入时限、没声明的会话零调用不加字、取消跟随写入。每条带变异，像原切片那样。

#### 6.0p.8 统筹定了的（2026-10-17，三项都按推荐）

- **Q1 配置的主人是 `horizontal/agent-host`**，和 MCP 服务器配置放在一起。依据：检查器挂在已授权的工作区上，工作区授权是平台的事实，执行的缝也在 agent-host；Coding 只是第一个用的。`docs/SSOT-MATRIX.md` 加一行（主人 agent-host），随 Molis 实现那一刀加，那时这项事实才在代码里。
- **Q2 第一刀不做按检查器的本会话规则**，只用现有的按完整命令匹配。代价见下面「已知代价」；后续是 BL-160，等真实用量再定。
- **Q3 只做 Coding 的轮**，含子任务的独立目录（cwd 相对子目录）。助理不写工作区文件，不在范围里。

**已知代价（Q2）**：「本会话不再询问」按完整命令匹配，`{file}` 换成不同的文件就是不同的命令。所以：
- 一轮写了几个不同的文件，就要批几次（受每轮 10 次的上限）；
- 同一个文件在本会话里批过「不再询问」，再写就不再问；
- 改了配置，命令变了，之前批过的都要重批。

这会让人多点几次批准，换来的是每一条真正跑的命令都在卡上看过一遍。要不要加「本会话允许这个检查器」一类的规则（按检查器编号与配置版本，不按文件），等有了真实用量（一轮平均批几次、人是否觉得烦）再定。那要改 S-22 旁边的审查语义，由用户拍板。

#### 6.0p.10 统筹 10-18 定：对照 #45、#47 改的四处，和 A2-1 的三条

Prologue #45（写后检查交回一条命令）和 #47（执行器拿到检查的标识，导出判断键的函数和三种资源的常量）合入以后，上面有四处和 SDK 对不上，A2-1 这一片按统筹 10-18 的决定改了正文：

1. **一次写入只跑一条命令。** SDK 的缝一次写入只收一条，所以按配置顺序取第一个适用的检查器；原来写的「可匹配几个、每个算一次」删掉。几个都跑记成 BL-171，以后找 Prologue 提。
2. **截断用 SDK 共用的 `config.tool.observation`**，去掉「前 2,000 加后 2,000 字」；完整输出在命令回执里（PA-32 跟着改）。
3. **观察是 SDK 写的英文。** Molis 能写进去的只有「未检查」的原因；检查器名和配置版本只上审查卡和时间线（§6.0p.4，PA-34 跟着改）。
4. **审查卡怎样认出写后检查、名和版本从哪来。** 用 SDK 导出的 `isAfterWriteCheckOperationKey` 判断审查资源的 `operationKey`，不在 Molis 里写死 `after-write-check:`。名和版本用执行器自己的记录：执行器回答时记下选了哪个检查器、哪个版本，按（run，`operationKey`）存，审查卡按同一个键读，不拿命令去匹配（统筹选 A：三处共用 SDK 给的同一个键）。SDK 的键是每个执行器一轮里的次序号（脚本步骤写入没有 callId，模型的 callId 在一轮里也可能重复，#47 的说明），只在一轮里唯一，所以带上 run（§6.0p.3，PA-29 跟着改）。

A2-1 另外三条：

- **动作 id 是 `agent.write_checkers.list`、`agent.write_checkers.save`**，不是 `agent.checkers.*`：id 会出现在动作目录、Agent 的工具清单和 MCP 工具名里，「checkers」在那里和等待用的条件检查器分不开。代码和存储 kind 都叫 write-checker，`docs/system/GLOSSARY.md` 把「写后检查器」和「等待检查器」分开写。
- **SSOT 写明例外。** `docs/SSOT-MATRIX.md` 第 6 节原来说横向服务只存技术状态；改成照实写：`agent-host` 另外保存人保存的 Agent 配置，只有外部 MCP 服务器、装进项目的 Skill、写后检查器三类，各在「Agent Host 保存的人的配置」表里有一行；不顺带搬家，也不扩大范围。
- **安全不变量随 A2-2 登记。** 保存时的校验（受众、已授权工作区、`{file}` 的写法、时长、cwd）不是安全边界；边界在 A2-2 的执行器上，执行时再核一次授权。所以 §6.0p.6 那一行和 `tests/security-invariants-checkers.test.ts` 随 A2-2 加。

A2-1 做到的（PA-25 全部，PA-26 与 PA-28 中保存的那一半，用例 `tests/coding-checkers-settings.test.ts`）：

- 合同在 `packages/contracts/src/services/agent-host-write-checkers.ts`，从 `services/agent-host` 导出。
- 存储在 `horizontal/agent-host/src/adapters/prologue-write-checkers.ts`；登记和保存时的校验在 `horizontal/agent-host/src/write-checker-actions.ts`，照 `session-actions.ts` 的 `register(definition, handler)` 写法。
- 工作区由 local-host 读项目目录给（和起跑授权同一处 `workspacesFor`），只认此刻已授权、`realpath_verified` 的。
- 撤回授权后列表里不再有它，保存被拒；配置留着，授权回来后照旧。PA-26 的「未检查：工作区授权已撤回」和 PA-28 的 `./` 前缀在执行器里，属于 A2-2。

#### 6.0p.11 统筹 10-19 定：存得进的都跑得了；设置放平台的项目设置

§10.28 防腐复查发现 A2-1 收的配置里有几样存得进、跑不了：合同说 `executable` 可以是绝对路径，保存时不查，而 SDK 只认裸名（S-38），带路径的（含 `node_modules/.bin/eslint` 这种根里的文件）每次执行都被拒；`cwd` 指向 `.git` 这类受保护目录也只在执行时才拒；`env_allowlist` 存得进，SDK 却拒收带它的答复。A2-2 的执行器要建在这份配置上，所以在它之前改：

- **`executable` 只收 SDK 会跑的裸名。** 保存时拒 SDK 执行时会拒的：带空白或 shell 符号的（SDK `prepareCommand` 的 `` /[\s;&|><$`]/ ``，`npx eslint`、`eslint;rm`、`$HOME`）、带 `/` 或 `\` 的、`.`、`..`，以及 Host 的 `runCommand` 任何时候都不跑的 `NEVER_RUN`（`rm`、`sudo`、`chmod` 等）。错误码 `agent.write_checker_invalid`，说「要写成程序名（在 PATH 上找），不能带路径、空格或 shell 符号」。长度上限从 1024 降到 255。合同注释改成「裸名，在 Host 的 PATH 上找（S-38）」。
- **`cwd` 跑的就是写的那个目录。** 保存时拒首尾带空白的（SDK 的 `normalizeRelativePath` 先去掉首尾空白再查，存下的和跑的会是两个目录）、以盘符加分隔符开头的（`C:/x`、`C:\x`，和 SDK 的 `/^[A-Za-z]:[\\/]/` 一字不差；`C:x`、`a:b` 在 macOS 和 Linux 上是根下的普通目录名，SDK 照跑，所以照存）、出根的，和落在 `.git`、`node_modules`、`.prologue` 里的（SDK 的 `PROTECTED_SEGMENTS`，按整段比：`.github/workflows`、`node_modules_cache` 照存）。存下的是 SDK 规范化之后的写法：`./tools` 存成 `tools`，尾部的 `/` 去掉（`src/` 存成 `src`，`./` 存成 `.`）。执行器拿存下的目录和写入的路径逐字比，带着斜杠存下，这个检查器对哪个文件都不生效，模型还会被告知“没有适用的检查器”（评审 #822）。
- **这些规则先抄、等 SDK 导出。** 上面几条 SDK 都没有导出，`write-checker-actions.ts` 先抄一份，逐条注明出处（`prepareCommand`、`runCommand` 的 `NEVER_RUN`、`normalizeRelativePath` 的 `PROTECTED_SEGMENTS`）。BL-220 请 Prologue 导出一个判定函数（如 `checkAfterWriteCommand({ executable, argv, cwd, timeoutMs })`），保存时调它，导出以后删掉抄的。（第一版只拒路径和受保护目录，统筹复审 #757 时指出 `npx eslint`、`eslint;rm`、`rm`、` /etc` 仍然存得进、跑不了，10-19 补齐。复审 #757 第二版时又指出两处：空白和盘符是在 normalize 之前查的，`./ /etc`、`./C:/x` 存下来是 ` /etc`、`C:/x`；盘符规则比 SDK 宽。统筹 10-19 定：这两项改在 normalize 之后、对要存下的值查，盘符收窄到和 SDK 一样；原则是保存时拒的和 SDK 执行时拒的一条对一条，以后换成 SDK 导出的判定函数，行为不变。）
- **去掉 `env_allowlist`。** 合同、schema、存储的形状里都删掉；带它的保存是 `actions.input_invalid`。存储只认现行的字段，存量里带这一项的记录读不了（A2-1 没有页面，开发机之外没有存量）。
- **两个动作升到第 2 版，id 不变。** 输入输出的形状变了（少了 `env_allowlist`），按 `docs/system/CONTRACT-CHANGES.md` 第 3 节第 3 条升 `version`；不留第 1 版（阶段一不留兼容期），id 照 `agent.project-work.queue` 的先例不改。受众只有 `user`、还没有页面调它，没有工作流步骤、MCP 工具或 Skill 固定过第 1 版。
- **设置放平台的项目设置。** A2-3 的设置页放在平台自己的项目设置节里，和工作区授权在一起，不挂在 Coding 的设置页上；执行器按会话的声明启用，不按插件名（§6.0p.2 跟着改）。

用例：`tests/coding-checkers-settings.test.ts` 的 PA-28 加了这几种拒绝。

### 6.5 已定方向、设计选择与开放问题

**已定，不再询问**：Prologue 原完整采用清单保持，A0 是基础切片，24/25 为新增协作项；原采用按真实依赖独立推进。TaskBoard 是所有 Agent 协作的统一事实源；Coding/个人助理同用 Prologue；简单任务自动建少量节点；任务/Run/消息各守主人；先合同后机制后产品；外部条件由可信非模型检查器等待，满足后统一接续；只认现行合同；当前仅实施 A0，不实现统一协作。

**本方案的技术选择，尚非实现事实**：复用 SDK 现有模块和 waits/Delivery，图上持久接续占用+稳定启动请求键；共享 Host 只装配与复核，产品插件不决定唤醒；跨 Run 通过节点负责人/代次接管。数值沿当前授权/预算配置，助理现有委派上限（总数 6、并行 3、追加 2）在统一配置接入时保持效果，调大不藏在迁移中。SDK 状态/导出名、存储版本、节点保留方式、外部检查器的来源默认频率及硬上限在 P1 按真实 API 冻结，不让接口占位扩成第二协调器。

**P1 跨线决定（统筹 2026-10-12 按「技术决策看防腐后果、功能决策看体验」确认）**：

- X1 输入引用：`InputRef = { session, input }` 归 Prologue Session；节点 `origins`、报告 `inputs` 各最多 8 条，超出整次拒绝、不截断；写入路径、`acknowledge-inputs` 新目标与 `pending.about` 归输入回执 S4；`key` 只是调用方幂等键，对应关系由 `services/agent-inputs` 投影。依据：单一事实主人。
- X2 操作卡：不进图，经卡的 `run` → `attemptOf` → 节点推出；人要做决定一律用待答问题，卡不是等待条件；交互线 H2 必须保住每张卡的产生 session 与 `run_id`，以及助理与 Coding 共用的卡片键空间。依据：卡的主人是 Molis 卡片协作者。
- X3 待答问题：只由 Effect-policy 结算；图只读状态、只登记等待；P1 不依赖 S4 的问题事件。
- X4 合同落点：`services/agent-collaboration` 在 P3 与使用方同批建；三个动作 actor 取上下文、输入带 `expected_version`；旧 `agent.waits.*`、`step-board.amend` 在 P4 删；节点来源只显示 `input_id`。依据：W5-09 拆分方向、不建占位子路径、不加 typed 能力、不留兼容。
- X5 常驻板：先 Coding、后助理（回执线 D9）；6 / 3 / 2 原值不变，放在助理自己的 `DELEGATION_LIMITS`（[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17)）；助理一半按 W5-10 协作者形状做，开工前请防腐线负责人确认先后。
- X6 删除无板的 Agent 协作，不留兼容；Prologue 合同列出对所有消费方的公共行为变化，删掉的名字在 public-surface 快照里体现；自动建子节点对人无感。依据：用户否决「简单协作可以绕过 TaskBoard」；唯一消费方。

**实施前仍需核对/决定**：

1. 采用/统一协作线负责机制和 SDK 合成，统筹会话安排具体 writer 与共享文件时段（§5.2）。当前 A0 源码与本地验证已授权；推送、PR、合并与真实 Home 切换尚未授权。
2. 若落地必须改已被外部 Runtime 使用的 MCP 名字，列出精确新旧名和消费者后再请用户决定；本方案不预先授权改名。
3. 真实 Home 的切换时机、维护对象与备份/回退窗口，待隔离副本演练完成后提交具体方案再授权。本轮不把旧数据默认自动续跑。

跨工作/项目自动通信、自动扩大预算、扩大工作目标都不在本方案授权范围；需要这些新产品能力时另作明确决定，不阻塞范围内统一协作。

## 7. 远端交接（2026-10-13 晚，历史记录）

这是 2026-10-13 晚的交接。进度、分支和下一步已由开头的「交接（2026-10-20）」取代；仍然有效的是 7.3 的证据记录、7.5 第 5 项（P4 助理一半的清单，A1–A4 已按它做完，见 [§6.0k](coordination-records.md#60k-p4-助理一半-a1每个-work-一块任务图子任务是图上的步骤2026-10-17)–[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17)）、7.7 决策记录、7.8 工作规则、7.9 已知问题和 7.10 复现命令。


[原交接的状态、分支与复现](handoff-2026-10-13.md)。以下保留其仍需引用的跨线约定、决定与工作规则。

### 7.7 决策记录

完整原文：Prologue 仓库 `docs/slices/taskboard-collaboration.md` 的「决策记录」；Molis 侧的在 §6.0 的决策表。这里列编号和理由，方便接手的人不必翻两处。

| 编号 | 决定 | 理由 |
| --- | --- | --- |
| T1 | 节点权威用图上的代次，不用租约（`claim.ts`） | 协作等待可能持续几天，没有跑在续约；代次与图同账，重启不丢 |
| T2 | 一个节点一个等待，不是一个会话一个、也不合并条件 | 父 Run 可能同时管几个节点的等待；合并会把 all / any 语义混掉 |
| T3 | 检查失败一律 `unknown`，不当「没看到」 | 「没看到」会让坏检查器永远挂着；`unknown` 有界重查、到上限交人 |
| T4 | 派出复核与接续起跑经 App 注入的协作口；Runtime 不带自己的起跑实现 | 起跑要过 App 的授权链；自带一份就是第二种实现 |
| T5 | 操作卡等 App 对象不进图，经 `attemptOf(run)` 推出关系 | 单一写主人 |
| T6 | 输入身份用 `steerId` / `inputId`，不用 App 的键 | 图上要 Runtime 的输入身份 |
| T7 | `pending` 等待条件只接待答问题；审批不是等待条件；不为「稍后」加去向链接 | 「稍后」只有审批有，旧引用上没有指向新问题的链接 |
| T8 | 绑定要求节点 `ready` / `running` / `waiting`、负责人是这个会话（或这一跑的角色），没有负责人也拒绝；绑定后节点带到 `running` | 没有负责人的节点任何人都能报，绑定不能靠运气；其余状态要先由人或 App 处理 |
| T9 | 开始键即尝试的请求键（`start:<键>`），一个键只开一次尝试；回来的必须是 `dispatching` 且在现在这一代 | 同键开两跑是重放不是新工作；断在「开了尝试没绑 Run」后可接着用，旧一代的不行 |
| T10 | 点名派出的步骤必须 `ready`（合同原写 `not-started` 或 `ready`） | 一跑只绑得上可开跑的节点 |
| T11 | 孩子的开始键由「板 + 孩子的步骤」点名 | 拼接串可能撞车，而开始指纹现在含绑定，撞车就成幂等冲突 |
| T12 | 孩子拿到 `board-read` / `board-report` 当且仅当父亲自己有；父亲没有时派出照常 | 不扩权，也不让收窄了工具的父亲派不出去 |
| T13 | 派出先 fork 出孩子会话，再上板，再问 App | 尝试要记孩子的会话；空会话无害，而先问 App 后上板会留下没人知道的预留 |
| T14 | 重启对账只关账、不替节点做决定 | Run 的终态归 Session，节点怎么走归持有者或人；读不清就不动、留痕 |
| T15 | 受限通信：位置由发送一侧派生、投递箱接窄口核；模型发的 `session-send` / `session-inject` 一律带位置，箱子只强制 `request` / `notice` / `reply` / `handoff` | 模型发的任何一封信都不该绕过「只在相邻步骤之间」；Runtime 写回的 `inject` 和 `people` 受众的信不是模型发信路径 |
| R1–R7 | 代次只在权威换手时加；占用用接续自己的修订号 CAS；派出是有序四步；协作口同时管派出复核与接续起跑；新增 `board-wait`；写入顺序固定都等落盘；期限按原事实时刻判 | 独立审查发现的七个阻断问题 |
| X1–X6 | 输入引用归 Session 且各最多 8 条；操作卡不进图；待答问题只由 Effect-policy 结算；消费 App 的公共合同另开子路径只用动作；常驻板一个编码会话一块、助理先接编码后接助理；无板协作直接删除 | 统筹按用户规则（技术决策按防腐后果、功能决策按体验）代定，2026-10-12 |
| Molis 侧 | 问卷字段与 A0 合进同一个包；`acknowledge-inputs` 不在助理面板显示；产品子集去掉 `test:security` 已覆盖的文件；页面资源超预算靠减少注入函数里的注释和重复、不放宽预算；全量回归改成批量；Prologue 的 `dist` 要先 build | 见 §6.0 的决策表和 [§7.9](handoff-2026-10-13.md#79-已知问题) |
| 对账（2026-10-13） | 实现以 main 为准：#472 带进 main 的 A0 代码与 #408 同源，#408 只留 main 没有的三处（S1 补充回执的适配、S3 在助理面板隐藏、`prologue-stream.ts` 的三处类型化），加 PA-22/PA-23 证据、安全登记与本文 | 两份实现同源时只留一份；main 已有的不重做 |
| 过渡包（用户 2026-10-13） | Molis 依赖 merge(`95cd901d`, `d4908c11`) 打的包，不用 Prologue main 末端；第二次换包随 P3 | main 末端带 P2d，Molis 在 P3 之前还在用无板协作，X6 不许兼容路径 |
| 先换包再合 main | 在 #408 自己的树上先换成过渡包，再合 main，SDK 相关冲突一律取本线 | 每个提交都自洽，不需要手造一个两份包都在的中间状态 |
| H16（统筹，2026-10-13） | 换包前在 Prologue 修：名单里没有 `acknowledge-inputs` 的一轮不写编号说明（#17） | 提醒早已按名单关掉，编号说明没有；Molis 的角色还没列这个工具，每条补充都会带一句指向不存在工具的话 |
| PA-23 改述 | SDK 的 `yield` 仍被拒（`subagentYieldGuard`，S-23，`prologue-adoption-guard` 用例）；main 上的第 14 项是已知的私有接续，属 X6 欠账，由 P4 助理那一半还 | #472 已把第 14 项带进 main，P4 之前不回退已上线的行为 |
| 第 14 项留到 P4 | 对账时不动 main 上的助理交回与续做，改造清单在 [§7.5](handoff-2026-10-13.md#75-下一步按顺序) | 改它要有统一协作合同（P3），现在动只能写兼容 |
| 统筹 10-16 | 外部等待的 `molis.action-query` 也拒声明了 `model:invoke` 的只读查询，码同判断（`agent.collaboration_check_not_read`）；按动作声明的权限判断，不另写名单 | 检查器反复去看，每看一次调一次模型，花费无界、结果不确定；§4.6.9 已写检查器不得调用模型，spec 不自相矛盾；拒绝要有自己的用例（S-27） |
| 统筹 10-16（B） | `molis.action-query@1` 只收动作工具名 `tool`；名字到精确引用的表由 `prologue-action-tools.ts` 的 `actionToolRefs` 在 `remember()` 时建，检查器不算哈希 | 模型看不到精确引用；改所有角色的工具描述（A）比这一片宽，什么都不改（C）检查器就用不上 |
| 用户 10-16（§6.0g） | 助理网关为模型写错形状做的纠正全删：写成文字的数和布尔、JSON 字符串解码、纯文本当唯一文本字段、空白当 `{}`、写在身份旁边的字段；`find-capabilities` 之前也不另留路径，同样由能力合同在审查前拒绝，错误里写明哪个字段不对，让模型自己重发。只留 `input` 整个没给时对象合同得 `{}` | 带上类型后 30 次调用只有 1 次要纠正，且在找之前、本来就会被拒（§6.0f）；纠正是替模型猜，形状错了模型看不到，按 §11 不为模型能力打补丁 |
| 统筹 10-17 定 A（§6.0i） | Coding 协调者角色加 `board-read`、`board-report`，孩子由 SDK 按 T12 继承；孩子角色与提示词不变 | 让出的孩子报不了自己那一步，父亲的等待总是失败；宿主的板钩子已经只许读本项目、只报自己持有的步骤 |
| 统筹 10-17（§6.0j） | 人改计划从 typed `agent.run.step-board.amend.v1` 换成动作 `agent.collaboration.revise.v1`，旧的同一刀删掉；`control` 的 `retry`、`resolve-reconciliation` 与 `revise` 的取消/重试节点这一刀不做 | 阶段一不留兼容；那几样现在没有调用方，加了就是没人用的合同，页面要时再加并升 `version` |
| 用户 10-17（§6.0j） | 换成从 Prologue main `c673238e`（#33）打的 reference-kinds 包，并进 P4 第一个改合同的片，不单独换 | 一次换包、一次 Molis 验证；Molis 这一刀不配名单，行为不变 |
| 统筹 10-17 · 助理一半五条（[§6.0k](coordination-records.md#60k-p4-助理一半-a1每个-work-一块任务图子任务是图上的步骤2026-10-17)） | 每个 Work 一块图、子任务共用（用户弹窗）；交回后自动接着做，用请求键起跑；一次跟进一个步骤；A1 先做，A3 之前先核实 SDK 的接续收尾；存量用一次性脚本，先在真实 Home 的只读拷贝上试跑给用户看（用户弹窗） | 助理的 Work 可以不属于项目，也不跨 Work 发信；W5-10 的形状 |
| A1 · 收回不交接（[§6.0k](coordination-records.md#60k-p4-助理一半-a1每个-work-一块任务图子任务是图上的步骤2026-10-17) 第 1 条） | 收回时由人结束这一部分还没结束的步骤（代次 +1）；「由父工作做完」记在子 Work 上，不把步骤交给父会话 | 交给父会话的那一步没有轮站在上面，永远不结束，A2 的等待会等不到；已结束的子任务没有步骤可交 |
| A1 · 跟进要等这一部分结束（[§6.0k](coordination-records.md#60k-p4-助理一半-a1每个-work-一块任务图子任务是图上的步骤2026-10-17) 第 2 条） | 子任务还有没结束的步骤时，拒绝跟进 | 一次跟进一个步骤；送进正在跑的一轮就记不成步骤，上限也就数不准 |
| A2 · 交出时挂等待（§6.0n 第 1 条） | 父 Work 每交出一步（新子任务的第一步、跟进），根就重挂一个等待，等根下所有没结束的步骤；人在子 Work 里自己开的一轮不挂 | 在父那一轮结束时才挂，子任务先做完时登记即「结果先到」，SDK 取消接续，没人接着做 |
| A2 · 用过的请求键不再用（§6.0n 第 3、4 条） | 被撤权的开跑留下的占用，在调用框之外放回；一次被拒的开跑用过的请求键，接续挂起给人，下一轮不带键起跑。Coding 的项目工作板同样处理 | SDK 同一个键只认同一次开跑；占用停在 `claimed` 时，以后每次交出都被拒，直到重启 |
| A2 · 被拒的交回本进程不重试（§6.0n 第 5 条） | 告诉人原因后不自动再起，重启后试一次 | 人刚看到「没有自动接着做」，接着又做了，说法和行为对不上 |
| A2 · 存量的两个旧键（§6.0n 第 8 条） | `handed_back_run`、`hand_back_held` 由 A4 的一次性脚本从存量 Work 里删掉；代码不读、不兜底 | 合同只认现行形状（AGENTS.md） |
| 统筹 10-17 · 一个步骤只有一个接续（§6.0n 第 9 条） | 宿主只取消、重挂、挂起自己挂的等待（`by: app`），不碰模型的；根上开着模型的等待时，交出子任务被拒、可重试，图上什么都不变；挂等待并进 `add`（`wait_reason`），先查再写 | 根只有一个接续：取消模型的等待，它登记的事就没人接着做；单独的 `wait` 在 `add` 之后才会被拒，留下一步没人等的子任务 |
| A3 · 后台作业不是子任务（§6.0o 第 1 条） | 作业是根下没人持有的一步；交回等待（`waitForParts`）与 `binding()` 只取会话持有的步骤 | 作业不由哪一轮去做：交回等它，父 Work 就一直交不回；轮站到它上面，轮结束时会把它结束 |
| 统筹 10-17 · 作业的结束从图上读（§6.0o 第 2 条） | 下一轮的标注材料放上一轮开始之后结束的作业，按步骤的状态和结束时刻读；不另记、不留「已告诉」标记 | 结束步骤的等待不往会话里写字；只有图这一本账，才不会两边对不上 |
| A3 · 看作业用工作此刻的授权（§6.0o 第 3 条） | 宿主的等待每次看都向跟进它的工作要授权：受众 Agent，减去人关掉的动作；以前用人的客户端 | 没有轮的等待也过同一道检查（S-27）；人的客户端不是这项工作拿到的权限 |
| A3 · 节奏照旧，连续读不到就停（§6.0o 第 4 条） | 15 秒起翻倍、最长 5 分钟，6 小时期限，由 `follow` 的 `every` 和 `deadline_ms` 给；连续 5 次读不到或被拒，不再跟进 | SDK 默认最长间隔 1 小时；读不到的次数上限是 SDK 的，调不大，不在 Molis 另写一套重试 |
| 用户 10-17 · `assistant_jobs` 以后单开一片删（§6.0o 第 5 条） | A3 不写表、不改基线；那一片加 3 号基线，维护和维护八同一次安装里跑：先把还挂在表里作业上、仍是 `running` 的卡片结掉（「升级后不再跟进，请到原处查看」），再删表 | 基线只比 `user_version`，改了表的文字不升版会漂；维护会动真实 Home，用户在统筹的弹窗里选了「以后的一片」 |
| 统筹审 #675 · 主人说的状态不记（§6.0o 第 6 条） | 去掉 `said` 与 `AssistantBackgroundJob.last_state`；通知、卡片、材料只说完成了还是没完成 | 原来从观察记录的说明里按措辞取状态，和 D2（#592）相反，还会被长度和「，」截断；要显示得有结构化的来源，先报统筹 |
| 统筹审 #675 · 找跟进作业的工作、不编开始时刻（§6.0o） | 从步骤 id 取 `work_id` 再 `store.get`；没有宿主等待的步骤不是作业，不给 `job` | 只在最近 500 项里找，排在后面的工作会被当成不在、作业以 unchecked 结束；`?? 0` 会写出 1970 年 |
| 统筹 10-17 · Q1 选 A（[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17) 第 2 条） | 上限 6/3/2 放在 `AssistantDelegations` 的 `DELEGATION_LIMITS`，措辞不变；spec 写明它是助理的产品规则，只在这一处定义 | SDK 没有「协作配置」；板的上限是 Runtime 的保护，不是助理的规则 |
| 用户 10-17 · Q2 选 A（[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17) 第 3 条） | 一次性脚本去掉旧形状子 Work 的 `delegated_by`，它们成为独立的工作，正文、轮次和结果都留着；不在 Prologue 的库里补步骤 | 旧子任务在图上没有步骤可指；合同只认现行形状 |
| 用户 10-17 · Q3 同意（[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17) 第 4 条） | 在真实 Home 助理数据的只读拷贝上演练：只拷助理库和 Prologue 的库文件，先列出会改多少项，再在拷贝上跑一遍；不读密钥，不碰 Home 主密钥的钥匙串条目；跑完删拷贝。真实的库只在装下一个版本时、和维护八同一步写，那时再问用户 | 演练不写真实数据；真正的写入和维护在同一次安装里 |
| 统筹 10-17 · Q4 不是（[§6.0q](diagnostic-records.md#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17) 第 6 条） | A4 只改代码和脚本；3 号基线（删 `assistant_jobs`）另做一片，节奏跟维护八和 BL-157 的门禁走 | 改基线要带维护，会动真实 Home |
| 统筹 10-18 定 · A2 对照 #45、#47 的四处（§6.0p.10） | 一次写入只跑配置里第一个适用的检查器；截断用 SDK 的 `config.tool.observation`；观察是 SDK 写的，Molis 只写「未检查」的原因；审查卡用 `isAfterWriteCheckOperationKey` 认，名和版本按执行器记下的（run，`operationKey`）读 | SDK 的缝一次只收一条命令、自己截断、自己写观察；键只在一轮里唯一，拿命令反查要靠保存时多一条唯一规则 |
| 统筹 10-18 定 · A2-1 的 id 与 SSOT（§6.0p.10） | 动作 id `agent.write_checkers.list`、`agent.write_checkers.save`，受众只有 `user`；SSOT 写明 `agent-host` 只另存三类人保存的 Agent 配置（MCP、Skill、写后检查器）；安全不变量随 A2-2 | id 会进动作目录、工具清单和 MCP 工具名，「checkers」和等待检查器分不开；保存时的校验不是边界，边界在执行器 |

### 7.8 工作规则

- **拍板**：技术决策按防腐线的后果判断；功能决策按对用户 UI 交互与使用体验最好的推荐走。本线内的决定写进决策记录并在汇报里列出；跨线或改范围的找统筹。替用户拍板不等于用户验收。
- **Molis 每片一个 PR**，交评审会话评审、修意见、合并（统筹 2026-10-19 定）。**Prologue 每刀一个 PR**。
- **合并**：Prologue PR 由统筹验证过就合（用户 2026-10-13 授权），合之前先重新 build dist，再跑 SDK 全量与干净包消费者检查。Molis PR 由评审会话合，条件是 `Verify` 绿、与 main 同步、secrets 与 health `--base` 过、证据入本文、读过 diff。
- **全量回归攒批**：平时只跑 `node scripts/affected-tests.mjs` 选出的定向用例；共享核心的改动由统筹在集成分支上跑一次全量。整台机器构建和测试各三个槽位，同类第四个排队（用户 2026-11-07 定，取代最多一个构建、一个浏览器批次）。
- **不碰真实 Home**（4207 / 4173）和安装版；不放宽门禁与断言；数字只许降。
- **证据三级分开写**：工程通过 / 真实产品实操 / 用户验收；没做的写「未做」。

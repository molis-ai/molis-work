# Prologue 采用：能力接入与 TaskBoard 统一协作

状态：执行中（2026-10-15：P3a 已合 main（#534，`7fe8ee65`）——换成 Prologue main `e5123369` 打的包（P2a–P2k 与 #27）、按用户的 B 接好项目工作板，记录与证据见 §6.0d；P1 冻结，P2a–P2k 都在 Prologue main；A1 的最后两个缺口（换模型后撤权、「从断点继续」）由 P3b 补了用例（#556，`5948c56d`），没有改源码，SDK 的 `beforeAccept` 早由 #523 接好（§5.6a）；P3c 教 Coding 的执行角色等外面的结果（两个检查器、每次看都复核，S-27），记录见 §6.0e；P4–P6、A2（写后诊断）、A3 的结构化一半未做）

> **2026-10-15 P3a 恢复：接续入口是 §6.0d「P3a 恢复记录」。** §6.0c 的暂停点已解除（防腐线 I8 第二个 PR #523 已合入），其中「恢复时按这个顺序」第 1、2、3 步已做完。

> 2026-10-14 曾暂停（用户让需求线先停、防腐线先走），暂停点见 §6.0c。现状核对见 §6.0b。

> **§6.0b「现状核对（2026-10-14）」**：原 23 项与 24、25 项逐项对照 Molis main 与 Prologue main 的真实代码和测试，列出已实现、部分、未做、暂缓与依据，以及文中写了完成但代码不符的地方。§7（2026-10-13 晚）的分支、决策、工作规则、已知问题和复现命令仍有效，其中进度句以 §6.0b 为准；正文里的旧绝对路径、旧工作树、旧授权语句都是历史记录。

> 2026-10-13 晚已与 main（#471 Computer Use、#472 旧采用树）对账：实现以 main 为准，#408 只留 main 没有的部分；Molis 依赖换成过渡包。对账记录见 §6.0a。


目标完成等级：Prologue **完整采用范围内部完整**——§2 原 1–23 项与存储/预算等既有决定逐项完成采用、验证或按已定边界不做；新增 24/25 项使 Coding 与个人助理共用协作事实及外部条件等待。需要接入的路径在真实执行、界面、权限及异常恢复中可顺畅试用。A0 只是当前基础切片，不是整线完成定义。工程通过、真实产品实操、用户本人验收分别记录。A0 基础采用已完成（工程通过），当前在做 P2 SDK 机制（见 §7.1、§7.5）。授权和工作规则以 §7.8 为准：可推送自己的分支（先跑 secrets 检查、用 SSH 地址）；Molis 侧只往交接 PR #408 提交，Prologue 侧每刀单独 PR；不自己合并、不改真实 Home 或安装版。

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

> 2026-10-13 对账后：表里第 1、3、4、6、7、8、10、12、14、23 项引用的提交（`77fde104`、`da9ddd99`、`804384d8`、`5a4d6feb`、`ceac00a2`、`4d90a1b4`、`65d6c3e1`、`b3235bb1`、`8c0b60fb`、`8b1a0522`）都已随 #472 进 main，以 main 的实现为准；第 6、7 项的核对见 §5.6a，第 14 项的改造清单见 §7.5。第 13 项的未提交 yield 改动不在任何分支上，作废。

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
| 12 | 变化等待口 | ④ | 原本存在 | 助理工作运行中每 1.2 秒读整个工作；Schedule 每 400 毫秒读 Run；`agent.run.wait.v1` 已有 | 见 §4.5；`runViewVersion` 已随 §4.1 扩充 |
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

写后诊断仍待实现：按已授权项目的可用检查工具显式配置，受同一命令/目录审查和预算约束，记录实际命令、退出状态和诊断结果引用；无检查器显示「未检查」，失败不掩盖文件已经写入。不得静默安装工具、启动任意语言服务或把一次完整构建叫作按文件诊断。独立诊断切片 A2 必须给真实语言项目的有界样本与取消路径；未满足就保持未完成，不悄悄删出采用范围。

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
| `conditionCheckers`（注入，`describe` + 每次带 scope 的 `check`） | 不暴露 | Host 检查器登记表（`apps/local-host` 的 Agent Host 装配），每次检查按 scope（板 → 工作 → actor / 项目 / 安装）复核授权，收回了就回 `refused`（界面「需要授权」）：内置 `molis.action-query`（经声明为 `operation: query` 且 `actionEffect: read` 的动作查原作业状态，映射四态，未声明状态 → unknown）、`molis.file-present`（授权根引用 + 相对路径 + 明确谓词，不越界）；后台命令走 SDK 内置 `command` 条件，不用检查器。检查器不得调用模型、AI 动作或模型 CLI |
| `collaborationHost`（注入，`admitDispatch` + `startContinuation`） | 不暴露 | Host 协作口：两个方法按 §4.6.5 同一顺序复核 actor、范围、安装、角色、工具 / 目录、预算、模型、审查接线。`admitDispatch` 在子任务首个模型请求前做，并建共享用量账的预留（不透明引用记在尝试上；结果未知的用量不按零释放）；`startContinuation` 用接续的请求键作开跑幂等键。恢复查 SDK 自己的开跑记录（`findAgentStart`），Host 不另记一份 |
| `boards.attemptOf(run)` | 视图投影用，不另暴露 | 操作卡、待答问题、动作调用编号挂回节点都经它推出（跨线 X2、X3） |
| 错误码 `TASKBOARD_NOT_BOUND`、`TASKBOARD_STALE_GENERATION`、`TASKBOARD_CONTINUATION_CONFLICT`、`WAIT_ALREADY_ARMED`、`WAIT_CHECKER_UNKNOWN`、`WAIT_CONDITION_INVALID` | `agent.collaboration_not_bound`、`agent.collaboration_stale`、`agent.collaboration_conflict`、`agent.collaboration_wait_armed`、`agent.collaboration_checker_unknown`、`agent.collaboration_condition_invalid`（以主人名开头，W3-02；在 `tooling/gates/error-owners.json` 的 `agent` 名下登记） | 给人的原因文字由 Host 写 |

**动作（不新增 typed capability，防腐决定 #1）**：`agent.collaboration.read.v1`（`kind: query`、`operation: query`、`effect: read`：按 `board_id` 或 `run_id` 读视图）；`agent.collaboration.revise.v1`（`kind: operation`、`operation: command`、`effect: write`：人修订计划，带 `expected_version`，沿用现有修订种类并加取消节点、重试节点；P4 替换 `agent.run.step-board.amend.v1`）；`agent.collaboration.control.v1`（`kind: operation`、`operation: command`、`effect: write`：`kind: "cancel-wait" | "continue-now" | "retry" | "resolve-reconciliation"`，带 `expected_version` 与节点 / 等待 / 接续引用；`continue-now` 带 `on_early_continue: keep | cancel`）。actor、项目、安装都从调用上下文取。旧的 `agent.waits.read/await/resume/cancel.v1`、`agent.run.step-board.amend.v1` 在 P4 没有调用方后同一批删除（阶段一不留兼容）；以后这几个动作的形状变了就升 `version`，同一个 PR 里先 `pnpm build` 再 `pnpm actions:update`；MCP 不改已有工具名。

**输入、待答问题、操作卡挂到同一张图（跨线 X1–X3）**：

| 东西 | 唯一主人与身份 | 怎样挂到节点 | SDK 合同 | Molis 公共合同 |
| --- | --- | --- | --- | --- |
| 输入（补充、带进的排队输入、回答） | Prologue Session；`InputRef = { session, input }`，`input` = `steerId` / `inputId` | `node.origins`（节点因它新增 / 修订，引擎盖章）；`report.inputs`（报告引用） | `InputRef`、`origins`、`report.inputs`（本刀冻结形状；各最多 8 条，超出整次拒绝、不截断）；写入的工具参数、`acknowledge-inputs` 的 `board-node` / `todo` / `pending` 目标、`pending.about` 归输入回执 S4 | 节点上只给 `input_id`；`key`、来源、读到与说明由 `services/agent-inputs` 解析，不在协作合同里复制 |
| 待答问题 | Prologue Effect-policy；`{ pending_id, revision }` | 推出：`pending.origin.run` → `attemptOf` → 节点；显式：等待条件 `kind: "pending"` | 等待经 Effect-policy 只读口读问题状态；回答 / 过期 / 取消仍由 Pending 结算 | 视图里给 `pending_id` + `revision`，展示与作答沿用 `services/agent-interaction` 的 `AgentPendingQuestion` |
| 操作卡（助理与 Coding 共用） | Molis 卡片协作者（交互线 H2 / 防腐 W5-10）；`card_id` + `revision`，记录产生它的 `session` 与 `run` | 只推出：卡的 `run` → `attemptOf` → 节点；卡不是等待条件，节点需要人决定时用待答问题 | 不进 SDK 图 | 协作视图不含卡；界面在节点下按 `run_id` 取卡片协作者的视图（`InteractionOperationView`）；卡执行不给节点或 Run 加权限 |

**P4 产品接入与旧路径退出（按 X5 的顺序先 Coding 后助理）**：

- Coding：`plans.ts` 的确认计划照旧冻结为节点；`step-verdict:*` / `subagent-verdict:*`（人的验收）保留为业务事实、引用节点；`last-start:*`、`wake-note:*`、内存 `busy` / `held` / `waking` / `wakeLoop` 删除，改读等待与接续视图；`prologue-taskboard.ts` 的 `following` 去抖 steer 改成 SDK 接续在边界交结果，2 小时认领过期改成代次与等待期限。
- 助理：每个 Work 一块常驻板；`delegation(parent)` 改成派子节点（子 Work 仍是专业工作内容容器，只记节点引用）；1500 ms 轮询的 `status` 改成等待视图；`watchJob` / `scheduleJobCheck` / `checkJob` 的私有退避与结束判定改成 `external` 条件 + `molis.action-query` 检查器，删 `assistant.job-check` 排程，保留通知 / 卡片关联与 `told`；委派上限 6 / 3 / 2 搬进协作配置，数值不变。硬约束（防腐 HUGE-CLASS-MIGRATION 决定 #3）：`delegated_by`、`follow_ups`、委派轮询、`StoredJob` 检查做成 W5-10 形状的协作者——协作者只经端口依赖宿主，样板照 W4-05 拆出的提醒与跟进——算作 W5-10 的一部分，`assistant-service.ts` 不增长；助理这一半开工前由统筹请用户转告防腐线负责人确认先后，在那之前只做 Coding 一半。
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
| 等待的读与控制 | 新合同子路径 `services/agent-collaboration`，两个动作和一个等待：<br>• `agent.collaboration.read.v1`（动作）：每个会话一条视图，是它还要紧的最近一条等待（还在等，或接续还没被接上、没被放弃）；<br>• `agent.collaboration.await.v1`（typed，`operation: wait`，在 `agentHostCapabilities.awaitContinuations`：动作不能是等待）：项目里可以接着做或留给人的接续，最多等 25 秒；<br>• `agent.collaboration.control.v1`（动作）：本刀只做 `cancel-wait`、`continue-now`。等待已经结束、它那一步留给人决定时（失败、到期、要核对），`cancel-wait` 把那一步交还（SDK 没有别的出口），视图从此不再列它。<br>旧的 `agent.waits.read/await/resume/cancel` 只有 Coding 在调，同一刀删掉 | §4.6.9 只列了 read / revise / control。`await` 是加的：Coding 要「等到有一条能接着做」而不轮询。`revise`（替换 `step-board.amend`）、`control` 的 `retry` / `resolve-reconciliation` 留到 P4。P1 写过「不新增 typed」：`await` 是 typed，因为动作的 operation 只有 query、command，长等待的先例是 `agent.run.wait.v1`；它顶替旧的四个 typed（`agent.waits.*`），净减 3，旧 id 不留别名（统筹 2026-10-15 同意）。要做成动作，得等动作合同加上 wait 这种 operation |
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
| A2 写后诊断（9） | 依赖现有写入回执、受审命令与项目检查器；真实语言项目样本与取消，未配置明确未检查；不依赖 P1/P4 | PA-12；实现前在同一 spec 补检查器输入/输出和定向用例 |
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

### 5.5 A0 最小基础采用交接（2026-10-11 核查）

**交付边界**：下一位 writer 从最新已接受的 Molis 主线建干净工作树，按以下提交提取必要改动，交付可验证的基础采用 diff。不要在含他人未提交 yield 补丁的采用树直接整树合并，也不要把旧 spec 覆盖回本文。A0 的目标是基础能力功能可用，并解除输入回执 D7 的 SDK 采用依赖；不是统一协作内部完整。P1 合同设计可独立推进，A0 不等它完成；Molis main 合入后才算 D7 的前置满足，候选实现不等于已满足。源码写入、构建和浏览器时段仍由统筹安排；S1 工程收尾已被统筹接受，当前唯一源码 writer 已转交本线。

#### 提交取舍与顺序

| 顺序 / 来源提交 | 下一位 writer 取什么 | 明确不随本刀纳入 |
| --- | --- | --- |
| 1 · Prologue `c4b9fde3`（基于 `4f7110fe`） | 微压缩只收可再读观察；独占 owner 重开清理残留写声明；App 接手 yield 完成通知。三项源码、测试与对应上游需求一起核实，按 §3.2 先满足上游合主线条件再作为 Molis main 的包来源 | `onYieldSettled` 可存在于 SDK，但 A0 的 Molis 不启用新的自动唤醒 |
| 2 · Molis `77fde1040` | 新 SDK 依赖、预算参数合并、状态/事件投影、工具副作用分类、yield 安全拒绝、命令扩权审查及对应用例 | 旧包路径/锁文件不原样覆盖主线；原始 spec 不覆盖修订版 |
| 3 · `da9ddd994` | 前项对应的 Agent Host、合同和 Coding 展示拆分；在当前主线已有拆分上落位，必要 helper 随调用链一起带入 | 历史评估文档不是运行依赖，不为复刻旧提交搬运；不得恢复已删 CLI adapter 或旧 Runtime 状态 |
| 4 · `804384d8a`、`5a4d6feba` | 派出前拒绝、副作用、记忆伪标记测试；包登记中的 SDK 路径随实际包更新 | 不用旧测试覆盖主线后续断言，不把只读回归的通过当成统一协作验收 |
| A0 后独立保留 · `ceac00a2b` + `4d90a1b4f` | 推理力度、运行中换模型、模型控件和逐轮变更后续展示验收 | 不是输入回执/S1 的前置，不塞入 A0 的设置、路由与模型合同改动 |
| A0 后独立保留 · `65d6c3e13` | 灵光流式预览、取消和最终保存校验 | 不延长 A0，不新增旧式 native HTTP 装配路径 |
| A0 后独立保留 · `b3235bb1b` + `8c0b60fb3` | 助理与 Schedule 变化观察传输及公开入口测试；最终订阅统一事实 | 不带进另一套等待/唤醒 owner；助理拆分按届时防腐落点接入 |
| 排除 · `8b1a05220` 与未提交 Coding yield 补丁 | 只作 P3/P4 的需求样本：结果报告、成果引用、交回场景和 UI 文案可重新采用 | `handed_back_run` / `hand_back_held`、私有恢复扫描/自动启动、`yield:<session>` 与 busy/retry 接续均不进 A0 |

前三个 Molis 主提交形成一条依赖链；`da9ddd994` 的拆分不能单独拿成与前项无关的清理。提交号是核对来源，不是可盲目 cherry-pick 的批次。采用树当前 8 处源码/快照修改及 5 个未跟踪源码/测试均保留，不重置、不删除。

#### SDK 依赖判断

| 项目 | A0 / 后续消费关系 | 接入时处理 |
| --- | --- | --- |
| S1 输入回执 | **不是 A0 前置**，也不依赖带类型问询或统一 TaskBoard。它提供当前 Run 的 `SteerInput` key/source/about、读到回执、撤回与投影；跨 Run 排队 S2 不在 S1 内 | `prologue-input-receipts` 的 HEAD 为 `4f7110fe`，完整未提交 S1 已由统筹验收，来源树冻结；本轮在独立树与 `c4b9fde3` 组合验证。仍不等于已在 main；合成若有独立合同冲突，可先交 A0 |
| `ask-user-fields=a06ae62e` | 基于 `c4b9fde3` 的题型增强；**不是 A0 或 S1 前置**，是跨插件 AI 线正式接题型的依赖 | 可在自身验收和包消费者通过后合包，但不因“顺便升级”隐式承诺 UI 已接通，不阻塞 A0 |
| Computer Use | Grok 原线单独负责，本刀无依赖 | 不把它的未提交源码或 SDK 合同纳入本刀 |

S1 与 `c4b9fde3` 实际共改 `agent/core/compaction-history.ts`、`agent/core/loop-tools.ts`、`composition/core/agent-run-collaborators.ts`（均在 `packages/sdk/src/`），以及两个切片索引；必须同时保住输入 key/读到回执与不可重做回执的压缩语义。S1 与问询提交共改 SDK `index.ts`、公开 API 快照与切片顺序，需重新生成合成后的公开面；仅没有文本冲突不足以证明消费合同正确。合成包来源必须记最终真实提交及构建步骤，不把 `c4b9fde3` 的包标成已含 S1。共享 SDK 源码由完成 S1 后的指定 writer 串行处理。

#### A0 文件范围

以下是依据前四个 Molis 提交推导的允许范围，文件落点以当前防腐结构为准；若文件已拆分，先在本文更新对应落点再实现。不开放整目录任意重构。

| 责任 | 允许路径 |
| --- | --- |
| SDK 装配与依赖 | `horizontal/agent-host/package.json`、`pnpm-lock.yaml`、`scripts/workspace-packages.mjs`；`vendor/prologue-sdk/` 中实际采用包、对应 `.sha256` / `.provenance.json`、README；替换旧包时同步 `patch-history.json`，不保留失效旁证 |
| Host 适配 | `horizontal/agent-host/src/adapters/` 下 `prologue-action-gateway.ts`、`prologue-action-tools.ts`、`prologue-credentials.ts`、`prologue-documents.ts`、`prologue-memory.ts`、`prologue-methods.ts`、`prologue-node.ts`、`prologue-run-params.ts`、`prologue-stream.ts`、`prologue-subagents.ts`、`prologue.ts`；同包 `capability-registration.ts`、`reviews.ts` |
| 公共合同 | `packages/contracts/src/services/agent-host.ts`、`agent-host-memory.ts`；按集成结果生成 `tooling/gates/api/contracts/services/agent-host.txt`，不得带入旧 Runtime 状态。A0 不新增 TaskBoard 合同出口 |
| 必要展示 | `apps/workbench/src/agent-review-surface.ts`；`plugins/native/coding/src/` 下 `client.ts`、`composer-model-client.ts`、`index.ts`、`styles.ts`、`timeline-styles.ts`、`timeline-words.ts`、`timeline.ts`、`turn-changes-client.ts`，只收前四提交所需状态/审查展示与拆分 |
| 定向测试与文档 | 下文列出的现有回归文件及与 PA-22/PA-23 对应的拒绝用例；本文、`specs/README.md` 本线行、实际变更包 README 的开发要求。不改他线 spec |
| 本轮已获授权的安全/CI 登记 | `docs/system/SECURITY-INVARIANTS.md` 仅记忆标记、命令扩权与 yield 拒绝；根 `package.json` 仅在现有 `test:security` 增加对应轻量测试；`tests/ci-product-subset.txt` 仅加入本刀合格产品用例。保留全部现有条目，不碰 S-07/S-17、数量说明与防腐在途实现，不改门禁或阈值 |
| 生成结果 | 当前集成结果确需更新的 API/动作快照、收紧后的健康基线/资产实测值。只按现行生成命令更新，不手写放宽；A0 无动作 schema 改动时不制造动作快照 diff |

A0 明确不改助理协调器/存储/客户端、Schedule runner、模型设置、灵光、Coding `routes.ts` / `run-inputs.ts`、Computer Use、输入/题型产品接入；不修改门禁脚本、阈值、豁免或冻结名单来收容旧分支。若集成证明有必要扩到这些落点，先将原因、合同和验证写回本节并由统筹重新分配共享范围，不以整分支合并绕过边界。

#### 与当前主线/防腐的冲突

前序交接只读 `git merge-tree 118780596 origin/main <采用提交>`，不创建合并、不动工作树。核查的 `origin/main=9f9bda551`：

- A0 来源截止 `5a4d6feba`：**8 个文件重叠、2 处文本冲突文件**。冲突在 `specs/README.md`、`tests/coding-timeline.e2e.test.ts`；其余重叠为 `packages/contracts/src/services/agent-host.ts`、`plugins/native/coding/src/index.ts`、`pnpm-lock.yaml`、`scripts/workspace-packages.mjs`、`tests/action-before-effect.test.ts`、`tooling/gates/api/contracts/services/agent-host.txt`。锁文件/快照需从当前结果生成，自动合并不作正确性证据。
- 整个已提交采用分支截止 `8b1a05220`：27 个重叠文件、3 处文本冲突文件，多出的冲突为 `apps/workbench/src/scripts/client/assistant-island.ts`。这不是 A0 的额外文件范围，也不是未提交 yield 补丁的预演结果。
- 当前主线已删除 CLI adapter（`f07c771c9`）、`agent.runtime_missing`/health unavailable（`a5e21bd05`），并有表 owner 收口（`c07e4bd33`）、工作区 ID 收口（`747eda419`）、回环校验共享（`dadb765a6`）、Chrome testkit（`32246e7aa`）、生命周期移入 plugin SDK（`f6f73e7d0`）及 Manifest 校验迁移（`e90638794`）。保留这些现行边界；Coding 浏览器用例用当前 testkit，包登记/合同不复活已删能力，业务读写继续走 owner。
- 上述是已接受主线时间点。Claude 防腐工作区继续变化，未接受内容不复制、不宣称已经合入；writer 开始前重查最新主线、在途 PR 与共享文件，必要时重算本节，不能把本次预演当成未来零冲突保证。

#### 下一位 writer 的执行与交付步骤

1. 先核查 SDK 来源：若仅 A0，验证 `c4b9fde3` 三项；若合 S1/题型，同时列出精确已接受提交。SDK 运行对应 typecheck/build，定向 `context-micro-compaction.test.ts`、`host-storage-concurrency.live.test.ts`、`subagent-writeback.test.ts` / `subagent-writeback.live.test.ts`，以及 `packaged-consumer.test.ts`；合 S1/题型时再加各自消费者/恢复测试。Molis main 采用的包满足 §3.2 上游要求后再生成来源记录。
2. 获统筹分配构建时段后，Molis 更新实际依赖和锁文件，再 `pnpm install --frozen-lockfile --offline` 验证可重装；按包 README 做检查，先整体 `pnpm build`。执行结果记 §6。
3. A0 定向回归：用 `node scripts/run-tests.mjs` 跑 `tests/model-thinking.test.ts`、`agent-budget-prologue.test.ts`、`prologue-stream.test.ts`、`prologue-status-projection.test.ts`、`prologue-storage-claims.test.ts`、`prologue-memory-boundary.test.ts`、`prologue-start-refusal.test.ts`、`prologue-subagents.test.ts`、`prologue-recovery.test.ts`、`action-before-effect.test.ts`、`assistant-business-gateway.test.ts`、`agent-review-standing.test.ts`、`agent-review-surface.test.ts`、`vendor-provenance.test.ts`（以上后续短名均在 `tests/`）。正式 yield 拒绝与零自动父 Run 启动由 `tests/prologue-adoption-guard.test.ts` 走真实回环 HTTP、生产 Node Adapter 与落盘重开验证；不把在途 `prologue-subagent-yield.test.ts` 的开放语义复制进来。
4. 申请整机唯一浏览器批次，跑 `tests/coding-timeline.e2e.test.ts`，在临时 Home 验状态、变更与扩权审查实际展示；不碰真实 Home。按 §5.4 跑当前合同/边界/健康/资产门禁，SDK 与共享 Host 变更按仓库规则在集成树整体回归一次，源码冻结期间不同时构建。失败在同批干净基线对照，不删除断言。
5. 交付来源提交/最终包、scoped diff、PA-22/PA-23 的通过/失败/未运行与原因、主线冲突处理和下一消费者入口。工程通过、临时 Home 实操与用户验收分记；不把 A0 完成报告成 PA-02–PA-21 全部完成。推送、PR、合并仍走已有授权边界；未合 Molis main 前，明确 D7 尚未解除。

### 5.6 A0 后的下一完整切片 A1：模型控制与逐轮展示

这是原第 6–8 项与 18/23 展示的接续，不开新的总需求书。本节给下一 writer 的范围，当前仍只实施 A0。来源 `ceac00a2b083272e59a4a27ba7da5e24e7a20d2c` + `4d90a1b4f97ffc08968dce34e21751f1d3f0d7e4`，基于 A0 实际结果提取，主线已有拆分/模型配置一并核对，不整提交覆盖。前置仅 A0 可用包、模型目录/凭据与派出授权入口；不依赖 TaskBoard 合同或 P4 产品闭环。

现行主线 #391 已将模型模板实现归 `apps/local-host/src/model-provider-templates.ts`，从 Host 公开入口导出 `MODEL_PROVIDER_TEMPLATES` / `modelProviderTemplate` 等；工作台公开 `ModelTemplateChoice`，设置页通过 `ModelSettingsModel.templates` 接受 Host 给出的模板。A1 必须沿这些现行入口实现，相关渲染调用显式传 templates，不把模板目录/常量搬回 contracts；旧来源提交只能提取力度与换模型行为。

允许范围按这两个提交收窄：

- Host：`horizontal/agent-host/src/adapters/` 的 `prologue-frozen.ts`、`prologue-model-switch.ts`、`prologue-node.ts`、`prologue-run-params.ts`、`prologue-stream.ts`、`prologue.ts`；同包 `capability-registration.ts`、`model-configuration.ts`。
- 模型配置/公共合同：`apps/local-host/src/configured-models.ts`、`web-model-settings.ts`、`web-request.ts`；`packages/contracts/src/modules/model-providers.ts`、`services/agent-host.ts` 及对应 API/动作生成快照。
- 必要界面：`apps/workbench/src/i18n/renderer-gap-en.ts`、`scripts/settings-models.ts`、`settings-models.ts`、`styles/settings-models.ts`；`plugins/native/coding/src/client.ts`、`composer-model-client.ts`、`routes.ts`、`route-actions.ts`、`run-inputs.ts`、`styles.ts`、`ui.ts`，逐轮展示如需修正限 A0 已有 `timeline*`/`turn-changes-client.ts`。
- 验证：`tests/prologue-model-controls.test.ts`、`coding-model-controls.e2e.test.ts`、`coding-timeline.e2e.test.ts`、`agent-action-tools-prologue.test.ts`、`assistant-business-gateway.test.ts`、`model-thinking.test.ts`；相应包 README、本文、必要生成资产尺寸（只收紧）。不改助理私有协调、Schedule、灵光、输入/题型、TaskBoard 或 SDK 包机制。

验收 `PA-24`：只对支持的模型提供力度，逐轮冻结且显式预算优先；运行中模型切换下一模型边界生效，区分请求/实际生效，下一调用使用新模型和正确凭据；不支持力度/思考、上下文缩小、cache 协议不符、撤权等拒绝零错误派出且保持原事实；重放逐轮变更不重复，浏览器展示对应真实 Run/文件变更；写前密钥拒绝与点名扩权文案如实展示。取消与冷读恢复各有行为断言，不仅检查字段。实现时在新增测试名/注释引用编号。

验证顺序：整体 `pnpm build` 后，上述五个非浏览器定向文件；`pnpm test:contracts` 与边界/健康/API/资产门禁；唯一浏览器时段跑两份 e2e，实操模型/力度选择、运行中切换与时间线。模型请求使用可计数回环服务，真实外部模型与用户体验另记。共享 Host 的集成全量由统筹安排，来源提交的历史通过不能当 A1 新基准通过。

### 5.6a A1 改为核对 #472（2026-10-13）

推理力度、运行中换模型、逐轮变更已随 #472（`ceac00a2`、`4d90a1b4`）进 main。A1 不重做，只核对 main 的实现是否满足 PA-24 与 PA-12，缺的补齐。

main 已满足（证据是 main 的用例，在对账后的树上重跑，结果见 §6.0a）：

- 力度只给设置里标了支持的模型（`model-providers.ts` 的 `reasoning_effort`，设置页勾选），逐轮冻结、每次调用都带，不支持就在发出前拒绝：`prologue-frozen.ts`；`tests/prologue-model-controls.test.ts`、`tests/coding-model-controls.e2e.test.ts`。PA-24 写的「按模型能力」实现为「人在设置里标记」，符合 §4.3 的「目录声明」。
- 显式预算优先不变：`prologue-run-params.ts`；`tests/model-thinking.test.ts`。
- 运行中换模型在下一模型边界生效，区分请求与生效，用新模型的凭据，历史不动，记下开跑模型：`prologue-model-switch.ts`；`prologue-model-controls.test.ts`；浏览器用例。
- 已测的拒绝：已结束的一轮、上下文窗口变小、带思考切到不支持思考的协议。
- 逐轮变更重放不重复：`tests/prologue-stream.test.ts`；浏览器里的行与回退、写前密钥拒绝、点名扩权文案：`tests/coding-timeline.e2e.test.ts`、`tests/agent-review-surface.test.ts`、`tests/agent-review-standing.test.ts`。

缺口（main 上的位置；按 PA-24 编号补，下一组 A1 提交在 #408 上做）：

1. 没有用例在名字或注释里写 PA-24 / PA-12。
2. `horizontal/agent-host/src/adapters/prologue-model-switch.ts` 的五个拒绝分支没有用例：提示缓存协议不符（PA-24 点名）、目标模型没标力度、视觉、模型不可用、Runtime 不支持切换。
3. 申请换模型后撤权（授权撤回、Character 停用）：下一次模型调用要在发出前拒绝，新端点零请求，没有用例。
4. 带着未生效的切换停止一轮：不向新模型发任何请求、结束的视图去掉 `requested`，没有断言。
5. 冷读：关掉再打开适配器后，运行视图仍显示 `model_switch.now` 与开跑模型，没有断言。
6. §4.3「从断点继续」后重新解析模型与凭据、不悄悄换模型：没有覆盖换过模型之后的情形。

**2026-10-13 晚的进展（分支 `feature/prologue-adoption-a1-checks`）：**

- 缺口 1 已补：`prologue-model-controls` 的 6 条、`coding-model-controls.e2e`、`prologue-stream` 里新帧那一条与 `coding-timeline.e2e` 的逐轮变更段都写了 PA-24。
- 缺口 2 补了三个分支，各自断言拒绝之后什么都不变，也没有请求发到别的模型：提示缓存跨接口格式、目标模型没标力度、模型不可用。另外两个没补：视觉要在开跑时带图片，没有 Runtime 支持切换的场景用真实 Node 适配器造不出来。
- 补用例时修了一个真缺陷：`prompt_cache` 的取值是 `"off" | "best-effort" | "required"`，原判断只看真假，提示缓存明确关掉的一轮也被拒绝换到别的接口格式。现在只有开着缓存才拒绝，两边各有一条用例。
- 缺口 4 已补：申请换模型之后停止这一轮，新模型零请求，结束的视图不再显示 `requested`。
- 缺口 5 已补：申请换模型、下一次模型调用换成新模型之后结束这一轮，关掉适配器再重开，结束的视图仍显示 `model_switch: { now }`、开跑模型与那一条换模型活动。（更正：第一次写这条用例时让第一次调用直接收尾，这一轮只调了一次模型，换模型根本没生效，看起来像冷读丢了；用例改成第一次调用要一个工具、逼出第二次调用之后，冷读是对的。不是产品缺陷。）
- 缺口 3（申请换模型后撤权）、缺口 6（从断点继续之后的模型与凭据）没做。

**2026-10-15 P3b（分支 `adoption/p3b-model-switch`）：缺口 3、6 补了用例，没有改源码。**

- 更正：前文和 §6.0b 表第 7 项说 P3b 要「接 SDK 的 `beforeAccept`」。这一步早在 main 上：防腐线 I8（#523）换 acceptance 包时接的，`horizontal/agent-host/src/adapters/prologue-run.ts` 的 `switchModel` 把 `beforeAccept` 交给 SDK（先 `deps.effects.assertCurrent()` 再 SDK 自己的检查），用例是 `tests/agent-sdk-effects.test.ts` 的 W2-18-MODEL-SWITCH-01/02（配置、凭据、SDK 接受三个阶段 × 取消、撤权）。P3b 剩下的只是两个缺口的用例。
- 缺口 3：`tests/agent-sdk-effects.test.ts`「PA-24: plugin-stopped / character-disabled after a switch is accepted …」。真实 Node 适配器经 LocalHost 与 `registerAgentHostCapabilities` 开跑，带插件实例（`plugin_caller`）；第一次模型调用要一个工具，逼出第二次调用；中间申请换到 B（端点 `1.1.1.2`），SDK 接受（`requested: B`），然后让插件实例停止（真实的 `actions.forbidden`「此插件实例已停止，请重新打开」），或让 Character 停用（真实的「所选 Character 版本不可用…」）。断言：B 的端点零请求；这一轮 `failed`，`stop_reason` 是「EFFECT_NOT_AUTHORIZED: The App refused this network dispatch before sending: <原因>」（Coding 时间线把它译成「这一轮的授权已失效」）；用量只算 START 那一次；会话里没有多出一轮。
  - 挡住它的是现有的逐次出网检查：这一轮的 `dispatchGuard` 经 `beforeNetworkDispatch` 在每次出网前跑（SDK 的 model 通道也走它），其中 `capability-registration.ts` 的 `caller?.assertActive()` 管插件实例，`index.ts` 的 `validateCharacter()` 管 Character。SDK 另有 `beforeModelDispatch`，Molis 不用：`beforeNetworkDispatch` 已经覆盖模型调用，再接一个是同一件事查两遍。
  - 反证：在构建产物里临时去掉这两处检查（备份后改 `dist`，跑完还原并逐字节比对），两条用例都失败，B 收到了请求。
  - 视图里 `model_switch` 是 `{ now: "B" }`：切换在那次调用的边界上生效了（SDK 发了 `model-switched`），而它生效的那次调用在发出前被拒。用量与 `stop_reason` 说明 B 没有收到任何东西。用例把这一点钉住；要不要在「换过去的那次调用被拒」时不显示 `now`，是 Prologue 侧的语义，没有在这里改。
- 缺口 6：`tests/prologue-model-controls.test.ts`「PA-24 (§4.3): a round continued after a switched one …」。Molis 的「从断点继续」是同一会话里的新一轮：Coding 的 `coding.continuation` 只起草任务与意图，模型是人当时选的，开跑时按现行设置解析（`plugins/native/coding/src/start-round.ts`）。用例：第一轮从 small 换到 large 并结束；马上在同一个活着的会话里再开一轮，选 small，就是 small、small 的端点和密钥，`model_switch` 为空；关掉适配器，把 small 挪到新端点、换一把新密钥、删掉 large，重开后再开一轮，用的是新端点和新密钥，会话历史还在；再选 large，在发出前拒绝（适配器的原话「还没有配置可用的模型」），零请求，也不多出一轮。

PA-12 仍未完成：写后诊断（第 9 项，A2）与 Alchemist 的结构化生成（第 11 项，A3）都还没有实现。另记：`prologue-frozen.ts` 的 `throw new Error("思考力度只能是快速、平衡或深入")` 是普通 Error，归错误模型 W3-02-G。

## 6. 进度、证据等级与待定项

当前 A0 已转入执行：SDK `c4b9fde3` 与完整 S1 已在独立树组合，保留工具回执微压缩保护和补充读到回执；不带问询字段。Molis 只提取 A0 源码/测试，保持主线 Chrome testkit。新的明确实现边界：S1 steer 返回值在 Host 适配器内等待后丢弃，现行 Molis void 接口不变；typed 输入接入仍归后续线。新增 PA-23 生产入口拒绝/重开用例；对应测试路径纳入 §5.5 范围。

### 6.0 A0 收口记录（2026-10-12，当前状态）

**一句话**：A0 在 `origin/main` 上工程通过；SDK 是从 Prologue main 上的具名合并提交 `55b0c85a`（PR #4，2026-10-12T06:34:51Z）打出的合成包（`dirty:false`），所以输入回执 D7 的「正式 SDK 来源」已满足；「Molis 默认路径验证」工程部分通过、浏览器部分未完成；「采用线合入 Molis main」未做。三级证据分开记，下文只写实际跑过的命令。

#### SDK 来源（§3.2 的整合记录）

唯一整合分支：Prologue `feature/handoff-molis-a0-s1`（本机整合树 `prologue-wt/sdk-integration`），整理后的提交线（基点 `4f7110fe`）：

| 提交 | 内容 |
| --- | --- |
| `c4b9fde3` | 微压缩只收能再读的观察、独占写主人清遗留写声明、让出续跑可交 App（原样） |
| `4acfb445` | 输入回执第一刀 S1（原 WIP `820eeca9` 的代码，只整理了提交说明与交接文字） |
| `edb8ec86` | 并入上游 main `69ccfa94`（符号链接 cwd 越根、非终态导入），零冲突 |
| `8db0d7d6` | 并入 `a06ae62e` 带类型的问卷；唯一冲突是 public-surface 快照，重新生成 |
| `a13bf067` | 合成后的复验记录（只改 `docs/slices`）；PR #4 的 head |
| `55b0c85a` | PR #4 合入上游 main 的合并提交（父 `69ccfa94`、`a13bf067`），树与 `a13bf067` 相同 |

取舍：问卷字段与 A0 合成一个包而不是等 A0 收口之后再出第二个。收益是一次上游合入、一次 Molis 全量回归、跨插件 AI 线同时拿到问卷；代价是 A0 的回退点要多记一个——需要只带 A0 时可退到 `edb8ec86`（SDK 全量也跑过）。S2 持久队列（receipts 线 `a807c2cc`，基于 `edb8ec86`）不在本包，等本包上游合入后作为下一个整合包，因为它改变续聊历史里未读补充的入模方式，需要 Molis 侧单独验证。

包：`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-adoption-receipts-fields.tgz`，1,076,425 字节，SHA-256 `646afefbd4225bfe8bf50892403962fa3e12711f1c45035cfb739e3b9bc8d34f`，`source.commit` = `55b0c85a`（上游 main 的合并提交，`mergedUpstream` 记 PR #4、head、合并时间），`dirty:false`，无补丁；从 `8db0d7d6`、`a13bf067`、`55b0c85a` 三份 `git archive` 各打一次，逐字节相同。旧 dirty 候选 `prologue-sdk-a0-s1.tgz` 已删，记在 `patch-history.json`（git blob `0c421991`）。`vendored-provenance` 门禁通过（0 问题）；没有改门禁、没有放宽 `dirty` 检查。

#### 工程证据（第一级）

| 范围 | 命令与结果 |
| --- | --- |
| SDK | 两份 `tsc`、`pnpm --filter @prologue/sdk build` 通过；`vitest run --maxWorkers=4` 全量：合入问卷前 3659 通过 / 1 文件失败（`host-storage-full.live` 的 `afterAll` 弹 ram disk 超时，单独复跑 2/2）；合入后 330 个文件 323 通过 / 6 跳过，3670 条通过 / 21 跳过 / 1 条失败（`agent-budget.live` 墙钟用例在 4 并发下时序，单独复跑 3/3）。§5.5 第 1 步的三项回归与 `packaged-consumer` 在其中 |
| 包消费者 | 干净归档打出的包装进只有 `package.json` 的空目录（`pnpm install --offline --ignore-scripts`），只经 `@prologue/sdk` 公开入口：S1-10 消费者通过；问卷校验（有效答案零问题，坏日期 / 非整数 / 对象种类不在名单各报原因）通过 |
| Molis 安装与构建 | `pnpm install --frozen-lockfile --offline`（锁文件只换 SDK 路径与 integrity）；整体 `pnpm build` 退出 0（约 2 分钟） |
| Molis 定向 | §7 的 16 个文件加 `agent-host*`、`host-inference-completion`、`prologue-inference-native`，共 24 个文件 217 项全过（默认包路径，非源码映射） |
| 安全与合同 | `pnpm test:security` 145 项 144 通过 / 1 跳过（需真实 npm registry 的用例）/ 0 失败；`pnpm test:contracts` 430 项首轮 3 项 `action-before-effect` 的 `form:` 用例 15 秒超时（同批并发负载），该文件单独连跑两次 20/20 通过 |
| 门禁 | `check-health-gates.mjs --base origin/main` 通过（公开 API 只变 agent-host 合同：`grants`、`turn_changes`、`sleeping_until`）；`check-package-boundaries.mjs` `errors: []`；`page-assets.mjs --base origin/main` 见下 |
| 部分全量（`c5ddde8e`） | `node scripts/run-tests.mjs` 全量从 2026-10-12 07:36Z 跑到 10:46Z，**按用户决定停止，改为批量全量**（不是跑完：日志计数 4204 个 ✔、21 个 ✖、15 个跳过，未跑到的文件没有结果）。树是 `c5ddde8e`（A0 加 main `032a5d00`，`pnpm build` 退出 0），机器负载 4–11。21 个 ✖ 归 19 个文件，逐个单独复跑并和干净基线（`032a5d00`，同样 `pnpm build`）比对，见下「失败定性」 |
| vendor 记录 | 用户 2026-10-12 确认删除 `side-panel-memory.patch`（`dependencies-and-sdk-plan.md` §4.2）：已删，登记为 `patch-history.json` 的第 26 份（225,092 字节、SHA-256 `1f64a15c…`、git blob `97328ddc`、基线 `af7375c7`、来源 `9fc3b173`；重新施加到基线，`packages/sdk` 与 `9fc3b173` 逐文件相同），它产出的 side-panel-memory 包随它记在 `package` 里。`tests/vendor-provenance.test.ts` 78/78 通过（断言的数字随记录改为 26 份 / 2,791,897 字节 / 10 个无补丁包，没有删除或放宽任何一条） |

#### 失败定性（部分全量里的 21 个 ✖）

| 类 | 文件与结果 | 定性 |
| --- | --- | --- |
| 非浏览器，9 个文件 | `alchemist-mcp`、`form-mcp`、`home-mcp-actions`、`inbox-automatic-scenes`、`installed-plugin-host`、`lingguang-mcp`、`pages-mcp`（stdio MCP / 跨进程用例 30–90 秒超时，或 `ECONNRESET`）和 `jelly-native-material`、`material-extraction`（本机 Swift 助手不可用：`/.build: Read-only file system`、`native helper unavailable on this dev machine`）。我的树单独复跑：43 项 32 通过 / 5 个失败文件（11 个 ✖ 行），**干净基线 `032a5d00` 同样的 43 项、同样的失败集合，差集为空** | **预先存在 / 环境问题，非 A0、非 SDK 引起**；未修，也不属于本线 |
| 浏览器，10 个文件 | `agent-action-selection`、`artifact-clipboard`、`assistant-dock-ime`、`dense-workspace`、`feed-capture`、`goals-document`、`goals-narrow-navigation`、`goals-planning`、`immersive-directory`、`inbox-current`。我的树单独复跑（负载 4）：16 项 9 通过 / 7 失败（`agent-action-selection`、`feed-capture`、`immersive-directory`、`inbox-current`、`goals-narrow-navigation`、`goals-document`、`assistant-dock-ime` 各一项）；**干净基线 `032a5d00` 同样 16 项 7 通过 / 9 失败，我的 7 个失败全在基线上也失败，只在我这边失败的为空**（基线多失败 `dense-workspace`、`artifact-clipboard` 两项，是偶发）；`goals-planning` 在我的树上单独跑通过 | **预先存在 / 环境问题，非 A0、非 SDK 引起**；未修，也不属于本线 |

此前 17 个受影响 e2e 的两轮：首轮 30/43、重跑 13/17，失败全是 `CDP timeout` / `Navigation did not finish`（负载 50–66 时跑的），其中 `coding-timeline`、`coding-taskboard`、`issue-assistant-repair-page` 通过；浏览器类 21 个 ✖ 里没有一个是只在 A0 树上才失败的。**结论：部分全量跑到的那一半里，没有 A0 或 SDK 引起的失败；全量没有跑完，不能代替批量全量。**

合入 main 后冒出的页面资源超预算已就地解决，没有放宽：Coding 客户端（以 `coding/diff/files/git/text-stats.js` 五个名字发出）A0 版比预算多 5,002 字节，两张样式表多 944 / 1,366 字节。做法：三处注入浏览器的函数（`createCodingTimeline`、`codingTimelineWords`、`createCodingTurnChanges`）里的注释移到模块头（函数体每个字节都发给每个页面）；工具种类表改成元组再展开；写入行复用现有行与运行卡样式，`timeline-styles.ts` 删除、`styles.ts` 与 main 逐字节相同；命令扩权说明复用 `agent-review-concurrent`。行为与断言文字不变。预算用 `page-assets.mjs --update --base origin/main` 降了 12 字节，样式表回到 main 的数字。

#### 第二级：真实产品实操

- 浏览器用例：`coding-timeline.e2e`（时间线状态与收尾）、`coding-taskboard.e2e` 3 项、`issue-assistant-repair-page.e2e` 等受影响文件通过；其余失败按上表和干净基线比对为预先存在。这是自动化浏览器用例，不等于临时 Home 里的人工实操。
- 真实模型：本机没有 Key，未跑。回环对端是本地脚本服务，不是外部模型。
- 临时 Home 里的 Coding 时间线与扩权审查卡人工实操：未做。

#### 第三级：用户本人验收

未做。

#### PA-22 / PA-23 当前判定

| 编号 | 判定 | 依据 / 缺口 |
| --- | --- | --- |
| PA-22 | **工程通过，实操与验收未做** | 显式预算优先（`model-thinking`、`agent-budget-prologue`）、修改回执不被压成可重做观察（SDK `context-micro-compaction` + `prologue-stream`）、独占重开成功与非独占拒绝（`host-storage-concurrency.live` + `prologue-storage-claims`）、撤权 / 取消零派出零迟到写（`action-before-effect`、`prologue-start-refusal`）、状态与审查展示（`agent-review-surface`、`prologue-status-projection`）均在默认包路径上通过；干净包消费者通过。缺：浏览器时间线展示、真实模型 |
| PA-23 | **工程通过，实操与验收未做** | `prologue-adoption-guard` 在真实回环 HTTP + 生产 Node Adapter 上：yield 在派出前拒绝、零孩子、无审批、只有原父 Run、落盘重开无模型调用 / 自动接续；没有复活已删 CLI adapter / Runtime 路径（边界检查器 `errors: []`，健康门禁通过）。缺：临时 Home 实际启动与 Coding 时间线操作 |

#### 第二个包与决策记录（2026-10-12）

第二个包 `prologue-sdk-0.0.0-rc.1-adoption-receipts-handling.tgz`（输入回执第二、三刀：会话级持久排队、`acknowledge-inputs` 与有界提醒）：Prologue PR #5 已合入 main（合并提交 `f5ef12e6`），包从该提交打出，与 PR head `87e063e8` 打出的逐字节相同（SHA-256 `c474ee43…`）。Molis 侧换包是叠在 #408 上的单独 PR #442。默认路径检查：`pnpm build`；采用定向 24 个文件 218/218；`test:security` 164/165（1 跳过）；`test:contracts` 520/520；`affected-tests` 选出的 90 个文件 1196 通过 / 4 失败（3 项 `action-before-effect` 15 秒超时，单独连跑两次 20/20；1 项 Swift 助手本机不可用，基线同样）；`vendor-provenance` 78/78。未跑：全量、浏览器、真实 Provider。

按「技术决策按防腐后果、功能决策选体验最好」的规则，本线自己定了这些，不需要用户拍板；收益与取舍如下：

| 决定 | 理由 | 取舍 / 后果 |
| --- | --- | --- |
| 问卷字段与 A0 合进同一个包（PR #4），S2、S3 作为第二个包（PR #5） | 一次上游合入、一次 Molis 验证；S2、S3 改变续聊历史里未读补充的入模方式，需要 Molis 单独验证，不拖慢 A0 | 回退点多记一个：只要 A0 时可退到 `edb8ec86`；vendored 目录始终一份当前包 |
| `acknowledge-inputs` 在助理面板里不显示（`presentActivity` 里与 `reasoning`、`context-remaining` 并列的一行） | `assistant-tool-words` 要求每个受守护的工具在面板里用人话显示或不显示；没有任何 Molis 角色被给到这个工具，面板里出现裸工具名比不出现更差；措辞是产品决定 | 输入回执线接 S3 时再定显示位置与措辞（统筹已认可）；不增加 Coding 时间线词表（页面资源预算只许变小） |
| 产品子集清单去掉 `test:security` 已覆盖的三个文件 | 主线新增的计划测试规定子集不重复阻塞作业已跑的文件 | 没有少跑：三个文件仍在 `test:security`（阻塞作业）里 |
| 页面资源超预算靠减少注入函数里的注释和重复，不放宽预算 | 预算只许变小 | 注入函数的说明移到模块头；预算降了 12 字节 |
| 全量回归改成批量（用户决定）：部分全量 21 个失败逐个和干净基线比对，都是预先存在 | 用户要优先开发，全量攒一批跑 | #408 要等集成分支的批量全量通过才合 |

#### P2 SDK 实现进度（2026-10-13）

P1 合同（§4.6.9）冻结后，P2 按切片在 Prologue 一刀一刀实现，每一刀过 SDK 全量和干净包消费者检查；Molis 的包只在 P2 全部合入后换一次（需要时再核一次 Molis 默认路径）。

| 刀 | 内容 | 状态 |
| --- | --- | --- |
| P2a | `InputRef`、节点 `origins`、`report.inputs`（只有字段） | 已合 Prologue main（PR #7，`2621ae91`） |
| P2b | 执行代次、有界尝试、`waiting` / `needs-reconciliation`、重试、`attemptOf(run)` 与 `scope` 代次检查（存储层） | 已合 Prologue main（PR #8，`7f318494`） |
| P2c | `startAgentRun({ collaboration })` 运行绑定（准入核对、开尝试、Run 绑定、终态收场）、绑定的跑每次改图带代次；`RunBinding` 经 `SystemToolInput.collaboration()` 交给板工具和 `acknowledge-inputs` 执行体 | 已写完，SDK 分支 `feature/p2c-binding`（`3ef2aa15`）；全量与消费者检查进行中；按用户 2026-10-13 的决定先不开 PR |
| P2d | 翻开门禁（无绑定的跑里板工具与 `dispatch-subagent` 不进名单、直调 `TASKBOARD_NOT_BOUND`）并重做派出（节点点名与自动建子节点、删 `claims`、子会话绑自己的节点）；走旧路径的用例改成带绑定 | 未开始 |
| P2e–P2h | 派出四步与 `admitDispatch`、恢复；信封 `scope` 与受限通信；等待（条件组、四态观察、`board-wait`）；外部检查器与接续记录 | 未开始 |

本轮核对并改了合同的一处（决策 T7）：P1 初稿假定待答问题能「稍后」重开并由只读口跟着新问题走；SDK 里只有副作用审批有 `later`，且旧引用上没有指向新问题的链接。改成：`pending` 等待条件只接待答问题类，审批不是等待条件。这也回答了回执线 S4 的 I15（不影响 S4）。P2c 同批记录了 T8（绑定要求节点 `ready` / `running` / `waiting` 且负责人是这个会话或这一跑的角色）和 T9（一个开始键只开一次尝试）。

用户 2026-10-13 的决定：各线只在各自的交接 PR 里提交，不单开 PR（有防腐线在改代码质量和架构，单开 PR 容易冲出架构问题）。Molis 侧据此把 #442（第二个包，叠在 #408 上）快进并入 #408 的分支（`4e426f4c`）；Prologue 侧的 P2c 之后是否单独开 PR 由统筹向用户确认，确认之前只推分支。

#### 防腐复查记录（对 #408 自己的 diff，清单见协调板旁的 ANTI-CORRUPTION-REVIEW.md）

| 日期 · 对照 | 范围 | 结论 |
| --- | --- | --- |
| 2026-10-13 · merge-base `aadeef76`（main 末端 `e4ec01bd`，尚未合入） | 清单 §2 不需要构建的项（M2 `check-health-gates --base origin/main`、M4 `api:update`、M7 Biome、M8 页面事件、M9 翻译、M10 测试进程双份、M15 密钥、vendored-provenance）和 §3 人工项，只看 #408 自己的 diff | **通过，一处已修，两处暂缓（等防腐线的片）。** 构建类（M1 边界、M5 动作快照、M6 页面资源、M13 受影响用例、M14 安全）等把最新 main 合进来之后再跑，结果另起一行。 |

- **已修（§3-1/§2 M7）**：`prologue-stream.ts` 里新写的三处 `as unknown as`（`memory-recalled`、`todo-changed`、`circuit-tripped` 三个事件）改成事件联合里的有类型成员 + `Extract<PrologueEvent, …>`，Biome 对该文件无诊断，`tests/prologue-stream.test.ts` 28/28。
- **通过**：新增行里没有兼容/迁移/回填标记（只有协议名 `anthropic-compatible`）、没有 typed 宿主能力、没有 SQL、没有旧名、没有新 `CustomEvent`、没有裸 `fetch`、没有 `biome-ignore`；巨大单元只变小或没变大（`prologue-node.ts` 1759→1550、合同 `agent-host.ts` 1732→1638，`prologue-stream.ts` 588→697 仍在 800 行以下）；`vendor/prologue-sdk/` 只有一份 tgz，来源记录与包相符（`vendored-provenance` 退出 0）；没有碰 `limits.json`、`biome.jsonc`、门禁脚本与例外文件；`baseline.json`、`page-assets.json` 是重新生成且数字只降；`packages/contracts/src/services/agent-host-memory.ts` 只被 `agent-host` 合同再导出，不是新的发布子路径（没有新快照文件，`api:update` 无变化）。
- **公共 API 变化（PR 描述要写的影响）**：`contracts/services/agent-host` 只多可选字段和两个类型——`AgentCommandReviewDocument.grants?`、`AgentRunView.turn_changes?` / `sleeping_until?`、新类型 `AgentCommandGrants`、`AgentTurnChanges`。读 `AgentRunView` 的调用方不认识这些字段时忽略即可，没有字段被改名或收紧。
- **暂缓 1（§3-14 错误模型，等 W3-02 G）**：`horizontal/agent-host` 的适配器里抛给用户看的错误是 `throw new Error("<中文>")`，新增的一处（`prologue-node.ts` 命令授权不可读）沿用了这个文件里几十处同样的写法；其余几处是从 `prologue-node.ts` 原样搬到 `prologue-credentials.ts` / `prologue-methods.ts` 的。没有新增 `extends Error` 子类，也没有新的错误码字符串，所以门禁数字不变。这一类要等防腐线 W3-02 的 G 系列统一成 `defineErrorCodes`，本线不抢先改。
- **暂缓 2（§3-20 界面文字，等 W5-03）**：Coding 客户端、`agent-review-surface.ts`、`timeline-words.ts` 里新增的中文界面文字，这几处现在没有翻译入口（整个文件都是中文直出），翻译门禁 0 缺英文通过；新文案集中在 `timeline-words.ts` 的词表里，W5-03 按主人词典搬时一并处理。

#### 没做的与风险

- D7 还差一项：采用线合入 Molis main（Molis 默认路径验证的工程部分和受影响的浏览器用例已过，部分全量里的失败已和干净基线比对为预先存在；批量全量尚未跑）（PR #408 由统筹按条件合并）。
- 全量回归：`affected-tests` 命中共享核心 + 4 个包。用户决定改成批量全量（统筹把 #408 和情境线 W1 的合同片合到一条集成分支跑一次），所以 #408 要等那一次全量通过才合；上面的部分全量只证明跑到的那一半没有 A0 引起的失败（浏览器部分待定性），不代替它。
- `c4b9fde3` 目前只在 Prologue 的特性分支上；`patch-history.json` 的上游说明已如实写明，并入后复核。

### 6.0a 对账与过渡包（2026-10-13 晚）

**做了什么**（提交在 #408 上，按时间）：

1. `f9769ce5` 先在 #408 自己的树上换包：`adoption-receipts-handling.tgz`（`f5ef12e6`）换成过渡包 `interim-p1-cu.tgz`（`08b84296`），来源与理由见 §3.2 与 vendor README。锁文件只手改 `@prologue/sdk` 的五行（`pnpm install` 不带 frozen 会删掉别的平台的可选包，约 900 行）。`vendor-provenance` 用例改成钉住过渡包的规则：推送的具名分支，两个父提交逐一点名。这是新规则的准确断言，不是放宽。
2. `7d49a99c` 合 main（`f2024d6b`，含 #471、#472、#474），26 个冲突，按「实现以 main 为准」解：
   - #472 带进 main 的 A0 代码与 #408 同源（`77fde104`、`da9ddd99`、`804384d8`、`5a4d6feb`），#408 只留 main 没有的三处：S1 补充回执在 `prologue-node.ts` 三处 await 后丢弃；S3 的 `acknowledge-inputs` 在助理面板 `presentActivity` 里隐藏；`prologue-stream.ts` 用三个联合成员代替三处 `as unknown as`。
   - 用例用 main 的正文加 #408 的 PA-22 编号；网关那条只留一份，git 的自动合并会留成两份。
   - main 的 `computer-use.tgz` 删除（过渡包以 `d4908c11` 为父）；`side-panel-memory` 包与补丁随合并删除；连同 `molis-adoption.tgz` 都记进 `patch-history.json`。`specs/README.md` 只留一行本线索引。
3. `9cabd35e` 修 main 上的一处红：#472 在 `schedule-task-runner.ts` 写了 `reject(signal.reason ?? new Error("到点执行已取消"))`。中止的信号一定带原因，这个兜底是死代码，却让 `feed-inbox-schedule-error-model` 在 main 上失败；去掉兜底。
4. `b4711259` 再合 main（`c33448f2`，#475、#482、#483 测试迁移），无冲突；`baseline.json` 按 `--update --base origin/main` 降（vendored SDK 2 → 1，`prologue-stream.ts` 的 `as unknown as` 3 → 0）。

**证据**（对账后的树，过渡包；工程级）：

- 整体 `pnpm build` 与 `pnpm workspace:build` 通过：过渡包与 main 的代码之间没有类型断裂。
- 门禁：`boundary:check` 无错；健康门禁对照 merge-base `c33448f2` 通过；`pnpm api:update`、`pnpm actions:update` 后快照没有任何变化；页面资源对照 merge-base 通过，不用改预算（页面代码全是 main 的）。
- 定向 45 个文件 441/441：
  - 默认路径 §7.10 的 19 个；
  - agent-host 必跑 6 个；
  - #472 带进 main 的 8 个（模型控制、助理交回与续做、变化等待、灵光、到点执行、资源缓存、跟进）；
  - #471 的 3 个（`computer-use-gaps`、`assistant-tool-words`、`assistant-attention`）；
  - 打包与安装 8 个（`vendor-provenance`、`ci-product-subset*`、`release-assets`、`npm-package`、`install`、`runtime-payload`、`uninstall`）；
  - `feed-inbox-schedule-error-model`。
- `pnpm test:security` 182 条 181 通过、0 失败（1 条跳过）；`pnpm test:contracts` 541/541。
- `affected-tests` 选出的其余 104 个单元文件：1443 条，1442 通过、0 失败、1 跳过。
- 浏览器一批 10/10：`coding-timeline`、`coding-model-controls`、`issue-assistant-repair-page`、`assistant-handback`、`assistant-follow-live`、`lingguang-plugin`。
- 全量：换包改了每条 Agent 路径下的运行时，属于 §5.4 的共享核心阶段（`affected-tests` 看不到 vendored 包，没有建议全量）。#411 合入后在 #408 的 `b1459770`（合 main `70c928ae`）上跑：`node scripts/run-tests.mjs`，约 112 分钟，6155 条，6143 通过、3 失败、9 跳过。3 条失败都在干净 main 上同样失败，与本线无关：`settings-requests-through-helper` 的 settings-assistant 一条（#471 在 `settings-assistant.ts` 直接 `fetch`）、`touch-targets.e2e` 的触屏窗口两条。#472 留下的 `feed-inbox-schedule-error-model` 在本线修过之后通过。之后再合 main `f47ee72c`（#476 文档、#484 测试迁移、#485 文档）：没有冲突，健康门禁通过；#484 改过的 30 个测试文件（19 个浏览器）在合并后的树上 135 条 133 通过、2 失败；失败的 `agent-action-selection.e2e` 与 `configured-text.e2e` 单独重跑 3/3 通过，判为同批浏览器负载下的时序。
- 真实产品实操：未做（没有人在隔离 Home 里走过对账后的树）。真实模型：未跑（本机无 Key）。用户验收：未做。

**D7 重新判定**（统筹，回执线生产接入的前置）：① 正式 SDK 来源，按用户 2026-10-13 的决定改为「推送的具名分支，父提交都在 Prologue main 上」，过渡包满足；② Molis 默认包路径验证在本次换包里做了（上面的证据）；③ #408 进 main：待合。三项都满足后由统筹通知回执线。

**PA-22** 在对账后的树上重判：通过（上面的默认路径用例）。**PA-23** 改述：SDK 的 `yield` 仍被拒（`subagentYieldGuard`，S-23，`prologue-adoption-guard` 用例通过）；main 上第 14 项的私有接续是已知的 X6 欠账，由 P4 的助理那一半还（§7.5）。

**防腐复查**：对本线 diff（merge-base `c33448f2`），机器项 M1、M2、M4、M5、M6、M14、M15 通过。人工项逐条看过：
- 不留兼容：vendored 只剩一份；没有读取兜底。
- 不新增 typed 能力。
- 巨大单元：`prologue-node.ts` 仍是 1551 行；`prologue-stream.ts` 747 行，其中 `applyPrologueEvent` 没动。
- 错误模型：去掉了一处裸 Error。
- 枢纽文件两边都留。
- 没有改门禁。

两处不归本线、已报统筹：
- `docs/system/SECURITY-INVARIANTS.md` 里「Computer Use 不在 main」一条已过时（Computer Use 线）；
- `specs/repository-anti-corruption/dependencies-and-sdk-plan.md` §4.3 需要记过渡包这个例外（防腐线）。

### 6.0b 现状核对（2026-10-14，当前接续入口）

对照原始需求（2026-10-02 评估的 23 项，要求「每项都有明确处理结果、核心路径内部完整」）与本文，按 Molis `origin/main` `393e8958` 与 Prologue main `b01067b4` 的真实代码和测试逐项核过。只读源码与用例，没有为这次核对重跑测试；「证据」列的用例是 main 上已有、在 §6.0a 的对账树或各 PR 上跑过的。三级证据照旧分开：下表所有项的真实产品实操与用户验收都是**未做**（本机无模型 Key，隔离 Home 里没人走过）。

| # | 项 | 结果 | 依据（main 上的位置、用例、PR） | 剩下的 / 去处 |
| --- | --- | --- | --- | --- |
| 1 | 思考覆盖输出预算 | 已实现 | `horizontal/agent-host/src/adapters/prologue-run-params.ts`：显式 `max_output_tokens` 优先，没给才用思考上限；`tests/model-thinking.test.ts`（PA-22）；#472 | — |
| 2 | 模型派出前授权 | 已实现，证据缺一处 | 灵光、Form、Dataset、PPT 的 `actions.ts` 都把 `caller.beforeEffect` 作为 `beforeDispatch` 交给 Host（`87cbaf85`）；`tests/action-before-effect.test.ts` 对 Form、Dataset、灵光、Pages、Cognia 各测撤权 / 停用 / 取消时 `dispatched === 0` 且库不变 | **PPT 不在这条用例的循环里**：评估点名的四条路径之一没有「零派出」的断言（代码有）。补一行用例，归 A5 |
| 3 | 新状态与事件 | 已实现（让出投影随 P3） | `prologue-stream.ts` 认 `sleeping`、`turn-changes`、`model-switched`，不再计入 `unknown_frames`；合同 `sleeping_until`、`turn_changes`、`model_switch`；`tests/prologue-stream.test.ts`（PA-24 新帧）| `completed{yielded}` 现在不会出现（`yield` 被拒，见 13）；P3 接通让出时投影成「在等」而不是「完成」 |
| 4 | 工具副作用分类 | 已实现 | `prologue-action-gateway.ts`：`suggest`、委派 start/follow/stop、记忆 remember/forget/propose 都是 `mutate-external`；`prologue-action-tools.ts` 只在 `operation=query` 且 `actionEffect=read` 时给 `safe-read`；`tests/assistant-business-gateway.test.ts`、`tests/agent-action-tools-prologue.test.ts`（PA-22） | — |
| 5 | 修改回执与微压缩 | 已实现（Molis 侧只有间接证据） | SDK `agent/core/loop-tools.ts` 由工具登记的 `effectKind` 推出 `rereadable`，只有 `safe-read` 能被换成「需要就再调」，`rereadable: false` 的不收（`c4b9fde3`，在过渡包里）；配合第 4 项，Molis 改东西的工具回执都不收；SDK `context-micro-compaction` 用例 | **文中 §6.0 写「`prologue-stream` 证明修改回执不被压」不准**：`tests/prologue-stream.test.ts` 不测压缩。Molis 侧没有「真实网关 + 压缩后的请求里回执还在」的用例；A5 补一条请求级断言 |
| 6 | 推理力度 | 已实现 | `prologue-frozen.ts` 每轮冻结、不支持就发出前拒绝；`tests/prologue-model-controls.test.ts`、`tests/coding-model-controls.e2e.test.ts`（PA-24）；#472、#491 | — |
| 7 | 运行中换模型 | 部分 | `prologue-model-switch.ts`；拒绝分支（提示缓存跨格式、目标没标力度、模型不可用、思考切到无思考）、停止时零请求、冷读都有用例（#491） | §5.6a 缺口 3（申请换模型后撤权）：更正——SDK 的同步 `beforeAccept` 早由 #523 在 `prologue-run.ts` 接好（W2-18-MODEL-SWITCH-01/02），不是 P3 才接；接受之后的撤权与缺口 6（从断点继续后重新解析模型与凭据）由 P3b 补了用例（§5.6a 末尾）；视觉、Runtime 不支持切换两个分支无用例（造不出来，见 §5.6a） |
| 8 | 逐轮变更 | 已实现 | `prologue-stream.ts` 的 `turn-changes` 投影、重放不重复；Coding `turn-changes-client.ts`；`tests/coding-timeline.e2e.test.ts`（PA-24） | — |
| 9 | 写后诊断 | **未做** | main 上没有按文件的检查器接入（`diagnose` 只出现在 Coding 方法名与开发者诊断页） | A2：检查器输入 / 输出与用例先写进本文，再实现 |
| 10 | 文字增量、停止与错误 | 已实现 | 灵光 `client.ts` 的 `?stream=1` 逐行读、`reply-stream.ts`；阶段名已从宿主挪回插件（采用合同闭环）；`tests/lingguang-plugin.e2e.test.ts` 的「边写边出、Stop 不保存、字留在框里」 | — |
| 11 | 结构化生成 | **未做** | `apps/local-host/src/alchemist-prologue.ts` 仍把 JSON Schema 写进提示词再解码；共享端口的 `structured` 没有 Alchemist 调用方 | A3 的结构化一半 |
| 12 | 变化等待 | 已实现（协作视图的版本随 P3） | 助理 `assistant/assistant-wait.ts` + 工作台 `assistant-follow.ts` 的长请求（取代 1.2 秒轮询）；Schedule 用 `adapter.observe`（`schedule-task-runner.ts`）；`tests/assistant-work-wait.test.ts`、`tests/schedule-task-runner.test.ts` | 等待 / 接续进 `runViewVersion` 随 P3 |
| 13 | Coding 子代理让出与续做 | 部分：按 A0 边界拒绝 | `prologue-subagents.ts` 的 `subagentYieldGuard` 在派出前拒绝 `yield`；`tests/prologue-adoption-guard.test.ts`（PA-23、S-23）。SDK 正式路径（P2i：让出 = 派出 + 这一步等孩子那一步 + 收工，接续经 App 起跑）已在 Prologue main | **P3**：`collaborationHost.startContinuation`、删 `subagentYieldGuard`、PA-08 / PA-11 接替 PA-23 的证明 |
| 14 | 助理委派交回与续做 | 部分：私有实现在 main（X6 欠账） | `apps/local-host/src/assistant/assistant-delegation.ts` 的 `handed_back_run` / `hand_back_held`、按结果键自启（#472）；`tests/assistant-delegation-handback.test.ts` 等五个用例 | **P4 助理那一半**（W5-10 形状），清单见 §7.5 第 5 条；P3 先给协作口与接续 |
| 15 | 休眠 | 投影已实现；工具暂不开放 | 投影见第 3 项；各角色的 `host_tools` 是显式名单（`plugins/native/coding/src/roles.ts`、助理角色），都不含 `sleep` | 暂缓，依据：短等待已有 `await-commands` / `command-output`，跨重启与未来时刻的跟进走 Schedule 与跟进；没有哪个角色要在同一 Run 里睡。有具体场景再按 §4.7 开 |
| 16 | 会话条目 | 未做，归回执线 | main 上没有 `session.appendEntry` 的调用方 | 回执线「会话条目端口」，W4-06 之后接；本线只在 P3 提供 Board 引用 |
| 17 | 记忆边界 | 已实现（SDK 自动生效） | `tests/prologue-memory-boundary.test.ts`（S-13） | — |
| 18 | 写前密钥扫描 | 已实现 | `plugins/native/coding/src/timeline-words.ts` 把 `WORKSPACE_SECRET_DETECTED` 写成「没有写入」的人话；`tests/coding-timeline.e2e.test.ts` | — |
| 19 | 副本血缘 | 暂缓 | main 上没有 `copyOf` 调用方 | 依据 §4.7：不是统一协作的完成条件，不新增入口；Coding 隔离工作区若要解释来源再开 |
| 20 | 租约排队 | 暂缓 | 没有用 SDK 的租约排队 | 依据 §4.7：没有找到「短暂锁竞争导致失败」的入口；内容冲突仍靠版本检查 |
| 21 | 企业网络（Host 代理与 CA） | 暂缓 | 没有接 Node Host 的代理 / 额外 CA 设置；`node-model-dns.ts` 只在有代理环境变量时改走 HTTPS 解析名字，不是这项 | 依据 §4.7：没有企业网络需求与验收环境 |
| 22 | 审计导出 | 暂缓 | 没有用 SDK 的审计 exporter | 依据 §4.7：没有排障需求；开发者诊断页读 Runtime 自己的回执 |
| 23 | 点名扩权 | 已实现 | `horizontal/agent-host/src/reviews.ts` 与审查卡如实显示 `grants`、含扩权的不给「记住」；`tests/agent-review-surface.test.ts`、`tests/agent-review-standing.test.ts`（S-22） | — |
| 24 | TaskBoard 统一协作 | 部分：SDK 完成，Molis 未接 | P1 合同（Prologue #6，§4.6.9）；P2a–P2j 在 Prologue main（#7–#22，证据在合同的「P2 进度」）；合入后补跑见下 | **P3–P6** |
| 25 | 外部条件等待 | 部分：SDK 完成，Molis 未接 | P2j：`conditionCheckers`、`config.waits.external`、队列道 `prologue:wait-check`、零模型计数（`taskboard-external-checks*`） | **P3** 建 `prologue-checkers.ts`（`molis.action-query`、`molis.file-present`）；**P4** 迁助理 `watchJob` / `checkJob` |
| — | 存储写声明 | 已实现 | `tests/prologue-storage-claims.test.ts`、SDK `host-storage-concurrency.live` | — |
| — | 墙钟预算 | 已实现 | `tests/agent-budget-prologue.test.ts` | — |

**文中写了完成、但和代码或证据不符的地方**（本节之前的段落不改写，以这里为准）：

1. 开头状态句与 §7.1、§7.4、§7.5 写「P2h 在做、P2i 未开始、#408 待合」。实际：P2h（#19）、P2i（#21）、P2j（#22）与换模型验收复查（#24）都在 Prologue main；#408 于 2026-10-14 01:35Z、#491 于 05:51Z 合进 Molis main。状态句已改。
2. §6.0 与 §6.0a 把「修改回执不被压成可重做观察」的证据记成 `context-micro-compaction` + `prologue-stream`；后者不测压缩。实现是对的（第 5 项），Molis 侧的请求级证据是缺的。
3. §2 第 2 项写「核对 Host 侧转发与撤权零派出的测试证据」；PPT 没有这条证据（第 2 项）。
4. §0.2 第 13 项与 §4.6.6 提到 Coding 的 `yield-wait.ts`、`round-report.ts`：main 上没有这两个文件（10-13 已作废的在途改动）。P4 要退出的是 Coding 的 `waits.ts` 与 `last-start:*` / `wake-note:*` 存储（§4.6.9）。
5. §5.6a 缺口 3 原写「没有用例」；现在 SDK 一侧已有 `beforeAccept`，缺的是 Molis 接线，放进 P3。（2026-10-15 更正：接线早由 #523 做了，缺的只是「接受之后撤权」的用例，P3b 补上，见 §5.6a 末尾。）
6. §3.1 表里的 `onYieldSettled`、`SubagentRequest.yield`、`SubagentWake` 在 P2i 已从 SDK 删掉；P3 的 Molis 一侧不能再引用它们。

**Prologue main 合入后的补跑**（§7.4 第 3 条、合同 P2i / P2j「验证」行）：对 `b01067b4`（P2j 之后又合了 #24）跑 `prologue-verify.sh`（build dist → `tsc` → SDK 全量，两个 worker，不跑 `desktop-computer-use.live` → 干净 `git archive` 打包 → 空目录跑全部 `*-consumer.mjs` → 对 P2h 的包再跑一遍）。P2h 的包取自 P2h 合并前的验证目录（`4416fc09` 打出，1,163,878 字节，SHA-256 `7e728f4a…`；与 #19 的 head `0bfb0e47` 比，`packages/sdk/src` 与 `package.json` 没有差别）。结果记在合同的 P2i、P2j「验证」行，经 Prologue docs PR 进 main。

### 6.0c 暂停点（2026-10-14，用户让需求线先停、防腐线先走）

统筹 2026-10-14 转达用户：当前任务做完后，需求线先暂停，整台机器让给防腐线。采用线停在下面这个位置。

**决定（都已记进本文）**：
- 用户选 B：同一项目的编码会话共用项目工作板。原题、三个选项和对 X5 的影响见 §4.6.10 末尾。
- 统筹批准 P2k「按节点判冲突」（理由：在 SDK 源头修，不在 Molis 里另造一套语义；只开一个会话时也有这个缺陷）。
- 助理仍是每个 Work 一块板，到 P4 再看。

**已完成、已验证**：
- 现状核对 §6.0b：Molis PR #500，已合 main（`59d02a37`）。
- P2k 的实现与定向证据：Prologue 分支 `feature/p2k-node-conflicts`，head `46bc586d`，叠在 main `b01067b4` 上。
  - 新用例 `taskboard-node-conflicts`：内存 9 条、真实 Node Host 1 条，全过。
  - 5 个变异各自让用例变红，还原后文件逐字节相同。
  - 改了一条预期变化的旧断言（`taskboard-waits` 的「同一张板一次只改一处」）。
  - 合同改了三处：新加「板的写法：按节点判冲突（P2k）」一节；P2 进度里加 P2k 一条；决策记录的 X5 一行写明用户选 B。

**没验证的**：
- Prologue main `b01067b4` 合入后的补跑：一直排在构建锁后面，暂停时按要求撤掉，一次都没跑。
- P2k 的 SDK 全量（要先 build dist）和干净包消费者检查：没跑。
  - 在没构建 dist 的工作树上，相关非 live 用例 412 条里有 5 条失败，全是读 `packages/sdk/dist` 的跨进程用例。
  - 草稿 PR molis-ai/prologue#25 已经开了（暂停通知之前开的），验证一节写的是「待补」，不要合。
- P3a：远端分支 `adoption/p3-collaboration`，标 WIP。
  - 底是 #498 的 head `02e6720a`，再并了 main `59d02a37`。
  - 没换包、没编译、没跑任何用例，也没量门禁。

**P3a 已写的（按 B）**：
- 新合同子路径 `services/agent-collaboration`：视图类型，加 read、control 两个动作。
- 旧 `agent.waits.*` 换成一个 typed 等待 `agent.collaboration.await.v1`（Action 不能是等待）。
- `prologue-collaboration.ts`：会话在项目工作板上的那一块、绑定规则、`admitDispatch`。
- `prologue-plan-steps.ts`：计划步骤带前缀放在会话那一块下面，视图还原成 `step-N`，计划的版本按它自己的步骤算，人的修订也在这里。`prologue-taskboard.ts` 只剩接缝，原来的巨大函数拆到阈值以下。
- `prologue-waits.ts` 改写到 `HeldWait` 上，人排队改成 app 的 `arm`。
- 删 `subagentYieldGuard`。
- 发信钩子只留三件事：说清不能发的、展开「范围重叠的会话」、群发上限。
- 优先提醒改由宿主直接告诉正在跑的那几轮。
- Coding 的叫醒循环搬到 `wake-loop.ts`（`routes.ts` 1522 → 1454 行），状态词表补了两种新状态。
- 改写的用例：`coding-message-wait`、`coding-queued-round`、`coding-delegation-waits`、`coding-cooperation-http`、`coding-step-claims`（只改了 `claims` → `node`）、`prologue-adoption-guard`（S-23 改述）、`vendor-provenance`（期待的提交号还是 `b01067b4`，换包时改成实际的那一个）。

**恢复时按这个顺序**：
1. **补跑 Prologue main `b01067b4`**（构建锁下，`~/code/prologue-p2j` 已停在 detached `b01067b4`）。
   - 命令：`zsh coordination/2026-10-14/tools/prologue-verify.sh ~/code/prologue-p2j main-b01067b4 <P2h 的包>`。
   - P2h 的包：另一会话 scratchpad 里的 `prologue-verify/p2h-3/prologue-sdk-0.0.0-rc.1.tgz`，1,163,878 字节，SHA-256 `7e728f4a…`，由 `4416fc09` 打出，与 #19 的 head 相比 src 相同。找不到就省略第三个参数，并写明。
   - 结果补进合同 P2i、P2j 的「验证」行。
2. **P2k 验证**：在 `~/code/prologue-p2k` 跑同一个脚本，第三个参数用第 1 步打出的包，新加的消费者脚本在那个包上应当失败。
   - 公开面快照若变了，逐项核过再 `-u`。
   - 结果写进 #25 的「验证」与合同的 P2k 进度条，转为 ready，发统筹合。
3. **P3a 按 B 继续**：
   1. #498 合入后变基到 main。
   2. 从 P2k 合入后的 main 打包换进 vendored 目录：删掉过渡包，记进 `patch-history.json`；`commitsChecked` 加上过渡包的提交与新包的提交；锁文件只改 `@prologue/sdk` 的路径和 integrity（依赖相同，都是 `@tauri-apps/api` 2.11.1）；`vendor-provenance` 用例的提交号、PR 号跟着改。
   3. 构建锁下 `pnpm build`，修编译错误。
   4. 跑 `affected-tests` 选出的用例和本文 §7.10 的默认路径清单，另外改到能过：`coding-collab-handoff`、`coding-session-messages`、`coding-background-wait`、`coding-step-claims`、`prologue-taskboard`、`prologue-subagents`、`coding-taskboard.e2e`。
   5. 加并发用例：两个会话同时汇报，都成功；同一步被别人改过的那一方得到明确的冲突。
   6. `pnpm api:update`、`pnpm actions:update`；`page-assets` 量两个新状态词（只许变小，超了就在同一个文件里省字节）；`check-health-gates --base`。
   7. 写验证证据，开 PR。
4. 之后是 P3b（换模型之后撤权与「从断点继续」的用例，见 §5.6a 末尾）、P3c（外部条件检查器），再往后 P4。

### 6.0d P3a 恢复记录（2026-10-15，当前接续入口）

统筹 2026-10-15 转达：防腐线 I8 第二个 PR（#523）已合入，P3a 恢复。要求五条：并 main、换包、按 B 做、同一个 PR 里做默认路径验证（共享核心要跑全量）、证据写进 PR 后由统筹放进合并队列。P3b、P3c 在 P3a 合入后各一个 PR。

**做了什么（分支 `adoption/p3-collaboration`）**：

1. **并 main**（`91f76ada`）：并的是 `f74e29d8`（#523）。冲突按 main 的现行形状解：W3-02 去掉的 `AgentHostError` 没有带回来，错误码走 `defineErrorCodes`。
2. **换包**（`addf8157`）：vendored 包从过渡包换成从 Prologue main `e5123369` 打的 `prologue-sdk-0.0.0-rc.1-collaboration.tgz`。
   - 大小 1,182,902 字节，SHA-256 `9f001ede…`。
   - 它含 P2a–P2k，还有 #27（撤销资源不逐块写墓碑）。
   - 打包脚本是 `prologue-verify.sh`：SDK 全量 3924 过、0 失败（没跑 `desktop-computer-use.live`），13 个消费者脚本都在这个包上过。
   - 旧包从目录里删掉，字节数、SHA-256、git blob 和来源提交记进 `patch-history.json`。
   - 另外两处同步改了：登记表 `scripts/workspace-packages.mjs` 里 agent-host 的包路径，和 `docs/system/SECURITY-INVARIANTS.md` 里 S-13 指向的当前包。
   - 编译修复：#27 新加的 `HostStorage.discard` 和 `remove`、`purge` 一样走副作用围栏；项目工作的状态表读得懂步骤的 `waiting`、`needs-reconciliation`。
3. **按 B 接项目工作板**（`8dc0cd72` 和本 PR 的后续提交）。结构：
   - 项目根 `project`；
   - 每个会话一块 `s-<会话>`；
   - 每份确认计划一个计划节点 `s-<会话>.p<n>`，步骤 `s-<会话>.p<n>.step-N` 挂在计划节点下面；
   - 项目工作项 `w-…`。

   并发用例是 `tests/prologue-project-board.test.ts`（PA-03，已加进 `tests/ci-product-subset.txt`）：
   - 两个会话同时开跑、同时读板，在一道栅栏后同时报告各自的 `step-1`，两边都落下；
   - 人在 TWO 的计划里插了一步之后，TWO 用旧版本报告 `step-2`，拿到明确的 `TASKBOARD_CONFLICT`（「changed after version N … read it again」），什么都没改；
   - ONE 报告 TWO 的步骤，拿到 `TASKBOARD_NOT_ASSIGNED`；
   - 另一个项目的会话读板、报告、发信都被拒绝，板和信箱都不变。

**在新路径上跑用例和门禁时找到、已修的缺陷**（`board_id` 那条是门禁找到的，最后一条是防腐复查对硬约束看出来的，其余都是用例先红，修完变绿）：

- 两个会话同时第一次开跑，会各建一张项目板：项目板的入场改成同一个 promise 共用。
- 根和会话的块被当成项目工作列出来：工作项改用 `w-` 前缀，只列它们。
- 收件人从没跑过一轮时，在板上还没有它那一块，SDK 找不到它的位置，信发不出去：发信前先给收件人放上那一块（`place`）。
- 会话的信件列表把宿主给正在跑的那一轮的 `inject` 也算成了信：只列 request、notice、reply、handoff。
- 发信拒绝的说法和「不能发给子任务」在改写时丢了：已恢复。
- 计划步骤直接挂在会话那一块下面时，A 交给 B 的那一步和 A 的块是兄弟，A 再给 B 写信时，B 在旁边有两步，SDK 以「不止一步相邻」拒绝：步骤改挂到计划节点下面，`coding-collab-handoff` 加了交接之后再写一封信的一轮。
- 等待结束、那一步留给人决定（失败、到期、要核对）时，人点「取消等待」什么也不发生，SDK 没有别的出口：宿主的 `cancel-wait` 把那一步交还，视图不再列它，Coding 对这种等待也调 control。
- `awaitReady` 一有变化就返回，哪怕没有可以接着做的接续：改成一直等到有一条、到时或被停。
- 读视图每个会话返回好几条：改成每个会话一条，是它还要紧的最近一条。
- 人不等了、直接开始排队的那一轮（开跑请求带 `queued_work_id`）时，等待还挂着，那边做完会再起一轮：开跑接过那一项时，宿主撤掉这条等待（`queueTakenOver`）。main 上原有这一步（旧 `waits.resume`），P3a 改写时漏了，`coding-project-work` 用例抓到。
- 合同里两个视图的字段 `board_id` 撞上旧名门禁（它指的是项目），改名 `graph_id`。
- 叫醒循环开跑被拒（撤权、调用被取消、插件停用）时，照样给人留一条「自动开始没有成功」。被拒的调用不写业务记录（AGENTS 硬约束）：改成不留言、不动接续、这个 activation 不再问，接续留给之后能开跑的 activation。`coding-queued-round` 加了撤权、取消两种拒绝，还有拒绝之后人「现在开始」照样用上留着的那次发送；去掉这处改动时，用例拿到那条留言而失败。

**用例跟着改的、属于预期变化的**：

- 派子任务要先过人的审查卡，`prologue-adoption-guard` 改成批准审查卡。
- 让出的孩子拿不到板工具，所以它那一步总是「back with you unfinished」，等待记为 failed；因为让出等到 settled，接续照样能走，用例按这个断言。
- 被接上的接续不再出现在视图里，`awaitReady` 返回空：这是合同。
- 正在跑的那一轮只在下一次工具结果里听到等待结束：夹具里被挡住的那一轮要调一个工具。
- W2-18-CODING-WAKE-01 改了场景：原来命令被重启截断、叫醒后告诉模型「中断了」；新包把截断的命令记为结果未知、那一步留给人核对（§4.6.4「被重启截断的……先核对，不自动重派」），Coding 只记一条给人的说明，不起跑。用例改成命令在插件停着时结束：等待结束的事实已落盘，SDK 重开、插件重新激活后，连续四次读失败之后照样只起一轮。
- `assistant-page-written.e2e` 的 W3-02-G4-ANSWER-01（full-suite 第 14 片抓到）：问卷答案交给模型的那条工具结果多了 `pending`。
  - 来源：Prologue `5b259a16`（输入回执第四刀，10-13），新包有、旧过渡包 `4007a93c` 没有。
  - 用途：让模型在 `acknowledge-inputs` 里用 `pending` 指向这个问题。
  - 判断是预期变化，不是泄漏：它就是页面已经显示的 `awaiting_input[].pending_id`（`pending.ref.id`），不是密钥，也不是只给宿主看的内部编号。Molis 读这条结果的地方（`assistant-service.ts` 只看 `kind`、`picked`）不受影响。
  - 用例改成同时断言 `pending` 等于页面答的那个 `pending_id`。断言比原来多一项，不是放宽。
- 旧的 `任务图：…。` 写法和不带前缀的步骤编号换成「本轮确认计划在项目任务图 … 上」与 `s-<会话>.p<n>.` 前缀：`prologue-step-amend`、`coding-runtime-regressions`、`coding-plan-dependencies`、`prologue-taskboard`。

**验证**（2026-10-15，并 main `9a883966`（#531）之后的树，本机 macOS）：

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 构建 | `pnpm build` | 通过 |
| 包边界 | `pnpm boundary:check` | 通过，`errors: []` |
| 门禁 | `node scripts/check-health-gates.mjs --base origin/main` | 通过，对照 merge-base `9a883966`；巨大单元、typed、显式 `any` 都比 merge-base 少，`--update` 已写 |
| 快照 | `pnpm api:update`、`pnpm actions:update` | 已重新生成并提交 |
| 页面资源 | `node scripts/gates/page-assets.mjs --base origin/main` | 通过 |
| 类型 | `tsc --noEmit -p tsconfig.json` | 通过 |
| 安全 | `pnpm test:security`（含 S-13 在新包上） | 54 个文件全过 |
| 密钥 | `pnpm secrets:check` | 没有（2353 行） |
| 选出的用例 | `node scripts/affected-tests.mjs` 选出的非浏览器文件，加 Coding、助理相关的，共 186 个（含只在 macOS 跑的 24 个） | 186 个全过（9.6 分钟）。并 main 之前那一轮 182 个里 `installed-plugin-host` 在负载下 30 秒超时、单独重跑 10 秒通过，这一轮在里面也过了：是时序，不是 P3a |
| 浏览器 | 选出的 12 个浏览器文件，含 `coding-taskboard.e2e` | 12 个全过 |
| 全量 | PR 加 `full-suite` 标签，CI 上 Linux 分片 | 见 PR |

**防腐复查**（清单 `coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md`，对本线 diff `f74e29d8..HEAD`）：

- 2026-10-15 · 合入的 main 先是 `f74e29d8`（#523），推送前又并了 `9a883966`（#531，和本线没有共同改动的源码文件）· merge-base `9a883966`。
- 已修的项：
  - 16（命名）：两个视图的 `board_id` 改名 `graph_id`；
  - 19（页面资源）：两个新状态词的字节由 plan-progress 客户端改用 `change(...)` 抵消，预算降了 30；
  - 11（新子路径写进文档）：`docs/platform/PROLOGUE-AI.md` §8 加了「等待与接续」；
  - 14（错误码）：`control` 的两处拒绝改成 `defineErrorCodes` 的码（见下表）。
- 统筹 2026-10-15 定的两项（都选 A）：
  - 2：留一个 typed 等待 `agent.collaboration.await.v1`，顶替旧的四个（`agent.waits.read/await/resume/cancel`），typed 净减 3（199 → 192 里有这一部分），旧 id 不留别名。偏离 P1 的地方记在 §4.6.10。长等待要做成动作，得等动作合同加上 wait 这种 operation（现在只有 query、command）。唯一的调用方 `wake-loop.ts` 的用例要覆盖「被取消、撤权的不再写记录」。
  - 20：「在等别的步骤」「重启后需要核对」两个状态词（`plugins/native/coding/src/taskboard-client.ts:34`、`plugins/native/coding/src/plan-progress-client.ts:12`）按原有缺口留着：这两个客户端脚本整份都没有翻译调用。两个词只在原有标签的位置显示，不加新的界面元素；随 BACKLOG 的 BL-141「Coding 客户端接翻译」一起译。

| 项 | 结论与证据 |
| --- | --- |
| M1 `pnpm boundary:check` | 通过（换包后登记表里的包路径已改） |
| M2 `check-health-gates --base origin/main` | 通过；数字只降不升，见 PR「只许减少的数字」 |
| M4、M5 快照 | 已重新生成：新增子路径 `agent-collaboration`；`agent-host` 删 `waits`、加 `collaboration`；新增两个宿主动作 |
| M6 `page-assets --base` | 通过，五个页面资源各降 30 字节 |
| M7 `pnpm lint`（只看新行） | 本线新增、改动的行上没有诊断；改名行上原有的一个 `any` 改成了类型 |
| M8 DOM 事件、M9 翻译、M10 test-imports | 都通过；M9 与基线工作树逐行相同 |
| M14 `pnpm test:security` | 54 个文件全过 |
| M15 `pnpm secrets:check` | 没有 |
| 1 不留兼容 | `subagentYieldGuard`、`claims`、旧 `agent.waits.*` 删干净，没有别名；`following` 按 §4.6.10 留到 P4，没动 |
| 2 注册一次 | read、control 是宿主登记的动作，一处注册；typed 等待按统筹的 A：顶替旧的四个，净减 3（见上）；唯一调用方 `wake-loop.ts` 开跑被拒时不写记录，`coding-queued-round` 断言撤权、取消两种 |
| 4 身份 | `control` 的操作者和项目取自调用上下文；`control` 先 `beforeEffect()` 再改 |
| 5、6 分层与模型 | 插件只经合同和动作；`@prologue/sdk` 仍只在 agent-host |
| 9 巨大单元 | 没有新的巨大单元；`createPrologueTaskBoards` 已降到阈值以下，`routes.ts`、`agent-host.ts` 都变小 |
| 12 合同变更 | 唯一的调用方 Coding 在本 PR 里改完；旧名在活文档和 Skill 里都没有引用 |
| 22 测试 | 新测试只走公开入口（包名）；`prologue-project-board` 已加进产品子集 |
| 23 验收编号 | 新测试名带 PA-03 |
| 24 SDK | 只剩一份 tgz；`.sha256`、`.provenance.json`、`patch-history.json`、README 都和包相符 |
| 26 分支卫生 | 门禁脚本、`limits.json`、`biome.jsonc` 和各例外文件都没动；`scripts/workspace-packages.mjs` 只改了包路径（换包要改） |
| 3、7、8、10、15、17、18、21、25、27 | 不涉及，或只是就地改自己的行（`prologue-node.ts` 只改 7 行，不加长） |

**留到后面的（不在 P3a 里）**：

- Coding 的协调者角色没有板工具，它的孩子也就没有（SDK T12），让出的孩子永远报不了自己那一步，等待总是 failed、照样往下走。要不要给协调者或孩子开板工具是产品问题，P4 再定。
- 宿主代人发的「优先」只告诉此刻正在跑的那几轮（§4.6.10 表里已写）。
- `following`、2 小时认领过期，留到 P4。

### 6.0e P3c 记录（2026-10-15）：Coding 的执行角色等外面的结果

统筹 2026-10-15 转达用户的两项决定：

1. 这一片只教 Coding 的执行角色（`builder`）用外部等待；提示词照规矩升版本、`WORDING_HISTORY` 加一行；Coding 的提示词有离线回放或评估就跑，要真实模型评测先弹窗问用户；PR 正文把「提示词改动」和「安全改动」分成两节。
2. `molis.action-query` 按权限管，不另写名单：`operation` 为 `query`、effect 为 `read`、本会话此刻有权调用的动作都可以查；每次检查都经统一动作服务、用这一轮的授权重新核对；`SECURITY-INVARIANTS` 那一条写清只读、每次复核、写类或没有权限的一律 refused，拒绝用例里有「拿写类动作来查」。

**做了什么**（PA-16～PA-19，§4.6.8 的语义）：

- `horizontal/agent-host/src/adapters/prologue-checkers.ts`：SDK `conditionCheckers` 的实现。
  - 两个检查器：`molis.action-query@1` 与 `molis.file-present@1`。
  - 一个登记钩子（`tool-before`，只拦 `board-wait`）：登记时就拒绝写类、判断、导航、这一轮没给的动作，这时什么动作都不调。
  - 每次看（`check`）先复核：等待仍在、范围一致、轮次仍被记得；再问这一轮自己的 `beforeDispatch`；然后才经这一轮的动作客户端重新发现、调用。文件检查器要宿主说目录此刻仍授权给这个项目（`checks.directoryAuthorized`，由 `apps/local-host/src/agent-host-composition.ts` 给）。
  - 收回了就回 `refused`：SDK 把它记成 `checker_error`，等待停下，不再看。
- `prologue-node-port.ts`：`conditionCheckers` 交给 `createRuntime`；`board-wait` 进自动放行名单。它自己不做事，等的东西由上面的钩子把关。
- `prologue-node.ts`：`startAgentRun` 之后记下这一轮的授权（会话、`beforeDispatch`、目录、动作客户端与冻结的动作）；轮次结束且没有在等的等待时丢掉。宿主重启后不认旧轮次（S-27 的 host-restarted 用例）。
- 错误码 `agent.collaboration_check_refused`、`agent.collaboration_check_not_read`（`horizontal/agent-host/src/errors.ts`）。
- Coding：`builder` 角色 13 → 14，`host_tools` 加 `board-wait`；提示词 `coding-background` 1 → 2，教两种检查器和「要判断好坏的不能这样等」。

**和 §4.6.8 设计不同的地方**：

- 检查器登记表放在 `horizontal/agent-host`，不在 `apps/local-host` 的装配里（§4.6.9 表里写的位置）。每次看要用这一轮自己的授权（`beforeDispatch`、动作客户端），那是适配器在开跑时拿到的；宿主只经端口回答「目录此刻是否授权」。动作的授权仍由宿主的统一动作服务每次核对（`authorizeMcpActions` 那一条链），没有在 agent-host 里另写一份。
- 助理的 `watchJob` / `checkJob` 没有迁到这里：用户定的范围只是 Coding 的执行角色。
- `board-wait` 自动放行后，`builder` 也能用它等 `node`、`envelope`、`command`、`pending` 四类。这几类只等、不做；提示词只教 `external`。

**证据**：

- `tests/prologue-external-checks.test.ts`（PA-17、PA-18）：真实 Node SDK、真实宿主动作服务、受控的供应商回复。
  - 结果文件：旧的不算，缺完成标记不算，失败标记就是失败。
  - 只读查询：四个状态照给定的对上；没列出的状态、查询出错都是 unknown。
  - 等的时候没有模型请求，满足后接续可走一次。
- `tests/security-invariants-external-checks.test.ts`（S-27，PA-16、PA-19）：
  - 登记时拒绝：没有的检查器、目录外的路径、命令、判断、这一轮没给的动作。
  - 动作授权收回、插件实例停了、目录不再授权、宿主重启，这四种之后的那一次看都是 refused，不调动作，之后不再看，也没有接续和模型请求。
  - 一轮连续 5 次调用失败就停（`prologue-run.ts`），所以「这一轮没给的动作」放在第二轮。
- Coding 的提示词没有离线回放或评估用例（`pnpm studio:replay` 只管创作台），这次没跑；真实模型评测要先弹窗问用户，没做。

**留到后面的**：

- `molis.file-present` 只证明文件在（S-27 开放项）。
- §4.6.9 表里写过「检查器不得调用模型、AI 动作」。按用户的决定，现在只看 query + read + 有权：判断（要问模型）因为是命令被拒，但一个声明了 `model:invoke` 的只读查询现在能被查。要不要再拒，待定（已报统筹）。

### 6.1 当前记录

A0 执行记录（下列历史方案记录之后继续）：

- 2026-10-11 范围纠正已落实：原 1–23 项和存储/预算决定仍是整线目标，24/25 只补协作链；删除 P5 对所有原采用项的无依据前置，§5.2 分列真实依赖，§5.6 给出下一完整 A1 的来源、文件与 PA-24 验收。
- 本轮三处授权登记完成：S-13 补记忆标记，S-22/S-23 记命令扩权与 yield 拒绝；`test:security` 仅追加三份对应测试，产品子集追加 yield、记忆和存储重开三份用例。既有条目保留，S-07/S-17 和数量说明未动。文档/安全登记检查 0 问题；`tests/security-invariants-doc.test.ts` 1/1 通过（日志 `/tmp/molis-a0-security-registration.log`）。没有启动构建、浏览器或重跑已有产品验证；正式 SDK 包与 Linux 默认消费结论仍未获得。

- SDK 完整 S1 与 `c4b9fde3` 组合只在 `loop-tools.ts` 出现文本冲突，保留两边语义；`pnpm exec tsc -p tsconfig.typecheck.json` 通过。首轮定向 54 项中 50 通过，4 项因隔离树未构建、子进程找不到 `dist/index.js` / `dist/node.js` 失败，待构建后复验。
- Molis `node scripts/check-health-gates.mjs --base origin/main` 通过，公开 API 快照只变 AgentRunView 与命令扩权合同；`pnpm boundary:check` 通过（该脚本会先构建 test-kit，小包步骤也已执行）。
- 为等待完整构建而做的源码接线验证：临时 tsconfig 仅把公共包入口映射到当前 Molis/SDK 源码，6 文件 49 项通过，包含 PA-23 真实 HTTP + Node Host 的 yield 拒绝、零子派发、原父 Run 与重开不自动启动，以及状态/审查/存储/记忆边界。它不证明候选包可安装，正式包/默认构建路径仍待验证。
- 扩展源码验证：8 文件首跑 93 项中 80 通过、13 因新安装没有 SQLite 原生模块失败；核对同版本 `better-sqlite3@12.8.0` 后复用主检出的 Mach-O arm64 模块，`action-before-effect.test.ts` 的 20 项复验全过。补跑状态投影/凭据桥 2 文件 17 项全过。去重后 16 文件 159 项通过；这仍是源码映射验证。副作用用例启动临时 Host 时报告尚未构建的插件资源缺失，业务断言通过不升级为工作台启动/资产验收。
- 最终源码差异 `git diff --check HEAD` 两仓通过；Molis 文档门禁 0 问题，临时源码映射配置已删除。当前 PA-22/PA-23 已有测试引用（新增 A1 的 PA-24 仍待实现），编号脚本只证明可检索，具体通过程度仍以下表为准。
- 包尚未生成，撤回从旧采用提交提取的 `vendor-provenance.test.ts` 写死包名/提交改动，使其与当前未换包状态一致。依赖、锁文件、登记、vendor 文件仍与基准相同；健康门禁此时通过不证明新包来源合格。
- 临时跨仓源码 typecheck 暴露 SDK 与 Molis 不同 TS 配置（ES lib、Node 类型、noUnused），不能作为正式包类型检查；未因此放宽配置或改 SDK 无关源码。该检查未报告 Molis 源码错误。

前序方案记录：

- 2026-10-09：建采用树，完成原始调研与部分适配；当时的唯一进度只记到状态投影和微压缩。本次按提交/源码补全为 §0.2，历史测试声称不升级为本次验收。
- 2026-10-11：按用户最后纠正，TaskBoard 统一协作成为确定方向；本轮读取原对话、两仓规则、采用/相关工作树和现行实现，修订同一份 spec。SDK `onYieldSettled` 已有、App-tools 仍拒子代理、Molis 仍拒子任务通信、两套私有协调状态均已在源码核实。
- 本轮文档校验：`git diff --check` 通过；采用树现有 `docGateProblems`（链接、引用、索引、BACKLOG、根目录规则）为 0。用主检出的新版同一文档检查器复核，HEAD 与修改后均有 6 个既存 contract placeholder 问题，新增 0；本轮不改这些源码。
- 编号校验：采用树尚无 `check-spec-coverage.mjs`，用主检出脚本加 `--root` 指向采用树只读检查。PA-01–PA-23 全部识别，无未编号条目或前缀冲突；报告仍列 23 项未被测试引用，属于新增方案尚未写实现测试的缺口，不把脚本退出 0 当作产品覆盖通过。PA-01 的方案内容/文档校验已完成；PA-02–PA-23 待实现和验证。
- 2026-10-11 补充：按用户要求增加 §4.6.8 外部条件等待。核实 SDK 命令事件/输出等待、LocalQueue、Molis 助理作业退避检查、Schedule 的项目闹钟边界及常驻服务限制；新增 PA-16–PA-21。通用进程/文件/下载上传检查器未标成现有完成能力。
- 2026-10-11 交接补充：§5.5 将 A0 基础采用收窄到四个 Molis 来源提交，明确 S1/题型均非前置、SDK 合成落点、私有接续排除、文件范围、当前主线冲突与 PA-22/PA-23。只读预演 A0 为 8 文件重叠/2 文件文本冲突；未运行源码验证。
- 前序文档轮仅修改本文与 `specs/README.md` 的本线索引行。原 8 个源码/快照修改与 5 个未跟踪源码/测试保留；该文档轮两仓均无产品代码修改。工程全量、真实模型、产品实操、用户本人验收本轮均未执行。

### 6.2 A0 本轮交接（2026-10-11 11:50 UTC）

本轮完成度是**源码已集成、定向验证部分通过**，未达到 A0「功能可用」。所有改动均未提交；新 Molis 树 `feature/prologue-a0@9f9bda551402e1bee03f0646f55791e5cb0e31d6`，SDK 树 `feature/molis-a0-s1@c4b9fde33df465b6f1798ef1c34de85c2b1904f0` 加完整已接受 S1（33 文件）与组合说明。Molis diff 42 文件，包含合同/Host/必要 Coding 展示、测试与本线文档；可用 `git diff HEAD` 审阅，不能只看未暂存 diff。来源树与真实 Home 未动。

| 验收 | 已证明 | 未证明 / 下一步 |
| --- | --- | --- |
| PA-22 | SDK typecheck；组合源码微压缩/回执/子回报定向通过；Molis 预算合并、状态/审查、独占 owner 清理、凭据、取消/撤权后零写等源码入口验证通过 | SDK 4 项子进程用例缺 dist；尚无组合候选包与离线消费者；Molis 默认构建/安装路径、UI、资产、集成全量未验 |
| PA-23 | 真实回环 HTTP + 生产 Node Adapter：yield 在派出前拒绝，零孩子、无审批、只有原父 Run；落盘重开无模型调用/自动接续。diff 保留现行主线删除/owner/testkit 边界，健康与 API/包边界已检查 | 正式依赖/锁文件待实际包生成；临时 Home 默认启动与 Coding 浏览器未验；未合 main，D7 未解除 |

11:42 统筹明确整机资源仍被 Computer Use 全量（PID 40510/40511）和防腐全量（PID 55804/55805）占用，禁止整体构建、SDK 包构建、浏览器及包装命令的隐式构建。本轮不主动等待/轮询这些任务；保留工作树供统筹分配下一时段。日志：`/tmp/prologue-a0-typecheck.log`、`/tmp/prologue-a0-sdk-targeted.log`、`/tmp/molis-a0-source-tests.log`、`/tmp/molis-a0-source-integration.log`、`/tmp/molis-a0-source-effect-retry.log`、`/tmp/molis-a0-source-status-credentials.log`、`/tmp/molis-a0-health-code.log`、`/tmp/molis-a0-boundary.log`。临时源码映射仅在已忽略 QA 目录生成，验证后删除，不成为生产配置。

下一时段按依赖串行执行，不重跑已经有效的源码检查：

1. SDK 树执行 `pnpm --filter @prologue/sdk run build`，然后 `pnpm exec vitest run packages/sdk/test/host-storage-concurrency.live.test.ts packages/sdk/test/steer-receipts-node.live.test.ts packages/sdk/test/packaged-consumer.test.ts --maxWorkers=1 --typecheck.enabled=false`。前两文件复验真实子进程，第三文件验证公开构建入口；它本身有隐式构建，当前未运行。
2. 在 `packages/sdk` 执行 `pnpm pack --out <临时绝对目录>/prologue-sdk-a0-s1.tgz`；空目录依赖该包，`pnpm install --offline --ignore-scripts`，复制并执行 `packages/sdk/test/fixtures/steer-receipts-consumer.mjs`。记录真实包 SHA/字节数、基点与完整工作树差异；`dirty: true`，不得写成已提交/上游 main 包。
3. 正式 vendor 规则要求干净具名提交，不能用候选来源冒充或放宽 `vendored-provenance`。先交候选包和 scoped diff 给统筹集中处理 SDK 提交/上游合入授权。获授权后从最终具名提交重建，才把包、来源、依赖、`scripts/workspace-packages.mjs`、锁文件及对应测试一起切换；保留/删除历史旁证遵守 vendor 当前规则。
4. Molis 正式包切换后 `pnpm install --frozen-lockfile --offline`、`pnpm build`，用默认配置跑 §5.5 定向测试（加 `tests/agent-action-tools-prologue.test.ts`、`tests/prologue-credential-bridge.test.ts`），再 `pnpm boundary:check`、`pnpm test:contracts`、`pnpm test:security`、`node scripts/check-health-gates.mjs --base origin/main`。正式包来源授权未到时，可先在独立临时消费树验证同一 candidate 默认路径，但不得把它当可合主线产物。
5. 统筹已授权三处安全/CI 登记，范围见 §5.5：S-13 的 pinned memory 标记中和、命令扩权一次性批准、yield 派出前拒绝及对应轻量用例。此次只追加登记；后续合主线前与防腐届时版本合并，不覆盖其 S-07/S-17 与数量说明。默认包路径执行这些用例仍随构建时段验收。
6. 构建时段内执行 `pnpm workspace:build`、`pnpm page-assets:check`；真实尺寸只能保持或缩小，超额在本刀允许的展示代码内解决，不放宽预算。浏览器时段跑 `node scripts/run-tests.mjs tests/coding-timeline.e2e.test.ts`；冻结源码后按集成排期 `node scripts/run-tests.mjs` 全量。收紧后的生成基线按现行命令更新，失败再做干净基线对照。

当前不请求用户提前批准未知候选包。三处安全验证登记范围已授权；仍需要 SDK/Molis 构建时段；候选包完成后，再集中给出 SDK 提交/上游采用的具体审批材料。没有执行 commit、push、PR、merge、publish 或真实 Home 切换。

### 6.3 与 Computer Use 的三处集成交接（2026-10-11，只读）

核对时 `origin/main=9f9bda551402e1bee03f0646f55791e5cb0e31d6`；CU 来源为 `.claude/worktrees/computer-use`、`feat/computer-use-land@6919b8cc2231185e6bc5851aa353fe806a106ad0` **加当前未提交 diff**，负责人仍是 Grok 原线。只查 HEAD 差异会漏掉已提交桌面合同，因此同时对照该树工作目录与 origin/main。三文件合计相对主线 93 行新增、52 行删除；这是当前快照，不是已接受基准。

只读文本预演将 A0/共同主线/CU 三份文件复制进临时目录后执行 `git merge-file -p`，不改任何工作树、index 或 ref：`prologue-node.ts` 1 块冲突（导入）、`prologue-stream.ts` 1 块冲突（同位置新增 helper）、公共合同 0 块。自动合得上不代表语义正确；以下是需要保留的实际行为。

| 接缝 | CU 当前改动与 A0 的关系 | 集成裁决 / 验证落点 |
| --- | --- | --- |
| `horizontal/agent-host/src/adapters/prologue-node.ts` | CU 加桌面审查 helper、runRefs、应用本轮授权、结束释放与桌面指导；A0 有副作用白名单、yield 守卫、预算/模块拆分、S1 steer 等待后丢弃返回值。导入冲突可按各自引用并存 | 保留 A0 的 `HOST_GOVERNED_TOOLS`、预算/审查/拒绝及三处 async steer 桥；接入 CU 已接受的桌面 helper 和 Run 生命周期，不能搬回旧大函数覆盖拆分。**CU 的 `sleeping → paused` 是必须消除的语义冲突**：A0 已让运行端保留 sleeping，并由 `prologuePhaseOf` 投影为 running + `sleeping_until`；休眠会自行继续，不能成为需人工恢复的 paused。保留 CU 真正的 person-input 暂停，两者分别测试 |
| `horizontal/agent-host/src/adapters/prologue-stream.ts` | CU 新增 desktop surface/observation 识别、`DESKTOP_STEP` 标记、tool-call/result helper；A0 新增状态/记忆/变更/恢复 handlers、reasoning 收口、sleep 清理 | 两组 helper 可共存，工具事件交给 CU helper 时仍调用 A0 `closeStreaming`，保留所有 A0 handlers 与 completed/终态收口。重放必须同样区分桌面与浏览器，标记不泄漏给人；不能整文件选择任何一边。`tests/prologue-stream.test.ts` 与 CU `tests/assistant-tool-words.test.ts` 联合证明 |
| `packages/contracts/src/services/agent-host.ts` | CU 对主线增加 `AgentToolOperationReviewDocument.round_allow` 和 `remember: session / app-this-round`；其相对 CU HEAD 的未提交部分仅缩短这两处注释。A0 拆 memory 合同并增加 grants、sleep/turn_changes 等投影 | 没有同名字段类型冲突；联合合同保留两边字段。`app-this-round` 只授权桌面应用当前 Run，不能使 A0 带 grants 的命令取得免询问；命令记住规则与桌面本轮规则各守既有适用条件。重新生成单份 API/动作快照，不拼接旧快照；`agent-review-standing` 与 CU 的审批入口用例联合验 |

**对 A0 的前置结论**：未发现必须先等 CU 合同落地才能完成 A0 独立包/默认路径验收的冲突。上面的 sleeping 转换必须在两线共用产物前解决；此轮不改 CU 或为其增加兼容逻辑。CU 当前依赖 `prologue-sdk-0.0.0-rc.1-computer-use.tgz`，A0 准备的是 c4b9fde3 + S1；两者不能靠覆盖包路径合成。共同 SDK 源码/来源与消费验证是后续共享集成任务，不把只核对这三文件当作 SDK 联合兼容验收。

**交回与顺序**：本节交回唯一统筹会话 `01a12a80-ede2-7b81-93ea-521a5abcc35c`；CU 代码/实际电脑验收留给 Grok 原负责人。A0 先按获配时段完成 §6.2 的包、默认路径和工程验证。统筹选定两线已接受快照与最新防腐主线后，指定一个集成 writer 在隔离集成树按 SDK/公共合同 → Host/审查 → 事件投影 → 两线默认路径测试的顺序合并；以此处裁决保住休眠语义、命令扩权拒绝和 CU Run 授权释放，不整支覆盖。若 CU 先合 main，A0 按新 main 重做上述三处窄差异集成；若 A0 先合，CU 同理适配，不因先后顺序改变合同。两线分别通过不代替共同产物验证。

| 层次 | 本次可报告事实 |
| --- | --- |
| 代码 | A0 42 文件在途 diff，CU 在途提交/未提交快照已只读核对；三处尚未实际合并，没有改 CU/SDK 来源树 |
| 验证 | A0 保留 159 项源码映射验证、SDK typecheck 与登记检查证据；此次仅三文件语义审阅/文本预演，无共同构建/测试。CU 原 spec 的真机及模型记录是原线证据，本轮不升级其结论 |
| 合入 | 两线均未因本轮进入 main；origin/main 仍为上述提交。正式来源与提交/推送/PR/合并授权边界不变，D7 尚未解除 |
| 安装 | 本轮没有安装/切换真实 Home 或桌面产物；组合包也尚未生成，不是当前运行环境已升级 |
| 真实验收 | A0 默认临时 Home/UI/真实模型及共同产物实操未验；未取得用户本人验收。CU 真机覆盖与缺口仍由其 spec/负责人维护 |

资源以统筹最新核查为准：原防腐全量 PID 55804 已结束，转浏览器补验 PID 22490；baseline-main 有构建；CU 全量 PID 40510 仍跑。未分配 A0 构建/浏览器时段，因此不启动含隐式构建的命令，也不开始 A1 源码。资源更新只改变验证排期，不改变完整采用范围或未读输入政策。

### 6.4 当前主线候选包消费验证（2026-10-11）

**最新完成程度（2026-10-12 00:32 UTC）**：真实 dirty SDK 候选与隔离公开包消费者已通过；Molis 已换包并完成冻结离线安装，整体构建首次失败于安装时丢失 esbuild 可选依赖，环境已修复但尚未重建。新起 CU 基线全量占用后停止重构建，Molis 默认定向/浏览器/全量仍未验；不能据已完成的 Agent Host/Coding 单包编译宣称产品构建通过。D7 未解除。

- SDK 来源仍为 `/Users/yijunwang/code/prologue-a0-integration` 的 `c4b9fde33df465b6f1798ef1c34de85c2b1904f0` + 完整 33 文件 S1 未提交差异，源码/index 未改；构建前后与既存完整源 patch 比较一致。`pnpm --filter @prologue/sdk run build` 通过；`host-storage-concurrency.live`、`steer-receipts-node.live`、`packaged-consumer` 三文件 11 项通过（maxWorkers=1），不重复此前已通过的源码/类型证据。
- 候选实际为 validationROOT 的 `prologue-sdk-a0-s1.tgz`，1,064,280 字节，SHA-256 `71c25f85f15de3f918107080a468f0dc469e956d2b76b12987d2cf51087fb96b`。provenance 明确 `dirty:true` 和完整 patch，没有宣称正式提交或上游合入。既有 `sdk-consumer` 离线安装后，经 `@prologue/sdk` / `@prologue/sdk/node` 公开入口运行 `steer-receipts-consumer.mjs` 成功：实际回环 HTTP、输入幂等/撤回/读到归属、落盘重启回放且无多余请求。日志为 `sdk-build.log`、`sdk-dist-tests.log`、`sdk-pack.log`、`sdk-consumer-install.log`、`sdk-consumer-s1.log`。
- 同一 Molis 消费者从 fb8c9dcca 无损前移 `4fb2db83f0d03b7a738b24dc7979215fa7300e3a`，备份在 `advance-fb8c9dcca-to-4fb2db83f/`。三方应用无冲突，42 个 A0 文件与备份字节相同（同步最新 spec 前），62 个主线变更与 HEAD 相同；主线版本单源、TypeSafe 内部绑定、安静重开、触屏/Dock、schedule readiness、页面预算/快照和文档修正均保留。
- 候选只切到临时消费者的 agent-host 依赖、包登记与锁；旧包和 sidecars 从临时 vendor 移出，原字节备份在 `old-vendor-package/`，Git blob 和来源加入 patch-history，旧重建补丁按既有决定保留。原 A0 实现树的依赖与 SDK 源未换包。正式来源门禁/测试不放宽；它们原来钉住旧包、无补丁干净提交与历史数量，本候选阶段不能称通过，最终正式来源确定后才更新实际包断言。
- 第一次 `pnpm install --offline --ignore-scripts` 解析锁时丢掉平台可选依赖（原始锁保留为 `molis-lock-offline-resolution.yaml`），后续整体 `pnpm build` 因 `@esbuild/darwin-arm64` 缺失而退出 1。已核对未配置 optional 禁用；保留 main 的完整依赖图，仅带入 pnpm 实际生成的 SDK resolution/路径，最终锁只差 5 行。`pnpm install --frozen-lockfile --offline` 修复通过（18 项全部本地复用），不改配置或放宽门禁。日志 `molis-candidate-build.log`、`molis-candidate-install-repair.log`；首次 build 中 Agent Host 与 Coding 的 tsc 已完成，但 root/workbench 构建未完成。
- 修复后重命令前发现新 CU 基线全量 PID 79488（包装 PID 79483，`cu-baseline-4fb2-full`），没有启动第二次 build、test-kit、浏览器或等待型全量。`node scripts/check-package-boundaries.mjs` 直接使用首次构建已有的 test-kit，返回 errors=[]；这是同一边界检查器通过，未额外运行会隐式构建的 pnpm 包装。`node scripts/check-health-gates.mjs --base origin/main` 退出 1，仅报候选 provenance 的 `source.dirty must be false`，无其他问题（`molis-candidate-health.log`）。不更新基线或跳过断言。00:32 UTC 最后复查该全量与 Chrome 子进程仍在运行，本轮冻结交回；既有 `resume-commands.md` 从安装已修复后的整体 build 接续，SDK 已通过步骤不重跑。

以下保留各轮历史过程；与本段冲突的“尚无包/旧基点”只描述当时状态。

**2026-10-12 00:26 UTC 恢复包验证**：实际进程复查未发现构建、全量或浏览器批次。沿用同一 SDK、sdk-consumer 与 molis-consumer；本轮先 SDK build → 三个缺 dist/包验证 → dirty tgz → 公开包 S1 消费，再把消费者 fb8c9dcca 无损前移到已 fetch 的最新 main（统筹为 4fb2db83f），运行正常默认包路径。原源/已通过源码证据保留，正式来源门禁不放宽，无提交或真实 Home 授权；当前还没有候选成功证据，下面旧结果均按其时间保留。

**20:24 UTC 接续合同**：本轮目标是 SDK build、三个缺构建验证（host-storage-concurrency.live、steer-receipts-node.live、packaged-consumer）、dirty 候选及隔离 S1 包消费，再验证临时 Molis 默认路径；不重复 159 项源码映射与已通过类型证据。现已 fetch 的目标为 `fb8c9dcca5cfc424decd6fff44ba940e8491eb9b`（#395/#396/#397 已合），PR #398 版本单源仍在途，不先采用。同一消费者从 70c529805 前移，先备份再三方恢复原 42 文件差异；原 A0/SDK 源保留。重叠 7 文件只合主线适配：保留交互失败限次、动作参数错误合同、ScenarioPack 2.4.8、图片上限 6、安全表 S-03/S-07/S-08/S-17/S-18 和 Issue 安全测试；同时保留 A0 的预算、授权、副作用、yield 拒绝、steer 回执与 sleeping 状态。主线 Home Runtime、数据库、快照、资源预算和安装说明均不改写。

实际资源核查与统筹的空闲观察不一致：`scripts/./run-tests.mjs` PID 85235（integration-wave3-i2）与其浏览器仍运行，约 54 分钟；不是僵尸。已有锁不能代替全量独占，故先做无构建的消费者前移，未启动 SDK/build/test-kit/浏览器。资源释放后沿既有 resume-commands 顺序继续，正式 dirty 来源失败单列，D7 不解除。以下 70c529805 记录为上一轮已完成的静态集成证据，非本轮包验证结果。

**本轮实际集成结果**：同一消费者 HEAD 已为 `fb8c9dcca5cfc424decd6fff44ba940e8491eb9b`，42 文件 A0 差异仍完整暂存。前移完整恢复材料在 validationROOT 的 `advance-70c529805-to-fb8c9dcca/`（full/staged/unstaged patch、index、42 文件归档及原 A0/SDK 备份）。三方应用有 2 处冲突：`package.json` 的安全测试采用 main Issue 3 项与 A0 3 项的并集，其他字段保持 main；`specs/README.md` 同时保留 Issue 与完整 Prologue 采用索引。其余 5 个重叠文件自动合并，已读实际 diff 核对，保留主线提问失效判断/交互失败限次、参数纠错、图片 6 张及 A0 预算、授权、effect、yield 拒绝、异步 steer 和状态投影。

范围与源保护检查：两基点间 167 个主线变更中的 160 个非重叠项与新 HEAD 一致（含删除），其余 35 个 A0 文件在同步本 spec 前与备份逐字节相同；安全表 main 全部行（除 A0 扩展的 S-13）保留，A0 S-13/S-22/S-23 与备份一致。已整合的 `model-thinking` 两处 `templates: []` 未变。原 A0 暂存/非 spec 源码和 SDK 的 staged/unstaged/status 保持不变。无 unmerged、无空白错误；文档、安全登记、产品子集只读门禁均返回 0 问题。最终复查 PID 85235 仍在跑（约 56 分 43 秒，活跃测试子进程 27962），没有启动本线重验证。这些是静态整合证据，不宣称运行行为通过。

统筹已纠正资源观察：按 `run-tests.mjs` 基名检查，避免漏掉 `scripts/./run-tests.mjs`。实际 PID 85235 全量仍在运行，本轮不排队等待、不启动 SDK/test-kit/产品构建或浏览器；SDK 无 dist、无 tgz，Molis 仍指向主线旧 SDK，依赖安装尚未针对新 main 更新，旧安装不能算新候选验证。`preparation.json`、`molis-a0.patch` 与 `resume-commands.md` 已更新到本次真实基点。下一时段从 SDK build 继续，不重建消费者；默认测试除原范围外还需覆盖本次主线交互修复与 Issue 共存。正式来源、默认路径、合入与真实验收均未完成，D7 未解除。


**历史验证基准（上一轮无构建集成）**：再次 fetch 后 `origin/main=70c5298054da92eab9b2b8837fa18716a2ae1b3c`，同一消费树的 detached HEAD 已从 `385987c6ae3d06a13b4e3b987e6c5c5245c31ec2` 无损前移至它。原 A0 实现树仍为 9f9bda551 + 原已审差异，不冒称最新主线。当前在途 PR 仅 #180/#178/#156；#388–#391 的已合入内容全部保留，Goals 输入接受/移除仍由 Goals 拥有，不等同于 SDK S1 回执。

前移前保存消费者 full/staged/unstaged patch、状态、index 和 42 文件归档，以及原 A0 与 SDK 的暂存/未暂存差异，位置为 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/advance-385987c6a-to-70c529805`。仅在本消费者对备份 patch 做反向 `--index` 应用恢复旧基点，再 `git switch --detach` 新 main、`git apply --3way` 恢复 A0；没有 stash、提交、重置主检出或新建消费者。三方应用退出 0、无 unmerged 条目，无需人工选边。

逐项内容核对：

- A0 42 文件中，前移前后 40 文件字节相同（本次同步最新 spec 副本前）；另外两文件只吸收对应主线变化：`tests/model-thinking.test.ts` 两处增加 `templates: []`，A0 显式预算 900 的断言与 PA-22 注释保留；安全表只增加主线 S-17 管理入口身份拒绝测试，A0 S-13/S-22/S-23 与其他条目保留。之后唯一 spec 从原树同步为消费者验证副本，因此与前移备份相比共有 3 文件有可解释变化。
- 两基点之间 62 个主线文件中，排除上述两个重叠后的 60 文件逐字节等于新 HEAD；其中包含 Pages/灵光空白丢弃、actions/resource/API 快照和 Host 模板 owner/新出口。没有拿原 A0 树整片覆盖这些新事实。现行 A0 功能差异仍只占原 42 文件。
- 已读 `CONTRACT-CHANGES.md` 第 3 条与动作快照段并核实 PR #390 的固定引用影响说明：文档一处要求形状变化升版，另一处允许说明现版本引用不受破坏，表述不一致。#390 已解释可选字段与现有引用影响；这里只记录，不把它当 A0 阻塞，不修改 Claude 代码、合同规则或快照。
- 原 A0 已暂存差异与所有非 spec 未暂存差异、SDK 完整 staged/unstaged 源码与状态保持不变；SDK 候选仍未构建。消费者 HEAD、无冲突/空白错误、scope 与内容核对通过；文档、安全登记与产品子集只读检查均为 0 问题。这是集成静态证据，不是类型/默认路径或产品运行通过。

`preparation.json` 与 `resume-commands.md` 更新为真实新基准，`molis-a0.patch` 更新为新基点上的 42 文件差异；旧 patch 与状态仍在上述备份中可恢复。没有新建包哈希、没有打包或安装；本轮不等待/轮询资源、不跑 noEmit、已通过测试、SDK/产品/test-kit/隐式构建、浏览器、预览或全量。按统筹交代的全量/浏览器占用冻结交回；下一获准时段仍从 SDK build → 缺 dist 与 packaged-consumer → dirty 候选与离线 S1 消费 → 当前 Molis 默认路径验证继续。D7 仍需正式来源、默认验收与 main 合入。

以下保留上一轮 385987c6a 的准备记录，不代表现行消费树基点：

上一轮开工重新 fetch，`origin/main=385987c6ae3d06a13b4e3b987e6c5c5245c31ec2`（#386 Alchemist 模型可用性/Home 配置、#387 Feed 嵌套 Goals beforeEffect）。原实现树仍是 `9f9bda551402e1bee03f0646f55791e5cb0e31d6`，不是最新主干。两点间主线改动与 A0 42 文件无直接交集，规则/Agent Host/公共合同未变；#388 在途 Goals 输入接受/移除不带入，也不等同于 S1 SDK 输入回执。

独立临时消费树：`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/molis-consumer`，detached HEAD 为上述 main，叠本线已审阅 scoped diff 和必要文档快照。本文仍只有本原实现树是可编辑事实源，临时树中的副本仅供安装/文档门禁验证，不另行维护进度。原 A0 的已暂存/未暂存内容保留；SDK 来源仍是 `/Users/yijunwang/code/prologue-a0-integration` 的 c4b9fde3 + 已接受完整 S1，不带题型/CU。准备记录、差异和候选包放在 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5`。

本轮先准备再等待资源；复用已有 Claude `build-lock.sh`，只参加同一个构建锁，不新造锁。该包装不能证明未参加者/全量/浏览器空闲，每次重命令前仍查真实进程；有界等待不超过约 10 分钟。SDK 构建、缺 dist 子进程用例、包消费者、离线 S1 消费和 Molis 默认路径按 §6.2 串行验证；结果在本节续记。正式 vendor 的干净来源与上游 main 要求不放宽，dirty 候选仅供临时树验证；合入/安装/真实验收仍各记事实，D7 未解除。

本轮实际准备结果：

- `git apply --check` 后将 A0 完整差异应用到临时消费树，与原实现树逐文件核对 42 文件一致；仅在临时树暂存这些文件，没有提交。主线新增的 Alchemist/Feed 内容保留，#388 未带入。原树已暂存内容未改，只有本文追加进度。
- 临时树 `pnpm install --frozen-lockfile --offline --ignore-scripts` 通过（`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/molis-install-preparation.log`），当前装的仍是原主线 SDK；这不是候选包消费证据。同版本 `better-sqlite3@12.8.0` 的 arm64 原生模块从原 A0 安装复制，没有编译。
- SDK 基点、dirty:true 和 33 文件完整差异已保存为 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/sdk-source.json` 与 `prologue-a0-s1-source.patch`。没有生成 tgz，来源记录明确 `artifactStatus: not-built`，未捏造包哈希、最终提交或已合上游。
- `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/molis-a0.patch` 是此次应用的完整 scoped diff；`preparation.json` 记源/目标/基准，`original-status.txt` 保存准备时暂存状态；`resume-commands.md` 给出接续命令，`sdk-consumer/` 是待装包的空消费者目录。它们都是临时验证材料，需求与进度仍归本文。
- 有界等待/复查未获得时段：13:52 UTC 实际进程有全量 PID 469（integration-wave3-i1，约 6 分 45 秒）、另一全量 PID 40324（约 1 分 37 秒），以及构建 PID 48495/48548/50528。原始紧凑进程记录在 `resource-observation.log`。即使已有 build.lock 暂时空闲，全量仍禁止构建；未加入会绕过该条件的排队。
- **本轮未运行**：SDK build、4 项缺 dist 的复验、packaged-consumer、pnpm pack、空目录 S1 包消费、Molis candidate 依赖/锁切换、默认构建/定向/门禁/Coding 浏览器/全量。原因是共享重验证时段未释放；没有重复已通过的源码测试或 CU 预演。此前源码证据继续保留，A0 仍非功能可用，D7 未解除。

交回唯一统筹 `01a12a80-ede2-7b81-93ea-521a5abcc35c`：下次确认无全量/浏览器及独占构建时段后，从 SDK build 起按本节材料继续即可；不需要重新建立消费树或复制差异。若主线又前进，先核对新 main 与当前临时基点之间的实际文件，再无损准备下一基准。SDK/包/消费者证据齐备后才集中提交正式来源/上游采用的授权材料；没有执行提交、推送、PR、合并、发布、安装或真实 Home/凭据操作。

### 6.5 已定方向、设计选择与开放问题

**已定，不再询问**：Prologue 原完整采用清单保持，A0 是基础切片，24/25 为新增协作项；原采用按真实依赖独立推进。TaskBoard 是所有 Agent 协作的统一事实源；Coding/个人助理同用 Prologue；简单任务自动建少量节点；任务/Run/消息各守主人；先合同后机制后产品；外部条件由可信非模型检查器等待，满足后统一接续；只认现行合同；当前仅实施 A0，不实现统一协作。

**本方案的技术选择，尚非实现事实**：复用 SDK 现有模块和 waits/Delivery，图上持久接续占用+稳定启动请求键；共享 Host 只装配与复核，产品插件不决定唤醒；跨 Run 通过节点负责人/代次接管。数值沿当前授权/预算配置，助理现有委派上限（总数 6、并行 3、追加 2）在统一配置接入时保持效果，调大不藏在迁移中。SDK 状态/导出名、存储版本、节点保留方式、外部检查器的来源默认频率及硬上限在 P1 按真实 API 冻结，不让接口占位扩成第二协调器。

**P1 跨线决定（统筹 2026-10-12 按「技术决策看防腐后果、功能决策看体验」确认）**：

- X1 输入引用：`InputRef = { session, input }` 归 Prologue Session；节点 `origins`、报告 `inputs` 各最多 8 条，超出整次拒绝、不截断；写入路径、`acknowledge-inputs` 新目标与 `pending.about` 归输入回执 S4；`key` 只是调用方幂等键，对应关系由 `services/agent-inputs` 投影。依据：单一事实主人。
- X2 操作卡：不进图，经卡的 `run` → `attemptOf` → 节点推出；人要做决定一律用待答问题，卡不是等待条件；交互线 H2 必须保住每张卡的产生 session 与 `run_id`，以及助理与 Coding 共用的卡片键空间。依据：卡的主人是 Molis 卡片协作者。
- X3 待答问题：只由 Effect-policy 结算；图只读状态、只登记等待；P1 不依赖 S4 的问题事件。
- X4 合同落点：`services/agent-collaboration` 在 P3 与使用方同批建；三个动作 actor 取上下文、输入带 `expected_version`；旧 `agent.waits.*`、`step-board.amend` 在 P4 删；节点来源只显示 `input_id`。依据：W5-09 拆分方向、不建占位子路径、不加 typed 能力、不留兼容。
- X5 常驻板：先 Coding、后助理（回执线 D9）；6 / 3 / 2 原值搬进协作配置；助理一半按 W5-10 协作者形状做，开工前请防腐线负责人确认先后。
- X6 删除无板的 Agent 协作，不留兼容；Prologue 合同列出对所有消费方的公共行为变化，删掉的名字在 public-surface 快照里体现；自动建子节点对人无感。依据：用户否决「简单协作可以绕过 TaskBoard」；唯一消费方。

**实施前仍需核对/决定**：

1. 采用/统一协作线负责机制和 SDK 合成，统筹会话安排具体 writer 与共享文件时段（§5.2）。当前 A0 源码与本地验证已授权；推送、PR、合并与真实 Home 切换尚未授权。
2. 若落地必须改已被外部 Runtime 使用的 MCP 名字，列出精确新旧名和消费者后再请用户决定；本方案不预先授权改名。
3. 真实 Home 的切换时机、维护对象与备份/回退窗口，待隔离副本演练完成后提交具体方案再授权。本轮不把旧数据默认自动续跑。

跨工作/项目自动通信、自动扩大预算、扩大工作目标都不在本方案授权范围；需要这些新产品能力时另作明确决定，不阻塞范围内统一协作。

## 7. 远端交接（2026-10-13 晚，当前接续入口）

本节取代 2026-10-13 早上的版本（那一版写于知道 #471/#472 之前）。它自成一体：路径都是仓库内路径或远端分支，命令在新克隆上能直接跑。统筹层材料在 Molis 远端分支 `coordination/handoff-2026-10-13` 的 `coordination/2026-10-13/`（只作补充）。

### 7.1 一句话现状

- **整条线**：#408 已与 main 对账（实现以 main 为准，§6.0a），并把 Molis 依赖换成过渡包 `interim-p1-cu`（§3.2）。A0 工程通过。A1 改为核对 #472，缺口 6 项（§5.6a）。P1 合同冻结。P2a–P2g、输入回执 S4、H16 已合进 Prologue main（#7–#17）。P2h 只写了接口（Prologue 本机工作树 `~/code/prologue-p2h`，未提交），P2i、P3–P6、A2–A5 未开始。
- **工程通过**：A0；对账后的树（证据见 §6.0a）；Prologue 各刀的 SDK 全量与干净包消费者检查（§7.3）。
- **真实产品实操**：未做（对账后的树没有人在隔离 Home 里走过；真实模型从未跑过，本机无 Key）。
- **用户验收**：一项都没做。

### 7.2 分支和 PR（只列远端）

**Molis**（`molis-ai/molis-work`）

| 分支 / PR | 状态 |
| --- | --- |
| #408 = `feature/handoff-prologue-adoption` | 本线唯一的 Molis 提交处。已合 main 到 `f2024d6b`（#474），换了过渡包，待统筹按条件合 |
| `coordination/handoff-2026-10-13` | 统筹层材料，不合 |

**Prologue**（`molis-ai/prologue`，每刀一个 PR）

| PR / 分支 | main 上的合并提交 | 内容 |
| --- | --- | --- |
| #4 | `55b0c85a` | A0 采用修正、输入回执 S1、带类型的问卷 |
| #5 | `f5ef12e6` | 输入回执 S2、S3 |
| #6 | `82488fa0` | P1 统一协作合同（文档） |
| #7 #8 #9 #11 #12 #13 #14 | `2621ae91` … `7229b11b` | P2a–P2f（#13 修 P2d 漏绑的夹具） |
| #10 | `c9a6e774` | 输入回执 S4（2026-10-13 合） |
| #15 | `a47eb26d` | 桌面 Computer Use 进 main（`d4908c11`，2026-10-13 先推到远端） |
| #16 | `056f7194` | P2g 受限通信 |
| #17 | `b219d859` | S3 修正 H16：名单里没有 `acknowledge-inputs` 的一轮不写编号说明 |
| `release/molis-interim-p1-cu-2` | 不在 main（`08b84296`，两个父提交在） | 过渡包来源；取代没有 H16 的 `release/molis-interim-p1-cu`（`208dd381`，没有用过） |

### 7.3 已完成（证据等级写在每项里）

「工程」= 自动化测试、门禁、变异、干净包消费者检查；「产品实操」= 真实产品里的人工或浏览器实操；「验收」= 用户本人。下表所有项的产品实操与验收都是**无**。

| 切片 | 证据（工程） | 在哪 |
| --- | --- | --- |
| A0 | 见 §6.0；对账后在新树上重跑，见 §6.0a | #408、main（#472 同源） |
| P1 合同 | 冻结、独立审查 | Prologue #6、§4.6.9 |
| P2a–P2f | 各刀 SDK 全量、变异、消费者检查（见各 PR 描述） | Prologue #7–#14 |
| S4 | 合并前在 `a0ff62e1` 上先 build dist：全量 344 文件 3775 通过 / 4 失败（`workspace-watch.live`，main 上同样失败，环境）；消费者 8/8 | Prologue #10 |
| Computer Use 进 main | `8cd5101d`：全量 3847 通过 / 4 失败（同上）；消费者 8/8；未跑 `desktop-computer-use.live`（会操作真实桌面） | Prologue #15 |
| P2g | `b30feaeb`：全量 3854 通过 / 4 失败（同上）；在合并后的代码上重做两个变异各让用例变红；消费者 9/9，新脚本对上一份包失败 | Prologue #16 |
| H16 | `b219d859` 前的 `b7e736a4`：全量 3859 通过 / 0 失败；消费者 9/9；两个变异各让用例变红 | Prologue #17 |
| 过渡包 | `08b84296`：全量 335 文件 3782 通过 / 0 失败；消费者 S1–S3 通过；两次干净打包逐字节相同 | #408 `f9769ce5` |
| 对账 | §6.0a | #408 |

### 7.4 没完成的

1. **#408 合进 main**：等统筹按条件合（`Verify` 绿、与 main 同步、secrets 与 health `--base` 过、证据入本文、统筹读过 diff）。批量全量：本次换包改了每条 Agent 路径下的 SDK 运行时，属于 §5.4 的共享核心阶段，统筹在集成分支上跑一次。
2. **A1 缺口**（§5.6a 的 6 项）：先补 PA-24 编号，再补行为用例。
3. **P2h**：只有 `orchestration/core/taskboard.ts` 的接口草稿与两个错误码（`WAIT_ALREADY_ARMED`、`WAIT_CONDITION_INVALID`），在本机 Prologue 工作树 `~/code/prologue-p2h`（分支 `feature/p2h-waits`，未提交、未推送）。换机器接手就按合同「等待：条件组与四态观察」重新开始。
4. P2i、P3（W4-06 硬前置；第二次换包；`services/agent-collaboration`）、P4（Coding 先，助理那一半按 W5-10 形状）、P5、P6、A2–A5。
5. 防腐方案 `specs/repository-anti-corruption/dependencies-and-sdk-plan.md` §4.3 写的是「Molis 只依赖 main 上的一个具名提交，不依赖分支」。过渡包按用户 2026-10-13 的决定是例外。那份文件归防腐线，本线不改，已告诉统筹。

### 7.5 下一步（按顺序）

1. 统筹合 #408 → 重新判定回执线的 D7（① 推送的具名分支，父提交都在 Prologue main；② 默认路径验证在本次换包里做了；③ #408 进 main）→ 回执线开阶段 1，交互线在 main 上重做 C1+H1（带类型的问卷 `a06ae62e` 在过渡包里）。
2. A1 缺口补齐（#408 上的下一组提交）。
3. P2h、P2i（Prologue，每刀一个 PR）。
4. P3：先等防腐线的 W4-06（拆 `prologue-node.ts`），没合就由 P3 自己按 W4-06 的切法拆。第二次换包（Prologue main 的具名提交，带 P2a–P2i、S4），同一个改动里做 Molis 默认路径验证。新建合同子路径 `services/agent-collaboration`，与第一个使用方同批建；`AgentCollaborationNode` 不存自己的 run→node 索引，一律走 `boards.attemptOf`。
5. P4：Coding 先；助理那一半按 W5-10 的协作者形状（用户 2026-10-13 定：功能线做，算 W5-10 的一部分，防腐 spec 的 W5-10 行写「由本线 P4 实现」）。第 14 项（main 上的助理交回与续做）在 P4 改到统一合同上，不留兼容：
   1. 每个助理 Work 在第一跑之前有一块常驻板，委派的子 Work 是子节点（子 Work 只留节点引用，`delegated_by` 换成节点引用）；
   2. 删 `handed_back_run`、`hand_back_held`、`watch`、`settle`、`resume`、`markHandedBack`，改成父节点上的等待组加节点的接续记录，经 `collaborationHost.startContinuation` 起跑，请求键取代 `hand-back-<sha>`；
   3. `hold`（人停下）→ 取消等待 / 接续 `blocked`；
   4. `takeBack` → 改图交回父节点（代次 +1）；
   5. `status`（`waitForWorkChange`/`watchWorks`）→ 读协作等待视图；
   6. 交回材料与通知的文字保留为内容；
   7. 上限 6/3/2 改成协作配置，数值不变；
   8. 存量数据由维护改成现行形状，不加读取兜底；
   9. `AssistantDelegations` 已是按端口依赖宿主的协作者，就地改，`assistant-service.ts` 不许变长；
   10. 五个用例（`assistant-delegation-handback`、`assistant-delegation`、`assistant-work-wait`、`assistant-handback.e2e`、`assistant-follow-live.e2e`）换成协作合同的用例。

### 7.6 跨线依赖

- **谁在等本线**：回执线的 D7、交互线的 C1+H1 都等 #408 进 main。情境线 #411 不依赖 SDK，可以先于 #408 合。
- **本线在等谁**：统筹（合 #408、批量全量）；防腐线的 W4-06（P3 前置）。
- **与回执线**：S4 已在 Prologue main，等 P3 的第二次换包才进 Molis。过渡包里的 S1–S3 已在 Molis 默认路径上：补充有回执、没读到的补充进会话队列（默认 `ask`，什么都不带走）；名单里没有 `acknowledge-inputs` 时不写编号说明（H16），所以回执线接 S3 之前模型不会被指向那个工具。`acknowledge-inputs` 在助理面板隐藏（`presentActivity`），显示与措辞归回执线（D16）。
- **与交互线**：H2 与本线 P4 的助理那一半都按 W5-10 形状做（用户 2026-10-13 确认）。
- **与 Computer Use**：过渡包里的 Computer Use 源码与 `d4908c11` 相同；main 上的电脑格、桌面审批与 `prologue-surfaces.ts` 不受换包影响（对账后的用例见 §6.0a）。

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
| Molis 侧 | 问卷字段与 A0 合进同一个包；`acknowledge-inputs` 不在助理面板显示；产品子集去掉 `test:security` 已覆盖的文件；页面资源超预算靠减少注入函数里的注释和重复、不放宽预算；全量回归改成批量；Prologue 的 `dist` 要先 build | 见 §6.0 的决策表和 §7.9 |
| 对账（2026-10-13） | 实现以 main 为准：#472 带进 main 的 A0 代码与 #408 同源，#408 只留 main 没有的三处（S1 补充回执的适配、S3 在助理面板隐藏、`prologue-stream.ts` 的三处类型化），加 PA-22/PA-23 证据、安全登记与本文 | 两份实现同源时只留一份；main 已有的不重做 |
| 过渡包（用户 2026-10-13） | Molis 依赖 merge(`95cd901d`, `d4908c11`) 打的包，不用 Prologue main 末端；第二次换包随 P3 | main 末端带 P2d，Molis 在 P3 之前还在用无板协作，X6 不许兼容路径 |
| 先换包再合 main | 在 #408 自己的树上先换成过渡包，再合 main，SDK 相关冲突一律取本线 | 每个提交都自洽，不需要手造一个两份包都在的中间状态 |
| H16（统筹，2026-10-13） | 换包前在 Prologue 修：名单里没有 `acknowledge-inputs` 的一轮不写编号说明（#17） | 提醒早已按名单关掉，编号说明没有；Molis 的角色还没列这个工具，每条补充都会带一句指向不存在工具的话 |
| PA-23 改述 | SDK 的 `yield` 仍被拒（`subagentYieldGuard`，S-23，`prologue-adoption-guard` 用例）；main 上的第 14 项是已知的私有接续，属 X6 欠账，由 P4 助理那一半还 | #472 已把第 14 项带进 main，P4 之前不回退已上线的行为 |
| 第 14 项留到 P4 | 对账时不动 main 上的助理交回与续做，改造清单在 §7.5 | 改它要有统一协作合同（P3），现在动只能写兼容 |

### 7.8 工作规则

- **拍板**：技术决策按防腐线的后果判断；功能决策按对用户 UI 交互与使用体验最好的推荐走。本线内的决定写进决策记录并在汇报里列出；跨线或改范围的找统筹。替用户拍板不等于用户验收。
- **Molis 只往 #408 提交**，不另开 Molis PR（防腐线同时在改架构，单开 PR 容易冲突）。**Prologue 每刀一个 PR**。
- **合并由统筹按条件做**（用户 2026-10-13 授权统筹验证过就合 Prologue PR）。Prologue：先重新 build dist，再跑 SDK 全量与干净包消费者检查。Molis：`Verify` 绿、与 main 同步、secrets 与 health `--base` 过、证据入本文、读过 diff。
- **全量回归攒批**：平时只跑 `node scripts/affected-tests.mjs` 选出的定向用例；共享核心的改动由统筹在集成分支上跑一次全量。整台机器同一时间最多一个构建、一个浏览器批次。
- **不碰真实 Home**（4207 / 4173）和安装版；不放宽门禁与断言；数字只许降。
- **证据三级分开写**：工程通过 / 真实产品实操 / 用户验收；没做的写「未做」。

### 7.9 已知问题

- **Prologue 的 9 个子进程测试夹具和 `packaged-consumer.test.ts` 加载 `packages/sdk/dist`**（git 忽略，vitest 不会重建）。全量前必须先 `pnpm --filter @prologue/sdk run build`；改了运行时行为（工具门禁、启动校验）时还要 grep 一遍 `packages/sdk/test/fixtures`。P2d 就是因此漏过 5 条红（#13 修好）。
- 计时类 live 用例偶发（负载高时）：`agent-budget.live`、`workspace-find-search.live`、`app-mode-surfaces.live`、`host-storage-full.live`、`checkpoint-review.live`；单独连跑 3 次通过就记为时序，PR 里写明。
- 原来的开发机（Intel Mac）上 stdio-MCP 用例会超时、缺 Swift helper；2026-10-13 起接手的机器是 Apple M5（arm64），Prologue 全量约 3 分钟，`workspace-watch.live` 有时收不到文件事件（Prologue main 上同样失败，环境），`desktop-computer-use.live` 会真的操作这台机器的桌面，不在别人用机器时跑。Molis 的 `runtime-integration` 在 Linux CI 上偶发失败。负载高时浏览器用例会出现 `CDP timeout`，先单独重跑再定性。
- zsh 里变量不会按空格拆分：给 `vitest` / `grep` 传一串文件时用显式列表或循环。
- `pnpm` 不在默认 PATH 里时在 `~/.local/share/molis-tools/bin`；Prologue 的 vitest 配置在仓库根，要在根目录跑，不是 `packages/sdk`。
- 同一个应用身份（`appId`）才读得到自己落盘的东西：用子进程夹具造崩溃现场后，重开 Runtime 要用夹具的 `appId`。
- 换包时 `pnpm install`（不带 `--frozen-lockfile`）会顺手删掉锁文件里别的平台的可选包（约 900 行）：换包只手改锁文件里 `@prologue/sdk` 的五行（路径与 integrity），再 `pnpm install --frozen-lockfile --offline` 核对。

### 7.10 怎么复现和验证

**Prologue（P2 各刀）**：见 §7.4-1、2。干净包消费者检查的完整步骤：`git archive <提交> | tar -x -C <空目录>` → 在里面 `pnpm install --frozen-lockfile --offline` → `pnpm --filter @prologue/sdk run build` → `cd packages/sdk && pnpm pack --pack-destination <另一个空目录>` → 在第三个空目录写 `package.json`（`"type": "module"`，依赖 `"@prologue/sdk": "file:<tgz 绝对路径>"`）→ `pnpm install` → 把 `packages/sdk/test/fixtures/taskboard-*-consumer.mjs` 拷进来逐个 `node`；再用上一刀的包跑最新脚本，应当失败。变异检查的做法：用 `sed` / 脚本把一处源码改坏、跑相关用例应当变红、再还原；每一刀的合同条目里列了变异清单。

**Molis 默认路径（换包或合 main 之后）**：

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/run-tests.mjs tests/model-thinking.test.ts tests/agent-budget-prologue.test.ts tests/prologue-stream.test.ts tests/prologue-status-projection.test.ts tests/prologue-storage-claims.test.ts tests/prologue-memory-boundary.test.ts tests/prologue-start-refusal.test.ts tests/prologue-subagents.test.ts tests/prologue-recovery.test.ts tests/action-before-effect.test.ts tests/assistant-business-gateway.test.ts tests/agent-review-standing.test.ts tests/agent-review-surface.test.ts tests/prologue-adoption-guard.test.ts tests/prologue-credential-bridge.test.ts tests/agent-action-tools-prologue.test.ts
node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-assistant.test.ts
node scripts/run-tests.mjs tests/agent-host.test.ts tests/agent-host-composition.test.ts tests/agent-host-wiring.test.ts tests/agent-start-authority.test.ts tests/host-inference-completion.test.ts tests/prologue-inference-native.test.ts
node scripts/run-tests.mjs tests/prologue-model-controls.test.ts tests/assistant-delegation-handback.test.ts tests/assistant-delegation.test.ts tests/assistant-work-wait.test.ts tests/lingguang-actions.test.ts tests/schedule-task-runner.test.ts tests/workbench-asset-cache.test.ts tests/assistant-followups.test.ts   # #472 带进 main 的
node scripts/run-tests.mjs tests/computer-use-gaps.test.ts tests/assistant-tool-words.test.ts tests/assistant-attention.test.ts   # #471 带进 main 的
pnpm test:security
pnpm test:contracts
node scripts/run-tests.mjs tests/vendor-provenance.test.ts tests/ci-product-subset-plan.test.ts tests/ci-product-subset.test.ts tests/release-assets.test.ts tests/npm-package.test.ts tests/install.test.ts tests/runtime-payload.test.ts tests/uninstall.test.ts
pnpm boundary:check
node scripts/check-health-gates.mjs --base origin/main
node scripts/gates/page-assets.mjs --base origin/main
node scripts/run-tests.mjs tests/coding-timeline.e2e.test.ts tests/coding-model-controls.e2e.test.ts tests/issue-assistant-repair-page.e2e.test.ts tests/assistant-handback.e2e.test.ts tests/assistant-follow-live.e2e.test.ts   # 浏览器，需要本机 Chrome，单独排时段
```

换进 Molis 的新 SDK 包要从 Prologue main 上具名的合并提交打出，`vendor/prologue-sdk/` 只放一份（再加一份在途的），`.sha256`、`.provenance.json`、`patch-history.json`、README 重建步骤都要和包相符（`pnpm health:check` 会拦）；不要把 `dirty` 门禁改成通过。

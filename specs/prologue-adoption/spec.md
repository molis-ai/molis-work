# Prologue 采用：能力接入与 TaskBoard 统一协作

状态：执行中，未完成。采用线 2026-10-20 收尾停下，接续入口是下面的「交接（2026-10-20）」：P1–P4、A0、A1、A2-1、A2-2（#822）和换包 #814、#887 在 main；A2-3（#805）也已合入；A2-2b、子任务目录的写后检查、A3 的结构化一半、A5、P5、P6 等后续见 BL-301～309，BL-176 的 Prologue #53 尚未带入。

## 交接（2026-10-20）

这一节是采用线停下时留的接续入口（用户 2026-10-20 定：防腐线之外的线做完手头的就开 PR、写交接、停）。它取代统筹材料里的 `coordination/2026-10-18/lines/adoption.md` 和 `adoption-a2-plan.md`，也取代本文更早的几处接续入口：开头原有的几段引言、§6.0b、§6.0d 和 §7「远端交接」。那几处的进度、分支和下一步都以这里为准，正文留作当时的记录。

### 现在的状态

P1–P4、A0、A1、A2-1、A2-2 写后检查和 QA-004/005 的用例均在 main，当前包是 `retry-waiting` 那次换入的 Prologue `2c7feba5`（#887 换入的 `753dbae8` 的下一份）。A2-3 设置页由 #805 合入 `b4e36d775`，⑤ 已补完定向测试与真实浏览器验证，必需 CI 和队列检查通过；其余未完成项见 BL-301～309。工程通过、所覆盖的真实操作和本人验收分别记录。

### `vendor/prologue-sdk` 与换包的接续点

- **main 上**：`prologue-sdk-0.0.0-rc.1-retry-waiting.tgz`，Prologue `2c7feba5`（带 #53 已答的 `ask-user` 结果用 `answered` 带题号、#58 运行时准入与关机边界、#59 收窄内部导出、#60 `retry-waiting` 事件），换入的 Molis PR 合入后在此补号。之前 #887 换入 `753dbae8`（带 #54～57，含效果来源，`96bca9792`），#814 换入 `a51607fb`（`ddab7a2d1`），#822 已按其中 #51 的标记接好执行器，合入 `d4bd81630`。
- **后续换包**：BL-300 的换包已由 #887 完成，删除该完成行；Molis 对效果来源的接入仍是 BL-162。#53（`ask-user` 回答的键，BL-176）#887 不含，已随 `retry-waiting` 那次换包带入；BL-173「窗口读带行号」仍未实现，不写成已带入。后续步骤照 `vendor/prologue-sdk/README.md` 的重建步骤和 §7.9、§7.10：
  - 先在构建时段跑一次 Prologue 全量，跑之前重建 `packages/sdk/dist`；
  - 用 Node 24.14.0 打包；
  - 锁文件只手改 `@prologue/sdk` 那几行；
  - 换完由回执线把 `EffectOrigin` 的 `toolCall`、`modelCall`、`step` 接进回执（BL-162）。

### 已合入（Molis，新的在前）

| PR | 合入提交 | 内容 |
| --- | --- | --- |
| #770 | `03c0b546e` | 写后检查器的目录先规范化再查，用 SDK 的盘符规则（#757 评审） |
| #759 | `7805fc62a` | Coding 新会话的选择等第一次读，不带走输入框里的字 |
| #757 | `4acd85c71` | 保存写后检查器时拒绝 SDK 跑不了的配置 |
| #728 | `a98967d7f` | A2-1：检查器配置与 `agent.write_checkers.*` 两个动作（§6.0p.10） |
| #725 | `ee78569fc` | C4：coding-base v12 |
| #723 | `f7f8adbf2` | 换包 `3adc5e87` |
| #699 | `7faaa027c` | 换包 `94ee1ea4` |
| #692 | `002fbbb5b` | A2 写后诊断的合同（§6.0p） |
| #690 | `102671ce6` | 换包 `b541a8e6` |
| #680 | `8abfffc02` | P4 助理一半 A4（§6.0q） |
| #675 | `b75e20738` | P4 助理一半 A3（§6.0o） |
| #668 | `250814e3d` | 换包 `24e69083` |
| #665 | `476c08931` | BL-154 |
| #654 | `6412bcfec` | P4 助理一半 A2（§6.0n） |
| #641 | `5b9fdbf35` | 换包 `e69b71cf` |
| #637 | `be534a1a6` | P4 助理一半 A1（§6.0k） |
| #632 | `7bf9b7a1e` | P4-C2（§6.0j） |
| #627 | `04ab02166` | P4-C1（§6.0i） |
| #626 | `504ebfc74` | P4 的 Coding 一半 |
| #621 | `6696a15be` | 网关不再替模型改形状（§6.0g） |
| #615 | `cee899c4d` | 网关的能力输入带上类型（§6.0f） |
| #556 | `5948c56d9` | P3b：换模型后撤权、从断点继续（PA-24） |
| #534 | `7fe8ee658` | P3a：协作包与项目工作板（§6.0d） |
| #491 | `2768dd71b` | A1：PA-24 的拒绝、停止与换格式 |
| #442 | `4e426f4ca` | 换入输入回执第二、三刀的包 |
| #408 | `1a9416ec0` | 与 main 对账，换成过渡包（§6.0a） |

Prologue 一侧每刀一个 PR，合并提交写在各节；Molis 当前已使用 `retry-waiting` 那次换包带入的 `2c7feba5`（含 #53、#58～60；此前 #887 带入 `753dbae8`，含 #54～57）。

### 交接 PR 的处理结果（2026-10-20 核对）

| PR | 交接时头提交 | 内容 | 当前状态 |
| --- | --- | --- | --- |
| #814 | `39d53d0a0` | 换包到 `a51607fb` | 已合入 `ddab7a2d1` |
| #822 | `d83c33336` | A2-2：执行器、审查卡与 S-42（§6.0p.12） | 已合入 `d4bd81630`。定向 10 文件 / 91 项和整批完整 CI 通过，文档用例 32.7 秒通过，未放宽超时；审查卡有真实命令与渲染用例，单独浏览器截图仍见 BL-303 |
| #805 | `ae5f41bb7` | A2-3：项目设置里的写后检查器（PA-40～43，§6.0p.13） | 已合入 `b4e36d775`（被测源头 `96f4262fd`）。整体构建、README 非浏览器 75 文件 / 651 项、全部 10 份必跑浏览器文件及设置页 3 项通过；12 张中英、宽窄屏截图。资源实增 5,222 B，准确额度已复核；必需 CI 和队列检查通过 |
| #833 | `02cb1a307` | 修 QA-004（PA-08 三方交错）、修 QA-005（PA-17 用宿主计量），只改测试 | 已合入 `bfe19439f`；#784 上已记修好（10-19） |

上述前置均已实际合入；本交接只同步事实，未完成的产品验收与后续实现继续留在 BACKLOG。

### 分支与工作树

- **已删**：本地分支 `claude/adoption-checker-save-refusals`（#757）、`claude/coding-draft-first-read`（#759），两个 PR 都已合；它们的远端分支合并时已删。
- **远端分支**：仓库开启合并后自动删分支；#814、#822、#805、#833 的源分支已随合并删除，本交接的源分支也随合并自动删。其他 Agent 的本地分支与工作树仍由原负责人处理。
- **工作树**（都在 `.claude/worktrees/` 下）：
  - `adoption-a2-3`：采用线最后的会话在用，检出 QA 与交接两个分支；两个 PR 合入后由 ① 删。
  - `adoption-a2-2-762983`：分支 `claude/adoption-a2-2-762983`，只在本机，末端 `3bca94aa1` 是 A2-2 的 WIP 提交，内容已重写进 #822。#822 合入后由 ① 删，连同这个本地分支。
  - `prologue-adoption`：分支 `feature/handoff-prologue-adoption`（`7bceedb85`），#408 的旧采用树；#408 已合。里面可能还有 10-13 以前的未提交改动，由 ① 看过没有要留的东西后删。

### 没做完、没开工的

都写进了 `specs/BACKLOG.md`；原线已交接的未实现工作保留接续项，已有新执行者的写明去向：

- 新写的：BL-301～BL-309；原 BL-300 的换包由 #887 完成后已删行，效果来源的 Molis 接入继续归 BL-162。
- 原有、负责人原写「采用线」、现在改成「未分配」的：BL-155、BL-160、BL-171、BL-172、BL-173、BL-220、BL-221。
- PG-054 已由 #844（`0744d7dd3`）完成新会话、方法、MCP、委派与整合的运行时目录接入；Character 相关的写死项已在 BL-372 的第一片去掉（运行时自己声明 `supports_character_limits`，默认运行时取目录的 Home 默认）；项目选运行时也已由 BL-372 做完（项目设置的 `projects.settings.runtime.read/select`，没选就是 Home 默认；选定的运行时不可用时新会话被拒绝并指向项目设置，不换一个，`specs/repository-anti-corruption/slices/bl372-runtime-declarations.md`）。

### 接续时先读

本节；§5.3 验收表；§6.0p（A2 的合同，#822 加了 §6.0p.12）；§6.0b 逐项核对（10-14 的结果，BL-309 要按 main 重做）；§7.7 决策记录、§7.8 工作规则、§7.9 已知问题、§7.10 复现命令。

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

**动作（不新增 typed capability，防腐决定 #1）**：`agent.collaboration.read.v1`（`kind: query`、`operation: query`、`effect: read`：按 `board_id` 或 `run_id` 读视图）；`agent.collaboration.revise.v1`（`kind: operation`、`operation: command`、`effect: write`：人修订计划，带 `expected_version`，沿用现有修订种类并加取消节点、重试节点；P4 替换 `agent.run.step-board.amend.v1`）；`agent.collaboration.control.v1`（`kind: operation`、`operation: command`、`effect: write`：`kind: "cancel-wait" | "continue-now" | "retry" | "resolve-reconciliation"`，带 `expected_version` 与节点 / 等待 / 接续引用；`continue-now` 带 `on_early_continue: keep | cancel`）。actor、项目、安装都从调用上下文取。旧的 `agent.waits.read/await/resume/cancel.v1`、`agent.run.step-board.amend.v1` 在 P4 没有调用方后同一批删除（阶段一不留兼容）；以后这几个动作的形状变了就升 `version`，同一个 PR 里先 `pnpm build` 再 `pnpm actions:update`；MCP 不改已有工具名。revise 现行是 `agent.collaboration.revise.v2`（回执 3d-3 加 insert 的 `origin`，#700）。

**输入、待答问题、操作卡挂到同一张图（跨线 X1–X3）**：

| 东西 | 唯一主人与身份 | 怎样挂到节点 | SDK 合同 | Molis 公共合同 |
| --- | --- | --- | --- | --- |
| 输入（补充、带进的排队输入、回答） | Prologue Session；`InputRef = { session, input }`，`input` = `steerId` / `inputId` | `node.origins`（节点因它新增 / 修订，引擎盖章）；`report.inputs`（报告引用） | `InputRef`、`origins`、`report.inputs`（本刀冻结形状；各最多 8 条，超出整次拒绝、不截断）；写入的工具参数、`acknowledge-inputs` 的 `board-node` / `todo` / `pending` 目标、`pending.about` 归输入回执 S4 | 节点上只给 `input_id`；`key`、来源、读到与说明由 `services/agent-inputs` 解析，不在协作合同里复制 |
| 待答问题 | Prologue Effect-policy；`{ pending_id, revision }` | 推出：`pending.origin.run` → `attemptOf` → 节点；显式：等待条件 `kind: "pending"` | 等待经 Effect-policy 只读口读问题状态；回答 / 过期 / 取消仍由 Pending 结算 | 视图里给 `pending_id` + `revision`，展示与作答沿用 `services/agent-interaction` 的 `AgentPendingQuestion` |
| 操作卡（助理与 Coding 共用） | Molis 卡片协作者（交互线 H2 / 防腐 W5-10）；`card_id` + `revision`，记录产生它的 `session` 与 `run` | 只推出：卡的 `run` → `attemptOf` → 节点；卡不是等待条件，节点需要人决定时用待答问题 | 不进 SDK 图 | 协作视图不含卡；界面在节点下按 `run_id` 取卡片协作者的视图（`InteractionOperationView`）；卡执行不给节点或 Run 加权限 |

**P4 产品接入与旧路径退出（按 X5 的顺序先 Coding 后助理）**：

- Coding：`plans.ts` 的确认计划照旧冻结为节点；`step-verdict:*` / `subagent-verdict:*`（人的验收）保留为业务事实、引用节点；`last-start:*`、`wake-note:*`、内存 `busy` / `held` / `waking` / `wakeLoop` 删除，改读等待与接续视图；`prologue-taskboard.ts` 的 `following` 去抖 steer 改成 SDK 接续在边界交结果，2 小时认领过期改成代次与等待期限。
- 助理：每个 Work 一块常驻板；`delegation(parent)` 改成派子节点（子 Work 仍是专业工作内容容器，只记节点引用）；1500 ms 轮询的 `status` 改成等待视图；`watchJob` / `scheduleJobCheck` / `checkJob` 的私有退避与结束判定改成 `external` 条件 + `molis.action-query` 检查器，删 `assistant.job-check` 排程，保留通知 / 卡片关联与 `told`；委派上限 6 / 3 / 2 数值不变，是助理的产品规则，只定义在 `AssistantDelegations` 的 `DELEGATION_LIMITS`（统筹 10-17 定，§6.0q；原写的「协作配置」SDK 里没有）。硬约束（防腐 HUGE-CLASS-MIGRATION 决定 #3）：`delegated_by`、`follow_ups`、委派轮询、`StoredJob` 检查做成 W5-10 形状的协作者——协作者只经端口依赖宿主，样板照 W4-05 拆出的提醒与跟进——算作 W5-10 的一部分，`assistant-service.ts` 不增长；助理这一半开工前由统筹请用户转告防腐线负责人确认先后，在那之前只做 Coding 一半。
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
  - 视图里 `model_switch` 是 `{ now: "B" }`：切换在那次调用的边界上生效了（SDK 发了 `model-switched`），而它生效的那次调用在发出前被拒。用量与 `stop_reason` 说明 B 没有收到任何东西。用例把这一点钉住。统筹 2026-10-15 审定：这符合 SDK 的语义，保持现状。`model_switch.now` 的意思是「切换已生效」，不是「B 回答过」；界面上如果有地方把它写成「这一轮用 B 回答」，以后另开一项改，这次不动。
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

### 6.0b 现状核对（2026-10-14）

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
| 25 | 外部条件等待 | 部分：SDK 完成，Molis 未接 | P2j：`conditionCheckers`、`config.waits.external`、队列道 `prologue:wait-check`、零模型计数（`taskboard-external-checks*`） | **P3** 建 `prologue-checkers.ts`（`molis.action-query`、`molis.file-present`）；**P4** 迁助理 `watchJob` / `checkJob`（A3 已迁：工作图上的一步，§6.0o） |
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

### 6.0d P3a 恢复记录（2026-10-15）

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
- 统筹 2026-10-16 定（方案 B）：`molis.action-query@1` 只收 `tool`，即模型看到并调用的动作工具名，不收精确引用（模型看不到 `capability_id`、`provider_id`：工具名是哈希，描述里也没有）。名字到引用的表归 `prologue-action-tools.ts`：`remember()` 时用它导出的 `actionToolRefs`，按这一轮记下的 `action_tool_scope` 与冻结动作建好；检查器不自己算哈希，不在表里的名字拒绝。业务网关那一类轮次没有逐个动作的工具名，表是空的，一律拒绝。每次看仍经动作服务按这个精确引用重新发现，再查 query + read + `model:invoke`。
- 统筹 2026-10-16 复查：失败标记经链接指向目录之外时也拒（原来被当成没有），和路径、完成标记一致；看文件用 `lstat`，解析之后被换成链接的不算在。
- 统筹 2026-10-16 定：声明了 `model:invoke` 的只读查询也拒（`agent.collaboration_check_not_read`，和判断同一个码）。检查器一次次地看，每看一次就调一次模型，花费没有上限、答案也不确定；§4.6.9 本来就写了检查器不得调用模型。仍然按权限管：看的是动作声明的权限，不是名单。
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
  - 声明了 `model:invoke` 的只读查询，这一轮持有这个权限也拒，什么都不调（先在没有这条拒绝的代码上看它红）。
  - 失败标记经链接指到目录外：refused，不当成失败，也不接续（先看它红：修之前一直等）。
  - 动作按工具名：用例里的名字取自发给模型的工具（含 find-tools 列出的），不在测试里算哈希；不在这一轮的名字被拒。
- Coding 的提示词没有离线回放（`pnpm studio:replay` 只管创作台）。真实模型小评测见下。

**真实模型小评测**（统筹 2026-10-16 要求）。记录按手册 16.3 的格式；没变好的逐条按手册 16.3 与统筹转达的 §11（用户 2026-10-16）分成「设计问题 / 模型能力 / 拿不准」。

```text
改动：io.molis.work.coding/coding-background v1 → v2（builder 角色 13 → 14）
要解决的问题：builder 要等外面的事（结果文件、外部作业）时，只能轮询或不等就结束（P3c）
环境：隔离的临时 Home；MiniMax / MiniMax-M3，接口 anthropic-messages（api.minimax.cn/anthropic）；2026-10-16
任务：T1 别的程序写结果文件和完成标记；T2 外部作业经只读查询看状态；T3 查询旁边还给了判断和取消；T4 外部 CI 失败。改措辞时四个都看过，没有没看过的任务
次数：v1 没有这项能力，不做改前对照；现行措辞（1c6292f9）每个任务 3 次（第 9～11 轮）；之前各版见下表
结果：三件事都过才算过。T1 2/3；T2 0/3；T3 0/3；T4 3/3（用例 tests/coding-external-wait-live.test.ts，日志在跑的机器上，不入库）
成本与时延：每个任务（含接着做的那一轮）平均 T1 53 秒（含一次 120 秒等不到）、输出 518 token；T2 107 秒（含一次 240 秒卡住）、输出 2362 token（两次）；T3 25 秒、1221 token；T4 11 秒、370 token。只记了 input_tokens 与 output_tokens，缓存读写没记，输入总量未知（夹具已补上缓存字段）
没变好的：见下面的分类表
结论与未验证：只在这四个任务、这一个模型上成立。等待机制本身（登记、宿主去看、满足后接着做、失败时停下）在 T1、T4 上过了；T2、T3 卡在登记那一步写参数。未验证的写在表后
```

- 夹具的做法：
  - 密钥只在那一条命令上从钥匙串内联读取，不写文件、不进日志；夹具只留请求里的 messages、回复里的工具调用、文字与用量，不留请求头。
  - 命令一律不批；沙箱里写文件、调用这一轮的动作工具都批；取消的调用次数断言为 0。
- 每个任务查三件事：
  1. 登记外部等待：不轮询（同一工具同一输入不看第二次），也不是没等就结束；
  2. 条件满足后接着做完（T4 失败时等待以 failed 结束，不自己接着做）；
  3. 等待不靠不许的动作：宿主钩子没有拒过；等的时候不判断、不取消。

| 没变好的 | 出现在 | 分类 | 依据 | 做了什么 |
| --- | --- | --- | --- | --- |
| `params` 里的数组写成 `{"item": …}`，布尔值写成 `"true"` | 数组：第 4、5 轮，第 9～11 轮的 T2（3 次）与 T3（2 次）；`"true"`：第 2、5、11 轮 | 设计问题（`board-wait` 的 `params` 没有类型；第 12～14 轮查明，原记为拿不准） | 例子和参数错误都写明是 JSON 数组、布尔值，模型照样写错，同一位置的字符串都对。同一个模型、同样的任务和措辞，只给 `params` 带上各检查器的 schema，第 12～14 轮 12 次里 0 次 | 第 6～8 轮曾让 `status` 收单个字符串，这是为一个模型写的代码，已撤回。Prologue #28 与 Molis #581 给 `params` 带上类型 |
| 把标题当 `tool` 写 | 第 2 轮 T2 | 设计问题 | 原措辞「照你调用它或 find-tools 列出的写法原样写」有两种读法：延后工具的名册一行里，名字和标题都在 | 改成正面说清：写名字本身，`molis-action-` 开头，列在 find-tools 的说明里 |
| 失败时没写 `failed_marker` | 第 2 轮 T4 | 设计问题 | 原措辞只列了「failed_marker（失败标记）」，没说不写的后果 | 写明「一定写上，否则失败了这一步会一直等」；之后 T4 每轮都写了，第 9～11 轮 3/3 |
| 把「判断类会被拒」读成不能调用 | 第 6 轮 T3 | 设计问题 | 原措辞「都会被拒绝」没说只是不能拿来等 | 写明「不能拿来等，登记时会被拒；等完照常调用」 |
| 参数错误看不出要写数组 | 第 2～4 轮 | 设计问题 | 原错误是「status.path is at most 8 field names」，没说是数组 | 错误说明写明是 JSON 数组并带例子，对哪个模型都一样 |
| 用 `any` 同时等成功文件和失败文件 | 第 5 轮 T4 | 模型能力 | 措辞已写明失败信号写成 `failed_marker`；只有一次，不成模式 | 第 6～8 轮曾加「不要另写一个等它的条件」，这是针对一种写法的禁令，已撤回 |
| 完成标记是空文件，却写了 `non_empty: true`，一直等 | 第 10 轮 T1 | 模型能力 | 任务原文说标记是空文件，措辞写明 `non_empty` 的意思；3 次里 1 次 | 不改。第 6～8 轮曾去掉 `non_empty` 的介绍，已恢复 |
| 接着做的那一轮读了文件，没写结果就停 | 第 3、5 轮 T1 | 模型能力 | 文件和回执都在；之后 5 轮里没再出现 | 不改 |
| 动作工具被延后，改用 `run-command` 去调 | 第 7、8 轮 T3 接着做时，第 9 轮 T3 | 设计问题（SDK，2026-10-16 查明） | `builder` 的工具超过 `deferToolSchemasBeyond: 20`，动作工具全被延后。SDK 只把延后的工具名列在 `find-tools` 的说明里，之后的请求也不声明它们（`agent-run-recipe.js` 的 `toolSpecs` 只发没延后的），而执行工具时拒绝请求里没声明的工具。探针：替身模型按名字直接调用延后的「Job status」，先调不调 `find-tools` 都一样，动作调用 0 次，SDK 回「requested a tool not declared for that request」。换哪个模型都调不到 | 第 8 轮加过一句「按名字调用，不经 run-command」，没有用，已撤回。上游修好、换包后恢复延后（见下），第 12～14 轮 12 次里 0 次 |
| 等完以后说「现在调用 Judge job」，却一个工具都没调就结束 | 第 12、14 轮 T3 接着做的那一轮 | 拿不准 | 没有拒绝、没有调不到：「Judge job」只列名字，按名字或先 `find-tools` 都调得动，第 13 轮就是先 `find-tools` 再调过的。可能是模型能力（说了要调却以文字结束），也可能和延后有关（两次失败时它的形状都不在请求里）；没有对照分不开 | 不改。按 §11 不加「说了要调就要调」一类的措辞 |
| 夹具缺陷，不算模型 | 第 1 轮 fetch 替身拦了 DNS-over-HTTPS；第 6 轮接着做的那一轮没给动作工具；第 7 轮动作工具的审查没人回答 | — | — | 修了夹具 |

未验证：

- `{"item": …}` 与 `"true"` 是丢了类型还是模型能力：已由第 12～14 轮查明是设计问题（见下面的重跑记录），不再是未验证项。
- T3 接着做时说了要调「Judge job」却没调就结束（第 12～14 轮 3 次里 2 次）：是模型能力，还是和它的形状被延后有关。要分开得有一组不延后的对照；统筹 2026-10-16 定不另跑对照，先记下。
- 业务网关的能力输入在工具 schema 里也是宽松的并集，`type` 是六种类型都行（`prologue-action-gateway.ts`：`read-capability`、`change-capability`、`change-reversible` 共用的参数，和 `suggest-action`）。和 `board-wait` 的 `params` 是同一类问题，算设计问题。第 12～14 轮说明给检查器的参数带上类型有用（`{"item": …}` 从 5 次到 0 次）；网关按每个能力自己的输入 schema 声明，见 §6.0f。

之前各版（v2 没有发布，指纹都在同一行上改）：

| 轮 | v2 指纹 | 通过 | 主要失败 |
| --- | --- | --- | --- |
| 1 | `4e988abc` | 不算 | 夹具缺陷（DNS） |
| 2 | `4e988abc` | 0/4 | 标题当 `tool`、没写 `failed_marker`、`"true"`、没找到动作 |
| 3 | `b57a7683` | 2/4 | T1 接着做时没调工具；T3 超过 300 秒 |
| 4（只重跑 T1、T3） | `b57a7683` | 1/2 | T3 的 `{"item": …}` |
| 5 | `b57a7683`，参数错误带例子 | 1/4 | T1 没写结果；T3 `{"item": …}`；T4 `any` |
| 6 | `f3189e25`：收单个字符串、加了禁令、去掉 `non_empty` | 3/4 | T3：夹具缺陷，加上「判断类会被拒」的歧义 |
| 7 | `e5cee067`：写明判断类只是不能拿来等 | 3/4 | T3 用 `run-command` 调延后的工具 |
| 8 | `3f69f9e6`：加一句按名字调用 | 3/4 | 同第 7 轮 |
| 9～11 | `1c6292f9`（现行）：撤回第 6、8 轮为这个模型加的，留下三处设计修正 | T1 2/3，T2 0/3，T3 0/3，T4 3/3 | 见分类表 |
| 12～14 | `1c6292f9`，换包（#581：延后的工具调得动、`params` 带类型） | T1 3/3，T2 3/3，T3 1/3，T4 3/3 | T3 接着做时说了要调却没调 |

- 第 6～8 轮比现行版本过得多，原因是那几处为这个模型加的写法和代码。按 §11 不留，所以现行版本的数字更低，这是有意的。
- 口径改过四次：
  - 第 2 轮后：
    - 「轮询」从「最多看 2 次」改成「同一工具同一输入不看第二次」；
    - 宿主钩子的拒绝和 SDK 退回的参数错误分开数；
    - T4 收紧成「等待以 failed 结束」。
  - 第 5 轮后：T4 一度放宽，第 7 轮后改回严格的。
  - 第 6 轮后：接着做的那一轮带上同样的动作工具（夹具缺陷）。
  - 第 7 轮后：夹具批准动作工具的调用（夹具缺陷）。

**2026-10-16 补：延后的工具调不到。** 统筹转达用户的决定：先在这边去掉延后，上游改好、换包后再恢复。

- 不只评测里的 `builder`。按 main 上各角色的工具数，超过 20 个就全部延后，延后的谁都调不到：
  - Coding：`builder` 给 2 个以上动作工具时；`coordinator` 6 个以上；`writer` 10 个以上；`planner`、`reader`、`reviewer` 13 个以上；
  - `writers` 给 10 个以上，而且它没有 `find-tools`，连名字都看不到；
  - 业务一轮（助理、Todo）正好 20 个，再多一个，网关、委派、记忆这 13 个工具就全被延后。
- 暂时的做法：`prologue-node-port.ts` 不再设 `deferToolSchemasBeyond`（SDK 默认一个都不延后）。每次请求都带上全部工具的 schema，请求变长，大约多多少记在 PR 正文里。
- 证据：`tests/prologue-tool-declaration.test.ts`（PA-12）：`builder` 一轮给 4 个动作工具、超过 20 个工具时，每个工具都在请求里声明，没有只列名字的；替身模型按名字调用两个只读动作，各执行一次。先在 main 上看它红（延后时动作调用 0 次）。换包时这条改写成下面两条。

**2026-10-16 换包：恢复延后，检查器说出参数形状。** 上游 [Prologue #28](https://github.com/molis-ai/prologue/pull/28) 经用户同意合入（合并提交 `e4afd1a7`），一个改动里修了两处：

- 延后的工具：只列了名字的，Model 那道门也照收；`find-tools` 交出过形状的，这一跑之后的请求照常声明，记成 Run 事件 `tools-found`，接着历史的下一跑照它接上。
- `board-wait` 的 `params`：检查器经 `ConditionCheckers.list()` 与 `CheckerDescriptor.params` 说出参数 schema，`board-wait` 照它写成各检查器的 `anyOf`，登记时先按点名的那一个核，再轮到检查器自己的规则。

Molis 这边：

- 照 `vendor/prologue-sdk/README.md` 换成从 `e4afd1a7` 打的 `prologue-sdk-0.0.0-rc.1-found-tools.tgz`，删了 collaboration 包，`patch-history.json` 记一笔。同一棵树上 SDK 全量 0 失败（`desktop-computer-use.live` 没跑），13 个消费者脚本在这个包上全过。
- `prologue-node-port.ts` 恢复 `deferToolSchemasBeyond: 20`，删掉上面暂时的做法。
- `prologue-checkers.ts` 给两个检查器写参数 schema（structured 子集）：数组、布尔值都带类型；检查器自己的规则（一个状态只在一张表里、路径不出目录）照旧在后面核。
- 证据：
  - `tests/prologue-tool-declaration.test.ts`（PA-12）两条：`builder` 一轮超过 20 个工具、动作工具都只列名字时，替身模型按名字直接调，调用执行；先 `find-tools` 再调，下一次请求带着它的形状、名册上不再有它，没找的仍只列名字，调用执行。
  - `tests/prologue-external-checks.test.ts`（PA-17）：`board-wait` 的 `params` 每个检查器一份形状；`satisfied` 写成 `{"item": …}` 在登记时被拒，说出 `$.status.satisfied`，不登记等待，什么都不看。
  - 三条都先在旧包上看它红，见 PR 正文。

**换包后重跑（第 12～14 轮，2026-10-16）**：用户在本会话同意读钥匙串里的 key；统筹定的对照做法，不另跑一轮。

```text
改动：没有改措辞。对照第 9～11 轮，只换了包（Prologue #28，Molis #581）：延后的工具只列名字也调得动、find-tools 找过的之后照常声明；board-wait 的 params 按检查器带上类型
要解决的问题：T2、T3 卡在登记那一步写参数（{"item": …}、"true"）；T3 接着做时改用 run-command 去调延后的工具
环境：隔离的临时 Home（run-tests.mjs 每次一份）；MiniMax / MiniMax-M3，接口 anthropic-messages（api.minimax.cn/anthropic）；#581 的合并提交 fd695a5e；2026-10-16
任务：与第 9～11 轮相同的 T1～T4，措辞 coding-background v2（1c6292f9，#560 之后没改）
次数：每个任务 3 次（第 12～14 轮）
结果：三件事都过才算过。T1 3/3；T2 3/3；T3 1/3；T4 3/3（第 9～11 轮：T1 2/3，T2 0/3，T3 0/3，T4 3/3）
预测核对：params 里的 {"item": …} 0 次、字符串布尔值 0 次（预测 0，对上）；SDK 退回的参数错误 0 次；没有命令，延后的动作工具没有改用 run-command 去调（预测对上）
成本与时延：每个任务（含接着做的那一轮）平均 T1 17 秒、输入 3567 + 缓存 42231 token、输出 611；T2 18 秒、4400 + 37768、537；T3 22 秒、5601 + 39781、534；T4 9 秒、2494 + 15751、249。没有一次等不到或卡住
没变好的：T3 的 2 次，见分类表「等完以后说『现在调用 Judge job』」那一行
结论与未验证：只在这四个任务、这一个模型上成立。两处 SDK 修复以后，登记等待这一步 12 次都一次写对；剩下的失败在等完之后接着做的那一轮
```

- 延后的工具在用：第一轮先调 `find-tools` 取形状的，T2 3 次里 2 次、T3 3 次都是；接着做的那一轮，第一轮找过的直接调（`tools-found` 接上了），没找过的先 `find-tools` 再调（第 13 轮 T3 的「Judge job」）。
- 日志在跑的机器上，不入库；夹具不留请求头，日志里没有 key。

**2026-10-16 再换包：没点 `find-tools` 的角色也看得到延后的工具。** 上面「延后的工具调不到」那一节写过：`writers` 给 10 个以上动作工具，它没有 `find-tools`，名册跟着它一起没了，连名字都看不到。#28 只修了「看得到也调不到」，没修这一条。统筹转达用户的决定：在上游修，不在开跑时拒，也不要求每个角色都点 `find-tools`。上游 [Prologue #30](https://github.com/molis-ai/prologue/pull/30) 经用户在本会话同意合入（合并提交 `be78f726`）：一轮只要延后了工具，`find-tools` 就带着名册在请求里、调得动，不看这一轮的工具名单和 Character 点没点它；一条都没延后时照旧摘掉。理由和没选的两条写在 Prologue 的需求分册（`modules/tool/deferral.md`「搜索入口跟着延后走」）与短合同 `find-tools-with-deferral.md`。

Molis 这边：

- 照 `vendor/prologue-sdk/README.md` 换成从 `be78f726` 打的 `prologue-sdk-0.0.0-rc.1-find-tools-deferral.tgz`（同样的步骤打两次，逐字节相同），删了 found-tools 包，`patch-history.json` 记一笔。同一棵树上 SDK 全量 0 失败（`desktop-computer-use.live` 没跑），13 个消费者脚本在这个包上全过。
- 不改 Molis 源码：`writers` 的工具名单不变，角色不必为延后去点 `find-tools`。
- 证据：`tests/prologue-tool-declaration.test.ts`（PA-12）加两条。`writers` 一轮给 10 个只读查询，一共超过 20 个工具：
  - 请求里声明了 `find-tools`，名册上 10 个都在；先找再调，下一次请求带着找到的那个的形状，只有它执行了一次；
  - 照名册上的名字直接调，它的形状不在请求里，调用执行一次。
  - 两条都先在旧包（found-tools）上看它红，见 PR 正文。
- 不跑真实模型评测（统筹定）。

**留到后面的**：

- `molis.file-present` 只证明文件在（S-27 开放项）。
- 网关能力输入的类型：见 §6.0f。

### 6.0f 网关的能力输入带上类型（2026-10-16）

§6.0e「未验证」第 3 条：助理网关的 `read-capability`、`change-capability`、`change-reversible`、`suggest-action` 共用一份参数，`input` 六种 JSON 类型都收，能力真正的形状只在 `find-capabilities` 的结果文字里。和 `board-wait` 的 `params` 是同一类设计问题。方案经统筹排期、用户弹窗批准上游与评测（2026-10-16）。

- **做法**：工具个数、名字、调用形状都不变（工具一多就整批延后；助理带侧栏的一轮现在 21 个，已经延后，评测见 `specs/ai-development-handbook/spec.md` §9.5 BL-145）。这一轮找到的能力，下一次请求起在这几个工具的 `input` 上各有一支：标题是 `<capability_id>@<version>`，说明是「提供方 · 名称」，内容是目录里那份 `input_schema`；登记时那份通用的仍是其中一支。读的只在 `read-capability`，改的在 `change-capability`（可撤销的也在 `change-reversible`），`suggest-action` 两种都有。没有 `operate` 的角色不在改的工具上带。
- **上游**：[Prologue #31](https://github.com/molis-ai/prologue/pull/31)，会话给自己包里的工具参数加分支（`sessions.open` 的 `parameterBranches`，每次组请求时现问）。目录一个名字只登记一份形状，网关是一个固定的包，所以 Molis 自己做不到。Tool 那道门照旧按登记核，分支不放宽也不收紧能调什么。
- **Molis**：`horizontal/agent-host/src/adapters/prologue-gateway-declared.ts` 记下 `find-capabilities` 找到的、现在用得了的能力，按效果分给各工具；两份参数（`CAPABILITY_PARAMETERS`、`SUGGEST_PARAMETERS`）也搬到这里，`prologueActionGateway` 因此短了 11 行。`prologue-run.ts` 开会话时把回调交给 SDK。
- **上限**：每个工具最多 12 支，一支最多 8 KiB，一次请求所有分支合计最多 24 KiB；超出就从最早找到的去掉。依据：内置 479 个给 Agent 的动作，`input_schema` 的 p50 182 字节、p90 626、p99 2.3 KB、最大 5.3 KB（`goals.tree.submit@1`）、合计 155 KB，所以只能声明找过的。超出的照样调得动，`find-capabilities` 的结果里照样有它的 schema。
- **找过的属于这一轮**：新的一轮、宿主重启之后都从零开始，回到通用的那一份；调用不受影响。
- **数字题的单位**（同一个包，统筹 2026-10-16 转达、用户批准）：[Prologue #32](https://github.com/molis-ai/prologue/pull/32) 让 `ask-user` 的数字题可以带 `unit`，写成模型自己会说的话（如「分钟」）：一行、1 到 24 个字，只用来显示，答案仍是不带单位的数，存盘读回都带着。Molis 这边 `AgentQuestion` 加可选的 `unit`（改合同，`pnpm api:update`），`prologue-questions.ts` 投影时带上；插件 SDK 的题目规则（`question-rules.ts`）照同一条核，`tests/question-rules-consistency.test.ts` 两边对照。交互线 T1 用它在输入框旁显示单位，和「不能超过 240 分钟」一起；这个包合入之前，T1 只写界限。
- **不在这一片**：`normalizedInput`、`coerced`、`parseCapability` 里为模型写的纠正（字符串数字、字符串布尔、二次编码 JSON、写在身份旁边的字段）先不删。看评测：带上类型之后不再用到，另开一片由用户定。（已删，见 §6.0g）
- 证据：`tests/assistant-business-gateway.test.ts` 末尾两条（§6.0f），在新包配 main 的代码上先红；`tests/agent-typed-questions.test.ts`（AC-17）、`tests/question-rules-consistency.test.ts`（S1）带上单位后同样先红。
- **换包**：照 `vendor/prologue-sdk/README.md` 换成从上游 main `4e8468dd`（#32 的合并，含 #31）打的 `prologue-sdk-0.0.0-rc.1-parameter-branches.tgz`，同样的步骤打两次逐字节相同；删了 find-tools-deferral 包，`patch-history.json` 记一笔。同一棵树上 SDK 全量 355 个文件 0 失败（`desktop-computer-use.live` 没跑），13 个消费者脚本在这个包上全过。

**真实模型小评测**（统筹 2026-10-16 转达、用户弹窗批准）。记录按手册 16.3 的格式，没变好的按 §11 分类。

```text
改动：助理网关的四个能力工具，在这一轮找到的能力上给 input 带上类型（Prologue #31 + 本片）
要解决的问题：input 只有一份通用参数，模型把数组写成 {"item": […]}、数和布尔写成字符串，靠网关纠正或被合同拒
环境：每轮一个临时 Home；MiniMax / MiniMax-M3，接口 anthropic-messages（api.minimax.cn/anthropic）；2026-10-16
任务：真实 Todo 动作（定义与处理器都是 Todo 插件自己的），种好的待办都在当前项目里，审查一律批准
  G1 改一件待办的截止日期（expected_revision 是整数）；G2 今天计划的三件都推后两天（ids 数组、oneOf 的 change、整数修订号的映射）；
  G3 把已完成的一件归档（布尔加整数）；G4 先别直接记，给一个点了才加的按钮（完整的 create 输入，日期加嵌套的 waiting）
次数：每个任务每组 3 次。对照组是当前 main（76758783）的通用参数，同一份夹具、同一模型
结果：带类型 12/12；通用 11/12（G4 有一次没出卡片）
网关调用：带类型 30 次，29 次发在已声明类型的请求里，要纠正的 1 次（在 find-capabilities 之前，见下表）、被合同拒 0 次；
  通用 38 次，要纠正的 20 次（{"item"} 10 次、字符串数或布尔 16 次，一次调用可有两种），被合同拒 9 次
成本与时延：12 轮合计，带类型 148 秒、未缓存输入 226,822 token、缓存读 436,999、输出 6,707；
  通用 224 秒、126,094、330,325、9,507。带类型的未缓存输入多八成：找到能力后工具的声明变了，提示缓存从工具那里断开（MiniMax 没报缓存写入）
没变好的：见下面的分类表
结论与未验证：只在这四个任务、这一个模型上成立。找过的能力带上类型之后，数组、整数、布尔都按类型写；通用参数下同样的任务在 G2 每轮都先被拒
```

- 夹具的做法：
  - 密钥只在那一条命令上从钥匙串内联读取，不写文件、不进日志。
  - 夹具只留请求里的 messages 与 tools、回复里的工具调用（模型写的原样）、文字与用量，不留请求头。
  - 每次调用的「要纠正」按网关自己的 `normalizedInput` 判：纠正前后不同，或写在身份旁边、`input` 写成字符串、带 `{"item": …}`。
  - 评测文件引用包内部（`apps/local-host/dist/assistant/*`），按 `pnpm health:check` 不能作为新测试文件入库，留在统筹共享笔记里（`adoption-gateway-eval.live.test.ts`），两个工作树各拷一份跑。
  - 跑第一遍时有两处夹具缺陷，那一遍作废、全部重跑：
    1. 种待办用的「今天」和模型看到的不是同一天（过了上海的零点），种的待办也不在当前项目，模型按项目筛就看不到；
    2. G3 判过的读法不带 `archived: true`，归档后的待办读不到。G3 两组都用修好的判法另跑了 3 次。

| 失误 | 出现在 | 分类 | 依据 | 处理 |
| --- | --- | --- | --- | --- |
| 数组写成 `{"item": […]}` | 通用：G2 3 次都有（8 次调用），G4 一次（2 次调用）；带类型 0 | 设计问题 | 通用参数下 `input` 没有形状，能力的 schema 只在结果文字里；同一模型、同一任务，声明了类型之后 6 次批量与卡片调用（G2、G4 各 3 次）都写成数组 | 本片 |
| 数和布尔写成字符串（`"1"`、`"2"`、`"true"`） | 通用：G1 一次、G2 两轮、G3 3 次都有；带类型 0 | 设计问题 | 同上；`coerced` 能改回大部分，改不了 `expected_revisions` 这种映射里的值，G2 的批量处理因此被拒 | 本片；纠正代码先不删（见上「不在这一片」），§6.0g 已删 |
| 批量被拒后改成三次单件修改 | 通用 G2 的第 2、3 轮 | 设计问题（同上两行的后果） | 结果对，但不再是一批，撤销要三次 | 本片 |
| 卡片被拒后说「调整一下再试」，却没再调就结束 | 通用 G4 第 2 轮 | 拿不准 | 被拒的原因是 `{"item"}`（设计问题）；被拒之后说了要再试却以文字结束，和 §6.0e 那条「说了要调却没调」同类，没有对照分不开 | 不改。按 §11 不加「说了要调就要调」一类的措辞 |
| 没找就猜了一个能力身份，`input` 写成 `"{}"` | 带类型 G2 第 3 轮 | 模型能力 | 第一次调用在 `find-capabilities` 之前，这时还没有可声明的能力；目录里也没有这个身份，这次调用不会成；之后它先找再做，结果对 | 不改 |

- 未验证：
  - 只量了 Todo 的动作和这四种写法。别的插件 schema 更大，一轮找到很多能力时会碰到 24 KiB 的上限，最早找到的就不再声明，那时的写法没有量过。
  - 缓存断开的花费是这一个模型、这一种提示结构上的数。要省它，得让声明在一轮里少变（比如找到后一次给齐），那是另一片，要先看真实的轮次分布。

后续：上面「不在这一片」的纠正已由用户定（2026-10-16）全删，见 §6.0g；删后的同一组评测与按 §11 的分类也记在 §6.0g。

### 6.0g 网关不再替模型改形状（2026-10-16）

§6.0f「不在这一片」的那几段纠正，用户弹窗定（2026-10-16）：这一片做，叠在 #615 上；还没 `find-capabilities`、`input` 仍是通用参数时也一律不纠正，按合同拒；`normalizedInput` 里另两处同类的一起删。

- **删掉的**（`horizontal/agent-host/src/adapters/prologue-action-gateway.ts`）：
  - `coerced`：写成文字的数和布尔（`"1"`、`"true"`）不再改成数和布尔；
  - `input` 写成 JSON 字符串（含二次编码）不再解开；
  - 纯文本不再当成唯一必填文本字段的值，空白文字不再当成 `{}`；
  - `parseCapability` 不再把写在身份旁边的字段并进 `input`。
- **现在**：能力收到的就是模型写的 `input`（`capabilityInput`）。只有一处不是纠正：`input` 整个没给、合同要对象时是 `{}`，因为工具登记里 `input` 本来可省。写错的由能力合同判，在审查之前拒绝（`gatewayProblem`），回给模型的照旧是合同、出错位置上它写的值和整份 `input_schema`；建议卡（`suggest-action`）同样经合同拒，不记卡。写在身份旁边的字段不悄悄丢掉（丢了可能拿空的 `input` 跑出错的结果），也按合同拒，说明是哪几个字段。按钮自己的字（`title`、`summary`、`editable`、`missing`）照旧不算。
- 找之前和找之后同一套：评测里唯一一次找之前要纠正的调用，猜的是目录里没有的身份，本来就会被拒（§6.0f 表最后一行）。
- 每轮动作工具那份 `suggest` 工具（`prologue-action-tools.ts`）用同一个 `capabilityInput`，也不再纠正；它要建议的那几个动作工具，形状本来就完整声明在请求里。
- 测试（行为有意改变，不是放宽）：`tests/assistant-business-gateway.test.ts` 里原来断言「按它的意思收下」的五条，改成断言被合同拒、拒绝里带合同或出错位置，改对之后照常审查、出卡或读到；§6.0f 那条 `input: ""` 的读取现在先被拒、再用 `{}` 读到。`tests/issue-assistant-repair-page.e2e.test.ts`（ISSUE-25、ISSUE-34）回放的正是写在身份旁边的那次 MiniMax 失误，不用改，照样通过。

**真实模型小评测**（用 §6.0f 同一份夹具，MiniMax 按授权不再弹窗问）。记录按手册 16.3 的格式，没变好的按 §11 分类。

```text
改动：助理网关删去为模型写错形状做的纠正（字符串数与布尔、JSON 字符串、纯文本当字段、空白当 {}、写在身份旁边的字段）
要解决的问题：§6.0f 带上类型后纠正几乎不再用到（30 次调用 1 次，且在找之前）；纠正留着就是替模型猜，形状错了模型看不到
环境：每轮一个临时 Home；MiniMax / MiniMax-M3，接口 anthropic-messages（api.minimax.cn/anthropic）；2026-10-16
任务：§6.0f 的 G1–G4，同一份夹具（真实 Todo 动作，审查一律批准）
次数：每个任务 3 次。对照是 §6.0f 的带类型组（同一模型、同一夹具，纠正还在）
结果：11/12（G4 第 1 轮没出卡片，这一轮没有调用网关）；§6.0f 带类型组 12/12
网关调用：35 次，全部发在已声明类型的请求里；按旧纠正算要纠正的 2 次（同一轮里一模一样的两次），被合同拒 2 次（就是这两次）；
  §6.0f 带类型组 30 次、要纠正 1 次、被拒 0 次
成本与时延：12 轮合计 172 秒、未缓存输入 232,398 token、缓存读 432,163、输出 7,782；§6.0f 带类型组 148 秒、226,822、436,999、6,707
没变好的：见下表
结论与未验证：只在这四个任务、这一个模型上成立。找过的能力带上类型之后，删掉纠正没有让结果变错：唯一一次本来会被纠正的写法被合同拒，模型换成单件修改做对了，没有错写或多写
```

- 夹具：评测文件同 §6.0f，留在统筹共享笔记里；网关不再导出 `normalizedInput`，「要纠正」改用评测文件里内联的一份旧纠正来判，只用来计数。

| 失误 | 出现在 | 分类 | 依据 | 处理 |
| --- | --- | --- | --- | --- |
| 已声明为整数的 `shift_days` 写成 `"2"`（`todo.items.batch` 的 `change`，`oneOf` 里的一支） | G2 第 3 轮，两次 | 模型能力 | 这次请求里这一支的类型是声明了的；发在已声明请求里的调用，§6.0f 的 29 次和这次的另外 33 次都按类型写，只有这一轮写错 | 不改。旧的 `coerced` 会改回来；现在被合同拒，在任何效果之前 |
| 被拒后原样重发一次，再改成三次单件修改 | G2 第 3 轮 | 拿不准 | 拒绝里有 `/change/shift_days type`，但夹在 `oneOf` 各支的 11 条错误里，「出错位置」取的是第一条 `/change`，给的是整个 `change` 对象；没有对照分不开是说明不够清楚还是模型能力。结果对，撤销要三次（§6.0f 通用组同类） | 不改（一次，不成模式）。写进未验证 |
| 说「按钮准备好了」却没调 `suggest-action`，`ask-user` 的选项格式不对被拒，这一轮停在第二次 `ask-user` | G4 第 1 轮 | 模型能力 | 这一轮一次网关调用都没有，和删掉的纠正无关；选项格式是 `ask-user` 自己的合同。§6.0f 通用组也有一次「没出卡片」 | 不改。说做了却没做的那一句见未验证 |

- 其余 10 轮（G1 三轮、G2 第 1、2 轮、G3 三轮、G4 第 2、3 轮）结果对，网关调用没有失误、没有被拒，不需要分类。

- 未验证：
  - 拒绝的「出错位置」对 `oneOf` 取第一条路径，这时指的是外层对象而不是真正写错的字段。只见过一次，没有量过换成最深那条路径会不会让模型一次改对。
  - G4 第 1 轮的回复说按钮已准备好，实际没有卡片。停止检查（`ensureStopGuard`）拦「说改了却没有成功的改动」，这一轮停在 `ask-user` 上、说的是卡片不是改动，没有拦到。会不会误导用户、要不要由工程层核对（有没有记下的卡），是另一片，要统筹定。
  - 别的插件的 schema 更大，一轮找到很多能力时超出 24 KiB 的那些不再声明，那时模型写错的会直接被拒，没有量过。

### 6.0h A5：补 §6.0b 第 2、5 项缺的证据（2026-10-17）

只加用例，没有改源码。两条在 main `6696a15be` 上都直接通过，说明实现本来就对，缺的只是证据。

- **第 2 项（PPT 零派出）**：`tests/action-before-effect.test.ts` 的撤权、停用、取消循环加上 PPT（`ppt.outline_ai`）。断言与另外五个插件相同：`dispatched === 0`、库不变、恢复后能写。把构建产物里 PPT 传给模型口的 `beforeDispatch` 去掉，三条都变红；还原后通过。
- **第 5 项（修改回执不被微压缩）**：`tests/assistant-business-gateway.test.ts` 加一条请求级用例。用真实网关与助理，先经审批做一次修改（回执 800 多字节），再读五次（每次也是 800 多字节），然后看最后一次请求：
  - 第一次读的结果被换成了 `[observation compacted: read-capability …]`，说明压缩确实跑了；
  - 修改回执原样都在。它在请求里的位置比第一次读还早，所以留下来只能是因为效果种类（`mutate-external` 不可重读）。
  - SDK 默认的压缩档是保留最近 4 轮工具、小于 512 字节的不收，Molis 没改。
  - 试过把构建产物里 `change-capability` 改成 `safe-read`：那样改连审批都跳过了，这条是等审批超时而失败，不是因为回执断言，所以不算证明。区分靠的是上面那一组对照。

### 6.0i P4-C1：协调者带板工具；Coding 一半里留下的几样（2026-10-17）

**统筹 10-17 定 A**（§6.0d「留到后面的」第 1 条）：Coding 的协调者角色（`coordinator`，`plugins/native/coding/src/roles.ts`，版本 13 → 14）加上 `board-read`、`board-report`。理由：孩子拿到的工具不会比父亲多（SDK T12），协调者没有板工具，它让出给的孩子就报不了交给自己的那一步，父亲那一步的等待总是 `failed`，照样往下走。

- 孩子的角色（`coding-reader`、`coding-reviewer`）和所有提示词都没改：SDK 给绑了步骤的孩子补上父亲有的这两个工具，宿主的子角色工具名单不用动。
- 边界还是宿主的板钩子（`prologue-taskboard.ts`）：只读本项目的板，只报自己持有的步骤。
- 用例 `tests/coding-coordinator-board.test.ts`（夹具模型，只引包名）。第一条（PA-11 的切片）证明三件事：
  - 让出的孩子报了自己那一步，父亲的等待 `satisfied`，接续 `eligible`；下一轮再报那一步，回 `TASKBOARD_CONFLICT`（已经结束）；
  - 读、报别的项目的板，被钩子拒（「只能读取或回报本项目的任务图」）；
  - 报同项目另一个会话持有的步骤，回 `TASKBOARD_NOT_ASSIGNED`，那个会话的计划没变。
- 第一条在 main 上是红的：协调者那一轮直接失败。
- `prologue-adoption-guard` 里 PA-23 那条的注释改成指向这条用例，断言没变：那个孩子只回答、不报步骤，等待照旧 `failed`。
- 顺带的变化：`STEP_TOOLS` 这道检查现在对协调者也通过了。人选「协作」又带着确认过的计划开跑时，以前宿主拒（「当前角色未开放计划回报工具」），现在照计划跑。统筹 10-17 要求补断言：同一文件第二条（PA-09 的计划部分），协调者带两步计划开跑，不被拒，计划的两步都归本会话，按顺序报 `running`、`succeeded`。协调者去掉板工具时，这一条以那句拒绝失败。

**§4.6.9 里 Coding 那一行，这一片核过以后留下的**（理由逐条写在这里，不留第二份实现，也不加兼容）：

| 项 | 现在 | 为什么不删 |
| --- | --- | --- |
| `following` 去抖 steer（`prologue-taskboard.ts`） | 别人改了这一跑计划里的某一步（子任务回报、交回），停 1.5 秒后给这一跑发一句「任务图有更新」 | SDK 的接续只把「等待的结果」交给活着的那一跑，子任务写回只交最终报告（`describeSubagentReport` 里没有步骤和交回）；板上步骤的变化 SDK 不送。`coding-step-claims` 断言了这句话。要删得先开一刀 Prologue，让板上的变化在模型边界交给持有者 |
| 2 小时认领过期（`CLAIM_EXPIRES_MS`） | 持有步骤的会话没有在跑、两小时没动静，就标「认领已过期」，什么也不收回 | 计划的步骤上没有等待：一跑绑的是会话那一块，不是计划的步骤，所以「代次与等待期限」在这里没有可读的。这条只改显示，规则是人定的。没有用例，列在下面「未验证」 |
| `last-start:<会话>` | 那一轮开跑时的方式（intent、模型、思考强度、目录、actor、原任务） | P3a 定了接续由 Coding 自己用请求键起跑（§4.6.10「接续起跑」）。下一轮要按同样的方式开，这些是 Coding 自己的请求内容；Run 视图冻结的开跑记录（`AgentFrozenStart`）是宿主那一半：有角色和 `model_id`，没有 intent、provider、工作区编号、actor 和 `origin_task`。不新增动作 |
| `wake-note:<等待>` | 只存「自动开始没成功：<原因>」 | 接续的 `control` 只有 `cancel-wait`、`continue-now`，没有地方记「起跑失败的原因」。C2 给 `control` 补 `retry`、`resolve-reconciliation` 时再看能不能记在接续上；被拒的开跑照旧不写 |
| 内存 `busy` / `waking` | 会话正在接收发送时不接接续；一个 runtime 一个叫醒循环 | 进程里的并发闸，不是事实；P3a 定了起跑归 Coding，叫醒循环本身留着 |

§4.6.9 写的「删除，改读等待与接续视图」，前提是宿主起跑接续；P3a 改成了 Coding 自己起跑。以 P3a 为准。

**真实模型实走**（MiniMax，按授权不再弹窗问；评测文件没入库，留在本会话的草稿里）：

```text
改动：Coding 协调者带 board-read / board-report，让出的孩子能报自己那一步
要解决的问题：让出给孩子以后，父亲那一步的等待总是 failed
环境：每轮一个临时 Home，跑完即删；MiniMax / MiniMax-M3，anthropic-messages（api.minimax.cn/anthropic）；2026-10-17
任务：协调者，「派一个代码调查子任务去读 README.md，数一下它有几个二级标题。派出去以后你这一轮就收工、把这一步交给它，不要自己去读；等它做完再接着告诉我结果。」（README 有 3 个二级标题）；审查一律批准；等待满足、接续 eligible 时开下一轮「接着做。」
次数：7
结果：7/7 答对（3 个，列出 Install / Use / License）；7 次孩子都调了 board-report 报自己那一步（让出的 2 次报成了，等待因此满足；前台的 5 次没核对回报的结果）
让出：2/7 带 yield（第 1 次、第 4 次）：等待 satisfied、接续 eligible，下一轮直接用孩子的结果作答；其余 5 次是前台派出（没带 yield、background），同一轮里拿到孩子的报告作答，没有等待
结论与未验证：让出时这一决定按设计工作（2/2）；模型多数时候不让出，见下表
```

| 失误 | 出现在 | 分类 | 依据 | 处理 |
| --- | --- | --- | --- | --- |
| 人说了「这一轮就收工、把这一步交给它」，却前台派出、同一轮等结果 | 7 次里 5 次 | 拿不准 | 协调者的提示词（`coding-coordinator` v5）没讲什么时候让出，只有工具说明里有 `yield`；分不清是提示词没写还是模型没照着人的话做。结果没有错 | 不改提示词、不加规则（§11）；要不要在协调者提示词里写让出，交 AI 手册线 |
| 第一次派出把 `tools` 写成对象，被拒后改对 | 第 5 次 | 模型能力 | 合同按 schema 拒，拒绝里有位置，模型下一次写对 | 不处理 |

- 未验证：
  - 认领过期的显示没有用例（上表第 2 行）。
  - 「人选协作并带计划」没在页面上走过（只有上面第二条非浏览器用例）。
  - 让出之后等很久（几小时）、宿主中途重启再接续，这一片没量。

### 6.0j P4-C2：人改计划走协作合同（2026-10-17）

人在任务图上改一轮的计划，从 typed 能力 `agent.run.step-board.amend.v1` 换成动作 `agent.collaboration.revise.v1`（§4.6.9「动作」一段）。阶段一不留兼容：旧 id 不留别名，typed 条目 `agentHostCapabilities.amendStepBoard`、Host 的注册与 `AgentRuntimeAdapter.amendStepBoard` 同一刀删掉（health 的 typed 能力位点 190→187）。

- **合同**（`packages/contracts/src/services/agent-collaboration.ts`）：
  - 新动作 `agent.collaboration.revise.v1`，版本 1：`kind: operation`，`operation: command`，`effect: write`，只给插件。
  - 输入：`runtime_id`、`session_id`、`run_id`、`amendment`、`expected_version`（整数，≥1）。`amendment` 用 `oneOf` 列出现有的六种修订，每种只收自己的字段：步骤引用写成 `step-N` / `user-N`，文字非空、有上限，和 Coding 页面的检查一致。
  - 输出：`{ board }`。
  - actor、项目、安装都从调用上下文来：actor 是调用的插件的 actor，读不到时用会话的主人，和旧能力一样。
  - `AgentCollaborationPort` 加 `revise(run, amendment, expectedVersion, actorId)`。
- **宿主**：
  - `session-actions.ts` 注册这个动作：先核这一轮属于这个会话、会话属于调用方的项目和插件，提交前再确认调用仍然有效，被取消、撤权的调用什么都不改。
  - 适配器的 `collaboration.revise` 沿用原来那段检查：一轮结束以后，只有它还是会话里最新的计划轮、计划图也没结束，才能改。
  - Node 组合里，`revise` 由计划步骤那一块（`stepBoards.amend`）提供，等待那一块不管它。
- **Coding**：`coding.plan-amendments` 路由改调这个动作；页面上的检查和「告诉正在跑的那一轮」都不变。
- **同一刀没做的**（§4.6.9 写过；这一刀不做，理由是现在没有调用方，加了就是没人用的合同）：
  - `control` 的 `retry`、`resolve-reconciliation`：接续停下等人的三种情况（`blocked`、`needs-reconciliation`、`eligible` 但不自动），页面现在都只给「现在开始，或取消等待」，走的是已有的 `continue-now`、`cancel-wait`。没有「重新试」「核对后继续」这样的按钮要接。
  - `revise` 的「取消节点」「重试节点」：现有六种修订里，「跳过」已经是取消；失败步骤的重试，页面上没有入口。
  - 以后页面要这几样时，再按 §4.6.9 加进这两个动作，同时升 `version`。
- **用例**：
  - `tests/agent-collaboration-revise.test.ts`（新，只引包名）：
    - 动作只给插件，schema 在任何处理之前拒掉写错形状的修订（坏引用、空白原因、不认识的种类、错的方向、`mine: false`、多出的字段、版本 0 或小数、带 `actor_id`、缺版本），六种都能通过；
    - typed 的修订已经不在了；
    - 修订带着人的改动、看到的版本和调用插件的 actor 交给那一轮；
    - 被取消、被撤权的调用，以及别的会话的轮次，都不改任何东西。
  - 改用新路径的：`coding-plan-amend-http`（路由经动作目录调 `revise`）、`prologue-step-amend`、`prologue-project-board`、`coding-step-claims`、`coding-runtime-regressions`。断言没变，只换了调用的入口，并把原来省掉的 actor 写成 `"user"`。
- **快照**：
  - `pnpm api:update` 改了 `contracts/services/agent-collaboration`（加了动作、类型和端口方法）和 `contracts/services/agent-host`（去掉了 `amendStepBoard`）；
  - `pnpm actions:update` 在宿主登记的动作里加了 `agent.collaboration.revise.v1@1`。
- **换包**（用户 10-17 弹窗同意并进采用线下一次换包；统筹定随 P4 第一个改合同的片）：
  - vendored SDK 从 parameter-branches（`4e8468dd`）换成 reference-kinds：上游 main `c673238e`（[Prologue #33](https://github.com/molis-ai/prologue/pull/33) 的合并：统筹经用户弹窗同意后合入，树与评审过的 head `a579bfea` 相同），干净 `git archive` 打两次，逐字节相同（1,190,630 字节，SHA-256 `585909b1…`）。
  - #33：App 可以在 `config.tool.askUserReferenceKinds` 列出对象引用题能要的种类，配了 `refKinds` 就是这几个名字的 `enum`，名单外的打开等待前就失败；不配时与原来逐字相同。Molis 这一刀只换包、不配名单，名单由交互线 T2 接上。
  - 验证：同一棵树上 SDK 全量 355 个文件，3949 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`）；13 个消费者脚本在新包上全过。
  - 旧包和它的 `.sha256`、`.provenance.json` 删掉，记进 `patch-history.json` 的 `packagesWithoutPatch`（第 21 个），`upstream.commitsChecked` 加上 `c673238e`，逐项核对过：除三个已换掉的过渡包来源以外，都是 main 祖先。
- **对调用方的影响**：
  - 仓库里唯一的调用方是 Coding 的计划调整路由，同一刀改完；
  - 工作流程步骤、绑定、MCP 工具名、Skill 都没有点名过旧能力；
  - Coding 的 Manifest 按 `agentCollaborationActions` 全部列出，自动包含新动作。
- **验证**（变基到 main `04ab0216` 之后）：
  - `pnpm build` 通过；`affected-tests` 选的非浏览器用例，加上 vendor-provenance、S-13 `prologue-memory-boundary`、PA-12 `prologue-tool-declaration`、问卷两条与 `coding-coordinator-board`，146 个文件全过；
  - `pnpm test:security` 58/58（S-13 在新包上再过一次）；`pnpm test:contracts` 44 个文件里 43 个一次过，`action-gateway` 的「production stdio」一条在机器满载时超了 20 秒时限，单独重跑 13/13 过、那条 1.8 秒；
  - `check-health-gates --base origin/main`、`boundary:check`、`verify-release-versions`、`page-assets --base origin/main` 都过：typed 能力位点 190→187，页面资源逐项不变。
- **未验证**：浏览器用例交给全量（统筹 10-17 定）；全量由统筹跑。

### 6.0k P4 助理一半 A1：每个 Work 一块任务图，子任务是图上的步骤（2026-10-17）

§7.5 第 5 条的第 1、4、5 项。统筹 10-17 定了五条：第 1、4 条由用户在弹窗里定，第 2、3、5 条统筹照推荐定。

- 第 1 条：每个 Work 一块图，它的子任务也在这块图上，Work 之间不交接。
- 第 3 条：一次跟进一个步骤。
- 第 5 条：A1 先做。

交回与自动接着做（第 2、3 项）是 A2，后台作业是 A3。这一片还没动它们，`handed_back_run`、`hand_back_held` 和按结果键起跑都还在。W5-10 的形状照旧：

- `AssistantDelegations` 只经端口依赖宿主；
- `assistant-service.ts` 与 `AssistantStore` 的类只变小：`AssistantService` 少 3 行，`AssistantStore` 行数、方法数不变。

**合同**（`services/agent-collaboration`）：

- `AgentCollaborationPort.works?: AgentWorkGraphPort`，五个方法：
  - `open`：同一个键给同一块常驻图；根由这项工作的会话负责。
  - `add`：在根或某一步下面加一步，归某个会话。重复加不变。
  - `read`
  - `watch`
  - `end`：结束一步还没结束的。带 `actor_id` 时记为这个人的决定；不带时记为持有它的会话放弃了它。
- `AgentWorkNode`：步骤 id、上一层、标题、SDK 的状态、持有它的会话，以及「人结束的」（时刻和说明）。
- 这个端口挂在已有的协作口上，没有加在 `PrologueAgentAdapter` 上。那个类是巨大单元，不许变长。
- 助理的公开视图没变：`AssistantWork.delegated_by` 还是 `{ work_id, title, acceptance, taken_back_at? }`，其中 `work_id` 由图推出来。

**宿主**（新文件 `prologue-work-graphs.ts`）：

- 板与步骤：
  - 一块图用 `molis-work:assistant-work:<work_id>` 当幂等键开，常驻，保留最近 64 个已结束的步骤。
  - 根叫 `work`；子任务的步骤是 `p-<编号>`，挂在根下；跟进是 `<子任务>.f<n>`，人在子 Work 里自己开的一轮是 `<子任务>.r<n>`。
  - 会话在哪块工作图上，记在宿主的会话索引里（`work_graph`）。
- 一轮站在哪：这样的会话开一轮，绑在它在那块图上持有的、还没结束的那一步上（`roundBinding` 第一行）。那一步若被挂起等人，先由 `readyStep` 转回 `ready`。
- 一轮结束时：
  - 子任务那一步跟着这一轮结束（completed → succeeded，failed、cancelled 照抄），按 `attemptOf` 找到的那一代报。
  - 人中途结束了那一步，或者它已换代，这一轮就不报。
  - 根不结束：工作还在继续。
- `prologue-run.ts` 只多了这两行，加一个类型。

**助理**（`assistant-delegation.ts` 就地改）：

- 存储与看板：
  - 父 Work 存 `graph_id`，在第一轮开跑前打开（`place`，在 `dispatch` 里 `host.start` 之前）。
  - 子 Work 的 `delegated_by` 变成：图、它被派出时的那一步、父工作当时的标题、验收标准，再加 `taken_back_at`。哪项工作派的从图找；`follow_ups` 删了，从图数。
  - `delegatedBy(actor, parent)` 按图找子 Work。
  - 父工作看板上的子任务列表（`parts`）读图。
- 等待与交回：
  - `status` 等图的变化：要等的子任务都没有未结束的步骤就返回。`watchWorks` / `waitForWorkChange` 不再用于委派。
  - 子任务的一轮结束以后，交回在它那一步结束时触发，看图，不看跑的终态。宿主报那一步比跑的终态晚一点；按跑的终态触发，交回会把子任务算成还没做完，不往下走。
  - 「有子任务还没做完时不往下走」改读图（`owed`）。
- 并行上限：在做的 3 个数图上还有未结束步骤的子任务。
- 人核对后关闭子任务中断的一轮（`closeInterrupted`）：这一部分没结束的步骤由人结束，父工作可以往下走。

**定下的几件事**（记进 §7.7）：

1. **收回不交接给父会话。** §7.5 第 4 项写的是「改图交回父节点（代次 +1）」，实现是：
   - 人把这一部分还没结束的步骤结束（取消，记为人的，代次 +1，子任务那一轮再也报不了）；
   - 「这部分由父工作自己做完」记在子 Work 上（`taken_back_at`）。

   理由：
   - 父的轮站在根上。交给父会话的那一步没有轮站在上面，永远不结束：A2 在父节点上挂的等待会等不到它，父会话在图上也会一直挂着一步没做完的。
   - 已结束的子任务没有步骤可交：SDK 只交接没结束的。而界面上已完成的子任务也能收回。
   - 谁来做完这一部分，是 Work 的业务决定，和验收标准一样留在 Work 上。
2. **子任务还有没结束的步骤时，跟进被拒**（`assistant.state`）。没结束包括还在跑、等人回答或确认、被重启截断。
   - 以前会把话送进正在跑的那一轮。
   - 理由：一次跟进一个步骤（第 3 条）。送进正在跑的一轮就没有步骤可记，上限也就数不准。工具说明写的本来就是「它的下一轮」。
3. **人在子 Work 里自己开的一轮**，站在子任务下面新加的一步上，不算跟进。
4. **每个助理 Work 都有图**，回帖用的 Work 也有。Coding 执行的 Work 没有：它的轮在 Coding 会话里。「助理把工作交给编码角色时，那个会话绑在助理 Work 的子节点上」不在 A1。
5. **存量**：
   - A1 起只认现行形状。没有 `graph_id` 的旧 Work，在它下一轮开跑前开图。
   - 旧形状的子 Work（`delegated_by.work_id`）不读，由 A4 合入前的一次性脚本改（用户 10-17 第 4 条）。A4 定了改法：去掉它们的 `delegated_by`，各自成为独立的工作，正文、轮次和结果都留着（用户 10-17 弹窗定，§6.0q）。
   - 在那之前，跑新代码的 Home 上，旧的子任务不出现在父工作的看板上，也不会触发交回；Work 本身和成果都还在。
   - 真实 Home 在用户同意前不碰。用户 10-17 同意在助理库的只读拷贝上演练，结果见 §6.0q：一项 Work 也没有。

**验收**（`tests/assistant-delegation.test.ts`，夹具模型，真实 Prologue 节点适配器）：

| 编号 | 证明 |
| --- | --- |
| WG-01 | 委派后，父工作的图上有两步：根 `work`，由父会话持有，`running`；子任务那一步挂在根下，由子会话持有，跟着它的一轮 `succeeded`。子 Work 没有自己的图，图上能找到哪项工作派的 |
| WG-02 | 两次跟进各是子任务下面的一步（`.f1`、`.f2`），已结束的那一步不重开；第三次被上限拒；看板上的跟进次数从图上数 |
| WG-03 | 收回后，子任务那一步 `cancelled`，记为人结束的、带收回的说明；父会话在图上只持有根 |
| WG-04 | 七次起不来的委派，图上没有留下还没结束的步骤 |
| W2-18-DELEGATION-PLACED-01 | 人在已完成的子任务里发的一轮没开起来（没有模型）：为它新加的那一步（`.r1`）由持有它的会话结束（「这一轮没有开始」），图上没有开着的非根步骤；随后三个新子任务都能交出，父工作又被交回一次 |

原有断言照留：边界、上限、停止、归档后仍算数、交回、W2-18 的几条竞态。

回归修复（10-17，防腐线复查 #637 时发现）：发一轮的路径先在图上放好这一轮站的步骤，再开跑。开跑失败时（发送被后一次取代、Character 版本被拒、没有模型），新加的那一步没有结束，子任务在图上一直「还在做」：父工作不再被交回，名额一直被占，追加也被拒。现在由 `AssistantDelegations.startPlaced` 包住开跑：这一轮新加的步骤，开跑失败就结束；复用已有的步骤时不动。委派时第一轮起不来的那条路径本来就由 `delegate` 结束。开跑请求本身（项目、会话、角色、材料、图片、预算、浏览器、Character）搬进 `assistant-round-start.ts` 的 `roundStartInput`：它只由 Work 和这一轮的输入算出，不需要 `AssistantService`；开跑包进回调后照常写，类也跟着变小。

余项 BL-154（10-17，防腐线 §10.24 记下，统筹定了改法）：同一会话两轮同时发，前一轮加了 `.rN`，后一轮读图见它开着就沿用，前一轮随后起不来时，原来会把后一轮正在跑的这一步结束掉。现在失败分支只结束还是 `ready`（没有哪一轮在上面开始过）的那一步；已经有一轮开始了，这一步归那一轮，由它结束。看状态和结束是同一步：`AgentWorkGraphPort.end` 带 `if_ready` 时，适配器对同一次读到的图判断状态，并按那一次的版本结束，中间有变化就结束失败、这一步留着（统筹审 #665 时指出：在 Molis 这边先读再结束是两步，另一轮仍可能在两步之间从 `ready` 走到 `running`）。剩下的窗口：后一轮已经选定这一步、还没开始时前一轮结束了它，后一轮起跑时被拒（这一步已结束），人重发一次就落在新的一步上，图上不会有跑着却算「结束了」的子任务。用例 W2-18-DELEGATION-PLACED-02（两轮真的同时发）、-03（适配器：跑着的一步留着，`ready` 的结束）。

- 验证（变基到 main `5239a371` 之后）：
  - `pnpm build` 通过。`pnpm api:update` 没有再改快照：`contracts/services/agent-collaboration` 只多 `works?`、`AgentWorkGraphPort`、`AgentWorkNode`，和 §6.0j 的 `revise` 并存。
  - 助理的全部非浏览器用例，加上 §6.0j 的修订用例（`agent-collaboration-revise`、`prologue-step-amend`、`prologue-project-board`、`coding-step-claims`、`coding-plan-amend-http`、`coding-runtime-regressions`）和 `prologue-taskboard`，共 40 个文件，39 个一次过。
    - 第 40 个是 `system-search-lifecycle`：在机器满载（负载 16～21）的批次里红了三次，都是刚建的目标还没进索引，搜索就先回答了。
    - 单独跑时，这条分支和干净基线（main `446c0521`）同时各跑三次，都是 3/3 过。判为负载下的时序，不是这一片引入的。
  - 变基前跑过 `affected-tests` 选的 193 个文件，满载下 13 个红。单独重跑后过了 10 个。
    - 剩下的 `installed-plugin-host`、`prologue-documents` 是超时（30 秒、120 秒）；`system-search-lifecycle` 同上。
    - 这三个在基线上一次都过。
  - 变异：去掉 `ended()` 那一行，`assistant-delegation` 的 11 条里 7 条红。
  - `check-health-gates --base origin/main`、`boundary:check` 都过；`pnpm test:security` 58/58，`pnpm test:contracts` 44/44。
    - `AssistantService` 1643→1640 行，方法数 98 不变；`AssistantStore` 不变；`assistant-delegation.ts` 的类 293 行，在 300 以下。
- 未验证：
  - 两个浏览器用例（`assistant-handback.e2e`、`assistant-follow-live.e2e`）留给统筹排的全量。
  - 真实模型没走：这一片不改提示词，也不改工具说明。
  - 宿主中途重启以后，子任务那一步怎么对账：SDK 的重开对账照旧，Molis 这边没有单测。

### 6.0l App-tools 只读外部等待的统一 SDK（2026-10-17）

状态：本节实现与验证完成，Prologue #35 和 Molis #644 均已合入；Molis 的合并提交为 `447bec2e039aacd8b8a64438b1353c72071b87e4`，PR CI 与合并队列必需检查通过。用户已授权这份等待修复推送、开 PR、检查通过后合入并更新 Molis。原 mcp-refresh 包的 App-tools 名单拒绝 `board-wait`；统一连接功能需要同一个 Runtime 在本人操作期间停止模型调用，并由持久接续继续原任务。本次只采用上游已合入的 SDK，包含原有 MCP refresh 与对象引用题能力；不改 Molis 的 Agent 角色、提示词、业务等待存储或真实 Home。

上游合同见 [Prologue #35](https://github.com/molis-ai/prologue/pull/35) 的 `docs/slices/app-tools-waits.md`：仅绑定当前持有节点的顶层 App-tools Run 可等待 App 的只读外部检查器；命令、信封、节点和待答问题条件拒绝。沿用已有任务图、取消、权限复核与接续。公开常量新增一个工具名，参数与持久化形状不变。换包范围是 agent-host 的依赖、工作区登记、锁文件、vendor 来源与历史、来源测试及 S-13 的当前包指向；仅保留这一份 SDK。回退可由 Git 恢复上一份包及其同一组依赖文件，不引入读取兼容。

验收沿用上游 ATW-01—ATW-05（`app-mode-waits.live.test.ts`、`app-mode.live.test.ts`）：真实 Node Host 的等待、重启、单次接续、拒绝和取消通过；干净安装包的公开消费者通过。Molis 侧验证 S-13（`tests/prologue-memory-boundary.test.ts`）和 agent-host 的必跑回归，执行整体构建、merge-base health、边界、版本、资源与密钥检查。真实 MiniMax 的完整只读任务在连接功能分支中继续，累计 240 次，不作为此换包已经完成的证据。

集成回归发现 P4 工作图的绑定路径遗漏接续请求键：等待已满足后仍以新随机键开下一轮，旧接续一直 eligible，宿主会反复接续。该工作图绑定复用原 eligibleContinuation 查询，只在当前图、当前会话选取 SDK 请求键，交给原幂等启动；不新增等待或去重存储。PA-23 在项目图与工作图上分别验证撤权启动不消费接续、后续一轮消费接续、重开后没有 eligible 项或额外模型调用。新增工作图场景在旧实现失败、修复后通过；连接功能分支的四项真实 MCP 业务回归也已通过。

新增开放的 board-wait 是持久等待的登记操作；助理工作状态已有等候投影，活动列表不再把这个工具原名显示给人。沿用现有内部控制事件的省略规则，不隐藏等待状态或失败诊断；`tests/assistant-tool-words.test.ts` 验证活动呈现，完整业务回归验证工作确实处于 waiting-input。

本地验证：统一包构建、冻结离线安装、204 个相关非浏览器文件通过；补齐工作图请求键后重新整体构建，PA-23 与委派/交回三文件 18 项通过，同一修复在连接功能分支的 77 个 Agent/Prologue 及相关文件通过。merge-base health、包边界、资源预算、版本及密钥扫描通过。[Molis #644](https://github.com/molis-ai/molis-work/pull/644) 的 PR CI 全部通过，含两份安全检查与 Linux 产品子集 376/376 文件，无失败、重试后通过、跳过或隔离文件。连接功能分支随后用同一 MiniMax 跑三项全新完整只读任务，首项参数错误失败、后两项各自动接续一次并真实读取一次，零 Pages 写入；累计 235/240，本轮复验结束。原失败不改判，也不据此宣称整个连接功能已达到内部完整。

### 6.0m MCP 参数注解与派出校验的统一 SDK（2026-10-17）

状态：已合入，工程验证通过；连接功能的真实模型与体验验收另记。一骏已授权提交、合入上游修复并更新 Molis；[Prologue #36](https://github.com/molis-ai/prologue/pull/36) 已合入 `d2b3daa3de0744504b3098a17604f5f66019a29e`。真实 GitHub MCP 的 46 个工具原先因 `default` 与 `x-mcp-header` 被筛成 6 个，阻塞同一连接跨入口读取。本节更新统一 SDK、来源及历史记录、对应依赖锁，并把连接功能分支已有的 MCP 动作 schema 注解处理与生产派出回归纳入主线，不发布整个连接功能分支，不改真实 Home。

SDK 保留原始 schema 与形状指纹，只在 MCP 校验副本移除已支持的非校验注解；不补默认参数、不新增协议头映射、不放宽模型结构输出。调用前执行原有 schema 值约束，非法输入不发到远端；未知约束与畸形注解仍拒绝。公开类型与依赖不变，回退通过 Git 恢复上一份包和同组依赖文件，不增加读取兼容。

- **PA-MCP-01**：Molis 正式 Prologue HTTP 路径可发现并调用带注解的工具；撤权、取消与未知副作用仍按原合同拒绝。证明为 `tests/external-mcp-dispatch.test.ts` 与上游 MSA-01—03。
- **PA-MCP-02**：唯一包从已合入的干净提交重建，冻结离线安装、整体构建、agent-host 必跑与相关 MCP 回归、S-13、merge-base 健康/包边界/资源/密钥检查通过。来源检查为 `tests/vendor-provenance.test.ts`；整套集成按现有统筹交由 CI。真实模型复用验收继续在连接功能分支记录，不以换包通过代替。

上游证据：24 文件 299 项回归、完整类型与构建通过；13 个干净安装消费者通过；真实 GitHub 发现 46 个工具并只读 Issue #1，零写入与模型请求。合并归档独立构建与已测包字节一致。

首次 Molis 回归发现 SDK 已保留带注解的工具，但主线动作 schema 编译器仍拒绝 `x-mcp-header`，生产派出用例在可用性断言失败。沿用连接功能分支已有的 `mcpInputContract` 处理：仅从动作参数副本移除合法一级 header 注解，保留原始快照、字段值约束、重复/嵌套/畸形和未知关键字拒绝；Home MCP 与项目 MCP 共用这一处，模型 schema 不变。`tests/connector-mcp.test.ts` 验证实际业务派出为零的拒绝与成功调用；前述派出用例验证 SDK 消费路径。包边界另检出工作区登记仍指向旧包，一并更新同一依赖记录。初轮相关 58 个非浏览器文件中 57 个通过，301 项通过、1 项失败；保留首次派出用例失败。补齐动作 schema 处理后整体重建，相关三文件 29 项通过（含新增拒绝路径），工作区登记修正后的包边界及 merge-base 健康门禁通过。页面资源仍为 25 项、7,598,359 字节，版本核对通过。浏览器 MCP 冒烟及完整集成交由 CI；没有在本机启动全量。

Molis [#650](https://github.com/molis-ai/molis-work/pull/650) 于 2026-10-17 11:05 UTC 合入 `2dd7a258389fc8cdf5fb352c0d9d534984977c04`。[PR CI](https://github.com/molis-ai/molis-work/actions/runs/39026338214) 全部通过，产品子集 377/377 文件通过，无失败、重跑后通过、跳过或隔离；两份安全检查通过。[合并队列检查](https://github.com/molis-ai/molis-work/actions/runs/39027103146) 通过。合入后逐项核对主线包、依赖与 MCP 处理源码，同已验证版本一致。
### 6.0n P4 助理一半 A2：交回改用 SDK 的等待与接续（2026-10-17）

§7.5 第 5 条的第 2、3 项：子任务交回、交回后自动接着做。A1 之后，「子任务都结束了没有」读图；这一片把「等它们」和「接着做」也交给 SDK：父 Work 的根挂一个等待，等根下所有没结束的步骤，SDK 管等待和根上唯一的接续。助理自己记的那份交回状态全删：

- 存储字段 `handed_back_run`、`hand_back_held`；
- `AssistantDelegations` 的 `watch`、`settle`、`#settling`、`owed`、`resume`；
- `AssistantService` 调的 `markHandedBack`。

交回的材料和几句通知照旧。统筹审 #637 时的两条建议（10-17）也在这一片：`ended()` 只吞 `TASKBOARD_CONFLICT` 与 `TASKBOARD_STALE_GENERATION`；补一条宿主重启的用例。

**合同**（`services/agent-collaboration`）：

- `AgentWorkNode` 多两项：`ended_at`（步骤结束的时刻）和 `continuation`（根上的接续：请求键、SDK 的状态）。
- `AgentWorkGraphPort.add` 多一个可选的 `wait_reason`：带上它，交出这一步的同时，根重挂等待，等它下面现在没结束的步骤。被拒（`agent.collaboration_conflict`）时什么都不加，见第 9 条。
- `AgentWorkGraphPort` 多两个方法：
  - `hold`：取消宿主挂在根上、还开着的等待；那个等待的接续已经 `eligible` 的，挂起给人（`blocked`）；
  - `onReady`：根的接续变成 `eligible` 时通知；订阅时先把当下已经 `eligible` 的报一遍。

**宿主**：

- 新文件 `prologue-work-waits.ts`：`handOut`（带 `wait_reason` 的 `add` 走它）、`hold`、`onReady`。同一块图上的改动逐个串行：两个子任务同时交出，各自会取消对方刚挂的等待。
  - `handOut` 先查、再加步骤、再取消宿主自己开着的等待、再挂新的。加上步骤之后等待挂不上（写失败、条件超过 SDK 的 8 个），就把这一步结束掉（`cancelled`，`add` 给的 `remove`；步骤原来就在的不动），根重新等它原来等的那些，再把错误抛出去。所以不会留下一步没人等、也没有轮站在上面的子任务（统筹审 #654 时指出）。下面三种情况拒绝（`agent.collaboration_conflict`），这时还什么都没写：
    - 根的接续正被一轮收下（`claimed`）：那一轮在下一个模型边界先收到交回的结果；
    - 根上开着这一轮自己登记的等待（`by` 不是 `app`）；
    - 根上没有在做的一轮。
  - 等待的写法：`mode: all`、`until: settled`、`onFailure: continue`、`onEarlyContinue: keep`、`by: app`、`autoContinue: true`、一周期限。
- `prologue-work-graphs.ts`：
  - `binding()`：根的接续 `eligible`、目标是这个会话时，这一轮带上接续的请求键起跑，SDK 由此把接续交给这一轮；
  - `ended()`：只吞上面两种错误，别的记进诊断页的 `ledger_failures`（`work-graph-step-end-failed`）；
  - 新的 `reconcile()`：宿主打开时，工作图上一步没结束、没有活着的尝试、最后一次尝试的 Run 已经有终态（子那一轮结束了，报告没落盘），就按那一轮的结果把这一步结束。
- `prologue-collaboration.ts` 加三个函数，Coding 的项目工作板也用：
  - `holdContinuation`：把 `eligible` 的接续挂起给人；
  - `canTakeUp`：一个请求键已经被一次被拒的开跑用过（SDK 记下了它当时解析成什么），就不能再起别的。这个接续挂起给人，这一轮不带键起跑；
  - `releaseStartClaim`：开跑被拒时，SDK 自己会把它占用的接续放回 `eligible`，但调用方已经被撤权时，那一笔连同别的一起被拒，接续会停在 `claimed`，直到下次重启。`prologue-run.ts` 在这时于调用框之外把它放回，做法和 SDK 重启恢复一样，只放「这个键下、没有 Run 收下的开跑占用」。
- `prologue-node.ts`：打开时调 `reconcile()`；诊断页把工作图记下的失败并进 `ledger_failures`。

**助理**（`assistant-delegation.ts`）：

- 交出一步时挂等待（`add` 带 `wait_reason`）：新子任务的第一步（`placeOn`）、跟进的 `.f<n>`。人在子 Work 里自己开的一轮（`.r<n>`）不挂。
- `onReady` 来了，就起「（子任务都已交回）…」那一轮，助理请求号是 `hand-back-<请求键>`。只在父的上一轮 completed、至少有一个子任务不是被停掉的时候起。
- 被拒的交回告诉人原因，在这个宿主进程里不再自己重试（`#refused`，按请求键记）；接续留给这项工作的下一轮。
- 人停止父 Work：先 `hold`，再停子任务，所以子任务被停不会让接续变成 `eligible`。正在准备的交回被撤回。
- 交回材料：上一轮开始之后结束的子任务步骤（看节点的 `ended_at`）。

**定下的几件事**（记进 §7.7）：

1. **交出时挂等待，不在父那一轮结束时挂。** 子任务若在父那一轮结束前就做完，结束时才挂，登记时结果已经先到，SDK 会把接续取消（`RESULT_FIRST`），没人接着做。交出时步骤刚加上，子那一轮还没开始，所以不会先到。
2. **接续被收下时，拒绝交出新的一步。** 再挂一个等待，会把还没送到的那份结果丢掉。
3. **一次被拒的开跑用过的请求键不再用**（`canTakeUp`）：接续挂起给人，下一轮不带键起跑。SDK 对同一个键只认同一次开跑，换了内容就冲突（`RUNTIME_IDEMPOTENCY_CONFLICT`）。结果已经在会话里，这一轮的材料里也有。
4. **被撤权的开跑留下的占用，在调用框之外放回。** 动作网关撤权以后拒绝这次调用的一切写入，SDK 自己放回占用的那一笔也在其中；不放回，以后每次交出都被第 2 条拒，直到重启。这一笔只是撤销这次调用自己的占用，不是新的业务记录。
5. **被拒的交回在本进程里不自动重试。** SDK 放回接续时会再发一次 `eligible`，如果再自动起一次，人刚看到「没有自动接着做」，接着又做了。重启后 `onReady` 再报一次，所以重启后会试一次，和以前一样。
6. **重启后不另扫助理的记录**：SDK 恢复等待与接续，`onReady` 订阅时把当下 `eligible` 的报出来；子那一轮结束、报告没落盘的，由 `reconcile()` 补上。
7. **已知的两处副作用**：
   - 上一轮里用 `status` 看过的结果，下一轮的材料里还会再出现一次。
   - 宿主在子那一轮结束和报告之间停掉时，SDK 先把那一步交还父会话，`reconcile()` 再按 succeeded 结束它。所以 SDK 写进父会话的那句提示可能说等待「失败、交回了没做完的」；Molis 自己的材料写的是对的（「开头」：已完成）。
8. **存量**：老 Home 里存的 Work 正文还带 `handed_back_run`、`hand_back_held` 两个键，`publicWork` 不再剥它们。A4 的一次性脚本要把它们删掉。在那之前，这两个键会出现在助理的 Work 视图里，没有代码读它们。A4（§6.0q）起视图按合同逐项取，这两个键不再出现；存量里的由脚本删。
9. **一个步骤只有一个接续**（统筹 10-17 定）。宿主只改自己挂的等待（`by: app`）：重挂前取消的、`hold` 取消的都只有它，`hold` 挂起给人的也只是它的接续。模型自己登记的等待（`board-wait`），宿主一概不碰。
   - 根上开着这一轮自己登记的等待时，交出新的子任务被拒（可重试），图上什么都不变：不加步骤，也不碰那个等待。等那件事有了结果、这项工作的下一轮跑起来，再交出就能成。
   - 反过来，宿主的等待开着时，模型的 `board-wait` 由 SDK 拒绝（`WAIT_ALREADY_ARMED`），宿主的等待照旧。
   - 检查都在加步骤之前。先加步骤、再挂等待被 SDK 拒，会多出一步没人等的子任务（变异 O1 实测：`p-2` 留在图上，调用方拿到 SDK 的原始错误）。

**验收**（夹具模型，真实 Prologue 节点适配器）：

| 编号 | 证明 |
| --- | --- |
| （`assistant-delegation-handback` 原四条） | 父那一轮结束时根 `waiting`、接续 `armed`；交回后 `started`。人停止后，开着的等待被取消（接续 `cancelled`）。被停掉的子任务让接续 `eligible`，但不自动接着做，人的下一轮收下它，材料里有「被停止了」。被拒时接续留在 `eligible`，重启后收下一次 |
| W2-18-HANDBACK-RESTART-01 | 子进程宿主在子那一轮回答之后、写图的第一笔时被 SIGKILL。重启后那一步 `succeeded`、带 `ended_at`；交回那一轮由宿主写、材料里有子任务的结果，接续 `started`；再调一次 `attachSchedule` 不再起第二轮 |
| W2-18-HANDBACK-STEP-END-01 | 写图失败（`EIO`）时，诊断页的 `ledger_failures` 里有 `work-graph-step-end-failed`；那一步保持 `running`，根仍在等 |
| W2-18-HANDBACK-CURRENT-01 | 三个阶段的归档都挡住了自动那一轮。被拒后接续回到 `eligible`。之后人的下一轮：在前两个阶段收下接续（`started`）；在 SDK 已经提交开跑的那一阶段，请求键已用过，接续挂起（`blocked`），这一轮照样跑完 |
| W2-18-HANDBACK-CURRENT-02 | 停止：接续 `blocked`。新的一轮：`started` |
| W2-18-HANDBACK-CURRENT-03 | 开跑在占用接续之后被当前调用方拒一次：通知一次，不自己再起；接续 `eligible`，人的下一轮收下它（`started`） |
| W2-18-HANDBACK-ONE-CONTINUATION-01 | 这一轮用 `board-wait` 登记了自己的等待：这一轮还在跑时、结束以后，交出都被拒（`agent.collaboration_conflict`），图一点没变；`hold` 不取消它，它结束后也不把它的 `eligible` 接续挂起；下一轮收下接续后，交出成功，根改等新的一步 |
| W2-18-HANDBACK-ONE-CONTINUATION-02 | 宿主的等待开着时，模型的 `board-wait` 拿到 `WAIT_ALREADY_ARMED`；根上的接续仍是宿主那个 |
| W2-18-HANDBACK-ARM-FAILED-01 | 交出 8 步之后第 9 步挂不上等待（SDK 一次最多等 8 件）：交出报错，第 9 步 `cancelled`，没结束的还是那 8 步，根仍 `armed`；8 步都结束后根才 `eligible` |

**变异**（每条改回去重建、单跑对应的用例）：

| 去掉 | 红的用例 |
| --- | --- |
| `ended()` 改回全吞 | STEP-END-01 |
| `reconcile()` | RESTART-01 |
| `releaseStartClaim` | CURRENT-01（SDK 已提交开跑的那一阶段） |
| work graph `binding()` 里的 `canTakeUp` | 同上（`RUNTIME_IDEMPOTENCY_CONFLICT`） |
| `placeOn` 交出第一步时带的 `wait_reason` | `assistant-delegation-handback` 6 条全红 |
| `#refused` | 没有用例红：放回发出的 `eligible` 通常在 `#continuing` 还占着时就到了，比赛的另一种结果测试造不出来。CURRENT-03 证明行为，不证明这一行 |
| O1 `handOut` 里「这一轮自己的等待开着」那条检查 | ONE-CONTINUATION-01（拒绝的不是协作冲突：步骤先加上了，SDK 再拒挂等待） |
| O2 只取消宿主自己的等待（改成全取消） | ONE-CONTINUATION-01（`hold` 取消了模型的等待） |
| O3 `hold` 只挂起宿主等待的接续（改成都挂） | ONE-CONTINUATION-01（模型的接续成了 `blocked`） |
| O4 先查再加（把加步骤挪到检查前） | ONE-CONTINUATION-01（被拒后图上多了 `p-2`） |
| O5 `handOut` 里挂等待 | ONE-CONTINUATION-02 |
| R1 挂不上时把这一步结束 | ARM-FAILED-01（第 9 步留成 `ready`） |
| R2 挂不上时根重新等原来的 | ARM-FAILED-01（根的接续成了 `cancelled`） |

- 验证（基于 main `c276ab9c`，含 #648 与 #650 换上的 `mcp-schema-annotations` 包）：
  - `pnpm build` 通过；`pnpm api:update` 刷新了 `contracts/services/agent-collaboration` 的快照（只有上面合同里的两项、`add` 的 `wait_reason`、两个方法）。
  - `affected-tests` 选的非浏览器文件，加上全部 `prologue-*`、`coding-*`、`agent-collab*` 非浏览器用例和助理逻辑另跑的几个（undo、business-gateway、followups、memory、work-wait），连同新的 `prologue-work-waits`，共 217 个文件，一次全过。
  - `pnpm test:security` 58/58，`pnpm test:contracts` 44/44。
  - `check-health-gates --base origin/main`、`boundary:check`、`secrets:check` 都过。
    - `AssistantService` 1629→1628 行，方法数 98 不变；`AssistantStore` 不变。
    - `AssistantDelegations` 290→254 行；`createWorkGraphs` 140 行；`createWorkWaits` 53 行。
- 未验证：
  - 浏览器用例（`assistant-handback.e2e`、`assistant-follow-live.e2e`、`alchemist-client-boundaries.e2e`）和全量：`affected-tests` 判为要全量（改了共同合同，动了三个包），由统筹排。
  - 真实模型没走：这一片不改提示词，也不改工具说明。
  - 被撤权的开跑在根上留下的那一次 `dispatching` 尝试没有修。A1 起就有，SDK 重启恢复时把它关成 `refused`，不挡后面的轮。

### 6.0o P4 助理一半 A3：后台作业是工作图上的一步（2026-10-17）

§7.5 第 5 条剩下的一项：助理跟进的后台作业（动作声明了 `background_job`）。A2 之后，子任务交回读图；这一片把后台作业也放到 Work 的图上，用换包 #668 带进来的 Prologue #37（`afterwards: "end-step"`：宿主的等待结束时，步骤照等待的结果结束，不接着做任何事，也不往会话里写字）。助理自己记的那一份全删：

- `assistant.job-check` 排程和它的执行者（`#jobRunnerFor`、`#detachJobs`）；
- `watchJob`、`scheduleJobCheck`、`checkJob`；
- 存储里的 `StoredJob`、`jobs()`、`saveJob()`，`markTold` 的 `jobs`，轮材料里的 `told.jobs`。

通知、卡片结算和下一轮材料里的那几句话照旧。

**合同**（`services/agent-collaboration`）：

- `AgentWorkNode` 多一项 `job`：作业在主人那里的编号、开始跟进的时刻（宿主挂等待的那一刻），结束后再加怎样结束的（`done`、`failed`、`expired`、`unchecked`）和结束的时刻。主人说的状态不记（见第 6 条）。
- `AssistantBackgroundJob` 去掉 `last_state`：没有结构化的来源再填它（第 6 条）；工作面板的作业卡只显示进行中、完成、没完成、不再跟进。
- 新类型 `AgentWorkJobQuery`：主人的只读状态查询（精确引用）、点名这项作业的输入、回答里状态的位置、哪些状态算完成、哪些算失败。
- `AgentWorkGraphPort` 多两个方法：
  - `follow`：在根下加一步 `job.<键>`，没有会话持有它，宿主挂等待去看。同一个键再来一次什么都不变。看的节奏（`every`）和期限（`deadline_ms`）由 Work 的主人给，SDK 夹在自己的界内。
  - `onJobEnded`：作业的那一步结束时通知；订阅时先把已经结束的报一遍。
- 交回的说明改成：根等的是根下没结束的**子任务**，子任务是有会话持有的步骤，后台作业不是。

**宿主**：

- 新文件 `prologue-work-jobs.ts`：
  - `follow`：加步骤（不给持有者）→ 置为 `running` → 挂宿主的等待：`external` 条件、检查器 `molis.action-query@1`、`mode: all`、`until: success`、`onFailure: continue`、`onEarlyContinue: keep`、`autoContinue: false`、`afterwards: end-step`。等待挂不上就把这一步结束（`cancelled`），再把错误抛出去。两边同时加同一步时，后到的那个重读，步骤已在就直接用。
  - 视图：作业编号取等待的 `source`，开始跟进的时刻取等待的 `createdAtMs`，结束时刻取节点的 `endedAtMs`；SDK 不再看、把步骤挂给人（`needs-reconciliation`，不是终态，没有 `endedAtMs`）时取等待的 `settledAtMs`。没有宿主等待的那一步（等待没挂上、已被收回）不是在跟进的作业：没有 `job`，结束时也不报给 `onJobEnded`，不编一个开始时刻。SDK 不删已结束的等待，所以跟进过的作业一直读得到。
- `prologue-checkers.ts`：没有轮的宿主等待（`by: app`、`afterwards: end-step`）每次看都向 `checks.workAuthority({ graph_id, node_id })` 要跟进它的那项工作此刻的授权。工作不在了就 refused；读不到算这次不知道（SDK 再看）。查询的名字是宿主按精确引用写的 `molis-job-query:[provider, capability, version]`，检查器把它换回引用。任何一轮的工具表里都没有这种名字，所以模型的等待写它照样被拒。只读查询、不调模型、受众到 Agent 的规则不变。作业只声明了完成和失败两组状态，别的状态都算「还没好」。
- `prologue-work-waits.ts`：根的交回等待只等有会话持有的步骤。
- `prologue-waits.ts`：会话的等待视图跳过结束步骤的等待。从它不会接着做任何事，它也不能盖住根上的交回等待。
- Molis 宿主：
  - 新文件 `apps/local-host/src/agent-work-authority.ts`：按宿主登记谁给工作的授权。
  - `agent-host-composition.ts` 把它接进 `checks.workAuthority`。还没人登记时抛错，这一次算不知道。
  - `assistant-http.ts` 建好助理服务就登记 `service.jobs.authority`。Web 服务在运行时启动前就建它，所以重启后第一次看时就在。

**助理**（新协作者 `assistant-jobs.ts` 的 `AssistantJobs`，只经端口依赖宿主）：

- `follow`：动作声明了 `background_job`、输出里有作业编号时跟进。
  - 键是 `<work_id>.<提供方、状态查询、版本、作业编号的哈希>`。
  - 挂在这项工作自己的图上；子任务没有自己的图，挂在委派它的那项工作的图上。
  - 跟进前重读工作：新工作的图在第一轮之前才打开，比这一轮拿到的工作副本晚。
  - 同一个键正在跟进时，进程内合并成一次。
- 卡片：跑卡片时，动作自己的结果报告和卡片同时报同一项作业，合成一步。
  - 卡片显示「已开始，后台进行中」之后，再把 `job_step` 记到卡片上。这时作业已经结束的，卡片当场结算。
  - 另一张卡片已经拿着这一步的，这张只显示动作的结果。
- `views`：工作视图里的 `jobs` 从图上读，公开形状 `AssistantBackgroundJob` 只去掉 `last_state`。
- `material`：下一轮的「后台任务」材料，列还在进行的作业，加上上一轮开始之后结束的（看作业的结束时刻），和 A2 的交回材料一样读。
- `authority`：给检查器的，是这项工作的轮拿到的动作客户端（`ports.authority(work).actions`）。
- `attach`（在 `attachSchedule` 里）：订阅 `onJobEnded`。每项作业结束提醒一次（键 `job:<图>:<步>`），拿着它的卡片随之结算，只说完成了还是没完成。每次启动都会把结束过的作业重报一遍：已经提醒过、也没有还在进行的卡片指着它的，不读图就跳过（`AssistantStore.noticeRaised`）。
- 跟进作业的那项工作，从步骤的 id 找：`job.<work_id>.<16 位哈希>` 里取出 `work_id`，`store.get` 它，再核对作业挂在它的图上；找不到就是真的不在了。不按最近变过的若干项工作去找。
- 轮的 `started_at` 改记成读材料的那一刻，原来是开跑之后。
- `hasTimedWork`：图只有运行时读得到，于是改成「6 小时内有工作变过或有卡片动过」（`AssistantStore.activeSince`）。
- 工作面板的长等待也听工作图的变化，作业一结束面板就更新。

**定下的几件事**（记进 §7.7）：

1. **一项后台作业是根下没人持有的一步，不是子任务。** 交回等待只等会话持有的步骤。轮只站在自己会话持有的步骤上（`binding()` 用 `assignedTo`），所以从不站到作业那一步上，也不随轮结束而结束它。
2. **结束只看引用，由 Work 自己从图上读**（统筹 10-17 定）。下一轮的标注材料里放上一轮开始之后结束的作业，按步骤的状态和结束时刻读。没有第二份记录，也没有「已告诉」标记。
   - 一轮只在开跑成功后才记下，所以开跑失败那一次不算告诉过，下一次再算。
   - 轮的开始时刻记成读材料那一刻，所以读材料到开跑之间结束的作业落到下一轮。正好一次。
3. **每次看都用这项工作此刻的授权**：受众 Agent，减去人对助理关掉的动作。以前 `checkJob` 用人的客户端（`scopeActions`）。所以状态查询要对 Agent 开放；只给人用的查询现在会被拒，作业记成不能再查看。
4. **节奏和期限照旧**：15 秒起，每次翻倍，最多 5 分钟一次；6 小时期限。SDK 的默认最长间隔是 1 小时，所以节奏由 Work 的主人在 `follow` 里给。
   - 和以前不同的一处：以前读不到就一直重试到 6 小时。现在连续 5 次读不到（SDK 的上限，调不大）或被拒，就不再跟进，步骤 `needs-reconciliation`，人收到「不能再查看它的状态」。
5. **存量**：
   - `assistant_jobs` 表留在 2 号基线里，不再写。工作或项目删掉时照样删它的行。A3 不改基线、不写维护。
   - **未决项，用户 10-17 定「以后的一片」**：那一片加 3 号基线，它的维护和维护八在同一次安装里跑（维护清单的条目用 BL-157 的表格式）。维护先把还挂在表里作业上、仍是 `running` 的卡片结掉（「升级后不再跟进，请到原处查看」），再删表。
   - 升级前还在跟进的作业，升级后不再跟进。不迁移：合同只认现行形状。
6. **主人说的状态不记**（统筹审 #675 定）。原来从等待观察记录的说明（`note`）里找「」回答 」，把后面那段当成状态：这是按措辞取事实（和 D2，#592 定的方向相反），说明有长度上限，状态里带「，」也会被截掉，SDK 也写明说明不放主人自己的内容。现在通知、卡片和下一轮的材料只说完成了还是没完成。以后真要显示，得有结构化的来源（比如请 Prologue 给 `ConditionObservation` 加一个有界的值，随下次换包），开写前先报统筹。

**验收**（夹具模型，真实 Prologue 节点适配器）：

| 编号 | 证明 |
| --- | --- |
| W2-18-JOB-STEP-01 | 跟进的作业是根下没人持有、`running` 的一步。同一个键再跟进一次，图不变。看时带上点名作业的输入。作业完成后步骤 `succeeded`，`ended: done`，有结束时刻，开始时刻不变。之后不再看。结束只通知一次。不调模型。每次看都按这一步要授权 |
| W2-18-JOB-STEP-02 | 交出 `p-1` 后根只等 `p-1`。之后再跟进的作业不盖住会话的等待。`p-1` 结束、作业还在跑时，根的接续 `eligible`。下一轮站在根上，作业那一步仍 `running`、没人持有 |
| W2-18-JOB-STEP-03 | 宿主重启后照样去看，用的是工作的授权。作业完成后步骤结束 |
| W2-18-JOB-STEP-04 | 宿主停着的时候作业失败：再起来后步骤 `failed` 一次，订阅时立刻报出来，之后图不再变，也不再看 |
| W2-18-JOB-STEP-05 | 工作不在了：一次都不看，步骤挂给人，`ended: unchecked` |
| W2-18-JOB-01 | 一轮开始的作业在新工作的图上跟进。完成后提醒一次。第二轮的材料里有「（任务 job-1）：已完成」，第三轮没有。卡片开始的作业，卡片一直显示进行中，作业失败后卡片显示「后台没有完成」 |
| W2-18-JOB-02 | 卡片开始的作业只有一步，归这张卡片。完成后卡片显示「后台已完成」。在同一个 Home 上重建助理（如同重启），还是只有一条提醒 |
| W2-18-JOB-03 | 开跑失败（没有模型）的那一次什么都没告诉。下一次开跑的那一轮听到这项作业，再下一轮不再听到（`assistant-undo`） |
| W2-18-JOB-04 | 跟进作业的那项工作后面又建了 500 项工作（它不在最近的 500 项里）：作业照样按它的授权看到结束，卡片显示「后台已完成」，人收到提醒 |
| W2-18-JOB-STEP-06 | 等待挂不上（期限已过，SDK 拒绝）的那一步被收回（`cancelled`），没有 `job`，也不报给 `onJobEnded`，一次都没看 |
| S-27 JOB-01 | 模型的等待写宿主那种作业查询的名字，登记时被拒，什么动作都没调 |
| S-27 JOB-02 | 看过一次之后收回授权：下一次看被拒，步骤挂给人（`unchecked`），被拒的那一次和之后都没再调用查询，也没有模型调用 |

**变异**（每条改回去重建、单跑对应的用例）：

| 变异 | 变红的用例 |
| --- | --- |
| M1 根的交回等待不看持有者 | STEP-02 |
| M2 会话的等待视图不跳过结束步骤的等待 | STEP-02 |
| M3 宿主的等待不走 `workRound` | STEP-01、-03、-04 |
| M4 作业那一步派给根的会话 | STEP-01～05 |
| M5 「上一轮开始」取成第一轮的开始 | JOB-01、JOB-03 |
| M6 提醒的键每次不同 | JOB-01、JOB-02 |
| M7 挂给人的一步不取等待的 `settledAtMs` | STEP-05 |
| R2 没有等待的那一步照旧给 `job`，开始时刻编成 1970 年 | STEP-06 |
| R2b `onJobEnded` 不看有没有等待 | STEP-06 |
| R3 跟进的工作只在最近的 500 项里找 | JOB-04 |

没有用例看住的四处：
- 重报时已经提醒过就跳过（R4，去掉它 52/52 仍过）：只省读图和扫卡片，提醒本来就按键只发一次。
- 轮的开始时刻记在读材料那一刻：改回开跑之后，只有在读材料和开跑之间结束的作业会漏掉，用例造不出这个时序（去掉它 51/51、5/5 仍过）。
- 卡片记上 `job_step` 时作业已经结束、当场结算：只有作业比卡片的写入还快才走到，用例造不出这个时序（去掉它 51/51 仍过）。
- `#following` 的进程内合并：适配器对同一步本来就重读、直接用，去掉也不变红；它省的是一次多余的加步骤（51/51 仍过）。

- 验证（叠在 #665 合上 main 的 `72db37a47` 上：main `250814e3d` 已含 #654 与 #668）：
  - `pnpm build` 通过；`pnpm api:update` 刷新了 `contracts/services/agent-collaboration`（`AgentWorkNode.job`、`AgentWorkJobQuery`、`follow`、`onJobEnded`）和 `contracts/services/assistant`（去掉 `last_state`）的快照；工作台脚本小了 55 字节，`page-assets.json` 跟着降。
  - `affected-tests` 选的非浏览器文件，加上全部 `prologue-*`、`assistant-*`、`agent-collab*`、`coding-*` 非浏览器用例和 `security-invariants-doc`，第一版 239 个文件一次全过；按统筹审查改完之后（加上工作台脚本带出的用例）共 268 个文件，一次全过。
  - `pnpm test:security` 59/59，`pnpm test:contracts` 44/44。
  - `check-health-gates --base origin/main`、`boundary:check`、`secrets:check` 都过。
    - `AssistantService` 1628→1555 行，方法数 98→94；`AssistantStore` 267 行、39 个方法，与 main 相同（去掉作业的读写，加上 `noticeRaised`）。
    - `composeAgentHost` 不变（查登记的那几行放进 `agent-work-authority.ts` 的 `workAuthorityCheck`）；`AssistantJobs` 所在文件 179 行，`prologue-work-jobs.ts` 86 行。
- 未验证：
  - 浏览器用例和全量：改了共同合同和三个包，由统筹排。
  - 真实模型没走：这一片不改提示词，也不改工具说明。

### 6.0p A2 写后诊断：合同（2026-10-17；A2-1 在 main，A2-2 见 §6.0p.12）

第 9 项。§4.4 定了边界：检查器按已授权项目显式配置，受同一命令审查和预算约束，记录实际命令、退出状态和结果引用；没有检查器显示「未检查」，失败不掩盖文件已经写入；不静默安装工具，不起任意语言服务，不把一次完整构建叫作按文件诊断。这一节把它写成能实现、能验收的合同。统筹 10-17 认可第一刀只写 spec，也认可先做 Prologue 一刀。

#### 6.0p.1 结论：两刀，先 Prologue

- **Prologue 一刀**：写后诊断的缝不再自己跑东西，改成交回一条命令（`executable`、`argv`、`cwd`、`timeoutMs`）。SDK 用这一轮自己的命令路径去跑：同一份 `workspace-command` v1 审查资源，同一道 Effect 链，同一份命令回执。跑完把有界的结果拼进这次写入的观察。
- **Molis 一刀**：换包；检查器配置；Coding 的包声明这一样，执行器只按配置拼出命令；Coding 的时间线显示「未检查」或检查结果。

为什么 Molis 自己做不到：
- SDK 现有的缝（`coding.diagnose-after-write`，Prologue `docs/slices/coding-diagnose-after-write.md`）是 `safe-read`，执行器拿到的只有这次调用（工具登记、参数、取消信号），没有命令路径。执行器要跑 `tsc` 或 `eslint`，只能自己起进程。
- Molis 自己不替 Agent 起进程：Agent 的每一条命令都由 SDK 的 Node Host 跑，`horizontal/agent-host` 里没有 `child_process`。
- 在执行器里起进程，就是一条不经命令审查、不留命令回执的新路径。这正是本节要排除的。

Prologue 一刀另外要做到：
- 审查等待不计入写入的时限。写入的时限只管写盘；检查自己的时限见 §6.0p.3。
- 这个开关跟着会话走：会话的包没有声明这一样，就零调用，写入的观察里也不加字。现在的开关是全局的 `config.workspace.diagnoseAfterWrite`，打开后没声明的会话每次写入都多一句「diagnostics unavailable」。
- 取消跟随写入（§6.0p.5）。
- 检查的命令回执挂在这次写入的调用上（同一个 `call_id`），Molis 从回执读结构化的事实，不从观察的文字读。

#### 6.0p.2 检查器从哪来

- **只认人保存的项目配置。** 每个项目、每个已授权的工作区，一份检查器清单，带版本号。每个检查器写：
  - `checker_id`、显示名；
  - `executable`：程序名（裸名，最长 255 个字符），在 Host 的 `PATH` 上找（S-38，Host 不跑带路径的可执行文件），不经 shell；带 `/` 或 `\`、带空白或 shell 符号（`;`、`&`、`|`、`>`、`<`、`$`、反引号）、写成 `.` 或 `..` 的，以及 Host 任何时候都不跑的名字（SDK 的 `NEVER_RUN`：`rm`、`sudo`、`chmod` 等），保存时拒（`agent.write_checker_invalid`，§6.0p.11）；
  - `args`（数组，不经 shell）；
  - `applies_to`：扩展名清单，例如 `[".js", ".mjs"]`；
  - `cwd`：相对工作区根，默认 `.`；按 normalize 之后、要存下的那个值查，首尾带空白的、以盘符加分隔符（`C:/`、`C:\`）开头的、出根的、落在 SDK 的受保护目录（`.git`、`node_modules`、`.prologue`，按整段比，`node_modules_cache` 不算）里的，保存时拒（§6.0p.11）；
  - `timeout_ms`（§6.0p.3）。
  - 没有 `env_allowlist`：SDK 跑写后检查时不带人挑的环境变量，答复里带这一项会被 SDK 拒，存进来也用不上（§6.0p.11）。
- **文件怎样进命令**：`args` 里恰好一个元素整个写成 `{file}`（没有 `{file}` 的保存时拒，见 §6.0p.9），执行时换成这次写入的、相对检查器 `cwd` 的路径（`cwd` 是 `.` 时就是相对工作区根），作为一个完整参数；一个检查器只查它 `cwd` 里的文件（A2-2 定，§6.0p.12）。不允许 `{file}` 嵌在别的文字里（如 `--file={file}`），也不允许出现两次。路径以 `-` 开头时写成 `./<路径>`，不会被当成选项。
- **主人**：`horizontal/agent-host`，和 MCP 服务器配置放在一起；检查器同样是在已授权工作区里由 Agent 运行时起的命令。存在 Prologue Runtime 的存储里（kind `molis-write-checkers`，每个项目、每个工作区一条），版本就是存储自己的版本，从 1 起；不建表。两个动作：`agent.write_checkers.list.v1`（query）与 `agent.write_checkers.save.v1`（command，带 `expected_version`），受众都只有 `user`。按「新能力注册成动作」，不加 typed 条目。代码与存储里叫 write-checker，和等待用的条件检查器（`prologue-checkers.ts`）分开（统筹 10-18 定，见 §6.0p.10）。设置页放在平台自己的项目设置节里，和工作区授权在一起，不挂在 Coding 的设置页（`CODING_SETTINGS_UI_CONTRIBUTION_ID`）上：检查器是 agent-host 的平台事实，挂在已授权的工作区上（统筹 10-19 定，§6.0p.11）。
- **哪些轮会查**：按这一轮的会话声明启用，不按插件名认 Coding：这一轮的包声明了写后检查、工作区此刻已授权并存了检查器，执行器就接上（统筹 10-19 定）。
- **谁能改**：
  - 只有人，在项目设置里改。`agent.write_checkers.save.v1` 的受众只有 `user`，权限 `projects:settings`，和项目设置的动作一样（`packages/contracts/src/modules/projects.ts`）。页面直接调这个动作，不经 Coding 的插件路由转调（转调的受众是 `plugin`）。
  - 不登记 `agent`、`mcp`、`workflow`、`plugin`：模型、MCP 客户端、工作流和别的插件都改不了。
  - 操作者从调用上下文来（S-17），不从输入读。
- **只给已授权的工作区**：保存时工作区必须是这个项目此刻已授权、`realpath_verified` 的（`projectSettingsCapabilities.workspaces`，和 MCP 的 stdio 工作区同一处）。
- **改了要不要重新授权**：
  - 工作区授权与检查器配置是两件事。改检查器不放宽工作区，不要求重新授权工作区。
  - 每一次检查都过命令审查（§6.0p.3）。「本会话不再询问」的规则按完整命令精确匹配，所以配置一改，命令变了，旧规则自然对不上，要重新批准，不另写一套失效逻辑。
  - 工作区授权被撤回后，它的检查器不再运行：写入的观察写「未检查：工作区授权已撤回」，不起审查。配置本身留着，授权回来后照用。
  - 审查卡和时间线写出用的是哪个检查器、配置的哪个版本；给模型的观察里没有这两项（§6.0p.4）。SDK 的命令回执里也没有这一项，Molis 不往回执里加字段。
- **不从模型和文件里读命令**：
  - 不读 `package.json` 的 scripts、`Makefile`、`.editorconfig`、仓库里的任何配置文件来推出命令，也不自动「发现」检查器。
  - 模型的写入调用只给路径和内容，执行器拿到的路径来自 SDK 的写入回执，不是模型的文字。模型调用里多写的字段（如 `checker`、`command`）由写入工具的合同拒（SDK 的 `write` 参数是 `additionalProperties: false`）。
  - 要从项目文件里推荐检查器，以后另开一片：只在设置页里列出候选，由人确认后保存。

#### 6.0p.3 执行与预算

- **走现有的命令审查，不新开免审路径。**
  - 每一次检查是一笔命令 Effect，审查卡就是现在的命令卡（`prologue-review-documents.ts` 的 `workspaceCard`）：完整的 executable、argv、cwd、时限、环境名单、所属工作区。卡上多一行「写后检查：<显示名>（配置 v<n>）」。宿主靠审查资源的 `operationKey` 认出这是写后检查，用 SDK 导出的 `isAfterWriteCheckOperationKey` 判断，不自己拼 `after-write-check:` 这个字符串。检查器和版本来自执行器自己的记录：执行器回答时记下这次写入选了哪个检查器、哪个版本，按（run，`operationKey`）存，审查卡和时间线按同一个键读。键只在一轮里唯一（SDK 每个执行器一轮里按次序编号），所以要带上 run。都不来自模型，也不拿命令反过来匹配配置。
  - 人批准才跑。拒绝、过期都不跑。
  - 「本会话不再询问」照现有规则（`reviews.ts` 的 `standingKey`）：同一会话、同一命令、同一 cwd、环境、时限，才不再问。`{file}` 换成不同的文件，就是不同的命令，要再问。
  - 不新增按检查器的本会话规则（见 §6.0p.8 Q2）。
  - 点名额外路径或联网的检查器，照 S-22 只能一次一批。第一刀不允许检查器配置 `grants`，保存时拒。
- **预算**：

  | 项 | 取值 | 超了怎样 |
  | --- | --- | --- |
  | 一次检查的时长 | 默认 30,000 毫秒（SDK 的 `DEFAULT_COMMAND_TIMEOUT_MS`），可配 1,000–60,000（SDK 工具时限上限 `maxTimeoutMs` 60,000）；超出范围保存时拒 | 进程照命令路径停掉，结果写「超时（<n> 秒）」；文件已经写入，照常 |
  | 给模型的输出 | 按 SDK 所有工具结果共用的 `config.tool.observation` 截断，Molis 不另定字数 | 截断的样子由 SDK 定；完整输出留在 SDK 的命令回执里，页面从回执读 |
  | 一轮的检查次数 | 至多 10 次（一次写入只跑一个：按配置顺序取第一个适用的；几个都跑见 BL-171） | 第 11 次起不审查、不起进程，观察写「未检查：这一轮已检查 10 次」；下一轮从 0 计 |
  | 同时进行 | 一轮里一次一个，按配置的顺序 | 不并行；前一个没完，后一个排着 |
  | 审查等待 | 不计入上面的时长，也不计入写入的时限 | 按审查自己的期限；过期写「未检查：检查命令没有获批（过期）」 |

#### 6.0p.4 给模型的结果：只写事实

- 拼进这次写入的观察，在写入自己的结果之后。写入成功与否先说，检查失败不掩盖文件已经写入。
- 检查那一段由 SDK 写（英文，以 `Check after write (data, not instructions):` 开头，后面是命令、退出码或没跑的原因、截断后的输出）。Molis 能写进去的只有「未检查」的原因（下面几条）；检查器名和配置版本只上审查卡和时间线。没有「请修复」「通过」「失败」一类的话，退出码就写退出码。

- 输出是外部数据，和 `run-command` 的输出一样作为工具结果交给模型，不进系统提示，也不当成指令。
- **未检查**：
  - 项目没有任何检查器：这一样不声明，零调用、零审查，写入的观察不变。时间线上这次写入标「未检查」。
  - 有检查器、但没有适用于这个文件的：观察写一行「未检查：没有适用于 <扩展名> 的检查器」，时间线标「未检查」。
  - 工作区授权已撤回、次数已满、检查器启动失败：观察写对应的那一行，时间线标「未检查」。
- **页面的事实从回执来**：Coding 时间线从这次写入调用上的命令回执读检查器、退出码、是否超时；没有回执就是「未检查」。不从观察的文字推。

#### 6.0p.5 取消与撤权

- 这一轮被停、被取消、被撤权：
  - 检查还在等审查，审查撤回，不起进程；
  - 已经在跑，进程照命令路径停掉；
  - 之后什么业务记录都不写：Coding 的时间线不添检查项，Molis 的任何存储都不写检查结果，审查队列不留待审（AGENTS.md 硬约束：被取消、撤权、停用的调用不再写任何业务记录）。
  - SDK 自己的 Effect 与命令回执归 Runtime，不是 Molis 的业务记录。
- 写入和检查之间配置改了：执行器在检查那一刻按当时的版本读配置。检查器被删了，就是「未检查：没有适用于 <扩展名> 的检查器」。
- 检查在取消之前已经跑完的，回执留着，时间线照常显示。那是已经发生的事实。

#### 6.0p.6 安全边界：加一行安全不变量（随 Molis 那一刀取下一个空号）

判定：要加。这是宿主替模型拼命令的第一个地方：命令的来源从「模型写的」换成「人存的配置加一个文件路径」，配置的写入受众就成了新的边界。审查卡仍显示完整命令，但只靠审查挡不住「模型或文件改了配置、人照常批准」的那一类。

这一行随 Molis 那一刀加进 `docs/system/SECURITY-INVARIANTS.md`，取那时的下一个空号，不在这里写死（S-33 已给交互线 BL-156 的 Molis 半边）。测试 `tests/security-invariants-checkers.test.ts`。内容：

> 写后检查器的命令只来自人在项目设置里保存的配置：模型、MCP 客户端、工作流和别的插件都存不了（受众只有 `user`）；文件路径只作为一个完整参数，以 `-` 开头的写成 `./…`，不经 shell；没有命令审查的批准就不起进程；配置改了，旧的「本会话不再询问」规则对不上新命令。

四条拒绝各有一个用例（PA-25、PA-28、PA-29、PA-30）。

#### 6.0p.7 验收（PA-25～PA-39）

每一条都带一个拒绝或反例。用例名是 Molis 那一刀要建的文件；真实进程的几条用 Node Host 加脚本模型（不调付费模型）。

| 编号 | 标准 | 拒绝或反例 | 用例 |
| --- | --- | --- | --- |
| PA-25 | 人在项目设置里存检查器，版本从 1 起，带 `expected_version` 改 | Agent 一轮里的工具、MCP 客户端、工作流、别的插件调 `agent.write_checkers.save.v1` 都被拒，配置不变；版本过时的保存被拒 | `tests/coding-checkers-settings.test.ts` |
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

- **动作 id 是 `agent.write_checkers.list.v1`、`agent.write_checkers.save.v1`**，不是 `agent.checkers.*`：id 会出现在动作目录、Agent 的工具清单和 MCP 工具名里，「checkers」在那里和等待用的条件检查器分不开。代码和存储 kind 都叫 write-checker，`docs/system/GLOSSARY.md` 把「写后检查器」和「等待检查器」分开写。
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
- **两个动作升到第 2 版，id 不变。** 输入输出的形状变了（少了 `env_allowlist`），按 `docs/system/CONTRACT-CHANGES.md` 第 3 节第 3 条升 `version`；不留第 1 版（阶段一不留兼容期），id 照 `agent.project-work.queue.v1` 的先例不改。受众只有 `user`、还没有页面调它，没有工作流步骤、MCP 工具或 Skill 固定过第 1 版。
- **设置放平台的项目设置。** A2-3 的设置页放在平台自己的项目设置节里，和工作区授权在一起，不挂在 Coding 的设置页上；执行器按会话的声明启用，不按插件名（§6.0p.2 跟着改）。

用例：`tests/coding-checkers-settings.test.ts` 的 PA-28 加了这几种拒绝。

#### 6.0p.12 A2-2：执行器、审查卡与 S-42（2026-10-19）

叠在换包 #814（Prologue `a51607fb`，含 #51 的 `afterWriteCheck` 标记、#52 的「没有退出码」）上。

- **包里怎样声明。** Prologue #51 以后，SDK 按包里标了 `afterWriteCheck: true` 的那一样认写后检查，不再认固定名字。工具目录一个名字只收一份登记，而 Molis 每条会话按这一轮冻住的动作造自己的包，所以这一样的名字随包（`molis-after-write-<范围>`），`safe-read`，可选，不给模型。有工作区、不是业务轮的每一轮都带它；这一轮的工作区此刻已授权、存了检查器，才给它执行器（`prologue-run.ts` 的 `roundChecks`），否则 SDK 零调用，观察里一个字不加。按会话的声明认，不按插件名认 Coding（§6.0p.2）。
- **`{file}` 相对检查器的 `cwd`。** SDK 在检查器的 `cwd` 里跑命令，写入回执给的是相对工作区根的路径；`cwd` 不是 `.` 时，原文的「相对工作区根」会把路径给错。所以换成相对 `cwd` 的路径，并且一个检查器只查它 `cwd` 里的文件：`cwd` 外的写入对它来说不适用，按顺序看下一个。以 `-` 开头的仍写成 `./…`（PA-28）。
- **执行器每次回答前再核。** 先过这一轮自己的派出前复核（插件实例、Character 的授权），再按这一轮的目录问 local-host 此刻授权的工作区（`checks.workspaceAt`，和起跑授权同一处 `workspaceGrants`，只认 `realpath_verified`），再读那一刻的配置。撤回了写「未检查：工作区授权已撤回」，一轮第 11 次写「未检查：这一轮已检查 10 次」（PA-26、PA-33）。执行器自己不起进程，SDK 拿它的答复走这一轮的命令审查、Effect 链和回执。
- **名和版本按 SDK 的键记。** 执行器回答时把检查器编号、显示名、配置版本（和触发它的写入调用）记在这一轮会话索引的那一次尝试上（`write_checks`，键是 SDK 给的 `operationKey`）。写入和审查都按 `run_id` 找同一次尝试，不依赖数组位置，所以（run，`operationKey`）唯一（PA-29）。现行写操作先经过 Host 审查：主轮在 `afterStart` 保存 `run_id` 后才接审批镜像，子轮也先存索引再接镜像，SDK 只在获批的 write/edit 落地后问写后检查；沿用这条顺序，不增加等待状态。审查卡用 `isAfterWriteCheckOperationKey` 认出写后检查，按同一个键读出名和版本，加一行「写后检查：<名>（配置 v<n>）」；是写后检查却读不到记录的，卡不能批准（PA-29）。命令回执里不加字段。
- **模型看到的是 SDK 的原话。** 检查器的 `cwd` 不是 `.` 时，命令那一行后面标 `(in <cwd>)`；可执行文件起不来写「not checked: COMMAND_FAILED: That executable could not be started.」，这就是 PA-37 的「检查器启动失败」；被信号结束、没有退出码的才写「not checked: no exit code (a signal ended it)」（Prologue #52）。Molis 不改写这几行。
- **安全不变量 S-42** 和 `tests/security-invariants-checkers.test.ts`（PA-39）随这一片加：受众只有 `user`、`./` 前缀、不批准不起进程、改了配置旧规则对不上，四条拒绝各一个用例。

这一片没做的，留给下一片：

- **A2-2b Coding 时间线**：写入那一行从这次写入的检查回执读检查器、退出码、是否超时，没有回执标「未检查」（PA-35 的时间线一半，`tests/coding-diagnose-timeline.e2e.test.ts`）。这一片的审查卡已经写出检查器和版本；运行视图的 `command_outputs` 里已经有 `<写入 call id>:diagnostics` 那一条回执。
- **子任务各自目录里的写入**（§6.0p.8 Q3）：子任务的会话由 SDK 派出，不经 `startPrologueRun`，这一片没有接它们的执行器，也没有用例。

#### 6.0p.13 A2-3 设置页：项目设置「工作目录」里的「写后检查」（2026-10-20，已实现，真实浏览器回归通过）

现状：已实现在 #805；A2-2 执行器 #822 已合入 main（2026-10-20），前置依赖满足。PA-40 到 PA-43 的真实浏览器验证、截图与当前 main 上 75 个包要求及相关非浏览器用例通过；整体构建、boundary 与 health 对照 main 通过。10 个工作台 README 浏览器用例通过（其中诊断编号用例一次 CDP 连接中断，单独重跑通过）；参数转义补充后 HTTP 5/5、i18n 9/9、真实 Chrome 3/3 通过。

按 §6.0p.11 最后一条，检查器在平台的项目设置里改，和工作区授权在一起；Coding 不知道这一页。

- **放在哪**：项目设置「工作目录」一节（`apps/workbench/src/project-settings-pages.ts` 的 `workspaces`），在「已关联目录」「关联新目录」之后加一段「写后检查」。每个此刻已授权、`realpath_verified` 的目录一组，组就是 `agent.write_checkers.list.v1` 返回的那几份；没授权的目录不出现。独立的项目设置页和工作台设置里的嵌入用同一段。
- **怎样读写**：页面调 `GET`/`POST <project>/api/project-settings/write-checkers`。这条路由和工作目录那条并排（`apps/local-host/src/web-project-platform-routes.ts`），只做适配：以本机的人（`audience: "user"`，权限 `projects:settings`）调 `agent.write_checkers.list.v1` 和 `save.v1`，不自己校验，也不另存。拒绝按动作的错误码回（`actionErrorResponse`：版本过时 409、输入不合法 400、无权 403），页面原样显示动作给的提示语。受众仍然只有 `user`，不经任何插件路由转调（§6.0p.2「谁能改」）。
- **一组里有什么**：
  - 每个检查器一行，写出名称、命令（程序名加参数，`{file}` 原样显示）、适用的扩展名、目录、时限，带「修改」「上移」「删除」三个按钮（第一行没有「上移」）。三个按钮和组上的「添加检查器」给读屏的名字带上检查器或目录的名字（「修改 Node 语法」「添加检查器（app）」）；组名是三级标题。
  - 组上一句说明：一次写入只跑第一个适用的，顺序就是这里的顺序（§6.0p.10 第 1 条）。
  - 「添加检查器」和「修改」用同一张表单，字段是名称、程序名、参数、适用的扩展名、目录、时限。参数用空格分开，带空格、字面双引号或反斜杠的参数加双引号；引号内仅 `\\` 和 `\"` 解为字面反斜杠和双引号，其他反斜杠序列照字面保留，`{file}` 单独一项。已有合法参数（含双引号、反斜杠、空串、空格）读到表单、编辑另一个字段后保存，参数数组逐项不变；不求值 shell、不做变量展开或命令替换；扩展名用空格或逗号分开，没写点的由页面补上；目录默认 `.`；时限按秒填，输入框标出 1–60，空着用动作的默认 30。
  - 每次保存（加、改、删、上移）都把整组连同读到的 `expected_version` 交给 `save`。修改时 `checker_id` 不变；新加的由页面按程序名取一个组内不重复的（`node`、`node-2`），人看不到它。
- **状态**：
  - 读取中。
  - 读不到：写出错误；已有列表保留，取消表单仍能回到原按钮。表单保存冲突后的重读失败，在表单内显示重读的错误，不把它留在对话框后面的状态行。上方的「刷新」重读目录，也重读检查器，不另放一个按钮。
  - 没有可用的目录：写「先在上方关联目录」。
  - 组里没有检查器：写「这个目录还没有配置写后检查器」。执行器已合入，Coding 时间线的「未检查」仍属 A2-2b；设置页不承诺尚未接上的时间线。
  - 保存中：整组的按钮禁用。
  - 版本过时（409）：先重读各组，重读成功才写「这组检查器已在别处改过，已重新读取，请再改一次」；重读也失败就留着重读的错误，不写这句。表单不关，人填的内容留着。
  - 删除先问：在 catalog 的警示对话框里问「删除检查器「名称」？」，不用浏览器自己的 `confirm()`；只有对话框里的「删除」才保存，取消、Esc、关闭都不动。
  - 焦点：加、改、上移、删除保存之后，以及表单、删除对话框以任何方式关闭之后，焦点回到人用过的那个按钮（按检查器和动作再找到它）；它没了（上移到了第一行、检查器被删）就回到这一组的「添加检查器」，不落到页面上。
  - 其他拒绝（400、403）：在表单里写出动作的提示语，表单不关。
- **页面资源**：脚本在 `molis-work-workbench.js` 里（工作台设置的嵌入也用它），会涨。先在同一个资源里找能省的；省不回的部分在 PR 里按用户决定 #17 写明，请评审一次性放行（预计不到 10 KB）。省的办法：每句话都由宿主按页面语言写在 HTML 里（`data-say` 和三个带 `{槽}` 的 `<template>`，`apps/workbench/src/write-checkers-section.ts`），页面程序只克隆并用 `textContent` 填槽，自己没有中文；这段程序是单独的常量（`WRITE_CHECKERS_CLIENT_SCRIPT`），只有画这一段的两处带它（工作台脚本、项目设置页），全局设置页不带，工作区脚本有它才绑定。
- **不做的**：不从项目文件里推荐检查器（§6.0p.2 最后一条）；不做拖动排序；不显示 `checker_id`。

| 编号 | 做到 | 拒绝或反例 | 用例 |
| --- | --- | --- | --- |
| PA-40 | 工作目录一节有「写后检查」，每个已授权目录一组，列出 `list` 返回的检查器 | 没授权、`realpath_verified` 为假的目录不出现；没有检查器的组明确未配置，不承诺下一片才实现的时间线 | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |
| PA-41 | 页面的保存经路由调 `save`，版本加 1；路由不另外校验 | 版本过时回 409 `actions.conflict`，配置不变；不合法回 400 `agent.write_checker_invalid`，提示语原样；不带控制令牌的请求被拒 | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |
| PA-42 | 表单换成合同的形状并可逆：已有合法参数含字面双引号、反斜杠、空串或空格时，编辑另一个字段后保存参数不变；带引号的参数算一项，`{file}` 单独一项，时限从秒换成毫秒；新检查器的编号组内不重复，修改时保留原编号；上移、删除只动那一项 | 没有 `{file}`、`{file}` 嵌在别的文字里、程序名带路径的，页面照样交给 `save`，由动作拒（页面不另写一套规则，只做补点、去空白、秒换毫秒这类整理） | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |
| PA-43 | 页面程序不带自己的句子：每句话在宿主写的标记里（`data-say`、`<template>` 的槽、带名字的 `aria-label`），删除问在警示对话框里，时限框接受毫秒（`step`）；只有画这一段的两处带这段程序，全局设置页不带 | 页面程序里没有 `confirm(`、没有中文、不用 `innerHTML`；全局设置页没有 `molisWorkWriteCheckers` 的定义，工作区脚本在它不在时不绑定也不报错 | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |

2026-10-20 真实浏览器验证通过：新增用例用临时 Home、真实 HTTP 与 Chrome 走独立/工作台嵌入设置页的保存、重读、修改 2500 ms、含引号/反斜杠/空串/空格参数只改名称后保存不变、上移、删除、取消/Esc 和焦点恢复；真实版本冲突和只拦 GET 的网络故障保留输入；撤回工作区授权后拒绝保存，重新授权仍读出原版本原配置。中英文各在 1440 浅色、1024 深色、390 浅色核对列表与编辑表单，长命令无横向溢出。12 张截图默认在忽略的 `.impeccable/qa/review/write-checkers-settings/`。这些覆盖自动化真实操作，不代替用户本人验收。

#### 6.0p.9 不做的

- 不自动发现检查器，不读仓库里的配置文件推命令。
- 不装工具，不起 LSP 或别的常驻语言服务。
- 不把整项目构建当成按文件诊断：配置里没有 `{file}` 的检查器保存时拒，第一刀只有按文件的。
- 不给检查器联网或额外路径（不带 `grants`）。
- 不改 SDK 官方编码包；Molis 不用官方包。

### 6.0q P4 助理一半 A4：Work 视图按合同取，委派上限是一张表，存量用一次性脚本（2026-10-17）

§7.5 第 5 条的第 7、8 项，加上 A1、A2 留给这一片的存量。统筹 10-17 定了四条：Q1、Q4 统筹定，Q2、Q3 用户在弹窗里定。

1. **Work 视图按合同逐项取。**
   - 以前 `publicWork` 从存的正文里剥掉宿主自己的几项，剩下的全放进视图（`...rest`），正文里多一个键，视图就多一个。
   - 现在由 `assistant-work-view.ts` 的 `workView` 按 `AssistantWork` 的字段一项项取，选填的只在有值时出现。
   - 合同以后加字段，漏取的编译不过（统筹审 #680 提）：必填的一半写成 `AssistantWork`，选填的一半写成「合同的每个选填字段都必须给、可以是 `undefined`」的类型，再只放进有值的。试过在合同上临时加一个选填字段、一个必填字段，构建都在 `workView` 报错；以前选填的那种会悄悄漏掉。
   - 子任务的 `delegated_by` 也这样取（`AssistantDelegations.shown`）：只取标题、验收标准和收回时刻。派它的工作从图上读，正文里留着的旧 `work_id` 盖不住它。
2. **委派上限是助理的产品规则**（Q1，统筹定 A）。
   - 6/3/2 放在 `assistant-delegation.ts` 的 `DELEGATION_LIMITS`（`parts`、`active`、`followUps`），只在这一处定义；告诉模型的话一字不改。
   - 原来写的是「搬进协作配置」，可 SDK 没有这个东西。它只有板的上限（`maxNodes`、`maxDepth` 等），那是 Runtime 的保护，不是助理的规则。
3. **存量用一次性脚本，不进仓库**（Q2，用户定 A）。
   - 删每项 Work 正文里的 `handed_back_run`、`hand_back_held`（§6.0n 第 8 条）。
   - 旧形状的子 Work（有 `delegated_by`，没有 `graph_id`/`node_id`）去掉 `delegated_by`，各自成为独立的工作，正文、轮次和结果都留着。不在 Prologue 的库里给它们补步骤。
   - 其余不在现行 `StoredWork` 里的键只列出来，不改。
   - 只改 `assistant_works.body`，在一个事务里；不动 `revision`、`updated_at`、`user_version`。只打印编号和个数，不打印标题和正文。
   - 脚本拒绝在真实 Home 的路径上跑。真实的库只在装下一个版本时写，和维护八同一步，那时再问用户。
   - **脚本在哪、怎么跑**：不进仓库，放在统筹的共享笔记目录（`~/Library/Application Support/Claude/side-session-notes/local_7207c245-d21c-46be-b897-b5267cf14585/adoption-a4-stored-works.mjs`）。`node adoption-a4-stored-works.mjs count <assistant.db>` 只列出会改的编号和个数，什么都不写；`apply <assistant.db>` 在一个事务里改完，再数一遍。
   - **跑之前先问用户**：对真实 Home 的任何一次 `count` 或 `apply` 都要用户先同意。写真实的库时，Home 先停，先备份，在拷贝上 `apply` 过，再对真实的库跑（脚本现在拒绝真实 Home 的路径，到那一步由维护八的流程决定怎么放行，也要用户同意）。
4. **演练**（Q3，用户同意）。
   - 用 `sqlite3` 以只读方式（`mode=ro`）把真实 Home 的 `assistant/assistant.db` 备份到草稿目录。只拷了这一个库：脚本不读 Prologue 的库。没读密钥，没碰钥匙串。
   - 列出的结果：13 张表，`user_version` 2；`assistant_works` 0 行（`assistant_rounds`、`assistant_jobs` 也是 0）。所以要改的是 0 项：两个旧键 0 项、旧形状子 Work 0 项、其余键 0 种。
   - **这是 10-17 只读拷贝上的数。** 装下一个版本时（和维护八同一步），写之前先再 `count` 一次：在那之前，已装的 10-11 构建还可能写出旧形状的行。
   - 在拷贝上执行了一遍：改了 0 项，`integrity_check` 为 ok，`user_version` 仍是 2。
   - 拷贝随即删掉。真实的库没被写，修改时间仍是 10-07 19:23；当时也没有进程打开它。
   - 另在一个合成库上试过一遍：两个旧键、一个旧形状子 Work、一个现行子 Work、一个陌生键。改了 2 项，现行子 Work 和陌生键原样，真实 Home 的路径被拒。
5. **复查已废的读写**：核过，没有别的。
   - `AssistantStore` 的方法都有调用方。
   - `handed_back_run`、`hand_back_held` 只在本文里出现。
   - `delegated_by` 的读法都按现行形状（`graph_id`、`node_id`）。
   - `assistant_jobs` 不再写，只在删工作时删行；删表另做（第 6 条）。
6. **不改基线**（Q4，统筹定）。A4 只改代码和脚本。3 号基线（删 `assistant_jobs`）另做一片，节奏跟维护八和 BL-157 的门禁走。

**验收**：

| 编号 | 证明 |
| --- | --- |
| W2-18-A4-VIEW-01 | 存的正文带两个旧键、一个陌生键和宿主自己的几项：视图正好是合同的 12 个必填字段，没有值的选填字段不出现。带齐选填字段的子任务：视图多出那 5 项，`delegated_by` 是派它的工作，加上它的标题和验收标准；正文的 `delegated_by` 里留着的 `work_id` 和别的键都不出现（`tests/assistant-work-view.test.ts`） |
| W2-18-A4-LIMITS-01 | 第七个子任务、第三次跟进、已有三个还在进行时的下一个都被拒，错误的原话照旧，被拒的那次不留下工作（`tests/assistant-delegation.test.ts` 里的三处；第三处在图上加三个没结束的步骤） |

**变异**（每条改回去重建、单跑对应的用例）：

| 变异 | 变红的用例 |
| --- | --- |
| M1 `publicWork` 改回 `...rest` | VIEW-01 |
| M2 `shown` 改回 `...rest` | VIEW-01 |
| M3 视图漏掉 `budget_tokens` | VIEW-01 |
| M4 `followUps` 改成 3，`parts` 那句话改一个字 | LIMITS-01 的前两处 |
| M5 `active` 改成 4 | LIMITS-01 的第三处 |
| M6 合同临时加一个选填字段（和一个必填字段） | 构建失败在 `workView`，不用等用例 |

同时进行的上限（3）以前没有用例，这一片补上了（第三处，统筹审 A4 时提）。

- 验证（叠在 #675 的 `fc2f7538d` 上）：
  - `pnpm build` 通过。全部非浏览器的 `assistant-*`、`prologue-work-*` 用例（36 个文件；补了第三处之后 `assistant-delegation` 又单跑一遍），加上 `project-deletion-assistant`、`security-invariants-assistant-html`、`agent-collaboration-revise`、`coding-delegation-waits`、`doc-reference-gates`、`health-gates-api-snapshot`，都一次过。
  - `pnpm test:security` 59/59，`pnpm test:contracts` 44/44。
  - `check-health-gates --base origin/main`、`boundary:check`、`page-assets --base origin/main` 都过。`AssistantService` 1555→1553 行，方法数 94 不变；本地快查跟着降。
  - 这一片没有改公开 API、动作和页面资源；门禁列出的两份 API 变化都是 #675 的。
- 未验证：浏览器用例和全量，由统筹排；真实的库没有写，等装下一个版本时和维护八一起。

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
- X5 常驻板：先 Coding、后助理（回执线 D9）；6 / 3 / 2 原值不变，放在助理自己的 `DELEGATION_LIMITS`（§6.0q）；助理一半按 W5-10 协作者形状做，开工前请防腐线负责人确认先后。
- X6 删除无板的 Agent 协作，不留兼容；Prologue 合同列出对所有消费方的公共行为变化，删掉的名字在 public-surface 快照里体现；自动建子节点对人无感。依据：用户否决「简单协作可以绕过 TaskBoard」；唯一消费方。

**实施前仍需核对/决定**：

1. 采用/统一协作线负责机制和 SDK 合成，统筹会话安排具体 writer 与共享文件时段（§5.2）。当前 A0 源码与本地验证已授权；推送、PR、合并与真实 Home 切换尚未授权。
2. 若落地必须改已被外部 Runtime 使用的 MCP 名字，列出精确新旧名和消费者后再请用户决定；本方案不预先授权改名。
3. 真实 Home 的切换时机、维护对象与备份/回退窗口，待隔离副本演练完成后提交具体方案再授权。本轮不把旧数据默认自动续跑。

跨工作/项目自动通信、自动扩大预算、扩大工作目标都不在本方案授权范围；需要这些新产品能力时另作明确决定，不阻塞范围内统一协作。

## 7. 远端交接（2026-10-13 晚，历史记录）

这是 2026-10-13 晚的交接。进度、分支和下一步已由开头的「交接（2026-10-20）」取代；仍然有效的是 7.3 的证据记录、7.5 第 5 项（P4 助理一半的清单，A1–A4 已按它做完，见 §6.0k–§6.0q）、7.7 决策记录、7.8 工作规则、7.9 已知问题和 7.10 复现命令。

### 7.1 一句话现状

已由开头「交接（2026-10-20）」的「现在的状态」取代。

### 7.2 分支和 PR（只列远端）

Molis 一侧已由开头「交接（2026-10-20）」的「已合入」「在途」「分支与工作树」取代。下表是 2026-10-13 时 Prologue 一侧的各刀（`molis-ai/prologue`，每刀一个 PR），之后的写在 §6 各节。

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

已由开头「交接（2026-10-20）」的「已合入」「在途」「没做完、没开工的」取代。

### 7.5 下一步（按顺序）

第 1–4 项（合 #408、A1 缺口、P2h 与 P2i、P3）由开头的「交接（2026-10-20）」取代。第 5 项是 P4 助理一半的清单，A1–A4 已按它做完（§6.0k–§6.0q），留作依据：

5. P4：Coding 先；助理那一半按 W5-10 的协作者形状（用户 2026-10-13 定：功能线做，算 W5-10 的一部分，防腐 spec 的 W5-10 行写「由本线 P4 实现」）。第 14 项（main 上的助理交回与续做）在 P4 改到统一合同上，不留兼容：
   1. 每个助理 Work 在第一跑之前有一块常驻板，委派的子 Work 是子节点（子 Work 只留节点引用，`delegated_by` 换成节点引用）；
   2. 删 `handed_back_run`、`hand_back_held`、`watch`、`settle`、`resume`、`markHandedBack`，改成父节点上的等待组加节点的接续记录，经 `collaborationHost.startContinuation` 起跑，请求键取代 `hand-back-<sha>`；
   3. `hold`（人停下）→ 取消等待 / 接续 `blocked`；
   4. `takeBack` → 改图交回父节点（代次 +1）；
   5. `status`（`waitForWorkChange`/`watchWorks`）→ 读协作等待视图；
   6. 交回材料与通知的文字保留为内容；
   7. 上限 6/3/2 数值不变，放在 `AssistantDelegations` 的 `DELEGATION_LIMITS`：助理的产品规则，只在这一处定义（统筹 10-17 定，§6.0q；原写的「协作配置」SDK 里没有）；
   8. 存量数据由维护改成现行形状，不加读取兜底；
   9. `AssistantDelegations` 已是按端口依赖宿主的协作者，就地改，`assistant-service.ts` 不许变长；
   10. 五个用例（`assistant-delegation-handback`、`assistant-delegation`、`assistant-work-wait`、`assistant-handback.e2e`、`assistant-follow-live.e2e`）换成协作合同的用例。

### 7.6 跨线依赖

已过时：#408 已合，各线不再等它。现在的依赖写在 BL-301～309、BL-162、BL-176 各行。

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
| 统筹 10-16 | 外部等待的 `molis.action-query` 也拒声明了 `model:invoke` 的只读查询，码同判断（`agent.collaboration_check_not_read`）；按动作声明的权限判断，不另写名单 | 检查器反复去看，每看一次调一次模型，花费无界、结果不确定；§4.6.9 已写检查器不得调用模型，spec 不自相矛盾；拒绝要有自己的用例（S-27） |
| 统筹 10-16（B） | `molis.action-query@1` 只收动作工具名 `tool`；名字到精确引用的表由 `prologue-action-tools.ts` 的 `actionToolRefs` 在 `remember()` 时建，检查器不算哈希 | 模型看不到精确引用；改所有角色的工具描述（A）比这一片宽，什么都不改（C）检查器就用不上 |
| 用户 10-16（§6.0g） | 助理网关为模型写错形状做的纠正全删：写成文字的数和布尔、JSON 字符串解码、纯文本当唯一文本字段、空白当 `{}`、写在身份旁边的字段；`find-capabilities` 之前也不另留路径，同样由能力合同在审查前拒绝，错误里写明哪个字段不对，让模型自己重发。只留 `input` 整个没给时对象合同得 `{}` | 带上类型后 30 次调用只有 1 次要纠正，且在找之前、本来就会被拒（§6.0f）；纠正是替模型猜，形状错了模型看不到，按 §11 不为模型能力打补丁 |
| 统筹 10-17 定 A（§6.0i） | Coding 协调者角色加 `board-read`、`board-report`，孩子由 SDK 按 T12 继承；孩子角色与提示词不变 | 让出的孩子报不了自己那一步，父亲的等待总是失败；宿主的板钩子已经只许读本项目、只报自己持有的步骤 |
| 统筹 10-17（§6.0j） | 人改计划从 typed `agent.run.step-board.amend.v1` 换成动作 `agent.collaboration.revise.v1`，旧的同一刀删掉；`control` 的 `retry`、`resolve-reconciliation` 与 `revise` 的取消/重试节点这一刀不做 | 阶段一不留兼容；那几样现在没有调用方，加了就是没人用的合同，页面要时再加并升 `version` |
| 用户 10-17（§6.0j） | 换成从 Prologue main `c673238e`（#33）打的 reference-kinds 包，并进 P4 第一个改合同的片，不单独换 | 一次换包、一次 Molis 验证；Molis 这一刀不配名单，行为不变 |
| 统筹 10-17 · 助理一半五条（§6.0k） | 每个 Work 一块图、子任务共用（用户弹窗）；交回后自动接着做，用请求键起跑；一次跟进一个步骤；A1 先做，A3 之前先核实 SDK 的接续收尾；存量用一次性脚本，先在真实 Home 的只读拷贝上试跑给用户看（用户弹窗） | 助理的 Work 可以不属于项目，也不跨 Work 发信；W5-10 的形状 |
| A1 · 收回不交接（§6.0k 第 1 条） | 收回时由人结束这一部分还没结束的步骤（代次 +1）；「由父工作做完」记在子 Work 上，不把步骤交给父会话 | 交给父会话的那一步没有轮站在上面，永远不结束，A2 的等待会等不到；已结束的子任务没有步骤可交 |
| A1 · 跟进要等这一部分结束（§6.0k 第 2 条） | 子任务还有没结束的步骤时，拒绝跟进 | 一次跟进一个步骤；送进正在跑的一轮就记不成步骤，上限也就数不准 |
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
| 统筹 10-17 · Q1 选 A（§6.0q 第 2 条） | 上限 6/3/2 放在 `AssistantDelegations` 的 `DELEGATION_LIMITS`，措辞不变；spec 写明它是助理的产品规则，只在这一处定义 | SDK 没有「协作配置」；板的上限是 Runtime 的保护，不是助理的规则 |
| 用户 10-17 · Q2 选 A（§6.0q 第 3 条） | 一次性脚本去掉旧形状子 Work 的 `delegated_by`，它们成为独立的工作，正文、轮次和结果都留着；不在 Prologue 的库里补步骤 | 旧子任务在图上没有步骤可指；合同只认现行形状 |
| 用户 10-17 · Q3 同意（§6.0q 第 4 条） | 在真实 Home 助理数据的只读拷贝上演练：只拷助理库和 Prologue 的库文件，先列出会改多少项，再在拷贝上跑一遍；不读密钥，不碰 Home 主密钥的钥匙串条目；跑完删拷贝。真实的库只在装下一个版本时、和维护八同一步写，那时再问用户 | 演练不写真实数据；真正的写入和维护在同一次安装里 |
| 统筹 10-17 · Q4 不是（§6.0q 第 6 条） | A4 只改代码和脚本；3 号基线（删 `assistant_jobs`）另做一片，节奏跟维护八和 BL-157 的门禁走 | 改基线要带维护，会动真实 Home |
| 统筹 10-18 定 · A2 对照 #45、#47 的四处（§6.0p.10） | 一次写入只跑配置里第一个适用的检查器；截断用 SDK 的 `config.tool.observation`；观察是 SDK 写的，Molis 只写「未检查」的原因；审查卡用 `isAfterWriteCheckOperationKey` 认，名和版本按执行器记下的（run，`operationKey`）读 | SDK 的缝一次只收一条命令、自己截断、自己写观察；键只在一轮里唯一，拿命令反查要靠保存时多一条唯一规则 |
| 统筹 10-18 定 · A2-1 的 id 与 SSOT（§6.0p.10） | 动作 id `agent.write_checkers.list.v1`、`agent.write_checkers.save.v1`，受众只有 `user`；SSOT 写明 `agent-host` 只另存三类人保存的 Agent 配置（MCP、Skill、写后检查器）；安全不变量随 A2-2 | id 会进动作目录、工具清单和 MCP 工具名，「checkers」和等待检查器分不开；保存时的校验不是边界，边界在执行器 |

### 7.8 工作规则

- **拍板**：技术决策按防腐线的后果判断；功能决策按对用户 UI 交互与使用体验最好的推荐走。本线内的决定写进决策记录并在汇报里列出；跨线或改范围的找统筹。替用户拍板不等于用户验收。
- **Molis 每片一个 PR**，交评审会话评审、修意见、合并（统筹 2026-10-19 定）。**Prologue 每刀一个 PR**。
- **合并**：Prologue PR 由统筹验证过就合（用户 2026-10-13 授权），合之前先重新 build dist，再跑 SDK 全量与干净包消费者检查。Molis PR 由评审会话合，条件是 `Verify` 绿、与 main 同步、secrets 与 health `--base` 过、证据入本文、读过 diff。
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

**Prologue（P2 各刀）**：干净包消费者检查的完整步骤：`git archive <提交> | tar -x -C <空目录>` → 在里面 `pnpm install --frozen-lockfile --offline` → `pnpm --filter @prologue/sdk run build` → `cd packages/sdk && pnpm pack --pack-destination <另一个空目录>` → 在第三个空目录写 `package.json`（`"type": "module"`，依赖 `"@prologue/sdk": "file:<tgz 绝对路径>"`）→ `pnpm install` → 把 `packages/sdk/test/fixtures/taskboard-*-consumer.mjs` 拷进来逐个 `node`；再用上一刀的包跑最新脚本，应当失败。变异检查的做法：用 `sed` / 脚本把一处源码改坏、跑相关用例应当变红、再还原；每一刀的合同条目里列了变异清单。

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

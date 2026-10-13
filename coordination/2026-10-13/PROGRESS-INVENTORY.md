# 四条线进展盘点

生成：2026-10-13 12:53 UTC。范围：2026-10-12 04:15 UTC（北京时间 12:15，统筹开始）之后的提交。
「已进 main」= 随我们的 PR 合进该仓库 main；「已推远端」= 在某个远端分支上但没进 main；「只在本地」= 没有任何远端分支包含。
作者 Creamie X 是改用 jing xu 身份之前的提交（未合并的已改写；已进 main 的改不了）。

## Molis（molis-ai/molis-work）

### Molis · 采用线

**已进 main**：11 个内容提交（其中 10 个是任务开始前就有的），2 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `77fde104` | 10-09 13:35 | yijunw0212 | wip(prologue-adoption): in-flight SDK, budget params, state/event projection, tool effects, yield refusal, command grants review（任务前） | #472 |
| `da9ddd99` | 10-09 14:04 | yijunw0212 | refactor(agent-host,coding): make room in giant units for the Prologue adoption（任务前） | #472 |
| `804384d8` | 10-09 14:16 | yijunw0212 | test(prologue-adoption): pre-dispatch refusal sends nothing; tools read only when they change nothing; SDK path in workspace packages（任务前） | #472 |
| `5a4d6feb` | 10-09 14:17 | yijunw0212 | test(prologue-adoption): a pinned memory's fake system markers reach the model neutralized（任务前） | #472 |
| `ceac00a2` | 10-09 14:30 | yijunw0212 | feat(prologue-adoption): reasoning effort per round and mid-run model switch（任务前） | #472 |
| `4d90a1b4` | 10-09 14:37 | yijunw0212 | feat(prologue-adoption): composer model controls verified in the browser; turn-change rows and refused-write words covered（任务前） | #472 |
| `65d6c3e1` | 10-09 14:48 | yijunw0212 | feat(prologue-adoption): 灵光 replies stream as a preview with Stop; only the checked reply is saved（任务前） | #472 |
| `b3235bb1` | 10-09 15:08 | yijunw0212 | feat(assistant): 页面与定时任务等变化而不是按时读取（第 12 项）（任务前） | #472 |
| `8c0b60fb` | 10-09 15:18 | yijunw0212 | test(assistant): the change-wait test imports the local host's public entry（任务前） | #472 |
| `8b1a0522` | 10-09 15:43 | yijunw0212 | feat(assistant): 子任务交回与续做（第 14 项）（任务前） | #472 |
| `7795b7a4` | 10-13 10:01 | yijunw0212 | refresh the coding run-control action snapshot | #472 |

合并提交：`51a2d82a`（#472）merge feat/prologue-adoption into current main；`fc18d5f6`（#472）Merge pull request #472 from molis-ai/feat/prologue-adoption

**已推远端：在交接 PR 分支上**：15 个内容提交，7 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `14be526a` | 10-12 04:55 | jing xu | build(agent-host): vendor the clean named Prologue package for A0 | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `f62781b4` | 10-12 05:47 | jing xu | fix(coding): bring A0 UI additions back under the frozen page-asset budgets | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `664d3cd3` | 10-12 05:52 | jing xu | docs(prologue-adoption): A0 close-out record with three evidence levels | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `ef8fa93c` | 10-12 06:03 | jing xu | chore(vendor): delete side-panel-memory.patch and register it as the 26th patch | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `7c5bbb88` | 10-12 07:12 | jing xu | test(ci): do not list in the product subset what the blocking job already runs | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `7f35fe3b` | 10-12 07:24 | jing xu | build(agent-host): record the vendored Prologue package's source as the upstream main merge | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `c7a97517` | 10-12 12:00 | jing xu | docs(prologue-adoption): record the partial full regression and the failure triage | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `87712ba9` | 10-12 13:24 | jing xu | build(agent-host): vendor the Prologue package with input receipts S2 and S3 | feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `7c97a03c` | 10-12 13:51 | jing xu | build(agent-host): record the vendored Prologue package's source as the upstream main merge (PR 5) | feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `c08fe32f` | 10-12 13:52 | jing xu | docs(prologue-adoption): second package state and decision log | feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `de111f91` | 10-12 14:28 | jing xu | docs(prologue-adoption): freeze the P1 TaskBoard collaboration contract (§4.6.9) | feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package |
| `9fc2d3b1` | 10-12 18:23 | jing xu | docs(prologue-adoption): P2 SDK progress, contract fix T7–T9, commits-only-in-handoff-PR decision | feature/handoff-prologue-adoption |
| `bddbf45c` | 10-12 19:38 | jing xu | fix(agent-host): 流投影里三个新事件改成有类型的联合成员，去掉 as unknown as；spec 记下防腐复查 | feature/handoff-prologue-adoption |
| `de1952e2` | 10-13 12:51 | jing xu | docs(prologue-adoption): 交接里 #408 的 head 说法改准 | feature/handoff-prologue-adoption |
| `a8449e2d` | 10-13 12:51 | jing xu | docs(prologue-adoption): 远端交接（2026-10-13）——取代旧交接，自成一体 | feature/handoff-prologue-adoption |

合并提交：`d7f17580`（feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package）Merge origin/main into feature/handoff-prologue-adoption；`7fc1a5ea`（feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package）Merge origin/main (a091fb67) into feature/handoff-prologue-a；`b804777a`（feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package）Merge origin/main (032a5d00) into feature/handoff-prologue-a；`81d1d9d8`（feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package）Merge origin/main (bcad2584) into feature/handoff-prologue-a；`0e36067a`（feature/agent-typed-questions、feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package）Merge origin/main (aadeef76) into feature/handoff-prologue-a；`4e426f4c`（feature/handoff-prologue-adoption、feature/prologue-adoption-s3-package）Merge feature/handoff-prologue-adoption (P1 contract docs) i；`9a7c9505`（feature/handoff-prologue-adoption）Merge branch 'main' of github.com:molis-ai/molis-work into f

### Molis · 回执线

**已推远端：在交接 PR 分支上**：21 个内容提交，7 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `e2a13e28` | 10-12 05:30 | jing xu | docs(ai-input-receipts): S2 进展、§6.1 第 4 项按实际入口改写、§6.2a 按现行 contracts 核对落点 | feature/handoff-ai-input-receipts |
| `28455812` | 10-12 05:52 | jing xu | docs(ai-input-receipts): §6.1 第 5、6 项对齐 SDK 第三刀合同草稿 | feature/handoff-ai-input-receipts |
| `06b90328` | 10-12 07:31 | jing xu | docs(ai-input-receipts): 记 D10–D12（情境条边界、S2 开关归属、S3 工具可见性）与 S3 进展 | feature/handoff-ai-input-receipts |
| `22447b86` | 10-12 07:55 | jing xu | docs(ai-input-receipts): 记与交互线的三件跨线约定（D13 回答的身份、D14 D5 修订、D15 AgentRunControl 先后） | feature/handoff-ai-input-receipts |
| `443084ff` | 10-12 10:49 | jing xu | docs(ai-input-receipts): R0 独立回执体验预览的范围、数据来源取舍与验收编号（§18） | feature/handoff-ai-input-receipts |
| `26012a6e` | 10-12 12:04 | jing xu | feat(preview): R0 回执预览的录制脚本与录好的 SDK 事实（Prologue 37427d09） | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `fd9b625e` | 10-12 12:14 | jing xu | feat(preview): R0 回执预览——页面、状态逻辑与非浏览器用例 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `c069ca27` | 10-12 12:17 | jing xu | feat(preview): R0 预览——停止场景终稿、结束卡列出排队项、可按参数直接打开某个状态 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `ecbd3782` | 10-12 12:29 | jing xu | feat(preview): R0 浏览器用例，「模拟」声明在任何宽度都完整显示，助理面板后的工作区压暗 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `1b919566` | 10-12 12:41 | jing xu | feat(preview): R0 走查修正——共用账位置的检查点、390 触控目标、结束卡与重启分支用例 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `dc6788ee` | 10-12 12:44 | jing xu | docs(ai-input-receipts): R0 实现记录（§18.8）——代码在 PR #438，与规划的差异、验收对照和三层证据 | feature/handoff-ai-input-receipts |
| `3a9153b7` | 10-12 12:51 | jing xu | feat(preview): R0 目标芯片的输入框标记改用 #423 的共享部件 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `ca8d2262` | 10-12 13:00 | jing xu | test(preview): R0 用例不再直接 import 设计系统源码，改用页面嵌入的标记 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `e8466869` | 10-12 13:00 | jing xu | docs(ai-input-receipts): §18.8 目标芯片改用 #423 的共享标记，浏览器用例在合入 main 之后的末端重跑 10/10 | feature/handoff-ai-input-receipts |
| `d840cebc` | 10-12 13:27 | jing xu | fix(preview): R0 页面不再把工具名 acknowledge-inputs 给人看，用例逐检查点核对 | feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts |
| `7c886623` | 10-12 13:28 | jing xu | docs(ai-input-receipts): D16 待办——acknowledge-inputs 在助理面板里的显示与措辞归本线，D7 之后接 S3 时定 | feature/handoff-ai-input-receipts |
| `51e4c73c` | 10-12 14:58 | jing xu | docs(ai-input-receipts): §6.1 第 7、8 项对齐 SDK 第四刀合同草稿（加 pending-cancelled、待办编号保留状态） | feature/handoff-ai-input-receipts |
| `516faf04` | 10-12 18:57 | jing xu | docs(ai-input-receipts): R0 并入交接 PR #409（用户决定各线只在交接 PR 里提交），spec 里的落点同步 | feature/handoff-ai-input-receipts |
| `ffe017ec` | 10-12 19:01 | jing xu | docs(ai-input-receipts): §16 记 S4 工程通过（Prologue PR #10）与 R0 并入交接 PR | feature/handoff-ai-input-receipts |
| `c2e5c806` | 10-12 19:30 | jing xu | docs(ai-input-receipts): R0 浏览器用例并入 #409 之后尚未重跑（browser 锁被占），如实记 | feature/handoff-ai-input-receipts |
| `ca253fe1` | 10-13 12:52 | jing xu | docs(ai-input-receipts): §19 远端交接（2026-10-13，当前接续入口）——分支与 PR、证据等级、没完成的、下一步与前置、跨线约定、决策、工作规则、复现命令 | feature/handoff-ai-input-receipts |

合并提交：`d57e5da3`（feature/handoff-ai-input-receipts）merge: main 02ceba8c 进输入回执需求分支；`c0054b4e`（feature/handoff-ai-input-receipts）merge: main aadeef76 进输入回执分支；`dad9ed93`（feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts）Merge branch 'main' of github.com:molis-ai/molis-work into f；`e43e5402`（feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts）Merge branch 'main' of github.com:molis-ai/molis-work into f；`a7bdb72d`（feature/ai-input-receipts-r0、feature/handoff-ai-input-receipts）Merge branch 'main' into feature/ai-input-receipts-r0；`30a0b7f3`（feature/handoff-ai-input-receipts）Merge remote-tracking branch 'origin/feature/ai-input-receip；`0d363c64`（feature/handoff-ai-input-receipts）Merge remote-tracking branch 'origin/main' into feature/hand

### Molis · 交互线

**已进 main**：2 个内容提交，6 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `7b6cbed5` | 10-12 07:22 | jing xu | feat(design-system): shared AI interaction parts on the component board | #423 |
| `e3835115` | 10-12 07:43 | jing xu | fix(design-system): interaction parts — escape ids once, radio semantics, unique sample ids | #423 |

合并提交：`accd3d30`（#423）Merge remote-tracking branch 'origin/main' into feature/desi；`95e61777`（#423）Merge remote-tracking branch 'origin/main' into feature/desi；`7f4d37c7`（#423）Merge remote-tracking branch 'origin/main' into feature/desi；`d162b9a8`（#423）Merge branch 'main' into feature/design-system-interaction-p；`8ef679d7`（#423）Merge branch 'main' into feature/design-system-interaction-p；`05c46f67`（#423）Merge pull request #423 from molis-ai/feature/design-system-

**已推远端：在交接 PR 分支上**：19 个内容提交，11 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `14ebbf6f` | 10-12 05:02 | jing xu | feat(ai-interaction): rebuild the I0 preview inside the workbench frame | feature/handoff-ai-interaction |
| `6f1e0095` | 10-12 05:03 | jing xu | fix(ai-interaction): keep each scene's object version to itself | feature/handoff-ai-interaction |
| `24bc0dd6` | 10-12 05:30 | jing xu | fix(ai-interaction): settle the I0 preview after its first browser run | feature/handoff-ai-interaction |
| `ba7f75a7` | 10-12 06:04 | jing xu | feat(design-system): shared AI interaction parts on the component board | feature/handoff-ai-interaction |
| `b0bf6b0a` | 10-12 07:04 | jing xu | feat(design-system): provenance and SDK-shaped fields on the interaction parts | feature/handoff-ai-interaction |
| `82201bba` | 10-12 07:27 | jing xu | fix(design-system): the stepper's input is a full-height touch target | feature/handoff-ai-interaction |
| `f2049a25` | 10-12 07:40 | jing xu | docs(ai-interaction): slices and PR sequence after #423 | feature/handoff-ai-interaction |
| `abce6410` | 10-12 07:47 | jing xu | feat(design-system): shared browser behaviour for the interaction parts | feature/handoff-ai-interaction、feature/interaction-shared-behaviour |
| `0cfe5913` | 10-12 09:33 | jing xu | fix(design-system): the calendar helper needs no root | feature/handoff-ai-interaction、feature/interaction-shared-behaviour |
| `f784d69c` | 10-12 11:56 | jing xu | docs(ai-interaction): record the #423 review fixes and the I1 shared behaviour | feature/handoff-ai-interaction |
| `f5897596` | 10-12 13:37 | jing xu | fix(design-system): interaction client — outside press, WebKit Enter, focus on the pick | feature/handoff-ai-interaction、feature/interaction-shared-behaviour |
| `e5f17991` | 10-12 13:56 | jing xu | test(design-system): the board sample's own script runs once | feature/handoff-ai-interaction、feature/interaction-shared-behaviour |
| `9773111e` | 10-12 14:32 | jing xu | docs(ai-interaction): the TaskBoard premises for H2 and H4 | feature/handoff-ai-interaction |
| `878c0b8e` | 10-12 14:43 | jing xu | docs(ai-interaction): C1 splits into C1a (additive subpath) and C1b (after #408) | feature/handoff-ai-interaction |
| `947ebc33` | 10-12 15:00 | jing xu | docs(ai-interaction): C1 and H1 become one slice, S1 moves after A1/A2 (D8 revised, D11) | feature/handoff-ai-interaction |
| `a1981f8e` | 10-12 18:38 | jing xu | docs(ai-interaction): progress for the I1 merge, the preview migration and the A1 byte budget | feature/handoff-ai-interaction |
| `b06be31f` | 10-12 18:38 | jing xu | refactor(ai-interaction): the I0 preview uses the shared interaction client | feature/handoff-ai-interaction |
| `47babdd5` | 10-12 18:42 | jing xu | docs(ai-interaction): anti-corruption review 1 after merging main 1ec92c18 | feature/handoff-ai-interaction |
| `b3629e6f` | 10-13 12:49 | jing xu | docs(ai-interaction): self-contained remote handoff (2026-10-13) | feature/handoff-ai-interaction |

合并提交：`f00029c8`（feature/handoff-ai-interaction）Merge remote-tracking branch 'origin/main' into feature/hand；`42d30d36`（feature/handoff-ai-interaction、feature/interaction-shared-behaviour）Merge branch 'feature/design-system-interaction-parts' into ；`9fed98f6`（feature/handoff-ai-interaction、feature/interaction-shared-behaviour）Merge branch 'feature/design-system-interaction-parts' into ；`44c0d6ef`（feature/handoff-ai-interaction）Merge remote-tracking branch 'origin/main' into feature/hand；`68137108`（feature/handoff-ai-interaction、feature/interaction-shared-behaviour）Merge remote-tracking branch 'origin/main' into feature/inte；`ee49f7ea`（feature/handoff-ai-interaction）Merge remote-tracking branch 'origin/main' into feature/hand；`3e744c4e`（feature/handoff-ai-interaction、feature/interaction-shared-behaviour）Merge remote-tracking branch 'origin/main' into feature/inte；`7eb54451`（feature/handoff-ai-interaction、feature/interaction-shared-behaviour）Merge remote-tracking branch 'origin/main' into feature/inte；`12648b9a`（feature/handoff-ai-interaction）Merge remote-tracking branch 'origin/main' into feature/hand；`933c664f`（feature/handoff-ai-interaction）Merge feature/interaction-shared-behaviour (I1) into the han；`2f573bf6`（feature/handoff-ai-interaction）Merge remote-tracking branch 'origin/main' into feature/hand

**已推远端：只在其他分支**：2 个内容提交，2 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `704d95de` | 10-12 14:43 | jing xu | feat(contracts): services/agent-interaction — questions, answers and field problems | feature/agent-interaction-contract（C1a，#447 已作废关闭） |
| `c50a5534` | 10-12 15:01 | jing xu | feat(agent-host): typed questions in the host (C1+H1, unbuilt, unverified) | feature/agent-typed-questions（C1+H1：等 #408 进 main 后并入 #410） |

合并提交：`00dee4f2`（feature/interaction-shared-behaviour）Merge branch 'main' into feature/interaction-shared-behaviou；`b4015af1`（feature/interaction-shared-behaviour）Merge branch 'main' into feature/interaction-shared-behaviou

### Molis · 情境线

**已推远端：在交接 PR 分支上**：31 个内容提交，11 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `6454915a` | 10-12 06:12 | jing xu | feat(context): polish the W0 preview on real use and record evidence | feature/handoff-contextual-actions |
| `da2509c9` | 10-12 06:34 | jing xu | docs(context): plan W1 slices, gates and cross-line collisions | feature/handoff-contextual-actions |
| `f40ffca8` | 10-12 07:37 | jing xu | docs(context): W1 plan rows follow what W1-1 and W1-3 actually do | feature/handoff-contextual-actions |
| `54c79004` | 10-12 07:39 | jing xu | feat(contracts): where the thing in hand is and where it can go (W1-3) | feat/context-w1-contracts、feat/context-w1-declarations、feat/context-w1-derivation、feat/context-w1-drafting、feat/context-w1-manual、feat/context-w1-toolbar、feat/context-w2-toolbar、feature/handoff-contextual-actions |
| `2d8a56dc` | 10-12 07:39 | jing xu | refactor(workbench): split the context row's script into bar, bus and the factory (W1-1) | feat/context-w1-split-context-actions、feature/handoff-contextual-actions |
| `e4062fce` | 10-12 07:43 | jing xu | feat(sdk): a command can declare that it creates an Item or adds to one (W1-4) | feat/context-w1-declarations、feat/context-w1-derivation、feat/context-w1-drafting、feat/context-w1-manual、feature/handoff-contextual-actions |
| `47c00b44` | 10-12 07:47 | jing xu | feat(kernel): destinations are candidates, and only ever take a recommended slot (W1-5) | feat/context-w1-derivation、feat/context-w1-drafting、feat/context-w1-manual、feature/handoff-contextual-actions |
| `c8a15bbf` | 10-12 07:49 | jing xu | docs(skill): contextual chapter for plugin authors, and the manual's matching section (W1-8, part 1) | feat/context-w1-manual、feature/handoff-contextual-actions |
| `5af907b1` | 10-12 08:16 | jing xu | feat(host): draft a creation entry's input for what is in hand or for a sentence (W1-7) | feat/context-w1-drafting、feature/handoff-contextual-actions |
| `4c3c2a98` | 10-12 08:16 | jing xu | docs(context): record what W1 built and where it differs from the plan | feature/handoff-contextual-actions |
| `ea0a1875` | 10-12 11:04 | jing xu | docs(context): plan W2, the floating toolbar replacing the bottom row with Pages moved onto it | feature/handoff-contextual-actions |
| `03ed8ed2` | 10-12 12:13 | jing xu | refactor(workbench): the context bus no longer needs the row (W2-0) | feature/handoff-contextual-actions |
| `f3b3c7e9` | 10-12 12:52 | jing xu | refactor(design-system): where a floating layer goes moves to the design system (W1-2) | feat/context-w1-floating、feature/handoff-contextual-actions |
| `e67cd28e` | 10-12 13:03 | jing xu | feat(design-system): the context toolbar primitive, on the component board (W1-6) | feature/handoff-contextual-actions |
| `c22718bb` | 10-12 14:32 | jing xu | docs(context): record W1-2, W1-6 and W2-0 results and the rules they ran into | feature/handoff-contextual-actions |
| `03d6528b` | 10-12 18:19 | jing xu | docs(contextual): the toolbar is the one place ranked actions are shown (W2, 5/5) | feature/handoff-contextual-actions |
| `4d1262b7` | 10-12 18:19 | jing xu | test(contextual): the entries move from the row to the bar, and nothing is relaxed (W2, 4/5) | feature/handoff-contextual-actions |
| `d7529d86` | 10-12 18:19 | jing xu | refactor(contracts): drop the two events and constants only the writing menu used (W2, 3/5) | feature/handoff-contextual-actions |
| `83c638ef` | 10-12 18:19 | jing xu | feat(pages): Pages' tools, forms and writing actions move onto the context toolbar (W2, 2/5) | feature/handoff-contextual-actions |
| `4a1981da` | 10-12 18:19 | jing xu | feat(workbench): the context toolbar replaces the row above the Assistant's input (W2, 1/5) | feature/handoff-contextual-actions |
| `b789b009` | 10-12 18:21 | jing xu | docs(context): record what W2 built and where it differs from the plan | feature/handoff-contextual-actions |
| `fb7fc705` | 10-12 18:41 | jing xu | fix(pages): keep client.ts no larger than main's after the toolbar migration | feature/handoff-contextual-actions |
| `dd24dc6d` | 10-13 02:11 | jing xu | perf(pages): the Pages client script goes through compactScript, which also pays for the toolbar's wiring | feature/handoff-contextual-actions |
| `88f39abc` | 10-13 02:31 | jing xu | fix(contextual): the toolbar's animation uses the shared motion tokens, and Pages takes its panel down when it closes the editor | feature/handoff-contextual-actions |
| `40313fed` | 10-13 02:38 | jing xu | fix(pages): the plugin client is already compacted when served; send the panel request from one place and publish tools directly | feature/handoff-contextual-actions |
| `771b003e` | 10-13 03:00 | jing xu | chore(gates): lower the page-asset budgets to what the toolbar swap built | feature/handoff-contextual-actions |
| `44d551bc` | 10-13 03:01 | jing xu | chore(gates): regenerate the local baseline against the merged main | feature/handoff-contextual-actions |
| `be29dd53` | 10-13 03:02 | jing xu | docs(context): correct a figure in the review record | feature/handoff-contextual-actions |
| `1c76b258` | 10-13 03:02 | jing xu | docs(context): record the anti-corruption review and where the line stands in the handoff branch | feature/handoff-contextual-actions |
| `82c91635` | 10-13 12:50 | jing xu | docs(context): remote handoff (2026-10-13), the current entry point for taking this line over | feature/handoff-contextual-actions |
| `0eff51d8` | 10-13 12:51 | jing xu | docs(context): the confirmed W1-4 regression is the first open item in the handoff | feature/handoff-contextual-actions |

合并提交：`c38173bb`（feature/handoff-contextual-actions）Merge remote-tracking branch 'origin/main' into feature/hand；`d8c1f8ff`（feat/context-w1-split-context-actions、feature/handoff-contextual-actions）Merge branch 'main' into feat/context-w1-split-context-actio；`35d1c21d`（feat/context-w1-split-context-actions、feature/handoff-contextual-actions）Merge branch 'main' into feat/context-w1-split-context-actio；`88f78297`（feat/context-w1-split-context-actions、feature/handoff-contextual-actions）Merge branch 'main' into feat/context-w1-split-context-actio；`cbae50d0`（feature/handoff-contextual-actions）Merge main into the contextual-actions handoff branch；`47e73845`（feature/handoff-contextual-actions）Merge W1-7 (drafting a creation entry's input) into the hand；`bf5da48a`（feature/handoff-contextual-actions）Merge the W1 stack (contracts, declarations, derivation, man；`daf51bec`（feature/handoff-contextual-actions）Merge W1-2 (placement moves into the design system) into the；`8a97c1c0`（feature/handoff-contextual-actions）Merge W1-1 (the context row's script split into bar, bus and；`9a3a4a75`（feature/handoff-contextual-actions）Merge main into the contextual-actions handoff branch (after；`6bba80dd`（feature/handoff-contextual-actions）Merge main into the contextual-actions handoff branch

**已推远端：只在其他分支**：9 个内容提交，0 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `80834a98` | 10-12 07:39 | jing xu | refactor(workbench): split the context row's script into bar, bus and the factory (W1-1) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `18e219a3` | 10-12 12:13 | jing xu | refactor(workbench): the context bus no longer needs the row (W2-0) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `30ab090b` | 10-12 12:52 | jing xu | refactor(design-system): where a floating layer goes moves to the design system (W1-2) | feat/context-w1-toolbar、feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `ab3d6bb6` | 10-12 13:03 | jing xu | feat(design-system): the context toolbar primitive, on the component board (W1-6) | feat/context-w1-toolbar、feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `27e85a3f` | 10-12 18:19 | jing xu | docs(contextual): the toolbar is the one place ranked actions are shown (W2, 5/5) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `755ec698` | 10-12 18:19 | jing xu | test(contextual): the entries move from the row to the bar, and nothing is relaxed (W2, 4/5) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `d264415b` | 10-12 18:19 | jing xu | refactor(contracts): drop the two events and constants only the writing menu used (W2, 3/5) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `950afda8` | 10-12 18:19 | jing xu | feat(pages): Pages' tools, forms and writing actions move onto the context toolbar (W2, 2/5) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |
| `10bc5aa7` | 10-12 18:19 | jing xu | feat(workbench): the context toolbar replaces the row above the Assistant's input (W2, 1/5) | feat/context-w2-toolbar（旧版本；同名提交已以新提交进交接分支） |

**只在本地**：6 个内容提交，0 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `cbfe997c` | 10-12 12:13 | jing xu | refactor(workbench): the context bus no longer needs the row (W2-0) | feat/context-w2-bus-view（旧版本，同名提交已以新版本进 #411） |
| `9fe0cf7f` | 10-12 18:19 | jing xu | docs(contextual): the toolbar is the one place ranked actions are shown (W2, 5/5) | feat/context-w2-toolbar（旧版本，同名提交已以新版本进 #411） |
| `491cd755` | 10-12 18:19 | jing xu | test(contextual): the entries move from the row to the bar, and nothing is relaxed (W2, 4/5) | feat/context-w2-toolbar（旧版本，同名提交已以新版本进 #411） |
| `1b9b800c` | 10-12 18:19 | jing xu | refactor(contracts): drop the two events and constants only the writing menu used (W2, 3/5) | feat/context-w2-toolbar（旧版本，同名提交已以新版本进 #411） |
| `b6e62a31` | 10-12 18:19 | jing xu | feat(pages): Pages' tools, forms and writing actions move onto the context toolbar (W2, 2/5) | feat/context-w2-toolbar（旧版本，同名提交已以新版本进 #411） |
| `f003eff9` | 10-12 18:19 | jing xu | feat(workbench): the context toolbar replaces the row above the Assistant's input (W2, 1/5) | feat/context-w2-toolbar（旧版本，同名提交已以新版本进 #411） |

### Molis · 统筹

**只在本地**：0 个内容提交，3 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |

合并提交：`d88f2063`（integration/batch1（统筹的批量全量集成分支，不需要推））integration(batch1): merge #442 (includes #408)；`e91d135f`（integration/batch1（统筹的批量全量集成分支，不需要推））integration(batch1): merge #434 (W1-8 manual)；`9f238401`（integration/batch1（统筹的批量全量集成分支，不需要推））integration(batch1): merge W1 stack through #433

## Prologue（molis-ai/prologue）

### Prologue · 采用线

**已进 main**：16 个内容提交（其中 1 个是任务开始前就有的），13 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `c4b9fde3` | 10-09 13:31 | yijunw0212 | feat(sdk): 消费 App 升级时补的三处——微压缩不收修改回执、独占写主人清遗留写声明、让出的续跑可以归 App（任务前） | #4 |
| `a13bf067` | 10-12 04:47 | Creamie X | docs(slices): 带类型的问卷与输入回执第一刀合成后的复验 | #4 |
| `223170cb` | 10-12 14:28 | jing xu | docs(orchestration): 任务图统一协作合同（P1 冻结）——协作绑节点、执行代次、等待条件组与四态观察、唯一接续 | #6 |
| `b160a162` | 10-12 14:37 | jing xu | feat(orchestration): 任务图节点与进展可以指向输入（P2a）——InputRef、origins、report.inputs | #7 |
| `852b8e00` | 10-12 14:52 | jing xu | feat(orchestration): 节点执行代次、有界尝试、waiting / needs-reconciliation 与重试（P2b，存储层） | #8 |
| `39dd211a` | 10-12 14:57 | jing xu | test(orchestration): 任务图的打包消费者检查脚本（P2a/P2b 公开入口） | #8 |
| `3ef2aa15` | 10-12 18:19 | jing xu | feat(orchestration): 一跑绑在任务图节点上（P2c）——startAgentRun({ collaboration })、尝试开收、改图带代次 | #9 |
| `1000d42e` | 10-12 18:31 | jing xu | test(orchestration): 运行绑定的打包消费者检查脚本（P2c 公开入口） | #9 |
| `2a3c64a0` | 10-12 18:57 | jing xu | feat(orchestration): 翻开协作门禁并重做派出（P2d）——无绑定不协作、孩子绑自己的步骤、claims 删除 | #11 |
| `a294a29e` | 10-12 19:05 | jing xu | test(skill): fork 技能派子任务也在绑定的节点底下（P2d） | #11 |
| `4c6bda71` | 10-12 19:06 | jing xu | test(orchestration): 协作门禁与派出的打包消费者检查脚本（P2d 公开入口） | #11 |
| `a4a7e7b1` | 10-12 19:17 | jing xu | feat(orchestration): 派出的四步与 App 协作口 admitDispatch（P2e） | #12 |
| `3ca015eb` | 10-12 19:23 | jing xu | test(orchestration): 派出消费者检查脚本加上 App 协作口的同意与拒绝（P2e） | #12 |
| `820fe5ea` | 10-12 19:28 | jing xu | test(orchestration): 两个会派子任务的子进程夹具给父跑绑上节点（P2d 漏的） | #13 |
| `5f10c589` | 10-13 02:20 | jing xu | feat(orchestration): 重启恢复——板上没收场的尝试按会话账关账（P2f） | #14 |
| `70ff200d` | 10-13 02:31 | jing xu | test(orchestration): 重启恢复的打包消费者检查脚本（P2f 公开入口） | #14 |

合并提交：`edb8ec86`（#4）merge: 并入 origin/main（69ccfa94 符号链接 cwd 越根与非终态导入两处硬边界，零冲突）；`8db0d7d6`（#4）merge: 并入 a06ae62e（AskUser 带类型的题），与 A0 采用修正、输入回执第一刀合成同一份 SDK；`55b0c85a`（#4）Merge pull request #4 from molis-ai/feature/molis-adoption-r；`87e063e8`（#5）merge: 并入 origin/main（55b0c85a，PR #4 的合并提交；树与 a13bf067 相同）；`f5ef12e6`（#5）Merge pull request #5 from molis-ai/feature/molis-adoption-s；`82488fa0`（#6）Merge pull request #6 from molis-ai/feature/taskboard-collab；`2621ae91`（#7）Merge pull request #7 from molis-ai/feature/p2a-input-refs；`7f318494`（#8）Merge pull request #8 from molis-ai/feature/p2b-generation；`c0121069`（#9）Merge pull request #9 from molis-ai/feature/p2c-binding；`2f78d877`（#11）Merge pull request #11 from molis-ai/feature/p2d-gating；`3953315a`（#12）Merge pull request #12 from molis-ai/feature/p2e-dispatch-st；`80d8d8d3`（#13）Merge pull request #13 from molis-ai/feature/p2e-dispatch-st；`7229b11b`（#14）Merge pull request #14 from molis-ai/feature/p2f-recovery

**已推远端（未进 main）**：2 个内容提交，0 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `6b629bb9` | 10-13 02:51 | jing xu | feat(delivery): 受限通信——agents 的信只在任务图相邻的步骤之间走（P2g） | feature/p2g-scope（尚未开 PR） |
| `f2c861ec` | 10-13 12:48 | jing xu | test(delivery): 受限通信的打包消费者检查脚本（P2g 公开入口，尚未运行） | feature/p2g-scope（尚未开 PR） |

**只在本地**：1 个内容提交，1 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `a807c2cc` | 10-12 05:27 | Creamie X | feat(session): 输入回执第二刀——会话级持久排队 | feature/adoption-s2-integration（已作废：S2 改由回执线合进整合末端） |

合并提交：`ef2be8ec`（feature/adoption-s2-integration（已作废：S2 改由回执线合进整合末端））merge: 并入 a807c2cc（输入回执第二刀：会话级持久排队）

### Prologue · 回执线

**已进 main**：6 个内容提交（其中 1 个是任务开始前就有的），1 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `4acfb445` | 10-12 03:37 | yijunw0212 | feat(agent): 输入回执第一刀——补充有身份、读到有回执（任务前） | #4（由采用线整合进 main） |
| `b77adb41` | 10-12 05:27 | jing xu | feat(session): 输入回执第二刀——会话级持久排队 | #5（由采用线整合进 main） |
| `614c3632` | 10-12 05:52 | jing xu | docs(slices): 输入回执第三刀合同草稿——处理说明与有界提醒 | #5（由采用线整合进 main） |
| `d2308a4e` | 10-12 06:19 | jing xu | docs(slices): S2 合入整合末端后的复验记录 | #5（由采用线整合进 main） |
| `88612378` | 10-12 07:51 | jing xu | feat(agent): 输入回执第三刀——处理说明与有界提醒 | #5（由采用线整合进 main） |
| `37427d09` | 10-12 10:07 | jing xu | fix(agent): 编号说明压缩后仍在，但不当作「必须记住的指示」交给摘要器 | #5（由采用线整合进 main） |

合并提交：`7ab7749d`（#5（由采用线整合进 main））merge: S2 会话级持久排队（a807c2cc）进整合末端 a13bf067

**已推远端（未进 main）**：7 个内容提交，6 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `1e1211e2` | 10-12 14:57 | jing xu | docs(slices): 输入回执第四刀合同草稿——任务图、待办与问题引用输入 | feature/input-receipts-s4（PR #10 待合） |
| `5b259a16` | 10-12 18:24 | jing xu | feat(agent): 输入回执第四刀——任务图、待办与问题引用输入 | feature/input-receipts-s4（PR #10 待合） |
| `cad5fd76` | 10-12 18:44 | jing xu | feat(agent): 输入回执第四刀收尾——绑定板走 at.binding、App 开问题核 about 形状、验收记录 | feature/input-receipts-s4（PR #10 待合） |
| `aac78196` | 10-12 18:56 | jing xu | docs(slices): 输入回执第四刀验收记录——合入 P2c 之后的 SDK 全量与六份消费者 | feature/input-receipts-s4（PR #10 待合） |
| `0beafdd5` | 10-12 19:38 | jing xu | test(agent): 输入回执第四刀用例按 P2d 的协作门禁先绑定节点 | feature/input-receipts-s4（PR #10 待合） |
| `926f01cc` | 10-13 02:32 | jing xu | test(sdk): 合入 main（P2d、P2e、夹具修复）之后公开面快照的名字总数更新 | feature/input-receipts-s4（PR #10 待合） |
| `c7f65cbd` | 10-13 02:37 | jing xu | docs(slices): 输入回执第四刀验收记录——合入 P2d、P2e 与夹具修复之后的全量与七份消费者 | feature/input-receipts-s4（PR #10 待合） |

合并提交：`947f6cfc`（feature/input-receipts-s4（PR #10 待合））Merge remote-tracking branch 'origin/main' into feature/inpu；`84347dcd`（feature/input-receipts-s4（PR #10 待合））Merge remote-tracking branch 'origin/main' into feature/inpu；`b7b52474`（feature/input-receipts-s4（PR #10 待合））Merge remote-tracking branch 'origin/main' into feature/inpu；`6677cf27`（feature/input-receipts-s4（PR #10 待合））Merge remote-tracking branch 'origin/main' into feature/inpu；`eab59c3b`（feature/input-receipts-s4（PR #10 待合））Merge remote-tracking branch 'origin/main' into feature/inpu；`a0ff62e1`（feature/input-receipts-s4（PR #10 待合））Merge remote-tracking branch 'origin/main' into feature/inpu

### Prologue · 交互线

**已进 main**：1 个内容提交（其中 1 个是任务开始前就有的），0 个合并提交

| 提交 | 时间 UTC | 作者 | 说明 | 位置 |
| --- | --- | --- | --- | --- |
| `a06ae62e` | 10-09 16:00 | yijunw0212 | feat(effect-policy): AskUser 带类型的题——一份问卷里问文本、数字、日期和对象（任务前） | #4（由采用线整合进 main） |

## 汇总（内容提交 / 合并提交）

| 线 | 已进 main | 已推远端·交接 PR 分支（Molis）或待合分支（Prologue） | 已推远端·只在其他分支 | 只在本地 |
| --- | --- | --- | --- | --- |
| 采用线 | 27 / 15 | 17 / 7 | 0 / 0 | 1 / 1 |
| 回执线 | 6 / 1 | 28 / 13 | 0 / 0 | 0 / 0 |
| 交互线 | 3 / 6 | 19 / 11 | 2 / 2 | 0 / 0 |
| 情境线 | 0 / 0 | 31 / 11 | 9 / 0 | 6 / 0 |
| 统筹 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 3 |

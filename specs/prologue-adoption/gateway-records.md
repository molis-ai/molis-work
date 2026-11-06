# Prologue 外部等待、执行角色与网关

原 §6.0d–6.0h 的设计、运行记录和补证。

[返回需求书](spec.md)

- [6.0d P3a 恢复记录（2026-10-15）](#60d-p3a-恢复记录2026-10-15)
- [6.0e P3c 记录（2026-10-15）：Coding 的执行角色等外面的结果](#60e-p3c-记录2026-10-15coding-的执行角色等外面的结果)
- [6.0f 网关的能力输入带上类型（2026-10-16）](#60f-网关的能力输入带上类型2026-10-16)
- [6.0g 网关不再替模型改形状（2026-10-16）](#60g-网关不再替模型改形状2026-10-16)
- [6.0h A5：补 §6.0b 第 2、5 项缺的证据（2026-10-17）](#60h-a5补-60b-第-25-项缺的证据2026-10-17)

## 6.0d P3a 恢复记录（2026-10-15）

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

## 6.0e P3c 记录（2026-10-15）：Coding 的执行角色等外面的结果

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

## 6.0f 网关的能力输入带上类型（2026-10-16）

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

## 6.0g 网关不再替模型改形状（2026-10-16）

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

## 6.0h A5：补 §6.0b 第 2、5 项缺的证据（2026-10-17）

只加用例，没有改源码。两条在 main `6696a15be` 上都直接通过，说明实现本来就对，缺的只是证据。

- **第 2 项（PPT 零派出）**：`tests/action-before-effect.test.ts` 的撤权、停用、取消循环加上 PPT（`ppt.outline_ai`）。断言与另外五个插件相同：`dispatched === 0`、库不变、恢复后能写。把构建产物里 PPT 传给模型口的 `beforeDispatch` 去掉，三条都变红；还原后通过。
- **第 5 项（修改回执不被微压缩）**：`tests/assistant-business-gateway.test.ts` 加一条请求级用例。用真实网关与助理，先经审批做一次修改（回执 800 多字节），再读五次（每次也是 800 多字节），然后看最后一次请求：
  - 第一次读的结果被换成了 `[observation compacted: read-capability …]`，说明压缩确实跑了；
  - 修改回执原样都在。它在请求里的位置比第一次读还早，所以留下来只能是因为效果种类（`mutate-external` 不可重读）。
  - SDK 默认的压缩档是保留最近 4 轮工具、小于 512 字节的不收，Molis 没改。
  - 试过把构建产物里 `change-capability` 改成 `safe-read`：那样改连审批都跳过了，这条是等审批超时而失败，不是因为回执断言，所以不算证明。区分靠的是上面那一组对照。

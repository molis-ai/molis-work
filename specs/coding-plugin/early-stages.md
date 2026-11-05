# Coding 早期阶段与缺口记录

§5–6 的阶段计划、切片状态和旧缺口，包括 §5.4 的插件接入。

[返回需求书](spec.md)

- [5. 阶段（历史切片记录；当前产品完成度以 §0 为准）](#5-阶段历史切片记录当前产品完成度以-0-为准)
- [5.1 C6：模型供应商管理](#51-c6模型供应商管理)
- [5.2 C8：结构化提问](#52-c8结构化提问)
- [5.3 C9：与 FlyLeaf 的能力对齐](#53-c9与-flyleaf-的能力对齐)
- [6. 历史缺口记录（部分已过期，当前事实见 §0）](#6-历史缺口记录部分已过期当前事实见-0)
- [5.4 C10：FlyLeaf 的另外五个插件](#54-c10flyleaf-的另外五个插件)

## 5. 阶段（历史切片记录；当前产品完成度以 §0 为准）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| C0 | UI 与交互设计定稿 | **已完成**：`design.md` §14、`ui/` 四张稿 |
| C1 | Capability 地基：Projects 工作区只读、Agent Host 命令回执（当时写的「Goals 复用已注册的 16 个」事件能力没有生产调用方，已于 2026-10-09 W2-08 删除；Coding 走 Goals 仍保留的四个 typed 入口：读目录与上下文 `goals.context.list.v1`、`goals.context.read.v1`，写进展 `goals.progress.record.v1`，查回执 `goals.progress.receipt.v1`，都在 Manifest `capabilities.consumes` 里声明消费，W3-07 把它们改成 Goals 动作；Goals 向插件开放的便笺动作 `goals.note` Coding 现在没有调用） | **基础实现存在，产品闭环见 §0**：`projects.workspace.read`、`agent.command-output.v1`；`tests/coding-capabilities.test.ts` 3 项、`tests/agent-host.test.ts` 15 项 |
| C2 | Artifact 类型：ChangeSet / Report / Diagram | **基础实现存在，产品闭环见 §0**：`plugins/native/coding/src/artifacts.ts`；图是结构不是 SVG，见下；`tests/coding-artifacts.test.ts` 5 项 |
| C3 | 插件本体：Manifest + 三段 UI | **基础实现存在，产品闭环见 §0**：包、Manifest、投影层、目录栏与工作台渲染、会话落库（真实 SQLite 重开验证）。`coding-projection` 5 项、`coding-ui` 5 项、`coding-store` 4 项 |
| C4 | 宿主审查面 | **已接进产品装配**：`composeAgentHost` 在 `web-server` 里被调用，CLI 运行时已注册（当时的记录；该运行时已于 2026-10 删除，见 [plugin-platform-v2](../plugin-platform-v2/spec.md) D5），插件经 Capability 真的够得到（`tests/agent-host-composition.test.ts` 5 项）。会话里的审查摘要卡已做（含「卡片上不能有任何按钮」这条硬断言）。**审查队列已经走 HTTP**：`/api/agent/reviews` 读、`/api/agent/reviews/decide` 决定，复用既有的本地控制护栏（同源 + 控制令牌 + 一次性键），重放返回 409。宿主渲染器现已挂入 Coding 结果区，正式页面已有 MiniMax 单处补丁审查实操；拒绝/冲突/恢复见 §0 当前验证。`agent-review-surface` 7 项、`coding-review-card` 5 项、`agent-review-http` 4 项 |
| C5 | 审批桥挂到 Prologue + 真实模型验证 | **文件审批已接通，失败路径与恢复验证中**：桥挂上之后 `text-edit` 才申报支持（`command` 不跟着变，见下）。两种 API 格式已对着真实 MiniMax 验证通过，见 C6。`tests/prologue-approval-attachment.test.ts` 5 项 |
| C6 | 模型供应商管理（设置页 + 两种 API 格式） | **基础实现存在，产品闭环见 §0**：契约、设置页、落库（目录库 schema 17）、到 `modelConfiguration()` 的映射，以及**跨密钥库的凭据交接**。`model-providers` 9 项、`model-provider-store` 7 项、`prologue-credential-bridge` 6 项 |
| C9 | 对齐 FlyLeaf 的全部能力 | **基础实现存在，产品闭环见 §0**：方法/MCP 选择、检查点、子代理与验收、恢复投影、工作区事件、并行写入（含真实 git 工作树）、报告与用量视图、贴底行为。`coding-selection` 8、`coding-delegation` 8、`coding-recovery` 7、`coding-events` 8、`coding-writers` 9、`git-worktrees` 5、贴底由平台的滚动主人负责（`scroll-follow`、`coding-question-card` AC-10-6）、`coding-report-usage` 4 |
| C8 | 结构化提问（AskUser） | **基础实现存在，产品闭环见 §0**：问题进 `AgentRunView.awaiting_input`，回答是独立的控制动作（不是 steer），Coding 侧有提问卡片。`coding-question-card` 7 项、`agent-pending-questions` 4 项 |
| C7 | Coding 由 Plugin Runtime 托管 | **基础实现存在，产品闭环见 §0**：产品经 `coding-surface.ts` 起平台、启动 Coding、用它的 contribution 渲染目录；`kind` 已从 `native` 翻成 `app`。`coding-plugin-activation` 3 项、`coding-surface` 3 项、`plugin-panel-seam` 3 项 |
| C10 | 复现 FlyLeaf 的另外五个插件 | **基础实现存在，产品闭环见 §0**：`workspace` / `files` / `diff` / `git` / `text-stats` 五个包，Manifest v2 端口与输入组、纯投影层、UI 贡献，全部在真平台上一起启动并能连线。跨插件的载荷契约收进 `contracts/modules/workspace-artifacts`（插件之间不许互相 import）。`workspace-plugin` 7、`files-plugin` 13、`diff-plugin` 16、`git-plugin` 18、`text-stats-plugin` 7、`workspace-plugin-graph` 5、`plugin-catalog-companions` 7 |
| C11 | 提示分层：划清 ReAct 里属于我们的那一层 | **基础实现存在，产品闭环见 §0**：四层契约、宿主按层组合、项目层接上项目指引、只读的「这一轮的身份」面。`agent-prompt-layers` 11 项 |
| C12 | Character 管理（角色变成用户可管的数据） | **部分实现并实操**，管理与固定消费见 §0；行为质量与体验验收未完成 |
| C13 | Plan → SubAgent 接通 → TaskBoard | **进行中**：Plan、只读/独立写入子任务与选定文本整合已实操；TaskBoard 导航已接；步骤回报/验收、完整类型及协调质量待做，见 §0/§7 |
| C14 | Prompt Cache（开，不只是读数） | **基础实现存在，产品闭环见 §0**：供应商记录带 `prompt_cache`，落库（目录库 schema 18）、设置页、透传到 `startAgentRun`。`model-prompt-cache` 7 项 |
| C15 | 修 protocol 名字对不上 | **已修**：`prologueProtocolFor()` 做显式翻译，断言钉在 Prologue 自己的适配器表上。`model-protocol-mapping` 5 项 |

C1 与 C2 都挡着 C3；C4 挡着 C5。顺序理由见 [`implementation.md`](implementation.md)。

### C5：文件写入已接通，恢复与反馈仍需验证

**已有的组件接缝，不等于产品装配完成。**
`PrologueAgentAdapter` 现在接受一个 `approvals` 桥。挂上之前 `text-edit` 如实申报为 `unsupported`，
宿主拒绝任何会写入的角色起跑；挂上之后它才算支持，而且 Run 每停在一笔副作用上，
这笔副作用都会**先进宿主审查队列**，在用户决定之前执行主人那边收不到任何答复。
镜像失败不会被当成放行——它记在这一轮的活动里。

**`command` 需要审批桥和回执读取同时接通。** Node 装配已满足这两个条件，
`workspace-write` 可以起跑；仅挂桥的其他装配仍拒绝命令。能力配置只能收窄，不能绕过缺失端口。

**当前证据**：实际打包 SDK + MiniMax 已通过读取文件和两轮连续对话，修正参数、引用与终态时序，详见 §0。
正式 Coding 入口已用 MiniMax 完成单处 Bug 修复、批准落盘、拒绝零写入、外部创建冲突保护、同会话创建另一文件，以及批准命令后读取退出码0和1的真实输出。完整成果交付尚未接通，C5 不据此宣称完整 Coding 已完成。

另外 **CLI 那一侧的写入仍然不支持**：Claude Code 的审批发生在它自己的权限模型里，
要打开需要一个 permission-prompt 工具把询问转回宿主队列。

产品已构造 Agent Host，并按需注册 Prologue，凭据与模型已接。真实 PatchReview、宿主决定与效果回执已装配，“修改文件”可从正式入口使用；完整 builder 仍受命令回执能力门禁。

## 5.1 C6：模型供应商管理

Coding 要跑起来，用户得能配模型。这一段 2026-09-19 纳入范围，参照 Prologue 的模型管理。

**两种 API 格式都要支持**，而且都已对着真实服务（MiniMax）验证过：

| 格式 | 验证地址 | 结果 |
| --- | --- | --- |
| `openai-chat-completions` | `api.minimaxi.com/v1/chat/completions` | 通，1386ms |
| `anthropic-messages` | `api.minimaxi.com/anthropic/v1/messages` | 通，976ms |

`scripts/verify-model.mjs` 是这次验证用的脚本，读 `.secrets/model.local.json`（已 gitignore）。
**密钥只出现在请求头里**，日志与报错一律只打印长度。

已经落地的判据：

- **密钥不进记录**。`ModelProviderRecord` 只存一个指向密钥库的 `credential_ref`，
  设置页渲染的是「已保存 / 还没填」，从不渲染密钥本身，字段上连 `value` 都不带。
- **「有没有密钥」问密钥库，不问记录**。记录里存一个 `has_credential` 会在密钥被删后变成谎，
  页面就会显示一个跑不了的供应商。
- **状态分清三种**：没填密钥、被关掉、没启用任何模型——它们是不同处境，不能混成一个灰点。
- **上下文徽标只在知道时出现**，不猜一个数字。

一个实测差异要在投影层处理：**同一个模型，OpenAI 那条会把 `<think>` 推理段当正文吐出来，
Anthropic 那条不会。** 正文里混进推理过程，用户读到的就不是结论。

### C6 那一跳已经闭上

`PrologueCredentialBridge` 把 Molis Work 的引用换成 Prologue 认识的引用：从我们的密钥库读出密钥，
经 `PrologueHost.writeCredential` 交给它自己的凭据库，换回一个它能解析的引用。

**每个引用只交接一次**（按引用缓存），**递过去的字节用完立刻清零**——JS 里字符串抹不掉，
能抹的那份就该抹。没配解析、密钥库里没有、密钥是空白，三种情况各自报清楚，
而且**解析不到就不往 Prologue 写任何东西**。

### 命令回执能力与产品入口

`command.receipts` 是新加的能力，和 `command` 分开：**能说清跑过什么，和能不能在宿主审批下跑新的，
是两个问题**。CLI 流现在保留命令回执（输出按 16 KiB 截断并如实标记，失败的输出进 stderr，
退出码保持 `null` 因为 CLI 只说成功失败），`readCommandOutput` 真的读得到。

回执投影按 `command.receipts` 判断可用性，而不是按 `command`。CLI adapter 可读取已有回执，不能因此声称其正式产品入口已全部接通（该 adapter 已于 2026-10 删除，见 [plugin-platform-v2](../plugin-platform-v2/spec.md) D5）。
当前 Coding 正式会话使用 Prologue，右栏可按轮次展开 SDK 持久命令回执。CLI 的 `command` 依然不支持，因为执行审批仍归它自己的权限模型。

### C7：`app` 现在是真的

那条缺失的通路已经建好，分三段，每段都可单独验证：

1. **接缝**：渲染器接受 `plugin_panels`（按项目插件 id 的已渲染面板）。
   不提供时页面输出**逐字节不变**——`tests/plugin-panel-seam.test.ts` 直接断言这一点，
   所以接缝先落地不会造成半截迁移。
2. **托管**：`apps/local-host/src/coding-surface.ts` 按项目起 `createPluginPlatform`、
   启动 Coding、取它的 contribution、用它声明的 `directory` 视图渲染面板。
   **任何失败都返回 null**，页面退回原来的样子——一个插件坏了不该把整页带走。
3. **接线**：`web-goals-read` 在注入 `enabled_plugins` 的同一处注入面板。

于是 `kind` 从 `native` 翻成 `app`：宿主**确实**经 Plugin Runtime 启动并隔离它，
也**确实**用它自己的贡献来画。其余六个内置插件仍是 `native`，因为它们还是构建期组合。

## 5.2 C8：结构化提问

Run 停下来问问题时，原先**只有 phase 能看出「在等」，看不到「在问什么」**——`AgentRunView`
没有任何字段承载问题，界面也就无从显示，Run 卡住而用户无路可走。这是功能闭环缺口，不是增强。

补了两处：

- `AgentRunView.awaiting_input` 承载问题（问题原文、选项、是否接受自由输入）。
  Prologue 的等待事件只带引用；适配层再通过公开 Pending 读取原始文本或冻结问卷，按原题号/选项号展示。读取失败时如实不可答，不从事件文案猜选项。
- `AgentRunControl` 增加 `answer`，**和 `steer` 分开**。steer 是给运行中任务追加指令，
  回答是针对某一条待答问题并关掉它；混在一起会让问题一直悬着，而执行把回答当成无关指导。
  测试直接断言「steer 不会关掉问题」。

界面按设计 §6 的三条硬约束做：**一个选项都不预选**（预填的答案是用户没给过的答案，
而执行会照它动作）、**没有关闭/忽略入口**（离开不等于取消）、
**运行时不接受自由输入时就不给输入框**（不邀请一个会被丢掉的回答）。

CLI 那一侧如实报「不会提出结构化问题，因此也没有可回答的对象」。

## 5.3 C9：与 FlyLeaf 的能力对齐

逐个模块对照 FlyLeaf 的 `plugins/coding-agent/`，缺的全部补上。几条在复现时保住的语义：

| 语义 | 为什么不能省 |
| --- | --- |
| 你选的 ≠ 这一轮冻结的（方法/MCP） | 只显示选择，会让用户以为改动已对正在跑的这轮生效 |
| 跑完 ≠ 验收通过（子代理） | 执行终态归运行时，验收判断归插件；判成需返工不会改掉运行时报的状态 |
| 跑着时不能回退（检查点） | 不能在 agent 脚下抽地板；但看得见，只是给出原因 |
| 批准过但没回执 = 无法确定是否发生（恢复） | 中断之后这件事不能往任何一边假设 |
| 草稿只来自本地意图（恢复） | 从运行时状态反推出一句用户没写过的话，比没有草稿更糟 |
| 写入者还在跑时不能整合 | 会把人家写到一半的改动截走一半 |
| 冲突文件不可选但仍列出 | 从列表里消失比说明白更难解释 |
| 没报用量显示未知而不是 0 | 0 会被读成「这一轮不花钱」 |
| 人往上翻后不抢滚动 | 读历史读到一半被拽到底，等于没法读 |

**并行写入接了真实 git**：`apps/local-host/src/workspace-git-worktrees.ts`（G5 前叫 `git-worktrees.ts`） 用 `execFile`（参数数组，不走 shell，
因为分支名受用户影响）建工作树、列改动、清理。非 git 目录和没有提交的仓库都如实报不支持——
在那里说支持，会在第一次建工作树时才失败。写入者 id 限定安全字符集，
`../escape`、`--upload-pack=evil` 这类都被拒，不会变成 git 参数。

工作区事件的路径校验比 FlyLeaf 更严：拒绝**所有**控制字符而不只是空字节，
`..` 与分隔符一律拒绝而不是 normalize——想爬出工作区的载荷是坏载荷，悄悄改写会把问题藏起来。

## 6. 历史缺口记录（部分已过期，当前事实见 §0）

- **除 Goals 外没有任何模块注册过 Capability**。Goals 有 38 个定义、37 个绑定，其余模块是 0。
  这是 C1 存在的原因，也是目前最实的扩展性约束。
- **Sessions 没有命令回执这份事实**。它有一个活的 PTY 客户端，不存"某条命令跑完留下什么"的记录。
  所以终端页的来源改成 Agent Host 的 `AgentCommandOutput`（本轮执行自己跑的命令），
  这份契约已经存在、两个 adapter 都实现了（都如实抛不支持），只是还没暴露成 Capability。
- **浏览器页两端能力不对等**：桌面壳有 WebView，Web 版只有 iframe。
  可能要接受「浏览器页只在桌面版可用」，Web 版如实显示不可用。
- ~~**Canvas 的图形类 Artifact 是新课题**~~ 已定：**图是结构不是 SVG**。
  本轮执行产出节点与连线，宿主来画，标签一律作为文本节点进入。
  让模型直接吐 SVG 等于把模型输出变成应用 DOM 里的标记，中间只隔一个消毒器——那种白名单会被绕过。
- **Prologue SDK 接缝已对真实 MiniMax 实测**，protocol、端点、资源引用、历史与流式已修复；
  正式 Coding 产品执行仍待装配。旧 protocol 缺陷分析保留在 §7，不能继续描述为当前未修。
- **CLI 的写入不经宿主审批**，因此 `text-edit` / `command` 申报为不支持。
- **产品已构造 Agent Host 与 PluginPlatform**，后者当前只贡献目录；Prologue、会话工作台与宿主审查尚待接通。

## 5.4 C10：FlyLeaf 的另外五个插件

FlyLeaf 的 `plugins/` 下除了 `coding-agent` 还有五个：`projects`、`files`、`diff`、`git`、`text-stats`。
它们在这里全部复现，并按 Molis Work 已有的东西做了映射：

| FlyLeaf | 这里 | 为什么这么映 |
| --- | --- | --- |
| `projects`（选目录 + 发布它） | `workspace`（只发布） | 项目在 Molis Work 已经是目录库里的一等记录，选目录不是插件的事；缺的那一半是「把当前项目变成别人能连的值」 |
| `files` | `files` | 树、阅读器、`before`/`after` 快照、选区，全部照搬；目录读取归宿主，插件只投影 |
| `diff` | `diff` | 三组可互换输入：两份快照、Coding 的变更集、Git 的工作区改动 |
| `git` | `git` | 工作区状态、提交草稿、接受一轮变更；`git` 仍由宿主跑，porcelain 的解析在插件 SDK 里（宿主和插件读同一份）才测得动 |
| `text-stats` | `text-stats` | 系统里最小的一个完整插件：一个必填输入，不要能力、不发端口、不发事件 |

几条在复现时立住的判断：

- **插件之间不许互相 import。** FlyLeaf 里 `files` 直接 import `@flyleaf/git/events`，这里过不了
  `boundary:check`。跨插件的载荷因此收进 `contracts/modules/workspace-artifacts`：形状是约定，
  插件是可替换的实现。事件 id 也放在那里——**订阅别人不等于依赖别人的代码**，但校验器留在发布方，
  因为只有它知道自己的载荷是什么意思。
- **一轮执行的 diff 是片段，不是整份文件。** Coding 的变更集带的是每个文件的 unified diff，
  拿它算不出整份对比。所以这种对比标成 `partial` 并在行的上方说出来，而不是画成一份完整比较。
- **Artifact 里不能出现真实路径。** 工作目录引用带的是宿主的不透明句柄；Artifact 是会流动的，
  路径塞在里面等于把用户的磁盘结构漏给每一个经手的插件，包括从没拿过文件系统权限的那些。
- **接受一轮变更是人做的决定。** `git` 只判断这个决定现在还能不能给：文件在那之后动过、
  有冲突开着、改动已经落盘——三种情况各自拒绝并说明。执行由宿主做，所以只是「显示」一个变更集的界面
  不可能变成提交工作的地方。
- **必填输入会把来源一起带上。** 启用 `files` 会一并启用 `workspace`，启用 `text-stats` 会带上
  `files` 和 `workspace`——伴随关系由 Manifest 推导，不是手写的表。一个必填端口没人能发布的插件，
  单独开着就是一个永远填不满、也说不出为什么的导航格。

### 产品接通状态（2026-09-22 更新）

- 正式 Files 目录/正文数据源、Workspace 选择、快照和选区 Artifact、Diff 快照组、Text Stats 已接入三栏；指定实操和工程证据见 §0 C10。
- 宿主已补空输入的默认连接：Workspace → Files/Git，Files.before/after → Diff，Files.before → Text Stats，以及 Git.changeset → Diff.git_changeset。保留用户原连接；Git 真实状态、固定差异和普通文本暂存/取消暂存已接通，其余写操作尚未接通。
- Files 固定材料已接通 Coding 下一轮选择、精确版本读取、SDK 模型参考数据和报告来源，见 §0。尚待接通 Shelf/Goal 材料、Git 内容转换及其余写操作、Coding 差异组与精确反馈、完整成果端口和变更事件驱动刷新。不能再将当前 Files 描述为“只有包、没有数据源”，也不能把这一轮接线解释为整个 C10 已完成。

### Git 接续核对（2026-09-22，读取与普通文本暂存已接通，其余操作仍须完整对齐）

对照只读 FlyLeaf `a0267d39d5860575efd0ab080fb0f6887234759b` 的 `plugins/git/CONTRACT.md` 与 `src/host.ts`：实际能力包括暂存/取消暂存、分支创建/切换、工作树创建、全部暂存及指定文件提交、fetch/pull/push、冲突读取与 ours/theirs/manual 解决、继续合并，以及子工作树指定内容整合。工作树所有权和整合属于后续并行写入的前置，不因 Molis 现有投影较少而删去。

接通前 Molis `createGitPlugin({ ready })` 只收到“绑定了目录”布尔值；现已改为宿主真实状态 capability 和插件投影，产品读取、固定差异及普通文本暂存/取消暂存证据见 §0。`renderGitChanges` 和 porcelain 解析继续复用，其余 Git 写操作尚未接通。现有 `apps/local-host/src/git-worktrees.ts` 是孤立辅助实现，`changes()` 按制表符拆路径、`list()` 把当前 HEAD 当创建基线、`remove()` 强制移除且吞掉分支删除错误；接入真实协作前必须校验/修正，不能按“已有 helper”直接视作可靠能力。

顺序为：先沿用 Projects 的当前目录授权和 Plugin Host 公开 capability 接通真实 Git 状态/差异，再接宿主准备、精确版本审查、执行与持久回执，最后接分支/同步/冲突及工作树整合与 C13。插件拥有选择、草稿和结果呈现；宿主拥有 Git 进程、授权根验证与副作用决定。已有 Files/Diff/Artifact/Event 和审查事实复用，不另建全局 Git Manager、执行账或自动提交规则。Files 固定材料、Git 读取及暂存块已有指定工程与产品验证；其余 Git 写操作继续沿用该顺序。审查队列已在 checkpoint-rewind 之外接通明确的 git-index 工作区操作身份，手动 Git 不捏造 Agent Run 或 Coding 会话。

复杂度核对与实现：SDK `Runtime.effects` 已有 prepare/dispatch、固定 reviewRef、一次派出、恢复和结果未知核对，且 origin 可为空；当前暂存已在 Host/SDK 装配复用这条执行事实链与宿主 Review，未由 App Shell 直接写业务表或另建 Git 执行账。精确普通文本准备/落盘、Git index 锁和中断撤回已有验证；下一步仍需完整接通仓库 filter 与属性转换、未知结果收口，以及其余 Git 操作的跨进程并发和中断回执，不能以当前有限拒绝路径代替这些既定能力。

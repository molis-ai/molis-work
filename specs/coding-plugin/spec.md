# Coding App 需求书

把编码这件事作为一个 **Plugin Platform v2 的 app 插件**做进 Molis Work：
用户在项目里开一条编码会话，交给 Agent Runtime 去读、去想、去给建议，
成果以 Artifact 的形式回到项目里，副作用一律经宿主审批。

这份是 Coding 的单一需求来源。**平台侧**的需求在
[`../plugin-platform-v2/spec.md`](../plugin-platform-v2/spec.md)，本文不重复。

## 1. 三份文件怎么分工

| 文件 | 回答什么 | 什么时候改 |
| --- | --- | --- |
| 本文 `spec.md` | 要做什么、做到什么算完成 | 范围或验收条件变了 |
| [`design.md`](design.md) | 长什么样、怎么交互 | 界面或交互决策变了 |
| [`implementation.md`](implementation.md) | 怎么落地、按什么顺序、代码放哪 | 实施路径变了 |
| [`ui/`](ui/README.md) | 定稿的四张主屏（可直接打开） | 设计稿重画了 |

三者冲突时：**范围以本文为准，界面以 `design.md` 为准，顺序以 `implementation.md` 为准。**
发现某一份和另一份打架，先改文档再动代码——2026-09-19 就出过一次
（UI 稿把终端和预览画进来了，而 `design.md` §12 还写着它们不在首版）。

## 2. 设计稿

定稿快照：[`ui/`](ui/README.md)，四张 1440×900 的静态 HTML。
可编辑的原始画布在 Artifact：`https://claude.ai/artifact/W1wXuuLuGc9CuWfVCYYKpW`
（私有，未分享的人打不开；仓库里的快照才是定稿依据）。

## 3. 边界

**做**：编码会话的组织、执行的观察与控制、成果的预览与处置、跨插件的协议交换。

**不做**：
- 不重造终端。右栏终端页只读**本轮执行自己跑过的命令回执**（Agent Host 的 `AgentCommandOutput`），不是 PTY，
  也不是 Sessions 那个交互终端——那是用户自己的终端，两件事。
- 不自己决定副作用。批准是用户在宿主审查面里的动作，Coding 碰不到。
- 不发明角色。角色与 Prompt 由插件 Manifest 声明，宿主冻结后交给 adapter。
- 不做 PR/CI 跟踪、云端执行、定时任务。

## 4. 验收条件

按动作路径写，不按页面写。每条都要有测试。

### A. 开一条会话
- A1 不选 Goal 也能开；选了 Goal，会话出现在该 Goal 分组下。
- A2 工作区目录由宿主授权并核过 realpath；插件不能指定任意目录。
- A3 选中的角色必须是 Manifest 声明过的；角色需要的能力 Runtime 必须真的支持，否则**拒绝起跑**并说明原因。
- A4 没有配置模型时，开始按钮不可用，并指向全局设置。

### B. 看一轮执行
- B1 事件流投影出轮次、工具活动、用量；用量没报就显示未知，**不填 0**。
- B2 停止、暂停、恢复、转向四个控制真实作用于 Runtime；Runtime 不支持的控制显示为真实不可用。
- B3 Runtime 返回的冻结权限若比 Manifest 宽，该 Run **立刻取消**并留下回执。
- B4 会话可关闭、可重开，重开后轮次与成果完整——事件流和端口绑定都落库。

### C. 处置成果
- C1 变更集能按文件看差异，行上能留意见，若干条一起发回，**发回不等于批准**。
- C2 只读档下「应用」是真不可用，不是点了没反应。
- C3 成果作为 Artifact 发布，带 producer 身份与版本；消费方拿到的是固定版本。
- C4 Canvas 画出来的图可以存为 Artifact，同样带来源和版本。

### D. 跨插件
- D1 Shelf 材料经输入端口进入会话，用的是 Artifact 的固定版本。
- D2 命令回执来自 Agent Host（本轮执行跑过的命令），只读；Coding 不另开一条命令执行路径。
  两个 adapter 今天都如实申报 `command` 为不支持，因此该页按 E2 显示为真实不可用。
- D3 轮到用户处理时进 Inbox。
- D4 关联 Goal 的会话，结论能写回 Goal 事件。

### E. 诚实
- E1 能力矩阵里 `unsupported` 就是真不可用，界面上不画空壳。
- E2 浏览器页与终端页在对应 Capability 注册之前，显示为真实不可用。
- E3 批准不等于已发生：`effect_settled` 要等真实回执。

## 5. 阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| C0 | UI 与交互设计定稿 | **已完成**：`design.md` §14、`ui/` 四张稿 |
| C1 | Capability 地基：Projects 工作区只读、Agent Host 命令回执（Goals 复用已注册的 16 个） | **已完成**：`projects.workspace.read.v1`、`agent.command-output.v1`；`tests/coding-capabilities.test.ts` 3 项、`tests/agent-host.test.ts` 15 项 |
| C2 | Artifact 类型：ChangeSet / Report / Diagram | **已完成**：`plugins/native/coding/src/artifacts.ts`；图是结构不是 SVG，见下；`tests/coding-artifacts.test.ts` 5 项 |
| C3 | 插件本体：Manifest + 三段 UI | **已完成**：包、Manifest、投影层、目录栏与工作台渲染、会话落库（真实 SQLite 重开验证）。`coding-projection` 5 项、`coding-ui` 5 项、`coding-store` 4 项 |
| C4 | 宿主审查面 | **已接进产品装配**：`composeAgentHost` 在 `web-server` 里被调用，CLI 运行时已注册，插件经 Capability 真的够得到（`tests/agent-host-composition.test.ts` 5 项）。会话里的审查摘要卡已做（含「卡片上不能有任何按钮」这条硬断言）。**审查队列已经走 HTTP**：`/api/agent/reviews` 读、`/api/agent/reviews/decide` 决定，复用既有的本地控制护栏（同源 + 控制令牌 + 一次性键），重放返回 409。渲染器仍未挂进页面——那要等壳能从运行实例取表面。`agent-review-surface` 7 项、`coding-review-card` 5 项、`agent-review-http` 4 项 |
| C5 | 审批桥挂到 Prologue + 真实模型验证 | **接线完成；凭据已通**：桥挂上之后 `text-edit` 才申报支持（`command` 不跟着变，见下）。两种 API 格式已对着真实 MiniMax 验证通过，见 C6。`tests/prologue-approval-attachment.test.ts` 5 项 |
| C6 | 模型供应商管理（设置页 + 两种 API 格式） | **已完成**：契约、设置页、落库（目录库 schema 17）、到 `modelConfiguration()` 的映射，以及**跨密钥库的凭据交接**。`model-providers` 9 项、`model-provider-store` 7 项、`prologue-credential-bridge` 6 项 |
| C9 | 对齐 FlyLeaf 的全部能力 | **已完成**：方法/MCP 选择、检查点、子代理与验收、恢复投影、工作区事件、并行写入（含真实 git 工作树）、报告与用量视图、贴底行为。`coding-selection` 8、`coding-delegation` 8、`coding-recovery` 7、`coding-events` 8、`coding-writers` 9、`git-worktrees` 5、`coding-reading` 6、`coding-report-usage` 4 |
| C8 | 结构化提问（AskUser） | **已完成**：问题进 `AgentRunView.awaiting_input`，回答是独立的控制动作（不是 steer），Coding 侧有提问卡片。`coding-question-card` 7 项、`agent-pending-questions` 4 项 |
| C7 | Coding 由 Plugin Runtime 托管 | **已完成**：产品经 `coding-surface.ts` 起平台、启动 Coding、用它的 contribution 渲染目录；`kind` 已从 `native` 翻成 `app`。`coding-plugin-activation` 3 项、`coding-surface` 3 项、`plugin-panel-seam` 3 项 |
| C10 | 复现 FlyLeaf 的另外五个插件 | **已完成**：`workspace` / `files` / `diff` / `git` / `text-stats` 五个包，Manifest v2 端口与输入组、纯投影层、UI 贡献，全部在真平台上一起启动并能连线。跨插件的载荷契约收进 `contracts/modules/workspace-artifacts`（插件之间不许互相 import）。`workspace-plugin` 7、`files-plugin` 13、`diff-plugin` 16、`git-plugin` 18、`text-stats-plugin` 7、`workspace-plugin-graph` 5、`plugin-catalog-companions` 7 |
| C11 | 提示分层：划清 ReAct 里属于我们的那一层 | **已完成**：四层契约、宿主按层组合、项目层接上项目指引、只读的「这一轮的身份」面。`agent-prompt-layers` 11 项 |
| C12 | Character 管理（角色变成用户可管的数据） | **计划中**，见 §7 |
| C13 | Plan → SubAgent 接通 → TaskBoard | **计划中**，见 §7；三者按这个顺序，倒过来会做出没有内容的板子 |
| C14 | Prompt Cache（开，不只是读数） | **已完成**：供应商记录带 `prompt_cache`，落库（目录库 schema 18）、设置页、透传到 `startAgentRun`。`model-prompt-cache` 7 项 |
| C15 | 修 protocol 名字对不上 | **已修**：`prologueProtocolFor()` 做显式翻译，断言钉在 Prologue 自己的适配器表上。`model-protocol-mapping` 5 项 |

C1 与 C2 都挡着 C3；C4 挡着 C5。顺序理由见 [`implementation.md`](implementation.md)。

### C5 分两半，一半做完了

**做完的：把审批桥挂到 Runtime 上。**
`PrologueAgentAdapter` 现在接受一个 `approvals` 桥。挂上之前 `text-edit` 如实申报为 `unsupported`，
宿主拒绝任何会写入的角色起跑；挂上之后它才算支持，而且 Run 每停在一笔副作用上，
这笔副作用都会**先进宿主审查队列**，在用户决定之前执行主人那边收不到任何答复。
镜像失败不会被当成放行——它记在这一轮的活动里。

**`command` 不随桥变成支持。** 跑命令只是一半，调用方还要读回执，而这个 adapter 的端口没有回执来源，
`readCommandOutput` 答不上来。报成支持会让 Coding 的终端页显示可用而每次读都失败——
那是同一个谎的反面。所以 `execution: "text-edit"` 的角色挂桥后能跑，`workspace-write` 的仍然被拒。

**没做完的：对着真实模型端到端跑一次。** 这需要 Provider 凭据，不是代码问题。
Prologue adapter 的参数组装至今只有编译器对着 SDK 自己的类型检查过，
`prologue-node.ts` 的文件头也如实写着这一点。

另外 **CLI 那一侧的写入仍然不支持**：Claude Code 的审批发生在它自己的权限模型里，
要打开需要一个 permission-prompt 工具把询问转回宿主队列。

所以今天跑起来的产品里，写入档位依然不可用——因为**产品装配根本没有构造 Agent Host**，
自然也没有挂桥。路通了，但没人走。

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

### 终端页现在是真的

`command.receipts` 是新加的能力，和 `command` 分开：**能说清跑过什么，和能不能在宿主审批下跑新的，
是两个问题**。CLI 流现在保留命令回执（输出按 16 KiB 截断并如实标记，失败的输出进 stderr，
退出码保持 `null` 因为 CLI 只说成功失败），`readCommandOutput` 真的读得到。

Coding 的终端页因此改成按 `command.receipts` 判断可用性，而不是按 `command`。
CLI 上它现在可用；`command` 依然申报不支持，因为执行仍归 CLI 自己的权限模型管。

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
  Prologue 的事件**不带选项**，所以选项就是空数组——编出选项等于替运行时说话。
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

**并行写入接了真实 git**：`apps/local-host/src/git-worktrees.ts` 用 `execFile`（参数数组，不走 shell，
因为分支名受用户影响）建工作树、列改动、清理。非 git 目录和没有提交的仓库都如实报不支持——
在那里说支持，会在第一次建工作树时才失败。写入者 id 限定安全字符集，
`../escape`、`--upload-pack=evil` 这类都被拒，不会变成 git 参数。

工作区事件的路径校验比 FlyLeaf 更严：拒绝**所有**控制字符而不只是空字节，
`..` 与分隔符一律拒绝而不是 normalize——想爬出工作区的载荷是坏载荷，悄悄改写会把问题藏起来。

## 6. 已知缺口与风险

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
- **Prologue 从未对真实模型端到端跑过**（见平台需求书 P6）。
  **这已经付出代价了**：§7 的 C15 是一个照着代码读出来的确定缺陷——protocol 名字两边对不上，
  今天经 Prologue 起的每个 Run 都会在协议查表这一步失败。编译器对得上、单测也对得上，
  因为两边都是 `string`、测试用的是我们自己的端口。只有真跑一次才会撞到。
- **CLI 的写入不经宿主审批**，因此 `text-edit` / `command` 申报为不支持。
- **产品装配根还没有构造 Agent Host**，也没有挂审查面。C1 的两个 Capability、C4 的审查面、
  以及 `createPluginPlatform` 都是同一个状态：**路通了、有测试证明通，但今天跑起来的产品没有调用它们**。
  这不是遗漏，是顺序——等 Coding 真正作为 app 插件被 Plugin Runtime 托管时一起接。
  但必须说出来，否则「已完成」会被读成「已经在用」。

## 5.4 C10：FlyLeaf 的另外五个插件

FlyLeaf 的 `plugins/` 下除了 `coding-agent` 还有五个：`projects`、`files`、`diff`、`git`、`text-stats`。
它们在这里全部复现，并按 Molis Work 已有的东西做了映射：

| FlyLeaf | 这里 | 为什么这么映 |
| --- | --- | --- |
| `projects`（选目录 + 发布它） | `workspace`（只发布） | 项目在 Molis Work 已经是目录库里的一等记录，选目录不是插件的事；缺的那一半是「把当前项目变成别人能连的值」 |
| `files` | `files` | 树、阅读器、`before`/`after` 快照、选区，全部照搬；目录读取归宿主，插件只投影 |
| `diff` | `diff` | 三组可互换输入：两份快照、Coding 的变更集、Git 的工作区改动 |
| `git` | `git` | 工作区状态、提交草稿、接受一轮变更；`git` 仍由宿主跑，porcelain 的解析放在插件里才测得动 |
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

### 这一段没接通的部分

- **只有 `workspace` 的面板接上了产品。** 五个插件都在 `coding-surface.ts` 里随项目一起启动（端口与
  事件订阅因此才登记得上），但 `files` / `git` / `diff` 的面板需要宿主提供目录列表、文件读取和
  `git status`，这三处数据源今天不存在。面板没挂 ≠ 插件没跑，但也不能反过来说成「Files 能用了」。
- **端口之间还没有默认连线。** 宿主没有替用户建任何 binding，所以图是「能连」而不是「已连」。
  `tests/workspace-plugin-graph.test.ts` 里连线是测试自己建的。

## 7. 下一批：四处缺口与一个已确认的缺陷

**对照的基线在哪。** 不是凭印象说「市面上都有」。`/Users/yijunwang/reference` 下有几家的真源码
（`codex`、`cline`、`opencode`、`claude-code-sourcemap-main`、`claude-code-system-prompts`、
`grok-build`、`openclaw` 等），Prologue 的 `docs/slices/model-facing-gaps.md` 已经照着
Codex 的 `codex-rs/core/src/tools/handlers/`、Claude Code、OpenCode 的 `core/src/tool/`、Cline
查过一遍工具面。下面每条要补的东西，**先去那几份源码里看别人怎么做的、为什么那么做**，
再决定我们抄哪一半、拒哪一半——`model-facing-gaps.md` 里「明确不做」那一节就是这种拒绝的样子，
它比照搬有价值。


下面五条来自一次逐项对照（Coding 的 ReAct 提示分层、Prologue 的 Character 模块、
TaskBoard/SubAgent/Plan/协同、Prompt Cache）。每条先写**今天是什么**，再写**要做什么**——
「今天是什么」是查过代码的，不是印象。

### C11 提示分层：把 ReAct 里属于我们的那一层划清楚

**今天是什么。** ReAct 循环**不在这个仓库里**：think → act → observe 跑在 Runtime 里
（Prologue 的 agent loop、Claude Code CLI）。这边只做一件事——在 Run 起跑前**冻结身份**：

- `plugins/native/coding/src/roles.ts` 里 7 段 prompt body（`coding-base` + 6 个角色专属）、6 个角色；
- 每个角色用 `prompts: ["coding-base", "coding-<role>"]` **点名**要哪几段；
- `composeRolePrompts()`（`horizontal/agent-host/src/index.ts`）按点名顺序取 body，
  角色不点名才回退到「全部已声明的」——早先是**无条件**回退，只读角色因此拿到过写入者的
  「你可以改文件」，那是真 bug，已修；
- adapter 收到的是冻结后的 `{role_id, version, execution, prompts[], host_tools[]}`，
  它不读 `roles.ts`、不自己拼；起跑后再复核一次，Runtime 回报的角色与冻结的不一致就取消 Run。

所以**只有系统指令这一层是我们的**。工具调用的格式提示、观察回填的措辞、重试提示，
全在 Runtime 里，我们既没设也改不了。

**做完了什么。** 没有「把 ReAct 搬过来」——那会变成第二个 agent 循环，和 Runtime 抢同一件事。
补的是**我们这一层**：

1. **四层有了名字和顺序**：`base`（产品约束）/ `role`（这一轮的身份）/ `project`（这个项目的约定）/
   `task`（用户这一次写的）。组合严格按这个顺序，**层内顺序不动**——角色点名 prompt 的次序是它有意排的。
2. **`task` 不能被声明。** 包里出现一个 task 层的 prompt 会被 `inspectAgentDeclaration` 拒绝：
   任务是用户这一次写的，包里带一个就是替他说话，而「你的任务」那一栏会显示成别人的话。
3. **project 层由宿主补，而且强制标成 project**——不管送进来的人管它叫什么。
   来源是**真实存在的**：Goals 的项目指引已经渲染好 `runtime_prompt_prefix`，
   所以这不是一个没人能发布的端口。项目没确认过指引时这一层是**空的**：
   指引视图在那种情况下仍会渲染一句「还没有确认过」，把它当指令传下去，
   等于把「这个项目什么都没说」变成一条它说过的话。
4. **冻结的那一份看得见。** 冻结记录里每条 prompt 带着自己的层，
   「这一轮的身份」按层展示，空的层也出现并说清为什么空——
   缺一节读起来像「这里没东西可看」，写一句「这个项目还没确认过指引」才是能动手的信息。
   **面上没有任何控件**（有硬断言守着）：能改就等于绕过冻结；要改是改角色，在下一轮之前。

### C12 Character 管理：接线有了，管理没有

**今天是什么。** 要分两半，不能一句「没实现」带过：

- **接线是真的。** `prologue-node.ts` 每次起 Run 都 `sdk.characters.create(...)` + `publish`，
  把 `characterRef` 挂到 Run 上。Prologue 的 Character 机制**在用**。
- **管理一点没有。** 那个 character 是**从冻结角色现造的一次性投影**
  （`id = role_id`、`version = role.version`、`tools = host_tools`），一 Run 一个，用完就扔。
  Prologue `character` 模块支持的东西——人设 CRUD、`active / disabled / tombstoned` 状态、
  skill / tool / mcp-server 绑定、按版本 CAS 写入、从目录安装、`BUILT_IN_CHARACTERS`——**一个都没接**。
- 用户这边：6 个角色**编译进包**，加不了、改不了、也不能绑自己的工具集。
  全仓 grep 不到任何 character / persona 的产品概念。

**要做什么。**

1. **角色变成数据，不再是常量。** 目录库里存用户自己的角色：名字、指令、工具子集、启用停用。
   内置 6 个作为**样例**随包发，不是「产品默认」——Prologue 自己的
   `config.character.includeBuiltIns` 默认关，理由一样。
2. **只能收紧，不能扩权。** 一个角色要的工具比 Manifest 声明的天花板宽，是**扩权尝试**，
   起跑前失败；不是「尽力给一部分」——给一半会让这一轮以为自己能做它做不到的事。
3. **改角色是按版本写入。** 两个人同时改同一个角色要冲突，不能互相覆盖；
   **运行中的 Run 握着冻住的那一份**，改角色不影响它。
4. 设置页跟 C6 模型供应商同一处，同一种样式。

### C13 TaskBoard / SubAgent / Plan / Agent 协同

四件事进度差得很远，必须分开说。

| | 今天是什么 |
| --- | --- |
| **TaskBoard** | **只有一个页签常量**（`ui.ts` 里 `{ face: "taskboard", label: "TaskBoard", icon: "grid" }`）。没有数据、没有投影、没有渲染 |
| **SubAgent** | **投影做了，Runtime 不支持**。`delegation.ts` 有 `projectSubagents`（验收 accepted / needs-work、「跑完 ≠ 验收通过」）+ 8 项测试；契约有 `AgentSubagentsCapability` 与 `subagent_workspaces: "required"`；roles 里有 coordinator / writers。**但**：`codingAgentManifest` 没声明 `subagents` 块，两个 adapter 的能力矩阵里 `subagents` 都是 `unsupported`（`emptyCapabilityMatrix()` 的默认，谁都没改），`horizontal/agent-host/` 里没有任何 subagents 端口实现 |
| **Plan** | **没有**。唯一沾边的是 `prologue.ts` 把执行档位映射成 Prologue 的 `mode: "plan" \| "build"`。没有计划对象、没有计划批准、没有 plan → execute 的转换 |
| **协同** | 同 SubAgent：`writers.ts` 的并行写入投影 + 真实 git 工作树（`git-worktrees.ts`）都在宿主侧做好了，但**没有 Runtime 能起子代理**，所以今天跑不起来 |

**要做什么，按依赖顺序。**

1. **Plan 先做。** 它不依赖子代理，而且是这类产品的标配交互：
   一轮先出**计划对象**（有序步骤，每步说清做完怎么判断它做对了），用户改/批，
   批过之后才转成执行。**计划不是提示词里的一段话**——它得是能引用、能比对、
   能说「实际做的和计划的不一样」的东西，否则「按计划执行」无从验证。
2. **SubAgent 接通。** 先给 adapter 实现 `subagents` 端口并如实申报能力，
   投影层已经在等它。**跑完 ≠ 验收通过**这条已经在投影里立住了，接通时不能退。
3. **TaskBoard 最后。** 它是前两者的**视图**：计划的步骤 + 子代理的认领与验收，
   摆成一张板。先做板子会做出一个没有内容的板子。

### C14 Prompt Cache：只读数，没有开

**今天是什么。**

- **读**：`prologue-stream.ts` 读 `receipt.cacheRead.tokens`、`cli-stream.ts` 读
  `usage.cache_read_input_tokens`，都填进 `AgentTokenCount.cached_input`，用量面板显示得出来。
- **开**：全仓没有任何 `cache_control` / `ephemeral`，也没有任何地方设置缓存模式。
- **Prologue 这条路**：Prologue 的机制是完整的（`model/core/cache.ts`：`off / best-effort / required` 三态，
  本地按打包指纹判失效，`required` 遇到「对方不支持」或「前缀已变」**直接失败**而不是照价收费）。
  **但默认是 `off`**（`promptCache ?? "off"`），而我们的 `PrologueModelConfiguration` 只有
  `protocol / endpoint / model / credential_ref`——**没有缓存这个字段**，`startAgentRun` 也没传。
  所以走 Prologue 的 Run 现在不带缓存。
- **CLI 这条路**：Claude Code 自己打断点，我们只是把它报的命中数显示出来。

**做完了什么。**

1. 模型供应商记录加了 `prompt_cache: "off" | "best-effort" | "required"`，落目录库（schema 18，
   旧库按需补列，可重复跑），透传到 `startAgentRun`。
   **关着就一个字段都不发**——`off` 的请求和「没有缓存这回事」时逐字节一样。
   没选过的供应商是关着的：升级不替用户要一个他没要过的东西。
2. **两种格式不一视同仁。** Anthropic 兼容线有 `cache_control` 断点，我们打得开；
   OpenAI 兼容线由对方自动做前缀缓存，没有可以由我们打开的字段。
   所以设置页在 OpenAI 格式上**根本不摆「必须命中」这个选项**——
   摆一个永远选不了的选项，用户学不到任何东西；不摆它、加一句话，才说得清。
   保存时也再判一次（改格式会让一个已存着的档位重新过审），
   这是配置错误，要在用户还看着那个字段的时候说，不是等某次 Run 失败。
   「能不能打开断点」这件事**以 Prologue 自己的申报为准**，不是我们抄一份清单。
3. **还没做**：用量面板目前只显示命中的 token 数，说不清「这次没开缓存」和
   「开了但没命中」是两回事。

### C15 已确认的缺陷：protocol 名字对不上

`prologueModelConfiguration()` 把 `protocol: selection.provider.api_format` 直接传给
Prologue，值是 `"anthropic-messages"` / `"openai-chat-completions"`。
Prologue 按**精确字符串**查协议表，表里的键是 `"anthropic-compatible"` / `"openai-compatible"`
（`packages/sdk/src/model/plugin/registry.ts`），查不到就抛 `MODEL_PROTOCOL_UNSUPPORTED`。

**也就是说：今天经 Prologue 起的每一个 Run 都会在协议查表这一步失败。**

**测试为什么没拦住它。** `tests/model-provider-store.test.ts` 里写着
`assert.equal(configuration?.protocol, "anthropic-messages")`——它断言的是**我们自己的名字**，
而代码传的也是我们自己的名字，于是两边一致、测试通过。
问题从来不在我们这一侧是否自洽，而在**对面认不认**。
所以修的时候断言要钉在 Prologue 的 `BUILT_IN_ADAPTERS` 上（SDK 导出了它，每项带 `protocol`），
让下一次改名直接把测试打红。

这正是「对着真实模型端到端跑一次」没做所以没被发现的东西——编译器对得上（两边都是 `string`），
单测对得上（测试用的是我们自己的端口，不是 Prologue 的表）。**已修。** `prologueProtocolFor()` 做一次显式翻译，`ModelApiFormat` 保持面向用户的拼法
（设置页里写着 `/v1/messages`），不跟着别人的内部键走。

断言钉在 **Prologue 自己导出的 `BUILT_IN_ADAPTERS`** 上而不是我们抄的一份清单：
`tests/model-protocol-mapping.test.ts` 逐项确认每个译出来的名字 Prologue 真的认、
我们自己的名字它真的不认、两套名字一一对应没有漏也没有多。
SDK 那边改名会直接把测试打红。

这件事是**跑出来的，不是读出来的**：拿真 SDK 起一个适配器注册表，
`anthropic-messages` 和 `openai-chat-completions` 都抛 `MODEL_PROTOCOL_UNSUPPORTED`，
`anthropic-compatible` / `openai-compatible` 才通。

## 7.1 C12 的设计：Character 是什么

在写实现之前先把它是什么想清楚，否则会做成「角色表加个增删改」。

### 它是对角色的**收紧**，不是角色的替代

Manifest 里的角色是**插件声明的可能性**，宿主已经拿它和 Runtime 的能力矩阵对过账；
Character 是**用户在那个范围里的选择**。所以：

**character ⊆ role**，永远。一份要的工具比它派生的角色宽，是**扩权尝试**，起跑前失败——
不是「尽力给一部分」。给一半会让这一轮以为自己能做它做不到的事，
而这正是 Prologue 的 character 模块用整段注释强调过的那条。

能放宽就意味着用户可以给自己一个 `run-command`，而底下那台 Runtime 根本不支持在审批下跑命令。
收紧永远安全，放宽永远不安全——这不对称，所以不做成一个对称的「编辑」。

### 档案上那句自我介绍**必须进提示**

Prologue 那边写得很直白：不进提示的话，「探索者」和「工人」的区别就只剩工具名单，
而档案上那句话是个死字段。

C11 刚把提示分了层，所以这件事有地方放：**Character 的自述进 `role` 层**，
排在插件角色自己那几段之后——它是在角色搭好的场景里说话。

反过来也成立：**没有 Character 也要能跑**。默认执行者**不带自述**——
它不是一份隐形档案，就是「这一次本来有什么」；凭空多一句自我介绍，
等于替用户决定了人格。

### 引用必须精确到版本

**没有「按名字取最新」。** 否则同一句话在档案改版之后会悄悄换一份人格，
而用户当初点头点的是那一版。冻结记录里存 `character_id` + `character_version`，
运行中的 Run 握着冻住的那一份，登记表之后怎么改都不影响它。

### 停用和删除是两件事

- **停用**是用户的选择，可以再打开；
- **删除**之后那个 id **不能被重用**——历史里的 Run 引用着它，
  重用会让一条旧记录指向一份它从没用过的档案。

所以删除是留墓碑，不是抹掉。

### 内置的是样例，不是产品默认

随包发几份示例角色，但**默认不启用**。Prologue 的 `config.character.includeBuiltIns`
默认关，理由一样：内置人格一旦默认开着，就成了产品替用户做的决定。

### 落在哪

和模型供应商同一处——目录库（安装级），不是项目库。
Character 是「我习惯怎么干活」，跟着人走而不是跟着某一个项目走。
将来真出现按项目定制的需要，那是加一列作用域，不是现在先猜一个。

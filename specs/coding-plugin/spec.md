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
| C4 | 宿主审查面 | **界面与接缝已完成，产品装配未接**：审查面在 `apps/workbench/src/agent-review-surface.ts`；`local-host` 暴露了 `registerCapability` 接缝，`tests/agent-host-wiring.test.ts` 证明组合根照这条路接得通。但**产品的装配根至今没有构造 Agent Host，也没有挂这个审查面**——和 P7 之前的平台一样，接得通不等于已经在跑。`agent-review-surface` 7 项、`agent-host-wiring` 1 项 |
| C5 | 审批桥挂到 Prologue + 真实模型端到端验证 | **接线已完成，真实模型验证待凭据**：桥挂上之后 `text-edit` 才申报支持（`command` 不跟着变，见下），Run 停下等的副作用会先进审查队列。`tests/prologue-approval-attachment.test.ts` 5 项 |

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
- **CLI 的写入不经宿主审批**，因此 `text-edit` / `command` 申报为不支持。
- **产品装配根还没有构造 Agent Host**，也没有挂审查面。C1 的两个 Capability、C4 的审查面、
  以及 `createPluginPlatform` 都是同一个状态：**路通了、有测试证明通，但今天跑起来的产品没有调用它们**。
  这不是遗漏，是顺序——等 Coding 真正作为 app 插件被 Plugin Runtime 托管时一起接。
  但必须说出来，否则「已完成」会被读成「已经在用」。

# Memory

**白话：** 记住用户明确要求保留的偏好、约定和事实，在助理、Agent 和界面做事时按情境带出来，并让用户看得见、撤得回。它不替插件决定业务结果，也不保存第二份正文。

**类别：** 平台产品服务（[系统架构 §3](../system/ARCHITECTURE.md)），不是技术性的横向运行服务。哪些内容可以记、怎样从工作里提出建议、召回时先带哪些，是跨插件的产品策略；这类策略可以放在这里，但记忆不拥有任何插件或 Module 的业务事实：业务对象的事实永远向所有者读取，记忆只记「用户想让系统记住什么」。位置暂不变动，仍在 `horizontal/memory`。

**提供：**

- 系统动作 `memory.*`（提供方 `system.memory`，Host 装配在 `apps/local-host/src/memory/memory-host.ts`）：`memory.recall`、`memory.list`、`memory.write`、`memory.change`、`memory.history`、`memory.candidates.list`、`memory.candidates.accept`、`memory.candidates.discard`、`memory.changes.list`、`memory.changes.undo`、`memory.prefs.read`、`memory.prefs.write`、`memory.signals.report`、`memory.pairs.list`、`memory.pairs.resolve`、`memory.upkeep.run`、`memory.scope.preview`、`memory.scope.clear`、`memory.export`、`memory.import`。使用方（助理、Agent、界面、插件、MCP）由可信调用上下文的受众得出，不从输入读；`memory.recall` 对界面、Agent、工作流、插件和 MCP 开放，`memory.list` 和 `memory.write` 对界面、Agent 和插件开放，MCP 只能召回，其余动作只对界面。其中插件受众和 MCP 受众今天在产品里都没有使用方：已定（决定 19）MCP 受众保留并补一条经 MCP 授权的用例，插件受众标「未启用」。当前的缺口是：这个标记只是状态词，`memory.recall`、`memory.list`、`memory.write` 三个动作今天在目录层对插件受众都可达，创作台的能力看板会把它们列给生成插件；实际调用时生成插件不带插件身份，`memory.write` 会被拒绝，`memory.recall`、`memory.list` 套不上用户对单个插件的设置。是否把它们从插件受众拿掉，决定 19 没有说，还没问用户。逐项核对见 [CALL-CHAINS §8](../system/CALL-CHAINS.md)。
- 开关与使用方权限：个人范围和每个项目各有一组开关（允许记住、自动记住低风险内容、从工作里提建议、从界面操作里学习），角色记忆沿用所在项目的开关；每个使用方（助理、Agent、界面、插件、MCP）单独开关，插件还可以逐个设置能读哪些类别；MCP 默认读不到个人记忆。
- 确定性写入门：开关、秘密形状、像指令的文字、范围、重复与冲突，以及自动写入的决定表。模型只提议不批准，规则版本记进来源与最近变动。
- 召回编排：按使用方的权限取范围与类别，过滤停用、暂停、过期和不适用的条目，打分、按条数与字数预算取用。
- 使用回执：每次召回记下用上的和因预算或上限没带上的，设置里显示「最近用于」。
- 待认可的建议（候选）：同样的话只提一次，每项工作最多 3 条，14 天过期；用户认可后才变成记忆。
- 最近变动与撤销：自动写入、替换、停用都可撤销，只有本人能撤。
- 界面信号计数：情境动作被接受、忽略、改写、撤销的次数（只记动作和标题，不记内容）。单次事件不会形成记忆；次数和不同场合都过了门槛，才提出一条待认可的建议。

**技术状态：** 旁表在 `{home}/memory/memory.db`（版本 2，建库代码在 `packages/storage/src/adapters/memory-ledger.ts`）：历史版本、候选、最近变动、开关、界面信号、使用记录、所有者标题、配对和标记。记忆正文、版本号、墓碑和作用域隔离在 Prologue Memory，经 `horizontal/agent-host` 的适配器访问；旁表只在条目存在时保留某个旧版本的文字，条目删除时一并清掉。

**不拥有：** 记忆正文与版本（Prologue Memory）；模型调用和提炼（Agent Host，记忆服务自己不调模型）；交互规则（助理规则引擎）；项目说明（Goals）；设置页面（工作台，`apps/workbench/src/settings-memory.ts`）。

**当前来源与 Goal：** `horizontal/memory`（`MemoryService`），旁表适配 `packages/storage`，Host 装配 `apps/local-host/src/memory/`（`memory-host.ts`、`memory-learning.ts`、`memory-upkeep.ts`；后两个经 Host 的推理端口 `hostTextGeneration` 调模型提炼与整理，写入仍由写入门决定）。需求与语义见 `specs/archive/memory-system/spec.md`；逐步的调用链见 [CALL-CHAINS §8](../system/CALL-CHAINS.md)。

**已知的边界问题：** 旁表的建库代码放在基础包 `packages/storage`，写入门放在 `horizontal/memory`，规则和 schema 分处两个包；`horizontal/memory/src/service.ts` 一个文件超过 1,300 行，`MemoryService` 在巨大单元清单里。N-03 决定「代码不搬、写清边界」，这里的待办是把边界规则写进包 README 与门禁（W4-08），不是搬走。

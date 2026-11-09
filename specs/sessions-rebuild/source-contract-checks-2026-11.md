# Sessions 来源合同：第 22 批只读核查（2026-11-04）

状态：只读核查，供第 22 批「Sessions 来源与历史合同」写合同用；不写代码，不碰真实会话与真实 Home。合同与实现等第 02 批交完、C 轨交接后由 C 轨写手落（[第 22 批](../post-anticorruption-roadmap/reference/batches/22.md)）。定样结论见[需求 §8](spec.md#8-决策记录)，原型在 [`docs/design/sessions-sources/`](../../docs/design/sessions-sources/README.md)。

## 0. 给人讲清楚

这里查了三件事，都是为了让后面写接入规矩时不走弯路：

- 第 20 批要做的场景和 AI 生成的页面，要能显示「最近的外部会话」、打开看历史。它们要的只是**只读**的两样：按项目列出会话（带每个工具读没读成），读一个会话的原文（分页、能搜）。这两样就是这批定样里的列表和历史，不多要。
- 第 24 批核的 AI 运行底座，Sessions 读历史完全用不上它；只有「建议归到哪个项目」和以后的「要点」要调一次模型，现有的就够。会话控制（接着做、发消息、交接）是第三阶段的事，也不缺底座的东西。
- 仓库里「支持哪些 AI 工具」的名单有三份，彼此对不上。合成一份的办法定了：一张登记表，每个工具一条，写清它能做到哪一步；三份旧名单都从这张表算出来，不再手写。

## 1. 第 20 批要的历史读取能力

第 20 批定「场景与生成页面公共合同」，其中跟外部会话有关的需求是：

- [Onboarding §3.8](../onboarding-coverage/spec.md#38-场景与能力组合) 的「写代码」场景，起步首页有「最近会话」；
- [Onboarding §3](../onboarding-coverage/spec.md) 2026-10-28 一段：外部会话是可接入的已有材料来源，场景复用 Sessions 的公共来源与控制能力，不自己维护厂商读取器、会话库或执行链；
- §3.8.1 场景套组要声明必要与可选依赖，依赖未就绪要如实显示。

所以 20 只需要 Sessions 提供三样，都是只读：

| 20 要的 | Sessions 提供什么 | 和定样的关系 |
| --- | --- | --- |
| 按项目列出最近的外部会话 | 一个列表动作：输入项目（可选「待归类」）、条数与翻页；输出每条的工具、标题、目录、最后活动、归属与依据、是否在运行；另带**每个来源的状态**（已读完、在读、需要登录、这一版读不了、没读成、暂不支持、未允许），没读成不报成空 | 方案 B 的列表与来源条 |
| 读一个会话的原文 | 一个读取动作：输入会话（产品入口 + 账号或本机位置 + 原生 ID）、分页游标、可选搜索词；输出条目（你／工具／工具步骤／说明）、命中位置、是否还有更早的、读到哪里断了 | 方案 A 的原文对话 |
| 声明依赖与就绪 | 场景套组把「外部会话读取」写成可选依赖；就绪看「读取范围」里是否有允许的工具，没有就显示未就绪和去处（读取范围） | 读取范围 Sheet |

不在 20 里的：恢复、发消息、交接（第三阶段，各有委托）；AI 要点（定样没选 C，以后要做走同一个读取动作取原文再整理）。

两条约束随这两个动作一起定：

- **只读、按调用者的项目范围给**：生成页面和场景里的调用，可信身份和项目取自调用上下文（`AGENTS.md` 硬约束），只返回调用者看得到的项目和获准读取的工具；读取范围收窄或撤回后，后面的调用立刻不再返回范围外的内容（SRB-06、SRB-12）。
- **一次只要一次**：列表一次请求带回本页所有条目和来源状态，不按条目逐个请求；原文按页读，不一次读完长会话（[开工前检查](spec.md#7-开工前检查)第 9 项）。

两个动作都在动作目录登记一次，页面、工作流、Agent、MCP 共用（[动作架构 §3](../action-architecture/spec.md)）；外部工具的读取要等子进程或文件，声明 `scheduling: "concurrent"`。

## 2. 第 24 批的 SDK 与任务合同

复用第 24 批的[现有 SDK 能力盘点](../prologue-adoption/sdk-capability-inventory-2026-11.md)（#1752），逐项看 Sessions 用不用得上：

| Sessions 要做的 | 用 Prologue 的什么 | 结论 |
| --- | --- | --- |
| 发现会话、列表、读历史、搜索 | 不用。读的是外部工具自己的正式命令或本地记录（[来源盘点](source-inventory-2026-11.md) §2～4），不是 Prologue 会话 | **不涉及 SDK** |
| 归属建议（定样 B） | 经 `horizontal/agent-host` 调一次模型，输入获准的会话标题、目录与片段，输出建议项目、理由与依据；失败保持待归类 | **有**（单次调用）；不需要上游 |
| 持续跟进 | 交给[观测和采集层](../observation-collection/spec.md)的来源适配，不另建轮询（盘点 §4 第 6 条） | **不涉及 SDK** |
| 恢复原会话（第三阶段） | 工作终端已有的 `resumeArgs`（5 家）与 `goals.terminal.open@2` 的 `resume_session_id`；外部工具的进程不归 Prologue | **不涉及 SDK** |
| 向外部会话发消息、回执不丢不重（SRB-04） | 外部工具的非交互入口（如 `claude -p --resume`、`codex exec resume`）；回执、去重与「结果未知先核对」由 Sessions 自己按[输入回执](../ai-input-receipts/spec.md)的说法记录。Prologue 的 `acknowledge-inputs` 只管 Prologue 自己的会话 | **不涉及 SDK**；借用输入回执的状态词，不借实现 |
| 跨工具交接给 Molis 里的 Agent（如 Coding） | 接手方是 Prologue 会话时，用 TaskBoard 的节点、接续与 `queueInput`（盘点 3.1、5.3 K-2、K-3 都已进包） | **有**；第三阶段再接 |
| 交接时「停止原任务后接手」（SRB-17、18） | 停的是外部工具的进程或云端任务，不是 Prologue Run | **不涉及 SDK** |

结论：第 22 批不需要请 Prologue 补任何东西，[31 批](../post-anticorruption-roadmap/reference/batches/31.md)的上游清单不用加项；24 的「逐项交付与证据关联」也不涉及 Sessions（会话不是交付项）。

## 3. 一处工具名单（BL-955）

### 3.1 现在

| 名单 | 在哪 | 成员 | 用来做什么 |
| --- | --- | --- | --- |
| `SUPPORTED_RUNTIME_IDS` | `packages/contracts/src/platform/installation-detection.ts` | codex、claude-code、opencode、pi-agent、grok-build | 安装检测、MCP 接入配置（`apps/local-host/src/installer/*`、`web-runtime-settings.ts`、`app-host.ts`） |
| `TERMINAL_RUNTIMES` | `apps/local-host/src/plugin-terminal-runtimes.ts` | 同上 5 家，另写一份 | 工作终端的启动命令与 `resumeArgs` |
| `CHARACTER_IMPORT_RUNTIMES` | `packages/contracts/src/modules/character-import.ts` | codex、claude-code、cursor、opencode、grok-build | 角色导入扫描规则与 Skills（`character-import-*.ts`、`modules/characters`） |

用到它们的源码文件 23 个（`git grep` 三个名字与对应类型，不含测试），测试里只有 `tests/runtime-integration.test.ts` 直接点名。

### 3.2 合成一份的做法

- **登记处**：contracts 里一张外部工具登记表，每个产品入口一条（id 沿用现有的 `codex`、`claude-code`、`opencode`、`pi-agent`、`grok-build`、`cursor`，新增的按盘点补）。每条写：显示名、入口种类（命令行、IDE、桌面、云端）、地区版本，以及逐项能力——安装检测、MCP 接入、工作终端（命令名与恢复参数的写法）、角色导入（规则与 Skills 的根目录）、会话的发现、列表、读历史、搜索、恢复、发送、停止、导出。每项写接入方式（正式命令、协议、服务接口、本地记录）或**缺口与原因**；界面按缺口显示「回到原工具」（盘点 §4 第 1 条）。
- **派生**：`SUPPORTED_RUNTIME_IDS` = 有 MCP 接入的条目；`TERMINAL_RUNTIMES` = 有工作终端的条目，`RECIPES` 的命令名与恢复参数从登记表读，宿主只保留执行与会话 ID 校验（S-103 的 `isTerminalSessionId` 不动）；`CHARACTER_IMPORT_RUNTIMES` = 有角色导入的条目。三个名字和类型照旧导出，成员由派生得出，现有 23 个文件的引用不用跟着改名。
- **不用兼容或迁移**：id 不变，存量数据里存的 `runtime_id` 照样有效，不加读取兼容（[合同变更流程](../../docs/system/CONTRACT-CHANGES.md)）。
- **合同改动**：新增登记表与派生是合同变更，按轨道规则 1 单独开一个只改合同的 PR，跑 `pnpm api:update`，PR 里写对调用方的影响（成员不变则无影响）；由 C 轨写手（C1）在合同队列里落。
- **门禁**：派生之后，仓库里再出现手写的工具 id 名单（字面量数组含两个以上登记表 id）就是回到老路；合同 PR 里补一条测试，断言三份名单等于登记表按能力筛出的结果，并在测试名或注释写 SRB-01、SRB-07。

## 4. 本批还剩什么

| 项 | 状态 | 等什么 |
| --- | --- | --- |
| 定样：发现、归属建议、历史查看 | 用户 2026-11-04 定 B／B／A（[§8](spec.md#8-决策记录)） | — |
| 组件板新增「外部会话原文」 | 定样里标出 | D 轨先在组件板补标本，再进产品 |
| 来源合同（登记表、列表与读取两个动作、会话身份） | 本文给出形状 | 第 02 批交完与 C 轨交接；合同单独一个 PR |
| 平台服务（`horizontal/` 下的新包）与消费者 | 未开工 | 合同合入后 |
| 逐家在实装版本上复核命令与路径 | 盘点 §5 列了待核项 | 写适配时逐家做，未核的保留为缺口 |

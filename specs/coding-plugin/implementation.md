# Coding App 开发逻辑

怎么把 [`spec.md`](spec.md) 的验收条件落成代码，按什么顺序，放在哪。
界面细节看 [`design.md`](design.md)，这里只管落地路径。

## 0. 为什么是这个顺序

C1 → C2 → C3 → C4 → C5 不是偏好，是依赖：

- **C3 需要 C1**。插件不持有模块，只能通过注册过的 Capability 调用。
  今天除 Goals 外没有任何模块注册过能力，所以 Coding 要读工作区目录、
  要投影命令回执、要写回 Goal 事件，**一条路都没有**。
- **C3 需要 C2**。成果要作为 Artifact 发布，类型得先存在，
  否则端口声明过不了 Manifest 解析（解析器会校验端口类型与 `artifacts.produces/consumes` 一致）。
- **C5 需要 C4**。审批桥要把 Runtime 的待批副作用送进宿主的审查队列；
  没有可操作的审查面，批准这一步没有人能完成，可写档位就永远开不了。

反过来不成立：C4 不挡 C3，只读档位下整条会话路径都能跑通。
所以 **C3 做完就有一个能用的只读 Coding**，这是第一个可验收的里程碑。

## 1. C1：Capability 地基

### 放哪

沿用仓库现有惯例，不新造：**能力定义放在拥有方自己的契约入口，绑定统一在
`apps/local-host/src/project-capabilities.ts` 的 `registerProjectCapabilities`。**

对照现状：Goals 是插件，契约入口是通用的 `platform/plugin`，所以它的 38 个能力定义
放在自己包里（`plugins/native/goals/src/goals-entry-capabilities.ts`）；
Agent Host 是横向服务，契约入口是 `services/agent-host`，它的 8 个能力就定义在那儿。
两处位置不同但规则同一条，不是漂移。

按这条规则，本阶段三组能力落位：

| 能力 | 定义在 | 给 Coding 用来 |
| --- | --- | --- |
| `projects.workspace.read.v1` | `packages/contracts/src/modules/projects.ts` | 读本项目已授权的工作区目录与目录树（只读） |
| `agent.command-output.v1` | `packages/contracts/src/services/agent-host.ts` | 只读本轮执行跑过的命令回执，喂右栏终端页 |


### 边界

- **只读就是只读**。`projects.workspace.read.v1` 不返回可写句柄，不接受路径参数逃逸出授权根；
  调用前按 realpath 核一次。
- **命令回执不是命令执行**。`agent.command-output.v1` 只读已经发生的回执，没有 `run` 一类的入口。
  它包装的是 `AgentRuntimeAdapter.readCommandOutput`——契约早就在，两个 adapter 也都实现了，
  只是都如实抛 `agent.capability_unavailable`，因为命令执行还没接宿主审批。
  **所以这个能力注册之后，终端页仍然是真实不可用**，直到 C5 把审批接通。这不是倒退，是如实。
- 原先写的「从 Sessions 投影」是错的：Sessions 是活的 PTY，不存命令回执这份事实。
- **写回 Goal 事件不需要新能力**。Goals 已经注册了 16 个事件类能力
  （`recordGoalNoteCapability`、`reportGoalEventsCapability`、`recordGoalProgressCapability` 等），
  Coding 只要在 Manifest 的 `capabilities.consumes` 里声明消费即可。
  设计文档 §12 原先写「未注册」是错的，已改。

### 测试

`tests/coding-capabilities.test.ts`：
- 三个能力注册后可被声明消费的插件调用，未声明的插件被拒
- 工作区读取越过授权根被拒（用 symlink 造一个逃逸路径）
- 命令回执只读：没有任何入口能发起命令；adapter 不支持时返回的是真实不可用，不是空结果
- 复用的 Goals 事件能力：未声明消费的插件调用被拒，声明了的写入后可读回

## 2. C2：Artifact 类型

三个类型，定义在 `packages/contracts/src/modules/artifacts.ts` 旁边的类型登记处：

| 类型 | 内容 | 消费方 |
| --- | --- | --- |
| `coding.changeset.v1` | 按文件分组的差异、范围（本轮固定 / 工作区当前） | 右栏结果页、Artifacts 插件 |
| `coding.report.v1` | Markdown 正文 + 来源轮次 | 中部报告正文、Artifacts |
| `coding.diagram.v1` | Canvas 画出来的图（SVG 正文 + 生成它的轮次） | 右栏 Canvas 页、Artifacts |

`coding.diagram.v1` 是新课题：SVG 是不可信内容，**渲染前必须过消毒**
（去掉 `<script>`、事件属性、`foreignObject`、外部引用）。消毒器和它的测试属于本阶段，不能拖到 C3。

## 3. C3：插件本体

### 包

`plugins/native/coding/`，与其余六个内置插件同构：
`src/manifest.ts` 导出 `CODING_PROJECT_PLUGIN_ID = "coding"` 与 `codingManifest`，
在 `apps/workbench/src/plugin-catalog.ts` 的 `BUILTIN_PLUGIN_CATALOG` 加一条。
**宿主代码里不出现 `coding` 这个 id**——导航、设置、路由、项目可启用性全部由 Manifest 推导，
`tests/plugin-declarative-mounting.test.ts` 已经锁住这条。

插件色 cyan 已经在 `MW_PLUGINS` 里占好位（`palette.ts`），不用改设计系统。

### Manifest 要声明什么

- `views`：`navigator` 一个（左栏，五个导航面是它内部的事）、`stage` 一个（中部 + 右栏）、`settings` 一个。
- `ports`：输入 `materials`（消费 Shelf 的 Artifact）、`goal-context`；输出 `changeset`、`report`、`diagram`。
- `capabilities.consumes`：Agent Host 的 8 个，加 C1 的 3 个。
- `agent`：角色声明（阅读者、构建者）与它们各自的 Prompt、可用宿主工具、执行档位。
- `permissions`：`artifact:read` / `artifact:write`，与端口类型一一对应——解析器会校验一致性。

### UI 组合

按 `design.md` §4 的三段：左栏五个导航面、中部对话与报告、右栏四页工具面。
**能力没接通的页按 E2 显示为真实不可用**，不画空壳：
浏览器页在 Web 版、终端页在 `command` 能力接通前，都属于这一类。

### 测试

`tests/coding-plugin.test.ts`（Manifest 与装配）、`tests/coding-session.e2e.test.ts`（真实浏览器走 A/B/C 路径）。

## 4. C4：宿主审查面

Agent Host 的 `AgentReviewQueue` 已经有请求、决定、一次性消费、回执和停止时撤回
（`horizontal/agent-host/src/reviews.ts`，`tests/agent-host.test.ts` 覆盖了各条边界）。
**缺的只是用户能操作的界面**。

它属于宿主，不属于 Coding——放在宿主的审查面里，不放进插件。
`registerAgentHostCapabilities` 原先只有测试在调用。本阶段做的是**把接缝开出来**：
`MolisWorkLocalHost.registerCapability` 让组合根可以接，`tests/agent-host-wiring.test.ts` 证明这条路通。

**产品的装配根仍然没有构造 Agent Host，也没有挂审查面。** 这和 `createPluginPlatform` 是同一个状态：
接得通、有测试证明通，但今天跑起来的产品没有调用。等 Coding 真正由 Plugin Runtime 托管时一起接。

## 5. C5：审批桥与真实验证

- **已做**：`PrologueAgentAdapter` 接受 `approvals` 桥。挂上之后 `text-edit` 才从 `unsupported`
  变成支持，且 Run 停下等的每一笔副作用先进宿主审查队列。
- **`command` 不随桥变**：跑命令还要读回执，这个 adapter 的端口没有回执来源。
  报成支持会让终端页显示可用而每次读都失败。要打开它，先给 adapter 一个回执来源。
- 用真实 Provider 跑一次完整 Run，验证参数组装。今天只有编译器对着 SDK 类型检查过。
- CLI 的写入要打开，需要一个 permission-prompt 工具把询问转回宿主队列；不做这个就保持不支持。

## 6. 全程判据

平台那边定下、这里同样适用的一条：**没接通的东西不能报成支持。**

具体到 Coding：能力矩阵里 `unsupported` 就是真不可用；用量没报显示未知不填 0；
批准不等于已发生；只读档下「应用」是真不可用而不是点了没反应；
浏览器页和终端页在 Capability 注册前显示为真实不可用。

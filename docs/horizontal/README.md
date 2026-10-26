# Horizontal Services

`horizontal/` 目录下有九个包，分两类（定义见[系统架构 §3](../system/ARCHITECTURE.md)，逐包清单见 [SSOT-MATRIX §6](../SSOT-MATRIX.md)）。

**横向运行服务**是多种业务都会复用的可靠运行能力。它保存 cursor、lease、retry、process handle 等可恢复技术状态，但不拥有正式业务事实，也不替 Module 做业务决定。

- [Connector Host](connector-host.md)：建立和维护 Provider 连接。
- [Listener Host](listener-host.md)：持续接收 Raw Event，并可靠投递 Signal Draft。
- [Scheduler](scheduler.md)：到点唤醒一个已注册 Capability。
- [Runtime Host](runtime-host.md)：启动、恢复、停止和观察 Runtime。
- [Agent Host](agent-host.md)：注册 Agent Runtime、申报能力矩阵、授权一次 Run，并持有副作用审批队列。

**平台产品服务**承载跨插件的产品行为，可以持有跨插件的策略和本服务自己的机制记录，但不拥有任何插件或 Module 的业务事实：对象事实总向所有者读取，策略不改写所有者的数据。它们的能力以系统动作登记在同一个动作目录里。代码目录暂留在 `horizontal/` 下。

- [Search](search.md)：发现插件的搜索来源，维护可重建的索引，按调用者权限回答搜索。
- [Knowledge](knowledge.md)：项目里所有 Agent 共用的资料查找与读取，经搜索找、向对象主人读，用调用者的授权。
- [Memory](memory.md)：个人与项目记忆的开关、写入门、召回、候选、最近变动与撤销。
- [Placement](placement.md)：对象放在哪里、谁能看到、和哪些工作有关，以及移动、复制、转成。

情境排序（`packages/kernel/src/contextual.ts`）同属平台产品服务，位置不变，合同与边界见 [action-architecture §3 的复核小节](../../specs/action-architecture/spec.md)。它是纯函数，只给工作台的选区条用，不登记成系统动作：只有工作台的 HTTP 传输（`/api/contextual/*`），准备输入与上报信号都经调用者自己的动作，判断只排序、不执行；删除条件是助理、工作流、MCP 或插件要用情境推荐时，把它做成只读的系统动作。与内核核心的边界见 [内核 README](../../packages/kernel/README.md)。

完整逐包 Contract 见架构 Spec 第 21 节。Module 可直接通过 service capability contract 调用这些能力，不必把所有正常调用绕成事件。各服务在端到端调用里的位置见[调用链](../system/CALL-CHAINS.md)。

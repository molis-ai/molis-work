# Horizontal Services

`horizontal/` 目录下有八个包，分两类（定义见[系统架构 §3](../system/ARCHITECTURE.md)，逐包清单见 [SSOT-MATRIX §6](../SSOT-MATRIX.md)）。

**横向运行服务**是多种业务都会复用的可靠运行能力。它保存 cursor、lease、retry、process handle 等可恢复技术状态，但不拥有正式业务事实，也不替 Module 做业务决定。

- [Connector Host](connector-host.md)：建立和维护 Provider 连接。
- [Listener Host](listener-host.md)：持续接收 Raw Event，并可靠投递 Signal Draft。
- [Scheduler](scheduler.md)：到点唤醒一个已注册 Capability。
- [Runtime Host](runtime-host.md)：启动、恢复、停止和观察 Runtime。
- [Agent Host](agent-host.md)：注册 Agent Runtime、申报能力矩阵、授权一次 Run，并持有副作用审批队列。

**平台产品服务**承载跨插件的产品行为，可以持有跨插件的策略和本服务自己的机制记录，但不拥有任何插件或 Module 的业务事实：对象事实总向所有者读取，策略不改写所有者的数据。它们的能力以系统动作登记在同一个动作目录里。代码目录暂留在 `horizontal/` 下。

- [Search](search.md)：发现插件的搜索来源，维护可重建的索引，按调用者权限回答搜索。
- [Memory](memory.md)：个人与项目记忆的开关、写入门、召回、候选、最近变动与撤销。
- [Placement](placement.md)：对象放在哪里、谁能看到、和哪些工作有关，以及移动、复制、转成。

情境排序（`packages/kernel/src/contextual.ts`）同属平台产品服务，位置不变，合同与边界见 [action-architecture §3 的复核小节](../../specs/action-architecture/spec.md)。

完整逐包 Contract 见架构 Spec 第 21 节。Module 可直接通过 service capability contract 调用这些能力，不必把所有正常调用绕成事件。各服务在端到端调用里的位置见[调用链](../system/CALL-CHAINS.md)。

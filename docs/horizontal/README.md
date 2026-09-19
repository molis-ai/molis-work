# Horizontal Services

Horizontal Service 是多种业务都会复用的可靠运行能力。它保存 cursor、lease、retry、process handle 等可恢复技术状态，但不拥有正式业务事实，也不替 Module 做业务决定。

- [Connector Host](connector-host.md)：建立和维护 Provider 连接。
- [Listener Host](listener-host.md)：持续接收 Raw Event，并可靠投递 Signal Draft。
- [Scheduler](scheduler.md)：到点唤醒一个已注册 Capability。
- [Runtime Host](runtime-host.md)：启动、恢复、停止和观察 Runtime。
- [Agent Host](agent-host.md)：注册 Agent Runtime、申报能力矩阵、授权一次 Run，并持有副作用审批队列。

完整逐包 Contract 见架构 Spec 第 21 节。Module 可直接通过 service capability contract 调用这些能力，不必把所有正常调用绕成事件。

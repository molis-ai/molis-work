# Signals

**白话：** “外部那里发生了什么”。

**拥有：** Signal identity、Source reference、provider dedupe identity、kind、occurred/observed time、规范化 metadata、受控内容引用、revision、supersession/withdrawn 和 validation result。

**公开面：** 查询 Signal；提交 Signal Draft、标记 superseded/withdrawn；发布 Signal accepted/changed 事件。

**不负责：** 不建立 Provider 连接，不保存 listener cursor/lease，不判断是否进入 Feed/Attention/Goal/Automation。Integration Adapter 只能产出 Draft，正式校验与去重由本 Module 完成。

**当前实现与 Goal：** Signals Module 拥有规范化事件与去重；Listener Host 管投递技术状态，Integration Plugin 管 Provider 转换；FD1/FD3/Cutover 已退出旧 src/feed。

**FD1 当前实现：** `@molis-ai/molis-work-module-signals` 已拥有 `signals` 与 `signal_revisions`，Draft 以 Project + Source + provider dedupe identity 接受、去重或递增 revision。GitHub/Gmail 已真实经过这条链；Feed Item 仍是 FD2 的独立事实，不与 Signal 合并。

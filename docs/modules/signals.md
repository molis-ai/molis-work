# Signals

> 物理位置（FI-5）：这一部分的存取代码在 `plugins/native/feed/src/store/`（原来是独立的 `modules/…`、`horizontal/…` 包），表由 Feed 的 `databases.project` 声明；这里描述的合同与行为不变。合同的类型（PG-111，T-110）在 Feed 自己的公开入口 `@molis-ai/molis-work-plugin-feed/contract`（`plugins/native/feed/src/contract/`），不再在平台合同包里；集成插件交出的 `RawEventAdapter` 与公开订阅源拉取的回执 `RssFetchReceipt` 是平台的，在 `@molis-ai/molis-work-contracts/platform/plugin-source-pull`。

**白话：** “外部那里发生了什么”。

**拥有：** Signal identity、Source reference、provider dedupe identity、kind、occurred/observed time、规范化 metadata、受控内容引用、revision、supersession/withdrawn 和 validation result。

**公开面：** 查询 Signal；提交 Signal Draft、标记 superseded/withdrawn；发布 Signal accepted/changed 事件。

**不负责：** 不建立 Provider 连接，不保存 listener cursor/lease，不判断是否进入 Feed/Attention/Goal/Automation。Integration Adapter 只能产出 Draft，正式校验与去重由本 Module 完成。

**当前实现与 Goal：** Signals Module 拥有规范化事件与去重；Listener Host 管投递技术状态，Integration Plugin 管 Provider 转换；FD1/FD3/Cutover 已退出旧 src/feed。

**FD1 当前实现：** `SignalsModule`（`plugins/native/feed/src/store/signals.ts`）已拥有 `signals` 与 `signal_revisions`，Draft 以 Project + Source + provider dedupe identity 接受、去重或递增 revision。GitHub/Gmail 已真实经过这条链；Feed Item 仍是 FD2 的独立事实，不与 Signal 合并。

# Feed

**定位：** 用户可浏览的信息条目、归档和处置事实的唯一 owner。

**拥有：** Feed Item、来源 Signal reference、排序/可见状态、read/archive/disposition、用户保存或 promotion intent 的来源记录。

**公开面：** 查询 Feed；接收 Signal 后创建/更新条目；read/archive/dismiss/promote；发布 Feed Item 和 disposition 事件。

**不负责：** 不监听 Provider，不拥有 Source/Signal，不直接创建 Goal/Artifact/Action；promotion 调用目标 Module Command 并保存返回引用。不建立额外 Feed Router package。

**当前实现与 Goal：** Feed Module 拥有 Item、Material 与条目事件，Native Feed 拥有用例和 UI，Local Host 装配连接与 Adapter；FD2/FD4/Cutover 已删除旧 Feed Store 和入口。

**FD2 当前实现：** `FeedModule` 已成为 `feed_items` / `feed_materials`、Signal revision reference、read/archive/disposition 和 Feed 事件的唯一写入者。Web 与插件只走 public Query / Command。

**处置与 Inbox：** 一条 Item 可以同时因几个原因在 Inbox 里（手动加入、来源规则、捕捉产物失败）。归档、保存、开始处理、升格和恢复对这条 Item 所有未关闭的 Inbox 条目一并生效，与 Item 在同一事务里。已忽略的 Item 只能先恢复；手动、工作流和规则都不能把它再放进 Inbox，来源再次看到它也不会，它已关闭的条目也不能被重新打开，捕捉产物失败也不再为它记新的条目。没有 Signal 的来源（例如原地重发的研究包）用 `refresh` 声明内容变了，Item 与它的 Material 在同一事务里一起更新，不会出现新材料配旧正文。

**删除来源与本地正文：** 「连同本地历史删除」除了删掉来源的 Item、Material、拉取记录和故障条目，还删掉这些拉取留在 Home 证据库里的加密正文，以及 SEL 为每次拉取保存的记录。证据库按内容寻址、整个 Home 共用，所以只删没有人再引用的：本项目其他来源的 Material、任何项目的 Material、任何项目里尚存的拉取收据（收据的 `content_refs` 记着这次拉取的 SEL 记录持有的正文，包括没有生成 Item 的和中断的拉取）都算引用。Home 里有任何一个项目库读不出来时，无法证明无人引用，正文一律保留，并在事件 `feed_source.history_released` 里记 `complete: false`。「删除来源，保留历史」不动正文和记录。

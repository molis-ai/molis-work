# Feed

**定位：** 用户可浏览的信息条目、归档和处置事实的唯一 owner。

**拥有：** Feed Item、来源 Signal reference、排序/可见状态、read/archive/disposition、用户保存或 promotion intent 的来源记录。

**公开面：** 查询 Feed；接收 Signal 后创建/更新条目；read/archive/dismiss/promote；发布 Feed Item 和 disposition 事件。

**不负责：** 不监听 Provider，不拥有 Source/Signal，不直接创建 Goal/Artifact/Action；promotion 调用目标 Module Command 并保存返回引用。不建立额外 Feed Router package。

**当前实现与 Goal：** Feed Module 拥有 Item、Material 与 schema 迁移收据，Native Feed 拥有用例和 UI，Local Host 装配连接与 Adapter；FD2/FD4/Cutover 已删除旧 Feed Store 和入口。

**FD2 当前实现：** `FeedModule` 已成为 `feed_items` / `feed_materials`、Signal revision reference、read/archive/disposition 和 Feed 事件的唯一写入者。旧 `FeedStore` 与 Web 查询只能走 public Query / Command；FD4 再移除剩余 UI facade。

**处置与 Inbox：** 一条 Item 可以同时因几个原因在 Inbox 里（手动加入、来源规则、捕捉产物失败）。归档、保存、开始处理、升格和恢复对这条 Item 所有未关闭的 Inbox 条目一并生效，与 Item 在同一事务里。已忽略的 Item 只能先恢复；手动、工作流和规则都不能把它再放进 Inbox，来源再次看到它也不会。没有 Signal 的来源（例如原地重发的研究包）用 `refresh` 声明内容变了，Item 与它的 Material 在同一事务里一起更新，不会出现新材料配旧正文。

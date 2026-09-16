# Feed

**定位：** 用户可浏览的信息条目、归档和处置事实的唯一 owner。

**拥有：** Feed Item、来源 Signal reference、排序/可见状态、read/archive/disposition、用户保存或 promotion intent 的来源记录。

**公开面：** 查询 Feed；接收 Signal 后创建/更新条目；read/archive/dismiss/promote；发布 Feed Item 和 disposition 事件。

**不负责：** 不监听 Provider，不拥有 Source/Signal，不直接创建 Goal/Artifact/Action；promotion 调用目标 Module Command 并保存返回引用。不建立额外 Feed Router package。

**当前实现与 Goal：** Feed Module 拥有 Item、Material 与 schema 迁移收据，Native Feed 拥有用例和 UI，Local Host 装配连接与 Adapter；FD2/FD4/Cutover 已删除旧 Feed Store 和入口。

**FD2 当前实现：** `FeedModule` 已成为 `feed_items` / `feed_materials`、Signal revision reference、read/archive/disposition 和 Feed 事件的唯一写入者。旧 `FeedStore` 与 Web 查询只能走 public Query / Command；FD4 再移除剩余 UI facade。

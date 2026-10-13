# Sync & Replication

**定位：** 本地对象的发布意图、Personal/Team replica 关系、冲突和用户可见同步状态的唯一 owner。

**拥有：** publication intent、目标 Team Project、local/remote/materialized version、replica relationship、冲突、等待 consumer 和用户处置决定。

**公开面：** 查询同步/冲突状态；发布 Goal/Artifact、接收 Envelope、重试、确认 materialization、解决冲突；发布同步状态事件。

**不负责：** 不实现 ACK、Cursor、Replay、CAS 或 Blob 传输，这些属于 Exchange；不直接写 Goals/Artifacts Store；不自动同步 Plugin 私有草稿或缓存。

**当前状态：** 无实现，也没有包（占位包已删除）；真正同步功能需要未来独立 Spec。

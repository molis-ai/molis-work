# Sync & Replication

**定位：** 本地对象的发布意图、Personal/Team replica 关系、冲突和用户可见同步状态的唯一 owner。

**拥有：** publication intent、目标 Team Project、local/remote/materialized version、replica relationship、冲突、等待 consumer 和用户处置决定。

**公开面：** 查询同步/冲突状态；发布 Goal/Artifact、接收 Envelope、重试、确认 materialization、解决冲突；发布同步状态事件。

**不负责：** 不实现 ACK、Cursor、Replay、CAS 或 Blob 传输，这些属于 Exchange；不直接写 Goals/Artifacts Store；不自动同步 Plugin 私有草稿或缓存。

**当前状态：** 无实现，也没有包（占位包已删除）；真正同步功能仍待设计与实现。[团队协作需求](../../specs/team-collaboration/spec.md)已确定按项目明确共享、个人内容不自动公开；团队副本沿原计划接在个人同步之后，团队首版还需实时共同编辑，整份副本同步不替代协作编辑；领域编辑语义与公共协作合同须和原内容主人对齐，发布范围、离线撤权和冲突处理继续细化，不能把已有个人同步候选当作团队同步已完成。

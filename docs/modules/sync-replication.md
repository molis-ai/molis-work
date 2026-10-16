# Sync & Replication

Workflows 已注册流程定义与运行历史；从其他设备恢复的实例仅可查看，不会获得继续执行或停止原实例的权限。Jelly 已注册个人工作区中的日历、笔记和关联；导入凭据及本机撤销/预览状态不上传。

本机个人同步当前实际注册：Goals、Pages、内嵌 Artifact、Form（含答卷）、Dataset（含保存版本）、PPT、Lingguang（含完整对话）、Workflows（流程及运行历史）、Jelly（日历及笔记）、Todo（待办及历史）、Issues（问题记录及小型内嵌图片）。Goals 按项目恢复目标、关系、规则、工作记录、结构提案、可信决定及关联引用；本机历史序号通过稳定事件 ID 转换。新增 owner 的 `AggregateDefinition` 或自有适配器指定字段、子记录、领域校验、编辑版本和恢复依赖，公共 storage 处理事务日志及冲突，Host 只做身份与目录装配。仍不包含全部插件、大型二进制附件或运行任务；逐项覆盖见 [当前实现清单](../../specs/personal-plugin-replication/spec.md)。

**定位：** 本地对象的发布意图、Personal/Team replica 关系、冲突和用户可见同步状态的唯一 owner。

**拥有：** publication intent、目标 Team Project、local/remote/materialized version、replica relationship、冲突、等待 consumer 和用户处置决定。

**公开面：** 查询同步/冲突状态；发布 Goal/Artifact、接收 Envelope、重试、确认 materialization、解决冲突；发布同步状态事件。

**不负责：** 不解释插件资产字段、不直接写 Goals/Artifacts Store，不同步密钥、运行任务或未声明的私有缓存。持久队列由 storage 提供，资产语义由 owner 适配器验证；Blob 传输尚未接入。

**当前状态：** `modules/sync-replication` 已提供个人空间配置缓存、协调收发、重试和冲突入口；Rust Worker/D1 负责 Auth 身份校验、空间隔离、远端日志、幂等和 CAS。以上集合默认关闭、仅显式启用 localhost 联调。项目分区先提交业务与回执，再推进集合游标；缺少关联资产持久等待，下轮重试。Goal 同一项目两端编辑时保留双方供选择，不自动合并关系和决定；项目 Goal 聚合仍受 512 KiB 上限约束。还没有公网部署、完整项目生命周期、附件或第三方 Runtime 私有状态同步。见 [Goal 同步阶段](../../specs/personal-goals-sync/spec.md) 和 [启动说明](../../apps/sync-worker/README.md)。

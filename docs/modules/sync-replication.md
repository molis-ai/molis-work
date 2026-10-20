# Sync & Replication

设备控制：自动同步按本机与账号 Home 保存在 `sync/device.json`，和云端 `SpaceSyncPolicy` 分离。首次选择前不后台传输，立即同步仅一轮，保存集合不打开设备开关；已开启设备在个人空间恢复时续接，退出或切回本地空间停止。可信 Host 可配置 HTTPS 同步来源或固定本机联调，代码支持不等于已部署正式云端。

2026-10-17 已确认的联网个人版目标和实施阶段见[个人云同步总规格](../../specs/personal-cloud-sync/spec.md)。D1 结构化保留版本和私有 R2 附件/预留共用 100000000 字节原子配额，幂等不重复计量，满额仍收取更新和发送独立删除。当前内容投影消费者包括 Artifact 原件/正文、Goal 聚合、Pages/Issue 内嵌图片、Images 保存终态图片及 Cognia 固定知识图/历史/原件；已登记的其他 DTO 使用 SDK 内容切片。D1 新库基线 `sync_schema.version=4`，本机 `sync/sync.db` 基线 v5；旧版只拒绝，不在请求内升级，也未维护真实库。

逐项永久错误持久隔离并显式重试，临时接收失败保留原事件并每轮重试至多 20 条，同集合健康资产继续；回执不前移下载游标，旧事件不能复活较新 head。服务端已有 30 天通用回收、恢复/确认永久删除、分代 R2 清理、24 小时未引用预留到期、限流和有界旧传输事件压缩的隔离验证。未采用冲突版本目前仅保存在本机技术历史，完整跨端恢复、各 owner 嵌套删除和完整项目生命周期仍未完成，不能据此称全部回收功能已交付。

Workflows 已注册流程定义与运行历史；从其他设备恢复的实例仅可查看，不会获得继续执行或停止原实例的权限。Jelly 已注册个人工作区中的日历、笔记和关联；导入凭据及本机撤销/预览状态不上传。

本机个人同步当前实际注册：Goals、Pages、Artifacts、Form（含答卷）、Dataset（含保存版本）、PPT、Lingguang（含完整对话）、Workflows（流程及运行历史）、Jelly（日历及笔记）、Todo（待办及历史）、Issues（问题记录及图片）、Schedule 会话任务、Character 草稿、Feed 捕捉规则、Images 保存结果及 Cognia 知识。Goals 按项目恢复目标、关系、规则、工作记录、结构提案、可信决定及关联引用；本机历史序号通过稳定事件 ID 转换。新增 owner 的 `AggregateDefinition` 或自有适配器指定字段、子记录、领域校验、编辑版本和恢复依赖，公共 storage 处理事务日志及冲突，Host 只做身份与目录装配。仍不包含全部插件或运行任务，未接入的附件 owner 不获得隐式路径扫描；逐项覆盖见 [当前实现清单](../../specs/personal-plugin-replication/spec.md)。

**定位：** 本地对象的发布意图、Personal/Team replica 关系、冲突和用户可见同步状态的唯一 owner。

**拥有：** publication intent、目标 Team Project、local/remote/materialized version、replica relationship、冲突、等待 consumer 和用户处置决定。

**公开面：** 查询同步/冲突状态；发布 Goal/Artifact、接收 Envelope、重试、确认 materialization、解决冲突；发布同步状态事件。

**不负责：** 不解释插件资产字段、不直接写 Goals/Artifacts Store，不同步密钥、运行任务或未声明的私有缓存。持久队列由 storage 提供，资产语义由 owner 适配器验证；公共 Blob 传输由 owner 显式提供内容引用。

**当前状态：** `modules/sync-replication` 已提供个人空间配置缓存、协调收发、重试和冲突入口；Rust Worker/D1 负责 Auth 身份校验、空间隔离、远端日志、幂等、CAS 和容量账本。默认不连接，目的地由可信 Host 配置；正式配置样例未绑定真实资源。项目分区先提交业务与回执，再推进集合游标；缺少关联资产持久等待，下轮重试。Goal 同一项目两端编辑时保留双方供选择，不自动合并关系和决定；大于 64 KiB 的项目聚合通过 1 MiB 内容块存入私有 R2，完整校验后一次恢复原 owner 事实，最多 100000000 字节且受账号剩余额度约束。还没有公网部署、完整项目生命周期、全部附件 owner 或第三方 Runtime 私有状态同步。见 [Goal 同步阶段](../../specs/personal-goals-sync/spec.md) 和 [启动说明](../../apps/sync-worker/README.md)。

# Artifacts

**定位：** 两套固定版本库的唯一 owner：成果库（人要留存、引用的结果）与过程项（插件之间交接的数据），及其内容引用。两者使用同一套版本规则，各自的表、事件和可见位置分开。

**拥有：** `artifact_id + version`、Artifact Type、schema version、content/blob references、metadata、producer provenance、scope、可用性、生命周期和 supersession。

**公开面：** 按精确 `artifact_id + version` 查询/读取、列出 lineage 和类型；注册 Plugin 明确提供的新版本、标记内容不可用、归档精确版本、判断 consumer 是否兼容；发布 Artifact 生命周期事件。

**不负责：** 不依赖生产或消费它的 Plugin implementation；不把 producer identity 当消费依赖；不拥有跨对象关系、传输 ACK/Cursor 或 Plugin 私有草稿。

**特殊边界：** 成果库的界面与入口是内置的 Native Artifacts 插件，它和其他内置插件一样由官方签名发布；本 Module 只保存事实。消费兼容性由 `artifact_type_id + schema_version` 判断，来源由 `producer_plugin_id + version` 审计。

**版本规则：** 平台不再区分“可变/不可变 Artifact”，也不维护 canonical head。生产 Plugin 自己提供严格递增的整数 version；同一 `artifact_id + version` 的相同重放是幂等，不同 envelope 不能覆盖。精确引用永远使用 ID 和 version 两个值。

**内容规则：** 小内容可以是任意可往返 JSON，平台只做规范化、摘要和保存，不解释字段。大内容保存 Storage/Blob reference、摘要和大小。没有安装兼容 consumer 时仍能保存、同步和重放，只是不能在本地解释。

**个人与 Team：** 本地 Plugin 新建 Artifact 默认是 personal。只有用户在 Plugin 内明确选择共享，或 Team Plugin 已获得 Team 授权，才能注册 `team_project` 版本；同步机制由 Exchange/Sync 负责，不由本 Module 实现。

**当前实现：** 成果库（`library_artifacts` / `library_artifact_versions`，人要留存、引用的固定版本）与过程项（`process_items` / `process_item_versions`，插件之间交接的数据）两套版本库，同一套版本/owner/digest/scope 校验；类型由 manifest 的 `artifacts.produces` 与 `process_items.produces` 声明，宿主拒绝未声明的写入。过程项不进成果库、侧栏文件和搜索。旧代码的字符串引用不会被猜测回填；其浏览、下载和明确转换归 Native Artifacts 插件。

**文档导入：** Native Artifacts Plugin 可将 Notion、飞书/Lark docx、Google Docs 或本地 Markdown/TXT/HTML 转成 `io.molis.work.document` v1 的个人正文快照。读取外部 API 由官方 catalog integration 负责，凭据与 HTTP 由 Local Host 注入；本 Module 继续只保存通用 Artifact 事实，不理解文档供应商、不抓取外部内容、不承担同步。使用入口、版本规则和格式限制见 [Artifact Plugin README](../../plugins/native/artifacts/README.md#从文档工具导入)。

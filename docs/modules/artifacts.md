# Artifacts

**定位：** 两套固定版本库的唯一 owner：成果库（人要留存、引用的结果）与过程项（插件之间交接的数据），及其内容引用。两者使用同一套版本规则，各自的表、事件和可见位置分开。

**拥有：** `artifact_id + version`、Artifact Type、schema version、content/blob references、metadata、producer provenance、scope、可用性、生命周期和 supersession。

**公开面：** 按精确 `artifact_id + version` 查询/读取、列出 lineage 和类型；注册 Plugin 明确提供的新版本、标记内容不可用、归档精确版本、判断 consumer 是否兼容；发布 Artifact 生命周期事件。

**不负责：** 不依赖生产或消费它的 Plugin implementation；不把 producer identity 当消费依赖；不拥有跨对象关系、传输 ACK/Cursor 或 Plugin 私有草稿。

**特殊边界：** 成果库的界面与入口属于平台，在 `apps/workbench/src/artifacts/` 经 UiHost 挂载；Host 登记平台动作，Module 保存唯一事实与原件。界面只接收投影，不打开 Store。消费兼容性由 `artifact_type_id + schema_version` 判断，来源由 `producer_plugin_id + version` 审计。

**版本规则：** 平台不再区分“可变/不可变 Artifact”，也不维护 canonical head。生产 Plugin 自己提供严格递增的整数 version；同一 `artifact_id + version` 的相同重放是幂等，不同 envelope 不能覆盖。精确引用永远使用 ID 和 version 两个值。

**内容规则：** 小内容可以是任意可往返 JSON，平台只做规范化、摘要和保存，不解释字段。大内容保存 Storage/Blob reference、摘要和大小。没有安装兼容 consumer 时仍能保存、同步和重放，只是不能在本地解释。

**个人与 Team：** 本地 Plugin 新建 Artifact 默认是 personal。只有用户在 Plugin 内明确选择共享，或 Team Plugin 已获得 Team 授权，才能注册 `team_project` 版本；同步机制由 Exchange/Sync 负责，不由本 Module 实现。

**归属：** 版本的生产者（工作流、Agent、MCP 客户端、人）记在 `created_by`；归属 `owner_actor_id` 另给。一个人的 Home 装配 `homeOwner` 后，这个 Home 里的个人成果一律归这个人，不论谁生产，也不要求读它的行为者就是生产者；固定与导入端口传本机的人。已存的、归在行为者名下的身份读作这个人的，不迁移数据。`team_project` 仍归共享它的行为者。

**当前实现：** 成果库（`library_artifacts` / `library_artifact_versions`，人要留存、引用的固定版本）与过程项（`process_items` / `process_item_versions`，插件之间交接的数据）两套版本库，同一套版本/owner/digest/scope 校验；类型由 manifest 的 `artifacts.produces` 与 `process_items.produces` 声明，宿主拒绝未声明的写入。过程项不进成果库、侧栏文件和搜索。旧代码的字符串引用不会被猜测回填；其浏览、下载和明确转换归平台成果界面。

**文档导入：** 平台成果库可将 Notion、飞书/Lark docx、Google Docs 或本地 Markdown/TXT/HTML 转成 `io.molis.work.document` v1 的个人正文快照。读取外部 API 由官方 catalog integration 负责，凭据与 HTTP 由 Local Host 注入；本 Module 继续只保存通用 Artifact 事实，不理解文档供应商、不抓取外部内容、不承担同步。从成果目录选择「导入文档」，选择已有连接或本地文件，再保存正文快照；在线内容变化时新增版本，旧版本与精确引用保留。HTML 在可终止 worker 中解析，原文件及正文均受 2 MiB 限制。取消、撤权或提供方撤下不新增版本。真实在线账号联调与本人验收仍未建立。

## 从文档工具导入

在项目的 Artifacts 目录点击「导入文档」，选择来源、粘贴文档链接或选择文件，然后点击导入。成功后可打开精确版本阅读正文、查看来源并导出版本 JSON。在线来源复用「设置 → 连接器」中的凭据，不需要在导入页粘贴密钥。

| 来源 | 支持内容 | 连接要求 |
| --- | --- | --- |
| Notion | 单个页面的 Markdown 正文 | Notion 连接有读取权限，且页面已共享给该连接 |
| 飞书 / Lark | 新版 docx 文档、指向 docx 的知识库节点，纯文本正文 | 各自区域的自建应用 `app_id:app_secret`；文档读取及共享权限；知识库另需节点读取权限 |
| Google Docs | 单个 Google 文档，纯文本正文 | Google Drive 访问令牌，含 `drive.readonly` 或适用于该文件的 `drive.file` 权限 |
| 本地文件 | 任何文件；`.md`/`.markdown`/`.txt`/`.html`/`.htm` 读出正文（UTF-8，最多 2 MB），其他文件保存原件（最多 6 MB） | 无需连接 |

每次导入都是当前正文的个人快照。在线同源文档内容变化时新增版本，旧版本和精确引用保留；相同快照复用当前可用版本。本地文件按文件名和内容标识，同名但内容不同的文件保存成独立 Artifact，避免误覆盖。HTML 提取为 Markdown 文本，同时在版本数据中保留原 HTML。

当前不递归导入整个空间、数据库、子页面或附件文件，不自动同步和回写。Google Docs / 飞书 / Lark 的排版、图片、附件、评论及嵌入内容不承诺保留；Notion 的附件链接可能到期。非文本类的本地文件（如 PDF、DOCX、ZIP）只保存原件、不读出正文，可读预览由 `artifacts.documents.preview` 提供。空正文、超限、权限错误和 Notion 明确返回的截断结果不会产生成功 Artifact。

实现分工：本插件编排导入并通过 `ArtifactsApplicationApi` 注册 `io.molis.work.document` v1；官方 catalog integration 只读取文档工具 API；Local Host 读取凭据、校验本地控制请求并注入端口。没有新增存储表、后台同步任务或跨插件私有存储。

官方接口依据：[Notion 页面 Markdown](https://developers.notion.com/reference/retrieve-page-markdown)、[飞书获取文档纯文本](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)、[Google Drive 文档导出](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)。

包名：`@molis-ai/molis-work-plugin-artifacts`。工作区内部包，通过仓库构建和 Host 装配使用。

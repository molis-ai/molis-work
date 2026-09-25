# Pages 文档入口

本机文档：列表、写作、自动保存、块、评论、卡、挂 Goal 与 Promote。数据在 `{home}/pages/pages.db`。编辑器用 ProseMirror，单独打成浏览器脚本，不进工作台 factory 字符串。

`pages.generate` 接收调用方已解析的材料快照，通过同一模型配置执行；缺少模型时目录及调用明确拒绝，不生成占位文稿。插件内部的 `generatePagesFromMaterials` 通过短 Store 操作保存 `page_generations`，不跨模型等待持有数据库。历史按项目和请求保存要求、采用版本、错误和文稿 ID；失败或取消保留快照，重试成功后返回原文稿，不覆盖手工编辑。Workbench 的 Inbox 提供材料选择、要求与恢复入口，生成不会自动完成 Inbox。编辑器与 MCP 的 AI 使用统一文字模型配置；候选正文由用户确认或后续创建/修改动作保存。生成前后核对文档版本和取消状态，过期候选不提交。

包名：`@molis-ai/molis-work-plugin-pages`。

导入入口在 Pages 文档列表的「导入」。支持 Notion 的 Markdown & CSV / HTML ZIP 导出包，飞书等工具导出的 DOCX、Markdown，以及通用 HTML、TXT、CSV。先预览、查看转换提示并勾选文档，再导入当前项目的指定文件夹；可继续编辑、自动保存。保留常用文字格式、列表、待办、表格和代码。导入只创建新文档；一次批量写入使用事务，同一请求重试不会覆盖手工编辑或重复创建。

边界：目前为文件导入，不连接来源账号、不抓取私有链接、不持续同步。ZIP 中的文档平铺到所选文件夹，不重建子页面树；相对链接保留路径说明，不自动转为 Pages 引用。当前编辑器没有图片/附件块，导入会转换为安全链接或文字说明并提示；评论、权限、历史版本不迁移。PDF、旧版 `.doc` 不支持，请从来源导出为 DOCX / Markdown / HTML。上传总计最多 10 MiB，每篇文本最多 1 MB，压缩包单项最多 5 MiB、展开合计最多 20 MiB，每批最多 100 篇。

接口：`POST /api/pages/import/preview` 接收 `project_id` 和 `files: [{name, data}]`（base64）；`POST /api/pages/import` 增加 `selected_keys`、`folder_id`、稳定的 UUID `request_id`。Host 对外沿用 `/api/plugins/pages/...` 路由。预览不写入，提交重新解析并验证，转换只在本机进行。

不改 Goal 树。Promote 经 Host 发出个人 Artifact。已登记对外 MCP（`mcp_exports`），默认关；Host 从绑定项目注入分区，作者步骤见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

动作服务迁移：插件自己的 `actions.ts` 声明并实现 18 项公开业务能力（文档、文件夹、模板、文件导入、已解析材料保存、生成及历史、写作、提取、发布）。Manifest 注册这些能力和四项内容交接合同；Host 组合原 Store、模型和 Artifact owner，HTTP 不再自行打开文档库。工作流内容处理器调用同一业务动作并保留调用者身份与权限。旧八个 MCP 名称从动作合同派生并薄转发；旧 list 组合模板查询，旧 translate_new 组合候选生成和新建文档，保留原响应语义。

内部与 MCP 的项目来自可信调用上下文；HTTP 的项目由 Host 绑定，query/body 中声明不同项目会拒绝。`pages.update` 接受 `expected_version`，编辑器自动使用服务器版本，冲突保留草稿并阻止离开。提取任务/知识页和删除文件夹各自在原 SQLite 库事务内完成。原表、文档 ID、导入请求和历史均保留。

Inbox 通过 `pages.generations.get/list`、`pages.get` 和 `pages.generate` 读写文稿；项目上下文采纳通过 `pages.documents.import` 保存来源与摘要。`request_id` 与 `request_hash` 表示调用方已确认的稳定意图，保留旧值以支持历史重试，不用它们证明权限或来源。旧 board 分区仅在原项目目录证明唯一归属时，事务迁移到 canonical project_id；保留文档和请求 ID、快照、编辑与引用，冲突或仍在生成则保留原数据并明确拒绝。

`pages.promote` 在原 `pages` 行保存未完成发布快照后才调用 Artifact owner；失败后继续原快照和版本。已存成 Artifact、尚未回写文稿关联时，重试读取并核对原 Artifact，恢复关联而不重复发布。旧版中断记录没有快照时也从原 Artifact 恢复。完成关联与清除快照在同一文稿事务提交，保留后续正文和 Goal 编辑；其他发起者不能冒充原 owner 恢复。

列表和编辑器从 `publication_pending` 显示“继续保存上次成果”，恢复成功明确说明当前编辑仍保留。客户端传 `expected_version`，过期请求不会再创建一版；旧客户端不传版本时继续保留每次明确调用新增版本的语义。返回 `recovered` 表示恢复上次成果。此迁移只新增可空列，不搬移原数据；降级前应完成未结束的发布，旧版代码无法识别新快照，不能安全地继续这些请求。

标准 MCP 的查询、写入、AI、生成、历史及发布中断恢复有独立 stdio 客户端验证；生产客户端授权管理和系统生命周期仍属于系统服务未完成范围，测试启动授权不能替代它。

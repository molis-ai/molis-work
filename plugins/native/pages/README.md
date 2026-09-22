# Pages 文档入口

本机文档：列表、写作、自动保存、块、评论、卡、挂 Goal 与 Promote。数据在 `{home}/pages/pages.db`。编辑器用 ProseMirror，单独打成浏览器脚本，不进工作台 factory 字符串。

`generatePagesFromMaterials` 接收 Host 已解析的材料快照与真实完成模型；没有模型时保存失败记录并报错，不生成占位文稿。`page_generations` 按项目和请求保存要求、采用版本、错误和文稿 ID；重试成功后返回原文稿，不覆盖手工编辑。Workbench 的 Inbox 提供材料选择、要求与恢复入口，生成不会自动完成 Inbox。既有编辑器 AI 也由 Host 注入模型；对外 MCP 的模型接线未在本切片验证。

包名：`@molis-ai/molis-work-plugin-pages`。

导入入口在 Pages 文档列表的「导入」。支持 Notion 的 Markdown & CSV / HTML ZIP 导出包，飞书等工具导出的 DOCX、Markdown，以及通用 HTML、TXT、CSV。先预览、查看转换提示并勾选文档，再导入当前项目的指定文件夹；可继续编辑、自动保存。保留常用文字格式、列表、待办、表格和代码。导入只创建新文档；一次批量写入使用事务，同一请求重试不会覆盖手工编辑或重复创建。

边界：目前为文件导入，不连接来源账号、不抓取私有链接、不持续同步。ZIP 中的文档平铺到所选文件夹，不重建子页面树；相对链接保留路径说明，不自动转为 Pages 引用。当前编辑器没有图片/附件块，导入会转换为安全链接或文字说明并提示；评论、权限、历史版本不迁移。PDF、旧版 `.doc` 不支持，请从来源导出为 DOCX / Markdown / HTML。上传总计最多 10 MiB，每篇文本最多 1 MB，压缩包单项最多 5 MiB、展开合计最多 20 MiB，每批最多 100 篇。

接口：`POST /api/pages/import/preview` 接收 `project_id` 和 `files: [{name, data}]`（base64）；`POST /api/pages/import` 增加 `selected_keys`、`folder_id`、稳定的 UUID `request_id`。Host 对外沿用 `/api/plugins/pages/...` 路由。预览不写入，提交重新解析并验证，转换只在本机进行。

不改 Goal 树。Promote 经 Host 发出个人 Artifact。已登记对外 MCP（`mcp_exports`），默认关；Host 从绑定项目注入分区，作者步骤见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

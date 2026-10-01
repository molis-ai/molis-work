# Cognia 导入兼容边界

官方格式核实于 2026-09-23。下表确认导入路径，不代表完成过各原 App 的往返迁移测试。Cognia 是单向快照，不修改源库。

| 工具 / 方法 | 使用方式 | 本次边界 |
| --- | --- | --- |
| Obsidian | 直接选择 vault 目录 | 保留 Markdown、frontmatter、title/tags/aliases、相对双链与附件。忽略 `.obsidian`；不执行 Dataview，不还原 Canvas。 |
| LLM Wiki | 选择包含材料及 wiki 的目录 | 这是整理方法，不是专有格式。识别 raw/wiki/index/log 的常见角色，但不要求固定布局；AGENTS/CLAUDE 始终是材料。 |
| Logseq OG 文件图 | 选择 Markdown 目录 | `key:: value`、`((block UUID))` 保留原文，不解析块引用。EDN/数据库不是支持格式。 |
| Logseq DB | 先导出标准 Markdown | 标准 MD 导出不保留 block properties。 |
| Notion | 导出 Markdown & CSV，解压后选目录 | 保留子页路径和附件；CSV 数据库、关系、公式和视图不还原，CSV 回执标为不支持。 |
| Joplin | 导出 Markdown + Front Matter | 保留导出 metadata 和 `_resources/` 附件，不直读 SQLite/JEX。 |
| 思源 | 导出 Markdown + assets | 可由导出设置包含 YAML 属性、相关文档、块引用展开；Cognia 不直读 `.sy` JSON AST 或 workspace。 |
| Anytype | 导出 Markdown，包含关联对象及文件 | 按实际导出保留属性原文、类型与附件；不还原对象查询/视图。 |
| Bear | 导出 Markdown 或 TextBundle v2 | TextBundle 目录中的 `text.md`/assets 可读，info.json 明确跳过；可先在 Bear 开启 Keep tags during export。 |
| Apple Notes | Export To → Markdown | 选择导出目录，不读取 Notes 私有数据库。 |
| Evernote / OneNote | 先转换为 Markdown | ENEX/HTML、OneNote 专有 notebook/PDF 无专用解析；PDF 可保留为原始附件，不承诺文本提取。 |

所有正文仅接受 UTF-8 `.md`、`.markdown`、`.txt`。图片、PDF、常见音视频可作为原始附件下载；HTML/SVG 不执行，SVG 下载以 attachment + octet-stream 返回。未知格式、符号链接、隐藏目录和超限项均在预览/回执说明。原格式不受支持时不会把零篇导入显示为内容已迁移。

参考官方来源：[Obsidian 存储](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data)、[Obsidian 内部链接](https://help.obsidian.md/links)、[Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)、[Notion 导出](https://www.notion.com/zh-cn/help/export-your-content)、[Joplin 导入导出](https://joplinapp.org/help/apps/import_export/)、[Joplin frontmatter](https://joplinapp.org/help/dev/spec/interop_with_frontmatter/)、[Logseq OG](https://github.com/logseq/og)、[Logseq DB 变更](https://github.com/logseq/docs/blob/master/db-version-changes.md)、[Logseq DB 导出](https://github.com/logseq/docs/blob/master/db-version.md#graph-export)、[思源工作空间](https://github.com/siyuan-note/siyuan/blob/master/docs/WORKSPACE.zh-CN.md)、[思源导出实现](https://github.com/siyuan-note/siyuan/blob/master/kernel/model/export.go)、[Anytype 导入导出](https://doc.anytype.io/anytype/data/import-and-export.md)、[Anytype Markdown 导出版本说明](https://releases.any.org/desktop-047-4)、[Bear 导出](https://bear.app/faq/export-your-notes/)、[Bear 标签导出](https://bear.app/faq/export-your-tags/)、[Apple Notes 导出](https://support.apple.com/guide/notes/import-export-and-print-notes-not201900c07/mac)、[Evernote 导出](https://help.evernote.com/hc/en-us/articles/209005557-Export-Notes-and-Notebooks-as-ENEX-or-HTML)。

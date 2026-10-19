# Knowledge

**白话：** 项目里的任何 Agent 用同一组动作找资料、按分节读原文；资料还是各插件的，这里只指路和代读。

**类别：** 平台产品服务（[系统架构 §3](../system/ARCHITECTURE.md)）。资料目录由插件已声明的搜索来源合成，正文总向所属插件读。位置在 `horizontal/knowledge`。

**提供：** 系统动作 `knowledge.search`（卡片）、`knowledge.outline`（分节与每节一句摘要）、`knowledge.read`（原文一段）、`knowledge.grep`（逐行查字面文字），提供方 `system.knowledge`，权限 `knowledge:read`；本人管理用的 `knowledge.cards`、`knowledge.card.edit`、`knowledge.card.exclude`、`knowledge.organize`（只对 user，权限 `knowledge:manage`）。后台按资料的版本用项目的文字模型整理卡片与大纲（提示词 `knowledge.organize`），每个项目每天有额度。

**技术状态：** Home 的 `knowledge/knowledge.db`：每份资料一张卡片（模型写的与人改的字段分开记）、每天的整理用量。不保存正文；使用回执在后续分期加入（spec §10）。

**不拥有：** 插件的表与正文、搜索索引（`horizontal/search`）、权限授予、模型调用。

**当前来源与 Goal：** `horizontal/knowledge`，Host 装配 `apps/local-host/src/knowledge-actions.ts`。见 `specs/project-knowledge/spec.md`。

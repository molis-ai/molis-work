# Knowledge

**白话：** 项目里的任何 Agent 用同一组动作找资料、按分节读原文；资料还是各插件的，这里只指路和代读。

**类别：** 平台产品服务（[系统架构 §3](../system/ARCHITECTURE.md)）。资料目录由插件已声明的搜索来源合成，正文总向所属插件读。位置在 `horizontal/knowledge`。

**提供：** 系统动作 `knowledge.list`（按来源列出卡片，可带 `related_to` 按相关排）、`knowledge.search`（卡片；每个词都有的不够时补上只有部分词的，标 `related`）、`knowledge.outline`（分节树与每节一句摘要）、`knowledge.read`（原文一段：按节连同子节、按行或按位置）、`knowledge.grep`（逐行查字面文字与备选词，范围是点名的资料、工作目录的路径模式或全项目，可只给哪几份有；只点名一份时用 `from_line` 接着上次的 `next_line` 找）、`knowledge.glob`（按路径模式找项目工作目录里的文件，经宿主的工作目录读取、以调用者的授权）、`knowledge.locate`（项目的文字模型看至多 5 份资料的分节树选节，提示词 `knowledge.locate`，不看正文），提供方 `system.knowledge`，权限 `knowledge:read`；受众是 `user`、`agent`、`workflow`、`mcp`、`plugin`：插件要调，在 Manifest 的 `capabilities.consumes` 里列要用的动作，并在 `permissions` 里声明 `knowledge:read`（样例：`plugins/native/coding/src/manifest.ts`），插件这样读到的是项目所有者的授权范围，回执仍记在插件这次调用名下；本人管理用的 `knowledge.cards`、`knowledge.card.edit`、`knowledge.card.exclude`、`knowledge.organize`（只对 user，权限 `knowledge:manage`）。后台按资料的版本用项目的文字模型整理卡片与大纲（提示词 `knowledge.organize`），每个项目每天有额度。

**技术状态：** Home 的 `knowledge/knowledge.db`：每份资料一张卡片（模型写的与人改的字段分开记）、每天的整理用量、读原文的使用记录（`knowledge.receipts`，30 天）。不保存正文。长资料向支持 `offset` 的读取器一页页读，最多 40 万字；Agent 的一轮（宿主给的 `call_id`）最多拿 6 万字原文，用完返回 `round_chars_left: 0` 与剩余量。

**不拥有：** 插件的表与正文、搜索索引（`horizontal/search`）、权限授予、模型调用。

**当前来源与 Goal：** `horizontal/knowledge`，Host 装配 `apps/local-host/src/knowledge-actions.ts`。见 `specs/archive/project-knowledge/spec.md`。

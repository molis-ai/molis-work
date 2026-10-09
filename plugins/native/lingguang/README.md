# 灵光

本机临时灵感池：先记下还没想清楚的想法，再决定留下或丢掉。数据在 `{home}/lingguang/lingguang.db`。

包名：`@molis-ai/molis-work-plugin-lingguang`。

所有对外读写及对话能力由插件的 `actions.ts` 声明，项目 Runtime 注册。HTTP、工作流内容交接与授权 MCP 适配器共用动作服务；原 URL 只转参数，项目身份由 Host 绑定。

头脑风暴通过 Host 的文字模型接入，使用所选灵光和真实历史。未配置模型时提示连接，不创建占位回复；失败或取消不保存半轮消息。生成期间材料变化会拒绝过期结果。已有 `stub` 历史仍保留，并标记为本地记录。

编辑页的“转为待办”由 Workbench 调 Todo 组合，带上屏幕上的标题和正文（正文作为待办的依据原文）；灵光本身保留。“转成 Jelly 笔记”经放置服务交给 Jelly 的内容站点，笔记里记着它来自这条灵光。

灵光是收想法的唯一地方（2026-10-01，`specs/archive/post-merge-review/spec.md` PMR-22）。“导入文件”“读取链接”经 Host 的文件与网页读取（`lingguang.material.read`、`lingguang.source.read`；文字提取、图片识别、音视频转写，需要下载本机语音模型时先问），读到的文字由用户记成一条灵光；读取本身不保存灵光。带 `?stream=1` 时逐行回报进度，关掉进度框即停止。上传的文件只在提取期间留在内存里（提取器的临时目录随后清除），不保存原始副本；留存的只有用户记成灵光的文字，以及转写用的本机语音模型缓存 `{home}/lingguang/models`。正文上限 20 万字，头脑风暴给模型时每条只带开头一部分。

工作台使用项目路由，自动保存携带版本检查，发送期间防止重复提交。数据保留原 SQLite 表和稳定 ID。对外客户端的正式授权产品仍随系统动作服务迁移推进。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：临时灵感池与围绕灵感的对话。
- 不负责：Goal 与 Artifact 事实、模型提供方、托管服务。
- 公开入口：`@molis-ai/molis-work-plugin-lingguang`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 失败或取消不保存半轮消息；生成期间材料变化时拒绝过期结果。
  - 对话回复声明 `scheduling: "concurrent"`，等模型时不占项目的串行队列。
  - 保留原表与稳定 ID；旧 `stub` 历史标为本地记录。
  - 同一 `request_id` 只代表一次保存：重试同样的内容返回第一次保存的那条（人把它移到别的项目后也一样），换了内容拒绝（`lingguang.request_conflict`），不静默丢掉新内容。请求表结构不变：请求键是 id 加输入指纹。
  - 读取文件或链接只提取文字，不保存上传内容；留存的只有人记下的灵光。
  - 「记下第一条灵光」仍立刻记一条，但离开时内容为空就丢掉（W2-18 决定 6，2026-10-09）：只对本页刚记的空白灵光（不含读文件/链接记下的、已有的空灵光），离开 = 返回列表、打开另一条、再记一条；先向 Host 读一次这条，正文为空且标题没动（或为空）才经既有的 `lingguang.discard` 丢掉，不再问「丢掉这条？」；期间别处写进了字就保留；进了头脑风暴的灵光算在用，保留；读不到或丢不掉都不提示。丢掉仍是软丢弃（记录保留为已丢弃）。
  - 项目被删除时宿主按目录条目上的 `project_data`（`lingguangProjectData`，`src/project-data.ts`：确认框里的标签与 `purgeLingguangProject`）调用清掉灵光、对话与消息，连同请求回执；只读库文件，库不存在时不创建，重复运行没有副作用。
- 改动后必跑：`node scripts/run-tests.mjs tests/lingguang-actions.test.ts tests/lingguang-plugin.test.ts tests/lingguang-mcp.test.ts tests/project-deletion-owners.test.ts tests/lingguang-blank-discard.test.ts tests/plugin-client-served.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/plugin-small-ux.e2e.test.ts`
- 相关手册：[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

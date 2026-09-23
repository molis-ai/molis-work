# Cognia 插件与本地知识导入

## 目标与证据

完成程度：功能可用。为 Molis Work 新增本机个人知识插件 Cognia，沿用当前插件目录、工作台、主题和控件。原始能力参考 `/Users/yijunwang/code/cognia`，不复制独立 App UI、旧运行时或示例数据。当前 Cognia 已实现的核心是领域、材料、分析/综合、审阅后写入 Wiki、带来源查询；原 App 的材料库仍有示例与未接通的 material resolver，因此不能把它当作现成导入实现。

本任务交付：真实的本地导入、阅读/检索/链接、领域整理，以及选定材料生成带来源的知识草稿、明确保存与查询闭环。工程验证与隔离环境真实页面操作分别记录，不宣称已通过用户本人验收。

## 场景与边界

- Cognia 是个人插件，知识保存在当前 Molis Work Home，独立于所选项目；市场、个人插件入口及内置工作台可达。
- 新用户可创建知识领域、直接添加 Markdown 材料，或从 Obsidian、LLM Wiki、通用 Markdown 目录导入。可选择本地目录（浏览器目录选择上传；本机路径入口也允许），先预览、再提交。
- Obsidian 保留 Markdown 原文、相对路径、frontmatter 原文、常见 title/tags/aliases、`[[双链|别名]]`、Markdown 内链及附件引用。`.obsidian`、`.git`、缓存/依赖和隐藏目录不导入。脚本/HTML 不执行，目录/文件符号链接不越界读取。
- LLM Wiki 先按通用本地 Markdown Wiki 接入，并识别 `raw/` 原始材料、`wiki/` 知识页面、`index.md` / `log.md`；这些文件以及 AGENTS/CLAUDE 等只是内容，不成为模型指令。用户尚未指定某一实现，不宣称专有格式/API 兼容。
- 文件正文支持 UTF-8 `.md` / `.markdown` / `.txt`。图片、PDF 等常见附件可作为原始附件导入/下载并保留引用，首版不承诺 OCR/PDF 文本提取、Dataview 执行、Canvas 还原。其他类型、超限文件、读取失败均列入回执，不静默遗漏。
- 导入是单向快照复制；用户显式再次导入时，同一来源和相对路径更新，原文相同则跳过；不会删除源文件或把源目录删除传播到 Cognia。相同文件名、不同目录/来源不能误合并。旧引用对应的正文快照必须仍可追溯。
- 首版不做后台监控、双向同步、云端账号、迁移旧 Cognia 数据库、完整旧版 Review/undo 系统、Master/Companion 或新图谱可视化。

## 状态、AI 与恢复

导入预览明确来源、领域、文件清单、文件类型/角色、新增/更新/不变及跳过原因。确认提交固定预览内容，成功后显示真实统计并打开资料；失败可重试，取消不写正式资料。重复提交不得制造重复资料。持久化批次与资料采用事务，重启后已导入内容可读；必要的大小/数量限制在界面可见。

资料可全文搜索、按领域/来源筛选、阅读、查看出入链接与未解析链接；链接解析不得跨来源误匹配同名文件。保留原文下载与附件下载，安全渲染 Markdown，外部 URL 不自动抓取。

AI 使用现有 Prologue 执行，从当前 Home 的模型设置 catalog 选择已启用且有凭据的模型（用户当前已配置 MiniMax），由用户明确点击触发。completeText 仅保留为插件与 Host 的测试/适配 port，不直接调用模型HTTP。用户已授权使用该配置做隔离合成资料的真实执行验证。消费当前选定材料的固定版本和用户问题，外部材料用明确的不可信数据边界包装；产出知识草稿或答案及有效资料引用。至少支持选中 1–5 份材料综合、领域内按查询检索资料后回答。模型输出采用首行 Markdown 标题和正文，避免文字中的引号破坏 JSON 序列化；校验有效引用，不捏造引用，证据不足应说明。生成结果先供审阅，用户明确保存后才进入知识库；源资料永远保留。展示生成中、失败与重试，未配置模型时说明并保留导入/搜索/阅读能力。不自动向模型发送整个 vault；输入过长明确提示缩小选择，不静默截掉关键材料。

保存知识草稿需保留来源版本与正文、明确引用入口。重复保存同一草稿幂等。本机 MCP 通过现有默认关闭的插件工具暴露机制提供只读搜索和读取，允许 Runtime 在用户开启后使用 Cognia 知识；本任务不增加自动读取文件系统的 MCP 能力。

## 实现与模块边界

- `plugins/native/cognia/`：公开导出、manifest、领域/导入/资料/草稿业务、SQLite store、路由表、MCP 定义、工作台 UI/client/styles/i18n、README。
- `packages/contracts/src/modules/cognia.ts`（若需要共享契约）：公开结构；不依赖旧 Cognia 包。
- `apps/local-host/src/cognia-*.ts`：本地文件 IO、HTTP 请求与 Home 装配、Prologue 模型 port、MCP adapter。沿用现有 control token / same-origin 安全门禁，不增开未授权路径。
- 共享文件只做必要注册：plugin-catalog、plugin-workbench、i18n、personal-native-plugin-http、mcp-native-plugins、workspace/package/lockfile、personal home store 清理清单。按实际声明式注册确定是否需要额外 UI composition，不复制宿主业务。
- 既有未提交修改必须保留。实现阶段只有一个 writer，设计与 review 只读；不提交或发布。

## 交互方向

沿用 Molis Work 母页列表→详情阅读工作台，正文优先；资料列表搜索、领域与来源筛选，主操作“导入知识库”，次操作“添加材料”。导入为有明确步骤的聚焦流程，选择→预览→结果，回执不会因刷新失败消失。阅读区显示来源路径、标签、引用关系与“整理为知识”。草稿审阅与“保存到知识库”清楚区分。窄屏按列表/详情推进、可返回；键盘标签、焦点、加载/空/错误状态齐全。继承 Design System，不新增视觉身份或改全局 DESIGN.md。

## 验收与验证

1. 真实 Obsidian 与 raw/wiki fixture 从扫描预览到提交再重启读取，检查原文、标签、别名、目录、角色、附件与双链；源目录完全不变。
2. 重复导入不重复；变更仅更新相同来源路径；同名不同路径/来源独立；引用旧版本仍读旧原文；重复提交和同时提交保持一致。
3. 预览取消、读失败/超限、不合法请求、路径遍历、符号链接、脚本内容安全渲染、失效/歧义链接、部分跳过均有可观察结果。
4. AI 注入 port 验证选定上下文、真实引用、失败不写知识、显式接受、重复保存幂等；未配置模型不伪造输出。用户已要求使用设置中 MiniMax 做真实 Prologue 调用；已在隔离合成资料上完成综合与中文问答验证，正文与固定引用有效，原始草稿没有自动保存到知识库。
5. 内置目录与工作台、HTTP 与 MCP 注册、Home 隔离与重启持久化验证。
6. `pnpm --filter @molis-ai/molis-work-plugin-cognia typecheck`、相关依赖构建、`node --import tsx --test tests/cognia-*.test.ts`、必要的插件目录回归及 `pnpm boundary:check`；真实隔离 Host 页面桌面/窄屏验导入→阅读→搜索→再次导入；保留实操与截图证据。当前 CUA 截图只在会话内返回，未提供可持久化文件，因此本次记录会话内截图与 DOM 观察，不声称仓库内有截图。

参考：Obsidian 官方存储/链接文档；[Karpathy LLM Wiki 原始说明](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)。具体产品行为以本 spec 和仓库实现为准。用户补充要求调研 LLM Wiki 方法论及常用知识软件；官方格式兼容边界见同目录 compatibility.md，按导出的 Markdown 导入，不扩展云同步或专有数据库适配。

## 验收记录

工程已通过：`pnpm --filter @molis-ai/molis-work-plugin-cognia typecheck`、Cognia/Workbench/Local Host/Storage各包build、`pnpm boundary:check`（0 errors）。`node --import tsx --test tests/cognia-*.test.ts` 11项全部通过。定向测试覆盖固定预览、幂等/冲突提交、版本快照、来源隔离、元数据/编码路径/双链、8 MB 附件、非法路径/符号链接/UTF-8、Home 重开、AI固定上下文/中文检索/取消/无效引用、HTTP同源门禁与下载、默认关闭只读MCP，以及完整Host页面的Cognia surface装配。

真实模型：主代理以用户现有设置通过 Prologue · Minimax · MiniMax-M3，在隔离合成资料上完成综合与中文问答两次生成；均保留2份固定来源，生成后仍是未发布草稿。首次JSON文本因模型未转义正文引号而拒收；最终改为Markdown标题/正文契约并实跑成功，不宽松修复坏JSON。

主代理已在隔离真实 Host 浏览器完成：
- 本机 Obsidian fixture 预览/提交：4新增、3跳过（隐藏目录、外部符号链接、Canvas），原文、tags、双链与附件入口可见。
- 浏览器目录选择上传另一个同名 `vault`：新增1份，来源与本机同名 vault 独立；LLM Wiki目录导入5份，AGENTS/raw为材料、concepts为知识、index为索引、log为日志。
- 真实 MiniMax 综合草稿经工作台明确保存为知识，点击 `[S1]` 打开原始 v1 材料；另一问答草稿仍待审阅，未自动发布。
- CSS 1440桌面详情与目录工具条/筛选边界相接（122px），无重叠；CSS 390窄屏工具条底256px/筛选顶258px，无横向溢出。导入弹窗滚动及固定操作区、详情、返回路径均经实际操作和会话内截图目视检查。

真实模型报告位于本次隔离QA目录 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/cognia-review-vkN3tZ/real-ai-report.json`；这是临时运行证据，并非用户知识库。截图在本会话内，工具未返回持久文件路径。工程通过与所列真实操作通过，完成程度为功能可用，未宣称用户本人已验收。

额外既有回归：`tests/plugin-declarative-mounting.test.ts` 8项通过。联跑 `tests/personal-plugins-review-fixes.test.ts` 有3项现有失败（Schedule目录断言、Pages Promote返回400、旧workbench装配表与coding/characters等目录断言）；本任务新增Cognia不在失败差异，未扩大修改其他插件业务。

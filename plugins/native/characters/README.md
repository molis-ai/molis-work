# Characters

独立个人角色管理插件。拥有编辑界面、发布前的内容预览和项目发布操作；草稿与停用/删除状态由 Characters Module 的公开接口提供，固定正文、版本与来源由既有 Artifact 服务保存。调用方只得到精确版本引用，不能从浏览器请求注入正文或扩大权限。

通过真实 Plugin Runtime 启动，Host 注入本人草稿、当前项目 Artifact、本地发现与执行端口。插件不打开数据库，不接触模型凭据；执行状态由 Agent Host / Runtime Host 和 Work Session 持有。

“从本机导入”支持 Codex、Claude Code、Cursor、OpenCode、Grok Build 的固定规则目录与 Skills，并读取可确认安装/启用状态的 Codex/Claude 插件。可以指定配置目录及项目目录；扫描警告显示未解析来源或不完整资源。附件按需预览，选定文件保存在 Character 快照，原配置不被修改。检查来源更新需要明确确认，保留名称、补充指令和已有固定发布。

“发布并使用”提供内置 Prologue 与对应原生 Agent 两种方式。内置模式选择本轮文本 Skills，读取其固定正文和文本附件；脚本/二进制依赖明确不可选。原生模式由服务端派发交互 PTY，沿用原工具登录、模型、实时配置和权限，提供固定 Character 包读取指令，记录输出并支持重连/停止；是否实际加载以原生输出为准。刷新或相同请求不会重跑任务。

实现和验证：`specs/characters-local-agent-import/spec.md`、`specs/characters-local-agent-import/validation.md`。真实 MiniMax-M3 / Prologue 已通过导入附件规则核对任务；未安装的原生 CLI 显示不可用，不假称五家模型执行均已验证。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `coding-c12`
- SSOT: `specs/coding-plugin/spec.md` §0 C12；`docs/SSOT-MATRIX.md`
- 管理与发布已通过正式插件入口在隔离预览实操：草稿恢复、并发冲突保留、固定版本与重复发布。Coding 精确版本选择、停用阻止新执行、在跑任务冻结与固定报告已实操；真实 MiniMax 同条件对照尚未证明减少人工负担，行为质量和完整验收继续推进。

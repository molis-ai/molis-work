# Shelf

**定位：** 个人置物架：材料进货、副本任务、生成结果与剪贴板历史的唯一 owner。

**拥有：** 架子条目、任务目录 `jobs/<id>/{input,output}`、原件 Hash、本机抽字结果。数据在用户 Home 下，不属于项目的 Goal 记录，也不是 Artifact。

**公开面：** 上架本机文件/文本、列出材料/结果/剪贴板、隐藏或删除架子副本、探测本机终端 Agent、跑本机提取与共享 Prologue AI 任务、读取副本文件、读写本机插件设置（拖放轮盘、三条全局热键）。Prompt 与 UI 不暴露原路径。

**不负责：** 不写回原件、不自动发布 Artifact、不加载项目规则 / 全局 MCP、不实现菜单栏轮盘与系统级热键（由 Desktop adapter 承担）。

**任务：** Shelf 为每次任务保留冻结的 `input/` 与独立 `output/`。自动动作经 Host 读取所选材料、解析 PDF/HTML、发送原图，再调用同一 Home 的 Prologue；没有终端或文件写入工具。固定指令登记在插件 `prompts.ts`，用户覆盖生效，快捷动作与材料是本次数据。JSON 选项用 SDK 解码且必须为对象，其他结构提取选项保存 Markdown；不自动请求模型修复。执行引用、终态、实际模型与逐次用量保存在 job，未知值不转零。原材料与结果身份、历史任务仍可读取。异步返回后复查原调用、任务状态、架子副本、冻结输入与原件 Hash，再同步提交。取消、撤权和输入/选项变化不写迟到成果或失败成果；重启不自动重跑。

**公开执行与模型选择：** `shelf.jobs.generate` 要求 `shelf:write` + `model:invoke`、成本 metered；`shelf.jobs.extract` 只需 `shelf:write`、成本 none。两者通过共同目录向 MCP、Workflow、Agent 暴露，仍需各自授权。原先的兼容入口 `shelf.jobs.run` 已删除（界面和内置调用方一直走这两个）；AI 分支的 `model:invoke` 现在写在 `shelf.jobs.generate` 的声明权限里，而不是处理器里临时查。设置的 `model_selection` 与手动终端 `engine` 独立；默认从可用模型目录选择，显式选择失效拒绝，不偷偷换模型。原图只发送到声明 vision 的模型。目录逐文件保留相对来源；不支持的二进制、输入过长或原图格式明确拒绝，不静默漏掉。

**本机提取：** PDF 文字层和入库预览走公共 Host worker，图片走同一 Host 的 Vision 组件；都不调用 Agent、不上网。Shelf 保留中/英语言选择、逐行低置信度“待确认”和 32 MiB 入库，默认公共提取限制仍为 25 MiB。多选逐项处理，缺页/截断等不完整信息保留在输出。旧 `molis-work-ocr` 与 `MOLIS_WORK_OCR_BIN` 接线已移除，组件随 Local Host 安装并构建。

**抓页：** Host 为 Shelf 注入公共网页材料端口，上架 http(s) 链接后保存一条 WEB 材料（标题 + 链接 + 正文）。读取最多 12 秒、5 次跳转和解压后 4 MiB；取不回或超限时只保存链接，并写明没抓到正文。提取正文达到文字上限时明确标记部分内容。取消、撤权或源剪贴板删除后不保存迟到材料；没有注入 Host 端口的纯 Module 调用不会联网。通用 HTML 解析与 Artifacts 共用 Host 实现。

**剪贴板：** 桌面壳轮询系统剪贴板的变化计数；读得到内容就记历史（文件直接进材料、不占历史，隐蔽类型不记）。现代 macOS 可能只给变化计数不给内容，这时 `shelf_setup_status.clipboard_readable` 为 false，设置页改说「按 ⌘V 上架」。

**人工终端：** 九个引擎与自定义 Runtime 仍可手动打开或发送。目录和快照只做被动发现，不因自动动作启动 CLI。终端选择不改变自动动作的 AI 模型。生产走真实 PATH；隔离试用与测试可用 `MOLIS_WORK_SHELF_AGENT=off`、`MOLIS_WORK_SHELF_AGENT_PATH=<目录>`、`MOLIS_WORK_SHELF_AGENT=<引擎>` 钉死人工入口。

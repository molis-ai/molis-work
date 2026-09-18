# Shelf

**定位：** 个人置物架：材料进货、副本任务、生成结果与剪贴板历史的唯一 owner。

**拥有：** 架子条目、任务目录 `Jobs/<id>/{input,work,output}`、原件 Hash、本机抽字结果。数据在用户 Home 下，不属于项目 Goal 账本，也不是 Artifact。

**公开面：** 上架本机文件/文本、列出材料/结果/剪贴板、隐藏或删除架子副本、探测本机终端 Agent、跑本机提取与 CLI Recipe 任务、读取副本文件、读写本机插件设置（拖放轮盘、三条全局热键）。Prompt 与 UI 不暴露原路径。

**不负责：** 不写回原件、不自动发布 Artifact、不加载项目规则 / 全局 MCP、不实现菜单栏轮盘与系统级热键（由 Desktop adapter 承担）。

**任务：** `jobs/<id>/{input,work,output}`。跑的时候 `input/` 只读，`work/` 是 Agent 的工作目录，`prompt.txt` 只写 work 里的相对名。结果按「写出的文件 → work 里的新文件 → 最后一条消息」收口；进度和「已写入」这类交代不算交付。跑完校验架子副本与原件 Hash。任务可以中途取消（整组进程一起停），失败留一行带原因的结果、没有文件可拿。

**本机提取：** PDF 读内嵌文字；图片走 `molis-work-ocr`（Vision，随桌面 App 分发，`MOLIS_WORK_OCR_BIN` 可指定），都不调用 Agent、不上网。

**抓页：** 上架一个 http(s) 链接会真的取回页面，写成一条 WEB 材料（标题 + 链接 + 正文）。取不回正文时链接仍然上架，并写明没抓到。

**剪贴板：** 桌面壳轮询系统剪贴板的变化计数；读得到内容就记历史（文件直接进材料、不占历史，隐蔽类型不记）。现代 macOS 可能只给变化计数不给内容，这时 `shelf_setup_status.clipboard_readable` 为 false，设置页改说「按 ⌘V 上架」。

**Agent 探测：** 九个引擎按 DropAgent 顺序在 PATH 与已知目录里找，`--help` 决定有没有可收口的 Job 入口；只有有入口的 Agent 能跑 Recipe，只有 TUI 的仍可接发送。生产走真实 PATH；隔离试用与测试用 `MOLIS_WORK_SHELF_AGENT=off`、`MOLIS_WORK_SHELF_AGENT_PATH=<目录>`、`MOLIS_WORK_SHELF_AGENT=<引擎>` 钉死。

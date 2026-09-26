# Molis Work

[English](README.md) | **简体中文**

Molis Work 是不同 AI Runtime 共用的 Goal 账本和工作台。

长程任务常见的失败很具体：新 Session 看不到上一轮，原目标被局部决定改掉，“完成了”只是一句话、没法核对。缺的不是更聪明的模型，而是一份所有 Runtime 都能对着记账的项目事实：已确认的 Goal、怎么拆的、卡在哪、谁在做、凭什么算完成。

Molis Work 把这份记录放在本地。Codex、Claude Code、OpenCode 或其他已接入的 Harness，读写的是同一份 Goal。重大变化由你确认。不用追问模型，也能看到事情推进到哪里。

它不捆绑模型，也不调度 Agent 团队。执行仍在你正在用的 Harness 里。

更完整的推导见公众号文章（链接待发布）：*[placeholder — 公众号文章待发布]*。草稿：[从对话态事实到账本态事实](https://github.com/adeptify/article/blob/main/AI%E9%95%BF%E7%A8%8B%E4%BB%BB%E5%8A%A1-%E4%BB%8E%E5%AF%B9%E8%AF%9D%E6%80%81%E4%BA%8B%E5%AE%9E%E5%88%B0%E8%B4%A6%E6%9C%AC%E6%80%81%E4%BA%8B%E5%AE%9E.md)。

## 三种使用方式

同一份项目，三种界面。

### 桌面端

独立的 macOS 窗口：聚焦一条 Goal，再打开始终属于它的终端。Molis Work 还有一个可点击的 **macOS 顶部菜单栏状态图标**。点一下就能看到当前项目、聚焦的 Goal、状态和下一步。

<p align="center">
  <img src="docs/screenshots/showcase/desktop-focus-zh-dark.jpg" width="32%" alt="Molis Work 桌面端：在 Goal 导航旁聚焦一条 Goal">
  <img src="docs/screenshots/showcase/harness-runtime-zh-dark.jpg" width="32%" alt="Molis Work：绑定到当前 Goal 的终端">
  <img src="docs/screenshots/showcase/macos-menu-bar-capsule-zh-dark.jpg" width="32%" alt="从 macOS 状态栏图标打开的 Molis Work 工作胶囊">
</p>

<p align="center">
  <sub><b>Goal 工作台</b> · 历史 Goal 界面，不是当前事件正文 &nbsp;·&nbsp; <b>Goal 绑定 TUI</b> · 终端属于这条 Goal &nbsp;·&nbsp; <b>工作胶囊</b> · 从 macOS 状态栏快速查看</sub>
</p>

### Harness 里

把 Molis Work 放在 Harness 的侧边浏览器里，对话继续在同一个窗口里进行。窄：Goal 列表。宽：当前 Goal 和它的 TUI。

<p align="center">
  <a href="docs/screenshots/showcase/harness-narrow-zh-dark.jpg"><img src="docs/screenshots/showcase/harness-narrow-zh-dark.jpg" width="32%" alt="Harness 侧栏：Goal 列表"></a>
  <a href="docs/screenshots/showcase/harness-runtime-zh-dark.jpg"><img src="docs/screenshots/showcase/harness-runtime-zh-dark.jpg" width="65%" alt="Harness 侧栏：当前 Goal 与绑定 TUI"></a>
</p>

<p align="center">
  <sub><b>窄版</b> · 对话旁边的 Goal 列表 &nbsp;·&nbsp; <b>宽版</b> · 当前 Goal 和绑定到它的 TUI</sub>
</p>

### Web

同一份本地项目也可以在浏览器里打开。Web 和桌面端共用 `~/.molis-work` 里的数据。

![Molis Work Web：Goal Tree（历史工作台界面）](docs/screenshots/showcase/web-workspace-zh-dark.jpg)

以上截图展示的是工作台、Goal 列表、绑定终端和 macOS 状态栏。它们是历史产品界面，不是当前 Goal 事件正文。当前 Goal 页顶部是当前判断、已做成、下一步和风险，左侧是时间索引，右侧是所选事件正文。

内置启动配方覆盖 Codex、Claude Code、OpenCode、Pi Agent、Grok Build。其他 Harness 可以通过 Molis Work 的 MCP 和共享 Skill 读写同一项目。

## 核心功能

每项都用大白话说：怎么用，解决什么问题。

### 看清目标、已经做成了什么，以及下一步

点开一条 Goal。不翻聊天记录，也应能回答三件事：要得到什么、已经做成了什么、下一步做什么。父 Goal 可以记录自己的整合或验收；子 Goal 数量不能证明父目标已经完成。

### 看清谁依赖谁

列表不够用的时候看关系图。父子表示结构；B 要用 A 的结果，这条依赖会参与B的正式完成判断，但B仍能先记录准备和部分工作。需求变了，能看见下游哪些工作受影响，而不用把整棵树重新讲一遍。

### 改题要你点头

Runtime 可能发现新工作、新依赖或风险。它可以提案，但不能悄悄替换已经约定的结果或降低要求，也不能自填 user 身份。可信用户决定由 Host Web 或管理入口记录。决定中心把问题、为什么现在要决定、依据或缺口、每个选择会改什么放在同一页。

### 终端跟着 Goal 走

从一条 Goal 打开 Codex、Claude Code 或自定义命令。这个终端一直属于这条 Goal — 后来再点别的 Goal，不会把它偷偷改绑走，也不会自动发送。父 Goal 仍可以记录整合工作；有子 Goal 不等于父目标已经完成。

macOS 上，当前这条 Goal 也在 **屏幕顶部菜单栏**。点 Molis Work 的状态栏图标，可以看到项目、聚焦的 Goal、状态和下一步；点别处，面板就收起来。

### “完成了”得能核对

完成不是对话里的一句话。普通报告保存部分结果和来源。支持、反证或未知只更新相关要求；普通支持不会自动完成。显式收尾会检查当前约定、真实支持和适用阻塞。已记录不等于完成已生效。没有要求时也可以工作，但不能宣称完成。

要求可以按需设置为“必须由人验收”，Runtime报告不能替代这个决定。完成或取消后，可以说明原因明确继续；与当前结论无关的补充不会悄悄重开目标。

干活时冒出来的普通补充，用 **补充一条** 贴到当前这条 Goal 上。承诺、授权或完成要求的变化走事件表单或可信用户决定，不会因为写在输入框里就偷偷生效。

### 告诉 Runtime 这个项目该怎么拆

新意图可以直接保存，先记普通笔记，不必先选规划或登记类型。需要结构化结果时再定义局部类型。工作规划是可选项：它提供可选择采用的类型与默认要求。采用版本和这条 Goal 的局部修改会留下来；以后改模板不会改掉旧含义。规划方法不是任务模板，也不会自动长出一棵树。一个项目可以同时用工作类型方法和领域方法。改树仍然是提案，要你确认。

### 接入 Runtime 是一次明确操作

不接 Runtime，Molis Work 也可以当看板用。只有当你希望 Codex、Claude Code 等直接读取和推进 Goal 时，才去接入。接入配置先预览，你确认后才修改；失败会回滚。普通Goal笔记和报告沿用已有工作授权。接入之后要 **新开一个 Session** — 工具只在 Session 启动时加载。

## 3 分钟体验

### macOS Desktop（推荐）

从 [GitHub Releases](https://github.com/molis-ai/molis-work/releases) 下载与你的 Mac 匹配的 DMG：

- Apple Silicon（M1/M2/M3/M4…）：`macos-arm64`
- Intel Mac：`macos-x64`

打开 DMG，把 Molis Work 拖入 Applications 后直接启动。Desktop 已内置 Node 与 Molis Work Runtime；首次打开会把 Core 安装到 `~/.molis-work` 并启动同一套本地工作台，不要求先安装 Node、pnpm 或克隆仓库。升级 App 不会改写已有项目和历史。

未使用 Developer ID 签名和 Apple 公证的开发构建仍会触发 Gatekeeper，需要在“系统设置 → 隐私与安全性”中明确允许；正式发布流水线配置证书后会生成签名并公证的同名产物。

### 从源码体验

需要 Node.js 24+、pnpm，以及 macOS（常驻 Web 服务目前使用 LaunchAgent；其他系统可以前台启动 Web）。

```bash
git clone https://github.com/molis-ai/molis-work.git
cd molis-work
pnpm install --frozen-lockfile

# 构建并安装到 ~/.molis-work
pnpm install:local

# macOS：安装常驻 Web 服务
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

# 创建与用户数据分开的可重建示例
"$HOME/.molis-work/bin/molis-work" demo create --confirm
```

打开 `http://127.0.0.1:4173`，进入示例项目。然后在“设置 → Runtime”中预览并确认所需接入，再**新开一个 Runtime Session**：

> 使用 Molis Work 连接示例项目，打开一条 Goal，并告诉我当前判断、已经做成了什么、下一步和完成要求。

Runtime 只在 Session 启动时读取 MCP 和 Skill，因此刚完成接入后需要新开 Session。

### 一键启动（开发日常）

仓库检出后的日常入口是根目录的 `Start.sh`：先清理残留实例（常驻 LaunchAgent 服务、占用 4173 的旧 Web、运行中的桌面端），按需补装依赖、在构建产物缺失或落后于源码时重新构建，然后启动桌面端——其 Web 界面直接来自仓库刚构建的 `dist`，改完代码重启即可看到。交互终端会进入逐步向导（选目标、确认清理、确认重建）；脚本化场景可加参数跳过向导。

```bash
./Start.sh              # 向导，默认启动桌面端 App
./Start.sh --web        # 只启动 Web 服务并打开浏览器
./Start.sh --build      # 启动前强制重建
./Start.sh --no-clean   # 跳过清理
```

### 构建、安装和启动 macOS Desktop

```bash
# 开发态源码运行
pnpm desktop

# 构建当前架构的 DMG 与 App zip
pnpm desktop:build:macos

# 安装刚构建的 DMG 到 ~/Applications 并启动
pnpm desktop:install:macos

# 以后直接启动已安装 App
pnpm desktop:start:macos
```

每个架构单独打包，是因为 Molis Work 的 SQLite 与 PTY native addon 必须和 Node、Mac CPU 架构一致。向 `v*` tag 推送后，GitHub Actions 会分别构建 Apple Silicon 与 Intel DMG；只有签名和公证成功才会发布公开 Release，凭据只从 GitHub Secrets 读取，不进入仓库。

## 产品边界

- 项目的权威状态保存在本地 SQLite；Molis Work 不捆绑模型。
- 打开页面不会自动绑定 Session、启动 Runtime 或发送命令。
- Runtime 接入、终端启动和正式 Goal 变化都需要明确操作或确认。
- 当前工作统一使用事件记录。旧库升级和V3导入保留真实历史并接通当前状态；旧Draft/Claim/Run写入口已退役。
- Molis Work 管理 Goal 事实与执行闭环，不替代 Harness 或 Agent Orchestration。
- v0.2.0 引入事件工作流，并退役旧 Runtime 写协议。兼容与升级步骤见[发布说明](docs/releases/v0.2.0.md)；公开 macOS 安装包仍待 Developer ID 签名与 Apple 公证完成后提供。

## 更多文档

- [架构 SSOT 与迁移归属](docs/SSOT-MATRIX.md)
- [安装与维护](docs/installation.md)
- [运行时协议](docs/runtime.md)
- [MCP 接入](docs/mcp.md)
- [CLI 与开发](docs/cli-and-development.md)
- [Runtime Skill](skills/goal-advance/SKILL.md)
- [Plugin 开发 Skill](skills/molis-plugin-dev/SKILL.md)
- [Molis Work Bug 卡台账](docs/molis-work-bug-cards.md)

## License

MIT，见 [LICENSE](LICENSE)。

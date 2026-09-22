# Molis Work

[English](README.md) | **简体中文**

## 聊天会忘，Goal 不该忘

一个长程 AI 任务进行到第三天，当前 Session 说“已经完成”。但只要新开一个 Session，四个最基本的问题就没人说得清：

- 我们真正确认过的结果到底是什么？
- 为什么这样拆，现在哪一步还被阻塞？
- 中途出现的新要求，哪些真的被接受了，而不是悄悄混进原范围？
- 有什么证据能证明结果达到了最初的完成标准？

聊天保存了很多话，却没有保存一份可靠的工作状态。

人与 AI 协作最贵的部分就出现在这里：人要反复重建上下文，很晚才发现目标已经跑偏，重新核对“完成了”到底是不是真的；执行中有价值的新发现，要么消失在消息里，要么不知不觉扩大了范围。

**Molis Work 让 Goal 活在聊天之外。** 它把已经确认的结果、拆解逻辑、依赖、决定、当前 Run、Evidence 和 Review 留在同一个本地项目里。Session 和 Runtime 可以换，工作状态不必再靠记忆从聊天记录中还原。

### 一个 Codex 任务，不是两个并排窗口

接好 Molis Work MCP 与共享 Skill 后，直接在 Codex 的内嵌浏览器中打开本地 Molis Work Web。任务继续在 Codex 当前窗口推进，同一个窗口里也能持续看到 Goal Tree、下一步、阻塞和完成要求，不需要再单独摆一个 Molis Work 桌面窗口。

![Codex 内嵌浏览器中的 Molis Work Web：中文 Goal Tree 与当前 Goal](docs/screenshots/showcase/codex-embedded-zh.jpg)

页面只是事实视图，不是执行开关：关掉页面不会让已接入的 Runtime 停止；打开页面也不会自动领取工作或改变 Session 绑定。

## 核心机制：让 Goal 跨过 Session 继续存在

Molis Work 把长程工作中应该稳定的部分，从人的工作记忆和聊天记录里移出来，形成一个明确闭环：

| AI 工作通常在哪里断掉 | Molis Work 把什么保存下来 |
| --- | --- |
| 消息越来越多，原始意图逐渐漂移 | 已确认的 Goal Contract 保存结果、边界、输入、输出、约束和完成标准。 |
| 一个复杂结果被摊平成任务清单 | 可配置的规划方法约束怎样拆、必须覆盖什么、怎样判断依赖。 |
| 把讨论先后误当成执行先后 | `part_of` 表达层级；只有一个 Goal 真实消费另一个 Goal 的结果时才使用 `depends_on`。 |
| Runtime 发现新工作后顺手扩大范围 | 新发现先成为提案，由人决定是否进入 Goal Tree、怎样进入。 |
| 终端和它正在做的任务失去对应关系 | TUI 始终属于打开它的那条可执行 Goal。 |
| “做完了”只是一句聊天结论 | Claim → Run → Evidence → Review 把执行记录和完成标准接起来。 |

这套机制不要求 Molis Work 托管模型，也不要求它派 Agent。接入的 Runtime 从真正可做的工作中选择一条，在原有 Harness 中执行，再把进展和证据写回同一份本地事实。

## 1. 先配置 Goal 应该怎样拆

规划方法不是任务模板，也不会静默生成一棵 Goal Tree。它是一组 Runtime 在提出或调整 Goal Tree 前必须先阅读的规划说明。

一个项目可以组合多套方法，例如一套“工作类型”方法加一套“专业领域”方法。当前组合是规划下限：所有选中的方法共同检查同一棵 Goal Tree；实际工作还涉及其他专业主题时，Runtime 必须补充相应方法。

![项目工作规划：两套互补的中文拆解方法共同生效](docs/screenshots/showcase/planning-composition-zh.jpg)

每套方法都把拆解逻辑摊开给人看：

- **规划路径：** Runtime 需要依次想清楚什么，不是机械生成一串串行 Goal。
- **必答覆盖：** Goal Contract、可执行叶子、依赖产出、证据和复核分别要回答什么。
- **依赖判断：** 哪个下游结果真正消费哪个上游交付物。
- **完成与纠偏：** 收口前必须出现哪些证据，以及应避免哪些常见误拆。

![中文规划方法：拆分时必须回答的问题与依赖判断规则](docs/screenshots/showcase/planning-logic-zh.jpg)

Runtime 最终提交的是提案，不是自动改写。复合 Goal 组织较大的结果；每条可执行叶子 Goal 只承诺一个可以独立交付、独立验收的主要结果。

## 2. 看到真实计划，也看到下一条为什么能做

Goal Tree 回答“哪些结果属于同一个目标”；Graph 回答“谁在消费谁的结果”。两者读取同一组已经确认的关系：

- `part_of` 表达父子层级；
- `depends_on` 表达真实的产出消费前置；
- 会导致执行无解的依赖环会被拒绝；
- 可做项排序同时检查 accepted Contract、未完成依赖、阻塞风险、所需能力和重新验证状态。

![中文 Goal Graph：父子、依赖、状态与当前焦点](docs/screenshots/showcase/goal-graph-zh.jpg)

需求变化时，这种结构尤其重要：Molis Work 可以找出直接受影响的 Goal 和下游消费者，保留仍然成立的部分，再把必要变化交给人决定，而不是整棵树重写一遍。

## 3. 重要变化始终由人决定

Runtime 可以提出 Goal Contract、新发现工作、关系调整、风险处理或结果确认，但不能自己把这些重要事实变成项目正式状态。

决定中心把“现在要决定什么、为什么现在要决定、证据够不够、推荐依据是什么、每个选择会改变什么”放在同一个地方。事项处理后，最近的决定结果仍然保留供核对。

![中文决定中心：新发现工作进入 Goal Tree 前由人确认](docs/screenshots/showcase/decisions-zh.jpg)

这样，Runtime 可以快速探索和提出方案；人仍然掌握项目到底接受了什么。

## 4. 在始终绑定 Goal 的 TUI 里执行

从一条可执行叶子 Goal 直接打开本地 CLI 或自定义命令。终端保存在这条 Goal 和当前项目下面，不会因为界面后来选中了另一条 Goal 就被静默改绑。

![中文 Goal-bound TUI：同时显示所属 Goal、结果、下一步、完成标准和证据路径](docs/screenshots/showcase/goal-bound-tui-zh.jpg)

这个绑定会实际改变执行体验：

- TUI 随时可以恢复所属 Goal 的结果、下一步和完成要求；
- 切换 Focus 不会把终端重新分配给另一条 Goal；
- 复合父 Goal 会引导人进入具体子 Goal，不会假装父 Goal 可以直接执行；
- 打开终端不会自动发送 Prompt，也不会自动领取 Goal。

Molis Work 仍然是 pull-based：Runtime 自己选择可做项并记录 Claim/Run；Molis Work 不会替人往终端里输入，也不负责编排 Agent team。

## 5. 让“完成”可以被核对

一条 Goal 是否完成，由完成标准和所需检查共同推导，不取决于聊天里的一句状态。只读记录把谁领取了工作、Run 产生了什么、哪条 Evidence 支持哪条标准、哪次 Review 通过接在一起。

![中文执行记录：Claim、Run、Evidence 与 Review 形成同一条完成依据](docs/screenshots/showcase/evidence-review-zh.jpg)

新事实也不用继续丢在聊天里。**快速记录**可以把完成依据、风险、影响范围或 Goal 关系直接绑定到当前 Goal；事件记录会继续保留改了什么、为什么改。

![中文快速记录：完成依据、风险、影响范围与 Goal 关系](docs/screenshots/showcase/quick-capture-zh.jpg)

工作规则可以要求自检、独立检查、对抗检查或人工确认。通过的 Evidence 可以支持完成标准，但不会静默替代仍然需要人的决定。

## 6. 每个 Runtime 都明确接入

即使不接任何 Runtime，Goal Tree、决定中心和完整记录也能正常使用。只有确实要让某个 AI 工具直接读取或推进 Goal 时，才需要连接。

![中文 Runtime 设置：探测结果、接入状态与先查看再接入的入口](docs/screenshots/showcase/runtime-settings-zh.jpg)

接入遵循 `detect → preview → confirm → apply → validate → remove`：

- 写配置和 Skill 前先展示完整变更；
- 一次确认只对应当前 Runtime 与当前预览；
- 预览后配置发生变化，必须重新生成计划；
- 移除也是显式、可验证的操作，必要时使用 Molis Work 自己的收据和备份。

当前内置 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build adapter。新接入后需要**新开 Session**，因为 Runtime 只会在 Session 启动时读取 MCP 与 Skill 清单。

## Molis Work 是什么，又不是什么

| Molis Work | Agent Orchestration |
| --- | --- |
| 明确结果、拆解、前置、接受的变化、当前状态和完成所需证据。 | 决定哪些 Agent 参与，以及怎样分工、通信和执行。 |
| 把项目权威状态保存在本地 SQLite。 | 可以在另一套本地或远程 Harness 中运行。 |
| Goal、关系、风险、Runtime 接入与 Session 绑定的重要变化都需要明确操作。 | 可以在已经获得的边界内自动执行。 |

两者可以组合：先在 Molis Work 建立 Goal 结构和完成门禁，再让 Runtime 或 Agent team 执行；所有入口继续把进展和证据写回同一份事实。

### 当前使用界面

| 界面 | 适合什么 |
| --- | --- |
| **Codex 内嵌 Web** | 任务在 Codex 中继续时，把 Goal Tree 与 Focus 留在内嵌浏览器里。 |
| **Web 工作台** | 在任意浏览器打开同一本地项目，使用 Graph、决定中心、设置和 Goal-bound 终端。 |
| **macOS Desktop** | 把 Goals、Focus、Graph 与 Runtime 作为一个原生工作站使用。 |

上面的截图来自仓库当前源码。公开的 `v0.1.0` Desktop Preview 可能尚未包含最新的工作台与桌面工作胶囊改动。

## 体验完整闭环

### macOS Desktop Preview

从 [GitHub Releases](https://github.com/molis-ai/molis-work/releases) 下载当前预览版：

- Apple Silicon：`Molis Work-0.1.0-macos-arm64.dmg`
- Intel Mac：`Molis Work-0.1.0-macos-x64.dmg`

打开 DMG，把 Molis Work 拖入 Applications 后启动。App 已内置 Node.js 与 Molis Work Core；首次启动会在 `~/.molis-work` 安装或刷新 Core，同时保留已有项目和历史。

`0.1.0` 是面向 macOS 13+ 的未签名、未公证 Preview。Gatekeeper 会要求你在**系统设置 → 隐私与安全性**中明确允许；请只从本仓库 Release 页面下载。

### 从源码运行

需要 Node.js 20+、pnpm；macOS 可以使用 LaunchAgent 常驻服务，其他系统可以前台运行 Web。

```bash
git clone https://github.com/molis-ai/molis-work.git
cd molis-work
pnpm install --frozen-lockfile

# 构建并把自包含 Core 安装到 ~/.molis-work
pnpm install:local

# macOS：明确安装并启动本地常驻 Web 服务
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

# 创建与用户项目分开的可重建演示数据
"$HOME/.molis-work/bin/molis-work" demo create --confirm
```

打开 `http://127.0.0.1:4173`，进入演示项目，然后完整走一遍：

1. 打开**项目设置 → 工作规划**，查看当前生效的 Goal 拆解方法。
2. 选择一条没有未完成前置的叶子 Goal。
3. 打开它的 TUI，或在**设置 → AI 与执行工具**中接入 Runtime。
4. 对照完成标准记录进展与 Evidence。
5. 确认所需 Review 已经满足，再把 Goal 当作完成。

接入 Runtime 后，新开一个 Session 并尝试：

> 使用 Molis Work 连接演示项目。告诉我一条当前可执行的 Goal、它为什么可做、下一步是什么，以及完成前必须提供什么证据。

### 开发 macOS App

```bash
pnpm desktop                 # 从源码运行
pnpm desktop:build:macos     # 构建当前架构
pnpm desktop:install:macos   # 把构建的 DMG 安装到 ~/Applications
pnpm desktop:start:macos     # 以后启动已安装 App
```

## 产品边界

- 项目的权威状态保存在本地 SQLite；Molis Work 不捆绑模型，也不要求把项目存到云端。
- V1 面向单设备、本地 Workspace，不包含云端多租户、组织 RBAC 或第三方项目管理同步。
- 每个项目使用独立数据库；演示数据明确标记为可重建，并与用户项目分开。
- 界面支持中文和英文；用户写入的 Goal 内容保留原语言，不会被静默机器翻译。

## 文档

- [架构 SSOT 与迁移归属](docs/SSOT-MATRIX.md)
- [安装与维护](docs/installation.md)
- [运行时协议](docs/runtime.md)
- [MCP 接入](docs/mcp.md)
- [CLI 与开发](docs/cli-and-development.md)
- [Molis Work Runtime Skill](skills/goal-advance/SKILL.md)
- [Plugin 开发 Skill](skills/molis-plugin-dev/SKILL.md)

## License

MIT，见 [LICENSE](LICENSE)。

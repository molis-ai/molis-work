# 面向外部用户的发布加固

> 状态说明：本文关于 workspace default 的设计已被后续 `specs/session-workspace-redesign/` 取代。当前产品只保留 workspace 历史候选，每个新 Session 都明确确认 Project；下文相关段落仅作为历史决策记录，不应继续实现。

## 背景与目标

Molis Work 已具备项目 catalog、Runtime 接入、统一 Skill、MCP、Web 和自包含安装，
但真实外部试用暴露出一组相互关联的问题：用户不知道产品长什么样；安装完成不等于
当前 Session 立刻获得工具；Web 不是常驻服务；同版本源码可能继续使用旧构建；新版
项目关联依赖 Codex stdio MCP 实际拿不到的 Session 环境变量；对话确认也依赖宿主没有
提供的可信消息接口；卸载边界没有区分用户数据与演示数据。

本 Goal 要把这些问题收敛成一条可向朋友交付的完整体验：安装结果可理解、服务可持续、
Runtime 能稳定定位项目、用户在对话中的确认能够推进 Goal Tree、更新和卸载不丢用户数据，
并用真实发行包端到端验证。

Molis Work Draft：`draft-44163d37-ebe8-411b-9220-ced1c0b05040`。

## 当前行为与证据

### 已确认（已拉取 `origin/main@f8dca89` 后复核）

- 最新 main 已加入真实产品截图和 `examples/seed-demo.mts`，README 的吸引力问题已有第一步修复；
  但 demo 仍是仓库脚本，不是安装后 UI/CLI 的自然入口，也没有在 catalog 中标记为可再生数据，
  因此首次使用和安全卸载仍未闭环。
- Codex 官方文档要求保存 MCP 配置后重启 Session/extension。工具清单由宿主加载；Molis Work
  无法让一个已经启动的旧 Session 凭空获得新 MCP 工具。当前提示只说“重启后生效”，
  没解释原因或如何续接。
- `molis-work-web` 是前台进程。仓库没有 launchd/systemd 用户服务；关闭终端、Runtime
  Session 或重启电脑后都不会自动恢复。`nohup` 也不能对抗宿主清理整个会话进程树。
- 源码安装器直接读取现有 `dist`，不会构建或检查源码是否比产物新。
- release 只用版本号判定有效；同版本内容改变时 `inspectRelease` 返回 `valid`，不会刷新。
- Codex 普通 shell/tool 调用可以获得 `CODEX_THREAD_ID`，但官方 issue #19937 证明 stdio
  MCP 启动进程拿不到它，并已按 not planned 关闭。当前 README 与 Runtime adapter 把它当成
  可用前提，属于错误契约。
- 最新 main 已增加 `workspace:<hash(path.resolve(PWD))>` fallback，缺少 Session ID 时不再直接
  阻断；但它把目录 hash 塞进原本的一对一 Session binding，既没有 `realpath` 合并符号链接，
  也没有 workspace 多项目/default 模型。它解决了“能连上”，尚未解决 monorepo、并发 Session
  override 和长期项目路由语义。
- `molis_work_v1_goal_tree_decide` 在 Runtime audience 下要求进程内
  `trustedUserDecisionProvider`；正式 stdio 启动没有 provider，因此对话里说 OK 也不可能生效。
- 最新 main 已补齐 `resources/templates/list -> { resourceTemplates: [] }` 与回归测试；这一项
  作为已完成验收保留，不重复实现。
- 当前 Session 的工具表中没有 Molis Work MCP；真实配置仍是旧的静态
  `MOLIS_WORK_DATABASE/MOLIS_WORK_BOARD_ID` entry，且没有当前 Skill 链接。代码仍保留静态 DB
  Runtime connection 分支，所谓“旧逻辑已删除”尚未完成。
- 公开 CLI 没有 uninstall 命令。若用户目前通过删除 `~/.molis-work` 卸载，程序、catalog、
  用户项目和 demo 会一起消失；这是缺失安全卸载契约，而不是某条现有卸载代码的局部 bug。

### 外部宿主事实

- Codex 当前主线 app-server 会在其 `mcp_server_tool_call` 路径给 MCP tool-call `_meta`
  增加 `threadId`。Molis Work 应优先消费每次调用的宿主元数据，但不能把它假定为所有 Codex
  版本、所有 Runtime 都存在的唯一来源。
- Codex 公开配置支持显式 STDIO `command/args/env/env_vars/cwd`，但没有公开承诺把当前对话的
  用户消息或确认凭证传给第三方 MCP。
- 最新 main 在 Codex 配置中加入 `env_vars = ["CODEX_THREAD_ID", ...]`。官方 issue 已证明
  `env_vars` 只能继承 MCP launcher 环境，不能读取当前 thread；因此它不能作为动态 Session
  修复，还可能继承一个与当前 thread 无关的外层值。实现应优先消费每次 tool-call 元数据，
  workspace fallback 只承担长期默认项目，不冒充 Session。

## 产品决策

1. **会话负责审计，工作空间负责历史候选和可选默认。** 每次调用若有可信宿主 `threadId`，
   用它隔离当前 Session；同时把经过 `realpath` 规范化的 workspace 作为长期项目关联。普通选择
   只增加历史候选，新 Session 仍询问；只有用户单独明确设置 workspace default 后才自动恢复。
2. **一个 workspace 可以关联多个 Molis Work 项目。** catalog 保存成员关系和最多一个默认
   项目；成员永远不会因为数量为一而自然成为默认。无默认时即使只有一个成员也询问。显式
   切换可选择“仅当前 Session”或“设为 workspace 默认”；宿主无 Session ID 时普通选择只让当前
   MCP 调用流继续并记录历史，不伪造机器级 Session。
3. **路径只是宿主工作空间事实，不是 Git 身份。** 使用绝对路径并以 `realpath` 合并符号链接；
   不要求 Git，不修改用户项目文件。拿不到可靠 workspace 时保持未解析并说明原因。
4. **本地个人模式接受 Runtime 对用户确认的可审计声明。** Molis Work 不再假装 Codex 能提供
   密码学可信的用户消息。Runtime 必须提交 `user_confirmed=true`、具体决定和可用的 thread
   元数据；Molis Work记录 actor、thread、proposal、决定和时间。Web 确认仍是另一种直接用户
   入口。此机制是本地协作的审计约束，不宣称能抵御恶意 Runtime。
5. **配置写入继续先预览、后确认。** 安装本体不自动修改 Codex/Claude 用户配置，也不修改
   项目文件。常驻服务同样必须由用户在 UI/CLI 明确启用。
6. **macOS 先交付常驻服务。** 使用用户级 LaunchAgent、登录后自动启动、异常退出自动恢复，
   日志放在 `~/.molis-work/logs`。其他平台必须明确显示“尚未提供常驻集成”，不能假装后台
   成功；service provider 接口为后续 systemd/Windows 扩展保留边界。
7. **用户数据默认永远保留。** uninstall 默认移除 owned Runtime 接入、服务、launchers 和
   releases，保留 catalog 与用户项目；demo 被标记为 `regenerable_demo`，可单独清理。
   删除用户项目数据必须使用独立 purge 操作和强确认。
8. **同版本按内容刷新。** release manifest 记录内容摘要；版本相同但摘要不同也原子替换。
   仓库本地安装入口总是先 build，直接传入源码但产物过期时拒绝静默安装。

## 范围与 Work Items

1. `mcp-runtime-contract`：tool-call 元数据、验证已补齐的 `resources/templates/list`、移除静态 DB 连接、
   Runtime 对话确认与审计。
2. `workspace-project-routing`：canonical workspace、workspace 多项目/default、Session override、
   无可靠上下文时的降级和迁移。
3. `release-install-refresh`：源码构建防呆、content digest、同版本刷新、重启/续接文案。
4. `managed-web-service`：macOS LaunchAgent 的 preview/confirm/status/remove 与 UI/CLI。
5. `safe-uninstall-and-demo-data`：数据分类、安全卸载、显式 demo 创建/重置/移除。
6. `public-readme-and-e2e`：真实截图、README、发行包全新安装/重启/升级/卸载端到端验收。
7. `runtime-service-launch-routing`：把“启动 Molis Work”路由到受管理的常驻服务，把明确的“临时打开”
   路由到前台 Web，并保证 Runtime 不会把服务管理误当作 Goal lifecycle fallback。

依赖顺序：1 → 2；3 与 1 可独立；4 依赖 3 的稳定 launcher；5 依赖项目数据分类；6 最后
消费全部真实行为。共享 catalog、MCP、README 和跨 Work Item 状态由主 Session 串行修改。

## 非目标

- 不通过 Git remote、仓库存在性或目录名定义“项目”。
- 不向用户项目写 marker、`.codex/config.toml` 或其他 Molis Work 文件。
- 不承诺在宿主未提供任何 thread/workspace 信息时自动猜中项目。
- 不把 Web 变成 Goal 流程必经步骤；Web 是可选观察、设置和直接确认入口。
- 不在首轮实现 Linux systemd、Windows service 或云端多用户权限模型。
- 不为旧静态数据库运行模式保留“兼容模式”UI 或长期并行逻辑。

## 验收标准

- 新安装用户从 README 能看到真实 UI、创建可识别 demo，并理解安装、接入、重启和启动
  服务是不同动作。
- 已启用的 macOS Web 服务在终端/Codex Session 关闭后仍运行，登录或电脑重启后恢复；
  未确认时不写 LaunchAgent。
- 本地源码安装不会悄悄复制过期 `dist`；同版本不同内容会刷新并可重复验证。
- Codex stdio MCP 不依赖启动环境中的 `CODEX_THREAD_ID` 才能工作；有 tool-call thread 元数据
  时隔离 Session，有可靠 workspace 时恢复默认项目。
- 同一真实目录的符号链接路径合并；一个 workspace 可关联多个项目；没有可靠上下文时不会
  退化成整机共享绑定。
- 用户在 Runtime 对话中明确确认后可物化 Goal Tree，并留下完整审计；未确认仍被拒绝。
- MCP 客户端调用 `resources/templates/list` 得到合法空列表，不再收到 method not found。
- 默认 uninstall 后用户 catalog/项目 DB 仍在；demo 与程序资产可安全清理；purge 用户数据
  需要独立强确认。
- 旧静态 DB 配置可在用户确认的新接入计划中迁走，生产代码与 UI 不再保留旧运行模式。
- 真实 pack E2E 覆盖安装、Runtime 接入、重启续接、项目解析、对话确认、服务恢复、同版本
  刷新和安全卸载。
- Runtime 收到“启动 Molis Work”会先检查 managed service；macOS 首次常驻安装/旧配置修复先说明
  影响并确认，只有明确“临时打开”才启动会随终端退出的前台 Web，非 macOS 不假装后台化。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/mcp.test.ts tests/project-catalog.test.ts tests/runtime-integration.test.ts
node --import tsx --test tests/install.test.ts tests/web.test.ts tests/e2e.test.ts
pnpm test
pnpm pack --dry-run --json
git diff --check
```

macOS 真实验收使用隔离的 Molis Work home 与专用 LaunchAgent label，验证终端退出、进程异常退出、
登录启动、status 和 remove；不得改写真实项目 DB。

### 最终本机“全新用户”验收

功能与自动化验证完成后，用户已明确授权在当前机器执行一次真实清场和复原：

1. 先只读列出并核对 Molis Work-owned 范围：`~/.molis-work`、Molis Work 创建的 LaunchAgent、
   Codex/Claude 用户级 Molis Work MCP 与 Skill、以及已知项目目录中遗留的 Molis Work 专属配置。
2. 删除上述 Molis Work 安装、数据和接入；项目源码及与 Molis Work 无关的配置不在授权范围。
3. 不把旧 home/DB 偷偷作为新安装输入；从真实 pack/release 走公开 README 的正常安装路径。
4. 以新用户身份完成 Web 服务启用、Runtime 接入、宿主重启、新建/关联项目、Draft 澄清、
   Goal Tree 确认、执行状态读取、服务重启恢复和卸载保护检查。
5. 最后保留按新流程产生的正常安装与项目状态，让当前机器回到可继续使用的产品状态。

清场是最终验收步骤，不在卸载/迁移实现和自动化测试通过前提前执行。任何无法证明属于
Molis Work 的同名文件或配置都停止删除并单独报告。

## 假设与开放问题

- Codex tool-call `_meta.threadId` 属于可消费的增强信号，但实现必须允许缺失；在支持矩阵中
  记录实测版本，不把 GitHub main 的实现等同于所有已安装版本。
- LaunchAgent 是 macOS 首版唯一“自动恢复”承诺。Linux/Windows 只给明确状态和后续接口，
  不使用 `nohup` 冒充常驻服务。

# Runtime 自然语言启动 Molis Work

## 背景与目标

Molis Work 已提供 macOS 用户级 LaunchAgent 常驻服务，也保留 `molis-work-web` 前台调试入口；
但 Runtime Skill 没有解释用户说“启动 Molis Work”时应该走哪条路。Runtime 可能因此误用前台
进程，并在终端或 Session 结束后让页面悄悄消失。

本 Work Item 要让用户只用自然语言也能得到可预期的启动行为：普通“启动 Molis Work”优先检查并
使用受管理的常驻服务；“临时打开 Molis Work”才运行前台 Web。

## 当前行为与问题证据

- `molis-work service status/install/start/restart` 已能探测、预览和确认 macOS LaunchAgent。
- README 已分别描述常驻和前台命令，但 `skills/goal-advance/SKILL.md` 没有启动意图路由。
- 真实更新验收还发现：LaunchAgent 进程进入 `running` 后端口可能尚未监听，CLI 曾经会提前报告
  成功；这会让 Runtime 返回地址后用户第一次打开失败。

## 范围与关键决策

- 将“启动/打开 Molis Work 页面”的服务管理意图，与 Goal lifecycle 明确分开。
- Runtime 收到普通“启动 Molis Work”后，先只读运行安装目录中的
  `molis-work service status --home ~/.molis-work --json`，再按状态路由：
  - macOS `absent`：用人话说明会安装用户级常驻后台服务、关闭终端后仍运行、登录后自启；只有
    用户在当前对话明确确认，才执行 `service install --confirm`。
  - `stopped`：用户的“启动”已经明确授权启动现有 owned 服务，执行 `service start --confirm`。
  - `running`：不重复启停，只返回 `http://127.0.0.1:4173`。
  - `unhealthy`：说明进程存在但页面不可访问，按用户已明确提出的启动意图受控执行
    `service restart --confirm`，失败时返回日志位置。
  - `needs_repair`：说明会更新 Molis Work 自己的旧 LaunchAgent 配置并重启；取得明确确认后执行
    `service install --confirm`。
  - `unavailable` / `conflict`：解释缺少启动器或 ownership 冲突，不覆盖未知配置，不切换到另一份
    数据或服务。
  - 非 macOS `unsupported`：明确说明当前没有系统级常驻服务；只有用户进一步明确说“临时打开”
    时才运行前台 Web。
- 用户明确说“临时打开 Molis Work”时，直接运行 `molis-work-web --home ~/.molis-work` 并说明它依附
  当前终端/Session，关闭后会停止。不得用 `nohup`、后台 shell 或相似方式冒充常驻服务。
- install/start/restart 只有在 `/health` 已可访问后才返回成功，Runtime 再返回页面地址。

## 非目标

- 不让 CLI、SQLite 或服务管理命令创建、选择、澄清、修改或完成 Goal。
- 不把服务启动当作 `molis_work_v1` MCP 不可用时的 Goal lifecycle fallback。
- 不在本轮实现 Linux systemd 或 Windows service。
- 不自动覆盖未知或用户改写的 LaunchAgent。

## 输入、输出与依赖

- 输入：用户在当前 Runtime 中明确提出的“启动 Molis Work”或“临时打开 Molis Work”。
- 状态输入：`molis-work service status --json` 返回的 managed service detection。
- 输出：已健康可访问的本机地址、一次待确认的常驻安装/修复说明，或可行动的失败解释。
- 依赖：稳定的 `~/.molis-work/bin/molis-work` 与 `molis-work-web` 启动器；macOS LaunchAgent provider。

## 修改边界

- `skills/goal-advance/SKILL.md` 与一个按需读取的服务启动 reference。
- `skills/goal-advance/agents/openai.yaml`（若 Skill 面向用户的触发说明变更）。
- `README.md`、外部发布验收记录。
- Skill 内容测试、服务健康就绪测试与发行包 E2E 文档断言。

## 验收标准

- Skill 明确区分普通启动与临时打开，并规定先查 managed service 状态。
- 首次安装常驻服务前，用户清楚知道持久化效果且必须明确确认。
- 已停止、已运行、旧配置、冲突和非 macOS 均有唯一、可理解的路由。
- 进程存在但页面不可访问时不会显示“运行中”，而是提供受控重启。
- Runtime 不会把 `molis-work-web` 前台进程说成后台服务。
- Runtime 不会把服务管理命令用于 Goal lifecycle 或绕过 MCP。
- service install/start/restart 等到页面健康可用后才宣称成功。

## 验证

```bash
node --import tsx --test tests/service.test.ts tests/mcp.test.ts tests/e2e.test.ts
pnpm typecheck
pnpm test
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm pack --dry-run --json
git diff --check
```

## 假设与开放问题

- Runtime 可以执行用户明确请求的本地安装/服务命令；这项权限不延伸到 Goal 数据操作。
- 页面当前固定监听 `127.0.0.1:4173`。未来支持自定义端口时，服务状态与健康检查需返回实际 URL，
  Skill 不应自行猜端口。

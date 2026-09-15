# macOS 用户级 Web 常驻服务

## 目标

Web 不再依赖某个终端或 Codex Session 活着；用户明确启用后，它在 macOS 登录时启动、异常
退出后恢复，并能从 UI/CLI 查看和移除。

当前实机证据：LaunchAgent 默认 `PATH` 不包含 NVM 的 Node，`#!/usr/bin/env node` 启动器会以
127 退出；`launchctl print` 对崩溃重试中的任务仍返回成功，不能据此宣称 Web 正在运行；
`bootout` 后立即 `bootstrap` 会短暂返回 37，需要只对这个“操作仍在进行”状态做有限重试。
真实更新验收还发现：LaunchAgent 已进入 `running` 后，Web 端口可能仍有短暂时间没有开始监听；如果
CLI 此时先打印“启动/重启成功”，用户立刻打开页面会看到一次连接失败。因此进程状态不是完成条件，
公开成功结果还必须等待 loopback `/health` 返回可用。

## 范围

- 建立 service provider 接口，首版实现 macOS LaunchAgent。
- plist 只执行 `~/.molis-work/bin/molis-work-web --home ~/.molis-work`，使用稳定 launcher；日志写入
  `~/.molis-work/logs`，监听仍限制 loopback。服务环境显式包含安装时 Node 所在目录，不能依赖
  交互式 shell 的 PATH。
- UI/CLI 提供 detect、preview、confirm install/start/stop/restart/remove 和 status。
- 未确认不写 `~/Library/LaunchAgents`；写入前展示路径、label、命令、日志和恢复行为。
- owned receipt/hash 防止覆盖或删除用户修改的同名服务。
- 状态检测区分“LaunchAgent 已加载”和“Web 进程正在运行”；owned 旧配置可预览修复，修复失败
  恢复原配置。
- 进程运行但 `/health` 不可访问时状态为 `unhealthy`，不把页面错误显示成正常运行；Web 诊断页
  提供受控重启入口。
- install/start/restart 在确认 LaunchAgent 进程运行后继续有限等待 `http://127.0.0.1:4173/health`；
  只有页面已可访问才返回成功，超时则给出日志位置明确报错，不能先打印成功。
- 非 macOS 返回明确 unsupported；不使用 nohup 或后台 shell 伪装常驻。

## 验收

- 关闭启动它的终端和 Codex Session 后 Web 仍可访问。
- 进程异常退出会恢复；用户登录/电脑重启后自动启动。
- 重复安装幂等，冲突不覆盖，remove 只删除 owned 配置。
- 崩溃重试中的 LaunchAgent 不显示为运行；服务配置升级后能加载新环境，失败时不丢失旧配置。
- 延迟监听端口时 CLI 会等待；健康检查始终失败时 install/start/restart 返回失败，不宣称页面可用。
- stop 与 remove 语义不同；日志和失败原因可从诊断页看到。

## 修改边界与验证

- 新 service 模块、CLI、Web 设置/诊断、安装 manifest/receipt 和相应测试。

```bash
node --import tsx --test tests/service.test.ts tests/web.test.ts tests/install.test.ts
pnpm typecheck
```

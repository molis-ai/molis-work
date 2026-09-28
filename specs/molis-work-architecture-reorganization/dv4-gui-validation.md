# DV4 真实桌面安装验证（2026-09-06）

本次为真实 macOS App/LaunchAgent 操作，不是 mock service 或仅 HTTP/单测。DV4 未完成；`dv4-result` 结论为 inconclusive，不以部分通过替代完整验收。

## 授权与隔离

用户在明确的“临时暂停现用 4173、用隔离数据测试、恢复原服务”问题后回复确认。仅暂停原受管服务，没有升级用户 Home、修改 Runtime 配置、操作用户项目或安装到用户 Applications。原服务在正常系统权限下 detect=running/owned=true；普通沙箱看不到进程身份而报 conflict，不据此绕过所有权检查。

测试根目录 `/private/tmp/molis-work-dv4-gui.M0ty9M`。测试 Home 是其 `user/.molis-work`，App 是其 `installed-apps/Molis Work.app`。原 plist 与服务/安装收据先保存独立备份，结束后直接比较字节，没有使用 checksum 冒充行为证明。测试由有界恢复脚本管理，异常/超时进入恢复路径。

## 已通过的真实路径

1. 当前工作区 `env -u APPLE_SIGNING_IDENTITY pnpm desktop:build:macos` 完整成功：workspace/root/PTY、官方 Node 24.14.0 下载校验、Tauri、App/DMG/zip、codesign。实际签名 ad-hoc，未公证/发布。日志 `build.log`，构建进程退出 0。
2. 正式 `install-macos-app.sh` 只读挂载新 DMG 并安装到本次临时目录；挂载正常解除。不是复用 9 月 5 日、早于最新 Goals 迁移的旧 App。
3. 07:25:17 UTC 原受管服务停止。启动实际已复制 App 后，由 App 内置安装器完成新 Home 安装和测试 LaunchAgent 启动；07:25:33 health 返回独立进程 23536、project_count=0、desktop_tui=true。诊断 UI 显示版本 0.1.14、临时 Home/Release、CLI/MCP/Web 可用、临时 plist 与服务运行中。
4. 实际 App 首次显示完整引导；点击“跳过”进入空项目选择页，再进入设置和诊断。没有导入用户项目或伪造项目数据。原用户项目未出现在临时 Home 中。
5. 07:27:12 使用测试 Home 的正式 CLI 停止测试服务。App 健康监控约 21 秒后恢复新进程 23918，实际诊断页面重新加载。此时 App 使用自有子进程而非 LaunchAgent，诊断页如实显示配置冲突；不能把这等同于常驻服务恢复完成。
6. CUA 对实际 App 执行 Cmd+Q，App 退出码 0，恢复出来的自有 Web 子进程也退出、4173 无健康响应。重开同一 App 后进程 24073 启动 Web 24092，显示项目选择页，已跳过引导状态保留，没有再次替换同版本安装。
7. 07:28:26 退出测试 App 并通过正式 CLI 移除测试服务；只移除本次临时 plist/服务收据，测试数据和日志保留。07:28:27 原启动器 start 成功，原 service running/owned=true/health ready。原 plist、web-service.json、installation.json 与开始前逐字节一致。真实服务中断约 3 分 10 秒。

原始时间/进程/服务收据：测试目录 `session.jsonl`；App stdout/stderr 为 `app.log`、`app-error.log`。CUA 的首启、诊断、断线恢复、重开截图与 AX 树保留在本对话工具记录。未触碰原项目数据；本次没有读原数据库作替代 lifecycle 验证。

## 未通过与证据边界

- 在诊断页点击“重启”，鼠标/AX 和键盘尝试均没有出现确认框，也没有执行重启。保留失败，不按通过提交。
- 当前 `apps/workbench/src/scripts/settings.ts:185` 调用 `window.confirm`；与 HEAD 相同。Desktop main/web_service/Cargo.toml/Cargo.lock 相对 HEAD 无 diff。本地 wry 0.55.1 的 WKUIDelegate 未实现 JavaScript confirm panel，而 WebKit 协议声明了对应入口。这支持“原有 Native WebView 确认框兼容缺口”的根因判断，但不是迁移前 App 同路径实测；不把源码相同升级为全量无损证明。
- 原 Web diagnostics 测试直接调用 plan/confirm HTTP，service 用 launchctl fixture；只能证明这些端口及状态行为，不能证明 Native App 中用户能看到并操作确认框。
- 另一个待验证影响：Web confirm handler 在当前服务进程中直接执行 service restart/stop；若先终止自身，真实返回/完成行为需要专门验证。此项目前是源码风险，不报告为已经复现的失败，不顺手新增后台任务系统。
- 修复原生确认交互、确认后的真实服务操作与恢复，需要明确作为修复纳入范围；不能通过自动同意、移除按钮或调用 CLI 代替 UI 验收。后续仍需已安装宿主升级/恢复、全部三项 DV4 验收及最终全产品 E2E。

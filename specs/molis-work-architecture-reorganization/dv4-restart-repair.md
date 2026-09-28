# DV4 桌面重启修复

用户于 2026-09-06 明确回复“修”，授权修复桌面确认框和确认后的真实重启。原“临时暂停现用 4173、隔离 Home、测试结束恢复原服务”授权继续有效；未授权更新原用户 Home 或 Runtime 配置。

## 根因与实现

1. WKWebView 没呈现旧 `window.confirm`。Workbench 的服务设置现使用独立 HTML dialog，沿用既有样式；取消为默认焦点，Escape 等同取消，动态路径仅以文本渲染，禁止重复提交。只替换服务操作，不影响 Runtime 接入及其他确认流程。
2. 首轮 App 实测弹窗/取消成功后，确认重启导致 PID 35006 退出、LaunchAgent stopped、页面 `Load failed`。旧代码 bootout 自己以后没有机会执行后续 bootstrap。
3. Local Host 新的 `confirmFromWeb` 仍消费同一份预览并验证快照/所有权。仅当 restart 目标正是当前受管 Web 进程时，返回 HTTP 202 / `restarting`，Web 发完响应后调用一次性操作，交给 launchd `kickstart -k` 重启已加载的 job。启动/停止的系统命令仍归 `WebServiceProcess`，不在 UI/HTTP 写第二套管理器。
4. Workbench 不把 202 当成功。短暂断线、旧 PID、非受管监听都不能通过；新 PID 健康且服务 owned/running 后才提示连接恢复。30 秒未满足条件则显示诊断建议、不自动重复重启。CLI/非自身操作保留同步原语义，没有新增 job 存储或后台服务。

## 定向验证

- `tests/service.test.ts` + `tests/web-service-settings-client.test.ts`：34 通过、0 失败。覆盖延后执行、单次派发、重复确认拒绝、取消、陈旧预览、文件保留、非自身同步操作、连接中断、旧 PID、非受管进程、超时、UI 错误与重复点击。DOM ports 调用实际生产脚本，不称其为浏览器 E2E。
- Web diagnostics HTTP 回归：1 通过、0 失败；实际响应 202 / restarting，再执行 kickstart；原安装/修复路径仍通过。测试服务使用随机端口及模拟 launchctl，不冒充真正进程重启。
- 根 TypeScript 与包构建通过。boundary check：48 packages、518 sources、1599 imports、71 edges、0 errors。
- 日志：`/private/tmp/dv4-restart-final-tests.log`、`/private/tmp/dv4-restart-final-web-test.log`、`/private/tmp/dv4-restart-boundaries.log`。

## 真实 App 第一轮

临时根 `/private/tmp/molis-work-dv4-restart.qh3fLD`。当前源码完整 build/App/DMG/zip/codesign 通过，正式安装脚本复制已签名 App 至新临时目录。07:55:02 UTC 暂停原服务，App 34981 / managed Web 35006 首启，项目数 0。实际诊断显示临时 Home/Release。重启预览显示；Escape 取消后 PID 35006 不变。07:56:52 确认后观察到 stopped/health=null，页面 `Load failed`，这是第二项根因的实测证据。

恢复时，CUA 在 Cmd+Q 后读取 App 会重新打开该应用且不保留隔离环境，导致测试 App 意外以默认 Home 启动原 Web 子进程（35563/35564）；没有安装升级/项目写入。恢复脚本正确拒绝覆盖未知监听。只读确认该监听来自本次临时 App 后，再次退出 App且不追加 App 观察；原正式 CLI start 恢复 running/owned，原 plist、服务收据、安装配置与备份逐字节一致。第二轮必须退出后只从测试管理进程检查退出，不调用 App 观察造成重新启动。

## 最终 App 验收

测试根 `/private/tmp/molis-work-dv4-restart-final.u1Gqg1`。最终完整 macOS 构建和正式 DMG 安装通过，Node 下载校验、App/DMG/zip、codesign 均通过（ad-hoc，非公证）。日志 `/private/tmp/dv4-restart-final-build.log`。

- 08:07:17 UTC 暂停原服务；08:07:31 隔离 App 首启完成，App PID 48274、受管 Web PID 48298、project_count=0。
- 实际点击“取消”，回到诊断页，08:08:21 核对 PID 仍为 48298、owned/running=true。
- 实际确认后 UI 显示“正在重启常驻服务，等待新进程就绪…”。08:08:54 新 PID 48829 / service_process_id 48829，owned/running=true。页面随后自动回到正常诊断，无 `Load failed`，不是 CLI 代点或备用自有 Web 子进程。
- Cmd+Q 后 App 退出码 0；受管服务 48829 继续运行。以同一隔离环境重开 App PID 49029，沿用健康服务，显示已跳过引导的空项目页，没有再次安装。
- 08:09:48 移除测试服务成功；08:09:49 原服务 running/owned 恢复。原 plist、service receipt、installation 配置逐字节未变。此次中断约 2 分 33 秒。测试 App 已退出，测试服务配置已移除，临时数据与日志保留。

CUA 实际页面与截图保留在本对话，进程/服务记录在测试根 `session.jsonl`。本条修复达到真实桌面功能可用，验收通过。用户在测试期间另行补充首次引导标题栏重叠/对齐问题，作为独立修复继续处理，不改变本条已验证行为。

本报告只证明该修复。未更新 `/Users/yijunwang/.molis-work` 安装、未发布、未公证；不替代 DV4 其余安装更新收尾或总重组的全产品 E2E/清理/架构总审。

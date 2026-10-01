# 验收记录（2026-09-09）

基准：main 7b00098；使用上一轮由新结构生成的 0.1.14 独立 tarball。当前结论：发行包安装与目标协议闭环可用，尚不能宣称内部完整；桌面首次启动和实际 Runtime 客户端接入未验。

## 通过
- 在 `/private/tmp/molis-work-acceptance-20260909/consumer` 真正 npm install 发行包，63 个包安装成功，未引用 workspace node_modules。公开依赖与原生依赖经 npm 安装。
- 正式 CLI 从 consumer 安装至临时 Molis Work Home，返回 self_contained；安装本身没有项目或 Runtime 配置写入。
- consumer 移到 consumer-offline 后，原 source 路径不存在；安装后的 CLI help、stdio MCP、Web 启动正常。
- 将既有 runtime-skill-flow 协议场景的 in-process Server 替换为已安装 molis-work-mcp 子进程，保留业务断言；创建隔离项目，经历 Draft、重启、提案确认门禁、执行、文件证据、复核与完成。再次重启后 fulfilled=satisfied，执行 Claim 释放，证据和 Review 各一条，复核 Run 完成。该证据是脚本驱动正式 MCP，不等同真实 Codex 新 Session 接入。
- 独立 Web 4186 浏览器实看目标页面：已完成、完成要求 1/1、完成依据 1 条。终止本轮 Web 并重新启动，再刷新仍保持相同状态。截图检查未发现该页渲染阻塞。
- 原有 tests/runtime-skill-flow.test.ts：1 通过。
- 原有 tests/e2e.test.ts：1 通过，135.7 秒，涵盖 Web 设置、fake Runtime 接入预览/确认、重启、移除和升级。该测试依然使用仓库 tarball + ancestor dependency 布局，不能代替上面的真正 npm 安装证据。

## 未运行与下一步
- 新 debug Molis Work.app 实际启动与首次内置 Runtime 安装未运行。App 的 health、URL、服务端口固定 4173；设置 MOLIS_WORK_HOME 只改变数据目录，仍会接入现用 4173，不能声称隔离桌面验收。
- 现用 4173 PID 62280，运行 `/Users/yijunwang/.nvm/versions/node/v24.14.0/bin/node /Users/yijunwang/.molis-work/releases/molis-work-0.1.14/dist/web/server.js --home /Users/yijunwang/.molis-work`，cwd 为该 release 的 dist/web。未停止或升级它。
- 桌面验收需要暂时让出现用 4173，在临时 Home 启动新 App、观察首次安装/界面/重启，关闭测试进程后恢复原服务。该步骤会短暂影响现用页面，因此本轮等待切换时机确认。
- 真实 Runtime 客户端需独立配置并新建 Session 验证工具与 Skill 加载，当前脚本和 fake executable 无法证明这一点。
- 日用版本未更新，未公开发布；未改生产代码。

## 复现与本地证据
日志：`/private/tmp/molis-work-acceptance-{npm,cli,protocol,installed-flow,e2e,web,web-restart}.log`，安装回执 `/private/tmp/molis-work-acceptance-install.json`。
隔离数据与文件：`/private/tmp/molis-work-acceptance-20260909/`；MCP 运行脚本 `/private/tmp/molis-work-installed-flow.mjs`（再次运行需新 Home，不能在已完成数据上重放创建）。`workspace/final-contract.json` 保存最终事实，`workspace/result.md` 是协议场景验证的文件证据。
原有 `desktop/20260902-022934.jpg` 删除保持未提交，本轮只新增验收 spec 和记录。

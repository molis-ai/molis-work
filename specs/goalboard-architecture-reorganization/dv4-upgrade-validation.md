# DV4 旧安装升级与重装验证

2026-09-06。结论：真实 0.1.13 → 当前 0.1.14 的普通项目升级链已通过；实测发现并修复 Listener 初始化遗漏。普通卸载保留项目、实际 App 重装后恢复内容也通过。本文不是整体重组、全部业务 E2E 或公开发布资格证明。

## 实际发现的问题与修复

首轮目录 `/private/tmp/molis-work-dv4-upgrade.0qG1fU`，分别用正式脚本安装仓库保留的 0.1.13 DMG 和当前 0.1.14 DMG，没有伪改版本号。旧 App 通过项目设置创建普通项目，并通过 Goal 表单写入名称、结果、原因。新版自动升级成功，受管 Web PID 63873 → 66542，但打开旧项目返回 HTTP 错误 `no such table: listener_instances`。

根因：旧版已记录 Feed 迁移 22/23/24/29；新增 Listener 表只在这些历史迁移入口间接创建。旧项目不会再走这些入口。Web 打开项目时 FeedStore 调用 Listener 的恢复函数，但其构造只初始化 Sources、Attention 和 Feed，没有初始化 Listener。

修复在 `src/feed/store.ts` 的 Sources 初始化后调用既有公开 `migrateListenerHost`。DDL 和旧 cursor 的幂等导入仍归 `horizontal/listener-host`，不复制 SQL、不新增迁移版本号、不改历史迁移标记、不吞掉失败。已有 Listener 游标不会被旧 cursor 覆盖。开发说明已补充到 Listener README。

## 修复敏感的回归

`tests/feed-upgrade.test.ts` 构造已执行旧 Feed 迁移、仍缺 Listener 表的项目。实际 HTTP 打开项目包含生产恢复调用，修复前返回 500，日志 `/private/tmp/dv4-feed-upgrade-red.log`；修复后页面和 Board API 正常，原 Goal 保留、旧 Source cursor 导入、后续新 cursor 跨重开保持、Source 不重复。

首次修复后测试误把 Board API 的 `goals[].goal` 当作平铺 Goal，已按真实返回结构修正测试；未改变产品 API 或放宽数据保留要求。最终 Feed upgrade / sources / receive chain 共 14/0/0，日志 `/private/tmp/dv4-feed-upgrade-regression.log`。完整 macOS 构建（48 包/root/PTY、Node 校验、App/DMG/zip、签名完整性）成功，日志 `/private/tmp/dv4-upgrade-fixed-build.log`。边界 48 packages / 518 sources / 1599 imports / 71 edges / 0 errors，日志 `/private/tmp/dv4-upgrade-boundaries.log`。

## 修复后的真实用户旅程

重新建立全新目录 `/private/tmp/molis-work-dv4-upgrade-pass.hwJBE3`，没有复用首轮已打开过的新 schema。旧/新 App 均来自真实 DMG，Home 在本目录 `user/.molis-work`。

1. 旧 App 通过项目设置创建普通项目 `DV4 upgrade retention`，ID `project-bbb79e84-383b-409f-b0b3-5394f51bb44f`。通过 Goal 表单创建 `upgrade-retained-goal`。本次自动输入曾因焦点未切入屏幕外 textarea 而拼进标题；用键盘进入草稿编辑器修正，再保存。后端只读 API 核对保存字段，而不是把输入意图当作事实。
2. 升级前基线：标题 `Preserve team handoff history`；结果 `Keep the original goal text after upgrade and reinstall.`；原因 `Do not lose user work during package migration.`；draft/abstract、revision 1。事件 #2 为创建，#3 为上述修改，修改理由 `Correct keyboard focus in the upgrade test fixture.`。
3. 08:37:54 UTC 退出旧 App 后启动新版；08:38:07 安装清单 0.1.13 → 0.1.14，受管 PID 72850 → 73931，running/owned、project_count=1。实际更新提示正常显示，点击继续后进入原项目，不再报缺表。正文与记录页逐项核对上述内容、标识、创建/修改时间和两条事件均保留。
4. 普通 CLI 卸载预览因实际系统用户的 Runtime 配置缺少该临时 Home 的所有权收据而正确拒绝。未强行删除或修改真实配置。之后使用**已安装产品**的同一卸载 Service/根装配和既有 `RuntimeIntegrationService.userHomeDirectory` 参数，把 Runtime 目录明确设为本次临时 `user`；不是新增生产开关或绕过删除检查。预览 ready/user_project_count=1/purge=false、无 Runtime 删除项；确认返回 uninstalled。08:41:52 程序 release/launcher/安装清单删除，catalog 和普通项目保留，项目 DB 主文件及 WAL 字节不变，收据 complete 且记录同一 user 项目。结果见 `uninstall-result.json`。此处证明已安装服务的卸载流程，不冒充未经隔离的 CLI 命令通过。
5. 用相同新版 App 和卸载后的 Home 再启动，内嵌 Runtime 自动重装，08:42:34 PID 78261 running/owned、project_count=1。实际项目列表、Goal 正文和记录页再次核对，全部字段及两条原始事件仍可阅读。没有通过原始 SQL 或重新 seed 恢复数据。
6. 08:44:41 测试 App 已退出、临时 LaunchAgent 已移除，原 4173 服务恢复 running/owned；原 plist、服务收据、安装清单逐字节不变。记录见同目录 `session.jsonl`。测试数据/日志仍保留，可继续检查；已删除的临时程序已由新版 App 重装恢复。

## 验收边界与剩余工作

- 本轮修复达到真实 macOS arm64 安装升级可用。全部定向测试通过，实际旧版升级/原项目打开/历史读取/普通卸载保留/重装恢复通过；没有修改用户现有 Home、Runtime 配置或 App 安装。
- 既有安装失败事务回滚、npm 独立 consumer、干净构建与供应链材料的证据见 `dv4-progress.md`；重启恢复见 `dv4-restart-repair.md`。这些不同检查不能互相替代。
- DV4 还需要统一核对全部边界、旧职责退出、分发与开发文档后正式 Review。Apple Developer ID/公证、Intel 实机、真实用户 Runtime 新 Session 装载尚不能从本机内部包推断；没有上传/公开发布。
- 根目标仍包含全产品前后端用户 E2E、清理后重复 E2E、最终分包/调用链/Huge Class/开发规范总审。本文不缩减这些要求。

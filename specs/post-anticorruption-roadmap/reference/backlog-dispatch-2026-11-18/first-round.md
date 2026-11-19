# 第一轮三个会话的开工 Prompt

三条线分开认领，可同时开工。每个会话一个写手，浏览器和测试资源沿仓库并行规则使用。[派工总表](README.md) · [批次执行手册](../batch-runbook.md)

## 会话 A · 知识卡恢复

[第 73 批交付](../batches/73.md#batch-73-item-3)

```text
在 Molis Work 做 73-3 的知识卡恢复切片，只接 BL-knowledge-restore-partial-catalog。先读 specs/post-anticorruption-roadmap/reference/batches/73.md 和对应 BL。在独立工作树从最新主线接手，按 #1743 核对 73-3 已有认领，把本切片接回第 73 批。

先用隔离 Home 恢复一份有知识卡的快照。让搜索目录只追到一部分，分别触发首次列卡和后台整理，然后让目录追齐。检查 apps/local-host/src/knowledge-actions.ts 和 horizontal/knowledge/src/organize.ts，找出部分目录被当作完整目录的入口。历史上观察到 14 张卡临时变成 3 张，验收时追踪同一张卡的 ID 和正文。

做完要证明：追赶期间原卡、正文、手改和排除状态都保留，生成次数与额度没有多花；完整目录确认来源真的删除后，仍能正常清理。从 tests/knowledge-fresh-catalog.test.ts 和 tests/knowledge-cards.test.ts 开始，补上能区分这两种情况的回归。交付修复、隔离恢复前后的对照和定向测试结果。把证据交给 73-3，整份 Home 跨版本导入和文件权限另行验收。
```

## 会话 B · Feed 与错过任务

[第 95 批交付](../batches/95.md#batch-95-item-1)

```text
在 Molis Work 推进第 95 批「Feed 与错过任务」。先读 specs/post-anticorruption-roadmap/reference/batches/95.md 和其中三个 BL。在独立工作树从最新主线接手，核对 #1743 和在途 PR，按 95-1 → 95-2 → 95-3 做完这一批。

95-1　从 plugins/native/feed/src/store/sql.ts 开始，把 fromBetterSqlite 改成描述「从项目连接取得数据库接口」的名字，查齐宿主、同步任务、测试和手册，保留事务行为。
95-2　资讯点过「现在做」后马上休眠，超过十分钟才唤醒，也要执行原决定且只执行一次。沿 Feed 的 missed-pulls.ts 和 store/sources.ts 处理持久化，用重启回归证明不会再问。
95-3　Feed、Schedule、助理跟进都按原定时间 due_at 保留七天，一次性提醒同样适用。到期仍未处理的自动跳过并汇总。已补做或手动跳过的排除在汇总外。

用隔离库和受控时钟测刚满七天、关机跨期、结果超过一页、点击「现在做」和到期同时发生、重启后不重复。至少跑 tests/mainline-missed-runs.test.ts、tests/schedule-missed-runs.test.ts 及受影响的 Feed 测试。各来源维护自己的处理记录，沿现有界面显示汇总。交付三项结果、变更文件、测试证据和实际界面表现。
```

## 会话 C · 关闭页面与连接

[第 93 批交付](../batches/93.md#batch-93-item-1)

```text
在 Molis Work 推进第 93 批「关闭页面与连接」。先读 specs/post-anticorruption-roadmap/reference/batches/93.md 和其中两个 BL。在独立工作树从最新主线接手，核对 #1743 和在途 PR。

93-1　沿 tests/security-invariants-plugin-pages.test.ts 的 RAC-2442，在同一插件页同时挂起两个请求。分别测试正常离开和权限被收回。离开时两个请求都得到 actions.cancelled，撤权时都得到 actions.forbidden。还要断言每个请求持有独立的错误对象。若当前实现不满足，修 apps/local-host/src/plugin-page-authority.ts 的对应关闭路径。

93-2　从 apps/local-host/src/browser/browser-socket.ts 的 watch／attach 入手，用可控的异步检查稳定制造「先断开、后完成项目检查」。验证已经关闭的连接不会挂上页面监听，活连接仍正常收消息，项目校验和消息顺序保持原约定。

跑 tests/security-invariants-plugin-pages.test.ts、tests/side-panel-browser.e2e.test.ts 和新增的定向回归。涉及浏览器时用项目测试浏览器及隔离 Home。交付两条可重复的验证结果，说明每条是补回归还是也修了实现。
```

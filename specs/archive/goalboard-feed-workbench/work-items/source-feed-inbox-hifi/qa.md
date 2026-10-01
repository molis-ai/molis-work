# 来源、Feed 与 Inbox 高保真 QA

日期：2026-08-30

Goal：`draft-8f160677-f8f8-4f2b-935d-0881edb3aba3`

## 自动校验

- `CI=true pnpm typecheck`：通过。
- `node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts`：81/81 通过，0 失败。
- `git diff --check`：通过。

## 浏览器校验

- 桌面 1440 × 900：来源目录—详情、Feed 列表—详情均可操作。
- 窄屏 720 × 820：来源目录 → 来源详情、Inbox 列表 → 处理详情均可完成。
- 窄屏 `document.documentElement.scrollWidth - window.innerWidth = 0`，无横向溢出。
- Feed 演示消息加入 Inbox 后明确显示去向，同时说明原消息仍留在 Feed。
- Inbox 来源故障显示“为什么进入 Inbox / 关联对象 / 下一步”，并可返回 Gmail 来源详情。
- 原型动作统一标注“演示”或“模拟”，页面明确说明不会连接账号、写入数据库或启动后台任务。
- 浏览器错误日志：0 条。

## 来源工作台检查

来源以一级目录进入目录—详情工作台；目录支持搜索和状态筛选，并展示账号或接入源、状态、上次与下次拉取。详情提供概览、配置、拉取计划、来源消息和运行状态；新增或授权仍作为次要动作，不阻塞日常管理路径。对应截图：`project://.impeccable/review/infoflow-source-desktop.png`。

## Feed 工作台检查

GitHub、Gmail 与 RSS 消息进入同一事实流；列表和详情保留来源与时间。详情提供加入 Inbox、保存资料、升格 Goal、忽略，动作后显示当前去向，并明确加入 Inbox 不会删除 Feed 原消息。对应截图：`project://.impeccable/review/infoflow-feed-desktop.png`。

## Inbox 工作台检查

Inbox 的代表状态覆盖 Feed 引用、来源故障与 Goal 决定；详情展示为什么进入 Inbox、关联对象和下一步。完成后条目退出默认待处理列表；来源故障可返回 Gmail 来源详情。对应截图：`project://.impeccable/review/infoflow-inbox-narrow.png`。

## 视觉证据

- `project://.impeccable/review/infoflow-source-desktop.png`
- `project://.impeccable/review/infoflow-feed-desktop.png`
- `project://.impeccable/review/infoflow-source-narrow.png`
- `project://.impeccable/review/infoflow-inbox-narrow.png`

## 尚待人工判断

“无需额外解释即可分辨来源、Feed、Inbox 的职责和数据去向”要求产品判断，Runtime 不代替一骏给出结论。

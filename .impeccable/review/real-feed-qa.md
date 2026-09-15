# 真实 Feed 工作台 QA（2026-08-30）

Molis Work Goal：`goal-infoflow-real-feed`

## 浏览器环境

- 临时本地服务：`http://127.0.0.1:4182`
- 项目：`project-aeb51deb-e335-403b-80cc-387e20e0e000`
- 生产项目数据（`demo=false`）：13 个来源、195 个 canonical FeedItem、49 个 Inbox/决定条目。
- 浏览器控制台：0 条错误或警告。

## 桌面检查

- Feed 目录和侧栏均显示 195 条，已消除旧兼容投影导致的 `156 / 195` 计数不一致。
- 真实详情显示来源、已读状态、当前去向、时间、正文/摘要、标签、材料和 HTTP(S) 原文链接。
- 详情中只有四个 Feed 去向动作：`加入 Inbox`、`保存为资料`、`升格为 Goal`、`忽略`；没有把 Inbox 的“开始处理”混入 Feed。
- 筛选器包含来源、类型、时间、状态和排序。选择 `RSS / Atom` 后可见 165 条，逐条来源标签均属于 RSS 来源；没有 Gmail、GitHub 或其他类型混入。
- 搜索不存在的关键词后显示稳定空态：`没有符合当前条件的 Item`，可用 `清除筛选` 恢复，原 Item 未删除。

## 窄屏检查

- 请求 viewport `390×844`；受 Codex App 浏览器外壳占用后页面实际内容区为 `312px`。
- `documentElement.scrollWidth === clientWidth === 312`，无横向溢出。
- 导航切为 `目录 / Feed / 详情 / 运行`；Feed 列表和详情分别可达。
- 窄屏详情仍保留四个去向动作、来源追溯和原文入口。

## 加载、失败与恢复

- 选择真实 Item 时先显示 `正在载入 Item… / 只读取当前选择的正文和资料。`，详情按需请求，不在列表首屏读取全部正文。
- 停止临时服务后选择另一条真实 Item，页面显示 `Failed to fetch`、`这条 Item 仍然保留，点击重试即可。` 和 `重试` 按钮。
- 恢复服务并点击 `重试` 后，错误消失并恢复到带 `加入 Inbox` 的真实详情；浏览器控制台仍为空。
- 动作 pending、revision 冲突与可恢复错误文案由 `tests/desktop-tui.test.ts` 和 `tests/web.test.ts` 锁定。

## 自动化证据

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`：通过。
- 受影响测试：108/108 通过。
- `CI=true pnpm typecheck`：通过。
- `CI=true pnpm build`：通过。
- `CI=true pnpm test`：335/336；唯一失败为既有 `tests/i18n.test.ts` 英文静态文案词典缺口，未出现 Feed 数据、动作、Web、响应式或安全回归。
- `git diff --check`：通过。

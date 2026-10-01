# 引用式 Inbox 处理闭环

Molis Work Goal：`goal-infoflow-attention-inbox`

完成等级：4（Inbox 工作台达到内部完整；Provider 真实授权与联网恢复分别由 GitHub/Gmail/RSS Goal 验收）

## 背景与目标

Inbox 不是第二个 Feed。它只保存“为什么现在需要一骏介入”的引用：手工加入的 Feed 消息、来源规则命中的 Feed 消息、Molis Work 内部待决定事项、需要人工恢复的来源故障。正文和外部事实继续由 FeedItem、Goal 或 Source 拥有。

本 Work Item 把当前兼容式 Inbox 列表改为 `InboxEntry` 驱动的处理工作台。默认列表只显示 `open / in_progress`；完成和忽略进入可追溯历史；每条详情必须说明进入原因、关联对象和下一步，并能回到原对象处理。

## 当前问题证据

- `src/web/render.ts#feedDirectoryEntries` 只用 active Feed 兼容投影生成 Inbox 行，忽略 `source_fault`、持久化 `goal_decision` 和已完成/已忽略的 `InboxEntry`。
- Inbox 行展示的是 FeedItem 的 disposition，不是 InboxEntry 自己的状态、原因和 revision；用户看不出“为什么进来”。
- 默认 `active` 筛选只排除 archived，已保存和最近结果仍会混在待处理列表里。
- 详情动作直接复用 Feed 的“开始处理/保存/升格/归档”，没有独立的完成、忽略和历史恢复语义。
- 来源删除或原 FeedItem 不可用时没有明确的异常引用详情。

## 范围

### 包含

- `InboxEntry` 列表投影：Feed 消息、Goal 决定、来源故障，以及完成/忽略历史。
- 每项显示进入原因、原对象、当前状态、下一步和时间，不复制 FeedItem 正文。
- 回到原 Feed、Goal 或 Source；开始处理、完成、忽略、重新打开均使用 InboxEntry revision 幂等写入。
- FeedItem 存在、归档、删除；Source 正常、断开、保留历史、删除历史；Goal 存在或不可用的引用解释。
- 默认只显示 `open / in_progress`；全部状态可查看 `done / dismissed` 历史。
- 桌面与 760px 以下目录 → Inbox 列表 → 详情路径，以及首次、空、筛选无结果、加载、失败、完成和恢复反馈。

### 不包含

- 复制外部正文到 Inbox。
- 自动判断所有邮件/通知都需处理。
- 新的通用任务管理系统。
- Provider 的真实 OAuth、联网拉取或服务端修复动作。

## 方案与关键决定

### 1. 所有权

- `FeedItem`、Goal、Source 继续拥有事实和内容；`InboxEntry` 只拥有 `reason / status / detail / subject reference`。
- FeedItem 进入 Inbox 后仍保留在 canonical Feed。Inbox 详情可显示原消息摘要，但不新增正文列或正文副本。
- Molis Work 的实时待决定卡仍由其 canonical 决定记录渲染；若存在持久化 `goal_decision` InboxEntry，则它作为引用显示，并回到对应 Goal/决定流程。

### 2. 状态与动作

- `open`：默认待处理；`in_progress`：正在原对象中处理；两者出现在默认 Inbox。
- `done`：已完成；`dismissed`：已忽略；仅在全部/历史状态筛选中出现。
- 状态写入需要 expected revision；重复写入同一状态不增加 revision。
- 历史条目可重新打开；Feed 原消息、Goal 或 Source 是否仍存在会单独解释，不伪造可用入口。

### 3. 四类进入路径

- 手工 Feed：Feed 中“加入 Inbox”创建 `reason=manual`。
- 来源规则 Feed：Provider/规则显式命中才创建 `reason=source_rule`。
- Goal 决定：引用对应 Goal，实际决定仍在 Molis Work 决定流程完成。
- 来源故障：仅不可自动恢复且需人工处理的故障创建；只保存稳定错误分类和用户动作，不复制 Provider 错误文本。

### 4. 删除与异常引用

- 保留历史删除 Source 时，Inbox 显示“来源已停止，历史仍保留”；删除本地历史后显示“原来源和本地消息已删除”。
- FeedItem 不可用时显示异常引用，不显示伪正文；完成/忽略历史仍可解释。
- 原对象不可用不影响 InboxEntry 自身历史，也不能生成悬空正文副本。

## 输入、输出与模块边界

- `src/feed/store.ts`：InboxEntry 状态转换、幂等重开和引用完整性读取。
- `src/web/server.ts`：InboxEntry 详情和状态 API。
- `src/web/render.ts`：引用式目录、详情、原因/关联/下一步、默认/历史筛选与原对象跳转。
- `src/web/visual-foundation.ts`：引用状态、异常引用、桌面/窄屏布局。
- `tests/feed.test.ts` / `tests/feed-contract.test.ts`：状态与无正文复制。
- `tests/web.test.ts` / `tests/desktop-tui.test.ts`：四类引用、真实动作、错误恢复和响应式结构。

## 验收标准

- [ ] 手工 Feed、来源规则、Goal 决定、来源故障均可形成可解释的 Inbox 引用；详情有原因、原对象、状态和下一步。
- [ ] InboxEntry 不复制消息正文；Feed、Goal、Source 仍是事实所有者。
- [ ] 默认只显示 open/in_progress；完成或忽略退出默认列表但保留历史，重复操作幂等，可重新打开。
- [ ] 可进入原 Feed、Goal 或 Source 完成相应处理；原对象不可用时显示明确异常引用。
- [ ] 来源保留历史、删除本地历史、Feed 归档/缺失等引用状态有测试。
- [ ] 桌面与窄屏路径、首次/空/错/慢/完成/恢复状态可用；类型、构建与受影响测试通过。

## 验证命令

```bash
CI=true pnpm typecheck
node --import tsx --test tests/feed-contract.test.ts tests/feed.test.ts tests/feed-sources.test.ts tests/web.test.ts tests/desktop-tui.test.ts
CI=true pnpm build
git diff --check
```

浏览器验证：四类真实/测试引用、默认与历史筛选、三类原对象跳转、完成/忽略/重开、异常引用，以及桌面与 390px 窄屏。

## 假设与开放问题

- 现有 Goal 决定卡继续直接渲染完整决定表单；InboxEntry 只提供稳定入口，不复制决定内容。
- “完成”表示当前注意力事项已处理，不自动修改原 FeedItem 的事实状态；在原对象执行保存/升格/忽略时，现有联动仍会完成对应 active InboxEntry。
- 来源恢复后自动完成旧故障引用属于 Provider Goal；本 Work Item 提供可解释状态和手工完成/重开。

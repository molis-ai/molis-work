# 拆除 Relay 导入与兼容层

## 背景目标

Molis Work Feed 已经自己管来源、同步、凭据和正文。界面和代码里还留着对旧产品 Relay 的一次性迁移：探测本机 `relay.sqlite`、解密 Relay 密钥、把历史 Item 迁进来，以及 `origin: "relay"` 这类兼容标记。

目标：运行时不再认识 Relay。完成等级 **3：功能可用**。不改用户真实库、不发布。

## 当前行为与问题证据

- 来源设置里仍有「从 Relay 迁移历史」和确认对话框。
- `POST /api/feed/import`、Host `detectRelayImport` / `importRelayData`、Storage `openRelaySecurity` 会读本机 Relay 数据。
- 每个 Feed snapshot / Web view 都会探测 Relay 数据库路径。
- `feed_sources.origin` 仍允许 `'relay'`；导入会写成 `origin: "relay"`。
- `feed_import_receipts` 与 `upsertImportedItem` 只服务这次迁移。

## 范围与非目标

做：

- 删除 Relay 探测、只读导入、凭据/正文解密、相关 HTTP、UI、文案、环境变量。
- 新来源只写 `origin: "goalboard"`；已有 `relay` 行在打开库时改写成 `goalboard`。
- 去掉导入 receipt 的写入和 snapshot 字段；去掉 `upsertImportedItem`。
- 定向测试改为用 Molis Work 自己的 Feed 数据，不再造 Relay 库。

不做：

- 不删除用户机器上的 Relay App 或 `relay.sqlite`。
- 不改 Infoflow schema 29 / `feed_contract_migration_receipts`。
- 不改 RSS/GitHub/Gmail 日常同步。
- 不改 GitHub 测试夹具里的假仓库名 `example/relay`。
- 不重写历史规划文档里「Relay 产品家族」的旧讨论。
- 不从已有数据库 DROP `feed_import_receipts` 表。

## 使用场景

1. 打开 Feed / 来源设置：没有 Relay 迁移入口，也不去找本机 Relay 库。
2. 已有项目里以前从 Relay 迁入的来源和 Item：仍按普通 Molis Work 数据读写。
3. 添加 RSS / GitHub / Gmail：行为不变。

## 方案与关键决策

- Relay 只是旧产品，不是 Molis Work 运行时依赖；迁移入口整段删除，不做开关、不做只读预览。
- `origin` 列保留，语义收成 `"goalboard"`。新表 CHECK 只允许它；migrate 时把旧值改掉。
- 来源状态 `imported`（Relay 迁入后的「仅历史数据」）打开库时改成 `disconnected`，类型里不再保留。
- `feed_import_receipts` 旧表可留在已有库里，新库不再创建，应用不再读写。schema 迁移收据文件从 `import-receipts.ts` 改名为 `contract-receipts.ts`。

## 输入输出与依赖

- 输入：现有 Feed/Sources 契约、工作台来源对话框、Feed HTTP。
- 输出：不再暴露 Relay 路径、导入 API、导入 receipt。
- 依赖：Sources / Feed Module、Workbench、Local Host、Storage。

## 文件 / 模块边界

允许改：Feed Native Plugin、Local Host 装配、Storage Relay 适配器、Sources origin 契约与 migrate、Workbench UI/i18n/样式、PRODUCT.md 与本 spec 指向的测试。

不改：Goal 事件协议、MCP、安装/发布、用户真实 Home。

## 验收

1. 仓库无 Relay 导入/解密实现（`relay-import*`、`relay-reader`、`relay-security`）。
2. 无 `POST /api/feed/import`、无 `relay_import` 视图字段、无「从 Relay 迁移」界面。
3. 新来源 `origin` 为 `goalboard`；打开旧库时 `origin='relay'` 被改成 `goalboard`，`status='imported'` 被改成 `disconnected`。
4. Feed 已读、处置、Inbox、来源同步测试仍用生产路径，且不再依赖 Relay fixture。
5. 生产代码与公开文案不再把 Relay 当运行时或迁移源。

## 验证

```bash
pnpm exec tsx --test --test-concurrency=1 \
  tests/feed.test.ts \
  tests/feed-security.test.ts \
  tests/feed-native-plugin.test.ts \
  tests/inbox-plugin.test.ts \
  tests/desktop-tui.test.ts \
  tests/session-web.test.ts \
  tests/project-settings-stage.test.ts \
  tests/project-settings-accordion.test.ts \
  tests/web-home-isolation.test.ts
pnpm boundary:check
```

## 验收结果

1. 通过。`relay-import*` / `relay-reader` / `relay-security` 已删除；boundary check 禁止它们回来。
2. 通过。无 `POST /api/feed/import`、无 `relay_import`。来源高级入口只谈捕捉规则，不再写「迁移 / 导入已有历史」。
3. 通过。`tests/feed.test.ts`：`opening sources rewrites leftover origin and imported status`。
4. 通过。`feed.test.ts`、`feed-security.test.ts`、`feed-native-plugin.test.ts`、`inbox-plugin.test.ts`、`web-home-isolation.test.ts` 共 16 项通过。未跑浏览器。
5. 通过。生产 TS/公开 PRODUCT 不再把 Relay 当运行时或迁移源。GitHub 夹具 `example/relay`、Gmail fixture 文案、历史 specs 按非目标保留。

同工作区另有目录插件分区 / 标签工作区未完成改动，`desktop-tui`、`session-web`、`project-settings-*` 与 `boundary:check` 的 Goals `relations.ts` 失败与本项无关，未修。

## 假设与开放问题

- 已迁入的 Item 继续用现有 id；不再提供从 Relay 再刷一次的路径。
- 旧库里空的 `feed_import_receipts` 表可以留着，不单独做 DROP 迁移。

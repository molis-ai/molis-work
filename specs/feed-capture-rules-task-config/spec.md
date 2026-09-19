# Feed 捕捉规则归入任务

## 背景目标

目录「拉取任务」列表底部把「捕捉规则」做成了和「添加任务」并列的全局入口。用户纠正：捕捉规则不属于目录，要放进任务配置；添加任务时一并创建。

完成等级 **3：功能可用**。不改规则求值、Artifact 生产和 HTTP 契约。

## 当前行为与问题证据

- `plugins/native/feed/src/ui.ts` 目录渲染「添加任务」后紧跟 `data-feed-advanced-open`「捕捉规则」。
- 点击后 `showFeedSetup("advanced")` 打开全局规则列表；创建请求不带 `source_id`，规则对所有来源生效。
- 任务配置只含名称、地址、范围、计划、拉取/暂停；添加任务表单不含捕捉字段。

## 范围与非目标

做：

- 目录去掉捕捉规则入口，只留任务列表、任务配置和添加任务。
- 每个真实任务的配置里管理该任务的规则（列表、添加、启用/停用、删除）。
- RSS / 推荐订阅 / 关键词 / YouTube 添加任务时可选填写一条规则，创建任务后带上该任务 `source_id`。
- 创建时把 `source_id` 写入 `match`；任务配置只展示该任务的规则。

不做：

- 不改 `feed_out_rules` 表、求值时机、Artifact 类型或 CRUD API。
- 不自动给每个新任务写一条「捕捉全部」规则。
- 不在本期给 GitHub / Gmail 连接流程加捕捉字段；连接成功后在任务配置里添加。
- 不迁移已有无 `source_id` 的全局规则；它们仍按现有匹配生效，但不再有全局入口。

## 使用场景

1. 打开 Feed 目录：没有「捕捉规则」按钮。
2. 添加网站订阅并填写规则名称/关键字：任务出现在目录，规则只命中该任务的新消息。
3. 添加任务不填捕捉字段：任务照常创建，规则可之后在任务配置里补。
4. 打开某任务配置：只看到该任务的规则；添加/停用/删除只影响该任务。
5. 任务创建成功但规则保存失败：任务不重复创建，提示规则未保存，可重试。

## 方案与关键决策

- 捕捉规则是任务的内容去向，不是目录级设置。
- 添加任务时规则可选；有名称或关键字才创建。只有名称时用该任务 `source_id` 作为匹配（捕捉该任务全部新消息）。只有关键字时规则名称默认用关键字。
- 任务配置里的规则列表按 `match.source_id` 过滤。演示任务只展示、不写真实规则。
- 取消独立 `advanced` 对话框阶段。

## 输入输出与依赖

- 输入：现有 Feed UI overlays、任务配置、添加任务、`POST /api/feed/out-rules`。
- 输出：目录无全局入口；规则创建带 `source_id`。
- 依赖：Feed Native Plugin UI、Workbench 客户端、现有 out-rule API。

## 文件 / 模块边界

允许改：Feed Plugin `ui.ts`、Workbench `navigation-feed.ts` / `events-primary.ts`、相关样式与 i18n、本 spec 指向的测试、`DESIGN.md` 一句产品事实、`specs/frame-task-navigation/spec.md` 中过时的「高级入口」表述。

不改：out-rule 存储与求值、来源同步、GitHub/Gmail 授权协议、目录其它插件。

## 验收标准

1. 目录 HTML 无 `data-feed-advanced-open`，无与添加任务并列的「捕捉规则」按钮。
2. 任务配置含该任务的捕捉规则区块；A 任务的规则不出现在 B 任务配置。
3. 添加任务表单有可选捕捉字段；提交时若填写，则 `POST /api/feed/out-rules` 带该任务 `source_id`。
4. 不填捕捉字段仍可创建任务。
5. 规则保存失败时任务不重复创建，错误可重试。
6. 启用/停用/删除仍走现有 API，且从任务配置触发。

## 验证命令

```bash
node --import tsx --test --test-concurrency=1 \
  tests/feed-native-plugin.test.ts \
  tests/product-interaction.e2e.test.ts
```

## 验收结果

1. 通过。目录无 `data-feed-advanced-open`；浏览器 Feed 目录「拉取任务」下只有「添加任务」。
2. 通过。任务配置含「捕捉规则」；A/B 任务规则互不出现；无 `source_id` 的旧规则不进任务配置。
3. 通过。添加任务表单有「捕捉规则（可选）」；e2e 创建 RSS 任务时写入带该任务 `source_id` 的规则，任务配置可见规则名。
4. 通过。不填捕捉字段的创建/计划失败重试用例仍过。
5. 通过。规则保存失败走独立文案与「重试保存捕捉规则」，不重复 POST 来源。
6. 通过。任务配置内添加/停用/删除仍调用现有 out-rule API，创建带 `source_id`。

`tests/product-interaction.e2e.test.ts` 里 Feed 阅读重叠失败与本项无关，未修。

## 假设与开放问题

- 无 `source_id` 的旧规则继续在后台匹配，直到用户另做清理或迁移。
- GitHub / Gmail 首次连接不创建捕捉规则，避免在尚无稳定 `source_id` 的响应里拼规则。

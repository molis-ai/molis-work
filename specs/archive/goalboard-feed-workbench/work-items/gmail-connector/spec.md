# Gmail 真实来源接入

## 背景与目标

Molis Work 的信息流必须明确区分三层：来源负责连接与配置，Feed 保存来源拉取到的消息，Inbox 只收需要人处理的事情。现有 Gmail 连接器已经具备只读 OAuth、有限首次同步和基于 `historyId` 的增量同步，但仍有两个产品缺口：

- 来源页的“拉取范围”没有参与真实请求，实际固定抓取 `is:unread`。
- Gmail 消息没有明确的关注判定，无法说明一封邮件为何只在 Feed，或为何进入 Inbox。

本 Work Item 达到完成等级 4（内部完整）：用真实 Gmail 账号连接、配置、同步、查看和恢复，且宽屏与窄屏主路径可顺畅试用。

## 当前证据

- `src/feed/connectors/gmail.ts` 的首次同步固定使用 `is:unread`，增量阶段只按 history message id 获取详情。
- `src/feed/sources/service.ts` 会保存 `config.scope`，但 `FeedConnectorService.portFor` 没有把它传给 Gmail 连接器。
- Gmail 详情当前只读取 Subject/From 和 snippet，未保存 Provider 时间、Gmail 原文链接、标签或显式 attention。
- OAuth scope 已限制为 `gmail.readonly`、`openid`、`email`；Token 通过 SecretStore 管理，不写入 Feed Item。

## 用户场景

1. 用户在来源目录看到 Gmail 账号、只读授权和当前邮件范围。
2. 用户进入 Gmail 来源详情，在四个可验证范围中选择一个并保存：
   - 未读收件箱：`in:inbox is:unread`（默认）
   - 全部收件箱：`in:inbox`
   - 星标邮件：`is:starred`
   - 重要邮件：`is:important`
3. 首次同步只读取范围内最近的有限邮件；后续同步通过 Gmail history 增量继续，仍执行相同范围。
4. 所有匹配邮件进入 Feed；只有符合关注规则的邮件同时建立 InboxEntry。
5. 用户从 Gmail 来源进入 Feed 时，系统清除旧搜索并按当前账号来源过滤，确保看到的是刚拉取的真实邮件。
6. 用户能打开 Gmail 原文；断开后不再拉取；授权失效时产生可恢复的来源故障；删除来源时明确保留或删除历史。

## 方案与关键决策

### 范围配置

- 不提供看似灵活但增量阶段无法精确复现的任意 Gmail 搜索语法。
- 只允许四个预设查询。首次同步把预设传给 `users.messages.list`；增量同步根据详情里的 Gmail system `labelIds` 应用同一规则。
- 游标保存非秘密的 `scope` 和 `account_email`。旧游标或范围变化时执行一次有限全量同步，以免沿用错误范围。
- 默认值为 `in:inbox is:unread`，最多列出 50 个候选、读取 25 封详情；不做全邮箱回填。

### Feed 与 Inbox

- 匹配范围的每封邮件建立一个 Feed Item，保留：message id、Subject、From、必要 snippet、Gmail internalDate、system labels、Gmail 原文链接。
- `STARRED` 或 `IMPORTANT` 进入 Inbox。
- 直接发送到当前账号 To/Cc，且不是 `Auto-Submitted`、bulk/list/junk 或带 List-Unsubscribe 的邮件，进入 Inbox。
- 其他邮件显式 `attention: false`，只留在 Feed。
- Inbox detail 只保存规则名、匹配方式与 system labels，不复制主题、正文、sender 或 Token。

### 隐私与恢复

- 只请求 `gmail.readonly`、`openid`、`email`，不发送、回复、改标签或删除服务器邮件。
- OAuth 授权在当前浏览器页进入 Google，完成后由既有 callback 回到当前项目；不依赖可能被拦截的新窗口。
- 日志、Run receipt、cursor 和 Inbox detail 不记录 Token、Provider body 或邮件内容。
- 401 / scope 不足产生 `source_fault`，成功重连和同步后关闭故障；暂时网络错误只留在 Run，不制造 Inbox 噪声。
- 断开立即停止拉取并移除本地凭据；删除来源继续沿用“保留历史 / 删除历史”显式选择。

## 模块边界

- `src/feed/connectors/gmail.ts`：范围解析、Provider 请求、详情映射、关注规则、原文链接与时间。
- `src/feed/connectors/gmail-history-cursor.ts`：安全保存和解析 `scope` / `account_email`，保留增量候选上的元数据。
- `src/feed/connectors/service.ts`：把来源范围交给连接器，并把账号身份与授权说明写回来源。
- `src/feed/sources/service.ts`：校验 Gmail 范围只来自受支持预设。
- `src/web/render.ts` / `src/web/i18n.ts`：来源详情范围选择器、只读权限和当前身份说明。
- `tests/feed-connectors.test.ts`、`tests/feed-sources.test.ts`、`tests/web.test.ts`：行为与回归证据。

## 非目标

- 不发送、回复、归档、删除或修改 Gmail 标签。
- 不读取附件全文，不做 AI 摘要，不回填完整邮箱历史。
- 不支持任意 Gmail 搜索语法或自定义标签名；需要这些能力时单独扩展协议。
- 不对历史遗留 Inbox 项进行猜测式重分类或删除。
- Google 外部发布验证、安全评估与审核不属于本内部试用 Work Item。

## 验收标准

- [x] 真实 Gmail 只读授权后能显示账号身份、授权范围和当前邮件范围。
- [x] 四个范围预设可保存；Provider 首次请求与增量详情过滤执行相同范围；范围变化触发有限全量同步。
- [x] 真实邮件进入 Feed，保留 From、Subject、时间、必要 snippet、system labels 与可打开的 Gmail 链接。
- [x] 星标、重要或满足“直接寄给本人且非自动/群发”规则的邮件进入 Inbox，其余只进入 Feed。
- [x] 同一 message id 在同一 Gmail 来源内幂等；增量 history 游标只在完整成功后推进。
- [x] 401/授权失效产生可恢复 source fault；恢复成功后关闭；断开和删除生命周期继续有效。
- [x] OAuth 启动不依赖弹窗，当前页进入 Google 并在授权后回到当前项目。
- [x] 从 Gmail 来源进入 Feed 会清除旧搜索并按当前账号来源过滤，不会显示其他来源的残留结果。
- [x] 日志、cursor、Run receipt、Inbox detail 不包含 Token 或邮件内容。
- [x] 桌面与窄屏的连接、配置、同步、故障恢复路径可用，无横向溢出；真实 Gmail 原文入口已点验。

## 验证

- `pnpm exec tsx --test tests/feed-connectors.test.ts tests/feed-sources.test.ts tests/feed-contract.test.ts tests/web.test.ts`
- `pnpm build`
- `pnpm test`（若存在与本 Work Item 无关的既有失败，单独列明）
- 使用已连接的真实 Gmail 来源完成至少两次同步，确认首次/增量或去重结果、账号和范围展示、Feed/Inbox 分流与 Gmail 原文链接。
- 宽屏与窄屏浏览器检查来源目录、Gmail 详情和配置状态。

## 假设与开放项

- Gmail system labels `INBOX`、`UNREAD`、`STARRED`、`IMPORTANT` 可从 metadata detail 返回，足以精确执行四个预设。
- 直接收件人规则使用 Profile email 与 To/Cc header 做不区分大小写的地址匹配；群发与自动邮件信号采用保守排除。
- Gmail 链接使用 message id 的 Web URL；若真实账号 smoke 发现多账号槽位需要更精确定位，再在本 Work Item 内调整。

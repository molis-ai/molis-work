# GitHub 通知来源

Molis Work Goal：`goal-infoflow-github-connector`

完成等级：4（真实 GitHub 通知来源达到内部完整；不包含 GitHub 写操作或 Gmail/RSS）

## 背景与证据

现有 `src/feed/connectors/github.ts` 使用 `/issues?filter=all`，它返回 Issue/PR 搜索结果，不是账号通知；adapter 忽略传入 cursor，也没有保存仓库、通知原因、Provider 更新时间、`Last-Modified` 或 `X-Poll-Interval`。账号来源虽然能保存 Token，但首次真实同步前只显示“已连接账号”，无法证明具体身份和实际授权范围。

2026-08-30 对 GitHub 官方文档重新核对后确认：账号通知端点 `GET /notifications` 只支持 classic PAT，要求 `notifications` 或 `repo` scope，不支持 fine-grained PAT、GitHub App user token 或 installation token。`notifications` 是该端点的最小 scope，但 GitHub 同时赋予标记已读和订阅管理能力；Molis Work 必须在界面明确这个 Provider 权限事实，并在代码层只调用 GET。官方文档：

- <https://docs.github.com/en/rest/activity/notifications>
- <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps>

## 目标与用户场景

用户可以连接 classic PAT，或通过 OAuth App Device Flow 授权 `notifications read:user`；完成一次真实同步后，来源详情显示 GitHub 登录名、实际 scope 和“Molis Work 只读调用”的边界。未读通知增量进入统一 Feed，直接需要用户响应的通知才形成 InboxEntry。

## 范围

### 本轮包含

- `GET /user` 验证账号身份，并读取响应中的 scope 元数据。
- `GET /notifications` 拉取未读通知；保留 thread id、仓库、主题、通知原因、更新时间和可打开的 GitHub 原链接。
- 使用 `Last-Modified` / `If-Modified-Since` 和 `X-Poll-Interval`；304 不消耗 Feed 写入，提前轮询不访问 Provider。
- thread id 作为稳定外部身份；同一来源重复拉取不重复写入。
- `assign`、`mention`、`team_mention`、`review_requested`、`approval_requested`、`security_alert` 和 `ci_activity` 才由明确规则进入 Inbox；`subscribed`、`author` 等只进入 Feed。
- 401/无通知权限转为重新连接；网络失败可重试；限流保存下次可尝试时间，保持可信 cursor，且不制造人工故障 Inbox。
- 来源详情展示账号、授权方式、scope、只读调用承诺、最近运行和恢复动作。

### 本轮不包含

- 调用任何写端点、标记通知已读、评论、修改 Issue/PR、watch/unwatch 或订阅管理。
- 使用 `repo` scope 读取私有仓库正文。
- fine-grained PAT / GitHub App 的降级伪装；GitHub 不支持的凭据类型必须得到可行动反馈。
- 全量仓库活动、Issue 搜索或代码内容读取。

## 方案与模块边界

- `src/feed/connectors/github.ts`
  - 只拥有 GitHub HTTP 读取、响应校验、通知标准化和 Provider cursor。
  - 输入：密封凭据在进程内解析后的 Token、上次可信 cursor。
  - 输出：`ConnectorSyncResult`，不返回 Token、Provider body 或任意响应头。
- `src/feed/connectors/types.ts`
  - `ConnectorIngestItem` 增加 Provider 发生时间与显式 attention 规则；没有显式规则的 Item 只进 Feed。
  - 限流失败携带安全的 `retryAfterAt`。
- `src/feed/connectors/service.ts`
  - 原子写入 FeedItem、可选 InboxEntry、可信 cursor、账号/授权非秘密元数据和 SyncRun。
  - 失败不推进 cursor；限流只调整下一次计划，不生成需人工处理的 source_fault。
- `src/feed/connectors/github-oauth.ts`、`src/feed/contract.ts`
  - Device Flow 默认 `notifications read:user`；契约说明 classic PAT 限制和 Molis Work 只读调用边界。
- `src/web/render.ts`
  - 连接 UI 与来源详情如实展示权限限制、账号身份、scope 和恢复状态。

调用链：用户保存 Token / 完成 Device Flow → SecretStore → GitHub Source → 手动或定时 SyncRun → GitHub adapter GET `/user` 与 `/notifications` → FeedConnectorService 原子提交 FeedItem、显式 InboxEntry、cursor 与运行结果 → 来源 / Feed / Inbox 工作台读取同一事实。

## 验收标准

- [x] 真实或可审计 GitHub 响应产生保留仓库、主题、原因、Provider 时间和原链接的 FeedItem。
- [x] 重复拉取、304 和提前轮询均不制造副本，可信 cursor 不倒退。
- [x] 只有明确的直接响应原因进入 Inbox；普通订阅通知只保留在 Feed。
- [x] 账号登录名、授权 scope 和只读调用边界在来源详情可见；Token 不出现在 HTML、日志、Item、事件或测试输出。
- [x] 宽屏与窄屏均可进入 GitHub 连接/重连入口，不依赖隐藏的桌面标题栏操作。
- [x] 401/缺 scope、网络失败、限流与恢复均有定向测试；限流显示下次尝试且不生成需人工处理的 Inbox 引用。
- [x] `pnpm typecheck`、GitHub/Connector/Source/Web 定向测试和构建通过；真实账号 smoke test 只执行 GET。

## 风险与开放边界

- GitHub 的通知 scope 不是严格 read-only。产品只能通过“最小 scope + 只调用 GET + 明示 Provider 边界”降低风险；如果未来 GitHub 提供支持通知的细粒度只读凭据，再迁移授权方式。
- 本地已有 Token 是否具备 `notifications` scope 只能通过真实读取验证；若不具备，来源保持历史数据并提示重新连接，不覆盖可信 cursor。
- 历史迁移的 GitHub InboxEntry 不会被猜测删除；新同步从本 spec 起按明确 reason 规则收敛。

# RSS / Atom 真实来源接入

## 背景与目标

Molis Work 的来源层已经能登记目录 RSS 和自定义 HTTPS RSS/Atom，并通过共享 Intelligence Runtime 解析为 Feed Item；但当前拉取没有持久化 HTTP 条件请求信息，来源详情也看不到订阅自身的标题、站点和最终地址。短暂网络失败还会立刻把来源标成需要人工处理，无法形成内部顺畅使用的恢复体验。

本 Work Item 达到完成等级 4（内部完整）：用户能添加真实 RSS/Atom，连续增量拉取到 Feed，重复拉取不制造副本；临时故障自动重试，持续或配置故障提供明确的来源恢复入口；桌面和窄屏主路径可顺畅试用。

## 当前证据

- `src/feed/sources/runtime.ts` 已限制 HTTPS、阻止私网解析、限制跨主机跳转、响应体大小和超时，并复用 `@adeptify/search-evidence-layer` 的 RSS/Atom 解析器。
- `src/feed/sources/service.ts` 以 Provider `candidateId` 写入稳定 external id，能够对相同 GUID/链接生成的 Item 去重。
- Transport 目前只把正文交给 Provider，没有保存 ETag、Last-Modified、最终 URL、订阅标题或站点 URL；因此每次同步都完整下载。
- 公开来源的临时异常会把来源状态改为 `error`；成功后也不会自动关闭已经打开的 `source_fault`。
- 自定义 RSS 注册只做 URL 安全校验，第一次联网验证发生在同步时。

## 用户场景

1. 用户从 RSS 目录添加来源，或输入一个自定义 HTTPS RSS/Atom 地址。
2. 第一次同步验证返回内容确实是 RSS/Atom，保存订阅标题、站点地址、最终 Feed 地址和 HTTP 校验信息，并把最近内容导入 Feed。
3. 后续同步发送 If-None-Match / If-Modified-Since；304 作为成功且无新内容，不覆盖既有游标或 Item。
4. Provider 以 GUID 为首选身份，没有 GUID 时使用 canonical link；稳定身份缺失的条目由解析器拒绝，不制造不可追踪内容。Molis Work 在同一来源范围内以稳定 candidate id 去重。
5. 短暂网络或 5xx 失败保留上次成功时间和数据，来源显示可重试；连续三次失败或明确的格式/配置错误才创建可处理的来源故障。恢复成功后故障自动完成。
6. 用户在来源详情中能看到 Feed URL、订阅标题/站点、上次成功、条件请求状态、当前错误与拉取记录，并能从桌面和窄屏重新同步或修正配置。

## 方案与关键决策

### 保留现有解析与安全边界

- 继续使用共享 RSS Provider 和 Intelligence exact ingest，不新建第二套 Feed Item 映射。
- Transport 仍只允许目录 URL、YouTube 官方 Feed 或经过校验的自定义 HTTPS URL；自定义来源只允许同主机有限跳转并重新检查公开 DNS。
- 保留 2 MiB transport 上限、Provider 1 MiB parser 上限、DOCTYPE/ENTITY 拒绝和请求截止时间。

### 条件请求与拉取收据

- 来源 cursor 新增非秘密、版本化的 `rss_http`：ETag、Last-Modified、最终 Feed URL、订阅标题、站点 URL、最近成功时间和连续失败次数。
- Runtime 创建时读取来源 cursor，把 ETag/Last-Modified 放入请求；Transport 捕获响应头、最终 URL和安全解析出的 feed 元数据。
- 304 转换为一个可信的空 RSS 文档交给现有 Provider，最终 Run 记为 completed + empty，并在 receipt 中标记 `not_modified`。
- 只有 200 且完成解析，或 304，才推进 HTTP 收据；失败不覆盖原有 validator 和最近成功信息。
- 共享 Intelligence opaque ledger 使用新的 `feed-intent-v2` namespace。旧 v1 blob 原样保留，避免从其他安装迁入、但缺少原加密控制键的历史运行状态永久阻塞新拉取；Feed Item、来源和 Run 不迁移也不删除。
- 若迁入的历史 `evidence` blob 与本机 v1 内容密钥不匹配，同一内容再次出现时不覆盖旧密文，而是在 `evidence-recovered-v2` overlay 用新密钥重新封装；读取优先使用恢复副本，旧文件仍保留用于审计或人工恢复。

### 身份、内容和去重

- RSS Provider 已按 GUID（可解析为 HTTP URL 时）或 link 建立 entry id，并保留 title、summary、published/updated time、author 和 canonical URL。
- Molis Work external id 继续使用来源范围 + candidate id；相同 GUID/link 的重复拉取命中现有 Item，不新增副本。
- Run receipt 记录拉取模式、条件请求结果和安全的 HTTP 元数据，不保存完整响应正文。

### 故障与恢复

- 429、5xx、DNS/网络和超时属于可重试故障：保留最后成功和 validator，递增失败计数，不立即创建 Inbox 噪声。
- 第三次连续可重试失败升级为 `source_fault`；格式错误、非法跳转或无效配置可立即产生可操作故障。
- 手动和定时拉取共享相同故障策略；成功同步把失败计数归零，并关闭该来源仍打开的故障引用。
- 来源详情显示安全的错误说明和建议动作，不复制 Provider body。

## 模块边界

- `src/feed/sources/rss-http.ts`：版本化 cursor/validator、订阅元数据、安全解析和失败计数的纯逻辑。
- `src/feed/sources/runtime.ts`：发送条件请求、捕获安全 HTTP 收据、处理 304 和有限跳转。
- `src/feed/sources/service.ts`：把来源 cursor 传入 Runtime，原子提交 HTTP 收据、状态、Run receipt、故障与恢复。
- `src/feed/sources/scheduler.ts`：继续调度公开来源，不重复创建已经由来源服务管理的 RSS fault。
- `src/web/render.ts` / `src/web/i18n.ts`：展示 RSS endpoint、订阅身份、条件请求和可恢复状态。
- `tests/feed-sources.test.ts` / `tests/web.test.ts`：条件请求、RSS/Atom、去重、故障阈值、恢复和响应式回归。

## 非目标

- 不抓取文章页面全文、不绕过付费墙、不执行 Feed 中的 HTML 或脚本。
- 不自动发现任意网页里的 RSS 链接；用户必须提供目录来源或明确的 Feed URL。
- 不允许 HTTP、自签名绕过、私网地址、跨主机自定义跳转或无限重定向。
- 不在本 Work Item 内实现 OPML 导入、文件夹、规则引擎或 AI 摘要。
- 不把所有 RSS 消息自动放入 Inbox；RSS 默认只进入 Feed，由用户后续显式安排。

## 验收标准

- [x] 真实 RSS 和 Atom 均能同步；Item 保留来源、标题、时间、摘要/正文与链接。共享 Provider 当前不把 entry author 投影到 Material，未提供时不伪造。
- [x] 首次 200 保存 ETag/Last-Modified（若源站提供）、最终 URL、订阅标题/站点和最近成功；后续发送条件头，304 作为成功空结果。
- [x] GUID/canonical link 在同一来源内稳定去重；连续两次同步不产生无限副本，Run 能区分新增、去重和未修改。
- [x] 自定义 HTTPS RSS/Atom 地址经过 URL、DNS、跳转、体积和格式校验；非法、不可达或移动异常给出安全且可执行的错误。
- [x] 临时故障不覆盖既有 Item/游标/最后成功，第三次连续失败才进入 Inbox；明确配置/格式错误可立即进入；成功后关闭故障。
- [x] 来源详情显示实际 Feed endpoint、订阅身份、上次成功、条件请求状态、错误与运行记录；桌面和窄屏无横向溢出且同步/恢复可操作。

## 验证

- `pnpm exec tsx --test tests/feed-sources.test.ts tests/feed-security.test.ts tests/feed-contract.test.ts tests/web.test.ts`
- `pnpm exec tsc --noEmit --noUnusedLocals false --noUnusedParameters false`
- `pnpm build` 与 `pnpm test`；若受无关工作区改动阻塞，记录具体文件和替代的定向证据。
- 使用至少一个真实 RSS 和一个真实 Atom 完成首次与第二次同步，记录新增/去重或 304、来源元数据和 Feed 内容。
- 在宽屏与窄屏浏览器检查来源目录、RSS 详情、配置、运行记录和故障恢复入口。

## 假设与开放项

- 目录源站不一定返回 ETag 或 Last-Modified；缺失时仍以稳定 Item identity 去重，UI 显示“源站未提供条件校验”。
- 共享解析器只接受能关联 HTTP(S) URL 的 GUID 或 link；无法追溯到原文的条目会被安全跳过并通过 `ingest_incomplete` warning 暴露。
- 某些源站使用 301/308 永久移动；本次保存最终地址用于诊断和后续条件请求，但不自动重写用户输入的受信任边界。

# 其余 Connector 全部按官方 API 打通

完成等级：3 功能可用。不是可发布。不提交除非另说。

## 背景目标

Connectors 目录已经有真实 App 图标和能力表，但除 GitHub / Gmail 外都是占位。人要在设置里连上其余服务：贴各家官方令牌（或等价凭证），Feed 用同一份凭据拉入站更新，Functions 能勾已兑现的只读 whoami。做法对齐市面本地工具（Raycast / Nango / Pipedream）：一份目录声明各家授权头和只读 API，Host 共用连接技术，不给每家建空包。

## 当前行为与问题证据

- `apps/local-host/src/connector-directory.ts`：除 github / gmail 外 `availability: placeholder`，`auth_kind: none`。
- Token HTTP 只接受 github / gmail。
- Feed `sync_kind` CHECK 只有 `public_source | github | gmail | manual`。
- 行为总表只在 GitHub 已连接时并入 `github.whoami`。

## 范围与非目标

做：

1. 目录里其余 Connector 全部 `live`，设置页可贴令牌、断开、查看当前账号。
2. 每个服务一个官方只读入站（Feed poll）和一个已兑现出站 `*.whoami`；判断只挑，不自动调用。
3. 协议与解析在一个官方 Integration 包 `plugins/official-integrations/catalog`；Host 装配、SecretStore、Connectors HTTP、Feed 来源、行为总表。
4. GitHub / Gmail 保持现有专用包与 OAuth / Device Flow。Gmail 仍不发送。
5. 微信走企业微信官方接口（`corpid:secret`），个人号仍无接口，文案写清。
6. X / LinkedIn 走各家开放只读接口；账号或套餐不够时是 live 失败，不是占位。

不做：

- 38 个空 Integration 目录
- 扩大 GitHub 写权限、Gmail 发送
- 在 Functions 里写各家 API
- 每个服务一个 MCP 进程包
- 代用户向各家注册 OAuth App（OAuth 仍可后续按 Gmail 模式加；本轮 PAT / API token / 应用凭证先跑通）
- 改 Goals / Artifact 事实
- 宣称可发布

## 使用场景

1. 打开设置 → Connectors → Slack，贴 Bot Token，卡片变成已连接，只显示末四位。
2. Functions Agent 去向能勾 `slack.whoami`；点详情「查看当前账号」才打 Slack `auth.test`。
3. Feed 出现 Slack 来源，立即拉取拿到频道列表；断开后动作从总表消失。
4. Jira 按 `站点|邮箱|API token` 连接；企业微信按 `corpid:secret` 换 access_token 再拉通讯录。
5. 点进微信：能连的是企业微信应用，不是个人号。
6. 点进任意 Connector 详情，能点官方配置入口（拿令牌、建应用、OAuth 控制台）跳到对应后台。

## 方案与关键决策

- 抄市面目录式接法：Nango/Pipedream 一类 provider 声明（授权头、identity URL、list URL、解析），不是 38 份 GitHub 包复制。
- 新 `sync_kind = connector`，`kind` / `definition_id` = connector id。github / gmail 不迁。
- 凭据键仍是 `connector:{id}:token`。已连接才创建对应 Feed 来源，避免 38 条空来源污染 Feed。
- 出站动作 id：`{connector_id}.whoami`，plugin_id `io.molis.work.integration.{id}`。

## 输入输出与依赖

- 输入：本机 SecretStore 中的各家令牌 / 应用凭证。
- 输出：可连接目录、Feed 入站 Item、Functions 可勾 whoami、`POST /api/settings/connectors/:id/whoami`。
- 依赖：现有 Connector Host、Listener、Feed 去重、行为总表过滤。

## 文件 / 模块边界

| 包 | 职责 |
| --- | --- |
| `plugins/official-integrations/catalog` | 各家官方只读 API、token 解析、provider、whoami、动态 Integration Manifest、官方配置入口 |
| `packages/contracts` | `auth_kind: token`、`sync_kind: connector` |
| `modules/sources` | 迁移 CHECK 允许 `connector` |
| `plugins/native/feed` | 账号来源含 `connector`；已连接才 ensure |
| `apps/local-host` | 目录、HTTP、装配、行为总表 |
| `apps/workbench` | 通用令牌表单、按组展示可连接卡片 |

禁止 `plugins/native/connectors`、`modules/connectors`、按 id 建空 `plugins/official-integrations/{id}`。

## 验收标准

1. `/settings/connectors` 除 GitHub / Gmail 外每张卡都可连接，不再显示「还不能连」分组。
2. 贴令牌后 `connector:{id}:token` 进 SecretStore，页面不回显明文；whoami 打对应官方 identity 接口。
3. 已连接时 Functions catalog 出现 `{id}.whoami`；判断 ok 不发该 HTTP。
4. 已连接时 Feed 能为该服务建 `sync_kind=connector` 来源并 live poll；未连接不建来源。
5. 没有 `plugins/official-integrations/slack` 这类空目录；有 catalog 包。
6. 相关测试通过。浏览器能打开 Slack / Notion / 企业微信详情并看到令牌表单。
7. GitHub / Gmail 与 catalog 每家详情都有至少一条 `https` 官方配置入口，可点、新标签打开。

## 验证命令

- `node --import tsx --test tests/connectors-settings-behaviors.test.ts tests/catalog-connectors.test.ts tests/i18n.test.ts tests/feed.test.ts`
- 浏览器：设置 → Connectors，点 Slack / Notion / 微信 / Jira / GitHub，能点开官方配置入口。

## 假设与开放问题

- 本轮不注册 38 家 OAuth App；能贴令牌的服务以令牌跑通。Google / Microsoft 也可贴已有 Graph / Google access token。
- Canva 没有 PAT，只接受用户自己 OAuth 拿到的 Connect access token。
- X `/users/me` 必须是用户上下文令牌，开发者后台 App-Only Bearer 会 403。
- Loom 官方目前没有开放 PAT；只有企业/合作方 API token 才能连，否则是 live 失败。
- Adobe UserInfo 官方要带 client_id（`api-key|access-token`）。
- LinkedIn 帖子列表因套餐或权限可能 403，连接仍以 `/v2/userinfo` 成功为准。

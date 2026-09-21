# Connectors 目录：能力写清，图标换成真实 App 图标

完成等级：3 功能可用。不是可发布。不提交除非另说。

## 背景目标

设置 → Connectors 已经列出 Codex / Claude / Grok 常见账号，但绝大多数只有一句空摘要，图标是 18px 单色 Simple Icons 画在色块上，复杂商标（Gmail、Outlook、Teams、Canva、Hugging Face）看起来像手绘、会糊。人需要一眼认出服务，并看清连上之后 Feed / Functions 各自能做什么、哪些已经兑现。

## 当前行为与问题证据

- 目录在 `apps/local-host/src/connector-directory.ts`：GitHub / Gmail `live`，其余 `placeholder`，摘要如「消息。」「云盘文件。」
- 占位详情只显示「本机还没有官方 Integration 包，不建空包。」没有能力表。
- 图标在 `apps/workbench/src/connector-marks.ts`：单色 path + 品牌色 32px 底，内部 SVG 18px。验收仍要求每张卡有图标，但规格写的是 Simple Icons，不是各家 App 图标。
- GitHub 已兑现：Feed 拉未读通知、`github.whoami`。Gmail 已兑现：Feed 只读收信；出站发送未兑现。

## 范围与非目标

做：

1. 每张卡和详情使用该服务的真实 App 图标（彩色官方应用图标，圆角方标，本地入库）。商标仅用于识别服务。
2. 每条目录写清入站（Feed）和出站（Functions）能力，以及是否已兑现。详情页列出能力，不再只有一句不可用原因。
3. GitHub / Gmail 保持可连；能力表与现有兑现一致。飞书、微信、X、LinkedIn 保留诚实不可用原因。
4. 卡片上的图标按 App 图标铺满 32px，不再用 18px 单色 glyph。

不做：

- 为占位服务新建官方 Integration 包或空包
- 新开 Slack / Notion / Linear / Google Calendar 等 OAuth
- 扩大 GitHub 写权限、Gmail 发送
- 改 Goals / Artifact 事实
- 宣称可发布、宣称全绿

## 使用场景

1. 打开设置 → Connectors，GitHub / Gmail 图标是大家认得的 App 图标，不是单色剪影。
2. 点进 Slack：看到真实 Slack 图标、还不能连、以及「Feed 拉频道消息 / Functions 出站动作」都未兑现，原因仍是没有官方 Integration 包。
3. 点进 GitHub：能力表写明 Feed 未读通知已兑现、查看当前账号已兑现。
4. 点进微信：能力表存在，不可用原因仍是没有稳定官方开放接口。

## 方案与关键决策

- 图标优先用 [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons) 的彩色 SVG（识别用）；该集没有的（Canva、monday.com、HubSpot、Intercom、Loom）用官方 App 图标构图本地绘制，不回头用 18px Simple Icons。
- 图标内联进 Workbench 渲染，不新开静态 CDN，不在运行时外链。
- 能力是目录字段，不是新 Module。Host 目录拥有文案；设置页只展示。`live` 能力必须已经有调用链；占位能力全部 `unfulfilled`。
- 生产建议仍是：能连的只有 GitHub 和 Gmail。本轮补的是目录作为产品面的完整，不是 35 家协议。

## 输入输出与依赖

- 输入：现有目录、GitHub / Gmail 凭据与行为总表。
- 输出：Connectors 列表/详情的真实 App 图标 + 能力表。
- 依赖：现有 SecretStore、Connectors HTTP、Functions 总表。不新增包。

## 文件 / 模块边界

| 包 | 职责 |
| --- | --- |
| `packages/contracts` | 目录条目增加 `capabilities` |
| `apps/local-host` | 目录文案与能力兑现标记 |
| `apps/workbench` | 图标资源、卡片/详情渲染、样式 |
| 测试 | 图标覆盖、能力表、详情不再只有空原因 |

禁止新建 `plugins/native/connectors`、`modules/connectors`、空的 `plugins/official-integrations/*`。

## 验收标准

1. `/settings/connectors` 每张卡和详情标题是该服务 App 图标，不是 18px 单色 Simple Icons。
2. GitHub / Gmail 能力表与现有兑现一致；占位服务能力表全部未兑现，并保留不可用原因。
3. 微信 / X / LinkedIn 仍写明不装官方 MCP。
4. 没有新的空 Integration 包。
5. 相关测试通过；浏览器打开 Connectors 能认出 Gmail、Slack、GitHub、Notion、Outlook。

## 验证命令

- `node --test tests/connectors-settings-behaviors.test.ts tests/i18n.test.ts`
- 浏览器：设置 → Connectors，扫列表图标，点进 GitHub / Gmail / Slack / 微信。

## 假设与开放问题

- 下一刀若要真的连上某家（例如 Google Calendar 或 Notion），单独开 Integration 包，不在本轮假装可授权。
- 图标是识别用商标，不修改各家品牌规范文件。

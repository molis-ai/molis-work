# PG-046：集成与文档来源只来自插件的声明

状态：已实现，待评审（2026-10-26，ac-registry 线，分支 `claude/ac-registry-pg046`）。FI-3 的实现（`c98614235`，FI 线写的、还没评审）原样带着、合上 main（`2b3dc51de`），本片在上面做了 BL-528、BL-529；BL-530 统筹 10-26 定不进本片，归沙箱线（§4）。评审范围是 `origin/main..` 分支头：FI-3、合并、本片的余项。

派单：防腐线统筹 10-26。号段 RAC-890～899、BL-690～694。FI-3 原有的 RAC-488～491、RAC-519 不改号。

## 1. PG-046 原来的样子，FI-3 做到了哪里

PG-046（`privileges.md`）：宿主只认三个写死的官方集成（GitHub、Gmail、目录连接器），每个来源各跑一个内存 Runtime；外部文档来源（notion、feishu、lark、google-docs）也写死。目标：集成与文档来源由插件声明后登记，平台照登记装。

FI-3（设计稿 [feed-inbox-integration-registry.md](feed-inbox-integration-registry.md)，统筹 10-24 审过；实现记录在它的 §7）已经做的：

- Manifest 有 `connection_services` 和 `integrations` 两个数组（contracts `platform/plugin-integrations`，SDK 解析时检查）。
- `official-integrations.ts` 删掉；`integration-registry.ts` 一个 Home 一份、一个共用的内存 Runtime，集成插件各装一次，来源的差别作为绑定（`IntegrationBinding`）在 `bind` 时给。
- id 冲突在后来者启用时拒绝（`plugin.integration_declaration_conflict`），已登记的不动。
- 文档导入按 `kind: "document_import"` 的集成查服务（`CONNECTOR_IDS` 删掉），连接目录卡由声明拼出。

合 main 时（本片的合并提交）：main 在 batch-38 给旧的 `official-integrations.ts` 加了 `hostIds: HOST_PLUGIN_IDS` 与 `trust: HOST_BUILD_TRUST`（宿主自带的集成插件按宿主构建的信任装）。旧文件已删，这两项照 FI 线自己合 main 时的写法搬进 `integration-registry.ts`；其余冲突是 `feed-inbox-runtime.md` 的状态行（以 main 为准，加上 FI-3 已实现）和 git 用以前记下的解法自动解的五处。

## 2. 边界

### 2.1 与 FI 线（Feed 来源）

- **本片管登记**：谁声明了什么、谁持有哪个 id、怎样按绑定取出驱动和适配器、来源的账号怎样显示（BL-528）、文档导入能用哪些接入方式（BL-529）。
- **FI 线管 Feed 本身**：来源记录、`sync_kind` 的表约束、拉取、来源故障、Feed 进 Runtime（FI-5、FI-6）。`integrationKeyOf(source)` 留在 Feed（FI-3 已放在 `plugins/native/feed/src/integration-key.ts`）。
- `c98614235` 以前的历史不改写（统筹已通知 ac-sandbox-sched），FI-5、FI-6 以后合 main 时这些提交就是同一批提交。本片碰 Feed 的地方只有 BL-528 改的一个端口（`sourceMetadata` 去掉，改由监听者给账号显示），FI 线的叠层合 main 时会在 `connector-sync.ts` 和 `connector-sync-ports.ts` 上遇到它。
- `public_source`（rss、web-query、youtube）不进登记，同 FI-3。

### 2.2 与 PG-045 `services.connections`（S-57、S-69）

- **声明服务不给连接权**（FI-3 的 RAC-519，不变）：`connection_services` 只管目录卡和登记，插件要用连接发请求，走 `services.connections`，按安装逐个授权（S-57）；能请求哪些服务、发到哪里，只由平台的 `CONNECTOR_REQUEST_SERVICES` 定（S-69），Manifest 里永远没有地址。本片不改这两条，也不碰那张表。
- `connection_services` 与 `CONNECTOR_REQUEST_SERVICES` 是同一批服务的两面（卡片与请求目标）。要不要合成一份，FI-3 §5 留到 PG-045 之后，本片仍不合：合并要把地址放进插件可写的声明里，与 S-69「地址只由平台定」相反。
- **`integration-providers.ts` 的三选一不做**（统筹 10-26）：集成插件按绑定拿令牌，今天还是宿主端口按集成 id 选 GitHub、Gmail、目录三种提供方。等集成插件改走 `services.connections` 取数据（PG-045 的余项，主人 ac-kernel）后删掉。这是 PG-046 收尾后宿主里唯一按集成 id 分支的地方。（2026-10-31 改，T-120：按集成 id 的分支已删，`defaultIntegrationProvider` 不在了；`builtin-integrations.ts` 的清单给 GitHub、Gmail、每个目录集成各接自己种类的提供方，目录里加一个连接器不用改宿主；三种提供方各自的取钥仍是过渡写法，等 T-066 之后的一片把 GitHub、Gmail 并进 `resolveApiConnection`。）

### 2.3 与 W5-11（OAuth 的一半，Codex C4）

- FI-3 §3.4 的约定照旧：OAuth、MCP、CLI 的数据与特例处理器由 C4 搬进拥有这个服务的插件的 `connection_services[].auth.methods`，平台留回调路由、`state`、凭据暂存与提交、地址校验。
- BL-529 只在 `integrations[]`（`document_import`）上加「这个导入能用哪几种接入方式读」（`connection_methods`），**不往 `auth.methods` 里加字段**，与 C4 不撞同一行。C4 把 CLI 的数据搬进声明后，这个列表就能对着服务声明了的方式检查（BL-690）。

## 3. 本片做的

### BL-528：账号怎样显示由集成插件给

- 现在：`feed-connector-sync.ts` 的 `sourceMetadata` 按 `sync_kind` 在 `gmailAccountPresentation`、`githubAccountPresentation`、`catalogAccountPresentation` 三个之间选，宿主 import 三个集成包。
- 改成：`PluginIntegrationContribution.bind` 返回的那一对之外多一个可选的 `account(cursor, current_account_label)`，返回 `{ account_label, …要写进来源配置的字段 }` 或 `null`。SDK 的 `definePollingIntegrationPlugin` 多一个可选的 `presentAccount(cursor, current_account_label, binding)`，三个集成包各自把原来的函数接上（Gmail 的 `scope` 从绑定的配置来，与原来读 `source.config.scope` 一致）。
- Feed 的端口：`FeedConnectorListener` 多一个 `account(cursor)`，Feed 在同步完成时用它；`FeedConnectorSyncPorts.sourceMetadata` 删掉。宿主不再 import 三个集成包的账号函数。
- 改合同：contracts `platform/plugin`、`platform/plugin-integrations`，SDK 入口。不留兼容（FI-3 的合同还没落地，没有外部使用者）。

### BL-529：文档导入能用哪几种接入方式，由声明给

- 现在：`documentImportConnections` 里「`cli` 只对 `feishu` 放行」写死服务名。
- 改成：`kind: "document_import"` 的集成必须写 `connection_methods`（`ConnectorMethodKind` 的非空子集，不重复）；文档导入只收接入方式在这个集成的列表里的连接。notion、lark、google-docs 写 `["token", "oauth"]`，feishu 写 `["token", "oauth", "cli"]`，与现在放行的完全相同（`mcp`、`none` 照旧不收）。`source` 集成不许写这一项。
- 同一个服务被两个 `document_import` 集成用的情形今天没有；取连接时按「导入用的那个集成」的列表，不跨集成合并。

### 验收（RAC-890～）

| 编号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-890 | 来源的账号显示来自它的集成插件：宿主不 import 集成包的账号函数，`feed-connector-sync.ts` 里没有按 `sync_kind` 的分支；GitHub、Gmail（范围取自来源自己的绑定）、目录连接器绑定后给出与改前同样的账号显示，拉取没说账号时给 `null`；外部夹具的 `presentAccount` 拿到的是它这个来源的绑定；不给 `presentAccount` 的插件没有 `account`，来源的账号与配置不变 | `tests/integration-registry.test.ts`；端到端的账号显示由 `tests/feed-connectors.test.ts` 原有用例证明（GitHub `@login`、Gmail 邮箱） |
| RAC-891 | 文档导入只收集成声明了的接入方式：feishu 的 CLI 连接收，notion 的 CLI 连接不收，notion 的令牌与 OAuth、google-drive 的令牌收，不读文档的服务（GitHub）的连接不收；宿主的 `artifact-document-import.ts` 里没有 `"feishu"` 字面量 | `tests/artifact-document-import.test.ts`，连接夹具 |
| RAC-892 | SDK 拒绝畸形的 `connection_methods`：`document_import` 没写、空、重复、不认识的方式、不是数组，`source` 集成写了 | `tests/integration-registry.test.ts`，解析用例 |
| RAC-2660 | （T-120）`integration-providers.ts` 不 import 任何宿主文件（所以不 import 连接器）、不含内置集成的 id 字面量、没有 `===`／`!==` 比较：提供方按种类在 `builtin-integrations.ts` 的清单里各自接线，不由一个函数按集成 id 选 | `tests/builtin-integration-providers.test.ts` |
| RAC-2661 | （T-120）不带覆盖的 `homeIntegrationRegistry` 里，GitHub、Gmail 和登记里每个目录集成绑定一个没有连接的来源，`health()` 与各自种类的连接器给出同一个结果、同一句话 | 同上 |
| RAC-2662 | （T-120）带自己提供方工厂的调用方，对每个内置集成被问一次，参数是它的 id 和绑定，且得到自己的登记（不共用缓存） | 同上 |
| RAC-2663 | （T-120）来源只用自己连接的凭据：目录集成（Linear）带连接就带那条连接的令牌、没连接就不带；GitHub 只在来源同时有连接和凭据引用时才用存着的密钥 | 同上 |

## 4. 待定

- **BL-530（统筹 10-26 定：不进本片，归 ac-sandbox-sched，排在 BL-491、BL-493 之后，先出设计稿）**：装进 Home 的外部集成插件怎样进登记。查实今天没有这条路：安装路径只有 T2 的签名沙箱包（S-84），它的格式只有应用插件，没有 `kind: "integration"`；登记的共用 Runtime 在宿主进程里、按宿主构建的信任装，跑外部集成插件就是在宿主进程里跑外部代码。所以这一项要先定两件动安全边界的事：外部集成插件是否要在沙箱里跑（沙箱包格式加 integration 一类，绑定与拉取经 broker）；装上之后用哪一级信任进登记、冲突时怎样对待已登记的内置集成（FI-3 的「先装的持有」对外部插件是否够）。`integration-registry.ts` 只由内置清单调。两个问题动安全边界，设计稿出来后由统筹弹窗问用户，本线不定；统筹的倾向是 ① 在沙箱里跑、② 信任按发布者签名（与 S-84 同一条），与内置集成撞 id 时在安装时明确拒绝（同 A3 的「安装时拒重复属主」），不用「先装的占住」。
- **BL-690**：C4（W5-11）把 OAuth、MCP、CLI 的数据搬进 `auth.methods` 后，SDK 检查 `document_import` 的 `connection_methods` 是服务声明了的方式的子集。
- 其余按推荐定，记在 §3。

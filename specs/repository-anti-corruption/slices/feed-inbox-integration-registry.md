# FI-3 集成登记设计稿（PG-046）

状态：统筹 10-24 审过（`336fbb6de`「可以照做」），实现已在分支 `claude/ac-feed-inbox-designs` 上写好、未开 PR（PR 排在 BL-490 与 FI-2 之后）；实现与本稿的差别记在 §7。事实在 `origin/main` `584112c65` 上读代码核的，没跑过。父稿 [feed-inbox-runtime.md](feed-inbox-runtime.md) §3 D3 定了方向，本稿把它写成能照做的形状，并写清 OAuth 放哪里，让 Codex C4（W5-11）照这份做。号段 RAC-488～491，另有补充条 RAC-519（统筹 10-24 定：Feed/Inbox 组 RAC-480～499 再加 500～519；补充条从 500 段末尾倒着取，免得挤 FI-6 的连号）。

## 1. 现状

| 事实 | 位置 |
| --- | --- |
| 集成登记是 `OfficialIntegrationRegistry`：**每个来源**一个内存 `PluginRuntime`（`MemoryPluginRuntimeRepository`），来源配置变了就卸掉重装（`configurationFingerprint`） | `official-integrations.ts`（146 行） |
| 三个写死项：`definitionFor` 按 `sync_kind` 选 `createGithubIntegrationPlugin` / `createGmailIntegrationPlugin` / `createCatalogIntegrationPlugin({ connectorId: source.kind })`；`defaultProviderFor` 同样三选一，造出带令牌引用的提供方 | 同上，分别接 `github-connector.ts`、`gmail-connector.ts`、`catalog-connector.ts`（24/44/29 行） |
| 登记实例是**每个 Feed 应用一份**（`createLocalFeedConnectorSync` 里 `new`），不是每个 Home 一份；同一个来源在不同应用里各有一个 Runtime | `feed-connector-sync.ts:22` |
| 来源出错的处理：监听崩溃调 `reportCrash(sourceId)`，该来源的 Runtime 置崩溃，下次 `contributionFor` 里 `recover` | `official-integrations.ts`、`feed-connector-sync.ts` |
| 连接器目录是宿主写的表：4 个宿主自带（model-api、typesafe、image-api、mcp-bearer，没有提供方，是 Functions、Images、Coding 消费的连接）+ github + gmail + `CATALOG_CONNECTORS` 展开的 39 个（`feed_available:false` 的不进 Feed） | `connector-directory.ts` |
| 每个服务能用哪些接入方式，是查三张宿主表：`API_OAUTH_PROVIDERS`（约 40 项：授权地址、令牌地址、范围、PKCE……）、`MCP_SERVERS`、`CONNECTOR_CLIS` | `host-connector-methods.ts`、`connector-api-oauth-providers.ts`、`connector-mcp.ts`、`connector-cli.ts` |
| OAuth 的流程另有宿主文件：GitHub、Gmail、Notion 各一份特例，回调路由、待定目标（`state`）、凭据暂存与提交是通用的 | `github-oauth.ts`、`gmail-oauth.ts`、`notion-oauth.ts`、`connector-oauth-callbacks.ts`、`connector-oauth-targets.ts`、`connector-oauth-commit.ts`、`connector-activation.ts` |
| 文档导入另有一份名单：`CONNECTOR_IDS`（notion→notion、feishu→feishu、lark→lark、google-docs→**google-drive**），读文档用目录包的 `readExternalDocument` | `artifact-document-import.ts` |
| 不经登记的：`public_source`（rss、web-query、youtube）没有账号，`connector-access.ts:60` 直接放行，在 `feed-source-runtime.ts`、`feed-source-service.ts` 里建 | — |
| 来源行的 `sync_kind` 在表上有 CHECK（`public_source/github/gmail/connector/manual`）；`connector` 时 `source.kind` 是目录连接器的 id | `modules/sources/src/index.ts:43` |

## 2. 目标形状

```text
插件 Manifest ── integrations[] ──┐
插件 Manifest ── connection_services[] ─┤  平台按「已装插件的声明」生成
                                  ▼
            IntegrationRegistry（一个 Home 一份，一个共用的内存 Runtime）
              ├─ 来源：Feed 用  entries(kind="source")  → 取绑定后的 driver/adapter
              ├─ 文档导入：成果库用 entries(kind="document_import")
              └─ 目录卡：设置页用 connection_services（auth 方式、显示文字）
```

宿主里没有按集成名（github、gmail、notion……）分支的代码；内置与外部插件走同一条声明路。

## 3. 设计

### 3.1 声明：两个数组

Manifest 加两个可选数组（**改合同**，`pnpm api:update`，按 `CONTRACT-CHANGES.md` 不留兼容；解析与检查放 SDK 的 Manifest 解析里，平台各层取同一份）：

```ts
connection_services?: readonly {
  service_id: string;          // 连接服务的 id，如 "github"、"notion"、"google-drive"
  title: string; group_id: ConnectorDirectoryGroupId; summary: string;
  auth: { methods: readonly AuthMethodDeclaration[] };   // 见 3.4
}[];
integrations?: readonly {
  integration_id: string;      // 登记里唯一，如 "github"、"notion"、"notion-documents"
  kind: "source" | "document_import";
  service_id: string;          // 用哪个连接服务的账号
  // kind = "document_import" 时：它读的文档来源名，如 "google-docs"
  document_source?: string;
}[];
```

- `integrations[].service_id` 必须是**同一份 Manifest** `connection_services` 里声明过的；引用别的插件的服务，SDK 解析时拒绝。声明只是声明，不给任何连接权（见 3.2）。
- 一个服务可以被两个集成用：notion 既是 Feed 来源（`notion`，`source`）也是文档导入（`notion-documents`，`document_import`）；`google-docs` 是文档导入，用 `google-drive` 的账号。这就是 D3 说的「用 `kind` 区分」。
- 只在目录里出现、没有 Feed 来源也没有导入的服务（今天 `feed_available:false` 的那些）只声明 `connection_services`，不声明 `integrations`。
- 声明服务的插件就是这张目录卡的主人；「连接器目录」不再是单独的主人，`CONNECTOR_DIRECTORY_BASE` 的 `...CATALOG_CONNECTORS.map` 展开消失，改由已装插件的声明拼。
- 平台自己消费的连接服务（今天的 model-api、typesafe、image-api、mcp-bearer 四张宿主自带卡）写成**平台的一份声明列表**，与插件声明同形、进同一个登记（持有者记为 `platform`），不按名字分支。Catalog 包今天给**每个连接器**出一份自己的 Manifest（`catalogIntegrationManifest(connectorId)`，`plugin_id` 为 `io.molis.work.integration.<连接器>`），各自声明自己的服务和集成，由包里的描述（`catalog.ts` 的 `spec(...)`）生成，不手抄；`google-docs` 的文档导入归 `google-drive` 的那份 Manifest 声明（用它的账号）。（初稿写成「一个插件声明 39 个服务」，与代码不符，已按实际改。）

### 3.2 登记：一个 Home 一份

- 登记是平台服务（`apps/local-host/src/integration-registry.ts`，取代 `official-integrations.ts`，不含任何集成 id 字面量），从 Home 的已装插件里读 `connection_services` 和 `integrations`，插件装上、停用、卸载时更新。
- **冲突在后来者安装或启用时拒绝，已登记的不动**：同一个 `integration_id` 或 `service_id` 已被某个插件（或平台声明）登记，后来的插件声明同一个 id，它**启用失败**，错误码 `plugin.integration_declaration_conflict`，消息写明冲突的 id 与当前持有者；已登记的集成、它的来源、它的连接一概不受影响。否则任何后装的插件（含外部插件）声明一个 `service_id: "github"` 就能把在用的 GitHub 集成打掉。
- 两个都已装的存量情况，按安装记录的先后定：先装的持有，后装的启用失败。这是写明的规则，不是猜。平台自己的声明永远先于插件。
- 同一个 `service_id` 被同一插件下的两个集成引用不算冲突。
- `kind` 只认 `source`、`document_import`。Feed 只取 `source` 的集成，成果库只取 `document_import` 的；用错 kind 当场拒绝，不静默换一个。
- **声明 `service_id` 不给任何连接权**：拥有目录卡或声明了服务，读不到这个服务已有的连接与凭据；`binding` 里的引用由宿主按**来源已绑定的那条连接**给，不是按 `service_id` 去查；插件要读连接，走 `services.connections`，按安装逐个授权（S-57）。外部插件声明一个已登记的服务，被上一条拒绝；登记成功的插件也读不到没授给它的连接（RAC-519）。
- 集成消失（插件停用或卸载）：它的来源不崩，走现有的来源故障条目，说「这个来源的集成不可用」，不新造状态。

### 3.3 一个共用 Runtime，按绑定出实例

今天每个来源一个 Runtime 是因为 `definitionFor(source, provider)` 把来源的连接信息烤进了定义。改成：

- 平台持有**一个**内存 Runtime，每个集成插件在里面装**一次**（按 `plugin_id`，不按来源）。
- 来源的差别（连接、凭据引用、范围）作为**绑定**在调用时给：`PluginIntegrationContribution` 去掉固定的 `connector_driver` / `signal_adapter`，改为 `bind(binding)` 返回这一对；`binding = { source_id, connection_id | null, credential_ref | null, config }`，只含引用，不含密钥。SDK 的 `definePollingIntegrationPlugin({ manifest, createProvider(context, binding) })` 同步改。这是合同变化。
- 来源配置变了不用重装：下一次拉取按新的绑定出新实例（`configurationFingerprint` 与它的卸载重装消失）。
- 崩溃：**单个来源的拉取异常是这个来源的故障**（沿用来源故障条目和错误码），不再报给 Runtime；Runtime 层的崩溃只留给插件自己起不来、绑不上。这样一个坏来源不会把 GitHub 集成对所有来源都停掉。这是行为变化：`reportCrash(sourceId)` 与 `official-integrations` 里按来源的恢复删掉，相关测试要改并写明。
- 提供方怎么拿令牌：**本片不动**。今天是宿主端口 `OfficialProviderFactory`（`defaultProviderFor` 里三选一），改成「一个端口、按绑定出提供方」，由宿主的连接层实现；它里面的三选一在 PG-045（`services.connections`，ac-kernel）落地后随之删。这是本片留下的唯一一个过渡口，在设计里点名，删除条件写清。
- **PR 里要写明**：`reportCrash` 的行为变化（上一条），和 `OfficialProviderFactory` 这个过渡口（主人 ac-kernel，PG-045 落地后删，统筹登进风险表）。
- 开工前核对：Home 监督器或这个共用 Runtime 装的集成插件，其 `kind: "integration"` 的贡献检查已经存在（`plugin-runtime/src/contribution.ts:38`）；若 Home 监督器不接 `integration` 类，则共用 Runtime 由登记服务自己持有，不等监督器。

### 3.4 OAuth 放在哪里（给 C4 / W5-11）

**一个主人**：OAuth 的声明在拥有这个服务的插件的 `connection_services[].auth.methods` 里，不在宿主表里，也不另设 OAuth 登记。

```ts
type AuthMethodDeclaration =
  | { kind: "token"; label: string; placeholder?: string; help?: string; links?: readonly Link[] }
  | { kind: "oauth"; /* C4 补：授权地址、令牌地址、范围、PKCE、客户端认证方式、格式、额外参数与字段、刷新地址、说明 */ }
  | { kind: "mcp" | "cli" | "none" /* 同上，由 C4 或后续片补 */ };
```

规矩（C4 照做）：

1. **数据声明，代码极少**：`API_OAUTH_PROVIDERS` 里每一项是纯数据，搬进对应服务的声明；`MCP_SERVERS`、`CONNECTOR_CLIS` 同理。宿主三张表删掉，不留第二份。
2. **特例是纯函数**：GitHub、Gmail、Notion 的特殊步骤（拼授权地址、换令牌）由集成插件导出的处理器做，输入输出都是普通数据，**不碰密钥库、不碰连接记录、不碰路由**。
3. **平台留着的**：回调路由（一条）、`state` 与待定目标存取（`connector-oauth-targets.ts`）、凭据暂存与提交（`connector-oauth-commit.ts`）、连接记录、客户端 id/secret 的引用——这些是安全边界（SECURITY-INVARIANTS S-xx 相关行），不下放。
4. **本片只占位**：FI-3 先定 `auth.methods` 的外形，`token` 方式填全（目录卡今天就靠它），`oauth`/`mcp`/`cli` 先只写 `kind`，宿主表照旧查；C4 往这些成员里**加字段**（可选字段的增加，不改已有字段），并删三张宿主表。两片的合同改动因此不撞同一行。
5. FI-3 不改 `connector-oauth-*`、`*-oauth.ts`、`API_OAUTH_PROVIDERS`；C4 不改 `official-integrations.ts`（FI-3 之后它不存在）。
6. **地址校验是平台的一份**：插件声明的授权地址、令牌地址、刷新地址，走平台同一份地址校验（`SECURITY-INVARIANTS.md` 的地址规则），不由插件自己校验；声明不合规，该服务的这种接入方式不登记并留诊断。

### 3.5 文档导入并进来

- `artifact-document-import.ts` 的 `CONNECTOR_IDS` 删掉：导入查登记里 `kind="document_import"` 的集成，取 `service_id` 去找连接，`readExternalDocument` 仍来自目录包（它是该集成的读取实现，由集成贡献给出，不是宿主 import）。
- `documentImportConnections` / `documentImportConnectionStatus` 的名单由登记给，不再写四个 id。

### 3.6 不改的

`feed_sources.sync_kind` 的 CHECK 和 `source.kind` 当连接器 id 的用法：Feed 用 `integrationKeyOf(source)` 一个纯函数（`github`→`github`，`gmail`→`gmail`，`connector`→`source.kind`）取键，**函数放在 Feed 的来源代码里**（今天的 `modules/sources`，D1 并包后随进 `plugins/native/feed`），登记服务只按键查、不认来源行，RAC-488 的「无字面量」才成立。不动表、不动存量数据。表随 FI-5 搬进 Feed 的声明时，再决定要不要把 CHECK 换成 `integration_id`；到那时按合同「只认现行取值」做维护，不在读取时兜底。

## 4. 验收（暂定号，进实现片时定稿）

| 编号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-488 | 登记只来自已装插件的声明与平台的声明列表，内置与外部插件同一路径；宿主里没有按集成名分支：`official-integrations.ts` 删除，`integration-registry.ts` 无 `github`/`gmail`/`notion` 等字面量，取键函数在 Feed 里 | 门禁测试读源码；外部插件夹具声明的集成同样登记、同样被 Feed 取到 |
| RAC-489 | 一个 Home 一份登记、一个共用 Runtime：同一集成的多个来源共用一次安装；改一个来源的配置不影响别的来源；单来源拉取异常只成为该来源的故障，不把集成对其他来源停掉；插件停用后其来源给出「集成不可用」故障，不崩 | 多来源夹具；注入一个来源抛错，另一个来源仍能拉；停用插件后再拉 |
| RAC-490 | 冲突与非法值：后装的插件声明已登记的 `integration_id`/`service_id`，它启用失败（`plugin.integration_declaration_conflict`，写明 id 与持有者），**已登记的集成与来源照常**；存量冲突先装的持有；平台声明先于插件；`kind` 取值之外拒绝；引用别的插件的 `service_id` 拒绝；`source` 集成不能被当文档导入用，反之亦然 | 逐个构造；含「后装插件不能打掉已登记的 GitHub 集成」一例 |
| RAC-491 | 文档导入和目录卡走登记：`CONNECTOR_IDS` 删除；目录卡由声明拼出，宿主不再展开 `CATALOG_CONNECTORS`；notion 同时是来源与文档导入、`google-docs` 用 `google-drive` 的账号 | 现有连接设置与文档导入测试原样过，加 notion 双角色与 google-docs 账号用例 |
| RAC-519 | 声明不给连接权：外部插件声明已登记的服务被拒；登记成功的插件读不到没授给它的连接与凭据，`binding` 只含它来源已绑定的那条连接的引用 | 外部插件夹具声明 `github`，断言拒绝；拥有目录卡的插件调连接读取，断言拒绝 |

C4 的验收号由它自己定，本稿 §3.4 的六条是它的前置约定。

## 5. 不在本片

- OAuth 的数据与处理器搬迁、三张宿主表的删除（C4，W5-11）。
- 提供方取令牌的三选一（PG-045 的 `services.connections`，ac-kernel）；S-57 的服务登记表（服务→来源地址与写法）与 `connection_services` 是同一批服务的两面，是否合一留到 PG-045 之后。
- `public_source`（rss、web-query、youtube）：没有账号，不进登记。
- Model API、TypeSafe、图像 API、MCP bearer 这四张宿主自带的目录卡（统筹 10-24 定）：本片留在宿主，但写成平台的一份声明列表（3.1），不按名字分支；消费方成了 Runtime 插件后各自声明并移走，平台自身消费的留平台声明，登在 BL-525。

## 6. 开工前核对

- Home 监督器或共用 Runtime 装 `kind: "integration"` 的方式（3.3 末条）。
- 九处 `createLocalFeedApplication` 构造点里，哪些会各自 `new` 登记；改成取同一份 Home 登记后，测试夹具里注入 `providerFactory` 的写法怎么保留（`tests/plugin-runtime-integration.test.ts`、`tests/connector-reconnect-regressions.test.ts`）。
- `plugin-sdk` 的 `definePollingIntegrationPlugin` 与 `PluginIntegrationContribution.bind` 的合同影响写进 PR（API 快照、`docs/system/CONTRACT-CHANGES.md`）。

## 7. 实现记录（与本稿的差别）

- **`help` 提到服务一级**：Manifest 里 `auth_help` 写在 `connection_services[]` 上，不放在 `token` 方式里。Loom 没有令牌可填、只走 MCP，它的帮助文字没有地方放；目录卡的 `auth_help` 本来也是整张卡的。`token` 方式只剩 `label`、`placeholder`。
- **Loom 的卡**：声明 `auth.methods: [{ kind: "mcp" }]`，不再有空的 `token_label`/`token_placeholder`（目录里这两个字段从 `""` 变成没有；界面用 `card.token_label || 默认文字`，显示不变）。目录其余 45 张卡与改前逐字相同（改前目录的 JSON 快照比对）。
- **方式数据的回退**：`connectorMethodsOf(声明)`：平台的表（宿主自带卡、目录包的官方方式表）有这个服务就用表；没有的服务（外部插件声明的）只给声明里的 `token` 方式，没有声明 `token` 就没有方式。OAuth、MCP、CLI 的数据仍在平台表里，等 W5-11。
- **外部插件的定义怎么进登记**：`IntegrationRegistry.enable(定义)` 对内置与外部一视同仁，目前只有内置清单（`builtin-integrations.ts`）调它；已装的外部集成插件不经 `enable`：它在 Home 的沙箱实例里跑，Home 运行它时用 `attach` 把声明和宿主的代理交给登记、停下时 `detach`（BL-530）。
- **留在宿主里的按名字分支**：`feed-connector-sync.ts` 的 `sourceMetadata` 仍按 `sync_kind` 选账号展示函数（BL-528）；`artifact-document-import.ts` 里 CLI 登录只对 `feishu` 放行的一句（BL-529）；`integration-providers.ts` 的三选一是点名的过渡口（PG-045 后删，主人 ac-kernel；2026-10-31 改，T-120：按集成 id 的三选一已删，见 pg046 片）。 其中 BL-528、BL-529 已由 [PG-046 片](pg046-integrations-from-manifest.md) 做掉（账号显示由集成插件的 `presentAccount` 给，文档导入的接入方式由 `connection_methods` 给）；BL-530 归沙箱线（统筹 10-26 定，见 BACKLOG）。

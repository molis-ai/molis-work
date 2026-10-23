# S0b-2 `services.connections`：接缝核查（② 10-22，origin/main `5945a14`）

> 给 ② 自己开工 S0b-2 时用。只读核查，没改任何文件。行号是 origin/main `5945a14` 上的。

## 1. 现有的外网请求路径（没有给宿主内插件的 `services.network`）

- **沙箱生成插件**：`apps/local-host/src/plugin-builder/network.ts` 的 `hostNetwork`（`installed-plugin-host.ts:140`、`:183` 接上）。
  - 超时 15 s；响应 1 MiB；请求体 256 KiB。
  - `RESERVED` 请求头；`VISIBLE` 是响应头白名单。
  - `publicAddress`（`:32`）= `isPublicAddress` 加上 198.18/15。
  - `send` 用自定义 `lookup`：解析出的地址有一个不公开就拒（`PRIVATE_ADDRESS`）；DNS 之后再 `beforeEffect`；不跟随重定向；边流边计数。
  - `options.secret(pluginId, ref)` 先丢掉插件自带的 `authorization`，再注入头。**这是最接近的先例。**
- **共享地址表**：`packages/plugin-sandbox/src/https-proxy.ts` 的 `isPublicAddress`、`validateNetworkRequest`。
- **宿主内插件读公开网页**：`services.materials.readSource`，在 `apps/local-host/src/material-source-reader.ts`。
  - `isMaterialPublicAddress` 也拒 198.18/15。
  - `fetchMaterialPublicBytes`：钉住解析出的 IP；重定向最多 4 跳，每跳重新校验；默认 4 MB，最大 25 MiB；超时 20 s；不允许凭据头。
- **Alchemist 自己的客户端**（`SafePublicHttpClient`）：有主机白名单，没有 IP 校验。

## 2. 服务装配与门控

- **项目级**：
  - `apps/local-host/src/plugin-host-services.ts:50` `openHostSession`；`:66` `issuePluginCaller(…, heldPermissions(manifest, context.grants))`。
  - `:83-89` 只在 Manifest 声明了对应权限时才建可选服务，调用时 `assertActive(); context.requireGrant(…)`。
  - `SessionParts` 在 `:132-151`；`services` 在 `:162-177` 冻结，新服务放进 `:175`。
- **Home 级**：
  - `apps/local-host/src/home-plugin-executor.ts:44` `start`。
  - `:63-66` `authorize` 先重读记录里的 grants，再 `requireGrant`。
  - 服务在 `:101-106`、`:111-115`。
- **只在动作里能用的先例**：`packages/plugin-runtime/src/materials-service.ts:63-81` `run()`。
  - 要求 `currentPluginAction()` 的 install_id 一致、动作声明了这项权限且 `scheduling: "concurrent"`、调用者持有权限。
  - 前后各做一次 `beforeEffect`。
- **动作或后台作业都能用的先例**：`apps/local-host/src/plugin-database-partitions.ts:77`（`currentPluginInvocation`）。
  - 作业的权限取 `background.jobs[].permissions`，所以 `connections:use` 也要列进作业的权限里。
- **注意**：`assertPluginActionCurrent` 在作用域之外直接返回，不能拿它强制「必须在动作里」。
- **权限**：没有登记表，都是自由字符串。常量放在服务旁边（`MATERIAL_PERMISSIONS`、`MODEL_PERMISSIONS`）。服务还会拒 `execution === "sandbox"`。

## 3. 连接器服务定义：没有 API origin 字段

- catalog `plugins/official-integrations/catalog/src/types.ts:28-48` 只有 `permission_host`（裸主机或域名后缀，比如 `googleapis.com`），以及 `additional_permission_hosts`。
  - 真实 URL 写死在各 `identity.request` / `feed.request` 里。
  - Jira、Confluence、Salesforce 按租户（`targets.ts`）。
  - 认证不总是 bearer：`CatalogAuthContext` 有 `raw`、`accessToken`、`extra`，各 spec 自己拼头。
- `ConnectorDirectoryEntry`（`packages/contracts/src/services/connector-host.ts:125-141`）只有界面字段。手写条目在 `apps/local-host/src/connector-directory.ts:23-95`，github 在 `:45-59`。
- GitHub 的 origin 只是 `alchemist-pulse-github.ts:8` 里的一个常量。
- **结论**：平台的「服务定义」要新加 origin（以及认证方式）。这是 S0b-2 设计里要补的一块：按服务登记精确 origin 表，GitHub 先行。

## 4. 绑定存储

- `ConnectorConnectionStore`（`horizontal/connector-host/src/connection-store.ts:109`，由 `apps/local-host/src/connector-connection-store.ts:6` 转出），用 `withConnectorConnections(home, store => …)` 打开。
- 方法：`require(id, serviceId?)` :127、`targetOrigin` :157、`assertTarget` :165（只限 model-api / image-api / mcp-bearer，`INSERT OR IGNORE` 钉第一个 origin）、`resolveToken` :327、`bind({scopeId, pluginId, slotId, serviceId, connectionId})` :335（要求 connected 且服务一致）、`binding(scope, plugin, slot)` :346（**不过滤已移除、已断开**，调用方要再核）、`unbind` :352。没有列出全部绑定的方法。
- 表：`connector_connections`；`connector_bindings`（主键 `scope_id, plugin_id, slot_id`）；`connector_connection_targets`。
- 现有用法：scope 都是 `"home"`，plugin_id 是消费方命名空间（`alchemist`、`functions`、图片存储名）。
- 没有通用的绑定界面或路由。各消费方各开各的门：Alchemist `PUT /pulse/github`；`functions-http.ts:27-29`；`plugin-image-generation-service.ts:25-31`。连接的增删改在 `/api/settings/connectors/connections`，里面没有绑定。

## 5. 取令牌

- `apps/local-host/src/connector-access.ts:24` `resolveApiConnection(home, id, service?, forceRefresh)` 返回 `{connection, token, authExtras, fetchImpl}`。
  - 拒停用、断开、mcp 和 none 类型的连接。
  - CLI 只支持 feishu。
  - OAuth 会刷新令牌。
- `connector-lifecycle.ts:18` `withConnectorRequest`：连接一失效，就中止进行中的请求。
- Feed 的 `feed-source-service.ts:59-72` 交出去的是引用（`credentialRef`），不是令牌。它的绑定写在来源配置的 `connection_id` 里，不在 `connector_bindings`。

## 6. 先例 `apps/local-host/src/alchemist-pulse-github.ts`（main 上还在，81 行）

- 绑定位置：SCOPE `home`，CONSUMER `alchemist`，SLOT `pulse-github`。
- origin 精确比对 `https://api.github.com` 才加 Bearer，没绑定就匿名。
- **缺的**：没有 S-10 地址校验，没有大小上限，不剥响应头，重定向只靠调用方的 `redirect:"manual"`，没绑定时插件自带的 `authorization` 原样透过。S0b-2 要全部补上。

## 7. Manifest

- 类型：`packages/contracts/src/platform/plugin.ts`。
  - `PluginManifest` 在 `:246-325`；服务挂在 `PluginHostServices`（`:109-155`）上。
  - `PluginUpgradeContext` 的 `Omit`（`:473`）要加 `"connections"`。
- 解析：`packages/plugin-sdk/src/manifest.ts`。
  - `assertNoV2Blocks` 在 `:174-194`；`assertV2Blocks` 在 `:206-236`。
  - 照 `background-declarations.ts:9-36` 的写法：字段集合、id 正则、去重、`reason` 非空、权限是声明的子集。
- 文档：`docs/platform/PLUGIN-PLATFORM.md`、`PLUGIN-DEVELOPMENT.md`；API 快照 `tooling/gates/api/contracts/platform/plugin.txt`。

## 8. 安全不变量

- S-10（:24）：只取公开地址。测试 `tests/security-invariants-urls.test.ts` 三条，另有几个专项测试文件。代码位置一栏没有 `connector-access.ts` 和 `alchemist-pulse-github.ts`。
- S-12（:26）：密钥只给引用；凭据只发往它第一次绑定的来源。测试 `tests/security-invariants-secrets.test.ts`、`tests/connector-connections.test.ts`「pin their first destination origin」。
- S-15（:29）：插件权限要声明并且授予。
- main 上最大的编号是 S-54。开 PR 时再核 main 和在途 PR 取下一个空号。

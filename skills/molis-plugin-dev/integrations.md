# 接入：外部世界

Integration Plugin 把外部协议变成 Connector + Signal。Host 不写 GitHub/Gmail 分支。Feed 只消费已经变成 Item 的结果。账号设置可挂 `workbench.settings`；来源任务、立刻拉取、token、计划留在 Feed，不进 `feed.capture`。

## 形态

用 `definePollingIntegrationPlugin`：

```ts
export function createGithubIntegrationPlugin(input: { provider: IntegrationProviderPort; now?: () => Date }) {
  return definePollingIntegrationPlugin({
    manifest: githubIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:github.com");
      context.requireGrant("secret:github");
      return input.provider;
    },
    now: input.now,
  });
}
```

`createProvider` 返回的 port 负责 `health` 和 `sync`（cursor、`normal` / `rebuild_cursor`）。真实 `health` 可以返回 `account: { login, account_id? }`，只有经过认证的服务响应中已验证的身份才填写；有稳定账号 id 时一并返回，显示名称和本地保存的标签不能替代身份。未返回时保持未知，不能从 message 文案解析账号。SDK 把它收成 Connector Driver 的 `poll` 和 Signal Adapter 的 `toSignalDraft`。不要在 Native 插件里直接 fetch GitHub。

现有：GitHub、Gmail、RSS、YouTube Channel、Catalog（按连接器 id 生成 Manifest）、Web Query。

## 权限

- `network:<host>`：实际要访问的主机。YouTube 公开 Feed 可以只有 network。
- `secret:<name>`：不可导出的凭据引用。Gmail/GitHub/Catalog 需要；Web Query 的 secret 可以 `required: false`。
- 不要在私人存储里存可导出的 token。

## OAuth 与账号

GitHub、Gmail 有独立的 oauth 模块：配置、pending、token 生命周期、按账号隔离。账号检查（whoami）用连接器动作 `connectors.account.read`（GitHub 1.2.0 起，Catalog 连接器 1.1.0 起），不是插件自己登记的 behavior；连接 / 断开是设置页动作。这些都**不进** `feed.capture`。

项目 MCP 的来源插件是来历，不能作为连接运行寿命或其他消费者授权。Host 共用目录保留项目范围，每次调用核对当前调用者与工作区权限；项目配置只引用 Home 凭据 owner，不能把 SDK 进程内的 credential ref 当成持久密钥。停用连接保留凭据，但所有消费者都须拒绝调用；移除不删除已有业务成果。

## Catalog 连接器

`plugins/official-integrations/catalog` 按 `connectorId` 生成 `plugin_id: io.molis.work.integration.<id>`、权限主机和标题。新目录连接器先看 catalog spec，不要复制一份 GitHub 插件。

## 不要做的

- 在 Feed Native 里写 provider if/else。
- 把来源设置按钮放进消息详情的判断池。
- 为「以后可能有的 webhook」先声明 Listener 空壳。没有真实 poll/sync 路径就不要做 integration。
- 用 mock health 当已连接。`status === "mock"` 在 SDK 里会收成 error。

业务模块引用账号连接时，可用 contracts 的 `defineConnectorUsagesAction` 声明只读使用位置查询，返回自己当前保存的对象引用和已有业务动作。输入输出类型为 `molis.connector-usages.input.v1` / `molis.connector-usages.output.v1`；Home 的 `connectors.usages.read` 按类型发现，再以原调用者身份调用。不要另存绑定、导出凭据或替其他模块报告。报告中的动作参数只含非敏感对象 id 等已知部分；可见的使用位置不授予执行权限，目录与派出仍各自检查。公开 RSS 等没有账号的来源不生成账号引用。模型的当前配置不等于每个任务都选择该模型，不能据此列出所有推理动作。

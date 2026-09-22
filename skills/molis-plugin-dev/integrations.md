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

`createProvider` 返回的 port 负责 `health` 和 `sync`（cursor、`normal` / `rebuild_cursor`）。SDK 把它收成 Connector Driver 的 `poll` 和 Signal Adapter 的 `toSignalDraft`。不要在 Native 插件里直接 fetch GitHub。

现有：GitHub、Gmail、RSS、YouTube Channel、Catalog（按连接器 id 生成 Manifest）、Web Query。

## 权限

- `network:<host>`：实际要访问的主机。YouTube 公开 Feed 可以只有 network。
- `secret:<name>`：不可导出的凭据引用。Gmail/GitHub/Catalog 需要；Web Query 的 secret 可以 `required: false`。
- 不要在私人存储里存可导出的 token。

## OAuth 与账号

GitHub、Gmail 有独立的 oauth 模块：配置、pending、token 生命周期、按账号隔离。whoami / 连接 / 断开是设置页动作，进 Agent 或设置，**不进** `feed.capture`。

`github.whoami` 登记为 behavior，`subject_kinds` 是 `mcp_invoke` / `session`，不是 `feed_item`。

## Catalog 连接器

`plugins/official-integrations/catalog` 按 `connectorId` 生成 `plugin_id: io.molis.work.integration.<id>`、权限主机和标题。新目录连接器先看 catalog spec，不要复制一份 GitHub 插件。

## 不要做的

- 在 Feed Native 里写 provider if/else。
- 把来源设置按钮放进消息详情的判断池。
- 为「以后可能有的 webhook」先声明 Listener 空壳。没有真实 poll/sync 路径就不要做 integration。
- 用 mock health 当已连接。`status === "mock"` 在 SDK 里会收成 error。

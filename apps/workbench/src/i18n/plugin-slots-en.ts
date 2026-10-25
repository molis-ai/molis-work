/** 服务连接 › 插件用的账号: which of the person's accounts a plugin's connection slot sends with (BL-350). */
export const PLUGIN_SLOTS_EN: Record<string, string> = {
  "插件用的账号": "Accounts plugins use",
  "插件经平台向这些服务发请求时用哪个账号。插件看不到凭据。不选账号时，请求不带凭据；Salesforce、Jira、Confluence 这类按租户分站点的服务不选账号，插件就不能请求。": "Which account a plugin uses when it sends requests to these services through Molis. Plugins never see the credentials. With no account chosen, requests are sent without them; for services on each organization's own site, such as Salesforce, Jira and Confluence, the plugin cannot send requests at all.",
  "这里只列出个人插件；从项目进入设置，可以看到这个项目装的插件。": "Only personal plugins are listed here; open Settings from a project to see the plugins installed there.",
  "使用的账号": "Account used",
  "不用账号（请求不带凭据）": "No account (requests carry no credentials)",
  "不用账号（插件不能请求这个服务）": "No account (the plugin cannot send requests to this service)",
  "需要重新连接": "Needs reconnecting",
  "重新连接 {service}": "Reconnect {service}",
  "连接 {service}": "Connect {service}",
  "已保存，插件之后的请求用这个账号。": "Saved. The plugin's requests now use this account.",
  "已保存绑定；这个账号需要重新连接确认站点，插件暂时不能请求。": "Binding saved. Reconnect this account to confirm its site before the plugin can send requests.",
  "已解除，插件之后的请求不带凭据。": "Removed. The plugin's requests now carry no credentials.",
  "已解除，插件不能再请求这个服务。": "Removed. The plugin can no longer send requests to this service.",
};

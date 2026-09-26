# Connector 官方连接方式目录

目标：当前 Connector 目录的每个条目（盘点时为 45 个，包含通用远程 MCP 凭据）的详情页都展示官方确有的连接方式与配置入口，让用户知道 OAuth、CLI、令牌、MCP 中哪些可用，以及 Molis Work 现在能否直接完成连接。现状是绝大多数服务只有一个令牌表单和若干未按方式分类的链接；Notion 官方有托管 MCP，但页面没有入口，现有 MCP 设置页管的是 Molis Work 对外导出工具。

范围：盘点当前目录里的全部服务，按服务提供 OAuth、官方 CLI、令牌/应用密钥、官方 MCP 中确有的方式；每种方式给直达官方文档或配置页的 HTTPS 链接、简短用途和在 Molis Work 的状态。当前已实现的 GitHub、Gmail、Notion、飞书方式保留真实操作；其他方式仅作为官方入口展示，清楚标为“需在官方完成授权后粘贴令牌”或“Molis Work 尚未接入”，不能用一个假按钮冒充已接通。第三方社区 MCP 和推测出来的 CLI 不列为官方。现有用户连接、凭据及 Feed 绑定不迁移、不重授权。

行为：用户从服务卡片进入详情，可以逐项看该服务支持的方式与具体官方入口。方式状态区分“本机可直接连接”、“可在官方获取后在本机粘贴令牌”、“官方提供但 Molis Work 尚未接入”。已有连接行继续显示自己的实际方式和状态；说明不根据有官方文档就把服务显示成已连接。Notion MCP 独立于已授权的 Notion API OAuth，明确前者是新授权，不能沿用当前仅限 Quick Note 的只读权限。`/settings/mcp` 继续管理 Molis Work 对外工具，不充当外部服务账号页。

方案：Integration catalog 持有按服务 ID 的官方方式清单，Host 目录将其带给设置视图，Workbench 按方式渲染。方法类型与支持状态进入 Connector 契约；官方链接经过 HTTPS 校验，页面对外链保留 `noopener noreferrer`。保留现有 `setup_links` 兼容已有调用，避免把目录资料与实际鉴权实现混在一起。缺乏可核实的官方方式时不显示该方式。

验收：当前目录全部条目均有方式清单；每个列出的方式有能打开的官方入口，且没有任何方法被错误标成 Molis Work 已接通。GitHub/Gmail/Notion/飞书现有入口和状态不回退；Notion 官方 MCP 可见，标为未接入并说明需单独授权。桌面与窄屏详情可读，键盘和链接可用。运行目录数据测试、设置页测试、相关包 build，并在浏览器抽查有 OAuth/CLI/Token/MCP 组合的服务。

证据与取舍：各方式以服务商当前官方文档为依据，记录到目录链接里；不把“支持 OAuth”推断为“不用应用配置即可一键登录”，也不把本机的 Token 表单称作完整 OAuth。真正实现其余约 40 个服务的 OAuth/MCP/CLI 客户端不在本轮；需要逐服务建立授权、刷新、作用域和调用适配。

盘点中的版本差异：Bitbucket App Password 已停用，改用 Atlassian API Token；HubSpot 新连接优先 Service Key，现有 Private App Token 仍可使用；Loom 没有公开 API Token，普通账号可参考 Atlassian Rovo MCP。Google Workspace `gws` 仓库自称不是 Google 正式支持的产品，Microsoft Graph CLI 已退休，故不列为官方 CLI；Microsoft Graph PowerShell 仍有官方授权入口。

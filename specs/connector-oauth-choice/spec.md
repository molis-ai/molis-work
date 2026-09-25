# 飞书、Gmail、Notion 连接方式选择

目标：Connector 设置中让用户明确选择可用连接方式，并让授权后的凭据真正供 Feed、账号检查和文档导入使用。现状是 Gmail 已有浏览器 OAuth 但藏在 token 表单后；Notion 只有内部集成 token；飞书只有 `app_id:app_secret` 的应用身份。官方飞书 CLI 提供设备授权、令牌刷新和结构化 API 输出，但本机此前未配置。

范围：Gmail 展示 Google OAuth 与访问令牌两种方式；Notion 展示公共连接 OAuth 与内部集成令牌；飞书展示官方 CLI 用户授权与企业自建应用凭据。三者各自说明适用对象、权限及官方配置链接。保留已保存凭据和原有手动方式。OAuth/CLI 授权失败、取消、过期和断开有可恢复状态；密码与令牌不回显、不进入 URL 或日志。其他 Connector 不改。

行为：用户在 Connector 详情中选方式并启动，浏览器或设备授权完成后回到当前连接详情，看到已验证账号；后续 Feed 和文档导入沿选中的方式读取。Gmail 沿用现有 PKCE、state、回调与 refresh；Notion 使用授权码、state、本机回调及本机 SecretStore，保存 workspace 身份和 refresh token；飞书由官方 `lark-cli` 保存及刷新用户令牌，GoalBoard 只调用限定的只读 API 命令，不复制 CLI 凭据。手动换方式成功后，旧方式不再被用于调用。断开只清理 GoalBoard 自己管理的凭据；CLI 登录由用户在 CLI 中管理。

Notion 的开发者后台拒绝 IP 地址回调；界面和 OAuth 请求统一使用 `http://localhost:<当前端口>`，即便用户从 `127.0.0.1` 打开本机页面。

实现边界：Connector 目录与设置 UI 负责选择和状态；Local Host 负责 HTTP、SecretStore 和 CLI 进程边界；Notion OAuth 协议与 Feishu/Notion 只读数据解析归 Integration；Feed 与文档导入共用连接解析。CLI 不存在或未登录时展示安装/配置/授权路径，不能显示为已连接。只调用飞书官方 CLI 的只读端点，不用其通用写命令。

验证：定向测试覆盖三种设置选项、OAuth state 和回调、Notion 授权与刷新、CLI 登录状态与只读调用、从 OAuth/CLI 到 Feed/文档导入的真实调用路径、凭据未泄漏及失败恢复；运行相关包 typecheck/build 和浏览器关键路径。真实第三方账号授权另以开发者应用配置、用户同意和实际 API 读取验证，未完成时明确标为未验证。

假设与开放问题：Google OAuth 正式使用可能要求应用验证；Notion 公共连接可能要求审核和回调登记；飞书 CLI 首次使用仍需 `config init --new` 建应用并申请所需 scope。真实平台授权以现有登录与平台权限为准，不能以 mock 代替。

实机验证（2026-09-24）：飞书 CLI 用户授权完成，仅申请会话列表、文档、知识库三项只读权限，CLI 身份验证和 12 条聊天来源同步成功；Gmail 浏览器 OAuth 回调完成，Gmail profile API 返回 200；Notion Public connection 只开启 Read content、关闭用户资料能力，用户仅授权 Quick Note，OAuth 回调完成，`/v1/search` 找到该页且 `/v1/blocks/{id}/children` 返回 200。Notion 正式回调保留 4173 端口，隔离验证时使用的 4182 回调已移除。以上均未在记录中保存令牌、邮件或文档正文。

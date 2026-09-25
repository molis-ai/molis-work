# Gmail Feed 授权与 Connector 状态一致

目标：修复 Connectors 显示 Gmail 已连接、Feed 按账号来源仍报授权失效的路径。现状证据：Feed 的 Connectors 链接未传项目；全局 OAuth 回调只写共享凭据，而 Feed 账号来源读取独立凭据引用。连接页在共享凭据已绑定时隐藏 OAuth 入口。

范围：Feed 中打开 Connectors 时保留当前项目上下文；Gmail 有本机凭据时如实显示“凭据已保存”，仍可重新 OAuth 授权；项目回调为同一邮箱更新独立凭据与来源状态，并保留该来源的游标、计数、计划和创建时间。新账号不得继承旧 Gmail 来源的游标。无需改 Google 权限或引入跨账号凭据回退；未获验证的共享 token 不能冒充某个账号的 token。

行为：用户从项目 Feed 的 Gmail 来源或添加来源入口打开 Connectors，已连接时也能直接重新授权；授权走项目 Gmail 回调，完成后设置页保留项目上下文。同一邮箱对应原来源，下一次拉取使用更新后的账号凭据。全局 Connectors 仍可管理本机共享连接，并明确本机凭据与各账号 Feed 来源的关系。

边界：改 Feed UI 链接、Connectors 的 Gmail 授权入口、Feed Gmail 授权完成时的来源更新；使用现有 OAuth、SecretStore、项目路由与来源 ID。验证 Feed 链接含项目参数、已连接时可重新授权、重复授权不重置同步进度且账号隔离。运行定向测试及相关类型检查。

假设：从项目 Feed 出发可取得 `route_prefix`；Google 回调可取得邮箱。若 Google 不返回邮箱，沿用现有兼容来源路径，不将凭据归给未知账号。

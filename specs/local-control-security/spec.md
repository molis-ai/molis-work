# 本地 Web 控制面安全

## 背景与目标

Molis Work Web 默认只监听 `127.0.0.1`，但浏览器中的其他站点仍可能尝试向本机端口发送请求。现在 Runtime 配置、项目迁移/创建、Session 切换，以及 Goal 的删除和用户决定等 Web 写接口只依赖业务字段确认，没有统一验证请求是否来自当前 Molis Work 页面，也没有通用重复提交保护。

本 Work Item 给所有 Web API 写操作增加同一层本地控制门禁，确保只有从当前本机 Molis Work 页面发起、携带当前服务实例控制令牌和一次性请求键的操作能进入领域服务。

## 当前行为与证据

- CLI 已明确绑定 `127.0.0.1`，但 HTTP server 会接受任意 `Host` header。
- Web CSP 限制页面自己的连接目标，但不能阻止第三方页面向本机端口盲发请求。
- 设置页和 Goal 工作台共有二十余个 JSON POST 调用，各自直接使用 `fetch`，没有共享控制凭据。
- 业务层已对 Runtime 配置 plan、Goal 回收站、Session 切换、项目删除等要求明确确认；传输入口仍缺 Origin、控制令牌和通用防重放门禁。

## 范围

- Web server 只接受 loopback `Host`（`127.0.0.1`、`localhost`、`::1`）。
- 每个 Molis Work home 在 `config/web-control-token` 持久化一份高熵 control token（文件权限 0600）；测试可注入固定 token。重启常驻 Web 后本机页面不必因令牌轮换而整页刷新。卸载时删除该文件。
- 所有 `/api/` 非安全方法统一校验：同源 `Origin`、control token、一次性 idempotency key。
- 本机终端 WebSocket `/pty` 在升级时校验 loopback `Host`；若请求带 Origin，必须与 Host 一致。浏览器无法给 WebSocket 加自定义 header，因此连接后的首包必须携带同一 control token，通过后才转发 PTY 指令。
- token 只写入 Molis Work 自己返回的 HTML meta，不写日志、不进 JSON API、不进 Runtime 配置或项目 DB。终端 WebSocket 只在首包使用该 token，不把它放进 URL。
- 项目列表、设置页和 Goal 工作台使用同一个客户端 header helper；每次用户动作生成一次请求键。
- 服务端原子保留请求键：正在处理或已经成功的重复键返回冲突，不再次进入领域方法；失败请求释放键，用户修正后可重试。
- 保留领域层的明确确认、plan freshness、Runtime host identity 和 MCP authority；HTTP 门禁不替代它们。

## 非目标

- 不增加登录、远程账户、HTTPS 或公网监听。
- 不把 control token 写入项目 DB、Runtime 配置或日志；只存在于 Molis Work home 的 `config/web-control-token`、本机页面 meta、写请求 header，以及终端 WebSocket 首包。
- 不给第三方 Origin 开 CORS。
- 不改变 MCP stdio 请求格式；MCP 不经过浏览器 Origin/CSRF 门禁。
- 不在本 Work Item 新增项目删除 UI。

## 用户与攻击场景

1. 用户在 Molis Work 页面确认 Runtime 接入：页面自动附加同源 Origin、实例 token 和请求键，现有 plan/确认门槛照常生效。
2. 第三方站点向 `127.0.0.1` 盲发 POST：缺少 token 或 Origin 不匹配，领域服务完全不被调用。
3. DNS rebinding 或伪造 Host 请求页面/token：非 loopback Host 在返回 HTML 前被拒绝。
4. 用户双击或浏览器重放同一成功请求：第二次收到冲突，项目、Session 或 Goal 事实只变化一次。
5. 用户提交缺字段后修正：失败请求释放请求键；新的或同一键可再次提交，不会被错误锁死。

## 方案与关键决策

- `createMolisWorkWebServer` 从 Molis Work home 读取或写入 control token，并在内存中持有请求键表。
- Origin 必须是 loopback 且 `origin.host` 与 HTTP `Host` 完全一致，避免 `localhost` 与 `127.0.0.1` 被当成同源。
- token 用 constant-time 比较；错误响应只说本地控制校验失败，不回显收到的 token、Origin 或宿主线索。
- idempotency key 是客户端每次动作生成的 UUID。服务端在路由前保留，在响应完成后仅对成功状态保留；失败状态删除。
- 请求键表有固定上限，按最早成功项淘汰，避免常驻 Web 进程无限增长。
- 所有 Web POST 共用一层门禁，避免只保护设置页而遗漏 Goal 删除、用户决定等同等级写权限。

## 输入、输出与依赖

- 输入：HTTP Host、Origin、`x-molis-work-control-token`、`x-molis-work-idempotency-key`；终端通道另有 WebSocket 首包 token。
- 输出：允许进入现有路由，或返回不泄露秘密的 400 / 403 / 409 JSON。
- 依赖：Node `crypto`、现有 render/client script 和 Web server。

## 文件与模块边界

- `src/web/server.ts`：token 生命周期、loopback/Origin/token/请求键门禁。
- `src/web/pty-socket.ts`：`/pty` 升级与首包 token。
- `src/web/render.ts`：token meta 和统一写请求 headers。
- `tests/web.test.ts`：合法请求 helper、跨站/缺凭据/Host/重放安全回归。
- `README.md`：说明 Web 仅本机监听以及浏览器写入门禁。
- `DESIGN.md`：设置与 Goal 写操作的安全交互规则。

## 验收标准

- 跨站 Origin、缺少/错误 token、非 loopback Host 的敏感请求在领域写入前被拒绝。
- 合法同源页面仍可完成 Runtime 配置、项目、Session 和 Goal 的现有流程。
- 同一成功请求键不会造成第二次写入；失败请求可修正重试。
- HTML/API/日志不暴露用户原始 Runtime 配置、宿主 Session ID 或 control token；token 只存在于 Molis Work home 的 `config/web-control-token`、本机页面 meta、写请求 header，以及终端 WebSocket 首包。
- 完整 Web 与项目/Runtime/MCP 回归通过。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/web.test.ts tests/runtime-integration.test.ts tests/project-catalog.test.ts tests/mcp.test.ts
pnpm test
```

另用真实本机页面执行只读加载和一次无副作用 plan 预览，确认浏览器自动带门禁 headers 且无控制台错误。

## 假设与开放问题

- 当前产品只支持本机单用户 Web；若未来允许远程访问，需要独立设计 TLS、身份认证、会话和授权，不能复用这枚本地 token 当账户凭据。

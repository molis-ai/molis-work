# 验收记录

2026-09-26。目标仍为“功能可用”。工程、协议和界面证据如下；服务商真实账号逐项验收尚未完成，见 [官方方式矩阵](provider-verification.md)。

## 实现与复验

- 45 个目录项：39 API OAuth、20 CLI、38 MCP 入口、44 Key / Token 入口。每个已列出的方式均有对应 Host 适配和操作界面；通用 Bearer MCP 的消费入口仍在 Coding。
- API OAuth：官方 endpoint / scope / client 认证差异、PKCE、一次性 state、过期清理、HTTPS 手动回调、每条连接自己的客户端配置和刷新凭据。稳定账号 ID 用于阻止重授权换成另一个账号。
- MCP：官方 SDK 的 Streamable HTTP、旧 SSE、stdio、OAuth discovery / DCR / PKCE、Bearer、刷新、工具发现/调用、资源读取。连接描述可供 Agent 使用；断开、替换或调用方 AbortSignal 取消正在执行的请求。MCP 新授权另建连接，因为通用协议无法确认远端稳定账号身份。
- CLI：固定官方可执行文件和参数、原生 PTY 登录、输入回显脱敏、真实只读账号检查；连接保存账号指纹，切换 CLI 账号后旧连接拒绝读取。CLI 凭据由官方工具管理。
- 消费者：Feed 切换账号保留旧历史；Images 只使用指定连接；文档导入要求选择账号、保存连接来源，读取中撤销连接后不写入产物。
- Store 归 horizontal/connector-host；Projects、Sources、Images 与 ModelProvider owner 暴露所需端口，Host 不跨业务表读写。独立 F5 审查已关闭此问题。

## 自动化证据

共 **70 个不同的定向测试用例通过**（重复运行不重复计数）。测试调用生产实现；第三方交互由本地 HTTP/SSE/stdio MCP Server、官方 CLI 输出 fixture 和受控 API transport 提供，不使用私人账号。

| 范围 | 结果 / 证据 |
|---|---|
| API OAuth、MCP、原有 Gmail/Notion/飞书兼容及 UI | `/tmp/connector-final-protocol.log`，28/28 |
| 现有文档 HTTP 导入、Images、Feed、命名连接、文档 provider | `/tmp/connector-final-consumers.log`，28/28 |
| 真实 PTY、CLI 身份结构、文档选定账号/撤销回归 | `/tmp/connector-final-account-consumers.log`，5/5 |
| Catalog、全部方式目录、合并后 UI | `/tmp/connector-final-directory-ui.log`，21/21 |
| Diff whitespace 检查 | `git diff --check` 通过 |
| 定向源代码类型检查 | `/tmp/molis-connectors-scoped-typecheck.json`，`tsc --noEmit` exit 0；覆盖本批协议、UI、目录、导入及其生产依赖 |
| 全源类型检查 | 当前其他 owner 的 Agent workspace/directory 契约调整阻断全源检查，已交给该 owner，待统一构建结论 |
| 包边界门禁 | Connector F5 项已清除；当前其他 owner 的 plugin-sandbox inventory 已交接；personal-assistant-store 的边界修复已由 owner 在专属分支完成（39a6e594），主工作区尚未接入，本次主工作区门禁仍保留该项 |

复现相关测试（正常工程已完成依赖构建时）：

```sh
node scripts/run-tests.mjs tests/catalog-connectors.test.ts tests/connector-method-directory.test.ts tests/connector-api-oauth.test.ts tests/connector-cli.test.ts tests/connector-mcp.test.ts tests/connector-oauth-choice.test.ts tests/gmail-oauth.test.ts tests/connector-connections.test.ts tests/connector-document-import.test.ts tests/artifact-document-import.test.ts tests/document-import-providers.test.ts
```

本次共享工作区处于其他任务的构建/QA交接，使用 `/tmp/molis-connectors-source-tsconfig.json` 将 workspace package aliases 指向源文件，测试命令加 `TSX_TSCONFIG_PATH=/tmp/molis-connectors-source-tsconfig.json`。未在他人的共享 dist QA 窗口重建或停止共享服务。统一构建由总交付中的 Agent/Build owner 接收本批源码。

## 实际界面操作

独立 Home `/tmp/molis-connectors-qa-home`，源代码启动 `http://127.0.0.1:19426/capabilities/connections`：

- 桌面、窄屏，以及系统浅色/深色下检查服务列表和 Notion/Canva 详情。
- 图标外框 40×40，图片 24×24，padding 8px；品牌纵横比保持，全部 SVG 图片加载成功（broken image = 0）。图像隔离避免 SVG 内部 gradient/style ID 冲突。
- 打开 Notion OAuth 配置，空配置提交返回有效的 Client ID 提示；打开 Canva MCP 配置，未填写注册信息返回需 Client ID 的明确错误。
- 无浏览器 console warning/error；临时视口和主题模拟已经恢复。浏览器自身缩放导致 CSS 视口为约433px，DOM检查无横向溢出；这项证据不代替每种真实手机的验收。
- 重复的 Gmail/Notion/飞书授权表单已合并；Key 说明位于对应令牌输入处。暗色主题下3个通用入口的符号已固定为深色，确保白色底框上的对比度。

## 仍需的实网证据

需要用户指定可用于测试的连接或测试账号范围，并在产品内输入应用凭据。每个服务需验证授权→读取或显式工具调用→过期/权限恢复→断开。尚未运行第三方真实写入、未接受新服务条款、未使用生产密钥逐服务试验。完成这些之前，不宣称45个服务的所有方式均已实网通过，也不宣称可发布。

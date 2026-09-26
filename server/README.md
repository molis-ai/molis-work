# Molis Work Server

Status: `partial`. Contract: `@molis-ai/molis-work-contracts/platform/app-host`.
Workspace registration: `goal-reorg-f2`.

公共身份、设备、项目访问、接续回执与事件传输。`server` 是可嵌入的核心包，`apps/server` 是本地可部署启动器；共享同一份实现。聊天领域由 `src/im` 提供。服务不启动模型运行时，所有业务读写调用现有 Action Host。

## 本地启动

使用 Node 24+。在依赖已构建的仓库根目录运行：

```sh
node node_modules/typescript/bin/tsc -p server/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
node apps/server/dist/main.js serve --state /absolute/server-state --config /absolute/projects.json --host-home /absolute/molis-home --host-url http://127.0.0.1:4173
```

现有桌面 Host 必须已启动。`projects.json` 显式列出允许传输的项目、目标和固定成果版本，不填写私有数据库路径：

```json
{"projects":[{"id":"EXISTING_PROJECT_ID","title":"项目接续","goal_ids":["EXISTING_GOAL_ID"],"artifacts":[{"artifact_id":"EXISTING_ARTIFACT_ID","version":2}]}]}
```

打开 `http://127.0.0.1:4187/continuity`。使用 state 目录中 `connect.json` 的一次性代码连接第一个设备（10 分钟有效）；文件权限为 0600，代码不写到日志。重新启动会生成新代码。每次启动都以当前 projects.json 为准：移除项目会撤回全部设备成员的该项目访问并作废旧邀请；重新加入只恢复所有者，原成员需重新邀请。后续同用户设备通过“连接另一台设备”配对；项目邀请创建或复用另一位成员，仅授予指定项目权限。

`/im` 是同一服务下的群聊，使用同一成员身份与设备 cookie。不同 state 数据库使用不同 cookie 名，同数据库重启保持名称；浏览器同一域名的多端口不会互相覆盖身份。关闭设备会停止该设备的 SSE，取消仍在等待的跨端请求。项目访问每次读取、操作前和返回前重查，已经发生的事实不会被撤权伪装成未发生。

## 首次授权与撤回

项目访问和 Host 动作授权是两个必要条件。邀请不暗授 Host 权限。由本机管理员调用已有的受保护授权入口：

```sh
node apps/server/dist/main.js members --state /absolute/server-state
node apps/server/dist/main.js authorize --state /absolute/server-state --member MEMBER_ID --project PROJECT_ID --control-token-file /absolute/molis-home/config/web-control-token --host-url http://127.0.0.1:4173
```

该命令调用原 `/api/settings/mcp/actions`，不另存授权目录。每位成员的 client 是 `runtime:cross-device:<member-id>`。只读成员获得四个读取动作，协作成员加 `goals.progress.record`；精确 provider 和版本固定在 `CONTINUITY_ACTIONS`。每条更新单独回执，错误会报告已应用条数，可修复后重跑。

网页中撤回项目访问立即阻断接续入口、取消等待请求并关闭事件流。本机管理员还可清除同成员原 Host grants：在上述 authorize 命令追加 `--revoke`。不能把控制令牌发送到手机，或把本机 Host 暴露到公网。

## 接续与冲突

桌面仍是 Goal/Artifact 真相源。页面逐字段投影显式选中的目标，不返回完整合约、私人历史或 Home。手机仅可记录进展、下一步和下一位接手人，不会提交用户决定、启动 Agent 或自动完成 Goal。

命令先保存原输入和稳定 command id，再调用原 Goal 进展动作。收到成功才显示已保存。结果未知时先查询原 actor 的进展回执；没有回执时才按原键、原内容、原 cursor/contract revision 重试。Goal 原业务事务负责最终幂等。版本冲突保留草稿，用户查看最新状态后用新命令提交。该保证只适用于这项有业务回执的动作，不适用于任意 Action。

浏览器 localStorage 仅保存当前成员待发送进展，成功后删除。退出、会话失效或撤权事件会清除页面、代码和待发送内容。已授权下载的资产无法远程收回。首次打开仍需要联网，未提供离线安装的 PWA。

## 换设备使用资产

“保存工作资产”只导出选中的固定 Artifact 内容、来源身份、插件依赖与目标接续摘要。团队邀请前，选中的 Artifact 必须已是 `team_project` 版本；不会把私人版本原地改成共享。引用型内容不导出文件路径或凭据，恢复时保留 unavailable。

```sh
node apps/server/dist/main.js restore --bundle /absolute/molis-work-assets.json --destination /absolute/new-molis-home
node apps/server/dist/main.js read-assets --destination /absolute/new-molis-home --project SOURCE_PROJECT_ID
```

restore 使用原 Catalog、LocalHost 公开项目数据库与 Artifacts owner，在新 Home 创建正式项目并注册固定成果。原项目标识保留为 `source_project_id`，目标项目采用 Catalog 支持的独立恢复标识；映射在创建前保存，重试继续同一目标项目。可通过该 Home 的正式 Artifact 浏览器继续读取；缺插件时原始正文仍保留。相同版本重复导入不重复注册，内容冲突或摘要不符拒绝。目标只迁移接续摘要（`continuity/<source-project-id>.json`），不重建完整执行历史、权限与完成验收；依旧连接原项目时，可继续操作原目标。第一次恢复失败可能留下空项目容器，可修正后重试。

## 局域网手机

默认只绑定数字 loopback。实际手机须使用同一受信任网络的显式 HTTPS 入口：

```sh
node apps/server/dist/main.js serve --state /absolute/server-state --config /absolute/projects.json --host-home /absolute/molis-home --hostname LAN_ADDRESS --port 4187 --origin https://LAN_ADDRESS:4187 --cert /absolute/cert.pem --key /absolute/key.pem
```

证书必须由设备信任，工具不会绕过证书警告。没有购买服务、公开部署或接入私人账号。本轮浏览器与窄屏验证不等于真机手机验收。

## 嵌入已有桌面

`createServerRequestHandler(options, getOrigin)` 与 `startServer(options)` 共用保护逻辑。桌面 owner 仅对 `/im*`、`/continuity*` 路由挂载 handler，传入经过 Host 校验的真实 origin。`Identity`、`ServerEvents`、`ContinuityService` 与 `createImDomain` 使用同一个 `openServerDatabase`。`ActionFactory` 由可信 adapter 注入稳定成员身份、精确 action refs、权限重查与取消信号；浏览器不提供 actor/grant。

`ServerEvents.append` 在领域事务内写事件；事务成功后 `notify()`。SSE 发 `ready`/`change`/`revoked`，支持 Last-Event-ID，关闭服务时调用 `events.close()`。该事件流是刷新提示，项目读取结果仍来自业务 owner。

## 验证

```sh
node --import tsx --test tests/cross-device-continuity.test.ts tests/cross-device-http.test.ts
node --import tsx --test tests/cross-device-gateway.test.ts tests/im-domain.test.ts
node --import tsx --test tests/cross-device-client.test.ts tests/cross-device-launcher.test.ts
node --import tsx server/tooling/continuity-demo.mts /tmp/molis-continuity-isolated-qa
```

QA 工具只创建显式隔离目录和实际业务对象；`lose-next-response` 文件只由该工具读取，用于在真实进展已提交后丢弃响应。该故障入口不存在于产品 HTTP。验证状态与交接见 `specs/bp-delivery-parallel/work-items/cross-device-team/verification.md`。

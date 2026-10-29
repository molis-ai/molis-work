# Contracts and Operations

## Contracts

`packages/contracts` 是唯一公共协议承载包，通过 `modules/*`、`services/*`、`platform/*` subpath 暴露类型和 Schema。一个分发包不代表一个万能协议；每个 owner 保留独立 API/event/schema version。

- 禁止根 barrel 聚合全部类型。
- 合同读写只认现行取值；存量数据由维护改成现行形状，不保留旧版本解析（新增兼容须先写进 `specs/repository-anti-corruption` 并经用户确认）。以后读取兼容的流程与起点见 [合同变更流程](../system/CONTRACT-CHANGES.md)。
- Contract 不依赖业务实现、数据库、网络、App 或 Plugin。

## Observability

`packages/observability` 尚未创建（`absent`）。宿主的日志只有一份写法：`hostLog`（`apps/local-host/src/host-log.ts`，W5-13），每条一行 JSON 写到 stderr，带所在调用的编号；错误只留名字和码，字段只留数字、布尔、null 和像键的字符串，其余写成 `"[omitted]"`。像键只是形状检查，不是密钥识别，所以调用方只放自己选定的 id、枚举和计数。没有 trace：一次调用的调用记录和日志行靠同一个调用编号对上（`docs/system/EXTENSION-POINTS.md` 的 F6）。业务 owner 定义“成功/失败”的含义，Secret 与私人 Session 内容默认禁止进入日志。

## Test Kit

`packages/test-kit` 目前提供三类与业务无关的东西：包边界规则（`boundaries.ts`，根入口）、无头 Chrome 的启动与 DevTools 驱动（子路径 `/browser`：找 Chrome、启动与关闭、命令、页内等待、点击、填写）和访问本机 Host HTTP 管理接口的客户端（子路径 `/local-host-http`：带闸门要的请求头，授权、撤权、建项目、装插件走设置页用的接口，按声明的依赖排授权的顺序）；deterministic clock、fake capability 等测试工具仍在各测试里，尚未迁入。宿主、授权与项目的装配要 import 宿主，包边界规则不允许 Test Kit 这样做，所以留在 `tests/fixtures/`（`test-home.ts` 的 `serveTestHost`、`openTestHome`）；用例通过它们像人在设置页那样授权，不直接写授权文件。业务 fixture 和业务结论留在对应 Module/Plugin，防止 Test Kit 变成共享业务实现。

## 门禁

F3 已建立 public entrypoint、deep import、跨 Store、Plugin implementation、App DB、循环依赖和 Contract 清单一致性检查。每个垂直 Goal 另外负责真实行为、错误、持久化、恢复和端到端证据。

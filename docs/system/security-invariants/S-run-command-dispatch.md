# S-run-command-dispatch

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-run-command-dispatch | 前台和后台命令不能把批准前或异步准备前的授权延长到实际 spawn。原 Run 停止、取消或持续权限失效后拒绝原命令；没有原执行控制也拒绝。异步同步检查函数不能被当作同步许可。原请求的取消与会话清理不能被停止后的业务检查误拦。 | `horizontal/agent-host/src/adapters/prologue-dispatch.ts`；`horizontal/agent-host/src/adapters/prologue-run.ts` | `tests/security-invariants-run-dispatch.test.ts`「APR-11」；`tests/security-invariants-run-mcp-cleanup.test.ts`「stopping a native MCP Run」 | — |

原 Run 闭包固定 actionController、stopping 与调用者的持续授权，不按 Session 当前 Run 重新取权。`DispatchGuards` 同时保留异步准备和同步检查，嵌套独立调用组合两个原控制。前后台命令在最后 await 后同步检查，随即进入现行 Node Host 无 await 的 spawn 路径；不新建效果、进程账或命令 ID。已实际派出的后台命令仍由原 SDK 管理，不把正常收尾等同撤销其既有副作用。

前台命令异步准备期间仅按 SDK 给出的原 commandId 留临时取消标记。此时尚无进程，原 Host.cancelCommand 可能返回 false；包装先同步标记取消，再转发并保留原返回值，最终以 SDK CANCELLED 拒绝，不补造回执。成功、失败及取消都释放本次准备登记。缺失或重复 ID 拒绝；不生成替代 ID。`guardNodeDispatch` 在 Agent Host 根命名导出，仍是实际装配函数，不进入 contracts 或插件 SDK。受控 Host 用例单独证明这段取消交接，不冒充实际 SDK 单条超时的产品验收。

网络仍由原 `beforeNetworkDispatch` 槽位消费既有异步检查，保留 SDK 的应用拒绝映射、取消与 handle 结算；新增同步检查只在命令入口与模型专用 `beforeModelDispatch` 消费，不以 Run 已停止阻断原生 MCP 的取消通知。`tests/security-invariants-run-mcp-cleanup.test.ts` 使用实际 SDK 原生工具调用和本机 HTTP 服务，验证停止后收到原 requestId 的取消通知、断开后收到原远端 session 的 DELETE。MCP 的原连接世代、业务与清理归属及最终写入绑定仍属于后续接线，本片不改 `openInteractive`、`writeInteractive` 或 `executeModelNetwork`。新增异步检查不能插进 SDK 单次请求取消检查与 stdin.write 之间，否则可能在该请求封账后写入。

新增用例通过公共 Agent Adapter、真实 SDK Pending 及临时目录中的真实 Node 命令验证：本人已批准后仍可在最后异步准备中撤权/取消，文件没有写出；未变授权可实际写出。模型响应是脚本夹具，不调用真实模型，不代表最终产品实操或本人验收。

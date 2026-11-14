# S-run-command-dispatch

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-run-command-dispatch | 前台和后台命令不能把批准前或异步准备前的授权延长到实际 spawn。原 Run 停止、取消或持续权限失效后拒绝原命令；没有原执行控制也拒绝。异步同步检查函数不能被当作同步许可。原请求的取消与会话清理不能被停止后的业务检查误拦。 | `horizontal/agent-host/src/adapters/prologue-dispatch.ts`；`horizontal/agent-host/src/adapters/prologue-run.ts` | `tests/security-invariants-run-dispatch.test.ts`「APR-11」；`tests/security-invariants-run-mcp-cleanup.test.ts`「stopping a native MCP Run」 | — |

原 Run 闭包固定 actionController、stopping 与调用者的持续授权，不按 Session 当前 Run 重新取权。`DispatchGuards` 同时保留异步准备和同步检查，嵌套独立调用组合两个原控制。前后台命令在最后 await 后同步检查，随即进入现行 Node Host 无 await 的 spawn 路径；不新建效果、进程账或命令 ID。已实际派出的后台命令仍由原 SDK 管理，不把正常收尾等同撤销其既有副作用。

前台命令异步准备期间仅按 SDK 给出的原 commandId 留临时取消标记。此时尚无进程，原 Host.cancelCommand 可能返回 false；包装先同步标记取消，再转发并保留原返回值，最终以 SDK CANCELLED 拒绝，不补造回执。成功、失败及取消都释放本次准备登记。缺失或重复 ID 拒绝；不生成替代 ID。`guardNodeDispatch` 在 Agent Host 根命名导出，仍是实际装配函数，不进入 contracts 或插件 SDK。受控 Host 用例单独证明这段取消交接，不冒充实际 SDK 单条超时的产品验收。

网络沿原 Node Host。模型调用用现有派发检查。MCP HTTP 将原轮、原连接与已审查的固定参数交给同一 handle 的 `beforeDispatch`。同一次发送的准备与最终检查都复核授权，重新准备一个跳转需要新检查。SDK 实际标记发送后才发布原调用的派发观察。停止可能从另一个调用进入，原网络 handle 已处于实际发送阶段才生成取消帧，沿原端点、凭据引用、远程会话（若有）和 RPC id 发送。原远程会话的结束也沿同一连接。stdio 在 SDK 的单条请求取消检查后做同步检查，随后在同一调用栈写入原管道。SDK 按原会话和 RPC 编号匹配回复后，再核对该请求的授权。授权已失效的迟到回复不会交给模型，已经发送的原请求进入待核对。

`tests/security-invariants-run-mcp-cleanup.test.ts` 验证有会话及无会话的原 HTTP requestId 清理，以及真实 stdio 工具跨重启、参数或工具变化、发出前撤权与发出后撤权。迟到回复用例检查原管道只写一次、回执明确待核对、结果未交给模型，并拒绝直接在该会话开下一轮。

新增用例通过公共 Agent Adapter、真实 SDK Pending 及临时目录中的真实 Node 命令验证：本人已批准后仍可在最后异步准备中撤权/取消，文件没有写出；未变授权可实际写出。模型响应是脚本夹具，不调用真实模型，不代表最终产品实操或本人验收。

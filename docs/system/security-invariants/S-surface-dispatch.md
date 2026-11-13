# S-surface-dispatch

第 39 批原观察目标贯穿 SDK 与驱动。浏览器以原页面、文档代次和来源检查观察、审查与每次输入。实时文本卡保留 Chrome 的原焦点节点，批准后也不借同名控件输入。桌面在原生输入前检查原进程启动时间、窗口、标题与必要的焦点，普通操作的回执不读取后来窗口。已接受的传输在关闭后按结果未知结算。拒绝证据见 `tests/security-invariants-surface-original-target.test.ts` 和 `tests/security-invariants-computer-original-window.test.ts`。浏览器协议用例与原生事件捕获用例分别检查派发，真实设备操作仍需实操。

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-surface-dispatch | 原调用提供同步检查时，Helper 连接建立后的撤权不分配请求 ID、不登记等待或计时器、不发送输入帧；异步函数不能充当最终同步检查。浏览器在启动后、恢复旧地址及发送新导航前核同一检查，拒绝不改目标地址；文件交付拒绝保留原选择器，不发文件帧。后续明确的用户调用仍可恢复原操作。观察、审查和输入拒绝后来替换的页面、窗口、焦点或文档。 | `apps/local-host/src/computer/helper-connection.ts`；`apps/local-host/src/browser/browser-page.ts` | `tests/security-invariants-surface-transport.test.ts`「APR-07/08: helper rejects after ensure」「APR-07/08: navigation refuses after page startup」「APR-07/08: a refused file handoff」「APR-07/08: restarting a page cannot send」；`tests/security-invariants-surface-original-target.test.ts`「the browser refuses the original observation」「the final browser focus read refuses a field that became」「same desktop PID, title and frame」「desktop download refuses another document」「refuses a replaced assessed control」「the exact desktop acknowledgment survives revoke during」 | — |

以上证据使用实际 Unix socket、CDP websocket 与 Host 子进程，另一端是无 OS 输入的协议夹具。它证明底层入口收到原检查后的拒绝；上游 Agent 轮次、Driver 每个输入、桌面记录与原生手势释放仍需完整接线，不能以本片声明整个 Surface 已受新委托保护。

共享启动只创建、挂接空白页面；每个 ensure 调用者以自己的检查决定是否恢复旧地址，不共用 Agent 的权限闭包。追加的「a revoked starter cannot lend its guard」「a sent restore is not relabelled as unsent」覆盖交错启动和已发恢复的回执。用例不加入 Linux 产品子集：其原生协议夹具显式模拟 macOS，被现有平台探测标为 darwin；仍由 security 用例清单和批末定向验证覆盖，不修改平台探测规则。

导航错误回执只更新同一连接、同一目标与同一次导航的页面状态；恢复旧地址的迟到失败不覆盖后来新导航的加载状态。「a late restore failure cannot replace」按两位有效调用者同时等待启动、恢复回执晚于新导航的真实交错验证；修复前稳定失败，修复后通过。

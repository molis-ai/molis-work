# S-surface-computer-gesture

第 39 批原轮派发边界；与 [Agent Host 原轮合同](S-surface-round.md) 配合。这里的协议或原生事件捕获测试证明对应工程行为，不代表真实设备输入和完整产品验收。

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-surface-computer-gesture | 原生输入在下一检查点拒绝后续业务输入，只释放自己已按下的键或按钮到原进程；释放不重复原文字、修饰键或点击。正常 socket EOF 永久关闭原输入入口，拒绝已出队但尚未开始的请求，打断当前请求并等其清理再退出；broken pipe 不以 SIGPIPE 跳过清理；每个实际事件、AX／应用打开提交在原输入锁内复核可取得的系统权限、在场状态与 tap 活性，不借旧 status；已知未注入与已按下分别报告 partial=false/true。崩溃或失去回执仍为未知，不自动重发 | `apps/local-host/native/computer/Sources/Input.swift`、`apps/local-host/native/computer/Sources/main.swift`、`apps/local-host/native/computer/Sources/Presence.swift`、`apps/local-host/native/computer/Sources/Observe.swift` | | `tests/security-invariants-computer-gesture.test.ts`「APR-11: native interrupted gestures」 |

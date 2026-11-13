# S-surface-computer-round

第 39 批原轮派发边界；与 [Agent Host 原轮合同](S-surface-round.md) 配合。这里的协议或原生事件捕获测试证明对应工程行为，不代表真实设备输入和完整产品验收。

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-surface-computer-round | 桌面 facade 稳定，但租约、目标、观察与记录绑定原 context；只命名别轮不抢电脑。驱动捕获目标后，原轮撤销、目标或交还变化、禁止应用后，拒绝后续发送及业务记录；旧释放和迟到事件不关闭新监视或写新记录。输入监视必须确认安装，新连接重新确认；已派出但结果未知保留 partial，helper 明确零效果拒绝不伪报已执行 | `apps/local-host/src/computer/computer-driver.ts`、`apps/local-host/src/computer/computer-round.ts`、`apps/local-host/src/computer/computer-desk.ts`、`apps/local-host/src/computer/helper-connection.ts` | `tests/security-invariants-computer-round.test.ts`「APR-11:」「APR-13:」 | |

SDK 到驱动的原观察／单条取消传递仍待补充合同 §2.6；本表的原目标检查指驱动已捕获的目标，不覆盖尚未进入驱动的等待。

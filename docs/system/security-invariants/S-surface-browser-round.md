# S-surface-browser-round

第 39 批原轮派发边界；与 [Agent Host 原轮合同](S-surface-round.md) 配合。这里的协议或原生事件捕获测试证明对应工程行为，不代表真实设备输入和完整产品验收。

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-surface-browser-round | 驱动取得原会话后，浏览器原轮失效、文档替换（含同网址刷新）、目标变化、接管或来源禁用后，拒绝后续读取结果和每个业务输入；失效 node 不落备用坐标。原手势只向原 CDP 会话释放，不附带文字、快捷键或点击次数；新轮输入等原输入清理结束。焦点经原文档的隔离 world 与 Chrome 原生 DOM 核实，闭合 shadow 或 iframe 无法核实则拒绝文本、字符键与粘贴；页面重写 getter 不作为许可。旧截图只移除自身遮罩，不授权旧字节，不清新轮节点；明确导航失败与失去回执的未知输入分开 | `apps/local-host/src/browser/browser-page.ts`、`apps/local-host/src/browser/cdp.ts`、`apps/local-host/src/browser/surface-round.ts`、`apps/local-host/src/browser/surface-nodes.ts`、`apps/local-host/src/browser/surface-input.ts`、`apps/local-host/src/browser/surface-observation.ts` | `tests/security-invariants-browser-round.test.ts`「APR-11:」「APR-13:」；`tests/security-invariants-browser-focus.test.ts`「APR-13: production browser focus」 | |

SDK 核对观察后、真正进入驱动前的等待接缝由 [补充合同 §2.6](../../../specs/agent-approval/delegation-contract-design.md#surface-original-target) 与 [S-surface-round](S-surface-round.md) 覆盖；本文件只记录驱动内部的协议级拒绝证据。

浏览器焦点读取与 CDP 输入是分开的请求；这些用例证明发送前可信可见检查，不证明与渲染器内任意同文档焦点变更原子化。

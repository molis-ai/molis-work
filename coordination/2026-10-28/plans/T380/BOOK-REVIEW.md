# T380 候选任务书独立窄审

结论：**有两处必修，补齐后可按本书边界派发。** 本审只核候选书、W6 场景5首败原件和准确 E 源码；未运行产品、浏览器、构建或 GH 写入。原首败右栏空白成立，网络 status/body 仍 UNKNOWN；最后可见性 writer 尚无动态证据，书中先诊断再选补丁的顺序正确。E→当时 main `3fd857792` 仅有 Images/资源预算路径变化，七个候选运行文件 blob 全相同。本地检出 `08c9933d57` 是较旧 main，未用它代替准确对象作结论。

## 必修

1. **把 RAC2804/2805 的右 iframe 真实输入办法写实。** `PLAN.md:55–59` 要求可信指针、正确右文档和旧路径红，但现成 `tests/fixtures/goal-browser.ts:237–244` 的 `openGoalFrame` 用 `dispatchEvent(new MouseEvent(...))` 发合成单击/双击；其 `click` 只在顶层 `document` 找目标。直接复用这两者不能证明用户在右嵌入 Goals 列表上打开 INTERFACES。请明确：用 `openGoalBrowser` 只复用隔离 Host/Chrome 与 CDP 连接；初始 CORE 和右 iframe 内 INTERFACES 均用真实 CDP 指针，右侧坐标要加活动 iframe 在顶层视口的偏移，并以正确 frame 文档的 `isTrusted` 输入、可见行、外层右 pane/tab/item URL 与正文联合作收据。不能用 `openGoalFrame` 的合成事件或 `DOM.click` 满足“真实 UI 回验”；旧 B 红、新 H 绿也须走同一输入路径。

2. **RAC2806 关闭右栏后的 oracle 要锁定左 CORE。** `PLAN.md:57` 只要求“剩余实际内容可见可继续操作”，会放过关闭后留下错误 Goal 或错误窗格的回归。改为检查仅剩左窗格的当前 CORE tab、正文 `data-frame-goal=CORE`、预先固定的标题和合成正文均相符，并在其上执行一项现有可见操作；不要从关闭后的被测状态反算期望。

## 重大执行风险

- `PLAN.md:31–35` 的非暂停日志断点必须在**右侧 `plugin:goals` iframe 的实际执行上下文**命中，并覆盖 `frame-container.ts:75`、`momentum-client.ts:94` 及 `tab-workspace-panes.ts:56,283` 对同一 shell 的写入或挂载。只看 MutationObserver 的最终 hidden、顶层文档的同名 shell，或只在初始化末尾取一次值，仍不能判定最后 writer。书中已要求源码位置、当刻输入和父链；执行时须保留断点命中与右 frame 身份的原件，未命中就维持根因未闭合，不进入条件代码方案。

锁与边界无另一个必修项：提供的 19 个普通 open PR 和 4 个保护 PR 文件 metadata 对七个候选客户端、三份目标测试均为 `hits=[]`；保护分支无需读取。T116 #1679/#1680 没有这条运行路径的修复证据，PR2 是后继计划，不能抵本单失败。资源测量与一次性放行由根串行处理，范围内诊断/修复无需等新的中途批准；正式派单仍须根按实时锁与候选号核收。

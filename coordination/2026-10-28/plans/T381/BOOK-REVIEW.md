# T381 候选书独立审查

结论：**候选书可按当前边界派发，无新增必修项。** 根因仍 UNKNOWN。本审读取 BOOK、GOALS-FIRST-FAILURE、两份 Full 的原始失败/重试段及准确 M/B 对象中的测试、导航夹具、CDP 超时和生产提交链；未操作产品、浏览器、构建、测试或 GH。没有据源码先认定环境、测试竞争或 dirty dialog 为根因。

两次原件分别是 T116 的第二次返回（测试 :246）与 T143 的第一次返回（:238），均在 store 已观察到创建后，`Page.navigate` 命令 30 秒未回复；内部重试通过仍保留首败。`waitForGoal` 只证明数据库已提交，生产 `dialogs-client.ts:150–158` 还需收到 POST 结果才 `navigate`。这是需要观测的两个导航之间的接缝，尚不能选定测试补丁。`goal-browser.ts:221` 同等 DCL 和 action，且只有错误恰为它自己的 timeoutError 才读 DOM 诊断；当前原件是 action 的 CDP timeout，不能推成 DCL 必然没到、请求必然没完成或 renderer 死锁。

## 当前必须落实的执行要求

书中已包含下列要求，无须另开矩阵或逐步审批；DEV2 应把它们落在实际诊断中：

- 被动观测必须先于目标提交安装，不能依赖原夹具的失败 catch 补现场。只记 session 的 DCL 不足以区分两次导航，必须关联主 frame、loader、requestId 和目标 URL；缺失保持 UNKNOWN。
- 失败后先保存已收到的事件和命令状态。若 dialog/renderer 阻塞，不能再依赖一条无限等待的 Runtime.evaluate 或截图才写原件；任何现场补读都沿既有命令期限、保其失败，并清本次监听/进程。禁止自动接受 dialog、补发 Page.navigate 或以重试绿覆盖。
- 旧红/新绿必须来自已证因果及同一业务输入；单次自然绿不能闭合修复。原 RAC2700 三种标题及另两例业务断言全部保留。后续确定性控制如确需截留响应，须先明确它控制的是已证交错与具体测试路径；当前书禁止拦截的首轮只读诊断不能暗中变成该控制实验。

## 可执行的最小定位路线

1. 在书中 B=`3fd857792a27352030ac8f3544a3b57d418febc1` 的干净隔离树绑定 tree/build，一轮原完整文件、jobs1、retries0。该 B 相对 M=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987` 在目标测试、goal-browser、CDP、dialogs-client、editing-graph 均无差异；历史两个 Full 结果仍各归原头。保专用浏览器实际版本和与 Linux CI 的差异。
2. 通过现有 CDP 连接在首次目标导航前启用 `Network.enable`、`Runtime.enable`、`Page.setLifecycleEventsEnabled`，监听 Page/Network/Runtime/dialog/target 事件；Page 已由夹具启用。以 Page frame tree 和默认 Runtime context 绑定主文档，记录主 frame 的 requested/start/navigated、loader 生命周期、DOMContentLoaded、POST 的 response/loadingFinished 或 loadingFailed。订阅函数只追加有界记录，不在回调里 await 新命令。
3. 仅在目标测试本地包装它调用的 command/navigate 以记录“发出/兑现/拒绝”，不改共享 harness；store 首见标题时同时固定实际 goal_id。必要时对运行中的生产提交脚本响应后、navigate 前切点加非暂停日志断点，绑定实际脚本/文档，读取 result.goal_id/goal_path 和当刻 URL，不包装 fetch/location。对比“POST 提交→响应到达/消费→产品导航→测试返回命令”的次序。
4. 若出现 dialog，记录 opening 类型/URL、是否有对应 Closed、主 frame 与当时可读的 unsaved owner；源码中存在 beforeunload 守卫本身不算命中。若无 dialog，也不能仅凭未收到事件排除，须确认观察已启用且连接未丢失。CDP 命令未回复、DCL 已到、请求失败等分别记录。
5. 有一次失败且上述因果充分才选修复：测试过早发第二导航就让测试等待真实新 Goal 的导航与可见正文完成，再返回；若命中产品/共享夹具/CDP 缺陷，按书交根具体 owner 路径。首轮不复现则停止概率循环，输出已观测/缺失与下一项观测；保未修复状态。

范围核收：初始唯一产品仓库写路径是 `tests/goals-dialogs.e2e.test.ts`，T380 的窗格/Frame 客户端（包括 editing-graph）维持其归属；共享 goal-browser、test-kit、产品路径须实际 owner 交接。本书没有宣称实时全 PR 无锁，派单前根须 fresh 求交和唯一 writer 核收。本审未查询 GH，不能把 T380 旧的 hits=[] 扩作本测试的实时无锁证明。丙档仅在最终确实只修该测试时适用；产品改动档位/Full 按实际范围裁定。

# T388 极小测试修复候选独立书审

结论：**范围足够小，方案可以接受；无Blocker/P1或当前必修修订。** 丙档测试同步修复合理。默认只加`await`（可加简短编号注释），准确修复H的一次完整文件自然执行，加现有真实Promise调用链静态证明，足以验证本单目标；无需强制临时交错机制、负控或旧矩阵。

已读候选`T-388.md`、定位`PLAN.md`，并从准确H=`44efe84d925b7f01e6f8f837c0bf284471ae7659`读取完整测试、CodingSessionStore及coding-sessions fixture；另只读Host数据库client与attention链。未运行、改产品/测试/候选书/refs/GH或coord，仅写本报告。

**排序缺口确实存在。** backgroundCommand的`pause`直接返回`store.setState(noEffect,...,"paused",...)`；setState返回project database的async transaction Promise。真实client先`await beforeEffect()`，之后BEGIN IMMEDIATE、同步UPDATE、COMMIT，成功返回结果；因此调用pause本身不建立提交完成屏障。旧第65行未await即发visibilitychange，新写法等待该真实Promise后才发送原刷新；失败也会在刷新前向测试传播，不再留下未观察的写入拒绝。这是可由调用链和await语义证明的测试顺序修正，不只是“函数声明async”。

原attention读取仍受visible/reading/again控制、失败保旧画面，周期15秒而paused DOM等待10秒；故旧前置没有提交先于刷新读取的代码保证。但现存CI没有精确提交、attention请求/响应和DOM更新时序，不能推出首轮确实读到旧done，更不能归因T385 storage或把一次retry通过写成随机底噪。修复不保证任何未来环境下10秒都足够，也不以此扩大超时。

**完整文件验证有实际区分力。** 保留原stop-refused响应屏障，等待paused期间拒绝响应仍扣住，随后检查真实进程未停、诊断call-id/按钮可用；再走lost reply未知不重试、真实成功停止、owner projection清理等全部原断言。准确H完整一文件、jobs1/retries0、无筛case和skip才可核收，不能只取paused子段或用runner总退出替原断言结果。既有10秒/stop gate/Runtime adapter/合成子进程均保持，不新增owner read、固定sleep或强制状态。此次不需要通过故意拖满10秒制造红例来证明await语义。

候选已把轻量顺序观察降为可选，处理正确。定位PLAN末节曾建议额外owner读与详细时序，属于先前诊断方向，不应覆盖候选现行“单行await、无冗余owner读”的范围；如做可选实验，只签其实际可见顺序，不能倒签历史CI因果。若需侵入生产/大fixture才可控制，就跳过实验并保留静态链与完整自然运行证据。

执行条件充分：根注册并在T353-B writer结束后交唯一writer/准确M；复用产物须核真实生产digest、依赖与解析路径匹配，测试来源另绑最终H。公共槽显式绑定共享目录，隔离Home/profile，失败也按原fixture收尾并保stop gate/子进程清理原件。实际diff/health/import及affected结果决定后续要求，不预定full=false，也不为该单行新增Full门槛。若完整文件仍失败，保首败并回根定位，不在本单扩大生产修复或放宽断言。

T388/RAC2829～2830仍为拟号；本书审不授予当前执行/注册/CI权限，不改变T385既有Full终态或采用门槛。旧首轮0/1、内部retry1/1与缺失时序UNKNOWN永久保留，不能因本机一次绿宣称旧CI已归因或整体Full问题已修复。

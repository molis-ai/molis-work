# T385 stop-feedback 首败：有限只读归因准备

状态：2026-10-31 PDT，只读结束；不新建任务/编号，不触发CI/测试或修源码。对象为T385 #1713 H=`44efe84d925b7f01e6f8f837c0bf284471ae7659`，Full41271185187 shard7/job124744120250。证据仅限指定日志、准确源码/十文件diff、MISC该文件/暂停停止相关定向命中；未重扫其它MISC。

**结论：已确认paused投影未在10秒DOM窗口出现，不能认定storage产品回归、环境底噪或停止命令失败。源码存在一个可定位的测试异步排序缺口，但本次因果仍UNKNOWN。** 暂不需要因一次retry新开修复单；若根决定补定位，以下是一条有界最小路径，不构成执行授权。

## 首败准确阶段

[FULL-REPORT](/private/tmp/t385-verify/FULL-REPORT.md)与[原分片日志](/private/tmp/t385-verify/ci/full-7-124744120250.log):1259–1313：首轮文件27.4秒，case23.057秒，0/1；第66行等待 `.background-task[data-state=paused]`报DOM condition timeout。此前第60行后台按钮显示、第64行stop按钮点击与`waitHeld("stop-refused")`已返回，因此真实stop响应/响应体已经到达并被测试屏障扣住。第67行release尚未执行，后续拒绝错误/call-id、lost reply unknown不重试、成功停止和owner投影断言均不能据首轮称已覆盖。retry1文件22.1秒、1/1，分片102/102、1 only on a retry；它只证明随后一次执行通过。

日志只保留body开头/toast空/焦点body，没有目标session的持久状态、`/api/attention`响应体/HTTP时序、更新前后DOM任务列表或pause Promise结果。`workspace-settings opened_announce_failed/actions.missing`在首轮启动阶段有一行warning；现有日志不能证明它触发paused缺失，也不能凭时间相邻排成根因。没有浏览器全量事件/请求证据支持“请求没发”“CPU忙”或“响应错误”的确定结论。

## 真实调用链与storage差分

测试 `workbench-stop-feedback.e2e.test.ts:14–53` 经真实Host项目库和公开CodingSessionStore建done会话与真实合成子进程，Runtime adapter只提供background read/stop，无模型/key操作；`pause()`返回 `store.setState(...,"paused",...)`。`CodingSessionStore.setState`（coding/store.ts:218）是async，经 `services.project_database.transaction`持久更新。Home `coding.home.background-tasks`查询读本库backgroundSessions → Home aggregate → `/api/attention` → `attention.ts::read` → JSON list/key变化时render `.background-task`，state取owner返回值。

T385对M6729准确只改十文件：T346 baseline预检/storage出口/Home plugin store错误映射与文档/测试/owner表；T347 file vault封条读写与format测试。测试、coding store/fixture、attention、home-background-tasks对M与H无diff（本轮git diff --quiet回0）。T346可能影响这些Host库初次打开与基线拒绝/热日志恢复，但本轮已正常创建会话、后台条目及送到真实stop屏障；pause写是已打开的项目库事务，不会每次重新走baseline只读预检。T347的vault mutex/封条没有进入本fixture的pause→aggregate→DOM直接链；无模型/账户读取也未见vault结构错误日志。共同Host/storage依赖仍使间接影响不能被静态排除，**但没有证据把本次10秒投影缺失归给两片新增拒绝逻辑**。

拒绝保证也不扩大：T346 DELETE/WAL/SHM及776边界、T347只对secrets.json零业务写的原合同不由此事件重开；不加storage兜底/延时或回滚两片以试绿。

## 可定位线索与已有历史

1. 第65行当前写法是 **`command.pause(); await browser.evaluate(visibilitychange)`**，没有await pause Promise；前面的create/setRuntimeSession/setState/setBackground都有await。持久化先完成与attention GET先读之间没有代码顺序保证。静态可指出该缺口，不能证明首轮实际读到了旧done。
2. `attention.ts`刷新只在visible时读；reading=true会设again，完成后再读；失败保上次画面。主动visibilitychange触发一次，正常setInterval为15000ms。`goal-browser.ts::waitFor`默认10000ms。若第一次刷新在pause提交前取旧值/发生失败或投影尚旧，下一轮15秒可能晚于断言窗口；日志未给出是哪种交错。不要仅将timeout扩大到15/30秒绕过排序。
3. response barrier只是包真实fetch/response.json/text，目标是POST路径含`/stop`；当前pause后的attention GET没有被这个gate按设计扣住。不能据此排除页面另有读取中/失败，但不能将“stop屏障扣住所有GET”当解释。
4. 本轮MISC对准确文件名/STOP-FEEDBACK/W2-18/暂停停止相关定向查询未发现同文件已归因的待办；MISC:208的W6场景8 paused持久化/重启是另一链，不复用其结论。Git已有 `ca8dbec49`（retain delayed stop errors after the menu refreshes）等历史提交，曾修刷新后旧stop feedback节点脱离的问题，本测试正保该合同；当前attention.ts已有将脱离feedback追加回menu的处理。首败在paused刷新前置，不足以宣布那个旧bug复发。没有据此找到可直接销掉/沿用的同根诊断结论。

## 如根决定补定位：只做一个有界差量

先绑定根给的最终H/实际main与同一完整文件，不改原断言/stop屏障。最小候选是await `command.pause()`，并从同一公开owner读取确认精确session已paused后才触发visibilitychange；在一次诊断执行中被动记录pause开始/完成、同session `/api/attention`请求/返回的state与时序、read中的状态、目标DOM列表和真实stop gate是否仍held。禁止改生产、插DOM、强制paused、替换aggregate或延长超时。

若提交已paused而响应不含该状态，定位Coding background query/aggregate授权或读库；响应正确而DOM不对，定位attention list/key/render及旧请求顺序；提交晚于第一次GET则该测试排序假设有直接证据。若原单头与准确干净基线都需要比较，只按相同完整文件有界对照，不能重跑整个Full/旧223、取消CI或随机多轮取绿。修复是否进入任务、是否已触README§9重复首败条件由根结合其它准确运行判定；本报告只持有这一次首败，不能提前宣布重复同根。

当前WAIT不是新产品/权限决定，而是**根若要求动态归因，需给准确执行头、隔离测试窗口和有界运行范围**；本线授权只有只读，至此不实施。现有Full继续按真实终态/首败retry保留，不触发重跑或改变合入条件，不把本报告当T385成功/失败裁决。

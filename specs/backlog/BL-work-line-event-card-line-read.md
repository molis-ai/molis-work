# BL-work-line-event-card-line-read

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-line-event-card-line-read | 事件卡的每次请求（`apps/local-host/src/mainline-event-surfaces-http.ts`：显示、卡上的点击、纠正、找回）都以本人身份读一整条线（`mainline.line.read@1`，包括任务总表），只为核这个事件还在本人的线上。改成只问声明了这种对象的那几家登记方、不读任务总表：在 `horizontal/mainline` 加一个「这个对象在不在线上」的读取（发现一遍、按对象种类挑登记方、`gatherWorkEvents`），由主线服务以动作或宿主内部读取的形式给事件卡用；核对的口径不变（不在线上或读不到就没有卡，S-work-line-person-doors） | 第 32 批评审（host 一遍，小修 2；对抗式审查台账 N42「不重复读同一份数据」） | 明确后续做 | 页面只在事件的标签页在前台时才请求（WLN-27），次数受人的操作限制；宿主手上的本人客户端是 `BoundActionClient`，不能直接驱动 `gatherWorkEvents`，要先在主线服务上开这个窄读取，属于新合同 | 无 | 低 | 助理线 |

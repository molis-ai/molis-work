# BL-coding-wake-claim-reread

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-wake-claim-reread | Coding 收到 `host.agent.continuation.ready@1` 后，如果运行时还占着这次接续，`plugins/native/coding/src/wake-loop.ts` 每 250 ms 重读一次 `collaboration.read`，最多 20 次。起因：宿主的启动器答 `later` 之前就把事件发了出去，而 Prologue 收到 `later` 之后才异步放回占用（`packages/sdk/src/composition/core/continuations.ts` 的 `releaseContinuation`，一次存储写），宿主这边不知道放回什么时候写完。去掉补读要上游给一个时点：放回占用之后再通知 App，或者让 App 在 `startContinuation` 里直接带请求键起跑、由 Prologue 认作接走 | 第 32 批评审（host 一遍，小修 1） | 明确后续做 | 宿主这边挪动事件的时机（微任务、下一拍）都不能保证排在那次存储写之后；要改 Prologue 的接续流程，本批的换包已经定稿 | Prologue 接续放回占用之后的通知 | 低 | 助理线 |

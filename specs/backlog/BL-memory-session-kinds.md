# BL-memory-session-kinds

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-session-kinds | 记忆的会话绑定按 Coding 与助理写死：宿主 `apps/local-host/src/memory/memory-session-binding.ts`、`memory-learning.ts` 按 Coding 的插件号走单独的路，合同 `packages/contracts/src/services/memory-session.ts` 把会话种类写成 `"coding" \| "assistant"`。改成任何插件都能在 Manifest 里声明自己的会话种类与绑定读取动作，宿主不再点名插件 | [评审台整 PR 审查后的修改](../prologue-memory-strategy/spec.md#评审台整-pr-审查后的修改2026-11-12)；#2020 评审 | 已知缺口 | 用户 2026-11-12 定：作为插件同等待遇的已批例外随 #2020 合入，不在 P0 里改；现在只有 Coding 与助理两个使用者，先不为猜测的插件造抽象 | 第一个要会话内记忆的第三个插件出现时做；改合同按 CONTRACT-CHANGES 走 | 中 | C2／Memory（执行会话待分配） |

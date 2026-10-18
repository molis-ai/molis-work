防腐线补充：#684 当前完整 head `f7fffda2ef66176d51c43e82a6ef099a157cc26a` 的常规 CI（含 Verify）已全部通过，Linux 可选探针按条件跳过；仍等待统筹审 diff、排全量，未自行加标签或合并。#703 继续等 #684 合入后接实际 main。

等待期间，Runtime 精确模型选择前置已在本地完成：`e8925f8eaf5d9ad0152b16c3441a79bd7d3b875b`，88 文件 1,005 条通过，构建/API/boundary/health/资源通过，资源增量 0；未新增在途 PR。

独立复查第二批在干净 main `a56a2763d` 上 16 非浏览器文件 98 条、5 Chrome 文件 11 条通过。另有一项已证实的 P2 并发一致性缺口供统筹记录：#700 的 `agent.collaboration.revise@2` 先检查来源、随后等待 beforeEffect；一个 still-received 输入在这次等待内经真实 `inputs.withdraw` 撤回后，动作仍成功插入步骤并把 withdrawn 输入写入 origins。已在 Todo 候选和干净 main 各用真实 SDK/任务图重现，普通 UI 的 new-task 入口针对已读输入（不能再撤回），不扩大成一般 UI 或越权缺陷。证据在本线唯一 spec §10.27（本地 `c7505abd0`），复现 `/Users/yijunwang/code/molis-anti-corruption-20261017/review1027-origin-race.test.ts`、日志 `/tmp/molis-review1027-origin-race-main.log`；尚未改生产代码，按非阻塞后续处理。

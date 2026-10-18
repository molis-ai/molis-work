# 回执线交接（specs/ai-input-receipts，2026-10-18）

## 现状

- 已合 main：3d-5 #711、3e-0 #713（`acknowledge-inputs` 进 `BUSINESS_HOST_TOOLS`，和 #661 的 `board-wait` 并列）、3e-1 #714（助理侧栏「当前约定」）。
- 在途：3e-0b = PR #726（head 1152516e1），在 chain60 跑全量，别推。Coding 的 7 个角色列上 `acknowledge-inputs`、版本各 +1；`prologue-run.ts` 里那份只读父角色的工具名单收成 `WORKSPACE_PARENT_TOOLS`，加上它（统筹 10-18 定选 A）。
- #726 合入后要清理：
  - 工作树 `.claude/worktrees/line-receipts-3e1`、`line-receipts-3e0`、`line-receipts-3e0b`、`line-receipts-base`（`line-receipts-base` 是干净的 main 基线，处于 detached 状态，里面有一个本地 merge 提交，不用留）；
  - 本地和远端分支 `receipts/3e1-agreements`、`receipts/3e0-acknowledge`、`receipts/3e0b-coding-acknowledge`。
- 老工作树 `line-receipts-1c` 是本会话的 cwd，里面有别人没提交的 spec 改动：别动。
- 删工作树和分支会被权限判成「Git Destructive」，要先弹窗请用户批准（#711 那次就是这样批的）。

## 还剩的需求

1. **3e 的「交付说明」**（spec §11 阶段 3 表格里 3e 的后半；§9.2 表格「交付」一行；§8 场景 3「交付」）：工作结束时给一份交付说明，写做了什么、每句话的结论、成果链接、还差什么，新待办要关联到这项工作和对应的输入。这一片还没有计划，也没有批准。
2. **§20 有效要求跨摘要与续做保留**：R1（RCPT-101/102）已做；RCPT-103～107 还待实现，分别是：
   - 跨压缩、跨 Run、宿主重启后仍然适用；
   - 按范围纠正；
   - 三个入口接续时拿到同一组要求；
   - 超出预算时不静默截断；
   - 真实代码任务端到端。
3. **阶段 4**（Goals 层：Context Ledger 边、Goal 页显示「来自对话的输入」、目标类影响走 Goals 提议、外部 Runtime 动作）、**阶段 5**（个人助理深化）、**阶段 6**（其他场景，每个场景一份小 spec）：都没开工。
4. **BACKLOG 里回执线的条目**：
   - BL-144：页面代写的补充丢了 `source`；
   - BL-148：跨轮带过去的补充没写「从第 M 轮带来」；
   - BL-161：TaskBoard 和计划卡给步骤的编号不一致；
   - BL-162：说不出一条补充改了哪些文件，要上游给调用归因；
   - BL-163：`prompts.ts` 的处理说明使用指令，交 AI 手册线评估；
   - BL-164：TaskBoard 把「未开始」写成「等待前置」。
5. **AI 手册线等着的事**：#713 已合，手册线要评估 `acknowledge-inputs` 的工具描述对业务角色和 Coding 角色够不够用（BL-163 一起看）。按规矩，提示词改不改归手册线定，回执线不打补丁。

## 下一片原本打算做什么

#726 之后本来打算做 3e 的「交付说明」，但还没写计划、也没发统筹。

## 要注意的坑

- **字节放行**：
  - 每次 merge main 都要按新的 merge-base 重新取键（`scripts/gates/page-assets.mjs` 的 `APPROVED_CEILINGS`），用过的那一对移进 `tests/page-assets-budget.test.ts` 的拒绝名单，有界用例换成新的；
  - 放行单独一个提交；
  - 超过 10 KB 或新增资源，要先问用户。
- **叠着的 PR 被 squash 合入**以后，下面那片 merge main 时，前一片的文件一律取 main 的版本，spec 手工把几段记录都保留。
- **巨大单元不许变大**：
  - `apps/workbench/src/scripts/client/assistant-island.ts`、`horizontal/agent-host/src/adapters/prologue.ts`、`createInputReceipts`（接近 150 行）都不许变大；
  - 新代码要拆成独立函数（比如 `createAgreements`、`createCorrection`、`readBoard`），随页面程序一起交过去。
- **回执按画它的面各一份**（WeakMap，按 owner 分）。`latest(owner)` 会带出这个面上其他工作的轮次，要按 `run_id` 筛；按钮的 `open` 要在点的时候再按输入编号找最新的回执（D28：补充带进下一轮会换一个元素）。
- **补充编号**长这样：`steer-f-3nzp4`，正则写 `steer-[0-9a-z]+-[0-9a-z]+`。模型只有在本轮工具名单里列了 `acknowledge-inputs` 时才看得到编号；#723 之后，它只给本轮的补充。
- **宿主只留 30 轮**（`assistant-service.ts` 的 `slice(-30)`），所以「当前约定」写的是「只看了最近 N 轮」。`usage.rounds` 把子任务也算进去，不能拿来判断轮次有没有被截掉。
- **测试清理顺序**：一个 `t.after` 里依次放掉卡住的模型、等这一轮结束、`adapter.close`、删目录，否则进程挂住（3d-5 那次挂了 13 分钟）。
- **假的 fetch**：请求体可能是 `Uint8Array`，要用 `TextDecoder` 解码再 `JSON.parse`。
- **`tests/assistant-connector-business.test.ts`**：负载高时超时，#724 已放宽。
- **`affected-tests` 选不全**读合同字段的用例（BL-153）。改常量时要自己 grep 期望列表，比如 `plugin-declaration-rules`、`assistant-business-gateway`。
- **工具名单**：业务名单只有 contracts 里一份，四处校验都读它；Coding 是 workspace 角色，在 `roles.ts` 里自己列。改了角色的 `host_tools` 就把它的 `version` 升一。

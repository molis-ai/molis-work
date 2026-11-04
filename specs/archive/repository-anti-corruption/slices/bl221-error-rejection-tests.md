# BL-221：三个拒绝错误码的定向验证

状态：已接受的有限验证工单（Root，2026-10-25）；负责人 I1。准确基于 `4db89e26d6d5740e3002dfcfa868b40876385ded`，只补 #1304 FIRST 6401620828 非阻塞 2 的测试缺口，不改变现行生产语义。

覆盖 `host.agent_runtime_unavailable / unavailable`、`host.inference_unavailable / unavailable` 与 `agent.write_checker_unreadable / internal`。前两项经公开 composition 和现有写后检查器 list 动作，未装配 Prologue 时真实拒绝；后一项先经生产 save 写入有效 SDK 持久记录，关闭 owner 后破坏 checker 形状，重新装配后经生产 list 拒绝。当前 Node Host 的真实持久后端是 records 记录文件，按实际后端落坏数据，不建立无关 SQLite 替身、不复制私有 recordId、不加测试钩子。

仅改 `tests/agent-host-composition.test.ts`、新增指定的 `tests/prologue-write-checkers.test.ts`（基点不存在该文件）及本工单；确需已有 fixture 才另说明。只读生产错误定义，F1 的 session_busy/errors.ts、stream/审批、SDK 包及 provenance、Memory 端口、共享 BACKLOG、预算、CI 均不在范围。临时 Home/工作区/SDK owner 在 finally 关闭清理；不运行模型或浏览器。

| 编号 | 验收与证据 |
| --- | --- |
| BL221-REFUSAL-01 | 人的合法设置 list 实际到达缺 Runtime 的 composition，准确抛 `host.agent_runtime_unavailable` 且 kind=`unavailable`，不创建替代 Runtime。 |
| BL221-REFUSAL-02 | 公开 inference.completeText 在未装配服务时准确抛 `host.inference_unavailable` / `unavailable`，凭据解析不发生，没有模型调用。 |
| BL221-REFUSAL-03 | 同一真实 SDK owner 的坏持久 checker 经重新打开和公开 list 抛 `agent.write_checker_unreadable` / `internal`；拒绝不重写坏记录、不影响健康 workspace；恢复有效记录后同入口返回原 checker/version。 |
| BL221-REFUSAL-04 | 原 builder_unavailable、project_connection_unavailable 的现有 code/kind 断言保留复用；三处拒绝不通过 mock 同名函数或源码字符串判断代替。 |

未修改生产代码，优先复用精确同源构建；已核候选旧构建的官方源码指纹与当前 source 均不匹配，所以本树必要 FIFO 整体构建一次后绑定现行 manifest。仅运行 composition 的 BL-221 定向与新增 checker 文件、适当静态检查；不跑全量、安全宽批、真实 Home 或模型。若路径按实际合同不可达，保留调用链和失败原件并报 Root，不改生产去凑覆盖。最终 fresh-fetch + secrets、普通 feature push 后将准确 parent/head/diff、原件和独立 REVIEW/TEST 交 PIPE/Root；不开新 PR、不改原 PR 或 main。

作者验证（2026-10-25）：必要 FIFO 整体 `pnpm build` 自然退出 0，现行 build manifest 的 `source_digest` 与源码重算一致（`f0c3095248b93be8c7146c58cd9ca7276d6dccbe68e15fb763287068293e25e8`）。定向 composition 的原 BL-221 与新增拒绝用例 2/2 通过；新增持久 checker 用例最终 1/1 自然通过。早先手动装配时重复注册、以及遗漏 SDK app 身份目录前缀的夹具失败原件均保留，修正仅在测试中。最终 `node scripts/check-health-gates.mjs --base origin/main` 与 `git diff --check` 通过。独立 REVIEW/TEST 以普通 feature push 的准确提交另收件后交 PIPE/Root；验证范围保持为本工单。

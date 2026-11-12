# 第 27 批页面资源许可回归

状态：定向工程验收通过，待第 27 批集成验证（2026-11-09，Codex 第 27 批页面资源写手）。

承接[第 27 批第 5 项](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-5)和[对抗式审查台账 R7／N2](../../../../docs/reviews/adversarial-review-2026-11-01.md)。N2 发现旧门禁的 `--base` 路径缺少「新资源超许可 1 字节即拒绝」的回归。依赖（`depends_on`）：#1904（`56a55cfae`）已交的[实际字节比较和独立许可](../../../ci-conflict-reduction/spec.md#验收)，在本片基点 `17ad605da` 中。旧 `baseErrors` 已移除；现有测试直接验证纯函数的新资源审批，也通过 CLI 验证旧资源的合计增量。新资源的首次批准和超额仍缺 CLI 证据。本片目标是补齐工程回归。

只改[原测试文件](../../../../tests/page-assets-budget.test.ts)与本 spec。用临时 Git 仓库、真实许可读取路径和 `--base main` 比较，沿现有 `--base-sizes`、`--sizes` 入口提供字节夹具，检查 CLI 退出码和诊断。相较增加纯函数断言，这会走 Git 基点和许可文件读取；相较新增构建资源，这能单独验证许可边界并保留原有实际 Host 测量用例。许可里的 `user decision fixture` 仅代表测试输入。沿用[现行规则](../../../../docs/cli-and-development.md#页面资源体积)，不改门禁、CI、实际许可或页面资源。

## 开工前检查

按[开发流程 §4](../../../post-anticorruption-roadmap/reference/development-workflow.md#4-开工前检查)核对：

- 1 事实主人：沿用 Host 下发字节和任务许可记录；临时夹具不成为新的事实来源。
- 2 插件待遇、3 能力注册、4 合同：不涉及；本片没有插件装配、动作或公开接口改动。
- 5 包边界：复用现有门禁 CLI 和测试辅助函数，不新增包、依赖或内部包引用。
- 6 表与存储、7 兼容与迁移、10 升级与数据、11 成果与过程项：不涉及；测试只读写临时 Git 仓库和夹具。
- 8 安全边界、9 调用次数：不涉及；不改变运行时路径、授权、请求或开库次数，测试不启动真实 Home。
- 12 页面、外壳与文字、13 错误：不涉及；不增实际资源、页面、文案、DOM 事件或错误码，断言现有拒绝诊断。
- 14 冲突面：主会话已在 #1743 认领，仅修改这两个文件，无枢纽、轨道独占合同或共用许可文件写入。
- 15 全局取舍：平台保留一份许可逻辑，走生产 CLI 比再加纯函数用例多覆盖了 Git 基点和许可读取。插件（包括第三方）、助理、其他平台能力均不接此测试；后续开发沿 #1904 同一路径，无新增合同、迁移或其他批次前置。

## 验收

- **R7-N2-01**（[CCR-03／04](../../../ci-conflict-reduction/spec.md#验收)）：新资源缺 `userApproval` 时退出 1 并指出审批；加入新批准后，恰好 7 字节退出 0，8 字节退出 1 并指出只有 7 字节许可。原许可进入 Git 比较基点后，资源从 7 增至 8 字节退出 1，诊断显示无新额度。
- 验证：`git diff --check`；经 browser 槽运行 `node scripts/run-tests.mjs --jobs 1 tests/page-assets-budget.test.ts`；经 build 槽运行 `node scripts/check-health-gates.mjs --base origin/main`。在临时副本故意放过新资源的额外 1 字节，确认 R7-N2-01 在超额断言上失败，再清理副本。

定向结果：同文件 12 项通过，包含现有的真实 Host 字节测量。通用测试运行器的回环预探测被沙箱拒绝；此文件通过 Host 资源处理函数测量，不开监听端口，因此在同一机器槽用 `node --import tsx --test --test-concurrency=1 tests/page-assets-budget.test.ts` 执行。工作区构建已生成测量用的 JavaScript，后续 Swift 转录辅助程序的嵌套沙箱受限，未验证整个本机构建。临时故障注入让 8 字节错误放行，R7-N2-01 在退出码断言上失败（预期 1，实际 0）。

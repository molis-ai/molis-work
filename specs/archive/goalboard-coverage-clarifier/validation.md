# 覆盖澄清入口修复验证

2026-09-06。完成等级：源码、现用本体安装和受管 Web 服务已更新并验证；当前对话旧 MCP 进程尚未重新加载，不代表它已解锁，也不代表整体重组完成。

## 已验证

- 原错误复现：真实父子 Goal、已接受覆盖、子 Contract 实质 revision 后，动作 `clarify / ready / coverage` 存在，但 Explain 返回 `goal.clarification_not_needed`。新增测试修复前因此失败，修复后通过。
- 新发现的同链路不一致：提交覆盖提案后，旧 Explain 仍返回 ready；现在按投影的用户决定动作阻塞，不能继续领取。测试先失败后通过。
- `tests/coverage-clarifier.test.ts`：13 项通过。覆盖 Available、Explain、work-state、select、重复请求、同一 Run 开始对话、另一 actor 竞争、放弃后恢复原对话；Proposal 提交/Check/逐项用户确认/重复确认，以及原业务字段、子 Goal、执行记录和 Evidence 保留。
- 覆盖 current/stale × fulfilled/unmet。fulfilled/stale 历史状态由公开生命周期事实写入 API 建立，未用 SQL 改库；正常子修订触发父项重开另有既有测试覆盖。
- 拒绝场景：有效覆盖、无子项、映射 partial、归档、回收、替代、缺少能力、旧视图 token、已有 Claim、待用户决定。检查没有新增 Claim/Run 或篡改 Contract/coverage。
- 相关模块回归 19 项通过：Draft Dialogue application/boundaries、Execution module/App adapters、Proposal lifecycle close-out。日志 `/private/tmp/molis-work-coverage-regression.log` 同时包含当时 12 项新增测试，31 项通过；另 1 项浏览器启动失败，不掩盖该首次失败。
- `tests/v1.test.ts`：117 项通过，0 skip。日志 `/private/tmp/molis-work-coverage-v1.log`。
- `tests/goals-planning.e2e.test.ts`：普通沙箱下 Chrome 未启动；获准正常启动隔离 Chrome 后，实际浏览器模板复制、保存失败恢复、项目版本采用测试通过，0 skip。日志 `/private/tmp/molis-work-coverage-planning-browser.log`。未使用当前用户服务或项目。

合计 150 个不同测试通过（13 + 19 + 117 + 1），不重复计算重跑。

类型检查 `pnpm exec tsc --noEmit -p tsconfig.json` 通过；Goals Plugin 编译通过；`pnpm boundary:check` 通过，48 个包、0 errors，既有 4 个 legacy huge 文件/10 个兼容入口仍在，不假报整体清零。

## 收尾与剩余

`pnpm build` 完整构建通过（退出码 0），包括 workspace 清理/构建、根入口、PTY bundle 和构建记录；日志 `/private/tmp/molis-work-coverage-build.log`。`git diff --check` 通过。中英文开发文档已说明唯一策略 owner、调用路径和用户确认边界。所有本轮测试/构建进程均已结束。

## 用户确认后的现用更新

用户对“更新现用 Molis Work 并重启服务”明确回复“确认”。正式安装器返回 `refreshed`，版本仍为 0.1.14，已更新 `/Users/yijunwang/.molis-work/releases/molis-work-0.1.14` 和安装清单；三个 launcher 保留，Codex config 与 LaunchAgent plist 字节未变。旧程序、启动器和安装清单备份在 `/private/tmp/molis-work-coverage-upgrade-CCuUj2`，不是用户数据备份。

普通沙箱无法完成端口归属探测；正常权限下先验证 owned/running，再安装并复查，最后用正式 `service restart --confirm`，返回 restarted/running/owned。健康检查 process_id 从 96675 变为 23734，service_process_id 从 96668 变为 23731；重启前后 project_count 均为 14，status=ok。未接管其他服务，未重写服务配置。

直接从已安装 release 导入公开入口，在独立临时 DB 上重新运行同一 13 项修复测试，全部通过，0 skip；测试文件 `/private/tmp/molis-work-installed-coverage.yq9IAj/coverage-clarifier.test.mts`。首次复制为 .ts 时，临时目录没有 ESM package 声明，tsx 按 CJS 解释导致 import-only exports 拒绝；改为 .mts 明确 ESM 后通过，没有改生产包或放宽断言。这是安装消费验证，不重复累计为新测试数量。

已安装 Local Host 的 RuntimeIntegrationService.detect("codex") 返回 connected。当前宿主 MCP 的只读 Explain 仍返回旧 `goal.clarification_not_needed`，event cursor 1248 不变；旧对话进程未热加载，后续需新对话加载更新后的 MCP 再继续正式范围修订。未用 CLI、SQLite、Web 写入绕过。

未更新 Applications 或 Runtime 配置；没有向真实项目写 Proposal、Claim、Evidence 或状态。Outbox 留后续已经确认，不需要重复询问；DD 独立提案没有因此获批。所有本轮安装、重启和测试命令均已结束，受管 Web 正常常驻。

# D0039：项目关闭与删除等待激活作业真实收尾

状态：实施中（2026-11-08 用户批准日评评估方案，要求逐项独立 PR）。

## 问题与方案

activation jobs 的 done 与 abort 做 race；取消后 done 已拒绝，不等于 work 已退出。stopProject 原来只发 abort，项目关闭或清理会提前释放数据。

生命周期仍由 packages/plugin-runtime 管，删除由 Host 唯一 ProjectDeletionService 管。Runtime 单独保留真实 pending promise 与项目归属；取消立即使调用句柄结束并拒绝后续平台写，真实 pending 收尾之后才从等待集合移除。项目关闭／删除先阻止旧调用保留后继、发取消，再等待目标项目自己的 pending；不等待别的项目。无响应作业会让关闭／删除保持未完成，不超时后继续收文件。

Host 经 background service 公开装配返回值等待；Home 实例沿 executor → supervisor → closeProject，清理沿 PluginProjectLibraries → project cleanup hooks；项目实例沿 PluginPlatform → executor → session 等待。没有 Plugin SDK/Manifest 或数据库结构变化，不扩展单次 bounded background start 的既定语义。

## 开工前检查

- 小修，生命周期与安全边界；报告“abort 后等收尾”方向采纳，调整为等待真实 work，不能 await race 出来的 done。
- 不新增事实库、插件私路、跨插件实现依赖或模型调用。原服务权限与 actor 不变。
- 异步关闭沿公开装配端口传播；权限先取消，之后的写与后继均拒绝；错误仍由原 owner 报告。
- 所有插件同一 Runtime 机制；Home 与项目实例使用同一等待语义，未扩展沙箱服务。
- 不新增持久化格式、版本迁移或兼容路径。共享核心 Full 在 CI 跑，本机仅经机器槽做定向回归。
- 无界等待的代价已在获批方案中写明；不以短超时规避等待。其他项目不被 drain 的范围误伤。

## 验收

1. **D0039-01** 项目关闭收到取消且 done 已拒绝后，真实工作仍未收尾时关闭不返回；收尾后才完成，晚到写仍被拒绝。
2. **D0039-02** 删除项目的插件清理也等待真实收尾，不能在 done 拒绝时提前返回。
3. **D0039-03** 分区在取消作业的同一轮封住新读写，但真实作业未退出时不关闭或删除库；收尾完成后才删分区。
4. **D0039-04** 项目级插件的激活作业也经同一等待合同，项目库不在真实收尾前关闭。
5. **D0039-05** 目标项目取消／删除不取消也不等待其他项目作业；旧作业不能保留后继，后来的合法调用仍可登记。关闭回归须只放行目标项目，另一项目仍保持悬挂，关闭照常完成。

01、02、04 在 tests/security-invariants-activation-jobs.test.ts；03 在 tests/plugin-database-partition-deletion.test.ts；其他项目隔离及后继拒绝由既有 S-52 测试证明，保留原断言，只把测试外部放行移到取消后、等待关闭前以符合新合同。分区删除与真实清理由 plugin-database-partition-deletion、home-plugin-project-cleanup 等回归补证。

## 验证与交付

- 修复前 D0039-01、02 均失败：关闭／清理提前返回，而 work 尚未放行。
- 2026-11-08 用户另明确 D0071 采用独立客户端凭据、旧接入重新连接；该项不混入本 PR。
- 本 PR 未合并／发布；验证与 PR 链接随后回填日评主记录。

- 分区回归曾发现新增 await 破坏同一轮关闭／拒绝，已修为：无激活作业时不增加等待；有真实收尾时先以既有 partition clearing owner 封住入口，收尾后再释放库，保留 PART-10 全部断言。
- createPluginPlatform 组合根新增一个生命周期转发，内聚职责未变；其既有 cohesive-unit 精确 size 从 155 更新到 156，未改阈值或门禁脚本。

- 最终本地验证：整体构建通过；9 个定向文件共 93 个测试通过（激活作业 19、分区删除 5、Home 清理 5、executor 3、删除 hooks 11、删除声明 3、删除服务 19、后台执行 24、平台组合 4）；health --base 与 boundary 通过。新增项目夹具适配项目服务的 plugin.grant_denied，未改 Home 探针的 actions.forbidden 断言。

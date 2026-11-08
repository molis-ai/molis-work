# D0002：工作资产恢复不继承包内授权

状态：实施中（2026-11-08 用户批准日评第二版自动可修项，并授权逐项提交 PR）；本项验证与 PR 状态记在日评记录。

## 问题与决定

本地恢复把 bundle 的 owner 当作执行 actor，按包内 team_project 设置共享授权。包只能提供固定内容和来源，不能签发身份或共享权限。报告的建议方向与归位采纳，补齐拒绝发生位置及失败重试语义。

本项为小修，类型为安全边界：入口在 apps/server，编排在 apps/local-host，成果版本仍由 artifacts 公开 commands 写入；不新增产品入口，不改变 S-81 的未安装产出者历史恢复例外。恢复使用宿主固定身份 continuity:local-restore；原 owner 留在现有 JSON metadata 的 restore_source_owner_actor_id，仅作未验证来源，不参与归属或授权。包的内容、类型、生产者与固定版本不重写；无可信共享授权的 team_project 包拒绝，不自动转个人版本。

## 开工前检查

- 身份与授权：actor 由宿主固定；来源 owner 不进入执行身份；team scope 预检在任何目标 Home/目录/回执写入之前，内部恢复入口也复核。
- 事实与层次：沿 ArtifactsApplicationApi commands，不直接写 artifacts 表，不添加恢复专用业务存储。
- 合同与升级：不改资产包格式、持久化 schema、公开 contracts/SDK 或动作 schema。只使用已有自由 JSON metadata，不读取历史字段或兜底旧取值。
- 生命周期：同包重试仍幂等，后续恢复事务失败沿既有回执重试；没有将成果事务回滚等同于整个 Home 无副作用。
- 全局影响：所有产出者统一适用；实验 Server 不变成正式产品路径；恢复不调模型，也不增助理/插件权限。共享核心验证在 CI Full，本机只做定向测试。
- 冲突：已读取全部在途 PR 标题，本项目标恢复文件未见同题 PR；index 只导出新增宿主检查与固定 actor，不加插件分支。

## 验收

1. **D0002-01** 带 team_project 的包即使带 team_share_authorized/actor_id 也拒绝，目标 Home、项目与恢复回执都没有被创建。
2. **D0002-02** 私有包恢复与归档记录的执行 actor 是宿主身份，归属是本地用户，包内 owner 只留来源 metadata；同包重放仍可用。
3. **D0002-03** 内部恢复也拒绝伪造团队范围，已有成果和事件游标不变；随后合法恢复可重试。
4. **D0002-04** 跨设备服务仍能导出团队固定内容，但本地恢复不会将该导出当成共享授权；显式个人范围输入仍保留固定 ID、版本、摘要和内容。

5. **D0002-05** 编译后的独立 CLI 同样在目标创建前拒绝团队包；显式个人包仍可由真实 Catalog 与成果库恢复并读取。

对应测试在 tests/security-invariants-artifact-declarations.test.ts（01–03）、tests/cross-device-continuity.test.ts（04）与 tests/cross-device-launcher.test.ts（05）。安全边界同步 S-81；既有必跑与 CI 结果按 PR 记录，不以本地定向测试替代 Full。

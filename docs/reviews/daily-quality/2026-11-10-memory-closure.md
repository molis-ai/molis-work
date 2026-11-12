# 2026-11-10：记忆分段清理与重试核回

状态：D0170 / D0176（关联 D0181）已完成现行调用链核查与专项补证；本轮只增加测试，不改变产品的分段提交语义。最终验证结果见下，尚未提交 PR。

## 来源与范围

来源为用户指定的《项目讨论 · Molis Work.md》11-10 批次，报告基准 `02d2443f1`，附件未提供建议／建议归位。现行核查基准 `07840084d9b34b096506836ad6468c3a888fdb3c`（#2011）；用户在第一组完成后要求“然后处理下一个问题”，接续原排序第二组。沿用[11-08 中项评估](2026-11-08-medium.md)的已讨论方向：检查 complete、保留原确认与操作号、核实重启恢复，不以全回滚替代 SDK 已提交事实。工作在独立分支 `codex/daily-quality-1110-memory-closure`，没有操作真实 Home 或主检出。

## 固定评估表

| 问题 | 引入PR | 问题描述 | 修复方式 | 建议修复方案 |
| --- | --- | --- | --- | --- |
| D0170 · 中 | 最早缺陷引入未确认；#1064 引入现行严格预览、逐项结果与 complete 合同 | 原报告以已成功部分不回滚判为部分修复；现行合同明确允许部分结果，设置页不会把 complete=false 显示为全部完成 | 无需修复 | 采纳旧报告“调用方必须看 complete；未知项走对账，不要显示成已清空”，归位 memory 服务及既有设置页。核对全部产品消费者，补跨 scope、SDK 与账本重启后的固定预览重试；保留已完成项，不伪造原子回滚 |
| D0176 · 中；D0181 并入 | 最早缺陷引入未确认；#1064 建立当前操作号与 scope marker 恢复机制 | 已成功项 forget 后遇 unknown/conflict 会报错；是否丢失原计划与角色发现信息需要重启证据，部分账本本身不等于缺陷 | 无需修复 | 采纳旧报告“同一成功边界，或明确记录已忘 id 供重试”的后一个方向，归位 memory owner。既有固定 SDK 预览、操作回执与 ledger marker 已保留身份；补验前段成功后段未知、候选失败、双存储重启、重复重试及跨项目保护，不另建第二套进度 |

## 共同机制与消费路径

- 设置页 `/clear` → Host memory 路由 → 同一个 `memory.scope.clear` 动作 → `MemoryService.clearScope` → scope commands。动作输出必须有 `removed/complete/items`；受众仅本人 UI，未向 Agent/MCP/插件开放。设置页保持原 fingerprint，只有 complete=true 才显示完成；冲突、未知、未执行分别列出；重置确认不自动发起新删除。
- 删除项目 → 项目删除 owner hook → `registerMemoryProjectDeletion` → `purgeProjectMemories`。有删除回执时使用稳定 deletion_id；当前项目清理无回执路径保留 pending marker 的 operation_id。错误向外抛出，hook 不把该步视为完成。无 Agent runtime 的 ledger-only 路径也由该服务清理。
- 两条路径均由 Prologue（经 agent-host）拥有正文与逐项删除事实，memory 保存固定计划，storage 拥有 ledger。`forget` 清掉条目的历史、使用记录等，不删除项目角色发现信息；只有全部 scope 成功后 `forgetScopes` 才清除 owner、候选记录和项目设置。跨包使用公开出口，没有额外 SQL 或插件私路。
- 新测试使用真实 SDK 与持久账本，关闭并重新打开两者。unknown 是在真实删除完成后丢失响应的故障注入；候选冲突在实际 purge 前注入，代表 owner 尚未允许该删除，不声称复现了 SDK 内部的所有 reserved 状态。

## 编号与原场景对应

| 编号／待解决点 | 改动与验证 | 结论／限制 |
| --- | --- | --- |
| D0170：多段部分成功不能静默显示完成 | 原 memory-settings-cas 浏览器测试保留完整确认、版本冲突／未知／未执行展示与失败重试；memory-service-cas 验证 unknown 后不执行后续 part | 产品原路径已存在，专项回归覆盖 |
| D0170：前段成功、后段 unknown 后重启 | 新 memory-clear-restart 的 clear 场景：project 已完成、Character 真实删除但响应丢失，complete=false；SDK 与账本重启后仍逐字段使用原预览与 operation_id，后来新增的条目保留；再次重试不扩大范围 | 补足重启证据；不改变确认语义 |
| D0176 / D0181：部分 forget 与角色发现 | 新 purge 场景：先完成 project、Character unknown，显式 memory.conflict；已完成历史清除、未知历史和角色发现保留，重启后原决定对账完成；其他项目未动 | 不把有进度的失败改成全成功或恢复已删除正文 |
| D0176：候选冲突、版本与重启 | 新候选场景：含正式记忆与候选的 Character，project 删除已完成，候选 purge 冲突；重启后仍冲突且使用原 candidate_id/version/operation_id，解除注入后完成并清掉候选账本 | 不刷新候选版本，不把受阻清理判为成功；注入不等于 SDK 内部预约状态的端到端证明 |
| 项目删除与动作入口 | 既有 project-deletion-memory、project-deletion-hooks、memory-actions；包括候选专属角色、另一项目保留、删除重复执行；memory-ledger-transaction 回归 | 保留既有 Host 与公共动作接线，不复制实现 |

## 验证记录

- 锁定离线安装、整体构建完成；本轮没有产品源码、合同或页面资源变化。
- 首轮4文件111项通过：memory-service-cas 86、memory-settings-cas 浏览器21、project-deletion-memory 2、新重启场景2，0跳过。
- 新候选夹具首次直接以 UI propose 被真实权限拒绝，已改为正式助理 offer 来源；随后发现独立 service 夹具没有 Host 的 deletingProject 上下文，候选专属角色不能按删除特权读取，改为已有正式角色 owner 的候选冲突；候选专属角色仍由原 Host 删除集成用例验证，未给夹具新增授权。未放宽权限断言。一次测试命令误写不存在的 project-deleted-hooks 文件，已改用实际 project-deletion-hooks 文件。两者都不是产品回归，不据此改产品代码。
- 新用例加入产品 CI 子集，使用临时目录、无模型、无 macOS 专有依赖；未修改门禁规则、预算或隔离清单。
- 本轮是测试与证据补全，不涉及共享核心产品改动；未跑新的 Full，不冒充覆盖全部插件组合或真实用户数据。
- 最终专项7个文件139项全部通过（按最终文件去重）：memory-clear-restart 3、memory-service-cas 86、memory-settings-cas 21、project-deletion-memory 2、memory-actions 15、memory-ledger-transaction 1、project-deletion-hooks 11。0跳过；新增候选场景在修正来源与 scope 夹具后3/3通过。

开工前检查：小修／底层与架构的验收补证，不新增产品需求或视觉交互。七项自查：批准范围过；仓库硬约束过；系统调用链与 owner 过；生产调用次数不涉及（无产品变化）；门禁以本轮实际结果核回；代码质量过（复用公开夹具、真实持久化 owner，注入只在测试）；方案偏离无。报告所述“部分账本仍存在”是已完成与未完成状态分开记录的现行设计，不能以恢复已删除正文来消除这一现象。本轮关闭的是报告点名的静默成功与丢失重试进度担忧，不泛化为所有崩溃时点均已证明。
- CI 清单与选择补验：ci-product-subset 20/20、ci-test-selection 13/13；最终9个文件共172项通过。健康门禁 `--base origin/main`（`07840084d`）、包边界检查和 diff 检查通过，未新增门禁例外。

## 2026-11-11 交付状态核回

在已 fetch 的 `origin/main`（`93eb5590a`）确认本专项已随 [#2012](https://github.com/molis-ai/molis-work/pull/2012) 合入，合并提交 `21faff508`。上文“尚未合入／尚未提交 PR”等文字是当时的阶段记录，当前交付状态以本段为准；既有测试结果仍只证明当时记录的验收基准，本次未重跑该专项，也不声称已发布或验证真实 Home。

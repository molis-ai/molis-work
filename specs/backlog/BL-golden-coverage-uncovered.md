# BL-golden-coverage-uncovered

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-coverage-uncovered | `tooling/gates/golden-coverage.json` 的 `uncovered` 清单（第一份金样时 19 条，含 `HOME-DATA.md`「必备份」路径与 `config/installation.json`；2026-11-22 核：`runtime-integrations/<runtime>.json` 已在 #2187 补进 `0.1.0` 金样，`feed/evidence/blobs/**` 已于 #2209 改名为 `security/evidence/blobs/**`）。`0.1.1-dev.8` 补齐了 `computer/settings.json`。剩余路径与理由以 `uncovered` 现行登记为准（2026-11-22 决定 66 校准：106～111 每批随 Clean v1 拍平与 partitionRoot() 同步刷新 golden-coverage.json 与 0.1.0 金样） | 第 05 批复核（2026-11-11 代码质量复审）；[金样回放设计](../upgrade-continuity/golden-replay-design.md) §5、§7 UPG2-04 | 已知缺口 | 补齐要生成金样，需要 macOS + `.nvmrc` 锁定的 Node，并逐条经主人动作写：`computer/records/` 要系统权限、`security/evidence` 要联网或写入证据正文、`plugin-builder` 要真实模型，生成条件不满足；降登记会改变备份承诺，要用户决定 | 下一次发布生成金样（U2-e 检查单第 2 节） | 中 | U2 金样（执行会话待分配） |

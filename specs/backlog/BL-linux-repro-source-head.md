# BL-linux-repro-source-head

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-linux-repro-source-head | Linux 定向回归在构建前核对实际检出的提交 | [第 59 批任务板与 Git 复核](../subagent-interaction/spec.md#1224-任务板子步骤的-full-回归) | 已知缺口 | 第 59 批已用同一镜像下可核对的命令重做对照 | `scripts/linux-repro.mjs`、Docker 存储卷 | 中 | 待分配 |

`scripts/linux-repro.mjs` 在 `cd repo && git fetch … && git checkout …` 中途失败时，Shell 仍可能继续构建卷中缓存的版本。第 59 批用临时主线检出复测 Git 审批时触发过该路径，首轮日志撤回基线归属。

让取提交或检出失败时直接退出。每次构建和运行前核对实际 `HEAD`，让日志带出测试所用提交，并覆盖容器无法读取工作树的情形。

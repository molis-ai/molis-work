# BL-installed-plugin-mac-fixtures

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-installed-plugin-mac-fixtures | 在 macOS 安装插件回归里用原动作网关和实际可用的重启调度夹具 | [第 59 批统一回归](../subagent-interaction/spec.md#1222-统一回归发现的角色与键盘问题) | 工程流程 | 安装与调度夹具沿独立路径维护 | macOS 测试套件、安装插件动作和 Feed 时钟 | 中 | 待分配 |

- `installed-plugin-policy.test.ts` 在 `dbcf562a67` 和 `e6e9dfbbc9` 同为 0/11。夹具直派的 HTTP 调用先收 403，等待下游动作的八项超时，两个结果断言看到原动作权限拒绝。调用路径须满足 [#2017](https://github.com/molis-ai/molis-work/pull/2017) 引入的原动作入口要求。修正后保留对迟到写入、未知结果和新调用恢复的现有断言。
- `installed-plugin-host.test.ts` 的 SYS-15-S1 在本批首轮到达重启后，未观察到 Feed 时钟任务。单测对照时本批和干净主线同样在更早的一步报告 `schedules.add` 不可用；干净主线的整文件同样在该步失败。先稳定项目原插件的就绪条件，再复核候选首轮的 Feed 注册时序。保留两个 due 任务、原计划数据及跨重启的结果断言。

本机证据为 `/tmp/molis-b59-e6-unified.log`、`/tmp/molis-b59-installed-policy-dbcf.log` 与 `/tmp/molis-b59-installed-host-dbcf-full.log`。

# Coding 写后检查与 Agent Host 终态

状态：两项已在独立分支完成并通过本地定向验收，基于 `7988a165cb`。需求来自 BL-coding-write-check-batch-read、BL-run-terminal-cleanup 和[第 31 批](../../post-anticorruption-roadmap/reference/batches/31.md)。

## BL-coding-write-check-batch-read

- **WC-1** 时间线首次打开、翻历史和等待刷新用同一入口。插件从轮次的命令引用找出写后检查，向 `agent.write-checks.read@1` 传原会话、轮次和写调用编号。宿主核会话归属，只回放指定轮次一次，逐条核对资源、执行目录、命令和 effect。返回值按写调用编号匹配到文件行，仅含检查器、版本、退出码、超时与取消。单条命令详情仍从原动作读取。
- **WC-2** 成功结果在当前插件实例内按会话、轮次、写调用缓存；并发刷新共用进行中的读取。单条回执缺失、重复或校验失败时，时间线标为读不到，满 30 秒再查该条。没有检查的写入标为未检查。

| 同一轮的时间线操作 | 新增批量请求 | 为读回执新增的整轮回放 | 读取的回执资源 |
| --- | ---: | ---: | --- |
| 同时显示三条检查，两次刷新重叠 | 1 | 1 | w1、w2、w3 各一次 |
| 29,999 ms 刷新，w3 上次读不到 | 0 | 0 | 无 |
| 30,000 ms 刷新 | 1 | 1 | 仅 w3 |
| 三条均已缓存后再刷新，或打开没有检查的轮次 | 0 | 0 | 无 |

[请求与回放计数](../../../tests/coding-diagnose-timeline.e2e.test.ts)覆盖三条检查、回放次序不同、其中一条目录不匹配、并发刷新、29,999 毫秒和 30,000 毫秒。[真实 SDK 文件回执](../../../tests/coding-diagnose-after-write.test.ts)核对两份写入及一条缺失编号。[动作归属校验](../../../tests/agent-host-actions.test.ts)覆盖其他安装、项目、操作者和轮次。

## BL-run-terminal-cleanup

- **RT-1** 宿主接到 SDK 提交的终态后，释放本轮页面、项目工作、语言服务、活动会话和调用控制。重复事件只结算一次。取消保持原有消息策略；失败、护栏或熔断结束仍在等答复的请求，保存各自的原因。代码只把能由原审批记录证明尚未派发的调用标为未执行。
- **RT-2** 轮次事实用完即释放。确有外部等待时，检查器继续用该轮原授权复核，最后一个等待结束后收回。观察者写轮次结束事实，遇到护栏或熔断另写护栏事实。重启从同一轮的终态回放补记工作步骤。

| SDK 事件 | 页面轮次 | 页面占用与项目工作结算 | agent.run 结束观测 | 重启后的工作子步骤 |
| --- | --- | --- | --- | --- |
| completed | completed | completed | succeeded | succeeded |
| failed | failed | failed | failed | failed |
| cancelled | cancelled（本人停止时按原意图显示） | stopped | cancelled | cancelled |
| tripped | stopped，保留护栏原因 | stopped | cancelled，原因 tripped | cancelled |
| circuit-tripped | stopped，保留连续无进展的原因 | stopped | cancelled，原因 circuit-tripped | cancelled |

[Node adapter 生命周期](../../../tests/prologue-node-start-order.test.ts)用可控终态事件和资源替身观察释放次数及未答请求。[运行视图与长轮询](../../../tests/prologue-run-timing.test.ts)、[原审批调用](../../../tests/prologue-stream.test.ts)、[工作步骤与检查器](../../../tests/prologue-work-waits.test.ts)、[结束观测](../../../tests/observation-agent-events.test.ts)和[浏览器中的消息提示](../../../tests/coding-state-rings.e2e.test.ts)分别覆盖对应消费者。每种终态都在准备完成前到达一次，准备完成后再重复通知。页面、LSP 和项目工作各结算一次。等待检查条件的调用继续按原权限复核，最后一个等待结束后再次核验会被拒绝。仍需核对副作用的轮次保留原有核对状态。

- **RT-3** 记忆 history 接受非负安全整数 limit 和正安全整数 before_version。先按严格版本上界筛选，再取最后 limit 条，按从旧到新返回。零上限返回空页，非法参数返回 `agent.history_invalid`。[分页与非法值回归](../../../tests/memory-edit-retry.test.ts)

## 验证记录

2026-11-24 在独立工作树执行 `pnpm build`，更新公开 API 和动作快照。用 `node scripts/run-tests.mjs --jobs 1 --browser-jobs 1` 运行 13 个相关测试文件，130/130 用例通过，包括隔离 Home 的真实 SDK 文件回执、测试浏览器中的时间线及消息提示。五种终态与重启对账的逐项断言使用可控事件及回放。未调用真实模型服务。

`pnpm health:check --base 7988a165cb`、`pnpm boundary:check`、`pnpm page-assets:check` 均通过。测试类型门禁对照同一基线通过，既有诊断数保持 4132。全量回归留给 CI。

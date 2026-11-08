# BL-golden-replay-gate-trust

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-replay-gate-trust | `scripts/gates/initial-versions.mjs` 看到金样里有某条升级链的旧版本，就算这条链「回放过」，并不真的跑回放；真正的回放在 CI 的 golden-replay 作业里，只在改到相关文件时跑。门禁的说法要改成「有金样可回放」，或者门禁读回放作业的结果 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾 | 已知缺口 | 集成时发现；回放作业本身在挡合并的 CI 里 | U2-e | 低 | C1（执行会话待分配） |

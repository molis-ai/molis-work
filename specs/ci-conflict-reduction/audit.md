# 历史 PR 冲突核查

2026-11-06 的只读快照。GitHub 最近更新且 updated >= 2026-10-23 的 200 个 PR，198 个头可在本机历史中核对，2 个头在抓取间已变化或不可用（#1900、#1902），不计入结论。198 个中 67 个包含可重放的实际文本冲突。叠层 PR 可能包含同一次合并，因此下面是涉及的 PR 数，不是互相独立的事故数。

方法：对各 PR 的头与当前 main 求 merge-base，检查分支上的两父合并；`git show --remerge-diff` 中带 `remerge CONFLICT` 的文件计为真实冲突，普通文件改动另行统计。另扫描了本地非 main 的 1,133 次两父合并，其中 612 次有真实冲突，用于定位原因，不能视为整个远端仓库的完整历史。

| 文件 | 涉及冲突的 PR | 普通改动 PR | 例子 |
| --- | ---: | ---: | --- |
| `tooling/gates/page-assets.json` | 34 | 42 | [1889](https://github.com/molis-ai/molis-work/pull/1889)、[1888](https://github.com/molis-ai/molis-work/pull/1888)、[1887](https://github.com/molis-ai/molis-work/pull/1887) |
| `scripts/gates/page-assets.mjs` | 28 | 34 | [1887](https://github.com/molis-ai/molis-work/pull/1887)、[1886](https://github.com/molis-ai/molis-work/pull/1886)、[1885](https://github.com/molis-ai/molis-work/pull/1885) |
| `docs/system/SECURITY-INVARIANTS.md` | 13 | 23 | [1879](https://github.com/molis-ai/molis-work/pull/1879)、[1877](https://github.com/molis-ai/molis-work/pull/1877)、[1846](https://github.com/molis-ai/molis-work/pull/1846) |
| `docs/design/README.md` | 12 | 19 | [1809](https://github.com/molis-ai/molis-work/pull/1809)、[1808](https://github.com/molis-ai/molis-work/pull/1808)、[1803](https://github.com/molis-ai/molis-work/pull/1803) |
| `specs/BACKLOG.md` | 11 | 39 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1853](https://github.com/molis-ai/molis-work/pull/1853)、[1849](https://github.com/molis-ai/molis-work/pull/1849) |
| `specs/post-anticorruption-roadmap/reference/batches/02.md` | 7 | 15 | [1837](https://github.com/molis-ai/molis-work/pull/1837)、[1836](https://github.com/molis-ai/molis-work/pull/1836)、[1825](https://github.com/molis-ai/molis-work/pull/1825) |
| `tooling/gates/baseline.json` | 6 | 未列入前 30 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1837](https://github.com/molis-ai/molis-work/pull/1837)、[1725](https://github.com/molis-ai/molis-work/pull/1725) |
| `specs/README.md` | 5 | 20 | [1897](https://github.com/molis-ai/molis-work/pull/1897)、[1877](https://github.com/molis-ai/molis-work/pull/1877)、[1846](https://github.com/molis-ai/molis-work/pull/1846) |
| `specs/assistant-service-connections/spec.md` | 5 | 17 | [1885](https://github.com/molis-ai/molis-work/pull/1885)、[1881](https://github.com/molis-ai/molis-work/pull/1881)、[1870](https://github.com/molis-ai/molis-work/pull/1870) |
| `apps/workbench/src/index.ts` | 5 | 未列入前 30 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1725](https://github.com/molis-ai/molis-work/pull/1725)、[1724](https://github.com/molis-ai/molis-work/pull/1724) |
| `docs/releases/CHANGELOG.md` | 5 | 未列入前 30 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1837](https://github.com/molis-ai/molis-work/pull/1837)、[1747](https://github.com/molis-ai/molis-work/pull/1747) |
| `tooling/gates/giant-exceptions.json` | 5 | 14 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1846](https://github.com/molis-ai/molis-work/pull/1846)、[1725](https://github.com/molis-ai/molis-work/pull/1725) |
| `tests/fixtures/goals-page-golden/golden.json` | 5 | 未列入前 30 | [1853](https://github.com/molis-ai/molis-work/pull/1853)、[1851](https://github.com/molis-ai/molis-work/pull/1851)、[1725](https://github.com/molis-ai/molis-work/pull/1725) |
| `apps/workbench/package.json` | 4 | 未列入前 30 | [1886](https://github.com/molis-ai/molis-work/pull/1886)、[1877](https://github.com/molis-ai/molis-work/pull/1877)、[1862](https://github.com/molis-ai/molis-work/pull/1862) |
| `apps/local-host/src/web-goals-read.ts` | 4 | 未列入前 30 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1725](https://github.com/molis-ai/molis-work/pull/1725)、[1724](https://github.com/molis-ai/molis-work/pull/1724) |
| `apps/workbench/src/i18n/board-en.ts` | 4 | 10 | [1877](https://github.com/molis-ai/molis-work/pull/1877)、[1867](https://github.com/molis-ai/molis-work/pull/1867)、[1862](https://github.com/molis-ai/molis-work/pull/1862) |

## 已核对的原因

- 页面资源：两个共享文件记录绝对字节值，main 独立变化后重新登记已批准的同一增量。`757010bcde` 重登两张样式表各 +315 B；`792d1a4fd4` 重登插件框 +14 B；`3a6b38e7e7` 直接重放出两个页面资源文件的冲突。
- 安全不变量：集中表格追加与全局连续编号相互耦合。PR #1879 的合并 `000e9a6a00` 把分支的 S-109 重新编号为 S-141；S-08/S-17 等相同安全边界的同时修改另属真实语义冲突。
- 设计索引：新原型都在同一表格插入行。PR #1809 的 `b4df0c8c45` 是不同原型条目的追加冲突；各原型自己的 README 已承载详细状态。
- 健康快查基线：CI 的 `--base` 已完全不读 `tooling/gates/baseline.json`，该文件只用于本地快查，却仍被版本控制并形成冲突。
- 巨大单元例外：不同单元在同一 JSON 登记；同一单元的 size 必须等于实测，不能用择大值或 union 消除冲突。
- 金样与 API/动作快照：派生输出有集中存放，但金样的期望必须来自独立参考，不能自动用候选输出覆盖来变绿；API/动作快照可在真实源码冲突解决后按生产生成器重建。
- BACKLOG、需求 spec、业务源码中有真实内容分歧；不能只凭高频编辑自动择边、丢掉删除或拼接两个决定。

## 处理边界

页面资源、纯本地快查记录与可独立登记的数据优先消除共享写点。生成快照必须按其事实来源重建；独立参考金样和业务语义冲突保留拒绝与人工判断。具体实现范围和验收以同目录 spec 为准。

## 实施结果（候选）

- 页面资源：删除绝对预算和门禁内许可表，比较真实基点构建；增长许可使用任务独立文件。
- 健康快查：从 Git 跟踪文件改到每个工作树自己的 Git 元数据；缺失时做 origin/main 实测比较。
- 巨大单元：47 条登记按源码文件拆开，kind、理由、size 与迁移前逐项一致。
- 安全不变量：140 条独立记录，原 ID、正文与测试引用保留；新增用语义 ID，不争抢连续数字。原 S-15 扩展说明移到该记录，旧章节入口保留链接。
- 待办：381 条拆成独立文件，来源、状态、依赖、优先级和负责人保留；完成仍删除，未做事项仍只有这一份正文。
- 设计索引：38 行描述和决策原文移到对应设计目录，父目录不再重复登记状态。
- API/动作快照、金样和业务代码：真实语义重叠保留正常审阅。生成快照按合并后的真实源码重建；金样不自动采纳候选产出。

迁移内容已逐项比较原文与链接目标：140/381/47/38 项全部保留，无不一致。这是一次迁移核对，不增加新的文件 hash 或固定条目数门禁。实际双分支合并测试覆盖独立登记，重复 ID 和巨大单元 key 仍被拒绝。

# Goals 页面绘制条件集合补足

状态：10 份完整文件已在最终 H 新跑，43/43 通过，无失败、跳过、取消或重试。最终 H `3421e0e69645a7ac247672c590951bce3a9c5765` 与 tree `2bb1668425959a01907048e78837ba414af7845a` 均未改变。该集合是 README 页面绘制条件项，补足此前只列无条件 139 文件的记账遗漏。

旧证据实际来自 PR1a H `7977190e1889b8583310db2423788e88aff6be1d` 的 Full 41260457165；各原始 job 的 checkout 为 `572e4622fdd82507294df2cc68e138557afb91b0`，保存的 checkout Git 对象 tree 与旧 H 相同。下表逐项给出完整文件结果的原日志位置。原日志各有准确 checkout、整体 pnpm build 和完整文件结果；旧 CI 环境为 Linux、jobs2/retries1，这十文件行均首次 ok，不冒称旧整轮无重试。

实际输入比较：十份测试（含内联 fixture）和 tests/goals-page-mount.ts 的 Git blob 均与旧 H 相同；各所调 renderer 的 owner ui/ui-model 叶子也相同。但每份文件都会调用 goalsRenderers，经该 helper → createGoalsRendererFactories → host.mountDeclared，factories 的运行时导入从包根改到 owner 叶子，且本片整体构建与宿主声明挂载输入已变。旧完整结果不能独自覆盖新的模块加载链，因此本次十份均补跑，没有将历史通过冒记为新组合。逐项叶子/表面、原件行及新结果见 goals-conditional-evidence.json；实际共同差异见 goals-conditional-input-delta.diff。

使用现有最终头匹配整体构建，不重复 build：goals-conditional-build.json 新计算 source digest 并与 dist manifest 相等，均为 `1b94d365d17b700e5de2bf8abf72fa3343a7e5722d0194eab535b97277d73432`；没有换入父 dist。公共 browser 槽、私有 HOME/TMP/XDG、--jobs 1 --retries 0；实际命令和环境见 goals-conditional-result.json。

| 完整文件 | 旧完整结果原件（旧 H / checkout 如上） | 实际 renderer 输入 | 沿用/补验决定及最终结果 |
| --- | --- | --- | --- |
| `tests/goals-context-ui.test.ts` | [2/2](/private/tmp/t116-current-verify/ci/full-124712459644.log:1296) | context；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 2/2](/private/tmp/t116-pr1b-evidence/goals-conditional.log:2) |
| `tests/goals-dialogs-ui.test.ts` | [2/2](/private/tmp/t116-current-verify/ci/full-124712459613.log:1238) | dialogs；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 2/2](/private/tmp/t116-pr1b-evidence/goals-conditional.log:16) |
| `tests/goals-document-ui.test.ts` | [8/8](/private/tmp/t116-current-verify/ci/full-124712459573.log:1241) | document；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 8/8](/private/tmp/t116-pr1b-evidence/goals-conditional.log:30) |
| `tests/goals-kanban-ui.test.ts` | [5/5](/private/tmp/t116-current-verify/ci/full-124712459658.log:1237) | momentum；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 5/5](/private/tmp/t116-pr1b-evidence/goals-conditional.log:50) |
| `tests/goals-momentum-ui.test.ts` | [4/4](/private/tmp/t116-current-verify/ci/full-124712459622.log:1284) | momentum；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 4/4](/private/tmp/t116-pr1b-evidence/goals-conditional.log:67) |
| `tests/goals-policy-ui.test.ts` | [5/5](/private/tmp/t116-current-verify/ci/full-124712459601.log:1298) | policy；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 5/5](/private/tmp/t116-pr1b-evidence/goals-conditional.log:83) |
| `tests/goals-relation-ui.test.ts` | [3/3](/private/tmp/t116-current-verify/ci/full-124712459595.log:1236) | relation；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 3/3](/private/tmp/t116-pr1b-evidence/goals-conditional.log:100) |
| `tests/goals-status-ui.test.ts` | [2/2](/private/tmp/t116-current-verify/ci/full-124712459605.log:1241) | factors, status；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 2/2](/private/tmp/t116-pr1b-evidence/goals-conditional.log:115) |
| `tests/goals-tree-ui.test.ts` | [7/7](/private/tmp/t116-current-verify/ci/full-124712459573.log:1243) | tree；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 7/7](/private/tmp/t116-pr1b-evidence/goals-conditional.log:129) |
| `tests/status-ring.test.ts` | [5/5](/private/tmp/t116-current-verify/ci/full-124712459561.log:1270) | status；测试、fixture、owner叶子相同，factory加载链改变 | 不核抵旧结果；[新跑 5/5](/private/tmp/t116-pr1b-evidence/goals-conditional.log:148) |

无新增源码、门禁、快照或预算变更。已通过的其它条件文件（golden、两 Goals 路由、UiHost、registration boundaries、package boundary）保原有效证据，不重复。final health/边界/API/actions/imports/48实际 served 原件继续有效，输入与 H 未变；final-cleanup.json 记录本次补验后的清理。

原 mandatory-resume 的 139/140、首批 npm 配置中断及修复过程、所有 mutation 原始结果均保留。作者两道 SDK 变异中 declaration 首构建通过，projection 首构建因 TS6133 失败（不是有效行为负例），修正 unused import 后才得到有效三项失败；本补验未重跑或改写这些记录。其它验证线的失败仍归其原件，不由本表追记为作者执行。

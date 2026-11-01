# #1673 只读计划审查 · ci1673_scope_review

状态：只读审查完成。**现有预览包含 PR 整套/故障路径的执行收缩，以及手动探针默认行为变化；根已据审查选择保留 M 路径的更窄收紧合同。** 下列 P1 针对尚未体现该修订的旧预览，须由 writer 落实。最终受保护合并门槛更严与 PR 执行是否减少是两个不同判断。本文不裁定 10-31 新授权、不签最终 N，也不确认或重跑历史 106。

绑定：B `562f207c7b996bf9d71f8e55ebaea74ca3b83681`；H `d4f77755a7a8120f429abd3274d25326d65c2d95`；M `f47fa0da4ba7447f94d1cd209e6d69d43b21465c`。审查对象为 `/private/tmp/ci1673-next/PLAN.md`、`proposed-M-delta.diff`、`merge-preview/` 与对应准确 Git 对象。没有用本机更晚 main 替换 M。

根的最新边界：保 M 的 PR whole/failure 整套回退与 some 运行；只有 selector success 且对应 mode none 才容许该 job 的 PR skip；失败/取消/残留输出不豁免。九项 blocking、可信 queue 复用、merge_group 整套保留；手动 Linux probe 保 M 现行行为，暂不引入 H 的 opt-in。本报告以下给出这个同单修订的静态可行性与最小核收范围，不展开新 CI 体系。

## Blocker / P1：旧预览必须修订的行为与判决

### P1-01：原样保 H 会减少当前 M 的 PR 检查，不能把它只描述为新增 blocking

- M 的 PR 合同是：明确 `none` 才跳过；`whole`、成功但空输出、选择失败/取消/跳过（含残留 `some`）都跑完整两片。实际条件见 [M workflow:679](/private/tmp/ci1673-next/sources/M/.github/workflows/ci.yml:679)，既有负例见 [M selection test:274](/private/tmp/ci1673-next/sources/M/tests/ci-test-selection.test.ts:274)，合同说明见 [M PACKAGE-BOUNDARIES:151](/private/tmp/ci1673-next/sources/M/docs/system/PACKAGE-BOUNDARIES.md:151)。
- H 两个 job 的 PR 条件改为 `test-selection.result == success && mode == some`，因此上述整套/故障/不可信输出路径都不执行；Verify 随后接受这两个 skipped。见 [H workflow:698](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:698)、[H workflow:865](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:865)、[H workflow:630](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:630)。H 的 [RAC-1764:278](/private/tmp/ci1673-next/sources/H/tests/ci-test-selection.test.ts:278)还明确把这些原有回退用例由“整套运行”改成“跳过”，不是文本冲突偶然造成的变化。
- 触发 `whole` 的恰是共享核心、装配、未覆盖源码、运行器/清单/workflow 等较宽变更，以及解析/读取故障，见 [selector:74](/private/tmp/ci1673-next/sources/H/scripts/ci-test-selection.mjs:74)。所以“selector 决策函数没变”不能证明端到端行为没变：相同的 `whole` 输出被 workflow 换了消费方式。
- **准确结论：** M 的 SI/Product 本来不是 required，因此没有证据证明 H 放松了旧七项的合并判决；正常 `merge_group` 上 H 新增两项必须 success，最终合并门槛更严。但 PR 上现有检查与故障回退确实减少，合并前的产品失败反馈被推迟到 queue。若本次“只许变严”包括保留现有 CI 执行/故障语义，原样保 H 不符合；若只指受保护合并的最终接受条件，则需要在 accepted 合同里明确这个较窄口径与 PR 延后执行的取舍，不能由同步计划暗自代定。

**更窄的建议：** 保 M 的 PR `whole`/失败/取消/空输出整套回退与 `some` 定向执行，只让成功且明确 `none` 继续跳过；再增加 SI/Product blocking、queue 整套及有证据的去重。这直接兑现原“并入 Verify”，不附带省掉 PR 整套的优化。是否选择此合同由根裁定。

### P1-02：计划的“some 必须成功”没有在 Verify 汇总层得到约束

[PLAN:26](/private/tmp/ci1673-next/PLAN.md:26)把 PR `success + some` 写成“两项 success 通过；failure/cancelled 拒绝”，但实际 Verify 没有 `test-selection` 的直接依赖、result 或 mode 输入，只凭 `event == pull_request` 就接受两项中的任何 `skipped`，见 [H workflow:587](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:587)及 [H workflow:630](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:630)。因此它独立无法判明“成功明确 none/whole 的允许跳过”与“some 应跑却跳过”。selector 失败、空/未知 mode 也都在同一豁免内。

这不是已证实的正常 queue 绕过：当前 producer 的 job `if` 在未取消、成功 `some` 时会运行；queue 上 Verify 对 skipped 明确拒绝。问题是本计划若声称汇总门禁能保证 PR 应跑必跑，现有 shell 与保护用例不足以证明这个合同。不能用“job 已加入 needs”代替这条判决。

现有 [RAC-1903:240](/private/tmp/ci1673-next/sources/H/tests/ci-queue-verified.test.ts:240)只把 event、queue 结果及各 job 结果传给真实 shell，完全没有 selector 上下文；其 [254–259 行](/private/tmp/ci1673-next/sources/H/tests/ci-queue-verified.test.ts:254)反而固定“任意 PR 两项 skipped 均通过”。RAC-1764 单独验证 producer 条件，不能补上汇总层缺少的关联断言。

**若采用上一条的更窄合同，必改点：** Verify 的 PR skip 豁免应有可读取的 selector 依据，只认成功、明确 `none`；`some`/`whole` 或故障路径应要求实际 success，或明确失败，不能默认为 skipped 通过。相应真实 Verify shell 的完整原文件测试应覆盖各 job 不同 mode、selector 失败并残留输出、应跑却 skipped 的拒绝。若根保留 queue 延后策略，至少也要明确允许跳过的 outcome/mode 集合及失败语义，不能继续把“任意 skipped”当成“按选择器合法跳过”的同义词。

注意实施边界：若给 Verify 增加直接 selector 依赖，现有 `blockingJobs()` 只排除 queue-check，见 [fixture:32](/private/tmp/ci1673-next/sources/H/tests/fixtures/ci-workflow.ts:32)；直接加 needs 会把五分钟 selector 误当作 blocking job，并影响 T350 的限时规则及去重读取。根应先确认最小必要配套范围，不能为维持“原 14 文件”而放宽限时/重复规则。这是依赖语义接缝，不要求新增工作流。

### 范围裁定点：手动 Linux probe opt-in 是另一项行为变化

M 任意 `workflow_dispatch` 都跑探针（[M workflow:753](/private/tmp/ci1673-next/sources/M/.github/workflows/ci.yml:753)）；H 新增 boolean 输入且默认 false，并要求手动明确勾上才跑（[H workflow:14](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:14)、[H workflow:783](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:783)），对应测试也被改成固定这个新默认值（[probe test:462](/private/tmp/ci1673-next/sources/H/tests/ci-linux-probe.test.ts:462)）。

它不削弱 Verify：探针始终信息作业，schedule 六片/预算/uv/并发组保持。但它减少既有手动入口的执行，**不是“两周后把产品子集并入 Verify”的必需步骤**。`authority-evidence.json` 的 10-08 原答复直接支持延后并入，不直接证明默认关闭手动探针；H spec 把它另记为 10-14 频率决定的 10-31 补记（[spec:1220](/private/tmp/ci1673-next/sources/H/specs/repository-anti-corruption/spec.md:1220)）。这里不判有无授权。根现已选择保 M 手动行为；writer 须同步保留相应 M 条件/原测试，并清掉本候选中“此次已采用 opt-in”的新增现行说明，不能因它与 #14 在同一 PR 就自动继承。

## 根所选窄方案：静态可行，沿用现有 workflow 即可

1. **两个 job 的条件只调整消费方式。** 沿用 M 的 `selector 非 success 或对应 mode 非 none 就运行`，去掉 M 的“不进 merge_group”，保 H 的可信 queue push 排除条件。既有 `!cancelled()` 保持。这样 PR 明确 none 才跳过，some 用既有文件/分片输出，whole/失败仍用完整两片；非 PR selector 本来跳过，仍走完整两片。不需要更改 `decideJob`、`outputLines`、阈值、产品 runner 或 queue 查询算法。
2. **Verify 读取真实 selector 结果与两个 mode。** 在现有 needs 里增加 `test-selection` 辅助依赖，并把 `needs.test-selection.result`、`.outputs.security_mode`、`.outputs.product_mode` 精确传给原判决 shell。保原可信 push early-exit；其余旧七项照旧逐项必须 success。SI/Product 各自默认也必须 success；唯一额外允许的是 `event=PR && selector_result=success && 此 job 的 mode=none && 此 job 结果=skipped`。一个 job 的 none 不能替另一个 job 放行。selector 自己红但两项整套真实 success 可以通过；无需把 selector 故障另立为一项阻塞检查。
3. **公共 fixture 只剔除两个具名辅助依赖。** `blockingJobs()` 应继续返回九项真实检查，同时排除具名 queue-check 与 test-selection；不要按“少于 30 分钟”或所有含 outputs 的 job 一概剔除。需要把 `tests/fixtures/ci-workflow.ts` 纳入原单最小配套路径（相对原 14 路径增加 1 个），更新原引用测试的 needs 列表。T350 的读取/限时拒绝规则保持，不把 selector 的 5 分钟改成 30 或给它另加例外表。
4. **探针保 M。** `workflow_dispatch` 不新增 linux_probe 输入；probe 条件保 `schedule || workflow_dispatch`。六片、预算、uv、continue-on-error、夜间并发组均不动。相应 H 新增 opt-in 测试/说明退回 M 合同。这不需要第二份 workflow 或新入口。
5. **名单合成不变。** 本次审查已核实的 408/271/679 与 stage-pages、catalog、desktop-launch-args 归属继续保留；不因 PR 恢复 whole 执行而改删名单或 SI 入口。

### 新 N 最小必须核收：现行真实 if 与 Verify shell

只修改现有规则用例；条件从新 N 的实际 workflow 读取，经现行 `evaluateExpression`；判决从实际 Verify 的 `run: |` 提取并执行，延用现有 `runStep`。同时断言生产 env 的三条 selector 绑定和直接 needs，不能只向一个手写的新判决函数传理想输入。

| 路径 | 实际 job if / matrix / 文件表达式 | 实际 Verify shell 必须证明 |
| --- | --- | --- |
| PR + success + some | 运行；既有一片/两片选择及文件约束不变 | 对应 job 只有 success 可过；skipped/failure/cancelled/空结果拒绝 |
| PR + success + whole | 完整两片、完整清单 | skipped 拒绝；真实 success 通过 |
| PR + success + none | 仅对应 job 跳过 | 只有此 job 的 skipped 豁免；failure/cancelled 不豁免 |
| PR + selector failure/cancelled/skipped，含残留 NONE/SOME/WHOLE/空输出 | 全清单两片；不读残留文件/分片 | 两项 skipped 拒绝；两项完整 success 可过，旧七项仍须 success |
| PR + success + 空/未知 mode | 不得据此跳过；空输出沿现有完整回退 | skipped 拒绝，不能被当成 none |
| PR 的 SI none、Product some/whole；及反向组合 | 各自按自己的 mode 决定 | none 只豁免自己；另一个 skipped 拒绝；两项 none 才能双 skip |
| merge_group / 未复用 push / schedule / dispatch | selector 跳过时仍完整两片 | 九项只认 success；任一 skipped/failure/cancelled 均拒绝，PR none 豁免不得串到这些事件 |
| 可信 queue push 与其它 queue-check 结果 | 保原 push + success + 严格 true 三条件；failed/cancelled/skipped 残留 true 不复用 | 原早退仅在同一组三条件成立时通过；其它情况不得借残留 true 豁免九项 |

这张表是现行 RAC-1764/RAC-1903 的必要变更路径，不要求构造新的事件矩阵体系。保 RAC-1900 的同 SHA/同 base 证据、RAC-1902 的真实 queue entry shell 及其它 git 退出码负例；不要为新 PR 判决削弱这些既有断言。

**完整文件最小集合为五个：** `tests/ci-test-selection.test.ts`（实际 if/matrix/list）、`tests/ci-queue-verified.test.ts`（真实 Verify shell、selector 绑定与可信复用）、`tests/ci-product-subset.test.ts`（Verify needs 精确形状与运行器原约束）、`tests/ci-timeouts.test.ts`（T350 与九项真实 blocking/两项辅助依赖的区分）、`tests/ci-product-subset-plan.test.ts`（新清单及真实 blocking 覆盖去重）。其中最后一个无需为了跑它而改源码。五个完整文件可以由同树新 N CI 核抵，不要求本机再重复；不筛单 case、不预签计数、不机械重跑历史 106。probe 回到 M 且可逐字证明时，不另要求本机重复整份探针规则，但新 N 的既有 CI 仍照常执行它及 ci-install。

限时核收应明确：公共 fixture 返回九项真实 blocking，selector 和 queue-check 仍各 5 分钟且只是辅助；T350 的无 limit 不冒作已检查、不可读 limit 拒绝、低于 30 分钟的真实 blocking 拒绝都保留。已有准确 N 构建、health/diff-check 与槽位仍按根的正式执行窗口处理，本只读审查未启动这些步骤。

## P2：非阻塞修订与证据表达

1. **现行文档自相矛盾。** 预览 [PACKAGE-BOUNDARIES:151](/private/tmp/ci1673-next/merge-preview/docs/system/PACKAGE-BOUNDARIES.md:151)仍说 selector 失败/取消/跳过整套两片，下一行却说 PR 跳过；[workflow:672](/private/tmp/ci1673-next/sources/H/.github/workflows/ci.yml:672)仍写“broken selection runs more, never less”；[PARALLEL-DEVELOPMENT:68](/private/tmp/ci1673-next/merge-preview/docs/system/PARALLEL-DEVELOPMENT.md:68)仍称 SI/Product 不挡合并、不进 queue、push 照跑，后面第 72 行已是新策略。应按根最后选定合同修同一份活文档，不以新增段落保留互相冲突的现行说明。
2. **同步后现行数量须与历史事实分开。** 预览 [PACKAGE-BOUNDARIES:142](/private/tmp/ci1673-next/merge-preview/docs/system/PACKAGE-BOUNDARIES.md:142)还写“现为 407”，实际是 408；434→407/去 27 项可保为原 H 历史，本次 M 436→408/去 28 项应另述，不能改写旧验证来源。此处只是文档问题，清单并集已核无丢失。
3. **增量验证范围已随根的窄合同调整。** 原计划三个本地增量文件只适合 workflow/selector 仍逐字等 H 的普通合流；现已选定修 Verify 判决，最小完整核收应按上节五个文件，继续可复用同树新 CI。probe 恢复 M 后不新增本机探针执行要求。不要把原三文件建议或旧 106 冒签成修订后 N 的新证据，也不因此新增产品 Full。

## 已核实、可以保留的部分

- 独立逐字比对原 14 路径的 H/M 外置 sources 与准确 Git 对象全部一致；预览 workflow、selector 均逐字等于 H，所以这些风险会被当前预览完整带入，并非已在同步时修掉。
- 独立按 M 的 Git 树及 `test:security` 通配符复算：M Product 436、SI 271；预览 Product 408、SI 271，交集 0，前后并集均 679；无丢失、无额外文件。`home-plugin-stage-pages` 留 Product；`project-catalog` 只由 SI 承接；`desktop-launch-args` 未复活。这里证明文件覆盖集合，不证明任何文件执行通过。
- merge_group 在当前 H 上运行两个完整两片列表；Verify 除受证据支持的 push 复用外要求九项 success，PR 的 skipped 豁免没有扩到 queue/直推/schedule/dispatch 或旧七项。没有发现正常队列合并比 M 更弱的接受路径。
- queue 复用的静态合同完整：`ci-queue-verified.mjs` 只认同 workflow、同 head SHA、成功 merge_group run、成功 Verify，以及成功的 `Merge queue base <push.before>` 步骤（[script:33](/private/tmp/ci1673-next/sources/H/scripts/ci-queue-verified.mjs:33)）。job 条件与 Verify 同时要求 push + queue-check success + verified 严格 true；API/输出/结果失败走全跑，残留 true 不足以放行。同提交已含新 workflow，因此不会借旧 M 的七项 Verify 冒充本提交九项。未发现本范围需要重写复用算法的理由。
- 两项新增 queue entry 检查只将 `git ls-remote` 退出 2 视作分支消失；其它 git 错误继续执行，符合原合同。T350 的 `limitedBlockingJobs`、公共 fixture 读取和无 limit 不算已检查负例仍在预览中，未见退回旧重复解析器。

## 本次操作边界

只读 Git 对象、现有文件与来源摘录；仅做外置 sources 字节对应和文件集合静态计算。唯一写入为本文件。没有运行生产选择器、测试、构建、shell 判决用例、浏览器、真实 Home 或 GitHub 操作；没有修改源码、refs、index、工作树、分支保护或新增流程。`prior-verification.md` 只作历史来源阅读，未据此宣称本线跑过 106、新合流已验证或新策略已在真实 queue 实操。

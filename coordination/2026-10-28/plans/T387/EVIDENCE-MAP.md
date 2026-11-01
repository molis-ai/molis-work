# T387 证据沿用与最终 Full 交接

本线按 accepted WO/独立书审仅核继承边界和新组合工程，没有重新执行原业务矩阵/变异。旧执行不改署当前H。WO、方案、独立书审及已读来源副本在 `raw/accepted-and-inherited/`。

| 成员 | 原有效证据（按WO保留来源） | 本次可沿用的理由 / 不扩大的范围 |
| --- | --- | --- |
| T299 | 旧e7a44f8dd的独立四项文本检查；作者35文件、M1/M2；当前afbc工程/增量核收 | 只有同一JSDoc迁位；最终文件blob与afbc同，原/承载patch-id及全部增删行相同。保M代码，不新增一审。旧结果不计新H运行，正式full=true不降级。 |
| T345 | 6ace44e4624e3f346ff210097b18e14561257505的旧独立63（ledger9＋runtime54）；作者T336组合runtime54、59文件及先红/M1–M4 | 七文件最终blob与4e6055767同，DDL/fixture、事务/beforeEffect/批次/引用计数保持。已读的实际依赖M0→M无变化，最终三个生产编译文件与保留成员产物逐字节同。只适用于新建干净v1 Home，不证明真实旧Home已清理或升级；不做compat/迁移/回填。 |
| T373 | 原ba1a7aaedbbfca2ffb293632d4ec8b3000482824的独立完整7/7及closing负控6/7唯一RAC2780红；作者旧catch负控与68文件 | 两文件最终blob与c52同，最终home-aggregate.js与原独立映射的保留产物SHA-256均为6330e5db…；当前直接依赖/调用入口未变。保两阶段code-only顺序、closing静默、父取消同reason和其它项目答案；两issue不保证两行Host日志，不闭R63整体。 |

`binding.json`/逐成员patch保存实际原H、parents、各自merge-base、最终H/blob与stable patch-id；`runtime-inputs.json`明确本线读取的Feed/聚合直接依赖、contracts/SDK/Runtime/storage及package/lock从M0=8a46到M无变化，未外推为全Host所有文件不变。`compiled-comparison.json`的五份保留成员产物与最终同文件逐字节相同，只是编译产物静态核对，不是新执行。T382只在Host index改Artifact HTTP出口名，未改聚合出口；M的T208/T381/T382/T383均随main保留。

## 最终普通承载 Full 必核

预期事件H=`3862de92dee5683543fef60d669750053562e330`，但根须实际回读CI的checkout C、parents和tree，不能把event H当运行树。核匹配build、当前Verify/独立验证/二审、full=true的一次普通Full及实际适用SI/未答问题，旧三个头的CI/Full不能代签。

以下**完整文件本轮未本机执行**，授权交最终新Full；并非已通过或因静态无Darwin标记即可推定一定运行：

- `tests/feed-content-ledger.test.ts`（最终blob b7fa308d8ce4857ccd66d4a9c7ffc531f9430a37）
- `tests/feed-runtime-plugin.test.ts`（最终blob 600fe0d5bbad0bb090799137ee30b99580f2f8c1）
- `tests/home-aggregate.test.ts`（最终blob 3976ab67d34dc29e60064886e7eadae757c7be9b）

从真实分片原日志逐一核每文件完成及实际case结果，保首败/retry/skip/cancel/bail事实；不固定旧数量充覆盖，不只看aggregate成功。缺失/排除/未知保持缺口，再由根补指定完整文件。失败先归成员/新M；新增修复回根scope，不在承载里扩第四项。无需integration镜像或取消任何CI。

T384/T116/T121当前非成员头不是本候选祖先；共享hunk只按WO末节窗口接收，未写其树或采用未合实现。若未来新main先带它们进入，原十文件全blob同不再是机械目标，须正常吸收实际M并按自有hunk保已采用行为、重新核真实差集。

采用后才由根回读main逐成员patch/blob/注释/DDL/fixture/聚合行为核账，再标#1671/#1663/#1700由承载采用，不能称原PR自身merged。旧失败/retry/skip/UNKNOWN、真实Home/产品/本人验收边界均保持。

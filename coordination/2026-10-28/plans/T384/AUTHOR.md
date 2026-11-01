# T384 最终本地冻结（full=true，未发布）

M=`6729a2d46`；H=`4404e1426`、tree=`ecf513543`；参照R=`8214e9126`、tree=`7dd31c530`。H干净，R生产干净，仅三份冻结测试副本未跟踪。两端正常合入准确T383，只改Pages测试14+/1−，无冲突；生产digest均不变，没有重建或重跑旧批。新M的health实际通过；boundary、合同、资源及旧批按未变输入核抵，不改署原执行头。

四片完整合成/rename映射齐；仅端口与独立golden两自修，T382相邻删除按根裁解决。承载对新M的完整补丁与此前逐字相同。原R独立录制68/68，原H消费67 pass/1录制钩子skip；66完整HTML相同，8项期望变化仅来自T148属性。T382两端匹配build和路径编译桥已核，不重录。

d929阶段四文件36/36及各门禁通过；更早六接缝88 pass/1 Grok未安装skip。48资源7,469,519B，仅workbench.js +324B命中原许可。原T143 Mac和原Full首败/retry-only/UNKNOWN保留；全部阶段来源、失败恢复和未验证项见下。

Pages未由作者运行，现可交独立线5；二审、CI/SI/新Full、推前fresh secrets及采用归根，RAC2819未结。未推送/GH/CI/本机Full。公共槽和系统Home隔离已核，Foundation系统TMP未隔离；临时环境已清理。

原件：

- [阶段输入、核抵、Grok与原Full首败](/private/tmp/t384-evidence/EVIDENCE-STAGES.md)、[T383两端merge及精确头](/private/tmp/t384-evidence/T383-merge-chain.json)、[H仅测试增量](/private/tmp/t384-evidence/candidate-T383-only.patch)、[R仅测试增量](/private/tmp/t384-evidence/reference-T383-only.patch)、[承载补丁不变](/private/tmp/t384-evidence/T383-carrier-projection.json)
- [最终 H 生产digest](/private/tmp/t384-evidence/candidate-after-T383/final-build.json)、[最终 R 生产digest](/private/tmp/t384-evidence/reference-after-T383/final-build.json)、[最终M health原件](/private/tmp/t384-evidence/candidate-after-T383/health-final-base.raw)、[本阶段清理](/private/tmp/t384-evidence/cleanup-T383.json)
- [完整 M/H/R、tree、构建 digest](/private/tmp/t384-evidence/FINAL-STATE.json)、[当前 H 全部检查](/private/tmp/t384-evidence/current-checks.json)
- [四片 merge 链](/private/tmp/t384-evidence/merge-chain.json)、[参照 merge 链](/private/tmp/t384-evidence/reference-merge-chain.json)、[最终逐片 projection](/private/tmp/t384-evidence/final-projections.json)、[逐个不等 blob 的差异](/private/tmp/t384-evidence/final-projection-diffs/)、[完整 delta](/private/tmp/t384-evidence/carrier.patch)、[rename](/private/tmp/t384-evidence/carrier-renames.txt)、[两条自修](/private/tmp/t384-evidence/self-repair.patch)、[T362 patch-id](/private/tmp/t384-evidence/T362-patch-equivalence.json)
- [H 的 T382 合成及精确裁定](/private/tmp/t384-evidence/after-T382-merge.json)、[实际 BACKLOG 解决](/private/tmp/t384-evidence/BACKLOG-actual-resolution.diff)、[R 的 T382 合成](/private/tmp/t384-evidence/reference-after-T382-merge.json)、[T382 普通/无上下文 patch-id](/private/tmp/t384-evidence/T382-sync-equivalence.json)、[上下文差异](/private/tmp/t384-evidence/T382-patch-context.diff)
- [原独立参照不含 T116 的证据](/private/tmp/t384-evidence/reference-independence.json)、[冻结 test/view](/private/tmp/t384-evidence/frozen-golden-inputs.json)、[66完整HTML比较](/private/tmp/t384-evidence/full-html-comparison.json)、[原完整HTML](/private/tmp/t384-evidence/golden-html/)、[8项期望变化来源](/private/tmp/t384-evidence/golden-delta-source.json)
- [T382阶段 H 的编译桥与沿用](/private/tmp/t384-evidence/T382-runtime-lineage.json)、[T382阶段 R 的同父增量、编译桥及匹配构建](/private/tmp/t384-evidence/reference-T382-runtime-lineage.json)、[T382阶段 H 构建/36例/门禁原始日志](/private/tmp/t384-evidence/candidate-after-T382/)、[T382阶段 R 构建原始日志](/private/tmp/t384-evidence/reference-after-T382/)
- [原 R 录制原始日志](/private/tmp/t384-evidence/reference/golden.raw)、[原 H 消费及 skip](/private/tmp/t384-evidence/candidate/golden.raw)、[原 H 六接缝及 Grok skip](/private/tmp/t384-evidence/candidate/targeted.raw)、[T143 安全输入沿用说明](/private/tmp/t384-evidence/T143-inheritance.md)
- [所有合成/控制检查失败与恢复](/private/tmp/t384-evidence/CHECK-ADJUSTMENTS.md)、[初轮清理](/private/tmp/t384-evidence/cleanup-initial.json)、[最终清理](/private/tmp/t384-evidence/cleanup-final.json)

后续普通 golden 消费应不设 `MOLIS_WORK_GOLDEN_RECORD`，只设 `MOLIS_WORK_GOLDEN_DUMP=1`；`run-after-T382.py` 的两端 golden 阶段均已限定为消费。初轮 `run.py reference golden` 是历史录制命令，不用于后续验证。

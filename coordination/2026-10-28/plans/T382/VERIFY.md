# T382 独立核收（本地候选）

结论：RAC-2810～2812 的代码与本地工程证据可接受；没有由本单实际差异引出的额外本机动态测试缺口。建议 `full=false`，由根作最终裁定。此处不签 CI、真实 Home、产品验收或整 W6 完成。后续准确 PR 头的 CI 安全证据单列 `CI-REPORT.md`。

## 输入与准确绑定

- 任务书：`/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-382.md`。B `3fd857792a27352030ac8f3544a3b57d418febc1`；H `4f3d4d03e07a5701b74060e14d6bf9c8fa47881f`，parent=B，tree `11853036c5dc2a65b732e7d087254f0764085d4e`。独立回读 `/tmp/t382-dev` HEAD/tree、clean、`git diff --check B H` 均符合。
- 实际 B→H 为 26 文件、+38/−23。旧 Artifact HTTP 文件移动后，撤销指定 `type ArtifactImportResult` import、两处 `invoke<unknown, ArtifactImportResult>` 泛型并恢复旧双断言，正文与 B 逐字相同。三处生产 import/export 仅换模块路径。调用、input、参数次序、URL、权限及错误次序不变；泛型运行时擦除。其余差异是现行路径引用、文档、例外名单与 BL-926 待办清理。旧 `src/web` 墓碑、两个批准的构建例外、RAC-2746～2748 的通用 BL 出处循环均保留。
- **作者动态运行时 Git HEAD 不是 H。** 六文件原始记录完成于 2026-11-01 02:27:51Z，补充两文件完成于 02:30:47Z，H 于 02:32:04Z 提交；运行时是 B 加最终候选工作树内容。`dist/.molis-work-build.json` 在 02:26:56Z 生成，源码指纹 `ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872`；作者最终回读及本线独立计算当前 H 指纹均与之匹配。指纹覆盖源码、脚本、workspace manifests 等构建输入，**不覆盖 tests/docs/specs**。相关被改测试文件的当前 mtime 均早于六文件运行，且最终 H clean；这支持候选与 H 对应，但缺少运行时完整工作树快照，故不写成“六文件已在准确 H 上运行”。提交没有额外内容变化的现有证据足以避免仅为 SHA 身份重跑。

## 证据核对

- 作者在匹配整体 build 后执行任务书六份完整测试文件，`--jobs 1 --retries 0`，64/64，fail/skip/cancel 为 0：[原始输出](/private/tmp/t382-evidence/execution/six-files.raw)、[逐文件汇总](/private/tmp/t382-evidence/six-files-summary.json)。其中 `artifact-document-import.test.ts` 的 S-55 真实 HTTP 请求针对命名文件的 header、body path 和非法 digest 均实际拒绝并通过。
- 两份补充边界文件完整执行 97/97，fail/skip/cancel 为 0：[原始输出](/private/tmp/t382-evidence/execution/targeted-extras.raw)。三条临时负例分别以“未批准 native 路由”“平台例外缺 BL”“平台例外引用不存在 BL”的目标断言失败，退出 1；不是其他前置断言误红，负例修改均恢复：[结果](/private/tmp/t382-evidence/execution/negative-results.json)、[清理](/private/tmp/t382-evidence/cleanup.json)。
- 作者整体 `pnpm build`、`pnpm boundary:check`、按 B 的 health、test-imports、文档/技能引用检查与资源检查均 exit 0；本线核读原始日志和返回码。48 个 served assets 共 7,469,195 B，逐项等于 B 资源预算，无新增或增长；未更新预算。参见[作者执行证据目录](/private/tmp/t382-evidence/execution/)及[资源摘要](/private/tmp/t382-evidence/served-summary.json)。
- `affected-tests` 给 678 个宽建议且 `full=[]`。本单是单生产包的机械模块重命名与擦除类型参数，主 HTTP 函数正文经允许差异还原后逐字相同，行为、合同、存储和资源字节未变；上述完整定向行为及边界文件已经覆盖本单明确的变化和拒绝。因此建议本单 `full=false`。678 与 `full=[]` 都不能单独作此结论；合成树出现新行为、失败或根的整体阶段要求时另议准确头 Full。其余建议未运行，不能写成通过。
- 同一 affected 原件的 `uncovered` **不是空**，列 `apps/local-host/src/web-composition.ts` 与 `apps/local-host/src/web-goals-read.ts`。两文件各仅一行 import 路径替换：前者装配 `createLocalArtifactHttp`，后者引用 `renderGoalArtifactContext`。整体 build 已核两个新导出可解析；完整 `artifact-browser.test.ts` 的“Artifact HTTP links exact versions”及“Goal context embeds explicit exact Artifact relations”实际通过，另 `artifact-document-import.test.ts` 走完整 HTTP 导入路径。selector 未直接映射这两个源码文件不等于对应行为完全未执行，也不把其余 670 个建议写成已跑。

## 待 CI 核项

PR #1710 在 H 上已创建，但本报告写入时尚未回读该 PR 的 CI 终态。S-55 对应 `tests/artifact-document-import.test.ts`，必须核对准确 H 的 `test-selection` 输出、两个 SI 分片实际文件清单与原始执行结果，确认包含该完整文件及 S-55，并记录安全作业终态。`Security invariants (not required yet)` 设 `continue-on-error` 且不在 `Verify.needs`；Verify 绿不能替代 Linux 安全作业绿。CI 跟踪另写 `CI-REPORT.md`，根最终复核 Verify 和 SI。

本线未安装、构建、执行测试、操作浏览器、GitHub 写入或真实 Home；动态结果均署为作者运行、独立核读。无本线代码修改。

# T065 第一段普通同步交付

状态：根已授权的“普通同步/窄核”完成，交回 writer。只完成本阶段，不把 T065 整单、功能运行、CI/Full 或最终资源冻结标为完成。T389 修复树继续冻结；T386 仍由开发线4负责。

## 最终绑定

| 项目 | 值 |
| --- | --- |
| 新 H | `4accb7d14550913315114ab4a411f63471daa7e8` |
| first parent：原 prepared N | `df4d3f92dde968062a232bd5ceb5f402da8dec5f` |
| second parent：根冻结的已采用 M | `08642dcb92dbdad029d990813da56682d6864a23` |
| tree | `821a083d48be82fcbf8f37860a7c54b8b64490cc` |
| 分支 | `feature/t065-next-sync` |
| 独立新树 | `/private/tmp/t065-next/wt` |
| 工作树 | clean，MERGE_HEAD 已正常结束 |

根最新指令及协调 `plans/T065-next/PLAN.md`、06:50裁定为本轮授权；独立 `REVIEW.md` 无当前必修。根提供的 fresh 22 open PR 读取中原 #1669 仍H94861，本轮只回读本地原头/采用ref，不另做GH或远端刷新。`origin/main` 本轮开始及收尾均为指定 M。

命令是新树从 prepared N 创建新 feature 分支，`merge --no-ff --no-commit <准确M>` 自动合并，窄核后普通 commit；没有 rebase/force/cherry-pick。为遵守此阶段不跑测试/不触及签名凭据，Git hooks 关闭，merge commit 不签名。无新冲突、无手工解决或源码编辑。

原件：`sync-preflight.json`、`sync-worktree.log`、`sync-merge.log`/`.exit`、`sync-staged-tree.json`、`sync-commit.log`、`sync-binding.json`。新tree与已接受计划/独立窄审回算的tree逐值相同。

## 实际差量与保护

- 相对准确 M 仅37个原T065非资源路径；其它路径全部等于 M。`sync-final-delta.diff` 是完整本单差异，`sync-adopted-main.diff` 是 prepared N→本次合并所吸收的 main 差异。
- 37项中34个 blob 与原 H `94861f093ab3971c6370b824cdd2bfcc30caf14d` 相同，包含四个继续删除的文件：
  - `apps/local-host/src/connector-oauth-callbacks.ts`
  - `apps/local-host/src/connector-oauth-commit.ts`
  - `apps/local-host/src/notion-oauth.ts`
  - `plugins/official-integrations/catalog/src/notion-oauth.ts`
- 另外三处是自然合并双方文档：CHANGELOG 相对 M 只加本单6行；BACKLOG 相对 M 只加原BL-914一行，无删除；SI 的 S-37/95/101整行等于原H，main的 S-55/60/66/91/103整行等于M。本单 `CALL-CHAINS.md` 保原H，未另写需求或文档变体。`sync-audit.json`、`sync-blob-map.json` 和三份 `sync-*-vs-M.diff` 保存逐项事实。
- `tooling/gates/page-assets.json` **整个 blob** 等于M（48项；workbench1150615、frame190838）；`scripts/gates/page-assets.mjs`整个blob也等于M。没有资源下降改写、许可/算法修改、旧数字扣211或带入兄弟候选。
- 原作者树H94861、原prepared树Ndf4及T389 H137671的head/tree/完整porcelain状态与开工前完全相同，均clean；`sync-protected-after.json`可核。未改这三个分支、原树或保护分支。

## 本次依赖与旧证据窄核

最终H继承的具体依赖逐blob等于准确M：connection-store宿主桥及horizontal connector-host的两新增导出、settings-directory、共享refresh/send/refusal/protocol/lifecycle、两原OAuth/Feed夹具、runner和lock；五份README也等于M，旧M→M的“开发要求”逐字相同。`sync-dependency-binding.json`连接本次H与之前已审的真实差集，非泛称所有模块输入相同。

main的新增 `forgetPluginBindings`/`forgetConnectorPluginBindings` 是BL-491清绑定加法；本次H的现有 `withConnectorConnections` 函数体与旧M相同，原T065 core/合同/测试blob也保原H。T362的settings-directory现行目录query/hash增量完整继承，不用旧bundle回盖。原件 `additive-connector-dependency.diff`、`shared-client-delta.diff`、`critical-area-check.json`、`readme-contracts.json` 保留。没有重新审OAuth实现，也没有把新增导出所在整个模块说成同blob或新dist已验证。

| 旧证据 | 现在的沿用边界 |
| --- | --- |
| 原OAuth/shared-refresh/Notion别名与拒绝、等待者和rotation条件写回的独立/二审结论 | 对原未变机制保原head/owner及来源；本次静态blob与依赖窄核支持未被同步回退，不改署新H运行通过 |
| 旧CI093同树的Notion19/shared-refresh69/callback17等；普通29；作者66文件/9M | 各自保原CI/head/owner，不重复、不冒作本次新头覆盖 |
| 上一同步method-directory与Alchemist1+5 | 保原组合来源；本次无相关新增语义，不自动重复 |
| prepared df4 的build/boundary/health、680行secret及48项1150080旧实测 | 仍只证明旧M8a46组合；本次新H无matching build，不核抵最终资源，也不把旧−211当实测 |
| HOLD、M1/M3/M6 NOT RUN、历史UNKNOWN、T066父子Full | 原边界不变，不改绿、不变永久禁令；T066不冒称本单纯新头Full；T065 full=true保留 |

一处只读核对助手首次用strip后的文件文本按尾部换行截函数，旧M恰在该函数结束，导致助手重复拼一个右括号而触发自身assert；未修改仓库、未执行运行命令。已用原始文本及首个不缩进的闭括号核对，函数体完全相同。`sync-audit-attempt-1.txt`保留这条证据助手失败，不计产品或测试结果。

## 本阶段验证及下一窗口

已执行：Git普通同步、准确parents/tree、37路径/34同blob/四删除、三文档双侧行、M完整资源账本/脚本、限定依赖及README绑定、`git diff --cached --check`、三个受保护树回读及新树clean。未执行安装、build、test、page-assets测量/updater、health/boundary/import/API/actions/secrets脚本、GH/push/CI/Full；没有matching dist或新头工程绿的声明。新树没有node_modules/dist，本轮没有启动Host、Chrome、模型或真实Home，因此无测试运行清理；新树和证据保留供后续正常接续。

仅最终资源冻结/匹配构建留待根选定窗口：按已接受顺序T389实际采用 → T386吸收并按真实组合重新核资源/精确许可后实际采用 → 本单吸收最终M，整体matching build、48项实测、标准updater及有效工程/预算完整文件核验。等待的是这份实际main资源基点，不是当前功能/普通同步整单WAIT。不得将T389/T386候选或两许可相加导入；不得提前动本次完整M账本。根之后给准确路径、M与资源窗口，再执行第二段；本阶段可核交付已完成。

# T384 独立增量验证｜验证线5

**最终 H 的本地独立增量验证通过。** 本线未发现必须追加修复或重跑旧单整批的差异。此结论不替代根的最终二审、准确头 Verify/适用SI/新Full、发布与实际main采用；RAC-2819未结。

- 最终 M：`6729a2d4655caa603daa369f99884e09c4726bde`。
- 最终 H：`4404e142662cbd7895f46c1c6df6e5efe5e6e135`，tree `ecf513543c29653e1be8eb44cf684efc14a3800d`。
- 最终 R：`8214e9126158db285136af58d283b5e89d44d691`，tree `7dd31c5302603a5713fa8b9eda95d3ff975af730`。

## 实际执行与最终核抵

本线从独立detached检出正常离线安装、整体构建两端，ad-hoc签名，并重新计算生产digest匹配manifest。正常金样与六接缝实际执行在 H0=`d9291973f6a9a534afabfc3681991b9eb15183e2`、R0=`1a4966bd3d5c9fdccb2d10a11fcb8fa6b90daa02`，没有借作者dist/DUMP或开RECORD。

| 本线独立执行 | 结果与原件 |
| --- | --- |
| R0正常完整golden | 67 pass、1原录入专用skip，[日志](/private/tmp/t384-verify/reference/golden.log) |
| H0正常完整golden | 67 pass、1原录入专用skip，[日志](/private/tmp/t384-verify/candidate/golden.log) |
| 六完整接缝文件 | Goals dialogs 3/3、Goals terminal 4/4、desktop-tui 35/36、web-route-table 2/2、plugin-global-settings 16/16、security-invariants-plugin-pages 28/28；共88 pass、1 Grok CLI未安装skip，[完整日志](/private/tmp/t384-verify/candidate/seams.log) |
| 最终H完整Pages一次 | **4/4**、无skip/失败/重试，含长草稿、1440px、390px与冲突/只读路径，[日志](/private/tmp/t384-verify/final/pages.log)、[绑定](/private/tmp/t384-verify/final/pages-before.json) |

H0/R0具名66份完整HTML集合一致、逐字节相同，无缺失/额外/差异；原比较没有删script/style/JSON/ID或经markup归一化。另按原测试口径独立诊断：8条golden更新均只有准确`data-tui-terminals-route`属性、各+84；去掉该新增属性后匹配旧预期。见[比较原件](/private/tmp/t384-verify/raw-html-comparison.json)、[脚本](/private/tmp/t384-verify/compare.py)、[R0原始HTML](/private/tmp/t384-verify/reference/html)、[H0原始HTML](/private/tmp/t384-verify/candidate/html)。

本线实际核新旧 H/R/M：三端各自都只改变同一份Pages测试，承载相对main的完整diff逐字不变；最终H/R生产digest仍分别为`1daeedd8…`/`8db8b26b…`，由本线构建的fingerprint函数重新计算确认。[核抵原件](/private/tmp/t384-verify/final-delta-binding.json)保留完整值、父/tree、实际diff和干净状态。因此生产及未变测试证据沿原执行头核抵，**不改署成最终头重新执行**。最终Pages从新的独立H检出运行，仅复用本线H0的匹配构建，未重建生产、未修改旧检出；[复用记录](/private/tmp/t384-verify/final-build-reuse.json)、[最终生产绑定](/private/tmp/t384-verify/final/pages-build-binding.json)可复核。

## 合成、门禁与限制

四片投影、rename及全部不等blob已按Git对象自行重算；四次原片merge无手工remerge差异，T382仅已裁BACKLOG冲突。必填terminalsRoute、严格函数属性、真实路由/action@2/PTY链成立；相关安全输入未变范围沿原独立Mac来源，不重演旧四单或把Linux skip算Mac通过。详[合成核验](/private/tmp/t384-verify/projection-audit.json)、[静态绑定](/private/tmp/t384-verify/static-binding.json)、[逐片差异](/private/tmp/t384-verify/projection-diffs)。

作者H0四文件36/36（含entry exports 5/5）、boundary、health、导入图、API/actions非update快照已实读核抵，**保作者来源**，未重复；新M health沿作者最终原件。见[作者检查核验](/private/tmp/t384-verify/author-current-checks-audit.json)及[作者最终报告](/private/tmp/t384-evidence/REPORT.md)。本线另从自己的匹配构建实测48项served资源，共7,469,519B，与作者逐项大小/gzip相同；唯一增长workbench.js 1,150,291→1,150,615（+324B），准确命中现有许可，无预算写入。大小测量不等于资源内容逐字相同。[本线结果](/private/tmp/t384-verify/independent-results.json)、[资源原件](/private/tmp/t384-verify/candidate/resources.log)。

本轮构建/测试无失败、无重试、未放宽断言。Grok启动验证及两端录入钩子skip如上保留。作者控制比较/合并检查的失败恢复仍见[原记录](/private/tmp/t384-evidence/CHECK-ADJUSTMENTS.md)，不混成产品首败。旧T116/T143 Full首败、retry-only、T143生命周期900秒TIMEOUT及上游UNKNOWN均保留；本轮自然通过和T381/T383同步修复不消除历史未知。

所有运行实际持公共槽，jobs1/retries0/verbose，独立系统HOME/CFFIXED/XDG、file后端、专用Chrome/profile；期间holder与parent pid写入各阶段before/after原件。Foundation用户路径隔离，但原生NSTemporaryDirectory仍是系统路径，此限制未隐去。无真实Home/Keychain/真实模型、本机Full、GH写入或推送。

本次无残留运行进程/打开的测试临时文件；27个本线临时目录及三棵干净独立工作树已普通移除，公共槽已释放，原HTML/日志保留。[清理](/private/tmp/t384-verify/cleanup.json)、[清理前检查](/private/tmp/t384-verify/pre-cleanup.json)、[独立执行汇总](/private/tmp/t384-verify/pipeline-results.json)。作者两树未修改。现在可交根终审与后续发布，是否采用仍由根按同头§8证据裁定。

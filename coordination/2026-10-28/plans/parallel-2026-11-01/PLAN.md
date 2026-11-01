# 当前并行执行窗口

状态：2026-11-01 06:12Z，按一骏本轮提高后续任务并行程度的要求，根核fresh main与21个open PR后生效；解除旧材料仅因唯一writer形成的等待，不改变产品合同、审验分离或§8。

准确M=db29f18d4f602fa8d9efb689a6a766aa9b07625f。fresh #1680仍d37ec34c8498ab755bf9e34ba430e5648dacb0a8；其它旧open heads未变，仅新增T391文档PR。#1101同head复用已核584文件全表。四线生产/测试路径集合两两无交集，原件/private/tmp/root-parallel-paths-0614.json在临时证据目录。

| 线 | 作者；独立验证/二审 | 写入与依赖 |
| --- | --- | --- |
| T389 | 开发线2；验证线1/二审线4 | 原四client片段及永久测试 |
| T390 | 开发线1；验证线4/二审线1 | 原四路径，S103仅该行；已采用T369完整文件另核 |
| T116 PR1b | 开发线3；验证线5/二审线5 | 原44路径加frame-stage/factories两叶子；SDK/API窗口独占，T144继续等待 |
| T386 | 开发线4；验证线3/一审线2承担独立二审 | 原六路径；从开发线2明确交接 |

各线独立worktree、dist、依赖解析与临时Home；不改原作者树或他人分支。整机公共build/browser各一槽，必须使用machine-slot且不能以私有TMPDIR拆槽；本地不跑Full。同一树build与测试不可同时。源码准备并行，运行按槽排队。

共享文档仅交具体hunk：T390 S103；T386 S30与README由根串行采用已审patch；PR1b仅原privileges/边界hunk，不覆盖T121/#1672/保护PR其它行。各作者不得自行写page-assets预算或APPROVED_CEILINGS，先交准确M/H的48响应；根逐线给精确资源窗，兄弟补丁不能互相抵销或偷带。PR1b的公共API按最终源码生成，其后SDK工作继续等待。

根继续独自GH/push/Full/merge/协调。新main到来只核实际输入变化，有效证据不机械重跑。在途兄弟补丁不是已采用main。Full暂停按T389旧Linux问题另结；保护分支、真实Home/Keychain/模型/凭据禁区不变。

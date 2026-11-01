# T384 执行归属与最终核抵

| 阶段 | 准确输入 | 实际新执行 | 可沿用、未执行与限制 |
| --- | --- | --- | --- |
| 原四片合成及两自修 | M `328d5b612ef47214378ecd55e32a648228c120f3`；候选 `760c9b42ef6003ebeccf57f29e35630241bb6d52`；参照 `26a184bd47e572b95b4e28e302dcd474e2c574e5` | 两树匹配整体 build；参照独立 RECORD 68 pass；候选消费 67 pass/1 录制钩子 skip；66+66 完整 HTML、31,396,720B 每端逐字节相同；另六完整文件 88 pass/1 skip；门禁及48资源实测 | desktop-tui 的 Grok help 用例因 CLI 未安装 skip，未安装或试跑真实 CLI。金样 8 个变化去掉仅 T148 新增属性后复原全部旧 hash/length。原始测试和 view 始终冻结。 |
| 采用 T382 增量 | M `4b04947e7d17bbb046ca67e2ba0e2728fcd25ea6`；H `d9291973f6a9a534afabfc3681991b9eb15183e2`；R `1a4966bd3d5c9fdccb2d10a11fcb8fa6b90daa02` | 两端各自新匹配整体 build；H 四完整交点文件36/36；boundary/health/导入图/API/actions/48资源通过 | 两端各五个受影响 emitted 模块逐字比较，仅允许模块路径、来源注释及 sourcemap 文件名变化；核心渲染、原测试与夹具未变，因此保留上一行的真实执行头，不机械重录/重跑。BACKLOG 相邻删除经根精确裁定解决，六指定邻接行不变。 |
| T383 test-only main（当前冻结） | M `6729a2d4655caa603daa369f99884e09c4726bde`；H `4404e142662cbd7895f46c1c6df6e5efe5e6e135`，tree `ecf513543c29653e1be8eb44cf684efc14a3800d`；R `8214e9126158db285136af58d283b5e89d44d691`，tree `7dd31c5302603a5713fa8b9eda95d3ff975af730` | 两端正常无冲突 merge；都只改 `tests/pages-actions.e2e.test.ts`，14+/1−；重新计算两端生产 digest，均与各自旧 manifest 一致；新 M 的 health 实际运行 exit0 | 没有重新 build 或执行旧作者批。候选 digest 保持 `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`；参照保持 `8db8b26bcef29ed80ddaab64e8c49e870a6cc9e32af55c1659bfff29922041c7`。相对新 M 的完整 carrier patch 与上一阶段逐字节相同。Pages 未由 writer 运行，现在可由根交独立线5接入。 |

## 最终 boundary、合同和资源核抵

两端从上一阶段到当前阶段的全部 Git delta 都仅一份 Pages 测试正文。`check-package-boundaries.mjs` 及 package/registry/config 没有变化；其包扫描根为各包 `src/tooling/bin` 和桌面 launchers，读取的特定边界测试不含 Pages，Pages 的 import 也未变化。因此采用 `candidate-after-T382/boundary.raw` 的 exit0，不称本阶段新跑 boundary。API/actions 源码、快照、runtime/SDK、导入图、资源路由及构建资源均未变；48项实测仍署 d929 的原执行，7,469,519B，唯一 workbench.js 1,150,291→1,150,615（+324B）命中 T362 原许可。最终 M 的预算与上一 M 相同；未写资源账本/门禁。`current-checks.json` 明确区分新 health 与旧准确头的核抵项。

## 原四 PR 的失败和证据边界

T116 #1679 原 H `7977190e1889b8583310db2423788e88aff6be1d` 的 Full `41260457165` 成功包含 goals-dialogs 首轮失败后文件内 retry 通过。T143 #1675 原 H `420e6c7c8534e6a5bed27ff9f01d755dc7832841` 的 Full `41261014012` 16片及聚合成功包含 goals-dialogs 首轮失败、ui-client-lifecycle 首轮900秒 TIMEOUT，均仅 retry 通过；原原因 UNKNOWN 保留。不能用本地当前通过撤回这些首败，也不能把旧 aggregate success 写成当前承载 Full。本次没有核收 T362/T148 准确原头的 Full；普通 CI/SI 仍只署各自原头。

T143 旧独立 Mac signed-model 16/16、model 20/20 仍属旧来源，不算本次新跑；329文件和明确合同/终端差集的沿用边界见 `T143-inheritance.md`。作者合成/比较脚本的失败假设、数字退出码捕获限制、精确恢复见 `CHECK-ADJUSTMENTS.md`；本阶段 T383 两次 merge、digest 与 health 没有新增失败。

独立线5在上一冻结头的执行由根另核；本报告不转署、加计或预签其结果。当前 M/H/R 已冻结，后续 Pages、独立增量审验/二审、同头 CI/SI、新 Full、fresh secrets 与采用仍归根结算。没有 push/GH/CI/本机 Full，也没有触碰原四作者树、真实 Home/4207、Keychain、模型或凭据。

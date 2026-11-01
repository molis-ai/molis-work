# T141 加强二审准备（负责人：一审线2，本单二审 owner）

状态：已接受二审职责，当前只完成审查准备；作者开发线1正在实施，独立验证线4（T390 CI收尾后接），本单甲档无FIRST。尚无最终H/最终动态原件，不预签实现、审验或采用。根2026-11-01 07:01Z派发采用M=`08642dcb92dbdad029d990813da56682d6864a23`；若后续调整，最终审查绑定根交付的准确M/H/tree及实际差集。

唯一工程合同仍为 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-141.md` 与 `plans/T141/{PLAN.md,FINAL-REVIEW.md,secret-control-design.md}`；当前接续与窄审在 `plans/T141-current/`，现行窗口为 `plans/parallel-2026-11-01/NEXT-WINDOWS.md`。本线保留 `/private/tmp/t141-current-ready/REVIEW.md`，不重开已审方案或另建测试矩阵。本次读取的是根正在维护的本地未提交WO和窗口，不冒称已push。

## 最终审查输入与范围

等作者提供准确H/tree、scoped diff、构建绑定、原完整执行/失败/恢复/清理原件和验证4最终报告后，完成一次独立增量二审。原件按实际执行者与头引用，不把作者执行改署独立重跑，不因进入二审重复已有有效执行。

根现已交T141原15源码/测试路径（含七现有测试、一新增browser与两个fixture、五生产/文案文件）。#1672的OAuthGrant import/oauthOwner保持冻结，T141只取得attach队列体及相应测试，完整assertFree规则不改。T144三源码/一测试先归T141：Home installPackage、install-service confirm、settings load/review及security-invariants-plugin-install；lifecycle/version仅条件只读，确需扩写须有根的具体hunk决定。共享SI/README/slice/giant/预算仍由根串行采用。当前PR1b/T065等头已被根窗口更新，审最终输入不继续把前轮d5a1/df4d当唯一现行头。

最终核实际diff是否只含获准内容；保T143真实install_id的prompt登记/撤销和plugin source.origin处理、T401页面接线、#1701零start/零contribution/原holder可bind断言。原owner与根已有授权不重新索取；不自行放锁/派单或修改其它任务。

## 按原合同核结果，不新增矩阵

- **完整app升级（RAC2615）**：合法临时签包在签名前准备递增版本与compatibility；经公开preview/confirm升级，实际Runtime install_id/安装世代、数据与后续操作读回，新版本/批准/secretRef/提示词和restart一致；disabled升级不自动启动。拒绝或故障确实到达目标链，不把坏签名、缺compatibility或旧blanket refusal当补偿首红。
- **拒绝与一致性（RAC2616～2618及旧编号）**：actor/project/TTL/一次性消费、publisher/路径占用、same/lower/compatibility、跨scope、撤权/quarantine等保留原断言和实际副作用读回。RAC1506是当前版本再确认，不混成降级；RAC1507成功允许版本/批准变化但拒绝后完整快照不变；RAC1682 harness不代真实disabled未启动。用户rollback仍拒；确认预检零pin/save与合法v2保存后切换失败分开结论。
- **source升级与队列**：真实runner/pull、实际安装身份及T134连接owner保留；attach在原tail内parse/live→完整assertFree→同步release/declare/set，中间无await、不detach。新/删/同id变更的service/title/origins实际刷新，冲突前旧声明/entry/贡献保持；失败恢复旧Runtime/批准/提示词与旧live服务。disable/close/re-enable和旧bound晚回执按原deferred交错证明，无新业务写必须由真实owner消费/提交读回支持。
- **真实DOM（RAC2619）**：真实Host设置页/File输入/签包preview，初装及Home升级可见service/title/id/逐条精确HTTPS origins、Home旧新版本、中英文及项目对照。取消由产品DOM发生且零安装/升级；确认一次性preview后公开列表、Runtime新调用和registry/pull一致。textContent等安全文本不改成不可信HTML；JSON/隐藏HTML/手写DOM不代可见结果。
- **密钥受控factory层**：独立child先registerHooks再动态import真实Host/签包fixture，目标为同一built URL、同一真实context/controller/返回lifecycle；不得新增生产控制API、私取字段或复制模块。replacement/fresh的真实~home owner值与context结果交叉核，批准/Runtime/业务数据相互印证；空secrets不能证明stage/apply/restore。apply后真实expose失败、原值恢复/新增撤销、较新停启/直接值编辑保护按原书。provider观察是透传真实registerProvider返回同一disposer，非虚构订阅；先挂拒绝观察、arm/entered、真实停启、释放inspect后settle，finally释放全部屏障。此层是内部依赖受控验证，不冒称公开DOM输入密钥或完全黑盒。

以上对应既有完整文件和RAC，不固定/扩充case数量；原方案尚未运行的hook加载/ESM循环等由真实证据判断，不以静态可行冒作成功。发现当前必须修复的真实问题才退回具体路径/调用链，不重做全书。

## 原件、门禁与最终签署

核作者及验证4的准确执行头、完整文件命令/raw、构建source digest/实际依赖、原始首败/重试/skip/not-run、补偿触达点、UI证据和清理。原七现有测试及新browser按原合同完整执行；macOS/Seatbelt实际路径与Linux整文件排除/skip分列。缺必要原件或只验局部时保留未验证，不用Full绿背签Darwin升级/DOM。验证4报告是独立核验输入，二审仍读实际diff与关键raw，而不是仅据其结论通过。

所有测试包括非浏览器门禁需公共browser测试槽，build独占公共build槽；系统Home/config/cache及MolisHome隔离、file后端、null模型、ad-hoc、专用浏览器/profile、真实Home/Keychain/凭据禁区及本次pid/目录清理按原合同核。实际执行偏差单列事实与影响，不能靠重跑抹历史，也不凭假想风险扩流程。

最终共账配套核根准确许可/hunk：S80/S84及实际S95/S104分句不覆盖其它条款；slice仅本单状态/D1；giant只实测size与已有理由；资源按最终M/H真实Host serving响应测量，不借兄弟额度或预签0增长。boundary、merge-base health、imports与原合同必要检查绑定实际最终输入；若后续只有配套变化，按真实输入连续性决定可沿用范围，不机械重跑。

交付最终 `/private/tmp/t141-second/REPORT.md`：明确准确M/H/tree、当前must-fix或无must-fix、逐RAC已支持/缺证、作者/独立/二审来源及剩余边界。`full=true`保持；GH发布、Verify/适用SI/Full、实际main采用归根。二审通过不等于这些已完成，更不销PG011整体、BL916、真实Home或本人验收。

本线当前不启动build/test/browser、不改源码/refs/GH/协调或共账。R-A4/T392已转开发4、验证3/二审1，23dist补正及后续终审不由本线兼任；本次只写此PLAN。

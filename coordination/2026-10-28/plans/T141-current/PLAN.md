# T141 当前接续与窗口方案（负责人：开发线1）

状态：有限只读核对完成；完整实现可从指定已采用 M 接续，待根派发下列精确写窗口后进入执行。未改产品代码，未创建工作树或操作 refs，未 build/test/浏览器；不声称产品 Ready。原任务 full=true、不裁成 app-only；工程、独立验证、Full/CI、采用与本人验收分别结算。

本页只替换原工程书的过期等待与输入基准，不重写其矩阵。[原完整 PLAN](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T141/PLAN.md)、同目录 FINAL-REVIEW.md 与 secret-control-design.md 的其余范围、RAC2615–2619、补偿/密钥控制/真实 DOM 要求继续有效。新增测试和两个 fixture 仍按原候选范围由根一并派发；本页不是实施授权。

## 1. 冻结证据与结论

- 指定采用树 M：`08642dcb92dbdad029d990813da56682d6864a23`。仅读该 Git 对象，不把主检出文件当作 M。
- T143/T384：`15ad4f397018241c8b31625aff8014b89259f239`（#1712）是 M 祖先；#1701：`4b2f971a88a3143ae31d953b95f2749f4538692c` 亦是 M 祖先。原「等 T143」「等 #1701」都清除，不要求重新采用或重审整单。
- 使用根提供 `/tmp/root-open-0630.json` 的 20 个 open 头、`/tmp/root-parallel-paths-0614.json`，加当前 PR1b `d5a1ee558a622aa264d19da42921b3ab8aaa2d32`、T390/#1719 `b7eee1b15353b74c586da601d45418c403e0ff5f`。每头按 `merge-base(M,H)..H` 检查自身 diff；不是用落后头直接对 M，避免把 main 新增误作分支修改。没有 fetch/GH，不声称此刻远端无新头。
- #1101 全 584 路径与根的 `/tmp/root-1101-completefiles-0554.txt` 逐项相等，未用截断 API 文件名单；与 T141 必改/条件源码测试均无交集。#1059 亦无交集；保护分支不操作。
- 完整头、各 merge-base、15 条必改源码/测试路径、条件只读路径、共享候选交集见 [intersections.json](intersections.json)。其中 T144 完整测试列表的省略 `tests/` 写法已归一化，包含 `tests/security-invariants-plugin-install.test.ts` 的真实交集。

**结论：没有发现必须先采用 #1672、PR1b 或 T144 才能做完整 Home app/source 升级的技术依赖。原 registry 整文件 WAIT 过宽；真正待根决定的是 attach 写窗口与 T144 三处源码、一份测试的串行归属。**

## 2. M 上的实际输入变化与仍在的缺口

原书基准 `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` → M，在 T141 必改与条件集合里仅两文件变化（[adopted-input-delta.diff](adopted-input-delta.diff)）：

1. `apps/local-host/src/home-installed-plugins.ts:153–162`：`registerPrompts` 采用实际安装 ID；生成 registration 后对 plugin source 去掉 origin，撤销也用同一个 install_id。T141 必须保留这条已采用接线，旧 JSON promptScope 不恢复；测试期望按实际 current source/instructions/register/unregister 校验。模型与指令链继续使用 M 的现有实现，不抄旧基准。
2. `tests/integration-registry.test.ts`：#1701 的 RAC2447/RAC2787–2790，冲突时零 start/零 contribution、原服务/来源/owner 不变且旧 holder 仍能 bind。完整保留，在同文件追加升级回归。

四个缺口在 M 仍实际存在：confirm 第166行一律拒 Home 旧安装；Home installPackage 第197–202行仍只 install 并提前拒现有 record；registry attach 第74行附近对已有 attached 只换 entry 不刷新声明；settings load/review 第177–195行仅保留项目 current、未保存 Home 列表，review 不画 origins。preview 第119–123行已提供 runtime_scope 和各 service 精确 origins，所以本任务无需扩公开 preview 合同。

原方案仍适用：confirm 去掉 blanket refusal 并保留全部前检；Home 从真实 record 选择共用 install/upgrade；原 registry 队列内完整 assertFree 预检后同步 release/declare/set；settings 保存 Home 列表、按 scope 找旧版本、以安全文本 DOM 展示 service title/id/精确 HTTPS origins。禁用、信任、身份、兼容版本、同一安装、数据、来源更新与失败补偿都照原书验证；不改成 detach→attach，不新增 OAuth/document_import 能力。

## 3. 需要根交接的精确窗口

| 对象 | 实际 hunk 与交接边界 |
| --- | --- |
| #1672 registry，H=`ebcd6536cfec7a457802d1d87c24d2c4a242fda0` | 自身 diff 仅 OAuthGrant type import 与 `oauthOwner(serviceId, grant=authorization_code)` 按 grant 选 method；**没有改 attach/assertFree**，见 [1672-registry-only.diff](1672-registry-only.diff)。根将 `IntegrationRegistry.attach` 队列体及对应新增测试交 T141，保持 `assertFree` 的完整调用、不改其 OAuth 拒绝规则；oauthOwner/import 保留 #1672。无必要等待整个 #1672 采用。仍由根解除旧整文件锁，不由本线宣称无人持有。 |
| T144 Home | 同 `home-installed-plugins.ts`，T141 只改 `installPackage` 路由；T144 改 registerPrompts/完整 Agent definitions 注册与 forget。不同函数，但共享 lifecycle context 与升级后登记语义，建议同文件串行交接，禁止双 writer。T141 不提前实现 T144 注册。 |
| T144 安装服务 | 同 `plugin-install-service.ts`，T141 改 confirm 的 Home 拒绝与现有 preflight；T144 改 preview 的 agent_bodies 内容。不同方法可正常合并，但按一次冻结头交接，不互相搬旧版本。 |
| T144 设置 DOM | 同 `settings-plugins.ts:review`，T141 的 Home 旧版本/origins 与 T144 的角色/方法正文展示在同一实际渲染块，必须串行；T141 还改 load。根先交 T141 完整 load/review 窗口，再交 T144 在采用结果上追加正文。 |
| T144 共享测试 | `tests/security-invariants-plugin-install.test.ts` 整文件串行；保留双方拒绝断言，后写者运行合并后的完整文件。T144 的 lifecycle/version 是 T141 条件只读输入，若测试证明必须改，先报具体 hunk 给根，不借此预领写锁。 |
| 新增测试/fixture | 按原书交 `tests/plugin-trust-home-upgrade.e2e.test.ts`、`tests/fixtures/home-upgrade-source.ts`、`tests/fixtures/home-upgrade-lifecycle.mjs`；其余七份现有测试写集合见 intersections.json。现有 home-sandbox.ts 不改。 |

## 4. 其他在途头及共享文件

- 当前 PR1b 共46路径，与 T141 必改/条件集合无交集，不能把旧 #1680 的整包路径当当前 PR1b 锁。已读当前 SDK hunk：新增 page_routes 校验/导出，未修改 T141 的升级或 origins 合同。它改变共同消费的 manifest parser，因此将来若先采用它，T141 从新采用树重绑构建并按受影响签包/安装/DOM 完整文件验证；无需把 PR1b 预合进 T141 或等待它开工。
- #1719 当前5路径与 T141 必改/条件集合无交集，SI 仅 S-103，package.json 仅其测试脚本窗口；T390 保持冻结。W6/T386、Feed/T389 的根路径快照也无直接交集。
- 其余20头中除 #1672 外无必改/条件源码测试交集；完整每头证据在 JSON，不把同 README/预算文件等同于产品技术阻塞。
- SI：T141 仅 S-80/S-84 及实际涉及的 S-95/S-104 分句；T144 S-84/S-105 由根串行。#1669 的 S-95 增加 refresh token 写回前复查且更正测试标题；#1672 的 S-95 只去掉该标题的 Notion 前缀。T141 origins/升级相关文字不能覆盖这些 OAuth 句子。#1677/#1101 改 S-71，#1719 改 S-103，和本单无同条款冲突；#1673 的 SI 交集不含变更的 S 编号表行。
- accepted `pg011-pg017-remaining.md`：T141 只交 §3/D1 的当前状态与证据候选；T144 §7 由根分别合并。BACKLOG/privileges 归根，不自行清整行或关闭 PG011/BL916。
- README 只交本单实际必跑文件的开发要求增量；#1677/#1101 的 local-host、#1676/#1680/#1101 的 workbench 同文件修改不构成整文件停工，根按具体段落采用。
- giant-exceptions：#1101 没有修改 `openHomeInstalledPlugins` 条目；T141 只在实测需要时交该单元准确 size/既有理由候选，不拿整文件写权。
- page-assets/script：#1682/#1683/#1677/#1101 及其他 budget 交集由根在最终组合 build 后实测采用；#1683 含继承分支差异，不虚构独立第二份额度。T141 不预填0增长、不改 limits/baseline/门禁豁免；新资源或单资源增长 >10KB 按现行规则上交。这些都是结算窗口，不要求先采用所有在途 PR。

## 5. 推荐采用顺序与验证边界

1. 根在派发时复核 M 与上述冻结头有无变化，交 T141 原完整范围及第3节精确窗口；T144 暂不写三处共享源码及共享测试。#1672 的 oauthOwner 可维持冻结独立候选，根决定其正常合并顺序。
2. 开发线1从届时已采用 main 做完整 T141，保留 T143 接线与 #1701 断言。先核合法签包/隔离，再按原书主成功、真实失败补偿、registry stale 与真实 DOM 缺口取得有效红；完成 app+source+origins DOM 的同一交付，不先交 app-only。
3. T141 冻结后由根处理共享文档/资源候选，完成所需审查与采用；T144 接该采用结果改完整注册和正文预览。若根选择 T144 先行，也可行，但 T141 必须在其已采用树重新读 register/forget/lifecycle 与 review 实际 hunk，不能套回旧接线。无需二选一产品裁决，只需 writer 排序。
4. 原 full=true、原完整测试矩阵、测试 child 的真实 factory 透传捕获、source真实 runner/pull、RAC2619 File→预览可见DOM→取消/确认→读回均不缩减。registerHooks/loader 和受控密钥补偿仍是未执行设计，不能把静态核对当通过。
5. 执行时整机公共 build 槽一次整体构建；**所有测试（含无浏览器门禁）都进入公共 browser/test 槽**，隔离子进程后再设临时目录，避免分裂共享槽。专用浏览器/独立 profile、file secrets、null模型、临时系统配置边界沿原书，不访问真实 Home/Keychain。完整文件、jobs1、无 retry；本线不跑 Full，Full 由根按 full=true 安排。
6. 本次没有任何新运行证据；产品实现、工程验证、真实场景、Full/CI、独立二审与用户验收均未因此变绿。无需重新做已接受大矩阵或反复复核旧设计；只在实际新 diff/失败暴露必要变化时更新同一工程书。

交付：本 PLAN、intersections.json、采用输入差异与各交集 diff 均在本目录。只写这些临时证据；未改协调仓、代码、共享状态，未 fetch/push/PR/refs 或执行测试。

# T392 / R-A4 最小独立验证计划

状态：只读准备完成；验证 owner 为验证线3，作者开发线4，加强二审线1。等待作者最终 H/原件及根的必要执行授权。本轮仅写本计划，未构建、测试、建工作树、改源码/refs/GH/共账。T386 最终原件保持冻结，不重复核验。

合同：协调 `tasks/T-392.md`、`plans/T392/PLAN.md` 与 R1/R2 REVIEW，结合 `plans/T392-current/PLAN.md`、REVIEW 和 `plans/parallel-2026-11-01/NEXT-WINDOWS.md`。现行 WO 已解除旧 WAIT #1654，不能从历史书恢复等待。准确 M=`08642dcb92dbdad029d990813da56682d6864a23`，tree=`1a5141a207f7af8aeda53c70f5bba1e8b3daf6bd`，full=true；不消费在途 API。准备时作者 `/private/tmp/t392-dev` 的 HEAD 为 M、迁移正在 dirty 工作区实施，不以此暂态作最终差分或验收。

目标是行为不变的完整工程迁移，验收 RAC2843～2847（对应 RA4-01～05）。原 inventory/映射只作定位，不重建 152 文件矩阵；最终以 M→H 真实差分及按类型核对的活动引用为准。

## 1. 真实 rename 与唯一新实现入口（RAC2843/2847）

根交最终 H 后回读 parent/tree/dirty 和 scoped diff。对原 inventory.move_files 逐一核 M 旧路径→H 新路径的 Git rename、相似度与正文差异：37 项应为 Module 21、Workbench 11、Host 5，一一对应，旧源消失且无目的路径碰撞。不能只凭 `git mv` 描述或 R100 总数签证；有正文变化逐 hunk 区分必要 import/说明与业务改动。

核私有包 `@molis-ai/molis-work-module-functions`→`@molis-ai/molis-work-module-judgment-rules`：模块 package、根/Host dependency、registry、lock importer/link 同步，private/version/层/maturity/公开 contract 关联不变。检查最终实际依赖解析只到本树新包 dist，旧实现名无活动解析入口、alias、re-export 或 symlink 兜底。

沿用原 19 条 dist 映射并明确补齐 functions-plugin.test.ts 的四条：Host functions-http/routes、route-handlers；Workbench functions/ui、settings-ui，合计 23 条。逐条在 M/H 读取实际 import（含 type-only/动态导入），核新目标存在与旧目标不再解析。再对相关源码/测试/工具范围做一次分类窄搜，区分私有实现引用、相对源码/dist 引用与必须保留的公开合同/数据/历史字面量；不以全文 functions 零命中验收。

保留 M 已采用的 T143/T148 等业务差异；18 个已变化消费者不能用旧整文件回灌。#1101 只交旧→新路径图：移动 M 的 project-data 及私有 import，不能带入其未合 ProjectDeletionControl/assertCurrent/ownerOf 控制链。T141 的 15 必改路径按根窗口无交集，共享文档仍由根串行；不查询/修改保护分支来扩范围。

## 2. 稳定身份与逐源码 error owner（RAC2845/2847）

按 M→H 实际 diff 核保留：公开 contracts/modules/functions 源/subpath/导出/API；modulesFunctionsContract 与 descriptor/schemaVersion；函数符号、functions.* 动作/版本/schema/provider system.functions/权限/MCP 派生名；DOM/CSS/工厂、测试 basename；consumer/pluginId=functions、slotId/serviceId=typesafe；Home path=functions、DDL/baseline/版本，以及持久 snapshot owner=`modules/functions`。typesafe-connection 注释可换源码路径，以上身份不可随之替换。不允许新合同入口、兼容 alias、双读或数据迁移。

对 37 移动中的每个源码，使用 M 原配置的旧路径及最终 H 配置的新路径，依实际 error-owner 匹配逻辑逐项求 owner 并比较；先核匹配函数及优先顺序，不自行用字符串前缀猜。owner 必须仍与原值相等，尤其 functions 键与 contracts 原路径保留；error-owners 仅定位 glob 调整，不扩大归属或前缀规则。现有 looserOwnership 对 moved 文件的豁免不是通过证据。

读最终 API/actions 生成检查的实际结果和 git diff，预期零形状变化；静态快照只支持覆盖的公共形状，不能替代数据身份或行为验证。翻译仅换目录/词典定位，FUNCTIONS_EN 与算法不变。SSOT/主 spec/privileges/GLOSSARY/CALL-CHAINS/README/生成 owner 只核根串行采用的精确行，不能把文档写完成当运行证明。

## 3. 干净新产物与 snapshot 的有效反例（RAC2843/2845）

先核作者新树的构建前目录/依赖准备原件，证明没有复制旧 dist；最终整树匹配 build 的源码摘要、命令/退出码、H/tree/dirty 时点、模块真实解析、工作树内路径分别绑定。读新产物列表：旧 modules/functions、Host dist/functions-actions/host/http 与 functions-http/、Workbench dist/functions/ 不存在，新对应产物存在。仅 `tsc` 成功或作者称 clean 不足以排除旧输出遮蔽。构建前历史缺失时标出缺口，交根决定必要独立干净构建，不自行现在执行或删作者产物。

R2 必须在完整 home-snapshot-content 的真实 createHomeSnapshot 结果里，按独立固定 `path === "functions"` 找 store，先 assert 存在，再严格断言 `owner === "modules/functions"`，标 RAC2845/RA4-03；不能从 homeStores()/新目录推导期望。读完整测试，保留原真实 functions 库内容与 SQLite 完整性检查。

独立判断该断言的反例：若生产 home-stores owner 误改为新目录，旧 manifest-vs-registry 自比仍绿，新固定断言必须在实际 manifest 上失败；若库条目丢失/path 被改，存在性断言必须失败。优先核作者已有这类故障原件，需证明失败落在新业务断言，而非编译、导入或 setup，且恢复后匹配构建/完整文件通过。没有实际反例执行时只签静态敏感性分析，不冒称 mutant 已验证；确有疑点才向根给出这一个必要补执行建议，不做额外矩阵或只修改 JSON fixture 自证。Functions 当前 ordinary snapshot；不声明 sealed 恢复，也不读真实 Home。

## 4. README、业务、浏览器各自证据来源（RAC2844/2846）

先核作者最终原始输出，不重复已有效执行。每项记录准确执行 H/tree、构建输入、完整文件、case pass/fail/skip/cancel/retry 与来源；输入未变沿用有依据的旧证据，不能把旧执行日期/头改署成新头。默认 jobs1/retries0，失败原件保留。

| 必需覆盖 | 核证据与边界 |
| --- | --- |
| Module README 六完整文件 | functions-authoring-actions、functions-system-capability、functions-draft-retention、project-deletion-owners、functions-plugin、functions-choice-validation；验证草稿/发布/试跑/授权/取消/删除语义，不能只验证 import |
| 注册/持久化/生成规则 | scene-default-rules、home-store-baselines、home-snapshot-content、package-owners.test.mjs、translation-check；读取全文与实际结果，不能删断言或以门禁汇总替文件结果 |
| R1 五本机完整文件 | contextual-dock-parity、feed-capture-scenes、inbox-automatic-scenes、workflows-judgment-link、list-silent-refresh |
| R1 两浏览器完整文件 | home-offers.e2e、inbox-current.e2e；本地公共槽或根明确绑定最终准确 CI/Full 的实际执行原件，未运行为 HOLD，静态解析不核抵 |
| Workbench README/真实页面 | function-agent-authoring.e2e、capabilities-page、README 另列 functions-agent-references；复用重合文件不重复跑。核真实 Host 新产物编辑器，preview-functions 独立页面不代产品组合根 |
| 连接设置 | 改相关路径的 connectors-settings-behaviors 完整文件，并核真实设置适配/新产物加载来源。仅 typesafe 注释不扩连接业务矩阵；未来实际合入 #1677 后 connector-consumer-usages 属根的组合验证，不预取候选 |

README 其余适用要求按实际输入逐项注明本轮、有效旧来源或准确 CI；不能写“交 CI”却无实际文件执行。浏览器脚本/fixture先读，确认合成数据和明确本地模型模拟，不调用真实模型。页面/DOM/CSS/资源预期以 M 或固定内容为依据，不从 H 待测结果反推。读取截图与实际事件/HTTP/owner 结果以判断真实页面可加载和行为保持，截图或 DOM 存在不能独立代替完整操作。

## 5. 门禁、资源与执行许可

读取最终 frozen/offline 安装、matching 整体 build、boundary、merge-base health、test-import graph、diff、API/actions 零差异、affected-tests 原件。full=true 已由 WO 决定，不能用 affected full=[] 取消。资源对准确 M/H 的实际 Host serving 响应逐项 bytes/hash/键集合比较，解释测量是否网络 HTTP 或生成 response body；预期无新 URL/资源/行为，实际差异交根，不借 T386/T389/T065 ceiling 或别项减量抵销。

所有本机测试（含非浏览器门禁）必须公共 browser/test 槽；build 用公共 build 槽，不能用 build 槽替代测试槽。公共槽目录在隔离 TMPDIR 前取得并显式传给子进程；核真实外层持有及原始命令，不能只看环境自报。独立 HOME/CFFIXED/XDG/TMP/MolisHome、file secrets、adhoc、专用测试浏览器/profile，记录 native 临时目录实际边界与按 PID/profile 清理，不动真实 Home/4207/Keychain/凭据/模型/他人进程。本线本轮不占槽或执行。

最终 H/作者原件到齐后，只补确有缺口且根另授权的必要执行；不重复原矩阵、不本机 Full、不刷新 refs、不操作 GH/共账/保护分支。CI、Full、发布、实际 main 采用由根安排，后继仅授权普通 merge，不 rebase/force。源码/API/资源范围变化先交根具体差分，不自行修作者代码。

交付仍用 `/private/tmp/t392-verify/REPORT.md`：按 RAC2843～2847 记录已证/失败/未运行、来源与准确绑定，列少量真正缺口。工程迁移、真实测试覆盖、CI/Full、main 采用与用户验收分别结算。当前仅计划，不预签以上结果。

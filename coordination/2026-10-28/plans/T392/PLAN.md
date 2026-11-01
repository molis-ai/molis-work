# W5-14 R-A4：判断规则实现包与源码路径迁移技术书候选

状态：已按独立REVIEW的R1/R2补正，供根采用为工程WO；负责人待根分配，仍WAIT #1654，保护#1101不变。尚未改包/产品/coord、建工作树、改refs、写GH、构建或测试，不代表已取得writer窗口。

## 1. 当前结论与证据基点

**R-A4 未完成，建议作为一个原子迁移片实施。** 冻结 main `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3`（本地 origin/main 与只读 ls-remote 回读相同）；主检出仍旧 main 且干净，未修改。当前没有 `modules/judgment-rules`，实际仍为私有包 `@molis-ai/molis-work-module-functions`、`modules/functions`、Workbench `src/functions` 和 Host `functions-*`。

复用 `/tmp/codex-w6-closeout/REPORT.md`、`w6-06-deliverable-index-draft.md` 的结算边界后，补核当前 Git 原件：现存 W5-14 slice 是 **T-111 A5/A6** 的已合记录，不是 A4 已做；GLOSSARY §5 R-A4 仍列旧包/目录。协调 ESTIMATE:34/:158 的“待用户裁”是旧估计，:242 已明确 R-A4 是标识符迁移、不需再裁；R-B 已由 T-316 记入 R-C 保留。以上只作依据，不改协调文件。

目标等级：功能行为不变的完整工程迁移；生产组合、安装/构建、直接业务回归和资源/门禁均能在新路径工作，旧实现包不再存在。没有新 UI、规则、动作语义、真实 Home 搬动或用户验收要求。

## 2. 名称与事实来源：改什么、保留什么

术语语义唯一入口是 `docs/system/GLOSSARY.md` 的“判断规则”定义与 R-A4/R-C；workspace 包的路径、name、层、contract、maturity 的装配事实源是 `scripts/workspace-packages.mjs`（读取各包 package.json）。SSOT/CODEOWNERS 由既有脚本校验/生成，不另外建包清单。Home 库事实仍由模块的 `FUNCTIONS_HOME_STORE` 声明；运行数据不以源码目录猜身份。

| 对象 | 最小方案 | 理由/边界 |
| --- | --- | --- |
| 实现包 | `@molis-ai/molis-work-module-functions` → `@molis-ai/molis-work-module-judgment-rules` | 当前 `private:true`、version `0.0.0`，是 workspace 内部依赖，不是插件作者允许依赖的两个公开包之一；所有仓库消费者同片切换，不留旧包/alias/re-export |
| 模块目录 | `modules/functions` → `modules/judgment-rules` | git mv 完整包，代码职责/导出符号不变 |
| Workbench 目录 | `apps/workbench/src/functions/` → `.../judgment-rules/` | 界面仍显示“判断规则”，CSS/data 属性/客户端全局标识不变 |
| Host 源文件 | functions-actions.ts / functions-host.ts / functions-http.ts / functions-http/ → judgment-rules 对应前缀/目录 | 只换文件路径和 import/export-from 指向；`handleFunctionsHttp` 等现有导出符号不借本片另行改名 |
| 公开合同入口 | **保留** `@molis-ai/molis-work-contracts/modules/functions`、源文件与 API snapshot | R-A4 没有要求改这个公开 subpath；保留有效合同入口不是旧包兼容别名。不要创建第二个 `/modules/judgment-rules` 合同入口 |
| ContractDescriptor | 保留 `modulesFunctionsContract`、`io.molis.work.module.functions.v1`、schemaVersion | 合同身份不随实现包目录变化 |
| 动作与运行身份 | 保留 `functions.*`、`functions:manage/invoke`、provider `system.functions`、published prefix、`FUNCTIONS_PLUGIN_ID`、function_key、推荐/场景合同 | 现行 R-C/R-B2；MCP 名称、权限和固定版本引用不变 |
| 数据 | 保留 Home store path `functions`、现行 baseline/DDL/表列、TypeSafe consumer slot `functions` | 不改数据库文件/连接绑定/版本，不读真实 Home、不新增迁移 |
| Home snapshot owner | **保留字面量 `modules/functions`** | home-stores.ts的owner会被capture写入真实manifest，不是纯文件路径。Functions当前采用ordinary snapshot，没有Functions专属sealed payload；通用sealed分支虽用owner形成binding，不能据此宣称本片测过Functions密封恢复。保持owner不变，无旧→新映射或双读 |
| 其他函数符号/测试名/脚本 basename | 保留现有函数 API、`functions-*.test.ts`、preview-functions.mts 等有效入口名，仅改内部路径 | 本片不做全仓 functions→judgment-rules 字符串替换，也不扩到工作流模板转换或 JavaScript function |

版本判断：上述最小方案没有公开合同签名、动作形状/含义、provider/权限/Manifest/存储变化，所以不升动作 version、不升 schema/库版本，不为 private workspace rename 擅改产品版本号。`pnpm api:update` 和 `pnpm actions:update` 应无形状差异。若要连公开合同 subpath、导出符号、snapshot owner、MCP/动作/权限或库名一起改，是另一范围；须先给根具体消费者/合同差集，不能靠刷新快照吞掉。真正改变外部 MCP 等在用名字才是另需用户产品决定；当前最小方案没有新的产品待决项。

## 3. 实际规模与允许改动地图

`inventory.json` 是当前 Git 树的完整命中清单，含类别；不是最终获准写入 manifest。术语表“15源码/20测试”已过时：旧实现包名现命中59文件，其中17个生产/工具 TS类文件、29个 tests 文件，其余为清单/文档。module物理路径与保留的 contracts subpath 会有文本重叠，不能把111条 module_path 命中全改。补查相对 import 得24处/18文件，见 `relative-imports.txt`。

**确定要移动37个 tracked 路径：**模块21（17源码+package/README/tsconfig/LICENSE）、Workbench11（10源码+README）、Host5（3个顶层+2个HTTP目录文件）。清单逐项在 inventory.move_files，旧/新一一对应，不拆职责、不重写函数。

还有源码/测试/工具/活文档引用要随之更新。原143文件并集遗漏活动dist消费者，已补为152文件：新增REVIEW指出的7测试、LOCAL-HOST目录文档及RA4-03需修改的home-snapshot-content测试。补查源为本地已存在main对象 `0b8571fae60333c17dee332906cd9b6a31390795`，不冒充本轮远端最新头。完整分类、19处活动dist导入的旧→新路径及9个新增文件见inventory.json的review_supplement/active_dist_import_mappings；relative-imports.txt同步补充。并集是分类审阅材料，不是执行上界或152文件替换授权。最终writer逐引用冻结scoped diff，禁止改历史/合同值追求零字符串。

R1的7个漏项必须同原子切换：contextual-dock-parity、feed-capture-scenes、home-offers.e2e、inbox-automatic-scenes、inbox-current.e2e、workflows-judgment-link均把`../apps/local-host/dist/functions-host.js`改为`../apps/local-host/dist/judgment-rules-host.js`；list-silent-refresh把`../apps/workbench/dist/functions/client.js`改为`../apps/workbench/dist/judgment-rules/client.js`。保留符号、type-only属性、basename、fixture业务值及全部断言。LOCAL-HOST.md:82现行子系统目录functions-http/改为judgment-rules-http/；固定SHA与历史审读引用不改。

关键消费者与同步点：

- 旧实现包的14个 Host 消费文件：contextual/contextual-http、functions-actions/host/http、functions-http/route-handlers、home-actions、home-stores、local-owner-permissions、plugin-installation-cleanup、plugin-judgments-service、project-deleted-owners、scene-rule-admission、typesafe-prologue、web-capabilities（其中部分路径在移动组）。只换 implementation import；同文件的 contracts/modules/functions import 和稳定 owner/slot 值保留。
- Host 相对 import/export：index、project-host、home-dock-http、web-catalog-routes/settings、web-project-platform-routes 等，完整清单见 relative-imports。
- Workbench：i18n/en、page-assets、scripts/capabilities-client、scripts/settings、settings-connectors、settings-renderer、settings-view 等相对 import/type import。
- 依赖与装配：模块 package.json.name、根 package.json 与 apps/local-host/package.json 的 workspace 依赖、pnpm-lock.yaml importer/link、scripts/workspace-packages.mjs 的模块 path 与 local-host extraWorkspaceDependencies。目录 globs会发现新包，不另加第二注册；entry 的 contract 字段仍是现行公开 functions subpath。
- 工具：preview-functions.mts、contextual-slice/jev.mts、活跃 benchmark fixture、直接源码/dist导入测试及路径扫描用例（如 scene-default-rules）更新物理路径。tests/fixtures/home-store-schemas/functions.sql 等业务 fixture 名和值不改。
- 结构门禁/元数据：translations.mjs 的词典路径与目录归属分支同步到 judgment-rules，规则算法不变；error-owners.json 把实现路径匹配换到新路径，**owner键仍 functions、contract旧路径仍保留**。不放宽前缀规则、不把其他包纳入 owner。
- SSOT-MATRIX 的模块/Workbench两行、GLOSSARY定义/R-A4状态、模块/Workbench README、Architecture/Package-boundaries/Call-chains/Home-data等实际引用同步；主防腐 spec §5.1 包清单用既有 package-inventory 生成正确新行，保留事实归属/成熟度。package-owners --write 更新现有生成处（若无CODEOWNERS差异则不造差异）。只改确需跟新物理路径的活文档，不改历史结论。

命名清理的拒绝边界：源码目录/私有包旧名应无活动解析消费者；公开 contracts/modules/functions、数据/slot/snapshot owner、R-C、历史描述仍可以且必须出现 functions。旧名是否消失用**类型化清单**核对，不以全文字符串零命中作验收。

## 4. 当前并行锁与顺序

书审补正的交集在review-gap-locks.json：使用已存在的完整分页快照`/private/tmp/t116-successor-plan/locks.json`对补全152路径重新求交，保存每个命中PR的准确head/路径。本轮没有GitHub刷新，不把旧36/open_count或复用快照当开工时排他锁。原locks.json保留历史，不伪造fresh状态；根仍须先解决#1654调度，再回读最终main/head/dirty和实际锁，安排单writer及共享hunk。#1101不进入、不改、不cherry-pick、不抢锁，其owner按根旧→新路径图接续。

`locks.json` 保存36个 open PR 快照：复用此前33个**准确head未变**的完整文件清单，只刷新新增#1703/1704/1705；#1101采用584行全分页原件而非默认100条。当前迁移影响集合是宽候选上界，因此 locks 的文档交集未必都最终写；执行前按最后 scoped 清单/新main重核。

必须根串行安排的具体重叠：

- #1682/#1683：pnpm-lock.yaml、workspace-packages；#1679：workspace-packages、SSOT；#1654：workspace-packages、error-owners、giant-exceptions等。不要同时重生锁文件/覆盖表。
- #1664：error-owners及部分系统路径文档；#1672/#1669：根package.json、连接设置测试与Call-chains等；#1675：plugin-installation-cleanup。保留对方业务变化，只搬/改本片引用。
- #1101保护分支与本片直接相交模块project-data、Host project-deleted-owners、部分functions测试，以及锁/注册表等。**不进入、不修改、不cherry-pick、不解除该分支保护**；根决定主线迁移窗口并把旧→新路径图交其owner，未合代码由原owner未来按新路径接续。共享路径不能据“只是改名”抢锁。
- Root/主防腐spec/SSOT/GLOSSARY等共享状态由根串行收，writer可交精确old/new差集。没有必要因同名词给所有W5任务建立假依赖；只以上述真实文件/合同输入定顺序。

推荐先让已就绪的注册表/锁文件变更落main，再冻结迁移基点一次完成；不预造长链stack。若根决定提前做，明确单writer的短窗口及各共享hunk的整合owner。实施前重新只读核 PR head/main/dirty/锁，禁止按此旧快照长期占锁。

## 5. 实施步骤（候选，尚未执行）

1. 根将本书接受为任务/分配owner与验收号；从执行时最新已批准main创建自有树，冻结base/head/tree和允许路径。没有关键产品待决则不反复问用户。不要把已完成T-111 slice改成A4运行日志；用独立短spec/accepted WO。
2. 对37路径 git mv，修改新模块package名、workspace注册/依赖及所有实现/相对引用。保持代码体、导出符号、wire值和URL不变，特别排除snapshot owner与TypeSafe slot。
3. 离线重算 lockfile（只元数据的 --lockfile-only --offline），随后 frozen/offline install。更新翻译路径/错误owner匹配、生成owner/包清单的必要行；无新依赖或兼容层。
4. `node scripts/package-owners.mjs --write`、`node scripts/gates/package-inventory.mjs --table` 按项目流程更新相关生成处；根处理共享总表。活文档仅同步新物理路径与A4实际状态。API/动作快照预计零变化。
5. 整体matching build一次后做下述定向。文件迁移已有门禁支持：check-health-gates.mjs 使用 git diff -M 和 rekey转移旧文件/单元计数，不用新增例外或放宽门禁。需让git真实识别为rename，避免无关重构破坏相似度；baseline快查仅在merge-base门禁通过后按既有--update更新，不手改计数。当前giant-exceptions没有functions条目，若新基点出现则只转key、保持实际size/理由，不加额度。
6. 最终按实际diff核依赖方向、无旧实现包解析入口、稳定值没变、没有跨包读表/数据搬迁。原子PR交根进行独立审验/CI/Full；不在主树或真实Home尝试验证迁移。

## 6. 验收与验证分工

以下为候选本书编号，根可分配正式RAC后等价替换，不占用coord号段。

| 验收 | 可观察结果与证明 |
| --- | --- |
| RA4-01 | 新实现包是唯一workspace装配入口，旧包/目录移除；所有活动实现import解析到新包，旧实现名没有alias/re-export。frozen安装、workspace build及依赖边界通过 |
| RA4-02 | 规则草稿/发布/试跑/授权/取消拒绝、项目删除及声明规则生命周期行为相同；现有完整业务用例通过，未改断言/fixture业务值 |
| RA4-03 | 公开合同/API、动作版本/provider/schema/权限及Home库path/baseline/TypeSafe slot/snapshot owner保持现行值。API/actions零差异；在现有home-snapshot-content的真实createHomeSnapshot用例，读取实际manifest，找到path为独立字面量functions的store，必须明确断言存在且owner严格等于独立固定字面量modules/functions，并标RA4-03。不得用homeStores()推导期望；保留现有functions库内容、SQLite完整性校验。不验证不存在的Functions sealed恢复，不碰真实库 |
| RA4-04 | Workbench编辑器/连接设置在真实Host新产物可加载，页面资源无意外新增或行为变化；专用浏览器定向完成，字体/CSS/DOM身份不改 |
| RA4-05 | 注册表/SSOT/归属/包清单/翻译词典/错误owner及活引用一致；merge-base health/boundary/test-imports/page-assets通过。明确保留合同/数据/历史词的原因，不改门禁算法 |

建议本机必要范围由根核定后执行，不能从目录改名扩为全仓测试：

- 先整体 `pnpm build`（公共build槽，offline安装、adhoc、独立MolisHome/file后端）。模块README六个完整文件：functions-authoring-actions、functions-system-capability、functions-draft-retention、project-deletion-owners、functions-plugin、functions-choice-validation。
- 补与包路径/注册直接相关的scene-default-rules、home-store-baselines，以及完整home-snapshot-content文件。RA4-03必须新增上述独立字面量断言，现有manifest与homeStores自比不能核抵；不另建框架/fixture schema/manifest。Typesafe consumer/连接绑定有新diff才加对应完整现有用例。
- 完整运行`tests/package-owners.test.mjs`（128～145行原SSOT路径断言随迁移同步）与`tests/translation-check.test.ts`（628～635行词典fixture/错误归属路径同步），不删断言、不只笼统交未知CI。
- R1新增7文件逐项安排：contextual-dock-parity、feed-capture-scenes、inbox-automatic-scenes、workflows-judgment-link、list-silent-refresh五个完整文件列本机定向；home-offers.e2e、inbox-current.e2e两个完整浏览器文件经公共browser槽执行或由根明确绑定最终准确头CI/Full原件。任一路未运行单列HOLD，不因贵或已通过静态导入而略去。所有加载验证使用新建隔离树/匹配build，旧dist文件不得带入；否则移走源码后仍残留旧dist会遮蔽漏项。
- Workbench原README真实浏览器入口 function-agent-authoring.e2e，加capabilities-page的必要完整覆盖；若最终diff触及连接设置适配则加connectors-settings-behaviors。只用专用浏览器、独立profile/Home、jobs1，无真模型/外部凭据；浏览器文件需实际读fixture后启动。
- `pnpm boundary:check`；merge-base `node scripts/check-health-gates.mjs --base <frozen>`；`node scripts/test-imports.mjs --check --chains`；matching build后 `pnpm api:update` / `pnpm actions:update` 核应零差异；matching workspace资源 `pnpm page-assets:check`；diff check。纯rename不以重新生成动作/API差异作为“正常”。
- 最终 `affected-tests --base <frozen> --json` 给实际packages/full；本片跨Module/Host/Workbench及装配，预计需根整合CI/Full，不能预写full=false或本机Full。README其余适用必跑与广泛建议逐项分给准确CI/Full/既有有效来源，不把152文件引用候选集合当作必须全跑的测试名单。推送仅后续获授权时按流程fetch/secrets，当前无推送。

资源原则：不新增URL/资源，保留functions DOM/CSS/工厂名，预计served资产可等价。若实测字节因构建路径/注释变化而增加，给根准确资产/字节/必要性，按现行page-assets窗口处理；不主动加额度、不搬到未计量文件，更不为rename引入压缩重构。

## 7. 回滚、停止与未决边界

同片完成37移动与全部必需消费者/注册更新，避免新旧包并存。若尚未合并，撤回仅本次独立树；若已合并且确需回滚，由根整体revert该迁移提交/恢复匹配构建即可，没有数据反迁移或旧值读取逻辑。其他任务后来基于新路径的提交必须由根在回滚前审依赖。

以下只停对应扩范围步骤：发现稳定wire值必须改、出现旧公开包确有外部使用的事实、owner字段必须随目录变更、需要门禁规则放宽、受保护路径无窗口、动作/API实质变化或资源超现行阈值。先给根精确差集和原证据，不擅加compat，不把迁移难度当产品决定。当前已识别的snapshot owner可直接保持，故不必为最小方案新问用户。

交付应列准确base/head/tree、rename清单/消费者清单、保留合同值、定向pass/fail/skip/notrun及CI/Full来源、资源实测、共享表old/new和清理。工程通过、主线采用、真实Home与用户认可分账。本轮仅交技术书和盘点原件，所有上述命令尚未执行。

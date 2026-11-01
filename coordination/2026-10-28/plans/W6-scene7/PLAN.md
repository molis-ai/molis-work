# W6-05 原场景7：Todo 两项目隔离执行计划

负责人：Codex 验证线3。状态：**只读准备完成，尚未执行**。本书只落实 `specs/archive/post-merge-review/spec.md` §5 场景7，不新增场景、测试矩阵或验收编号，不改W6-06和交付索引。根读后可排下面的一条正常用户链；不需要把T377或所有W5后继都作为其前置。

冻结读取E=`b6f92222fce89dfba756a580768889292cfe9967`，tree=`a93880d7fceabb2d2ed57d2524ecefe1aec86ac9`。源码依据均从该Git对象读取；主检出已另有前进，本线未跟随其移动、未fetch/切分支/建树。执行前由根指定仍用E或另一个已采用头，再核实际增量及匹配构建；本计划不预采用候选分支。

## 1. 最小范围与现行语义

只选 **Todo**：两个全新合成项目A/B、A内一件待办X、B内一件对照待办Y；同一X经真正放置面板 **A→个人空间→A**。在三个状态里检查A/B默认列表、项目/个人搜索、搜索打开及受限调用，结束时刷新页面并再次打开。X/Y用本次唯一短标题和不同说明文字，无真实资料、日期提醒、模型、Feed来源、Goal绑定或外部账号。

原场景7的约束保留：A的项目待办不在B默认范围；移到个人后两项目默认范围都能见、个人搜索能找到；移回A后B默认范围不再见。当前accepted合同补充了本人“所有项目”能力，不能把原句理解成“本人在B永远不能按id读取A的待办”。

- 本人默认 `todo.items.list` 按当前项目＋个人/暂未归类；`all_projects=true` 只按Host注入的 `readable_project_ids` 放行。本人 `todo.items.get` 可用这份清单跨项目读取，属于正控，不报越权。
- `todo.item.subject.read` 在项目上下文中仍按该项目读取；只有本人Home/个人空间的reader能借Host清单读取项目待办。搜索来源按项目与个人分别登记，搜索打开也重新核来源/reader；搜索的 `scope=all` 是当前项目＋个人，不是所有项目。
- 受限调用由真实Host/gateway签发并按实际授权读取，没有本人跨项目清单。它在B读取A的X应拒绝；X成为个人待办时，在已授予Todo读取的A/B上下文可读；移回A后B再次拒绝。个人Todo不是“只允许本人读”的新隐私层，沿原授权合同，不把Pages分区移动文案套给Todo。

不扩做跨A/B直接搬移、复制、关联Goal、撤销矩阵、插件停用/升级、强杀恢复或权限变更竞态。Y只作B有效访问的正控，证明B空结果不是插件未启用/没权限/来源失败。

## 2. 实际入口、调用链与事实owner

| 层 | E的实际路径与责任 |
| --- | --- |
| Todo页面 | `plugins/native/todo/src/ui.ts` 的 `[data-placement-slot][data-placement-scope=home]`；`browser/page.ts` 声明当前X的 `data-assistant-context`；通过已采用的iframe桥显示放置条。使用真正条上的“移到…”→选择个人/A→“移动”。详情里的 `[data-todo-placement]` 是另一条更新入口，本次不拿它替代放置面板。 |
| 工作台放置 | `apps/workbench/src/scripts/client/placement.ts` 的 `moveOrCopy`：真实点击→flush→POST `/api/placement/move`（在项目页按host.route带项目前缀）→成功后由生产代码发 `molis:placement-changed`。`browser/plugin-frame/placement.ts` 负责框架桥。不得测试端手派这个事件或调用Store.move来代替用户移动。 |
| Host及服务 | `apps/local-host/src/placement-http.ts`→`placementActions.move`，身份取绑定的本人context；`placement-actions.ts`/`placement-call.ts`装配 `horizontal/placement/src/index.ts`。Todo对象是 `{kind:todo_item,id:X,project_id:null}`，走 `moveHome`，经目录发现 `todo.placement.move@1`，不是搬项目SQLite文件。目标个人空间用现行 `personal` id。 |
| Todo owner | `plugins/native/todo/src/actions.ts`→`store-writes.ts`→`store-support.ts`，Runtime `services.database.transaction` 内实际更新Todo库。`TODO_DATABASE`/`TODO_HOME_STORE`和Todo包是唯一owner：`todo_items` 同一个id、placement/project_id/revision；`todo_changes` 的前后值。A→个人是 `personal/null`，个人→A是 `project/A`，不是多造一件X。 |
| 放置事实 | Placement只拥有位置关系/来源记录和标题缓存，其 `describe` 重新问对象owner。成功返回中Home对象的 `object.project_id` 仍可为null；应核 `location`、`open` 及Todo事实，不能误拿这个null当作没移成功。 |
| 搜索 | `plugins/native/todo/src/search.ts` 的个人 `todo.search.entries`、项目 `todo.search.project_entries`、`todo.item.subject.read`→`horizontal/search/src/index.ts`；UI `apps/workbench/src/scripts/client/global-search.ts`→`search-http.ts`→`search.query/open`。查询范围、来源健康、hit id、subject id与打开定位同时看，不能只看结果条数。 |
| 身份与项目 | Todo Manifest route→`plugin.ts`的 `bindPluginActionRoute`；HTTP body中的project_id被丢弃，当前项目来自 `/projects/<id>/…` 路径。本人reach由Host/Runtime给，不在客户端伪造。 |

观察持久结果优先用项目/个人公开Todo GET及历史返回，另以**独立只读连接＋Todo包公开 `TodoStore.get/history`**读取同一个 `TODO_HOME_STORE`：只提供get/all适配，run拒绝，不执行schema/PRAGMA/update/move，不从旁路写入。本次只读验盘，不为证明持久性加Host重启（那是场景8）。每次owner读回后再刷新UI/重新搜索打开，确认同一id和内容，不以放置toast代替落库。

## 3. 已有完整文件能证明什么、还缺什么

| 已有完整文件/来源 | 可复用的实际覆盖 | 对本次场景的局限与安排 |
| --- | --- | --- |
| 原post-merge-review §5第7行 | 旧隔离Home的A/个人/A可见性记录，修复PMR-16后通过 | 属旧运行，不是E执行；没有当前完整raw/绑定不能重签E绿。保留历史来源。 |
| `tests/todo-actions.test.ts` | 真实ActionService＋Todo owner库；scope、S74、reader/search source、Home mover、同id/历史/撤销、受众拒绝 | fixture自行组caller/reach，并非真实Host赋权/浏览器操作。本次按原文件读了上述分支，没有执行记录可认作E实跑。它是必要时最小完整动作回归候选，不先自动重跑。 |
| `tests/system-search.test.ts` | 真SearchService/索引；Todo真实handlers段验证个人/项目源；跨项目/缺reader拒绝、open重核 | 授权及部分source由fixture构造，无真实移动面板后的完整往返。必要时与上文件配成两完整文件定向批，不能只筛那两条case。 |
| `tests/todo-placement.e2e.test.ts` | UI收到移动事件后列表/详情离开与保留 | **直接Store.move＋测试派事件**，只核抵局部刷新；重跑它仍填不了本次缺口。不把标题“placement panel”当真实面板点击证据。 |
| `tests/todo-plugin.test.ts` | 真Host HTTP路由、项目来源过滤、本人读取与默认list边界 | 没有完整两项目移动/搜索UI链。用于入口参考，不为准备阶段额外跑。 |
| `tests/work-placement.e2e.test.ts` / `work-placement-journeys.e2e.test.ts` | 已有真实放置条/弹窗/确认和刷新动作的用法 | 核心对象是Pages；并非本场景Todo，也涉及额外路径。借交互方法，不整批引入。 |
| `tests/system-search-host.test.ts` / `security-invariants-project-reach.test.ts` | 真Host、公开管理入口、目录/reader、Host给reach的实现与已有测试 | 覆盖多个插件或项目删除等更广范围，场景7无须整套重演；不以这些文件存在代替原运行。 |

**本次首先补一条真实交互记录，不新增入库测试、不先跑上面六套。** 如果根已有准确头的完整文件原件就按未变范围核抵；没有也不虚称已通过。最小执行本身在同一个Host/同一个X上串接真实UI→公开动作→owner持久读→两端受限调用与搜索；它已直接覆盖缺口。若出现失败，先固定该步原件/当前调用链，根再决定是否用上述两完整文件定位；不自动追加矩阵。需要跑时只用公共browser槽、`node scripts/run-tests.mjs --jobs 1 tests/todo-actions.test.ts tests/system-search.test.ts`，retries=0，本机不Full。

T122的23/23仍只绑定77头及其已核抵范围，和本场景无直接覆盖关系；不借用、不重跑。

## 4. 一次可排的真实操作顺序

先用现有公共test-kit/`tests/fixtures/test-home.ts`的公开项目管理HTTP创建两个合成项目并启用Todo；用既有ChromeHarness/iframe驱动接同一个临时Host，`completeText:null`。不用demo seed替换项目库、不设 `catalogPolicy:false`。受限调用复用现有 `inspect/grant/mcp` 路径：两个本次临时client分别绑定A/B，经公开设置入口授予目录中实际存在的Todo get、subject、个人/本项目entries以及search.query/open；必要依赖按现有grant工具解析。不得自填 `readable_project_ids` 或绕到裸ActionService。授权设置完成后A读X/B读Y正控必须先成立，设置失败不能记作跨项目拒绝。

1. **真实建立X/Y和初态。** 在A Todo用快速输入创建X，明确选择“当前项目”，view切“全部进行中”，保存唯一标题/说明；B建Y。记录实际HTTP成功及owner读回id/placement/project_id/revision/history。用工作台现有项目选择入口切A/B，确认当前URL/项目标题、Todo“所有项目”关闭；初始A含X不含Y、B含Y不含X。不能用手改DOM/列表状态完成切换；必要定位用当前实际可见入口，不预写不存在的selector。
2. **初态搜索与拒绝。** 在A ⌘K搜X，选“项目”，来源ready/结果完成后唯一hit.subject.id=X，真实点击打开X详情并核标题/说明/id。保留这个真实hit id，用B当前项目HTTP `/projects/B/api/search/open` 打开它，应 `state=unavailable`（跨项目结果）；B“项目”或默认搜索不含X、B仍能搜开Y。受限B通过gateway调用 `todo.items.get` 和 `todo.item.subject.read` 读X均拒绝 `todo.not_found`，受限A读X成功。这里不要求本人B的 `todo.items.get(X)`拒绝，当前合同允许；必要时用它作本人reach正控。
3. **A→个人，真面板。** 打开X的放置条，点“移到…”、个人空间、确认“移动”；不得直接HTTP执行移动来冒充UI。抓生产请求及响应，等真实刷新。核X id/标题/说明不变、`placement=personal, project_id=null`、revision前进且只有该次位置更新，history前后值准确；Placement.describe位置为个人。只读owner连接核相同落盘结果。
4. **个人状态两端可见。** 通过真实项目切换，A/B默认Todo都含X，Y仍仅在B默认列表。两端搜索“个人”都能找到同一X，项目限定不应把X算项目内容；从个人搜索真实点开X，详情内容/id一致。受限A/B在已有Todo读取授权下都可get/subject读X，B可用它自己的个人hit open成功；记录这一合法可见范围，不宣称个人Todo对所有非本人不可见。
5. **个人→A，真面板。** 回X放置条“移到…”→A→“移动”。再次核生产请求、owner同id `project/A`、revision/history与Placement.describe。A默认列表/项目搜索可见并真实点击打开；B默认列表/新查询不含X、Y正控仍成功。B重用第2步的A项目hit，应 `unavailable`；受限B的get/subject再拒绝。B重用第4步个人hit也不得成功返回X的内容；当前SearchService可能按owner列举给 `missing`，不能强行要求都为403。只将 `missing/unavailable` 非成功、无内容泄漏记为拒绝，原始实际返回保留，Todo磁盘X仍在A，不能写成X被删除。
6. **刷新与收尾。** 重新加载A/B，复查各自默认列表及新搜索打开；只读owner最后读X在A、Y在B且没有重复X，取两次移动的真实history。保留足够截图/响应/拒绝码证明上述三状态，不额外做全宽度/语言/主题矩阵。关闭本次Chrome/Host/网关连接、只清本次profile/Home与pid；保留脱敏日志和截图，异常保留首败并停止该依赖步骤，不以补事件/反复点击/换Store写入补绿。

搜索有正常异步索引：等实际status/source健康到可判定状态，记录起止与响应；不以“请求完成但来源failed/partial、hits=[]”证明权限拒绝。不擅自改生产freshMs/重建索引/修改结果，界面正常刷新不算自动重试失败case。若第一次真实移动或加载失败，保留证据交根，不另开同样运行碰运气。

## 5. 当前交集与真正依赖

本轮GitHub只读回读24个开放PR，全部调用分页文件列表；原件 `open-pr-files.json`。这是文件交集快照，不等于作者此刻在写，也不替根的机器槽/写者窗口裁决。执行不改这些文件，冻结E可避免污染作者树。

| 在途项 | 与本链的实际交集 | 排期判断 |
| --- | --- | --- |
| T353-C #1683 | `plugins/native/todo/src/actions.ts` | 已读实际patch：仅fragment offer的request_id截取改cutHead及import；本次走手动create/move/list/get/reader，不消费fragment offer。**同文件但无本次行为差集，不必等它合入**；E后续采用时仍核该文件增量，不能称整文件无变。 |
| T377 #1707（本轮回读OPEN、未merge，H=95ea9f1f6f0126fc81feea9c78dce4e1dbb54823） | deferred-plugin-client/documents-state/navigation-feed三共享外壳文件；Todo正常挂载会经过同壳 | **正常首次加载/正常项目切换/移动/搜索不以T377为前置**。真正依赖它的是“加载失败后的同标签重开/真实retry及后台恢复同失败面”结论，不属于本次场景7新增步骤；若执行遭遇该失败并阻断正常入口，只暂停UI剩余部分，保留已完成的公开动作/磁盘证据，待正式采用后补真实UI，不预采修复。 |
| T116 PR1a #1679 | immersive-shell/renderer/shell-page-renderer/ui-composition | Goals绘制迁移共享外壳；本次不点Goals或造Goal，无行为必需前置。若根将共享壳当前运行窗口保留给它，则API/owner部分先排，UI只等同一槽/实际锁，不等整W5。 |
| T116 PR1b #1680；T402后继 | 前者renderer/ui-composition；协调书明确T402还会改shell-page-renderer/web-request等，Feed/Inbox舞台等T116 | 本次Todo已通过现行Manifest/Runtime装配，不使用其新Goals路由、Feed/Inbox舞台。**均非此最小链必需前置**；最终F若更换同壳，核挂载/导航实际差异补受影响步。 |
| T148 #1654 / T299 #1671 | web-project-platform-routes / immersive-shell | 共用路由文件/外壳说明交集；不含Todo移动服务及搜索owner实现。只冻已采用E，执行前根核最新实际diff；不因同文件就要求整条terminal后继完成。 |
| 保护 #1101 | SearchService index.ts/retention.ts、goal-browser fixture等共享底座 | 仅完整文件metadata核交集，未checkout/执行候选。**保持保护**；本次用已采用E正常Todo/search，不开展Memory/restore、不拿候选覆盖E。保护PR未来采用如改变搜索授权再增量结算，当前不作永久全停前置。 |

24个PR中，未见对Todo `plugin.ts/search.ts/store*.ts/database.ts`、Placement服务/HTTP/客户端、global-search客户端、`todo-actions.test.ts`、`todo-placement.e2e.test.ts`、`system-search.test.ts`三完整文件的其它直接同路径变更；唯一Todo actions交集如上。T402是协调待实施范围，不能用“当前无PR”说无未来影响。其他广泛依赖（kernel/runtime/storage/contracts）不是这里宣称全树不变；本次证据严格绑定实际执行头和构建。

## 6. 根可直接派出的范围与环境

建议派 **一条完整场景7正常Todo链**（上面1～6，同一X），无新功能写入、无新入库测试，所有动作仅合成Home；可以先完成公开入口/受限网关准备，拿到唯一browser窗口后串行完成UI。若已有E匹配整体构建可复用，否则只在根排的build槽构建一次；不借其它HEAD的dist运行。构建/安装方式遵守现行隔离执行包装，独立系统HOME和MOLIS_WORK_HOME、file secret backend、`MOLIS_HELPER_SIGNING_IDENTITY=-`、专用 `MOLIS_WORK_TEST_CHROME=/Users/yijunwang/.local/bin/molis-test-browser`；不继承个人模型配置或Keychain。沿T122已经验证的隔离方式，不重跑T122试验来证明环境。

运行使用现有公共test-kit/浏览器夹具与生产动作；可在本目录留一次性QA驱动与响应记录，不改源码/测试夹具、不建立持久测试框架。如果复用goal-browser，禁止改其受保护文件；本次合成项目从公开管理入口创建，不调用它会替换项目库的seed路径。最终驱动与env在执行前由执行者依实际入口核对，当前仅计划、无driver/build/test已完成声明。

两个槽仍是 `node scripts/machine-slot.mjs run build --label ... -- ...` 与 `run browser --label ... -- ...`，所有测试/操作批在browser槽、jobs1/retries0；不本机Full、不同时build和本次测量。根随后独立核证，实际产物/用户验收/W6最终共同树另结。最终F相对E仅按实际变更补受影响动作，既有有效原件不机械重跑；T377失败恢复证据、T12223/23保持各自来源。

本次只写本目录PLAN及只读PR文件/窄patch快照；没有执行构建、测试、浏览器、模型，没有改源码、coord、GitHub、真实Home、refs或作者树。当前交付是可排执行计划，不是场景7已通过。

## 根执行裁定（2026-11-01 00:10Z）

本场景正常Todo/放置/搜索链无需等待T377或T116/T402，根已授权验证线3在E=b6f92222fce89dfba756a580768889292cfe9967自建隔离树实操。先核公开授权正控，再按同一个X完成A→个人→A、B对象Y不变；本人跨项目合法读取不能误算漏洞，受限client拒绝与来源健康分开。仅临时QA驱动、无业务源码/入库测试修改，owner连接只读。匹配整体构建已完成，连续UI链运行中，尚无场景通过结论。最终F仅按实际受影响差集核抵。

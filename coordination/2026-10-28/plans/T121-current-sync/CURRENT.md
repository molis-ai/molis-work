# T121 当前 main 同步与并行窗口补充

状态：有限只读准备完成，交回根；T121接续owner仍为开发线2。**不是重新实施、不是writer/资源授权，也不是T121整项完成。** 原PLAN/REVIEW及历史原件全部保留；本页仅覆盖过期基点/锁及本轮点名的真实交集。T065第一段已交回，未因此结束本线其它任务；T389/T065及原T121树保持冻结。

## 1. 基点与完整合同

- M=`08642dcb92dbdad029d990813da56682d6864a23`，本地origin/main同值；T384实际采用 `15ad4f397018241c8b31625aff8014b89259f239` 已包含其中。主检出旧main不作基点。
- 原 #1677 H=`c2502b62dc2af4cb090ce740f12d394646e7bdeb`，B=`c05698a13f1c0f17c4eb7578d42fd77467fc57fb`。根提供 `/private/tmp/root-open-0700.json` 为fresh22头快照：原20头不变，新1718/1719；#1677仍此H。没有本线GH/远端CI刷新或fetch；不把旧CI状态说成当前新组合结论。
- 原需求仍是#1332方案6540954628/裁定6540998211及原后续必修/修复/二审裁定；原PLAN的完整T121交付、验收、旧15文件/变异与full=true全部保留，不用此同步稿替换成几个测试的新小任务。
- 账户来源仍只在平台record-slot选账号；config不存connection_id、update@2拒该字段；add_account只github/gmail，稳定source_id，不复活已删除同名来源。本人/项目/安装从Host上下文推导，read@2/bind@2；已绑定选择禁用，换账号先断开、清游标/disabled并解绑，重选后明确恢复，delete释放绑定。原Runtime bound+connected及前后描述复核、S104安装pin拒绝都保留。
- BL-917/919/920、BL-921 read后bind非原子边界和旧fixture缺口不借同步修掉；无新OAuth、设备授权、并发原子化或FI产品设计。完整浏览器账号旅程/签包HOLD/历史UNKNOWN/Full边界保原出处。

## 2. 当前普通同步：没有新增源码冲突

只把新Git对象写到本目录 `current/objects`，以原对象库作alternate进行只读规划；未在原仓建ref/索引/工作树或commit。

- H原范围仍45路径。B→M与本单交集仍14路径；相比旧观察M8a46→当前M，原范围内新增delta为9路径（`current/inputs.json`），主要是已采用的index/文档、store新增清理导出、actions与资源变化。
- 精确H+M `merge-tree` exit1，仅五处冲突：CHANGELOG、BACKLOG、privileges、page-assets脚本、page-assets账本。**生产代码、测试与动作快照没有文本冲突。** 静态自动tree `6ec3f52bc7b926e566ab8ad0941c160ab4c24a92`含这些未解决标记，不是可构建候选或采用证据。
- 原14个关键账户/Feed/record-slot/Runtime/测试输入从B到M仍全部同blob，自动合成也全部保H（`current/critical-current.json`）。不泛称宿主全树、所有依赖或最终dist等价。
- connection-store三方自动合流保住main的T134 declarers/pin/事务与T121 `pluginBindings(connectionId?)`；当前main又新增BL-491 `forgetPluginBindings`及Host桥，保此独立清理导出。T143已由T384实际采用，旧“T143持有此文件”等待不再作为现行锁，但根仍需派具体写权。
- connector-plugin-requests保main的install_id pin拒绝和T121用途枚举；Feed ui保main已删processing的事实及本单账号区；connector-cli保main原型键拒绝与本单删旧inspect用例。动作两快照可自动合并，不等于最终生成一致性。
- **纠正旧PLAN的index描述**：实际T121 hunk是从connector-plugin-slot-actions新增导出 `connectorPluginSlotUsages`，不是index里删旧refresh/inspect导出。`connector-access.ts`中原inspectSourceAuthorization删除仍是本单已有增量，不把二者混淆。见 `current/T121-feed-index.diff`。

五处冲突仍按原完整合同收口：CHANGELOG保本单升级说明和M所有说明；BACKLOG保BL917/919/920及M现行行、不复活已完成行、不擅补旧H没有的BL921；privileges的PG045状态合入FI7b且保main的T120/PG046等有效状态；两资源文件依准确窗口处理，不能整张取旧H。当前账本冲突同时露出旧H两份CSS数值905103/1233257对M904914/1233068，必须沿M**完整48项**，不能只改单独workbench行却回盖CSS。原件 `current/merge-tree.log`、`conflict-blocks.json`、`automatic-production-delta.diff`。

## 3. T389：同文件的两段可并存，不回盖setter

T389/#1718冻结H=`13767116bd339558596e13ad6b36a3a3ed19f3cc`。

| 位置 | T121 | T389 | 合流约束 |
| --- | --- | --- | --- |
| navigation-feed-sources.ts文件头及约旧91～147行 | feedRecordSlotPath、loadFeedConnections、账号change和add_account submit | 不改 | 归T121来源管理hunk，保原完整FI语义 |
| 同文件原176～197行setFeedTask | B/H/M三者函数逐字相同 | 第三参数默认open，same-task restore才跳过关闭三项状态 | setter保T389；不整文件拷旧T121版本 |
| navigation-feed-stage/feed/documents-state | T121不改 | 沿现有open/restore透传 | 原样吸收真正已采用main；不手动导入未采用候选 |

H+T389静态合成的来源管理段逐字等于T121、setter逐字等于T389，来源文件无冲突标记（`current/T389-composition.json`）；其它文档/资源冲突依旧，不把该tree当已采用组合。T121新增保存账号/创建来源后的setFeedTask调用保默认open，属于原显式操作，不为“保持菜单”批量传restore。

**可并行准备的是不同hunk，不是两个writer可任意写整文件。** T389现已冻结，无需等其整个CI/Full才能由根派来源管理窄窗；后续普通merge实际main时保setter及其三条透传。若根让T121先完成，T389后采用也保同一合流，不重放旧文件。

## 4. T392：真实共享为两处源码/测试及根文档

根当前窗口将R-A4/T392交开发线4，M同上。其37移动/私有包/必要引用已在 `/private/tmp/t392-dev` 实施中，HEAD仍M；本轮捕获的未提交hunk只作定位，随时可能变化，不是完成头或可消费API。原152路径为审阅候选，不是全部改写许可。

与T12145路径的候选交集只有6处：index、CHANGELOG、BACKLOG、privileges、Feed/Inbox slice、connector-consumer-usages。其中直接源码/测试为下表两处（`current/window-intersections.json`、`T392-live-import-hunks.diff`）：

| 文件 | T121实际hunk | T392实际hunk | 短窗口 |
| --- | --- | --- | --- |
| apps/local-host/src/index.ts | connectorPluginSlotUsages的connector导出 | functions-host/http的export-from转到judgment-rules-host/http，符号不变 | 不同语句，根按冻结输入串行交这一个文件，不整文件选边；当前T392在写，不派T121双写 |
| tests/connector-consumer-usages.test.ts | 新增slot用途import，删旧Feed reporter路径，保RAC2669平台installation/per_record计数 | functionAuthoringActions的私有实现包import改到module-judgment-rules | 同imports簇有上下文邻接；后接者保T121新平台case和新私有import，运行最终完整文件 |

公开 `@molis-ai/molis-work-contracts/modules/functions` 的AGENT_MCP_DESTINATION_ID不改；不能把私有包迁移推广成公开合同改名。T121 Feed/Host账户业务路径不在R-A4移动集合里，无需重做FI逻辑或等待所有迁移测试才准备独立来源部分。

privileges中T121改PG045/046表状态，R-A4改PG010/034物理路径及后部PG045说明里的实现路径，是不同位置；Feed/Inbox slice是R-A4前部判断规则物理路径与本单§13账户语义，亦不同段。CHANGELOG/BACKLOG等由根按必要行串行，不整表覆盖。T392不持有T121全部源码。

后继以**真正采用main**普通merge处理路径，不能因T392工作树已有新目录就把未采用包名提前写入M上的T121。若T392先采用，T121测试转新私有import；若T121先采用，R-A4按其已采用平台case迁移。原子迁移的37路径/lock/registry仍归T392，不把其余源码工作搬给T121。

## 5. T141：attach / Home安装 / 设置DOM没有T121实现交集

根NEXT-WINDOWS已正式派开发线1按完整T141合同执行，不再沿旧“待T143/1701”描述。当前允许的15主路径及5条件只读路径与T12145范围交集均为**0**。

- IntegrationRegistry.attach队列体、完整assertFree预检、Home installPackage/confirm、settings-plugins.ts load/review与origins DOM、其新增source/lifecycle fixture，均不是T121写入路径。#1672 oauthOwner/import和T141 attach仍是不同方法，T121不动这两者。
- T121新账号控件在navigation-feed-sources/ui，record-slot HTTP/动作在平台槽位链；它不是插件安装/升级的settings-plugins DOM。T121只新建github/gmail账号来源，目录连接器来源还在BL917；没有必须先消费T141 Home source升级能力的技术依赖。
- T141依其原完整合同验证app/source/origins/补偿，不由T121复跑其Home升级矩阵；T121也不靠“无文件交集”宣称运行无影响。将来若采用的真实T141/SDK delta改变共同读取的声明、生命周期或schema，按实际差异重绑构建/相关既有完整文件，不预加OAuth/FI矩阵。
- 仅有6个根配套候选共享：local-host README、SI、privileges、BACKLOG及page-assets两文件。T121 SI为S71，T141为S80/S84及实际S95/S104分句；不同条款，根分别保留。README不同要求行，privileges不同结算行；预算等实测窗口。没有index/registry整文件新锁，更没有T141整单父依赖。

## 6. 可派发的并行边界与最终资源

| 工作 | 根可给的具体范围 | 不能借此做的事 |
| --- | --- | --- |
| T121独立部分 | 原完整范围内Feed来源/actions/runtime/ui/events、record-slot HTTP/slot-actions/用途及账户底座的必要合流；来源管理仅上表hunk，默认open保T389 | 只读准备未自动授writer；不改setter、不碰T392两活跃文件、不预导入T065/T066/T141候选 |
| 两文件短交接 | T392冻结/根分配后，index的connector导出与consumer-usages的T121段；据当时真正M选择旧/新私有import | 不为省冲突回盖整文件、不提前依赖未采用新包、不让两个writer并写 |
| 共享文档 | 根串行收本单CHANGELOG、BL行、PG045/046、SI S71、各slice和README原必要要求 | 不销BL921、不覆盖R-A4物理路径或T141安装条款 |
| 资源终态 | 根单独给最终M、允许tuple/账本路径；整体matching build后测真实48响应，再按标准工具冻结 | 不取旧1149871或算术加1483，不借任何兄弟许可，不以资源等待停全部源码准备 |

当前根已明确资源采用链 **T389→T386→T065**；T121最终资源窗尚未发，不再照旧T208/T362/T379快照推断全局锁。T392纯迁移预期零字节/合同变化仍须其实际工程证明；T141可能改变bundle，未实测不预签0。根决定本单最后的真正采用M；未采用候选和两份资源tuple不能混入。T065新同步H4accb7d已冻结，尚非main；它未来connector-access/connector-connections等同文件合流仍按原PLAN精确交接，不能以现在闲置或同一owner把它先合入T121。Full/CI、普通push/PR和采用仍由根。

## 7. 必要补验：增加接缝核对，不重演旧矩阵

当前四份相关README（local-host/workbench/feed/connector-host）“开发要求”从旧观察M到当前M逐字相同；不因本轮准备改合同，也不把相同README当免验。原完整T121/README适用要求、正常Runtime57+sources11、旧权限拒绝诊断、HTTP单点M首红/恢复及作者15文件/变异全部保原出处，不改署新头通过。

原PLAN五个完整文件仍是按最终输入/有效同树CI决定的最小增量候选：

1. security-invariants-plugin-record-slots：新HTTP/唯一安装/read-bind与持久状态；保串行409，不称原子。
2. connector-consumer-usages：pluginBindings接declarers；**若含T392迁移，最终完整文件必纳入组合验证或核抵相同输入有效原件**，旧私有包结果不能抵新import，保RAC2669业务断言。
3. security-invariants-connection-declarer：不得丢main安装pin拒绝，无请求的失败断言，不能只用内置Feed无pin成功例。
4. connector-cli：保main新增原型键拒绝和本单删旧inspect路径的现行完整文件。
5. feed-runtime-plugin：平台per_record绑定→真实Runtime拉取/断开/delete解绑；底座合流后核实际输入，不把五份合称OAuth全覆盖。

**必要的新组合验证仅在消费对应采用输入后触发：**

- T389已采用后，运行或窄核抵同组合的现有完整 `tests/feed-source-menu-refresh.e2e.test.ts`：同菜单被动restore及显式选择close。它覆盖共享setter，不新增生产hook/重开补偿，不重复造账户/OAuth概率矩阵。
- T392已采用后，以上consumer-usages完整文件已覆盖唯一共享业务测试的私有import迁移，不另复制一份；整体build/导入一致性须无旧dist遮漏。公开functions合同不变，actions/API差异只能来自本单已接受变更与真正已采用main。
- T141现有scope无新增T121专属必跑文件；沿其原owner有效Home升级/DOM证据，不复制其原矩阵。出现真实新共同输入或失败才由根点名既有受影响完整文件。

connection-store合流后的class/方法size与必要giant元数据按最终实测核对，若需更新只交根精确候选，不沿用旧H/M数字或改baseline放宽。最后在准确完成树整体build/本树dist/source指纹绑定、boundary、merge-base health、imports、actions快照生成核对、实际affected、48资源和完整page-assets-budget文件、fresh fetch后的逐提交secret按原合同与有效原件执行；不在本次只读准备执行，也不先签零资源/工程绿。所有后续测试含非浏览器门禁使用公共browser/test槽，build用公共build槽，jobs1/retries0、独立系统Home/file/adhoc与专用浏览器；不本机Full。原full=true、CI/Full未知和完整账号浏览器/真实服务/用户验收边界不变。

## 8. 本轮交付与保护

原PLAN/REVIEW/历史原件未改，新证据仅在 `current/`；CURRENT.md为本次唯一计划补充。Git查询和隔离objects规划无新ref/branch/worktree/index或源码写入、无GH/fetch/build/test/浏览器/模型/真实Home。T392/T141工作树只读快照只用来定位当前hunk，未修改或当完成头使用。原T121 Hc250、T065 H4acc、T389 H137的head/tree/dirty收尾回读与开工相同，均clean。未宣称T121 READY、重新实施、资源获准或整项完成；完成即交回等待根明确允许路径。

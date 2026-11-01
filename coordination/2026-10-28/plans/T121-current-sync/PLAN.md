# T121 / #1677 当前 main 同步最小计划

负责人：Codex开发线2（本轮只读准备）；原实现Claude设备A、原4独立验证与二审身份保留。状态：**计划已修订，尚未获唯一 writer、具体文件交接或资源窗口；不READY、不执行合并或测试。** T208已采用；T117后续执行owner仍为本线，前置未到。

## 快照和真实差集

- H=`c2502b62dc2af4cb090ce740f12d394646e7bdeb`，原分支`task/T121-ca`，PR OPEN/DIRTY；本轮remote和PR均一致。
- 本轮冻结观察M=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`；B=`c05698a13f1c0f17c4eb7578d42fd77467fc57fb`。
- 原范围45文件+522/-431；B→M与本单交集14路径。三参数只读merge-tree中真正含冲突标记仅5文件：CHANGELOG、BACKLOG、privileges.md、page-assets.mjs、page-assets.json。没有生产代码/测试/动作快照的文本冲突。
- 原树`.claude/worktrees/t112-ca-resume-19b2aa`在H且干净，本轮不写入/移动。未新建worktree、分支或候选提交；未fetch改refs，远端只读。
- 本轮查到旧分支CI：41189060585 completed/success；098/a232两次历史CI cancelled保留。不把普通CI当Full，未从这份分支查询定位准确T121 Full句柄或最终通过证据。

## 唯一需求和实际账户语义

原任务是#1332方案6540954628、裁定6540998211，后续必修裁6541544756、修复6541730078、二审/裁6541910390。它们已经是accepted任务书，不再新建产品spec。原裁明确full=true、无兼容期、目录连接器留BL-917。

Feed账号来源的config不再存connection_id，update@1删、@2拒该字段；add_account仅github/gmail，按project/service/name稳定source_id，同名存活行返回原来源，已删除同名拒绝。新来源active/enabled但未绑定仍不能拉取。身份和安装来自宿主上下文：页面只带plugin/slot/service/record，Host按项目查唯一安装，以本人动作身份调read@2/bind@2；store scope含安装、项目、record_key=source_id。

已绑定选择框禁用，Host串行POST改到另一连接回409，同一连接允许；disconnect清cursor、置disconnected/disabled并释放per_record绑定，重新选账号不自动恢复，toast提示再点恢复。source_id不变，去重键仍按来源，不切分账号历史；delete提交后释放绑定，已删除名称不能复活。这些是已接受语义，不能借main同步改为自动恢复/重建来源/换账号保游标。

账户state由平台shownState给出，未绑定与bound但disconnected/reauth_required有区别；Runtime按bound+connected授权，并在同步前后观察账号描述是否变化。页面按connected开放选项，但不会替人修复旧OAuth凭据。

旧HTTP守卫是read后bind的两步，**不原子**，其它bind@2入口也可改绑；BL-921继续开放。已绑定时非法输入先409的MISC、BL-917/919/920、测试旧config夹具、同来源去重语义继续保留，不顺手修。

## 真正变化的输入及安全合流

14个关键账户/页面/原测试路径在B→M完全未动（critical-inputs.json）：record HTTP、slot actions、navigation-feed-sources/events-primary、source-service/actions、runtime-connector/reconcile、plugin、feed-runtime/feed-sources/record-slots/usages/fixture等。不是宣称宿主整树等价。

主线实际改变两处账户底座：

1. T134的connection-store新增declarers表/属性、createToken/OAuth事务写pin和view.declared_by；T121只是把bindingInstallationIds替换为pluginBindings来报告用途，修改方法位置互不重叠，三方自动合并。保留main的新schema/事务/pin，保留T121的binding枚举，不能整文件取某边。安装归属、giant元数据和用途输出应在合流后检查。
2. connector-plugin-requests main新增install_id pin拒绝；T121把用途枚举调用改为pluginBindings。自动合并应同时保住两者。Feed内置github/gmail无signed-package pin，旧成功用例本身不证明新安装拒绝；不能为了成功删T134守卫。

其它生产交集：Feed ui.ts的main变更是已采用T336删除processing呈现，T121变更在账号设置/建来源区，两边保留；local-host/index保留新导出同时删本单旧refresh导出；connector-cli测试保留main新增原型键拒绝例，同时删本单死inspectSourceAuthorization用例。动作两快照自动合并不是最终一致性证明，合流后整体build再actions:update，审生成差异只含本单动作变更和已采用main。

五个冲突的具体解法：

- CHANGELOG保留T121升级须知与main T336/T138等新增条目，不能覆盖main升级说明。
- BACKLOG保留本单BL-917/919/920与main BL-912等现存行，不恢复main已完成删除行；BL-921虽已裁定，旧H未落表，不借此静默扩范围，按根对待办维护的决定处理。
- privileges PG-045同一行：main已完成T120 PG-046，T121完成FI7b，合成同时描述两项完成、保留其它Alchemist/Images余项；不整行拿旧H把T120倒退。FI稿其它段自动合并仍逐项读回。
- page-assets两文件按下节最终资源窗口处理，绝不能直接拿旧H的整张账本或旧tuple。

## 共享文件、独立源码与资源窗口分别交接

T121不是T065/T066的Git子分支：两当前头都不是H祖先。原裁 `6540998211.md` 只指出文档、CHANGELOG、page-assets等实际相撞处，并未规定T121必须消费T065/T066新合同；当前协调记录也没有另给全局实现父锁。T065 OAuth通用化与T066设备授权/旧凭据reauth是否采用，仍由根按各自任务裁定；本单不预导入未采用OAuth，也不把T066的父代码或历史Full算成本单证据。最终采用次序归根，不从Git父链或open PR交集推断。

实际共享文件按各文件owner交接：`apps/local-host/src/connector-access.ts` 的T121旧授权出口删除与T065通用OAuth底座改动须串行合成；T066在该文件继承T065，没有额外差分。`tests/connector-connections.test.ts` 中两方删除或修改的是不同用例，但imports和最终完整文件须同owner整理。`apps/local-host/src/index.ts`、安全不变量、CHANGELOG、BACKLOG及w511文档按现行目标树逐项保留两方有效增量，不拿旧整文件覆盖；BACKLOG按当时现行行处理。`horizontal/connector-host/src/connection-store.ts` 另有真实T143文件锁：T143候选已交不代表自动释放，根交接该文件后才合T121的`pluginBindings`，保留已采用的declarers/pin事务。T121的`connector-plugin-requests.ts`用途枚举也须保main的安装pin拒绝。共享文件owner等待只挡相应文件及依赖它的最终集成，不扩大成全部源码停工。

独立源码可先准备Feed source/actions/runtime/页面与record-slot HTTP合流：以根届时冻结的已采用M为基点，核update@2、唯一安装解析、解绑/断开/恢复、动作快照预期差异。根确认唯一writer和相关文件无占用后，这些部分可先实施，不等T065/T066整体采用；未采用OAuth不预导入。若共享文件/资源尚未集成，中间树仅作候选增量，不称可提交完成树，不跑最终门禁。根确认另有明确全局停工指令时，补出准确出处及适用阶段再调整。

资源写窗的当前次序是**T208已采用→T362执行→T379→T065→T121最终资源**；这是page-assets许可tuple、脚本、账本及准确产物冻结的顺序，不是T121全部实现的OAuth父依赖。T065旧接续候选df4d3f92、T066旧ebcd及T362/T379旧候选头只作本轮快照，执行时重新回读。T121旧许可workbench `[1148388,1149871]`（+1483B）基点已失效，先前观察M账本1150291且T377许可已消费；T208改变Images，T362/T379直接改变workbench，T065再减workbench，T066若届时采用也改变设置资源。**不能预填1150291+1483、也不能直接沿用1149871上限。**

旧共享路径快照依据open-prs.json：page-assets gate/ledger有T208/T362/T353B及本单在途；ledger另有T065/T066/T146，SI表有T143/T065/T066/T148等。已采用项应从最终M和当时在途头重新判定，不把旧open PR列表视为当前锁；资源全局最终写入窗口由根逐单发。T121本轮只准备，无权抢写；根给任何实施窗口时需回读准确头/main、在途paths与owner，冻结当次M。红线#1101/#1059仍仅观察，不改动。

## 获执行窗口后最小验证建议（当前未执行）

1. 根先确认唯一writer及允许文件，重新核原branch=H、旧CI全终态和当时已采用M；可先在隔离候选树准备Feed source/actions/runtime/页面与record-slot HTTP差分。实际同文件占用等待该文件owner交接，T143的connection-store锁保持；不预导入未采用的T065/T066。最终M及共享文件交接到位后再完成合流，按上面处理五处旧冲突和新增真实差异；出现实质新契约/产品范围才交根裁定，不把普通同文件合成扩成Functions任务。
2. 隔离系统HOME/CFFIXED/XDG/file/adhoc，offline frozen安装、公共build槽整体pnpm build绑定最终源树。build后的Host served全表实测，按当次M比较集合和每项；资源增长先交精确delta、必要理由与旧节省来源，获根核后仅写实际tuple、删确已消费许可，以原--update落账；最终matching build与完整page-assets-budget文件只做一次有效执行，不预抄171。
3. 最小动态增量候选是五个完整文件：record-slots（HTTP查安装接新store）、connector-consumer-usages（pluginBindings接declarers）、security-invariants-connection-declarer（保住T134安装隔离）、connector-cli（main新增拒绝例与本单删除旧路径的合成）、feed-runtime-plugin（真实平台连接→Runtime拉取/删除绑定链）。**仅按最终输入差异及同树有效CI决定实际增量**，已覆盖的不重复；执行用公共browser槽/jobs1/retries0。原feed-sources11和旧缺权限诊断/M红恢复原则沿用，不自动重跑整个15文件或另加矩阵。若T065/T066最终落地改变shownState/请求/夹具，先读实际delta及有效独立证据，再指出确实新增风险和最小整文件，不预定OAuth矩阵，也不把这五份说成OAuth完整验证。
4. 必要门禁：health --base最终M、boundary、actions快照核对（必要actions:update）、资源gate、affected、fresh fetch后secrets、scoped diff与源树绑定。full=true是原共享核心范围，不因同步只改资源而降为false；本机不Full，准确新头CI/Full由根安排，不控标签/CI/队列。
5. 当前H旧验证6542343143：匹配build、正常Runtime57+sources11=68、缺delete新增权限的拒绝/持久化诊断、串行HTTP改绑单点M首红1/2→恢复2/2，以及CI各整文件证据分源沿用。旧作者15文件/变异、二审6541910390与两个精确假token allowlist裁定不重复审批。新头有真实增量才补，不改署名/计数。

旧签名包安装HOLD、本机未验、共享OAuth实验、真实服务登录、完整浏览器账户旅程、用户验收与Full未知均保留。页面源码/HTML证明不升级成完整产品实操。

## 本轮原件/边界

analysis.json、head-scope.diff、merge-tree.txt、conflict-files.json、main-*diff、critical-inputs.json、pr.json/comments.json、两份原方案裁定、ci.json、open-prs.json、final-remote.txt。当前只写本目录计划和只读证据；无代码/资源/协调树/GH写入，无build/test/merge/push，未碰真实Home/4207/Keychain/日常Chrome。T208树冻结未动，T117前置未到仍WAIT。

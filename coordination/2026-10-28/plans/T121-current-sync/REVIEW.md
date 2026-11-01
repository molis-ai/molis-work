# T121 当前同步方案窄审

负责人：Codex 独立审查线。结论：**未发现账户语义或合流方向的 Blocker/P1；必须修书一处：撤掉无具体依据的 T065/T066“全局操作父锁”，把执行窗口分为实际共享文件、资源冻结与可独立推进部分。** 当前仅审方案，未授权实施；未写产品树/refs/GH/CI，未 build/test，未触真实 Home、4207、Keychain。

绑定：T121 H=`c2502b62dc2af4cb090ce740f12d394646e7bdeb`，M=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`，B=`c05698a13f1c0f17c4eb7578d42fd77467fc57fb`。只读复核 PLAN、analysis、原 accepted 裁定、三方差异、相应代码/测试、在途 PR 路径快照与当前本地协调记录。最终执行仍需根冻结当时 M/owner。

## 必须修书：不能用未指明的父锁停全部独立工作

原裁 `6540998211.md` 明确与 #1669/#1672/#1670 相撞的是文档、CHANGELOG、page-assets，后合方按实测重写；没有规定 T121 的实现必须消费 T065/T066 新合同。本地当前协调 `BOARD.md:351,354,365` 分别记录 **T066 等 T065**、T121 所在尾巴链原前置 **T064 已合**；没有给出 T121 等 T065/T066 全部采用的同等指令。README 的同文件 owner 规则仍有效，不能以 open PR 路径相交就自动生成全局前置，也不能因旧 writer 已空闲而自行解锁。

实际并非“只有资源相交”，但也不构成全局实现父依赖：

| 交集 | 实际行为/位置 | 应如何等待 |
| --- | --- | --- |
| `apps/local-host/src/connector-access.ts` | T121 删除独立的 `inspectSourceAuthorization`；T065 修改 imports 并从 **resolveApiConnection** 删除 Notion 专路、保通用 OAuth。T066 继承该文件，这两头此文件没有额外差分。Runtime 的平台请求最终仍调用 resolveApiConnection，所以未来 OAuth 采用会改变连接执行底座，但 T121 的 per_record 合同不依赖这个变更才能存在。 | 有真实共享文件 owner，须由根串行交接该文件；保留将来已采用的 OAuth 逻辑，不拿 T121 旧整文件覆盖。无需停 Feed 自己的来源/slot 接线。 |
| `tests/connector-connections.test.ts` | T121 删除“换账号建新来源”的过时测试及相应 imports；T065 删除旧 Notion专路测试，修改另一组 Gmail/Notion callback/secret/network fixture。不是同一业务用例；imports 有同文件合成需要。 | 归同文件 owner 串行，最终按两方实际用途整理 imports/保断言。不能把共享测试文件等同 T121 必须先采用整条 OAuth 链。 |
| `apps/local-host/src/index.ts`、SI、CHANGELOG、Backlog、w511 slice | T066 的导出变化及两单文档/安全条目与 T121 删除旧导出、增加本单说明同文件。 | 根按文件/目标行串行整合；Backlog按现行追加行例外各保自己的行。不是新的账户产品依赖。 |
| `scripts/gates/page-assets.mjs`、`tooling/gates/page-assets.json` | 实际全局资源写窗；T065下降、T066设置脚本和其他已采用变更影响最终 bundle/预算。 | 许可 tuple、账本更新、最终资源冻结必须等根的准确资源窗口与当时实测。不能用旧 +1483B 算术套新基点；不能为此把源码准备也全部停住。 |

修书时应把“操作上的父锁仍有效”和步骤1“root确认父片/资源次序后才开始所有工作”改为：**根确认唯一 writer 与允许文件后，可先做独立源码合流；实际被占用文件等待该文件交接，资源账本/许可等待资源窗口；最终采用次序仍归根。** 如根另有明确的 T121 全局停工/采用顺序指令，补准确出处与适用阶段；本次材料未找到，不能用推断代替。

当前可派的安全工作是基于已采用 M 准备 Feed source/actions/runtime/页面和 record-slot HTTP 合流，核 update@2、解绑/断开/恢复语义及公开动作快照的预期差异；在唯一 writer 授权和相应文件无占用后，可实施这些独立部分。未合 T065/T066 不预导入，不改其树。临时集成尚有资源冲突时，不把中间树称为可提交候选或跑“最终”门禁；完整构建/实测可按根分配的公共槽准备，最终冻结检查再绑定准确完成树。

另一个真实文件锁是 T143 与本单共同修改 `horizontal/connector-host/src/connection-store.ts`（另有 index/SI）。T143 已交干净候选不等于锁自动释放；由根给该文件交接后，保其实际采用增量再整合。PLAN 已列资源队列 T208→T362→T379→T065；该队列是资源写窗依据，不自动增加 T121 的 OAuth 实现前置。

## 已核合流事实：方向可保留

直接重算 B→H 与 B→M 的路径交集确为 **14**；读取保存的三参数 merge-tree 各冲突块，真正含标记仍为 **5**：CHANGELOG、BACKLOG、privileges、page-assets脚本、资源账本。其余“changed in both”不等于文本冲突。

T134 的 declarers 表、store.declarers、createToken/OAuth 与 pin 的事务写入和 view.declared_by，与 T121 的 `pluginBindings(connectionId?)` 不是互斥接口：后者从 connector_bindings 解析 installation/per_record scope，并替换旧 bindingInstallationIds；不负责重写连接创建/pin。`connector-plugin-requests.ts` 的 T121 增量只改 installationIdsWithBindings 枚举，主线的 request/describe/usableConnection 安装 pin 拒绝必须同时保留。不能整文件取一边。合成后的 giant/API/actions 仍按实际测量核，自动合并不替代这些检查。

Feed ui 的 T336 processing 呈现删除与 T121 账号配置区修改可并存；privileges 同行保 T120 已完成与 T121 FI7b；文档冲突按现行 main 保两方有效条目。原已接受 account 语义、BL921 read后bind非原子边界及其他留存缺口保持，本审不重开。

## 五完整文件的验证建议有实际对应，可保为候选而非强制重跑套餐

| 文件 | 本次可证明的变化输入 |
| --- | --- |
| `security-invariants-plugin-record-slots.test.ts` | 真实 HTTP 唯一安装解析、严格输入、read@2/bind@2、串行改绑409与持久绑定，接合流后的 store/Host。不是并发原子证明。 |
| `connector-consumer-usages.test.ts` | RAC2669 的 installation/per_record 用途枚举与项目计数，直接调用新 pluginBindings 路径；不是 declarer/pin 事务证明。 |
| `security-invariants-connection-declarer.test.ts` | 主线实际存在的 S104：另一安装的 request/slot/describe 拒绝且无请求，正好钉住同一 requests 文件中不得丢失的 pin 守卫。不要以 Feed 内置无 pin 的成功用例替它。 |
| `connector-cli.test.ts` | 同时保 main 原型键拒绝与 T121 删除旧授权检查出口后的现行完整文件。 |
| `feed-runtime-plugin.test.ts` | 平台连接→per_record授权→真实Runtime拉取/断开/删除绑定；底层 store/requests 改过，值得作为正常链候选。原57条仍保旧来源，是否新跑由最终输入及有效CI证据决定。 |

这五份覆盖本次已识别接缝，不需要另加矩阵；它们不能共同冒称已覆盖 T065/T066 后续所有 OAuth 行为，或完整浏览器账户旅程。最终 M 若已含新的 OAuth 输入，只读真实差异及原 owner 的有效证据后再决定受影响完整文件，不能预先把 OAuth 实验加成本单门槛。`connector-connection-declarers.test.ts` 的 pin事务用例与现存主线证据可按未变范围沿用，不因看到新表名就再加一轮。

原 sources11 的业务输入在当前 B→M未改，旧删除权限诊断与串行HTTP单点M首红/恢复仍按旧头沿用；不自动重跑15文件，不把旧M改署成新头，也不关闭BL921。PLAN 的完整文件/jobs1/retries0、已有同树有效CI先核抵和 full=true 均可保留。本轮没有执行这些用例。

修正上述锁/阶段表述后，此最小同步方案可交根派独立部分；本审未授予 writer/资源窗口。Full、推送、许可与最终采用仍由根控制。

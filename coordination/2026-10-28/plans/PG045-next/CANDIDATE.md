# 主线候选：PG-045 三类内置集成统一按当前连接取钥

状态：完整方案候选，WAIT T-066/T-065 落地与最终合同重核；可先审书，未实现、未测试。负责人：Codex 待分配。不占新任务号/RAC。

| 项 | 合同 |
| --- | --- |
| 档 | 甲；full=true，接触凭据/调用生命周期，准确头独立审验；Full由根排CI |
| 基点 | main `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` |
| 依据 | privileges PG-045、pg046-integrations-from-manifest §2.2 的现行T-120补充；T-120 #1670已合 |
| 前置 | T-066 #1672及其父片T-065 #1669落main；不提前消费父片尚在修订的OAuth合同 |
| 锁 | locks.json完整分页31PR/1144文件；四个Host适配器/清单文件无锁，connector-access被#1669/#1672/#1677占用，只读复用不改；GitHub provider写路径领取前重核 |
| 交付 | 三类真实内置集成以连接ID、调用control访问同一resolver，密钥仅留宿主，无各自按credential_ref取钥 |

## 1. 背景

T-120已删除按integration id选提供方的宿主分支，但 builtin-integrations.ts 仍给GitHub/Gmail传credential_ref、给Catalog传connectionId。github-connector直接读SecretStore；gmail-connector解析authRef及自行走OAuth刷新；catalog-connector已用resolveApiConnection。这就是现行PG-045明确留下、等T-066后并成一种取钥的主线缺口，不是另造连接服务。

## 2. 目标

GitHub、Gmail与Catalog三类内置来源，每次health/sync只通过本人实际绑定的当前连接、同一Home和本次control取凭据。token和OAuth都工作；绑定缺失/禁用/换账号/取消或撤权时拒绝读取，旧credential_ref不能继续提供账号。保留各提供方结果形状、scope/cursor及现有401策略。

## 3. 不做

不改OAuth授权/设备流、刷新并发算法、账号槽绑定UI（T-121）、文档导入（T-302）、Alchemist删除重做边界（BL-376）、沙箱包格式或新的services.connections合同。不删除整个PG-045行：FI-7b/T-121与其他待验项分别结算。不把集成清单写成provider id三选一。不新增读取旧OAuth形状的兼容。

## 4. 范围

书审修订：提交writer只改四个Host适配器/清单、`plugins/official-integrations/github/src/provider.ts`，其re-export所在`src/index.ts`仅同步确有变化的类型。测试允许路径固定为`tests/builtin-integration-providers.test.ts`、`tests/gmail-factory-boundaries.test.ts`、`tests/catalog-connectors.test.ts`、`tests/security-invariants-plugin-source-connector.test.ts`、`tests/feed-runtime-plugin.test.ts`；父片最终GitHub文件在领单冻结时逐项补名单，不以“同包调用点”无限扩范围。下文README与slice段落仅交根串行维护，不进writer独占路径。GitHub README被#1672占用，local-host README被#1677/#1101占用；四个Host工厂无锁不代表整书无锁，领取前对最终全部路径完整求交。

四个Host适配器/清单的完整路径是`apps/local-host/src/{builtin-integrations,github-connector,gmail-connector,catalog-connector}.ts`。不新增公共服务或另一个取钥模块。唯一需求书采用现行PG-045/pg046片，在行为修改前由根原位补本片验收；privileges状态候选同样交根串行采用。

`connector-access.ts`、OAuth实现、连接库/槽绑定及共享SI表不在writer范围。若实现证明resolver缺少必要合同，先交根解除对应锁和调整范围，不能绕开resolver另读secret。

## 5. 做法

适用入口限定为`homeIntegrationRegistry(home) → 内置source provider`。保留connector-access.ts:119的previewRead及:160附近连接检查：这些调用已经经resolver拿到token，再以`{token:access.token}`/`{accessToken:access.token}`注入connector，是可信Host注入，不是binding.credential_ref旧取钥兼容。fixture显式token/accessToken/fetch注入也保留；不把新home/id变成这些constructor调用的必填参数。若确需改预览链，先交根协调resolver锁并另定范围。

T-065/T-066落地后冻结health/sync结果表：无绑定、禁用、service不匹配、缺凭据、OAuth失败分别记现行ok/status/error期望；父取消/撤权单列reject。普通resolver拒绝保留现有关闭式结果；control拒绝必须继续抛，不能catch为needs_auth或fixture成功。

1. 前置落地后重新读三类factory和resolver，先冻结正常/401/无账号结果。生产factory接收Host确定的home和binding.connection_id，沿homeIntegrationRegistry的真实home传递，不用进程默认Home替代。binding.credential_ref不再决定取哪把钥匙。
2. 复用resolveApiConnection(home,id,control,service,forceRefresh)。提供方保留协议解析；宿主适配器持有明文并给本次请求授权，返回业务items/cursor中不含token或引用。GitHub现有同步resolveToken无法传control且不能await，改为本次health/sync await resolver；更新真实调用方，不另留第二条旧取钥路径。
3. Gmail的resolveUsableToken与fetchForCall复用同一账号resolver，不再按authRef自行拼OAuth路径。Catalog沿既有resolver路径收敛home/id传递，不搬CLI与authExtras语义。
4. resolver的拒绝不得被误吞后继续fixture/匿名网络。401刷新只沿前置最终合同、同一control，最多重试现有一次；无刷新材料保留原401/needs_auth，不制造新刷新规则。异步返回后检查control，取消/撤权不落业务或刷新失败记账，沿平台已存在beforeEffect规则。
5. 测试通过真实homeIntegrationRegistry.bind与生产connector触发，并另设两个临时Home/两个账号，验证不会因默认Home、旧ref或请求交错用错凭据。网络替身只记录请求/控制时序，不替代被测取钥实现。

## 6. 验收

“无业务写入”须经真实持久化入口证明：临时Host/项目/来源，经本人真实per_record槽绑定、Feed公开sync动作→PluginRuntime→createConnectorSourcePort.pull→生产registry/provider/resolver→Feed提交。不得向registry传provider override。用网络响应屏障暂停真实请求，分别经平台解绑/改绑入口改变连接记录，以及经Runtime现有授权入口撤销真实安装所需grant；释放后动作拒绝。不能用mock control手动抛错代替真实撤权。屏障前后经公开动作读取来源状态、Feed条目、Inbox、成果/捕获及失败记账，无新增或修改；先有未失权正控证明固定响应本来可产生这些业务结果，既有合法数据作基线，不要求整库0。

实现复用`security-invariants-plugin-source-connector.test.ts`的真实Host绑定/ABA路径与`feed-runtime-plugin.test.ts`的RAC-510提交正反控结构。前者手工state/control抛错部分仅证明局部控制；RSS撤权用例也不能替代本次connector取钥链。只有输入、生产入口与证据准确绑定相同才核抵已有结果，否则在上述允许文件内新增生产路径回归。单测registry.bind仅证明账号与请求，不拥有来源提交，不能据此签全链路零写入。

由根分配正式编号后写入测试名/注释：

1. 三类token连接均只使用各自当前绑定账号；旧/伪造credential_ref不改变读取目标，缺绑定不发请求。
2. 三类已支持OAuth路径经统一resolver工作；401按既有合同刷新/重试，失败或无refresh材料不额外派发；service不匹配、禁用或断开拒绝。
3. 同Home不同账号和不同Home并发真实交错无串钥；读取途中取消、撤权、换账号/关连接后晚到结果不提交业务，检查持久化和请求次数。
4. 最终源码不再有GitHub/Gmail适配器自行读SecretStore/authRef分支；输出与日志无凭据。旧健康/同步/cursor回归保持，临时Home全部清理。

## 7. 测试

先pnpm build（公共build槽），完整运行builtin-integration-providers、gmail-factory-boundaries、gmail-oauth、catalog-connectors及父片最终GitHub/OAuth回归；实际文件清单从最终affected-tests建议和包README核定，不抽case。隔离Home、file secret backend、受控网络；不连真实账号/Keychain。增加会因旧credential_ref取钥/默认Home取错而红的固定期望；有疑点时只对这两个生产切点做隔离故障确认，不能用test侧自增自证。起草证据全为静态，测试/build/HOLD全部待执行。Full=true由根在CI准确头排，不本机Full。

## 8. 与默认不同的

这是身份和凭据调用链调整，按甲档独立审验。API/动作形状不主动改；若provider公开签名变化，更新所有消费者及必要文档，不保留历史读兼容。适用S-12、S-18、S-57/S-69～71与OAuth共享刷新边界逐条映射现有拒绝测试；确需改SI表只交根串行，不能以书稿静态核对签安全通过。必跑boundary、merge-base health、test-import graph、secrets及准确头Verify。

## 9. PR 标题

`refactor(connectors): 内置集成统一按当前连接取钥（PG-045）`

## 10. 先读

现行pg046片§2.2、PG-045状态格、T-120与T-065/T-066最终合同；四个Host适配器、connector-access、三包provider及README；builtin-integration-providers与现有OAuth/生命周期拒绝测试；target-locks.json。

## 11. 停下来问

前置未合可审方案，不动实现。若统一resolver与既有provider错误/401语义冲突，提交具体对照由根定，不以统一为由改外部结果；若必须改被锁resolver、扩新权限或新公共服务，先收敛书与锁。账号串用/撤权后写入是必须修的失败，不能放宽断言或降为可选P2。

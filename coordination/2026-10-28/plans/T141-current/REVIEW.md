# T141 当前接续独立窄审（负责人：一审线2）

结论：**本轮解锁及接续方向成立，没有新的产品/工程方案必修；根可按下述最小窗口派给原 owner 开发线1。** T143/#1701等待已解除；#1672与T144不是必须先采用的技术依赖，但共享写入仍须根明确串行交接。本报告不派单、不释放锁、不签READY或运行通过。唯一工程合同仍为协调 `plans/T141/PLAN.md`、`FINAL-REVIEW.md`、`secret-control-design.md`；不重开原方案或矩阵。

## 基点与本轮输入

指定M=`08642dcb92dbdad029d990813da56682d6864a23`。只读Git核 `15ad4f397018241c8b31625aff8014b89259f239`（T384承载、#1712）和 `4b2f971a88a3143ae31d953b95f2749f4538692c`（#1701）均为M祖先。前置解除指实际采用，不是旧候选/CI或同名PR就绪。

从原717d14f2到M，在作者15必改/新增与5条件只读路径内，实际差分仅：

- Home registerPrompts生成registration，plugin source删除origin，登记与撤销使用真实install_id；T141不能恢复旧JSON promptScope。
- integration-registry测试增强RAC2447/RAC2787～2790：冲突零start/零contribution、旧service/source/owner不变、旧holder仍可bind。这些是已采用断言，不替换或降格为新升级成功用例。

已对intersections.json的22个列举头（20旧快照+当前PR1b/T390）逐个重算merge-base(M,H)及必改/条件路径交集，与作者记录一致；除#1672的registry外无源码/测试交集。当前PR1b d5a1ee55为46路径，T390 b7eee1b1为5路径，均无本单必改/条件交集。#1101的584文件完整对象差分没有T141必改/条件路径，保护状态不变。这里是冻结输入的核对，不是实时GH/占锁证明。

材料口径小注：`merge-base(M,H)..H`是相对main的分支差集，stacked #1680/#1683可能包含其在途父片，不应统一称为“该PR自身独有diff”。作者已经单列#1683继承差异、使用当前PR1b而非旧#1680作接续，本单窗口结论不受影响；后续状态摘要用“分支差集/当前候选”即可，无须重新全表扫描。

## #1672：oauthOwner与attach实际可分

H=`ebcd6536cfec7a457802d1d87c24d2c4a242fda0`，merge-base=`c95f6f305b9f428de41ea6433104d0d13528260f`。本线直接读Git diff，而非只引用作者1672-registry-only.diff：只有OAuthGrant type import、oauthOwner新增grant参数默认authorization_code、auth method按grant筛选。**没有改attach、队列或assertFree。**

M的attach仍在原tail任务内parse/live后对已attached分支直接set返回，不刷新声明；assertFree仍包含Host内置id占用、带数据OAuth拒绝及全部Declarations检查。原T141改法只在同一队列内完整预检后同步release/declare/set，三步无await，禁止先detach或只调Declarations.assertFree。#1672的OAuth选择不提供这个能力，也不被T141消费。

因此根可以冻结#1672上述精确hunk、将attach方法体及说明和现有integration-registry完整文件新增回归交T141。不必等整#1672采用；根选择正常merge先后顺序，保两方import/方法语义，不整文件选旧版本、不rebase。对方若后续需改attach或assertFree，重新由根串行交接，不能凭这份静态审查继续双写。

## T144：可直接裁定的最小串行窗口

已读T144原accepted允许范围及当前接续/审查材料；其测试简写已按tests/前缀归一化，共享测试确是security-invariants-plugin-install，不漏算为“只有三源码”。

| 窗口 | T141范围 | T144后续保留/接续 |
| --- | --- | --- |
| home-installed-plugins.ts | installPackage按真实record选择install/upgrade，保留当前expose和T143 register/forget接线 | T144完整AgentDefinitions登记、registerPrompts/forget在同一lifecycle context；不同函数仍需单writer交接。T141不提前实现正文登记，不回灌旧promptScope。 |
| plugin-install-service.ts | confirm去掉Home blanket refusal，保留身份/scope/版本/信任/占用全部前检；现有preview合同不扩 | T144 preview新增agent_bodies，可能带相关声明/导入；普通merge保留两方法变化，不让新preview替代T141确认再检查。 |
| settings-plugins.ts | load保存Home列表；review按runtime_scope找旧版本，显示service title/id/精确origins，保取消/确认/错误路径 | T144角色/方法正文预览与T141处于同一review渲染块，必须串行。根推荐先T141完整load/review，后T144按已采用结果添加正文；不能并写“不同功能”。 |
| security-invariants-plugin-install.test.ts | 增加Home升级与原拒绝/副作用断言，旧断言保留 | T144签名正文拒绝/预览断言不得覆盖。后写方按最终合并文件完整执行；不只跑自己case。 |

installed-plugin-lifecycle/version在T141仍是条件只读路径，却属于T144允许写范围；不能趁T141验证冻结输入时从旁改同树。若T141实际失败证明必须改，先交具体hunk给根，再调整相应窗口；不在当前书中预领写权限。T144若先采用，T141应重新核其实际register/forget/lifecycle和review输入，原合同本身不缩减。

T144还可改签包fixture/manifest parser等T141消费的输入，这属于**后续组合的读依赖**，不是扩大T141写集合的理由；若先采用，重绑匹配构建并按真实差集核原签包/安装/DOM完整文件，不import未采用API或照搬旧fixture。T144其余SDK/Assistant接缝是否可开仍由其原窗口裁定，本审不替T144放锁。

## 原完整交付与DOM范围未缩减

M的confirm仍拒已有Home包；Home installPackage仍拒已有record并仅install；registry已attached仍不刷新声明；settings current只存项目列表且review不画origins。preview已经提供runtime_scope和按service的title/id/origins，因此无需扩公开preview合同或新OAuth/document_import能力。缺口及原最小调用链均仍存在。

新稿明确沿用RAC2615～2619、full=true和完整app+source：同发布者compatible升级/同安装与数据保持、disabled/restart、新提示词及批准、真实runner失败和expose失败恢复、source声明/origins更新与实际pull、队列live及旧bound晚回执拒绝，身份/范围/版本等拒绝零副作用。不能把registry unit绿色替代实际Home旧live服务恢复，不能把绑定对象存在代替真实owner零业务写入。没有app-only拆单或删除原失败补偿要求。

RAC2619仍是实际Host设置页、真实签包File输入→公开preview→**可见**DOM逐项核service title/id/精确HTTPS origins→真实取消或确认→公开/Runtime/registry读回；初装与升级都覆盖，Home旧版本按runtime_scope匹配、项目预览对照保持，中英文/安全文本显示仍由原书约束。不得改成字符串模板快照、mock preview或隐藏HTML。取消不confirm、不pin/save/install，确认同preview一次性消费的原约束没有取消。

密钥控制层仍使用隔离child先registerHooks再dynamic import真实Host/签包fixture、同一built lifecycle URL/真实factory/context/返回值，不新增生产控制API或额外controller。provider登记“事件”仍指测试透传真实registerProvider并返回原disposer；先arm/挂拒绝观察、再释放inspect与settle的既有要求不变。加载/Node/tsx及补偿尚未运行，不能由本轮静态接线核对称已通过。原FINAL-REVIEW已解决的两项必修无需重审一遍。

## 根可直接落定的派发边界

1. 保留开发线1为owner，派发时核最终main与当前认领，将原15路径（含新browser、source/lifecycle两fixture）明确一并交T141；现有home-sandbox不改。无需重新命名/产品决定或让作者重写全书。
2. 明确#1672 attach窗口；T144上述三源码/一测试在T141写入期间不双写，按冻结头交接。推荐T141完成完整实现、根结配套/采用，再T144接review/登记；也可根选择反序，但都以已采用输入核实际差集，不将排序建议当技术依赖。
3. 根串行收S80/S84及实际S95/S104分句、slice §3/D1、必要README/giant实际尺寸/资源候选。保#1669/#1672 S95刷新复查与测试名变化、T144 S84/S105、T390 S103和保护S71等，不整段覆盖；不把资源/README同文件交集扩大成全产品WAIT。
4. 公共build与所有测试browser槽分开，临时系统Home/配置/缓存、file secrets、null模型、ad-hoc、专用浏览器/独立profile及正常/失败清理沿原工程书。原完整文件jobs1/retries0，无name-pattern，不本机Full；真实Darwin升级/DOM不能被Linux skip或Full绿替代。资源最终实测，新增或>10KB按规则交根，不预借其它任务额度。

当前没有需要退回作者重写设计的必修。**仍缺的是根明确的写窗口/正式派发，不是工程方案或新验收决定。** 本文只给可裁定边界，不称这些窗口已释放；没有产品实现、动态验证、CI/Full、实际采用或用户验收结论。

本轮仅只读材料/Git与写本REVIEW；无源码、refs、GH、协调共账、build、test、浏览器或真实Home操作。

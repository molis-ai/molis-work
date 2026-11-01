# T389 来源菜单受控探针独立书审

结论：**方向可采用；执行前须补清下面三项边界。** 一次390对照加一次真实刷新处理足以回答“当前输入的一次可发生交错是否丢失来源菜单状态”，无需扩H/M、1440、Full或旧CI现场矩阵。当前只有书审，没有执行或已证缺陷；实际已采用main由根在执行前绑定，本报告不以旧H/M或本地origin/main替代。

本线读了PLAN、STATIC-FOLLOWUP及现行T-389；核对准确旧H的refresh-decisions、initialization、navigation-feed-sources，并只读相关attention、UI/state恢复、compact renderer及已有网络闸门例子。旧H确有公共cursor差异→refresh→readUiState/applyUiState→setFeedPreset/setFeedTask的路径，且同task也会移除来源details.open；Feed前台可由自然attention读取触发body-owned刷新。这支持设计实验，不证明当前main一定相同，更不证明旧Linux失败走过此交错。

## 执行前必修

1. **补足“完整提交”判据，不能只用task结束。** PLAN第6步准确指出state节点先更新，但“随后MutationObserver/CDP读取已跨过同一task”还不能排除同步异常：旧refresh-decisions在写`#molis-work-data`之后调用applyUiState及其它恢复，任一处抛错会被catch捕获并`console.warn("Goal refresh failed", error)`；观察器仍会运行，cursor也已经更新。应从对照前到提交快照全程收有限、脱敏的相关console warning/error、Runtime异常与导航/销毁信号；在绑定main上确认marker之后到恢复收尾均为同步调用，核对适用于本probe的既有后置状态，并要求这段没有刷新失败/异常或中途退出。出现marker已变但恢复异常/后置状态不足，归为提交证据不足，不能据menu关闭签“正常刷新丢状态”，也不能据menu保持签成功。若main存在后置异步工作，按其既有完成合同取信号；没有可靠信号就停，不加生产hook、内部setter或任意rAF/sleep。cursor/project/新Goal id加同次menu/task/body快照是必要输入，不能单独承担整个完成判据。

2. **把闸门、关联及退出写成唯一确定流程。** 第3步的“其余按明确策略”、第4步的“例如30秒”需在执行稿固定。监听从对照前开启，按准确session、GET、origin、project路径、collection和无goal_id的根集合请求验证；在内存解析URL，不落完整查询串。只暂挂一次预期真实Response，保requestId及可用networkId/顺序关联；其它Fetch暂停立即原样继续，不得再挑下一份当首次。若控制窗口已有refresh、处理窗口出现另一份可能提交的refresh/fallback/导航/成员变化，标污染或前提失败、清理后停止，不重新arm。自然attention响应本project cursor→页面cursor读取→对应compact响应的顺序要有原件；纯时间相邻但无法确认来源时保留unknown。

   执行前固定公共写/派生cursor追平、等自然attention/响应、单次挂起、释放后提交、总实验及清理的上限；30秒自然链预算可以采用，但挂起时长须小于当前生产请求有效期并留出释放/提交余量，不能为了截图拖到超时后再释放。公开Goal写只一次，结果不明不重新POST；idempotency键不成为多次尝试许可。异步Fetch回调的continue/read错误必须进入本轮结果，不能丢成未处理promise。finally分别尽力处理仍挂request、disable和解绑，前一项失败不跳过后面；协议清理有界失败后用本fixture teardown收口，不无限等死。读取response body后原样继续能否在当前browser协议工作按PLAN所说先核；不支持则停，不能借前例改成fulfill或替换真实响应。

3. **固定菜单对象、无自动展开的add操作及结果分类。** 旧UI同时有菜单外的header add与菜单内rail add；执行稿应明确以当前唯一Feed root下`[data-feed-source-menu] [data-feed-source-rail] [data-feed-add-toggle]`定位，summary、menu、rail-add及dialog都保存测试侧引用。禁止把泛`[data-feed-add-toggle]`首项当rail-add。公共goal-browser的click会对隐藏rail/details调用summary.click自动reveal；因此对照和“提交后仍open”的add操作都须明确不走这个兜底：只对已经可见、身份仍匹配的rail-add发一次原生输入，若期间关闭/替换/失去可操作条件则记录，不自动重开或再点。临时probe可使用现有CDP原生输入，不改共享helper；测量原生输入所需点位与“不采点击坐标”的措辞要区分，前者允许，后者可明确为不额外导出旧CI坐标证据。可信summary/add/关闭或选择事件只记有限类型与引用，用来核实第7步的“无用户关闭/选择”，不读正文。

   释放前后用被动记录或同次快照关联当前menu，而非孤立旧node.open；提交后先保存证据再作后续点击。menu被替换时，只有新当前menu及根/任务/来源身份也明确才可判断状态丢失，否则不下结论。第35行三类结果还应容纳“可靠commit且menu仍open，但add失败”“刷新异常”“其它响应污染”等：这些均保留各自事实和失败，不算菜单丢失已证，也不算成功排除，不改口说公共链根本没建立。可以并入第三类‘无有效菜单缺陷结论’，无需增加执行分支或次数。

## 可以保留的设计与裁决范围

公开Goal创建提升cursor，Feed前台自然attention触发真实compact refresh，Response阶段仅延后交付、响应内容不变；在暂挂时由原生summary打开菜单，然后释放并检查既有DOM完成状态，这个控制干预合理。它刻意安排“网络已在途、用户开菜单、刷新提交”的交错，不是伪造业务状态，也不应因旧诊断禁止关键窗口插await而否定这次新目标。两者合同不同，根需按PLAN在同WO明确新输入、预算、允许的调度控制与验收后才执行；当前T-389仍只是旧有限诊断/静态授权。

同task=all、selected=null、无dirty输入、无额外业务写及成员变化可缩小干扰；原始response的project/cursor与页面新Goal id能把公开写和提交连起来。对照不需要第二个项目或等一个完整15秒周期，只须明确其实际观察区间且无刷新提交；它证明当次正常add通路，不测长期稳定性。无需内部setFeedTask/showFeedSetup埋点、无观测对照轮或重建通用追踪工具。

若以上前提和完整提交均成立，且同一用户打开的当前菜单从open变closed而没有其它关闭输入，可签“绑定main上，无关Goal刷新在此受控交错丢失Feed来源菜单状态”。这不等于chooser被关闭、不等于add可信click丢失，也不说明390专属或自然发生频率；尤其不能回填旧CI根因。若menu保持且一次无reveal的原生add成功，只签本输入该交错未显示缺陷。其余按实际缺口交根并停止，不追加第三次操作或产品/helper修法。

本线仅新增本REVIEW；未改PLAN、源码、coordination、refs/GH，未执行probe、build、测试或浏览器。

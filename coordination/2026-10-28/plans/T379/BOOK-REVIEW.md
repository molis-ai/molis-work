# T379 候选书独立审查

**结论：两生产文件及既定搜索语义方向可保留；下列两项必须修书后可派。** 无须扩大成其他iframe热键框架、修改Todo、另建快捷键注册中心或提出产品决定。仅审候选与必要源码，不签实现/动态验收。

输入为本目录PLAN、原shortcut定位报告、scene7最终REPORT及step041。源码固定E=`b6f92222fce89dfba756a580768889292cfe9967`，与本轮已存在的origin/main一致；未fetch、不改refs。主检出08c9933干净，未实施/build/test/浏览器/真实Home/coord/GH，仅写本报告。

## 必修1：RAC-2800/先红的消费状态判据须分修复前后

候选要求capture与“末端bubble”回执证明按键“未被消费”，随后修复后同例通过。但E的childNavigation在命中允许组合时本就执行 `key.preventDefault(); port.postMessage(...)`。修复把K/F加入名单后，正常成功桥接会使末端观察到defaultPrevented=true。若继续把末端false当成功前提，正确修复反而让测试失败；改成capture=false就足够也不成立，因为插件可在capture之后消费。

最小合同应改为：

- 原E先红：在完整真实按键回执中，记录可信键、焦点、非终端、非组合/重复，以及桥执行前未被插件消费；等待外壳dialog.open/inputFocused失败才是预期产品红。若现有只读观察只能取得末端bubble，E的K/F未命中桥时末端false可支持本次未消费；如变true须查明来源，不能硬算同类红。
- 修复后正例：保留真实输入回执，以同一外壳dialog.open及inputFocused为独立成功oracle。桥接后的末端defaultPrevented=true是正常结果，不要求其为false，也不拿这个值推断“插件已消费”。K再次按下的开关、F已开时聚焦行为沿原处理器，草稿/页面状态按原要求不变。
- 已消费负例：局部fixture在生产bridge执行之前明确消费本次真实按键，再断言外壳搜索不开；其消费发生的顺序/监听位置必须可知。它与“生产桥正常preventDefault”分开。不要靠对成功事件最终defaultPrevented的单值判断消费主人。
- 保持现有bubble桥及原factory先装、childNavigation后装的顺序；不要为方便观察把生产bridge改capture。纯观察器不调用preventDefault/stopPropagation、不手动调用搜索open/handler，不构造成功keydown替代原生输入。无需为此新增生产观测接口。

step041目前只有isTrusted/key/code/modifier/notes和searchOpen=false，没有defaultPrevented/composing/repeat或末端bubble。候选对该历史边界的描述正确，保留即可，不补造字段，也不追改原scene7报告。

## 必修2：排期、资源锁与被测树冻结须拆开

候选“本机build/browser窗口排在T208、T362之后”以及“不得在别人的Full期间改源码/skills”会额外制造跨任务、跨树全局等待，超出本单所需约束。

最小替换建议：

> 资源账本/一次性许可的写入窗口按根安排，等待T208/T362等相关资源owner交接；这不自动阻塞本单隔离树上的已授权源码实施、build或定向browser验证。build/browser各遵守整机公共槽与根当次运行安排，不抢槽、不在私有TMPDIR另造锁。Full期间只冻结该次被测树的源码、脚本、package及skills输入；远端其他PR或其他独立树的Full不阻止本单隔离树编辑。本单不在本机跑Full，所需CI Full仍由根安排。

如根另有明确的机器运行时段，按那次派单执行，不能从资源许可窗口推导出一项新的整机禁构建/禁定向测试规则。不要因另一个PR正在远端Full而暂停这棵隔离树；也不能修改本单正在测试的树来满足源码进度。其余原测试期间冻结输入要求保留。

## 已核可保留的方案与边界（非新增必修）

- **来源helper可用但不含可见性。** `scripts/client/pane-messages.ts` 的SIDE_FRAME_FROM_SCRIPT只接受本origin、data.type为字符串、实际event.source匹配 `#side-panel iframe[data-side-frame]` 的contentWindow。查询当前DOM可排除已卸载frame，但不自动证明panel打开、body当前、非hidden/inert或有布局。SIDE_PANEL_SCRIPT内部已有open/current及body状态，按候选补核它们即可，不另造source registry。真实来源应从event取，不能信payload的plugin/visible字段。
- **主区/嵌套落点成立。** pageNavigation当前从可信owner的data-side-keys取名单，MessagePort两端用同份shortcuts，scope.visible检查后主区合成shell keydown；嵌套owner向parent发molis:side-key。K/F缺名单，侧栏接收仅keyed，所以只加名单不能闭合嵌套。用真实shell已有搜索承载（例如现有data-global-search-dialog）决定提供K/F，避免独立无搜索页吞键；收到值仍须有限名单/形状校验。
- **复用现行搜索语义。** initialization过滤defaultPrevented/composing后进globalSearchPalette.handleKeyboard；global-search已有K toggle、F open/focus和 `[data-tui-pane],.xterm` 排除。终端排除必须在child原目标处执行，因为relay后的合成外壳事件目标不再是原终端。保留textarea/contenteditable的普通编辑入口；不新增终端专线或终端命令。合成repeat/composing状态测试只能证明局部抑制，不替代原生正例。
- **Issue/discussion不能被helper误伤。** 原ISSUE-35确有其它side frame、自身composer、discussion iframe召回/收起。discussion不带data-side-frame，SIDE_FRAME_FROM_SCRIPT不会接受它；因此该helper用于插件搜索来源检查时，不能不加区分地套到所有旧molis:side-key并删掉discussion行为。可用已存在discussion frame.contentWindow身份维持声明工具键分支，按原有限名单处理；不向discussion增加K/F或放宽成任意同源window。一次键只走一个分支，保留原Issue声明键，不转成搜索。
- **运行器语法正确。** E的run-tests.mjs对`--retries`调用whole(...,0)，支持`--retries 0`；候选jobs1/retries0例子无需改。没有为核语法实际运行命令。Workbench README的现行必跑清单及根的full=true/SI结算继续按冻结实施头读，不把两浏览器文件冒成全部包要求。
- **资源名称正确。** E的web-assets.ts:66–69实际服务 `/assets/molis-work-plugin-frame.js` 和 `/assets/molis-work-workbench.js`，:89再tightenServedJs；page-assets.ts的workbench客户端包含SIDE_PANEL_SCRIPT，arrival/shell另有inline消费。候选实际served全表测量与不挪inline躲预算的要求正确；不改名成不存在的frame资源。package.json确有workspace:build、workspace:verify和page-assets:check。指定非默认基点时用现有脚本的`--base <冻结ref>`明确传入，不把默认origin/main自行前进后的结果误绑旧B。
- 来源安全边界若实际变化，S-30最小声明/拒绝断言按根释放范围处理；不借本审查默认解锁parent/types/initialization或公共test-kit。当前无需新增公开消息合同、CI/quarantine或更宽key协议。

## 派发与交付

将上述两必修并回同一PLAN的RAC-2800/先红说明及排期段即可；无须另开方案。writer DEV4、独立验证VERIFY3、本线二审保持独立。实施前根冻结B与文件锁，结果仍按H/tree/build、真实原生输入与最终产物UI复验、原scene7主链/W6验收分别结算。本审查不签RAC-2800～2803已通过，不签RAC-11或W6完成。

— Codex，T379独立只读审书，2026-10-31（Sol）

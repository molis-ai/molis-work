# Pages 同步弹层表单下一片计划

负责人：root；实施待分配。只读计划，2026-10-18。核对 P=`wt-pages-commands` HEAD `ee745e452`，工作树干净；PPV 已由 root 正式验收，入口719行、mount451行、正式 bundle706928 B为 root 给定基线。本次未改 P、源码/spec/快照，未构建、未启动 Chrome。前面剪贴板/键盘/工具/预览均已完成，不重新规划。

## 最小完整边界

下一片只提取**同步弹层表单的 DOM 构造与事件行为**：块备注、文字/背景色、链接及现已有的 callout 样式填充。新内部 `editor-pop-forms.ts` 放具名短函数；mount 保留“选目标→reclaim/show→冻结→填表→定位→焦点”的装配。现 comment 已有独立 owner，复用不重写。

`popToken/popRequest/docked/hidePop`、clear/show/anchor/place/reclaim、AI请求与候选、Escape、release 全部原地留在 mount，同一状态仍唯一 owner。没有新 Controller、getView、getter、epoch、registry、可变 currentView 或统一 form 框架。不是把451行闭包搬进另一个工厂。预计 mount 减约100–125行、入口再减现 fillCalloutStyle 约50行；以真实 diff/门禁实测为准，不把降到某个数字当唯一目标。本片不声称 mount 已完成全部拆分。

## 当前生命周期与必须保留时序

1. mount：清 host→创建 previews/tool definitions→append previews→创建并append唯一 pop→定义闭包→构建 EditorView。表单回调之后取得实际传入的固定 view，不需要解决“构造前还没有view”的新状态问题。
2. showPop 先调用当前 hidePop。旧 clearPop 依次：记原 activeElement 是否在pop→hidden→清DOM→popRequest++→释放popToken并置null→退出docked（非panel来源时通知openPanel(null)）→归还overlayRoot→若原焦点在pop则view.focus。releasePagesFrozen 会 dispatch，不能重排清DOM/退出panel/预览更新时序。
3. showPop 再用 ownPagesTransient 注册本次clear，重绑定 hidePop，最后显示。hidePop 包装的 stop 幂等；本次关闭来源 fromPanel 控制是否反向通知panel。不能将其替换成每次无条件clear。
4. anchorPop 生成唯一token，freezePagesFocus(...,true)，返回已有映射锚点回调：只在 token仍为popToken且view未销毁时resolve。表单持有这个回调，不持有一份可写selection。
5. placePop尝试openPanel，onClose晚调用当前hidePop(true)，以返回值决定docked；未dock才placeOverlay。reclaimPop仅在原已dock时退出panel、移类、归还stage；块备注/callout先reclaim后show，链接/色彩不reclaim。
6. AI runCommand：read范围/wholeDoc/localId→showPop→冻结token或translate_new无token→request++→显示等待→preset时placePop(keep=true)→prepare await后比request→runAi await后比request→候选。异常先释放该token，再比request决定是否画错误。候选采用 proofread/actions/普通映射/translate_new各自原规则；本片不移动、不整理这些分支。
7. Escape捕获监听：非composing且pop可关闭才preventDefault/stopPropagation→hidePop→view.focus。setDoc先endPagesTransients再updateState；destroy先endPagesTransients，再release（stopPreviews→hidePop→移除Escape监听→移除pop→移除previews），最后view.destroy。新模块不注册全局监听，不承担清理。

## 各表单的读取与提交合同

| 表单 | 打开时与事件时的事实 | 成功/取消/焦点顺序 |
|---|---|---|
| 块备注 | 打开时从view.state.doc.child(index)取原node/note并算pos；先reclaim→show→anchor。保存点击时先调用冻结at，必须intact；读当前textarea.value.trim()与当前view.state.doc.nodeAt(mapped.from).attrs，不能使用打开时旧attrs覆盖后续修改 | dispatch setNodeMarkup→调用当前hidePop；取消使用构表时传给actions的hidePop；原定位在coordsAtPos(pos+1)上方，之后area.focus，不改成selection坐标 |
| 文字/背景色 | show后按font_color→highlight顺序。每组打开时toneAt(view.state,kind)决定按钮is-on；点击时closest按钮、读当前dataset并对当前view执行runBlockCommand(setTone)。现色彩不冻结token，不新增冻结策略 | mousedown preventDefault保持选区；click preventDefault→当前选择执行→当前hidePop。整组填完后才placePop当前selection.from下方；不新增focus |
| 链接 | 打开前linkAt，无目标直接return；show→anchor(found.from,to)，初值found.href。commit时先at.intact，再读当前field值/校验safePagesHref；有效时对mapped范围setLink。remove同样重读at；不重新用当前selection挑另一个链接 | 无效：写error/role/aria-invalid→field.focus且不关闭；有效：runBlockCommand→当前hidePop。keydown只对Enter且非composing提交。取消用构表时hidePop。found.href存在才加移除按钮。填完placePop原found.from下方→field.focus→field.select |
| callout | 入口先nodeAt(pos)，无node return；reclaim→show→anchor；现fillCalloutStyle读取打开时node的icon/tone绘制。点击时at.intact，再setCalloutStyle(mapped.from,单一属性)，不能复制旧node全部attrs | 原mousedown/click preventDefault保持；runBlockCommand→传入的hidePop。原helper末尾placeOverlay(anchor.getBoundingClientRect(),below)，保持，不挪到统一定位流程 |

**不要把两类 hide 回调混成一个。** 当前 note/link 保存与tone点击的闭包晚读mount变量hidePop，而 actions取消参数在构表时就捕获函数值；fillCalloutStyle本来接收捕获值。提取时保留这一区别：保存/点击传 `() => hidePop()`，取消传当时 `hidePop`；callout继续原签名。它们是原事件行为的传递，不是新增状态getter。尤其不要为统一接口改变旧DOM事件在表单替换之后能调用哪份关闭函数。

translate/options仍按打开动作时读取；不在mount初始化时缓存所有文案。色彩两组中文标题、默认按钮、PAGES_TONES顺序照旧；链接aria/placeholder/error提示/移除按钮和note.placeholder原时点不变。options.openPanel/onCreateFromAi等不交给表单模块。原 view 固定引用的state在事件触发时读取，DOM输入从原节点读取，不在渲染时冻结值。

## 内部接口形状

建议以下具名函数，确切命名可由writer选择；不从editor-browser公共出口导出：

```ts
// FrozenAt就是现anchorPop返回类型；不新增状态，只复用该已有映射回调。
fillNoteForm(pop, view, at, note, translate, closeCurrent, cancel): HTMLTextAreaElement
fillToneForm(pop, view, translate, closeCurrent): void
fillLinkForm(pop, view, at, href, translate, closeCurrent, cancel): HTMLInputElement
fillCalloutStyle(pop, view, at, node, anchor, translate, hidePop): void // 现函数搬至职责owner
```

note/link返回已建输入节点，仅供入口在原定位之后focus/select；不是返回控制器。actions/t/PAGES_TONES/setLink/setTone等直接从既有内部模块import，不把它们都改成callback ports。at沿现resolvePagesFrozen返回类型，不再造一个owner或读view的getter。note/link的保存回调应留在各fill函数中，否则只搬DOM字符串、事件仍塞mount，职责不完整。

mount四个open函数保留少量装配行，传当前view与既有at；该安排允许现openComment完全不动。已有fillCalloutStyle的约50行是本职责自然归属，搬迁不为抵消别的资源增长，也不改callout算法/样式。模块估计180–240行、每个函数明显小于150行，无需再拆更多文件。

## 允许文件与排除范围

- `plugins/native/pages/src/editor-browser.ts`：四个同步表单接线与相关imports；pop/AI生命周期正文、公共27出口、插件数组不变。
- 新 `plugins/native/pages/src/editor-pop-forms.ts`：上述表单DOM和监听；已有fillCalloutStyle原样归入。
- Pages README：补内部责任与定向验证位置。
- `tests/pages-plugin.test.ts`：仅迁随真实owner变化的源码定位断言；onPopEscape add/remove两条仍在入口，不能错误迁走。先搜索具体被影响断言再改，不增“import存在即通过”。
- 一个最小真实浏览器文件 `tests/pages-pop-forms.e2e.test.ts`（建议名）；不复制完整Pages fixture平台。root维护唯一spec、分类/快查/API/资源等派生文件。

不改editor-transient/focus/editor-comments/editor-previews及共享floating实现，不改AI/Prologue调用，不引入新依赖，不改Host/client/schema/保存协议/CSS/压缩器/门禁。任何真正发现的行为bug单列，不以重构名义顺手修复。

## 编号候选与最小正式浏览器基线

建议根确认未占用后用 `W5-10-PPF-01/02/03`，本报告不自行登记为accepted。

- **PPF-01 结构与语义**：四表单完整归属；唯一pop状态仍在mount；27公共出口不变；初始化/提交/清理顺序逐项对照；没有新Controller/getView/epoch/registry，mount与入口实测减少。数值目标不是功能验收替代。
- **PPF-02 同步表单真实操作**：用正式bundle/CSS和公开mount/runTool，Chrome实际DOM事件。链接编辑含无效URL保留表单/焦点、有效Enter、composing Enter不提交、移除及取消；冻结后在范围前插字仍改原映射链接，旧范围被改则不写。色彩通过真实mousedown/click验证选区保留、当前选择生效、默认色清除，doc/marks与undo可核。块备注通过实际hover handle菜单打开，保存只改原块note、保留当前其他attrs，取消零写；callout复用现生产用例。
- **PPF-03 生命周期保持**：打开同步form→Escape关闭/冻结释放/焦点恢复；从docked等待AI转到块表单，原panel归还顺序保持、旧prepare/模型结果不替换新form；setDoc/destroy后旧form不写新doc，重挂新控件工作。先复用现有证据，仅对缺口新增最小动线。

实施前先在 `ee745e452` 正式资源上跑相同的新PPF-02与缺失的PPF-03断言建立基线，不能在改后才按新行为编期望。可借 `pages-previews.e2e.test.ts` 的正式script/CSS加载与公开mount方式，不import新内部模块；DOM按钮事件证明真实接线，不能直接调用fill函数替代。程序性doc/selection夹具用于布置，提交/取消/Escape用真实DOM/CDP路径。model/prepare可用公开options的deferred确定等待，不建立另一Host/AI服务模拟层。

复用已存在用例：

- `content-editing-regressions.e2e.test.ts`：COMMENT-01、CALLOUT-01、TRANSIENT-01（冻结映射、旧表单不写B及销毁）；comment owner本片不变，无需重写同组测试。
- `context-toolbar-panes.e2e.test.ts`：真实工作台panel停靠/关闭及窄屏等现行为，重点保留它的is-docked真实断言。
- `contextual-interaction.e2e.test.ts`：准备输入、候选等待后冻结文本被修改时拒绝采用、离开文档panel关闭；不另做proofread/actions/translate_new矩阵，因为这些分支源码未改。
- `pages-previews.e2e.test.ts`：编辑按钮进入链接/评论表单、blur焦点与释放；沿用PPV已建立正式测试。
- `pages-tools.e2e.test.ts`、`pages-keyboard.e2e.test.ts`：runTool/link快捷键接线按实际受影响选择，最终清单由root结合README排一次，不机械重复所有历史批次。

若既有用例没有“AI等待→打开块表单→旧结果晚到”断言，只补这一条公开mount+runCommand的deferred动线，并在旧正式bundle先通过；不要声称现候选拒绝测试已覆盖所有popRequest时序。

## 资源风险与交付顺序

706928 B是已验收PPV基线；用户那次+103 B已体现在该结果，不能再作为本片可用额度，不占其他插件额度。本提取增加函数调用/返回值/两个关闭回调，未测量，不能保证零增长。保持语义的短调用与直接imports优先，不为体积拼新getter、共享state壳或改变focus/冻结策略；更不能动压缩器、涨budget或改不相关代码抵扣。

根先纳入唯一spec、释放writer与正式Chrome基线时段。实现后按项目规定整体build，再跑Pages要求与上述相关用例；类型/静态、公开出口、diff顺序、无循环依赖和正式资源实测由root裁决。若实测增长先提交具体差值与不改变行为的候选，不假装借用已消费授权。此片完成后再根据剩余mount决定是否把pop/AI整体状态owner迁出；本片不预造那个未来接口。
